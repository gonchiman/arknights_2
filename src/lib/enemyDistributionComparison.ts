import type { EnemyRecord } from '../types/enemy.ts'
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
  },
): EnemyComparisonDistribution {
  const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()]
  const matchedRows = conditions.map((condition) => uniqueRows.filter((row) => (
    matchesEnemyFilters(row, condition.filters)
    && matchesEnemyNumericConditions(row, condition.numericConditions)
  )))
  // Hidden series still participate, so a legend toggle cannot move the shared bins.
  const unionRows = [...new Map(matchedRows.flat().map((row) => [row.id, row])).values()]
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
    const values = source.map(getValue).filter(isFiniteValue)
    const bins = statistics.bins.map((bin) => ({ ...bin, count: 0 }))
    for (const value of values) {
      const binIndex = binByValue.get(value)
      if (binIndex !== undefined) bins[binIndex].count += 1
    }
    return {
      condition,
      label: formatEnemyComparisonCondition(condition),
      matchedCount: source.length,
      count: values.length,
      missingCount: source.length - values.length,
      bins,
      overflowCount: bins.find((bin) => bin.isOverflow)?.count ?? 0,
    }
  })

  return {
    series,
    bins: statistics.bins,
    histogram: statistics.histogram,
    minimum: statistics.histogram?.normalRangeStart ?? 0,
    maximum: statistics.histogram?.normalRangeEnd ?? 1,
    observedMaximum: statistics.maximum,
    unionCount: unionRows.length,
  }
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
