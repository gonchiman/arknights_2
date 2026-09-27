import type { EnemyRecord } from '../types/enemy.ts'
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
  generatedAt: string
  sourceGeneratedAt: string | null
  summary: {
    mapCount: number
    missingMapCount: number
    spawnMapCount: number
    spawnExcludedMapCount: number
  }
  enemies: Record<string, { mapCount: number; spawnCount: number }>
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function parseEnemyHistogramCounts(source: unknown): EnemyHistogramCounts {
  const root = record(source)
  const summary = record(root?.summary)
  const enemies = record(root?.enemies)
  if (root?.schemaVersion !== 1 || !summary || !enemies
    || !['mapCount', 'missingMapCount', 'spawnMapCount', 'spawnExcludedMapCount'].every((key) => isCount(summary[key]))
    || Number(summary.spawnMapCount) + Number(summary.spawnExcludedMapCount) !== summary.mapCount) {
    throw new Error('登場データの形式を確認できませんでした。')
  }
  const counts: EnemyHistogramCounts['enemies'] = Object.create(null)
  for (const [id, value] of Object.entries(enemies)) {
    const entry = record(value)
    if (!entry || !isCount(entry.mapCount) || !isCount(entry.spawnCount) || entry.mapCount > Number(summary.mapCount)) {
      throw new Error('登場データに不正な集計値があります。')
    }
    counts[id] = { mapCount: entry.mapCount, spawnCount: entry.spawnCount }
  }
  return {
    schemaVersion: 1,
    generatedAt: typeof root.generatedAt === 'string' ? root.generatedAt : '',
    sourceGeneratedAt: typeof root.sourceGeneratedAt === 'string' ? root.sourceGeneratedAt : null,
    summary: summary as unknown as EnemyHistogramCounts['summary'],
    enemies: counts,
  }
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
    const weight = mode === 'TYPES' ? 1
      : counts!.enemies[enemy.id]?.[mode === 'MAPS' ? 'mapCount' : 'spawnCount'] ?? 0
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
  coverage: EnemyHistogramCounts['summary'] | null
}): Promise<string> {
  const { mode, metric, scope, scale, statistics, referenceVisibility, coverage } = options
  return createChartImageFilename(`敵_${metric}_ヒストグラム_${ENEMY_HISTOGRAM_COUNT_MODES.find((option) => option.key === mode)!.label}`, {
    kind: 'HISTOGRAM', mode, metric, scope, scale,
    minimum: statistics.minimum, maximum: statistics.maximum,
    bins: statistics.bins, histogram: statistics.histogram,
    count: statistics.count, missingCount: statistics.missingCount,
    mean: referenceVisibility.mean ? statistics.mean : null,
    median: referenceVisibility.median ? statistics.median : null,
    referenceVisibility,
    coverage: mode === 'MAPS' ? { mapCount: coverage?.mapCount ?? null }
      : mode === 'SPAWNS' ? { spawnMapCount: coverage?.spawnMapCount ?? null } : null,
    customLinearUpperBound: scale === 'LINEAR' ? options.customLinearUpperBound ?? null : null,
  })
}
