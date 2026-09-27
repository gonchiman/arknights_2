import type { EnemyRecord } from '../types/enemy.ts'
import { createChartImageFilename } from './chartImageFilename.ts'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { matchesEnemyFilters, type EnemyFilters } from './enemyData.ts'
import {
  formatEnemyNumericCondition,
  matchesEnemyNumericConditions,
  type EnemyNumericCondition,
  type EnemyNumericFilterField,
} from './enemyNumericFilters.ts'
import {
  calculateNumericStatistics,
  type HistogramBin,
  type HistogramMetadata,
  type HistogramScale,
} from './enemyStatistics.ts'

export interface EnemyComparisonCondition {
  id: number
  colorIndex: number
  filters: EnemyFilters
  numericConditions: readonly EnemyNumericCondition[]
  visible: boolean
}

export interface EnemyComparisonSeries {
  condition: EnemyComparisonCondition
  label: string
  matchedCount: number
  count: number
  missingCount: number
  bins: HistogramBin[]
  overflowCount: number
}

export interface EnemyComparisonDistribution {
  series: EnemyComparisonSeries[]
  bins: HistogramBin[]
  histogram: HistogramMetadata | null
  minimum: number
  maximum: number
  observedMaximum: number | null
  unionCount: number
}

export type EnemyComparisonYAxis = 'COUNT' | 'PERCENT'

export function createEnemyComparisonConditions(): EnemyComparisonCondition[] {
  return [
    { id: 1, colorIndex: 0, filters: { query: '', levelType: 'NORMAL' }, numericConditions: [], visible: true },
    { id: 2, colorIndex: 1, filters: { query: '', levelType: 'ELITE' }, numericConditions: [], visible: true },
  ]
}

const LEVEL_LABELS: Record<EnemyFilters['levelType'], string> = {
  ALL: '全敵',
  NORMAL: '通常敵',
  ELITE: 'エリート敵',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

export function formatEnemyComparisonCondition(condition: EnemyComparisonCondition): string {
  const query = condition.filters.query.trim()
  return [
    LEVEL_LABELS[condition.filters.levelType],
    ...(query ? [`検索「${query}」`] : []),
    ...condition.numericConditions.map(formatEnemyNumericCondition).filter((label) => label !== null),
  ].join(' · ')
}

export function getEnemyComparisonValue(binCount: number, total: number, yAxis: EnemyComparisonYAxis): number {
  return yAxis === 'COUNT' ? binCount : total > 0 ? binCount / total * 100 : 0
}

export function buildEnemyComparisonDistribution(
  rows: readonly EnemyRecord[],
  conditions: readonly EnemyComparisonCondition[],
  metricKey: EnemyNumericFilterField,
  options: {
    scale: HistogramScale
    preferredBinCount: number
    minimumLinearBinWidth: number
    customLinearBinWidth?: number | null
    customLinearUpperBound?: number | null
    countMode?: EnemyHistogramCountMode
    counts?: EnemyHistogramCounts | null
  },
): EnemyComparisonDistribution {
  const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()]
  const countMode = options.countMode ?? 'TYPES'
  const getWeight = (row: EnemyRecord) => countMode === 'TYPES' ? 1
    : options.counts?.enemies[row.id]?.[countMode === 'MAPS' ? 'mapCount' : 'spawnCount'] ?? 0
  const eligible = (row: EnemyRecord) => Number.isFinite(getWeight(row)) && getWeight(row) > 0
  const matchedRows = conditions.map((condition) => uniqueRows.filter((row) => (
    matchesEnemyFilters(row, condition.filters)
    && matchesEnemyNumericConditions(row, condition.numericConditions)
  )))
  // Hidden series still participate, so a legend toggle cannot move the shared bins.
  const unionRows = [...new Map(matchedRows.flat().map((row) => [row.id, row])).values()].filter(eligible)
  const getValue = (row: EnemyRecord) => metricKey === 'stageAppearanceCount'
    ? row.stageAppearanceCount : row.stats[metricKey]
  const unionValues = unionRows.map(getValue)
  const statistics = calculateNumericStatistics(
    unionValues,
    options.preferredBinCount,
    options.scale,
    options.minimumLinearBinWidth,
    options.customLinearBinWidth ?? null,
    options.customLinearUpperBound ?? null,
  )

  // Recover membership from the common histogram's sorted counts. This keeps
  // its exact floating-point boundaries without duplicating its binning rules.
  const sortedValues = unionValues.filter(isFiniteValue).sort((left, right) => left - right)
  const binByValue = new Map<number, number>()
  let valueIndex = 0
  statistics.bins.forEach((bin, binIndex) => {
    const endIndex = valueIndex + bin.count
    for (; valueIndex < endIndex; valueIndex += 1) {
      binByValue.set(sortedValues[valueIndex], binIndex)
    }
  })

  const series = conditions.map((condition, index): EnemyComparisonSeries => {
    const source = matchedRows[index]
    const bins = statistics.bins.map((bin) => ({ ...bin, count: 0 }))
    let count = 0
    let missingCount = 0
    for (const row of source.filter(eligible)) {
      const value = getValue(row)
      const weight = getWeight(row)
      if (!isFiniteValue(value)) { missingCount += weight; continue }
      count += weight
      const binIndex = binByValue.get(value)
      if (binIndex !== undefined) bins[binIndex].count += weight
    }
    return {
      condition,
      label: formatEnemyComparisonCondition(condition),
      matchedCount: source.length,
      count,
      missingCount,
      bins,
      overflowCount: bins.find((bin) => bin.isOverflow)?.count ?? 0,
    }
  })

  const unionBins = statistics.bins.map((bin) => ({ ...bin, count: 0 }))
  for (const row of unionRows) {
    const value = getValue(row)
    if (!isFiniteValue(value)) continue
    const binIndex = binByValue.get(value)
    if (binIndex !== undefined) unionBins[binIndex].count += getWeight(row)
  }

  return {
    series,
    bins: unionBins,
    histogram: statistics.histogram,
    minimum: statistics.histogram?.normalRangeStart ?? 0,
    maximum: statistics.histogram?.normalRangeEnd ?? 1,
    observedMaximum: statistics.maximum,
    unionCount: unionRows.length,
  }
}

