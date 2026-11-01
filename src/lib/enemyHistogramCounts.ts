import type { EnemyRecord } from '../types/enemy.ts'
import type { HistogramCumulativeDisplay } from './histogramCumulative.ts'
import type { WeightedHistogramObservation } from './enemyWeightedHistogram.ts'
import type { NumericStatistics, NumericStatisticsWithDispersion } from './enemyStatistics.ts'
import { createChartImageFilename } from './chartImageFilename.ts'

export type EnemyHistogramCountMode = 'TYPES' | 'MAPS' | 'SPAWNS'
export const ENEMY_HISTOGRAM_COUNT_MODES = [
  { key: 'TYPES', label: '種類数', axisLabel: '種類数', unit: '種類' },
  { key: 'MAPS', label: '登場マップ数', axisLabel: '登場マップ数（延べ）', unit: '件' },
  { key: 'SPAWNS', label: '出現回数', axisLabel: '出現回数', unit: '体' },
] as const

export interface EnemyHistogramCounts {
  schemaVersion: 1
  spawnAggregationMode?: 'lower-bound' | 'expected-lower-bound'
  generatedAt: string
  sourceGeneratedAt: string | null
  summary: {
    mapCount: number
    missingMapCount: number
    excludedMapCount?: number
    spawnMapCount: number
    spawnExcludedMapCount: number
    lowerBoundMapCount?: number
    expectedMapCount?: number
  }
  enemies: Record<string, { mapCount: number; spawnCount: number }>
  diagnostics?: {
    lowerBoundLevels: { levelId: string; spawnCount: number; reasons: string[] }[]
    expectedLevels?: { levelId: string; spawnCount: number; reasons: string[] }[]
    aggregationConditions?: { levelId: string; conditions: string[] }[]
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isExpectedCount = (value: unknown): value is number => typeof value === 'number'
  && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER

export function parseEnemyHistogramCounts(source: unknown): EnemyHistogramCounts {
  const root = record(source)
  const summary = record(root?.summary)
  const enemies = record(root?.enemies)
  const lowerBoundLevels = record(root?.diagnostics)?.lowerBoundLevels
  const rawConditions = record(root?.diagnostics)?.aggregationConditions
  const expectedMode = root?.spawnAggregationMode === 'expected-lower-bound'
  const partialMode = expectedMode || root?.spawnAggregationMode === 'lower-bound'
  const rawExpected = record(root?.diagnostics)?.expectedLevels
  if (root?.schemaVersion !== 1 || !summary || !enemies
    || !['mapCount', 'missingMapCount', 'spawnMapCount', 'spawnExcludedMapCount'].every((key) => isCount(summary[key]))
    || (summary.excludedMapCount !== undefined && !isCount(summary.excludedMapCount))
    || (root.spawnAggregationMode !== undefined && !partialMode)
    || (partialMode
      ? !isCount(summary.lowerBoundMapCount) || summary.lowerBoundMapCount > Number(summary.spawnMapCount)
        || !Array.isArray(lowerBoundLevels) || lowerBoundLevels.length !== summary.lowerBoundMapCount
      : summary.lowerBoundMapCount !== undefined || lowerBoundLevels !== undefined)
    || (expectedMode
      ? !isCount(summary.expectedMapCount) || !Array.isArray(rawExpected) || rawExpected.length !== summary.expectedMapCount
        || Number(summary.expectedMapCount) + Number(summary.lowerBoundMapCount) > Number(summary.spawnMapCount)
      : summary.expectedMapCount !== undefined || rawExpected !== undefined)
    || Number(summary.spawnMapCount) + Number(summary.spawnExcludedMapCount) !== summary.mapCount) {
    throw new Error('登場データの形式を確認できませんでした。')
  }
  const seenLevels = new Set<string>()
  const expectedLevels: NonNullable<EnemyHistogramCounts['diagnostics']>['expectedLevels'] = []
  for (const raw of (rawExpected as unknown[] | undefined) ?? []) {
    const level = record(raw)
    if (!level || typeof level.levelId !== 'string' || !level.levelId.trim() || seenLevels.has(level.levelId)
      || !isExpectedCount(level.spawnCount) || level.spawnCount === 0 || !Array.isArray(level.reasons) || !level.reasons.length
      || level.reasons.some(reason => typeof reason !== 'string' || !reason.trim())
      || new Set(level.reasons).size !== level.reasons.length) {
      throw new Error('登場データの期待値集計に不正な値があります。')
    }
    seenLevels.add(level.levelId)
    expectedLevels.push({ levelId: level.levelId, spawnCount: level.spawnCount, reasons: [...level.reasons] as string[] })
  }
  const lowerBounds: NonNullable<EnemyHistogramCounts['diagnostics']>['lowerBoundLevels'] = []
  for (const raw of (lowerBoundLevels as unknown[] | undefined) ?? []) {
    const level = record(raw)
    if (!level || typeof level.levelId !== 'string' || !level.levelId.trim() || seenLevels.has(level.levelId)
      || !isCount(level.spawnCount) || level.spawnCount === 0 || !Array.isArray(level.reasons) || level.reasons.length === 0
      || level.reasons.some(reason => typeof reason !== 'string' || !reason.trim())
      || new Set(level.reasons).size !== level.reasons.length) {
      throw new Error('登場データの下限集計に不正な値があります。')
    }
    seenLevels.add(level.levelId)
    lowerBounds.push({ levelId: level.levelId, spawnCount: level.spawnCount, reasons: [...level.reasons] as string[] })
  }
  const aggregationConditions: { levelId: string; conditions: string[] }[] = []
  const seenConditionalLevels = new Set<string>()
  if (rawConditions !== undefined && !Array.isArray(rawConditions)) {
    throw new Error('登場データの集計条件に不正な値があります。')
  }
  for (const raw of (rawConditions as unknown[] | undefined) ?? []) {
    const level = record(raw)
    if (!level || typeof level.levelId !== 'string' || !level.levelId.trim() || seenConditionalLevels.has(level.levelId)
      || !Array.isArray(level.conditions) || !level.conditions.length
      || level.conditions.some(condition => typeof condition !== 'string' || !condition.trim())
      || new Set(level.conditions).size !== level.conditions.length) {
      throw new Error('登場データの集計条件に不正な値があります。')
    }
    seenConditionalLevels.add(level.levelId)
    aggregationConditions.push({ levelId: level.levelId, conditions: [...level.conditions] as string[] })
  }
  const counts: EnemyHistogramCounts['enemies'] = Object.create(null)
  for (const [id, value] of Object.entries(enemies)) {
    const entry = record(value)
    if (!entry || !isCount(entry.mapCount)
      || !(expectedMode && expectedLevels.length ? isExpectedCount(entry.spawnCount) : isCount(entry.spawnCount))
      || entry.mapCount > Number(summary.mapCount)) {
      throw new Error('登場データに不正な集計値があります。')
    }
    counts[id] = { mapCount: entry.mapCount, spawnCount: entry.spawnCount as number }
  }
  return {
    schemaVersion: 1,
    ...(partialMode ? {
      spawnAggregationMode: root.spawnAggregationMode as 'lower-bound' | 'expected-lower-bound',
    } : {}),
    ...(partialMode || rawConditions !== undefined ? {
      diagnostics: { lowerBoundLevels: lowerBounds,
        ...(expectedMode ? { expectedLevels } : {}),
        ...(rawConditions !== undefined ? { aggregationConditions } : {}) },
    } : {}),
    generatedAt: typeof root.generatedAt === 'string' ? root.generatedAt : '',
    sourceGeneratedAt: typeof root.sourceGeneratedAt === 'string' ? root.sourceGeneratedAt : null,
    summary: summary as unknown as EnemyHistogramCounts['summary'],
    enemies: counts,
  }
}

export function getEnemySpawnCoverageLabel(summary: EnemyHistogramCounts['summary'] | null | undefined): string {
  const count = (summary?.spawnMapCount ?? 0).toLocaleString('ja-JP')
  if (summary?.expectedMapCount) return `集計対象 ${count}マップ（下限 ${(summary.lowerBoundMapCount ?? 0).toLocaleString('ja-JP')}・期待値 ${summary.expectedMapCount.toLocaleString('ja-JP')}）`
  return summary?.lowerBoundMapCount
    ? `集計対象 ${count}マップ（下限 ${summary.lowerBoundMapCount.toLocaleString('ja-JP')}）`
    : `出現数確定 ${count}マップ`
}

export function getEnemyCountWeight(
  id: string,
  mode: EnemyHistogramCountMode,
  counts: EnemyHistogramCounts | null,
): number {
  return mode === 'TYPES' ? 1
    : counts?.enemies[id]?.[mode === 'MAPS' ? 'mapCount' : 'spawnCount'] ?? 0
}

export function buildEnemyHistogramObservations(
  rows: readonly EnemyRecord[],
  value: (enemy: EnemyRecord) => number | null,
  mode: EnemyHistogramCountMode,
  counts: EnemyHistogramCounts | null,
): WeightedHistogramObservation[] {
  if (mode !== 'TYPES' && counts === null) return []
  const seen = new Set<string>()
  return rows.flatMap((enemy) => {
    if (seen.has(enemy.id)) return []
    seen.add(enemy.id)
    const weight = getEnemyCountWeight(enemy.id, mode, counts)
    return [{ value: value(enemy), weight }]
  })
}

export function withHistogramDispersion(statistics: NumericStatistics): NumericStatisticsWithDispersion {
  const iqr = statistics.firstQuartile === null || statistics.thirdQuartile === null ? null
    : statistics.thirdQuartile - statistics.firstQuartile
  const supports = statistics.minimum !== null && statistics.minimum >= 0
  return {
    ...statistics,
    interquartileRange: iqr,
    coefficientOfVariation: supports && statistics.mean !== null && statistics.mean > 0 && statistics.standardDeviation !== null
      ? statistics.standardDeviation / statistics.mean : null,
    normalizedInterquartileRange: supports && statistics.median !== null && statistics.median > 0 && iqr !== null
      ? iqr / statistics.median : null,
  }
}

export function getWeightedEnemyHistogramImageFilename(options: {
  mode: EnemyHistogramCountMode
  metric: string
  scope: string
  scale: string
  customLinearUpperBound?: number | null
  statistics: NumericStatistics
  referenceVisibility: { mean: boolean; median: boolean }
  showPercentages?: boolean
  showBinRanges?: boolean
  showCumulative?: boolean
  cumulativeDisplay?: HistogramCumulativeDisplay
  useRatingBins?: boolean
  coverage: EnemyHistogramCounts['summary'] | null
}): string {
  const { mode, metric, scope, scale, statistics, referenceVisibility } = options
  const histogram = statistics.histogram
  const isLinear = scale === 'LINEAR'
  return createChartImageFilename(`敵_${metric}_ヒストグラム`, [
    ENEMY_HISTOGRAM_COUNT_MODES.find((option) => option.key === mode)!.label,
    ...scope.split(/\s*·\s*/), options.useRatingBins ? 'ゲーム内評価' : isLinear ? '線形' : '対数',
    !options.useRatingBins && isLinear && histogram?.binWidth != null ? `幅${histogram.binWidth}` : null,
    !options.useRatingBins && isLinear && histogram ? `上限${options.customLinearUpperBound == null ? '自動' : ''}${histogram.normalRangeEnd}` : null,
    !options.useRatingBins && !isLinear && histogram ? `${histogram.normalBinCount}階級` : null,
    options.showPercentages && '割合表示',
    options.showCumulative && (options.cumulativeDisplay === 'both' ? '累積割合線＋帯'
      : options.cumulativeDisplay === 'strip' ? '累積割合帯' : '累積割合表示'),
    options.showBinRanges && '階級範囲表示',
    [referenceVisibility.mean && '平均', referenceVisibility.median && '中央値'].filter(Boolean).join('-'),
  ])
}
