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

export function buildEnemyDefenseResistanceBands(
  rows: readonly EnemyRecord[],
  counts: EnemyHistogramCounts,
): { total: number; bands: EnemyDefenseResistanceBand[] } {
  const eligible = rows.filter(({ stats }) => Number.isFinite(stats.defense) && Number.isFinite(stats.magicResistance))
  const defense = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(eligible, ({ stats }) => stats.defense, 'SPAWNS', counts))
  const resistance = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(eligible, ({ stats }) => stats.magicResistance, 'SPAWNS', counts))
  if (defense.length === 0 || resistance.length === 0) return { total: 0, bands: [] }

  const bands: EnemyDefenseResistanceBand[] = []
  for (let from = 0; from < 100; from += 10) {
    const to = from + 10
    bands.push({ from, to, defense: rangeForBand(defense, from, to), resistance: rangeForBand(resistance, from, to) })
  }
  return { total: defense[defense.length - 1].cumulativeCount, bands }
}

function rangeForBand(points: readonly EmpiricalCdfPoint[], from: number, to: number): StatRange {
  // Convert the band's boundaries to ascending cumulative proportions.
  // Include a value only when its cumulative interval overlaps the band with positive weight.
  const lower = (100 - to) / 100
  const upper = (100 - from) / 100
  // Expected spawn frequencies can have fractional weights. Allow for floating-point
  // addition when a cumulative proportion lands on a boundary.
  const tolerance = Number.EPSILON * 4
  const minimum = to === 100 ? points[0] : points.find(({ proportion }) => proportion > lower + tolerance)!
  const maximum = from === 0 ? points[points.length - 1] : points.find(({ proportion }) => proportion >= upper - tolerance)!
  return { min: minimum.value, max: maximum.value }
}
