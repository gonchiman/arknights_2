import type { EnemyRecord } from '../types/enemy.ts'
import {
  buildEnemyHistogramObservations,
  type EnemyHistogramCountMode,
  type EnemyHistogramCounts,
} from './enemyHistogramCounts.ts'
import { ENEMY_RATING_COMPARISON_METRICS } from './enemyRatingComparison.ts'
import { calculateWeightedPercentile, type WeightedHistogramObservation } from './enemyWeightedHistogram.ts'

export type EnemyBoxplotScale = 'RAW' | 'MEDIAN'
export type EnemyBoxplotRange = 'ALL' | 'WHISKERS'

export interface EnemyBoxplotStatistics {
  minimum: number
  firstQuartile: number
  median: number
  thirdQuartile: number
  maximum: number
  lowerWhisker: number
  upperWhisker: number
  mean: number
  outliers: { value: number; count: number }[]
  outlierCount: number
}

export interface EnemyBoxplotSeries {
  key: 'defense' | 'magicResistance'
  label: string
  validCount: number
  missingCount: number
  statistics: EnemyBoxplotStatistics | null
}

export interface EnemyBoxplotComparison {
  series: EnemyBoxplotSeries[]
  hasData: boolean
}

function summarizeObservations(source: readonly WeightedHistogramObservation[]) {
  const frequencies = new Map<number, number>()
  let validCount = 0
  let missingCount = 0
  for (const { value, weight } of source) {
    if (!Number.isFinite(weight) || weight <= 0) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missingCount += weight
      continue
    }
    validCount += weight
    frequencies.set(value, (frequencies.get(value) ?? 0) + weight)
  }

  const observations = [...frequencies].map(([value, weight]) => ({ value, weight }))
    .sort((left, right) => left.value - right.value)
  // Preserve the histogram's summation order for fractional expected counts.
  const firstQuartile = calculateWeightedPercentile(source, 25)
  const median = calculateWeightedPercentile(source, 50)
  const thirdQuartile = calculateWeightedPercentile(source, 75)
  if (firstQuartile === null || median === null || thirdQuartile === null) {
    return { validCount, missingCount, statistics: null }
  }

  const interquartileRange = thirdQuartile - firstQuartile
  const lowerFence = firstQuartile - 1.5 * interquartileRange
  const upperFence = thirdQuartile + 1.5 * interquartileRange
  // Fences decide membership; whiskers end at observed values, not the fences.
  const inside = observations.filter(({ value }) => value >= lowerFence && value <= upperFence)
  const outliers = observations.filter(({ value }) => value < lowerFence || value > upperFence)
    .map(({ value, weight }) => ({ value, count: weight }))
  const statistics: EnemyBoxplotStatistics = {
    minimum: observations[0].value,
    firstQuartile,
    median,
    thirdQuartile,
    maximum: observations[observations.length - 1].value,
    lowerWhisker: inside[0].value,
    upperWhisker: inside[inside.length - 1].value,
    mean: observations.reduce((sum, { value, weight }) => sum + value * (weight / validCount), 0),
    outliers,
    outlierCount: outliers.reduce((sum, { count }) => sum + count, 0),
  }
  return { validCount, missingCount, statistics }
}

export function buildEnemyBoxplotComparison(
  rows: readonly EnemyRecord[],
  mode: EnemyHistogramCountMode,
  counts: EnemyHistogramCounts | null,
): EnemyBoxplotComparison {
  const series = ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }) => ({
    key,
    label,
    ...summarizeObservations(buildEnemyHistogramObservations(rows, enemy => enemy.stats[key], mode, counts)),
  }))
  return { series, hasData: series.some(({ statistics }) => statistics !== null) }
}

export function getEnemyBoxplotDisplaySeries(
  data: EnemyBoxplotComparison,
  scale: EnemyBoxplotScale,
): (EnemyBoxplotSeries & { unavailable: 'no-data' | 'median-zero' | null })[] {
  return data.series.map((series) => {
    const { statistics } = series
    if (statistics === null) return { ...series, unavailable: 'no-data' }
    if (scale === 'RAW') return { ...series, unavailable: null }
    if (statistics.median <= 0) return { ...series, statistics: null, unavailable: 'median-zero' }
    const divisor = statistics.median
    return {
      ...series,
      unavailable: null,
      statistics: {
        minimum: statistics.minimum / divisor,
        firstQuartile: statistics.firstQuartile / divisor,
        median: 1,
        thirdQuartile: statistics.thirdQuartile / divisor,
        maximum: statistics.maximum / divisor,
        lowerWhisker: statistics.lowerWhisker / divisor,
        upperWhisker: statistics.upperWhisker / divisor,
        mean: statistics.mean / divisor,
        outliers: statistics.outliers.map(({ value, count }) => ({ value: value / divisor, count })),
        outlierCount: statistics.outlierCount,
      },
    }
  })
}
