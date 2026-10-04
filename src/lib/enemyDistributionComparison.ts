import type { EnemyRecord } from '../types/enemy.ts'
import { createChartImageFilename } from './chartImageFilename.ts'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { matchesEnemyFilters } from './enemyData.ts'
import { copyEnemyLevelSelection, formatEnemyLevelSelection, type EnemyAnalysisFiltersState } from './enemyLevelSelection.ts'
import type { EnemyLevelType } from '../types/enemy.ts'
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
  filters: EnemyAnalysisFiltersState
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
    { id: 1, colorIndex: 0, filters: { levelType: 'NORMAL' }, numericConditions: [], visible: true },
    { id: 2, colorIndex: 1, filters: { levelType: 'ELITE' }, numericConditions: [], visible: true },
  ]
}

const LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常敵',
  ELITE: 'エリート敵',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

export function formatEnemyComparisonCondition(condition: EnemyComparisonCondition): string {
  return [
    formatEnemyLevelSelection(condition.filters.levelType, LEVEL_LABELS),
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
    matchesEnemyFilters(row, { query: '', levelType: condition.filters.levelType })
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

  const series = conditions.map((original, index): EnemyComparisonSeries => {
    const condition = copyEnemyComparisonCondition(original)
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

export function copyEnemyComparisonCondition(condition: EnemyComparisonCondition): EnemyComparisonCondition {
  return {
    ...condition,
    filters: { levelType: copyEnemyLevelSelection(condition.filters.levelType) },
    numericConditions: condition.numericConditions.map((item) => ({ ...item })),
  }
}

export function getEnemyComparisonImageFilename(options: {
  distribution: EnemyComparisonDistribution
  metric: { key: string; label: string; axisLabel: string; suffix: string }
  scale: HistogramScale
  yAxis: EnemyComparisonYAxis
  countMode?: EnemyHistogramCountMode
  coverage?: EnemyHistogramCounts['summary'] | null
}): string {
  const { distribution, metric, yAxis } = options
  const countMode = options.countMode ?? 'TYPES'
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find((item) => item.key === countMode)!
  const isLog = options.scale === 'LOG' && distribution.minimum >= 0
  return createChartImageFilename(`敵_${metric.label}_分布比較`, [
    mode.label, yAxis === 'PERCENT' ? '縦軸割合' : '縦軸件数', isLog ? '対数' : '線形',
    ...distribution.series.filter((series) => series.condition.visible)
      .map((series, index) => `条件${index + 1}-${series.label.replace(/\s*·\s*/g, '-')}`),
    !isLog && distribution.histogram?.binWidth != null ? `幅${distribution.histogram.binWidth}` : null,
    !isLog && distribution.histogram ? `上限${distribution.histogram.normalRangeEnd}` : null,
    isLog && distribution.histogram ? `${distribution.histogram.normalBinCount}階級` : null,
  ])
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
