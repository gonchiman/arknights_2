import type { EnemyRecord } from '../types/enemy.ts'
import { getEnemyRatingNumericRanges } from './enemyStatRatings.ts'
import type { EnemyHistogramCountMode, EnemyHistogramCounts } from './enemyHistogramCounts.ts'

export interface EnemyJointBin {
  key: string
  label: string
  rangeLabel: string
}

export interface EnemyJointCell {
  hpIndex: number
  resistanceIndex: number
  count: number
  proportion: number
  enemies: readonly EnemyRecord[]
  enemyCounts: Readonly<Record<string, number>>
}

export interface EnemyJointDistribution {
  countMode: EnemyHistogramCountMode
  hpBins: readonly EnemyJointBin[]
  resistanceBins: readonly EnemyJointBin[]
  cells: readonly (readonly EnemyJointCell[])[]
  hpTotals: readonly number[]
  resistanceTotals: readonly number[]
  count: number
  missingCount: number
  maximumCount: number
}

// Keep the established HP boundaries through A+, then combine S, S+ and SS.
const HP_RANGES = getEnemyRatingNumericRanges('maxHp').slice(0, 8).map((range) => (
  range.rating === 'S'
    ? { ...range, upperBound: null, label: '100,000 以上' }
    : range
))

const RESISTANCE_RANGES = [
  { key: 'zero', label: '0', rangeLabel: '0', upperBound: 0 },
  { key: 'under-20', label: '1–19', rangeLabel: '0 超 20 未満', upperBound: 20 },
  { key: 'under-40', label: '20–39', rangeLabel: '20 以上 40 未満', upperBound: 40 },
  { key: 'under-60', label: '40–59', rangeLabel: '40 以上 60 未満', upperBound: 60 },
  { key: 'under-80', label: '60–79', rangeLabel: '60 以上 80 未満', upperBound: 80 },
  { key: 'under-100', label: '80–99', rangeLabel: '80 以上 100 未満', upperBound: 100 },
  { key: '100-and-above', label: '100以上', rangeLabel: '100 以上', upperBound: null },
] as const

export function buildEnemyJointDistribution(
  rows: readonly EnemyRecord[],
  countMode: EnemyHistogramCountMode = 'TYPES',
  counts: EnemyHistogramCounts | null = null,
): EnemyJointDistribution {
  const hpBins: EnemyJointBin[] = HP_RANGES.map((range, index) => ({
    key: range.rating,
    label: range.rating === 'S' ? 'S以上' : range.rating,
    rangeLabel: index === 0 ? `0 超 ${range.label}` : range.label,
  }))
  const resistanceBins: EnemyJointBin[] = RESISTANCE_RANGES.map(({ key, label, rangeLabel }) => ({
    key, label, rangeLabel,
  }))
  const cells = resistanceBins.map((_, resistanceIndex) => hpBins.map((_, hpIndex) => ({
    hpIndex, resistanceIndex, count: 0, proportion: 0, enemies: [] as EnemyRecord[],
    enemyCounts: Object.create(null) as Record<string, number>,
  })))
  const hpTotals = hpBins.map(() => 0)
  const resistanceTotals = resistanceBins.map(() => 0)
  const seen = new Set<string>()
  let count = 0
  let missingCount = 0
  let maximumCount = 0

  for (const enemy of rows) {
    if (seen.has(enemy.id)) continue
    seen.add(enemy.id)

    const weight = countMode === 'TYPES' ? 1
      : counts?.enemies[enemy.id]?.[countMode === 'MAPS' ? 'mapCount' : 'spawnCount'] ?? 0
    if (!Number.isFinite(weight) || weight <= 0) continue

    const hp = enemy.stats.maxHp
    const resistance = enemy.stats.magicResistance
    if (hp === null || !Number.isFinite(hp) || hp <= 0
      || resistance === null || !Number.isFinite(resistance) || resistance < 0) {
      missingCount += weight
      continue
    }

    const hpIndex = HP_RANGES.findIndex(({ upperBound, upperInclusive }) => (
      upperBound === null || (upperInclusive ? hp <= upperBound : hp < upperBound)
    ))
    const resistanceIndex = resistance === 0 ? 0 : RESISTANCE_RANGES.findIndex(({ upperBound }) => (
      upperBound === null || resistance < upperBound
    ))
    const cell = cells[resistanceIndex][hpIndex]
    cell.enemies.push(enemy)
    cell.enemyCounts[enemy.id] = weight
    cell.count += weight
    hpTotals[hpIndex] += weight
    resistanceTotals[resistanceIndex] += weight
    count += weight
    maximumCount = Math.max(maximumCount, cell.count)
  }

  for (const row of cells) {
    for (const cell of row) cell.proportion = count > 0 ? cell.count / count : 0
  }

  return { countMode, hpBins, resistanceBins, cells, hpTotals, resistanceTotals, count, missingCount, maximumCount }
}
