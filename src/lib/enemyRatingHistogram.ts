import {
  ENEMY_RATING_STATS,
  getEnemyRatingNumericRanges,
  getEnemyStatRating,
  type EnemyRatingNumericRange,
  type EnemyRatingStat,
} from './enemyStatRatings.ts'
import type { WeightedHistogramObservation } from './enemyWeightedHistogram.ts'

export interface EnemyRatingHistogramBin extends EnemyRatingNumericRange {
  count: number
}

export function isEnemyRatingStat(key: string): key is EnemyRatingStat {
  return ENEMY_RATING_STATS.some((stat) => stat.key === key)
}

/** Keep every rating visible, including ratings without any eligible observations. */
export function buildEnemyRatingHistogramBins(
  observations: readonly WeightedHistogramObservation[],
  stat: EnemyRatingStat,
): EnemyRatingHistogramBin[] {
  const bins = getEnemyRatingNumericRanges(stat).map((range) => ({ ...range, count: 0 }))
  const binsByRating = new Map(bins.map((bin) => [bin.rating, bin]))

  for (const { value, weight } of observations) {
    if (!Number.isFinite(weight) || weight <= 0) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const rating = getEnemyStatRating(stat, value)
    const bin = rating === null ? undefined : binsByRating.get(rating)
    if (bin) bin.count += weight
  }

  return bins
}

const numberFormatter = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })

function formatBoundary(value: number): string {
  const normalized = value === 0 ? 0 : value
  return Math.abs(normalized) >= 10_000 && normalized % 1_000 === 0
    ? `${numberFormatter.format(normalized / 10_000)}万`
    : numberFormatter.format(normalized)
}

/** Preserve the inclusive/exclusive boundaries used by the in-game rating lookup. */
export function formatEnemyRatingHistogramRangeLines(bin: EnemyRatingNumericRange): string[] {
  const lines: string[] = []
  if (bin.lowerBound !== null) {
    lines.push(`${formatBoundary(bin.lowerBound)}${bin.lowerInclusive ? '以上' : '超'}`)
  }
  if (bin.upperBound !== null) {
    lines.push(`${formatBoundary(bin.upperBound)}${bin.upperInclusive ? '以下' : '未満'}`)
  }
  return lines
}
