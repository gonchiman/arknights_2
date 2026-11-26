import type { EnemyRecord } from '../types/enemy.ts'
import { getEnemyCountWeight, type EnemyHistogramCountMode, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { getEnemyRatingNumericRanges, getEnemyStatRating } from './enemyStatRatings.ts'

export type EnemyRatingPairGrouping = 'rating' | 'threshold'

export interface EnemyRatingPairs {
  labels: readonly string[]
  /** Rows are resistance, columns are defense. Both run from the lowest rating up. */
  cells: number[][]
  defenseTotals: number[]
  resistanceTotals: number[]
  total: number
  missing: number
}

const ratings = getEnemyRatingNumericRanges('defense').map(({ rating }) => rating)
const highRatingStart = ratings.indexOf('A+')

export function buildEnemyRatingPairs(
  rows: readonly EnemyRecord[],
  counts: EnemyHistogramCounts | null,
  countMode: EnemyHistogramCountMode,
  grouping: EnemyRatingPairGrouping,
): EnemyRatingPairs {
  const grouped = grouping === 'threshold'
  const labels = grouped ? ['A以下', 'A+以上'] : ratings
  const cells = labels.map(() => labels.map(() => 0))
  const defenseTotals = labels.map(() => 0)
  const resistanceTotals = labels.map(() => 0)
  const seen = new Set<string>()
  let total = 0
  let missing = 0

  for (const { id, stats } of rows) {
    if (seen.has(id)) continue
    seen.add(id)
    const weight = getEnemyCountWeight(id, countMode, counts)
    if (!Number.isFinite(weight) || weight <= 0) continue

    const defense = getEnemyStatRating('defense', stats.defense)
    const resistance = getEnemyStatRating('magicResistance', stats.magicResistance)
    if (defense === null || resistance === null) {
      missing += weight
      continue
    }
    const column = ratings.indexOf(defense)
    const row = ratings.indexOf(resistance)
    const x = grouped ? Number(column >= highRatingStart) : column
    const y = grouped ? Number(row >= highRatingStart) : row
    cells[y][x] += weight
    defenseTotals[x] += weight
    resistanceTotals[y] += weight
    total += weight
  }
  return { labels, cells, defenseTotals, resistanceTotals, total, missing }
}
