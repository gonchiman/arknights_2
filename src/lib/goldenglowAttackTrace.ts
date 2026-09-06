import { calculateDamageBreakdown } from './damageCalculator.ts'
import {
  calculateGoldenglowExplosionDamage,
  getGoldenglowDroneAttackScalePercent,
  getGoldenglowNextExplosionChancePercent,
  type GoldenglowExplosionModel,
} from './goldenglowExplosion.ts'

export const GOLDENGLOW_ATTACK_TRACE_LIMIT = 1000

export interface GoldenglowCycleTraceInput {
  model: GoldenglowExplosionModel
  effectiveAttack: number
  enemyResistance?: number
}

export interface GoldenglowAttackTraceInput extends GoldenglowCycleTraceInput {
  attackCount: number
}

export interface GoldenglowAttackTraceRow {
  attackNumber: number
  expectedDamage: number
  cumulativeDamage: number
  explosionChancePercent: number
}

export interface GoldenglowCycleTraceRow {
  attackNumber: number
  reachProbability: number
  expectedNormalDamage: number
  expectedExplosionDamage: number
  expectedDamage: number
  cumulativeExpectedAttacks: number
  cumulativeExpectedDamage: number
}

/**
 * Explains one drone's successive attacks using the current calculator model:
 * an explosion resets both the PRD misses and the normal-attack multiplier.
 * Each row represents one full attack opportunity; callers apply the finite
 * window's fractional weight to its final row when needed.
 */
export function buildGoldenglowAttackTrace({
  model,
  effectiveAttack,
  attackCount,
  enemyResistance = 0,
}: GoldenglowAttackTraceInput): GoldenglowAttackTraceRow[] {
  const count = Math.min(
    GOLDENGLOW_ATTACK_TRACE_LIMIT,
    Math.floor(finiteNonNegative(attackCount)),
  )
  if (count === 0) return []

  const { statesByMisses, explosionDamage } = createTraceStates({
    model,
    effectiveAttack,
    enemyResistance,
  })
  const maximumMisses = statesByMisses.length - 1
  let probabilities: number[] = statesByMisses.map((_, misses) => misses === 0 ? 1 : 0)
  let cumulativeDamage = 0
  const rows: GoldenglowAttackTraceRow[] = []

  for (let attackNumber = 1; attackNumber <= count; attackNumber += 1) {
    const nextProbabilities = statesByMisses.map(() => 0)
    let expectedDamage = 0
    let explosionProbability = 0

    statesByMisses.forEach((state, misses) => {
      const explosionMass = probabilities[misses] * state.explosionProbability
      const normalMass = probabilities[misses] * (1 - state.explosionProbability)
      expectedDamage += normalMass * state.normalDamage + explosionMass * explosionDamage
      explosionProbability += explosionMass
      nextProbabilities[0] += explosionMass
      if (normalMass > 0) {
        nextProbabilities[Math.min(misses + 1, maximumMisses)] += normalMass
      }
    })

    cumulativeDamage += expectedDamage
    rows.push({
      attackNumber,
      expectedDamage,
      cumulativeDamage,
      explosionChancePercent: explosionProbability * 100,
    })
    probabilities = nextProbabilities
  }

  return rows
}

/**
 * Traces a single renewal cycle, ending at its first explosion. Damage in each
 * row already includes the probability of reaching that attack without an
 * earlier explosion, so summing rows gives one cycle's expected reward.
 */
export function buildGoldenglowCycleTrace(
  input: GoldenglowCycleTraceInput,
): GoldenglowCycleTraceRow[] {
  const { statesByMisses, explosionDamage } = createTraceStates(input)
  const rows: GoldenglowCycleTraceRow[] = []
  let reachProbability = 1
  let cumulativeExpectedAttacks = 0
  let cumulativeExpectedDamage = 0

  for (const [misses, state] of statesByMisses.entries()) {
    const explosionMass = reachProbability * state.explosionProbability
    const normalMass = reachProbability * (1 - state.explosionProbability)
    const expectedNormalDamage = normalMass * state.normalDamage
    const expectedExplosionDamage = explosionMass * explosionDamage
    const expectedDamage = expectedNormalDamage + expectedExplosionDamage
    cumulativeExpectedAttacks += reachProbability
    cumulativeExpectedDamage += expectedDamage
    rows.push({
      attackNumber: misses + 1,
      reachProbability,
      expectedNormalDamage,
      expectedExplosionDamage,
      expectedDamage,
      cumulativeExpectedAttacks,
      cumulativeExpectedDamage,
    })
    reachProbability = normalMass
    if (reachProbability === 0) break
  }

  return rows
}

function createTraceStates({
  model,
  effectiveAttack,
  enemyResistance = 0,
}: GoldenglowCycleTraceInput) {
  const attack = finiteNonNegative(effectiveAttack)
  const resistance = finiteNonNegative(enemyResistance)
  const maximumMisses = Math.max(1, Math.floor(model.prdMaxStack))
  const explosionDamage = calculateGoldenglowExplosionDamage(
    attack,
    0,
    resistance,
    model,
  ).damageAfterMitigation
  const statesByMisses = Array.from({ length: maximumMisses + 1 }, (_, misses) => ({
    explosionProbability: getGoldenglowNextExplosionChancePercent(misses, model) / 100,
    normalDamage: calculateDamageBreakdown(
      attack * getGoldenglowDroneAttackScalePercent(misses + 1, model) / 100,
      'ARTS',
      0,
      resistance,
      { resistanceIgnoreFixed: finiteNonNegative(model.resistanceIgnoreFixed) },
    ).result,
  }))
  return { statesByMisses, explosionDamage }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
