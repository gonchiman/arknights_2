import type { SkillRecord } from '../types/skill.ts'
import {
  calculateAttackPipeline,
  calculateDamageBreakdown,
  type AttackPipelineBreakdown,
  type DamageCalculationBreakdown,
} from './damageCalculator.ts'
import {
  deriveSurtrDpsCombatModel,
  type SurtrDpsModel,
  type SurtrDpsSettings,
} from './surtrDps.ts'

export interface SurtrSkillDpsModel extends SurtrDpsModel {
  skillIndex: 2 | 3
  maximumTargets: number
  /** Applied only when the actual attack has one target. S3 has no such modifier. */
  singleTargetAttackScale: number
  /** Surtr blocks one of the targets, rather than every target in the attack. */
  blocking: boolean
}

export interface SurtrSkillDpsCalculation {
  enemyCount: number
  attackTargetCount: number
  attackScale: number
  /** Damage against one unblocked target after resistance mitigation. */
  unblockedTargetDamage: number
  /** Damage against the blocked target, including MOD Y's arts fragility. */
  blockedTargetDamage: number
  blockedTargetCount: number
  unblockedTargetCount: number
  damagePerAttack: number
  attackInterval: number
  totalDps: number
  attackPipeline: AttackPipelineBreakdown
  mitigation: DamageCalculationBreakdown
  artsFragilityMultiplier: number
}

/** Derive S2 or S3 from its own skill-level blackboard while sharing S3's reviewed combat rules. */
export function deriveSurtrSkillDpsModel(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  moduleId = '',
  moduleLevel = 3,
): SurtrSkillDpsModel | null {
  if (record.skillIndex !== 2 && record.skillIndex !== 3) return null
  const skill = record.skillLevels[settings.skillLevelIndex]
  const maximumTargets = skill?.blackboard?.find(entry => entry.key?.toLowerCase() === 'attack@max_target')?.value
  const singleTargetAttackScale = record.skillIndex === 2
    ? skill?.blackboard?.find(entry => entry.key?.toLowerCase() === 'attack@surtr_s_2[critical].atk_scale')?.value
    : 1
  if (!isPositive(maximumTargets) || !isValidMaximumTargets(record.skillIndex, maximumTargets)
    || !isPositive(singleTargetAttackScale)) return null
  const common = deriveSurtrDpsCombatModel(record, settings, moduleId, moduleLevel)
  return common ? { ...common, skillIndex: record.skillIndex, maximumTargets,
    singleTargetAttackScale, blocking: settings.blocking } : null
}

/** Sustained skill-active DPS across equal-RES targets; 4 represents four or more enemies. */
export function calculateSurtrSkillDps(
  model: SurtrSkillDpsModel,
  resistance: number,
  enemyCount: number,
): SurtrSkillDpsCalculation | null {
  if (!Number.isInteger(enemyCount) || enemyCount < 1 || enemyCount > 4
    || !isNonNegative(resistance) || resistance > 100
    || (model.skillIndex !== 2 && model.skillIndex !== 3)
    || !isValidMaximumTargets(model.skillIndex, model.maximumTargets)
    || !isPositive(model.singleTargetAttackScale)
    || typeof model.blocking !== 'boolean'
    || !isPositive(model.baseAttack) || !isNonNegative(model.skillAttackBonusPercent)
    || !isPositive(model.effectiveAttack) || !isPositive(model.attackInterval)
    || !isNonNegative(model.resistanceIgnore) || !isNonNegative(model.artsFragility)) return null

  const attackTargetCount = Math.min(enemyCount, model.maximumTargets)
  const attackScale = attackTargetCount === 1 ? model.singleTargetAttackScale : 1
  const attackPipeline = calculateAttackPipeline(model.baseAttack, {
    directMultiplierPercent: model.skillAttackBonusPercent,
    attackScale,
  })
  const mitigation = calculateDamageBreakdown(model.effectiveAttack * attackScale, 'ARTS', 0, resistance, {
    resistanceIgnoreFixed: model.resistanceIgnore,
  })
  const artsFragilityMultiplier = 1 + model.artsFragility
  const unblockedTargetDamage = mitigation.result
  const blockedTargetDamage = unblockedTargetDamage * artsFragilityMultiplier
  const blockedTargetCount = model.blocking ? 1 : 0
  const unblockedTargetCount = attackTargetCount - blockedTargetCount
  const damagePerAttack = blockedTargetDamage * blockedTargetCount + unblockedTargetDamage * unblockedTargetCount
  const totalDps = damagePerAttack / model.attackInterval
  if (![attackPipeline.finalAttack, unblockedTargetDamage, blockedTargetDamage, damagePerAttack, totalDps]
    .every(Number.isFinite)) return null

  return { enemyCount, attackTargetCount, attackScale, unblockedTargetDamage, blockedTargetDamage,
    blockedTargetCount, unblockedTargetCount, damagePerAttack, attackInterval: model.attackInterval,
    totalDps, attackPipeline, mitigation, artsFragilityMultiplier }
}

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isValidMaximumTargets(skillIndex: 2 | 3, maximumTargets: number): boolean {
  // S3 attacks at most three enemies until M2; M3 raises its cap to four.
  return skillIndex === 2 ? maximumTargets === 2 : maximumTargets === 3 || maximumTargets === 4
}

function isNonNegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
