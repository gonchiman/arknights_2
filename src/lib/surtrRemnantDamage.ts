import type { SurtrDpsModel } from './surtrDps.ts'
import { calculateSurtrDpsCalculation } from './surtrDpsCalculation.ts'
import {
  calculateSurtrRemnantAttacks,
  type SurtrRemnantAttackAssumptions,
  type SurtrRemnantAttackModel,
} from './surtrRemnantAttacks.ts'

export interface SurtrRemnantDamageResult {
  totalDamage: number
  perHit: number
  hitCount: number
}

export interface SurtrRemnantDamagePoint {
  remainingCt: number
  enemyResistance: number
  value: number | null
  hitCount: number | null
  perHit: number | null
}

/**
 * Single-target S3 damage with fixed target resistance and blocking conditions.
 * The caller derives both models from the same settings; their shared module
 * identity and pre-Remnant attack timing must agree. Remnant changes the hit
 * schedule, while the existing S3 calculation supplies each hit's damage.
 */
export function calculateSurtrRemnantDamage(
  dpsModel: SurtrDpsModel,
  attackModel: SurtrRemnantAttackModel,
  remainingCt: number,
  resistance: number,
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantDamageResult | null {
  if (!matchingModels(dpsModel, attackModel)) return null
  const damage = calculateSurtrDpsCalculation(dpsModel, resistance)
  const attacks = calculateSurtrRemnantAttacks(attackModel, remainingCt, assumptions)
  if (!damage || !attacks) return null
  const totalDamage = damage.perHit * attacks.hitCount
  if (!Number.isFinite(totalDamage)) return null
  return { totalDamage, perHit: damage.perHit, hitCount: attacks.hitCount }
}

/** Preserve input order and invalid combinations in a CT-by-resistance grid. */
export function buildSurtrRemnantDamagePoints(
  dpsModel: SurtrDpsModel,
  attackModel: SurtrRemnantAttackModel,
  cts: readonly number[],
  resistances: readonly number[],
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantDamagePoint[] {
  return cts.flatMap(remainingCt => resistances.map(enemyResistance => {
    const result = calculateSurtrRemnantDamage(dpsModel, attackModel, remainingCt, enemyResistance, assumptions)
    return {
      remainingCt,
      enemyResistance,
      value: result?.totalDamage ?? null,
      hitCount: result?.hitCount ?? null,
      perHit: result?.perHit ?? null,
    }
  }))
}

function matchingModels(dps: SurtrDpsModel, attacks: SurtrRemnantAttackModel): boolean {
  return dps.moduleId === attacks.moduleId && dps.moduleType === attacks.moduleType
    && dps.moduleLevel === attacks.moduleLevel
    && sameNumber(dps.attackInterval, attacks.attackIntervalBefore)
    && sameNumber(dps.attackSpeed, attacks.attackSpeedBefore)
}

function sameNumber(first: number, second: number): boolean {
  return Number.isFinite(first) && Number.isFinite(second)
    && Math.abs(first - second) <= Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 8
}
