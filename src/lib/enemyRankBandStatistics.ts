import type { EnemyRecord } from '../types/enemy.ts'
import { buildEnemyHistogramObservations, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import type { EmpiricalCdfPoint } from './enemyStatistics.ts'
import { calculateWeightedEmpiricalCdf } from './enemyWeightedEcdf.ts'
import { calculateWeightedHistogram, type WeightedHistogramObservation } from './enemyWeightedHistogram.ts'

export type EnemyRankBandMetric = 'width' | 'mean' | 'standardDeviation' | 'variance'

export interface EnemyRankBandStatValues {
  min: number
  max: number
  width: number
  mean: number
  variance: number
  standardDeviation: number
}

export interface EnemyRankBandStatistics {
  from: number
  to: number
  weight: number
  defense: EnemyRankBandStatValues
  resistance: EnemyRankBandStatValues
}

export interface EnemyStandardizedRankBandStatistics {
  from: number
  to: number
  weight: number
  defense: EnemyRankBandStatValues | null
  resistance: EnemyRankBandStatValues | null
}

// Match the existing rank-range calculation when a fractional frequency lands
// on a cutoff after floating point rounding.
const RANK_TOLERANCE = Number.EPSILON * 4

export function buildEnemyRankBandStatistics(
  rows: readonly EnemyRecord[],
  counts: EnemyHistogramCounts,
  step: 5 | 10 | 20 = 10,
): { total: number; bands: EnemyRankBandStatistics[] } {
  if (step !== 5 && step !== 10 && step !== 20) throw new RangeError('順位の刻みは5・10・20ポイントで指定してください。')
  const eligible = rows.filter(({ stats }) => Number.isFinite(stats.defense) && Number.isFinite(stats.magicResistance))
  const defense = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(eligible, ({ stats }) => stats.defense, 'SPAWNS', counts))
  const resistance = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(eligible, ({ stats }) => stats.magicResistance, 'SPAWNS', counts))
  const total = defense.at(-1)?.cumulativeCount ?? 0
  if (!Number.isFinite(total) || total <= 0 || resistance.length === 0) return { total: 0, bands: [] }

  const bands: EnemyRankBandStatistics[] = []
  for (let from = 0; from < 100; from += step) {
    const to = from + step
    bands.push({
      from, to, weight: total * step / 100,
      defense: statisticsForBand(defense, total, from, to),
      resistance: statisticsForBand(resistance, total, from, to),
    })
  }
  return { total, bands }
}

/** Standardize against each complete weighted distribution, never within a band. */
export function buildStandardizedEnemyRankBandStatistics(
  rows: readonly EnemyRecord[],
  counts: EnemyHistogramCounts,
  step: 5 | 10 | 20 = 10,
): { total: number; bands: EnemyStandardizedRankBandStatistics[] } {
  const raw = buildEnemyRankBandStatistics(rows, counts, step)
  if (raw.bands.length === 0) return { total: raw.total, bands: [] }
  const eligible = rows.filter(({ stats }) => Number.isFinite(stats.defense) && Number.isFinite(stats.magicResistance))
  const reference = (value: (enemy: EnemyRecord) => number | null) => {
    const statistics = calculateWeightedHistogram(buildEnemyHistogramObservations(eligible, value, 'SPAWNS', counts))
    const mean = statistics.mean
    const standardDeviation = statistics.standardDeviation
    // Equal values must remain undefined even if a weighted mean rounds a
    // fraction away from that common value and leaves a tiny nonzero variance.
    return statistics.minimum === statistics.maximum || mean === null || !Number.isFinite(mean)
      || standardDeviation === null || !Number.isFinite(standardDeviation) || standardDeviation <= 0
      ? null : { mean, standardDeviation }
  }
  const defense = reference(({ stats }) => stats.defense)
  const resistance = reference(({ stats }) => stats.magicResistance)
  return {
    total: raw.total,
    bands: raw.bands.map(band => ({
      from: band.from, to: band.to, weight: band.weight,
      defense: standardizeBand(band.defense, defense),
      resistance: standardizeBand(band.resistance, resistance),
    })),
  }
}

function standardizeBand(values: EnemyRankBandStatValues,
  reference: { mean: number; standardDeviation: number } | null): EnemyRankBandStatValues | null {
  if (reference === null) return null
  const { mean, standardDeviation } = reference
  return {
    min: (values.min - mean) / standardDeviation,
    max: (values.max - mean) / standardDeviation,
    width: values.width / standardDeviation,
    mean: (values.mean - mean) / standardDeviation,
    variance: values.variance / standardDeviation ** 2,
    standardDeviation: values.standardDeviation / standardDeviation,
  }
}

function statisticsForBand(
  points: readonly EmpiricalCdfPoint[], total: number, from: number, to: number,
): EnemyRankBandStatValues {
  const lower = total * ((100 - to) / 100)
  const upper = total * ((100 - from) / 100)
  const tolerance = total * RANK_TOLERANCE
  const observations: WeightedHistogramObservation[] = []
  let previous = 0
  for (const point of points) {
    // Only the overlap belongs to this band. A tied value may span several
    // bands, but its full frequency must not be copied into each of them.
    const weight = Math.min(point.cumulativeCount, upper) - Math.max(previous, lower)
    if (weight > tolerance) observations.push({ value: point.value, weight })
    previous = point.cumulativeCount
  }

  const min = observations[0].value as number
  const max = observations[observations.length - 1].value as number
  if (min === max) return { min, max, width: 0, mean: min, variance: 0, standardDeviation: 0 }
  const statistics = calculateWeightedHistogram(observations)
  const standardDeviation = statistics.standardDeviation!
  return {
    min, max, width: max - min, mean: statistics.mean!,
    variance: standardDeviation ** 2, standardDeviation,
  }
}
