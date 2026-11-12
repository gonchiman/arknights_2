import type { EnemyRecord } from '../types/enemy.ts'
import { buildEnemyHistogramObservations, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import type { EmpiricalCdfPoint } from './enemyStatistics.ts'
import { calculateWeightedEmpiricalCdf } from './enemyWeightedEcdf.ts'

interface StatRange {
  min: number
  max: number
}

export interface EnemyDefenseResistanceBand {
  from: number
  to: number
  defense: StatRange
  resistance: StatRange
}

export interface EnemyDefenseResistanceRank {
  percentage: number
  defense: number
  resistance: number
}

export interface EnemyResistanceThreshold {
  resistance: number
  percentage: number
  defense: number | null
}

export function buildEnemyDefenseResistanceBands(
  rows: readonly EnemyRecord[],
  counts: EnemyHistogramCounts,
): {
  total: number
  bands: EnemyDefenseResistanceBand[]
  resistanceThresholds: EnemyResistanceThreshold[]
  getRank: (percentage: number) => EnemyDefenseResistanceRank | null
} {
  const eligible = rows.filter(({ stats }) => Number.isFinite(stats.defense) && Number.isFinite(stats.magicResistance))
  const defense = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(eligible, ({ stats }) => stats.defense, 'SPAWNS', counts))
  const resistance = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(eligible, ({ stats }) => stats.magicResistance, 'SPAWNS', counts))
  if (defense.length === 0 || resistance.length === 0) {
    return { total: 0, bands: [], resistanceThresholds: [], getRank: () => null }
  }

  const bands: EnemyDefenseResistanceBand[] = []
  for (let from = 0; from < 100; from += 10) {
    const to = from + 10
    bands.push({ from, to, defense: rangeForBand(defense, from, to), resistance: rangeForBand(resistance, from, to) })
  }
  const resistanceTotal = resistance[resistance.length - 1].cumulativeCount
  const resistanceThresholds = Array.from({ length: 11 }, (_, index) => {
    const threshold = index * 10
    const count = resistance.reduce((sum, point) => point.value >= threshold ? sum + point.count : sum, 0)
    const percentage = count / resistanceTotal * 100
    return { resistance: threshold, percentage, defense: count > 0 ? valueAtUpperRank(defense, percentage) : null }
  })
  return {
    total: defense[defense.length - 1].cumulativeCount,
    bands,
    resistanceThresholds,
    getRank(percentage) {
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null
      return {
        percentage,
        defense: valueAtUpperRank(defense, percentage),
        resistance: valueAtUpperRank(resistance, percentage),
      }
    },
  }
}

// Expected spawn frequencies can be fractional, so allow for rounding at a boundary.
const RANK_TOLERANCE = Number.EPSILON * 4

function valueAtUpperRank(points: readonly EmpiricalCdfPoint[], percentage: number): number {
  if (percentage === 100) return points[0].value
  const lower = (100 - percentage) / 100
  // With an exact tie at the cutoff, use the last value within the upper share.
  return (points.find(({ proportion }) => proportion > lower + RANK_TOLERANCE) ?? points[points.length - 1]).value
}

function rangeForBand(points: readonly EmpiricalCdfPoint[], from: number, to: number): StatRange {
  // Convert the band's boundaries to ascending cumulative proportions.
  // Include a value only when its cumulative interval overlaps the band with positive weight.
  const upper = (100 - from) / 100
  const maximum = from === 0 ? points[points.length - 1] : points.find(({ proportion }) => proportion >= upper - RANK_TOLERANCE)!
  return { min: valueAtUpperRank(points, to), max: maximum.value }
}
