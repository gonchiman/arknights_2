import { getEnemyRatingNumericRanges, getEnemyStatRating } from './enemyStatRatings.ts'

export interface HpRankBand {
  rating: string
  label: string
  /** Horizontal bounds as fractions of the full plot width. */
  start: number
  end: number
  /** Stable position in the full E ... SS rank list, including hidden ranks. */
  index: number
}

interface HpRankBandOptions {
  chartKind: 'line' | 'bar'
  maxHp: number
  barHps: readonly number[]
}

const HP_RANGES = getEnemyRatingNumericRanges('maxHp')

export function getHpRankBands({ chartKind, maxHp, barHps }: HpRankBandOptions): HpRankBand[] {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return []

  if (chartKind === 'line') {
    return HP_RANGES.flatMap((range, index) => {
      const start = Math.max(0, range.lowerBound ?? 0)
      const end = Math.min(maxHp, range.upperBound ?? maxHp)
      return end > start
        ? [{ rating: range.rating, label: range.label, start: start / maxHp, end: end / maxHp, index }]
        : []
    })
  }

  // Bar groups are categorical, so their widths follow the displayed HP points,
  // not the numerical distance between consecutive HP values.
  const hps = [...new Set(barHps.filter((hp) => Number.isFinite(hp) && hp > 0 && hp <= maxHp))]
    .sort((left, right) => left - right)
  const bands: HpRankBand[] = []
  hps.forEach((hp, groupIndex) => {
    const rating = getEnemyStatRating('maxHp', hp)
    const index = HP_RANGES.findIndex((range) => range.rating === rating)
    if (index < 0) return
    const range = HP_RANGES[index]
    const end = (groupIndex + 1) / hps.length
    const previous = bands[bands.length - 1]
    if (previous?.rating === rating) {
      previous.end = end
    } else {
      bands.push({ rating: range.rating, label: range.label, start: groupIndex / hps.length, end, index })
    }
  })
  return bands
}
