import type { SurtrDpsModel } from './surtrDps.ts'
import type { SurtrRemnantAttackAssumptions, SurtrRemnantAttackModel } from './surtrRemnantAttacks.ts'
import { buildSurtrRemnantCountIntervals, type SurtrRemnantCountInterval } from './surtrRemnantChart.ts'
import { calculateSurtrRemnantDamage } from './surtrRemnantDamage.ts'

export interface SurtrRemnantHitCountProbability {
  hitCount: number
  probability: number
  contribution: number
  ctRanges: SurtrRemnantCountInterval[]
}

export interface SurtrRemnantAttackExpectation {
  expectedHitCount: number
  remainingCtLimit: number
  probabilities: SurtrRemnantHitCountProbability[]
}

export interface SurtrRemnantExpectedDamageResult {
  expectedHitCount: number
  perHit: number
  totalDamage: number
}

export interface SurtrRemnantExpectedDamagePoint {
  x: number
  value: number | null
  expectedHitCount: number | null
  perHit: number | null
}

/**
 * Uniform continuous CT over this model's entire pre-activation interval.
 * Weight the chart's analytical count ranges, without decimal CT samples or
 * rounding. Isolated endpoints have zero probability in this distribution.
 * This retains the chart's theoretical boundaries, rather than integrating the
 * calculator's numerical same-time tolerance as a finite probability window.
 */
export function calculateSurtrRemnantAttackExpectation(
  model: SurtrRemnantAttackModel,
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantAttackExpectation | null {
  const intervals = buildSurtrRemnantCountIntervals(model, assumptions)
  if (!intervals.length) return null
  const remainingCtLimit = model.attackIntervalBefore
  const grouped = new Map<number, SurtrRemnantHitCountProbability>()
  let coveredTo = 0
  for (const interval of intervals) {
    if (interval.from !== coveredTo || !Number.isFinite(interval.to)
      || interval.to <= interval.from || interval.to > remainingCtLimit
      || !Number.isSafeInteger(interval.count) || interval.count < 0) return null
    // Normalize the width before multiplying by a count, avoiding overflow for
    // large but valid intervals even when the expected count itself is small.
    const probability = (interval.to - interval.from) / remainingCtLimit
    if (!Number.isFinite(probability) || probability < 0) return null
    const entry = grouped.get(interval.count) ?? {
      hitCount: interval.count, probability: 0, contribution: 0, ctRanges: [],
    }
    entry.probability += probability
    entry.ctRanges.push(interval)
    grouped.set(interval.count, entry)
    coveredTo = interval.to
  }
  if (coveredTo !== remainingCtLimit) return null
  const probabilities = [...grouped.values()].sort((first, second) => first.hitCount - second.hitCount)
  let expectedHitCount = 0
  for (const entry of probabilities) {
    entry.contribution = entry.hitCount * entry.probability
    expectedHitCount += entry.contribution
  }
  if (!Number.isFinite(expectedHitCount)) return null
  return { expectedHitCount, remainingCtLimit, probabilities }
}

/** Fixed single-target damage per hit, averaged over the same uniform CT. */
export function calculateSurtrRemnantExpectedDamage(
  dpsModel: SurtrDpsModel,
  attackModel: SurtrRemnantAttackModel,
  resistance: number,
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantExpectedDamageResult | null {
  return expectedDamage(
    dpsModel, attackModel, resistance, assumptions,
    calculateSurtrRemnantAttackExpectation(attackModel, assumptions),
  )
}

/** Preserve resistance order and invalid points; a valid zero remains zero. */
export function buildSurtrRemnantExpectedDamagePoints(
  dpsModel: SurtrDpsModel,
  attackModel: SurtrRemnantAttackModel,
  resistances: readonly number[],
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantExpectedDamagePoint[] {
  const expectation = calculateSurtrRemnantAttackExpectation(attackModel, assumptions)
  return resistances.map(x => {
    const result = expectedDamage(dpsModel, attackModel, x, assumptions, expectation)
    return {
      x,
      value: result?.totalDamage ?? null,
      expectedHitCount: result?.expectedHitCount ?? null,
      perHit: result?.perHit ?? null,
    }
  })
}

function expectedDamage(
  dpsModel: SurtrDpsModel,
  attackModel: SurtrRemnantAttackModel,
  resistance: number,
  assumptions: SurtrRemnantAttackAssumptions,
  expectation: SurtrRemnantAttackExpectation | null,
): SurtrRemnantExpectedDamageResult | null {
  if (!expectation) return null
  // Reuse model matching, resistance validation and per-hit damage. CT zero is
  // only a validation/per-hit reference; its integer count is not the average.
  const reference = calculateSurtrRemnantDamage(dpsModel, attackModel, 0, resistance, assumptions)
  if (!reference) return null
  const totalDamage = reference.perHit * expectation.expectedHitCount
  if (!Number.isFinite(totalDamage)) return null
  return { expectedHitCount: expectation.expectedHitCount, perHit: reference.perHit, totalDamage }
}
