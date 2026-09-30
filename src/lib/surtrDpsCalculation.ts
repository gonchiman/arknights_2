import {
  calculateAttackPipeline,
  calculateDamageBreakdown,
  type AttackPipelineBreakdown,
  type BaseAttackBreakdown,
  type DamageCalculationBreakdown,
} from './damageCalculator.ts'
import { calculateSurtrDps, type SurtrDpsModel } from './surtrDps.ts'

export interface SurtrDpsCalculationBreakdown {
  baseAttack: BaseAttackBreakdown
  attackPipeline: AttackPipelineBreakdown
  mitigation: DamageCalculationBreakdown
  artsFragilityMultiplier: number
  perHit: number
  baseAttackTime: number
  baseAttackSpeed: number
  attackSpeedBonus: number
  attackSpeed: number
  appliedAttackSpeed: number
  attackInterval: number
  dps: number
}

/** Numeric detail for a derived S3 model, retaining the existing DPS result and rounding. */
export function calculateSurtrDpsCalculation(
  model: SurtrDpsModel,
  resistance: number,
): SurtrDpsCalculationBreakdown | null {
  const dps = calculateSurtrDps(model, resistance)
  if (dps === null) return null

  const attackPipeline = calculateAttackPipeline(model.baseAttack, {
    directMultiplierPercent: model.skillAttackBonusPercent,
  })
  const mitigation = calculateDamageBreakdown(model.effectiveAttack, 'ARTS', 0, resistance, {
    resistanceIgnoreFixed: model.resistanceIgnore,
  })
  const artsFragilityMultiplier = 1 + model.artsFragility
  const stats = model.operatorStats

  return {
    baseAttack: { ...stats.baseAttackBreakdown },
    attackPipeline,
    mitigation,
    artsFragilityMultiplier,
    perHit: mitigation.result * artsFragilityMultiplier,
    baseAttackTime: stats.baseAttackTime,
    baseAttackSpeed: stats.baseAttackSpeed,
    attackSpeedBonus: stats.attackSpeedBonus,
    attackSpeed: model.attackSpeed,
    appliedAttackSpeed: Math.max(20, model.attackSpeed),
    attackInterval: model.attackInterval,
    dps,
  }
}
