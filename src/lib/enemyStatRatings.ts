export type EnemyRatingStat = 'maxHp' | 'attack' | 'defense' | 'magicResistance'

export const ENEMY_RATING_STATS = [
  { key: 'maxHp', label: 'HP（耐久）' },
  { key: 'attack', label: '攻撃力' },
  { key: 'defense', label: '防御力' },
  { key: 'magicResistance', label: '術耐性' },
] as const satisfies readonly { key: EnemyRatingStat; label: string }[]

interface RatingRange {
  rating: string
  upperBound: number | null
  upperInclusive?: boolean
}

// Ranges are contiguous in this order; each lower bound is the previous upper bound.
const RATING_RANGES: Record<EnemyRatingStat, readonly RatingRange[]> = {
  maxHp: [
    { rating: 'E', upperBound: 1000 },
    { rating: 'D', upperBound: 3500 },
    { rating: 'C', upperBound: 5000 },
    { rating: 'B', upperBound: 8000 },
    { rating: 'B+', upperBound: 12000 },
    { rating: 'A', upperBound: 25000 },
    { rating: 'A+', upperBound: 100000 },
    { rating: 'S', upperBound: 250000 },
    { rating: 'S+', upperBound: 500000, upperInclusive: true },
    { rating: 'SS', upperBound: null },
  ],
  attack: [
    { rating: 'E', upperBound: 200 },
    { rating: 'D', upperBound: 300 },
    { rating: 'C', upperBound: 500 },
    { rating: 'B', upperBound: 700 },
    { rating: 'B+', upperBound: 1000 },
    { rating: 'A', upperBound: 1500 },
    { rating: 'A+', upperBound: 2000 },
    { rating: 'S', upperBound: 3000 },
    { rating: 'S+', upperBound: 5000, upperInclusive: true },
    { rating: 'SS', upperBound: null },
  ],
  defense: [
    { rating: 'E', upperBound: 100 },
    { rating: 'D', upperBound: 200 },
    { rating: 'C', upperBound: 500 },
    { rating: 'B', upperBound: 800 },
    { rating: 'B+', upperBound: 1000 },
    { rating: 'A', upperBound: 1200 },
    { rating: 'A+', upperBound: 2000 },
    { rating: 'S', upperBound: 3000 },
    { rating: 'S+', upperBound: 5000, upperInclusive: true },
    { rating: 'SS', upperBound: null },
  ],
  magicResistance: [
    { rating: 'E', upperBound: 0, upperInclusive: true },
    { rating: 'D', upperBound: 10 },
    { rating: 'C', upperBound: 20 },
    { rating: 'B', upperBound: 30 },
    { rating: 'B+', upperBound: 50 },
    { rating: 'A', upperBound: 60 },
    { rating: 'A+', upperBound: 70 },
    { rating: 'S', upperBound: 80 },
    { rating: 'S+', upperBound: 90, upperInclusive: true },
    { rating: 'SS', upperBound: null },
  ],
}

const BOUND_FORMATTER = new Intl.NumberFormat('ja-JP')

export function getEnemyRatingRanges(stat: EnemyRatingStat): readonly { rating: string; label: string }[] {
  return RATING_RANGES[stat].map((range, index, ranges) => {
    const previous = ranges[index - 1]
    const lower = previous?.upperBound != null
      ? `${BOUND_FORMATTER.format(previous.upperBound)} ${previous.upperInclusive ? '超' : '以上'}`
      : ''
    const upper = range.upperBound !== null
      ? `${BOUND_FORMATTER.format(range.upperBound)} ${range.upperInclusive ? '以下' : '未満'}`
      : ''
    return { rating: range.rating, label: [lower, upper].filter(Boolean).join(' ') }
  })
}

export function getEnemyStatRating(stat: EnemyRatingStat, value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  return RATING_RANGES[stat].find(({ upperBound, upperInclusive }) => (
    upperBound === null || (upperInclusive ? value <= upperBound : value < upperBound)
  ))?.rating ?? null
}
