import { getEnemyRatingNumericRanges, getEnemyStatRating } from './enemyStatRatings.ts'

export type SurtrDpsBarStep = number | 'ratings'
export interface SurtrDpsResistanceRange { min: number; max: number }

export function isValidSurtrDpsResistanceRange(range: SurtrDpsResistanceRange): boolean {
  return Number.isInteger(range.min) && Number.isInteger(range.max)
    && range.min >= 0 && range.max <= 100 && range.min < range.max
}

export function normalizeSurtrDpsResistanceRange(range?: SurtrDpsResistanceRange): SurtrDpsResistanceRange {
  return range && isValidSurtrDpsResistanceRange(range) ? { ...range } : { min: 0, max: 100 }
}

const resistanceRanges = getEnemyRatingNumericRanges('magicResistance')

// Use one representative value per rank within the chart's 0–100 domain.
// These are point calculations, not averages of all values in each rank.
const ratingSamples = resistanceRanges.map(range => {
  const lower = Math.max(0, range.lowerBound ?? 0)
  const upper = Math.min(100, range.upperBound ?? 100)
  return Math.round((lower + upper) / 2)
})

export function getSurtrDpsResistanceSamples(step: SurtrDpsBarStep = 20, range?: SurtrDpsResistanceRange): number[] {
  const { min, max } = normalizeSurtrDpsResistanceRange(range)
  if (step === 'ratings') return ratingSamples.filter(value => value >= min && value <= max)
  const spacing = Number.isInteger(step) && step >= 1 && step <= 100 ? step : 20
  return Array.from({ length: Math.floor((max - min) / spacing) + 1 }, (_, index) => min + index * spacing)
}

export function getSurtrDpsResistanceRating(value: number): { rating: string; label: string } | null {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  const rating = getEnemyStatRating('magicResistance', value)
  const range = resistanceRanges.find(item => item.rating === rating)
  return range ? { rating: range.rating, label: range.label } : null
}