export function getEnemyComparisonImageFilename(options: {
  distribution: EnemyComparisonDistribution
  metric: { key: string; label: string; axisLabel: string; suffix: string }
  scale: HistogramScale
  yAxis: EnemyComparisonYAxis
  countMode?: EnemyHistogramCountMode
  coverage?: EnemyHistogramCounts['summary'] | null
}): Promise<string> {
  const { distribution, metric, yAxis, coverage } = options
  const countMode = options.countMode ?? 'TYPES'
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find((item) => item.key === countMode)!
  return createChartImageFilename(`敵_${metric.label}_分布比較_${mode.label}`, {
    kind: 'COMPARISON', metric: { key: metric.key, label: metric.label, axisLabel: metric.axisLabel, suffix: metric.suffix }, yAxis, countMode,
    scale: options.scale === 'LOG' && distribution.minimum >= 0 ? 'LOG' : 'LINEAR',
    minimum: distribution.minimum, maximum: distribution.maximum,
    bins: distribution.bins.map(({ count: _count, ...bin }) => bin),
    binWidth: distribution.histogram?.binWidth ?? null,
    upperBound: distribution.histogram?.normalRangeEnd ?? null,
    // Hidden series still determine the unchanged vertical scale.
    maximumY: Math.max(0, ...distribution.series.flatMap((series) => series.bins
      .filter((bin) => !bin.isOverflow).map((bin) => getEnemyComparisonValue(bin.count, series.count, yAxis)))),
    series: distribution.series.filter((series) => series.condition.visible).map((series) => ({
      label: series.label, colorIndex: series.condition.colorIndex,
      count: series.count, missingCount: series.missingCount, bins: series.bins,
    })),
    coverage: countMode === 'MAPS' ? { mapCount: coverage?.mapCount ?? null }
      : countMode === 'SPAWNS' ? { spawnMapCount: coverage?.spawnMapCount ?? null } : null,
  })
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
