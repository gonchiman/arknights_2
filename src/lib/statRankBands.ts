import { getEnemyRatingNumericRanges, getEnemyStatRating } from './enemyStatRatings.ts'

export type RankBandStat = 'maxHp' | 'magicResistance'

export interface StatRankBand {
  rating: string
  label: string
  /** Horizontal bounds as fractions of the full plot width. */
  start: number
  end: number
  /** Stable position in the full E ... SS rank list, including hidden ranks. */
  index: number
  /** An included endpoint without numerical width, such as resistance E at 0. */
  pointValue?: number
}

interface StatRankBandOptions {
  stat: RankBandStat
  chartKind: 'line' | 'bar'
  min?: number
  max: number
  barValues: readonly number[]
}

export function getStatRankBands({ stat, chartKind, min = 0, max, barValues }: StatRankBandOptions): StatRankBand[] {
  if (!Number.isFinite(max) || max < 0) return []
  const domainStart = Number.isFinite(min) && min >= 0 && min <= max ? min : 0
  const domainSpan = max - domainStart
  const ranges = getEnemyRatingNumericRanges(stat)

  if (chartKind === 'line') {
    if (domainSpan === 0) {
      const rating = getEnemyStatRating(stat, domainStart)
      const index = ranges.findIndex((range) => range.rating === rating)
      const range = ranges[index]
      return range ? [{ rating: range.rating, label: range.label, start: 0, end: 1, index }] : []
    }
    return ranges.flatMap((range, index): StatRankBand[] => {
      const start = Math.max(domainStart, range.lowerBound ?? domainStart)
      const end = Math.min(max, range.upperBound ?? max)
      if (end > start) {
        return [{ rating: range.rating, label: range.label, start: (start - domainStart) / domainSpan, end: (end - domainStart) / domainSpan, index }]
      }
      // E includes resistance 0, but occupies no interval in the nonnegative domain.
      // Retain that exact endpoint without widening it into the neighboring D range.
      if (stat === 'magicResistance' && domainStart === 0 && range.upperBound === 0 && range.upperInclusive) {
        return [{ rating: range.rating, label: range.label, start: 0, end: 0, index, pointValue: 0 }]
      }
      return []
    })
  }

  // Bar groups are categorical: widths follow the displayed values, rather than
  // the numerical distances between them. Resistance 0 is a valid E group.
  const values = [...new Set(barValues.filter((value) => Number.isFinite(value) && value >= domainStart && value <= max))]
    .sort((left, right) => left - right)
  const bands: StatRankBand[] = []
  values.forEach((value, groupIndex) => {
    const rating = getEnemyStatRating(stat, value)
    const index = ranges.findIndex((range) => range.rating === rating)
    if (index < 0) return
    const range = ranges[index]
    const end = (groupIndex + 1) / values.length
    const previous = bands[bands.length - 1]
    if (previous?.rating === rating) {
      previous.end = end
    } else {
      bands.push({ rating: range.rating, label: range.label, start: groupIndex / values.length, end, index })
    }
  })
  return bands
}
