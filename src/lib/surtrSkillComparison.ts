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

/** Buffs received while both compared skills are active; percentages use 150 for +150%. */
export interface SurtrSkillExternalBuffs {
  attackPercent: number
  /** Final ATK addition, applied after additive ATK percentages and before flooring. */
  attackAddition: number
  attackSpeed: number
}

export const DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS: Readonly<SurtrSkillExternalBuffs> = Object.freeze({
  attackPercent: 0, attackAddition: 0, attackSpeed: 0,
})

export function isValidSurtrSkillExternalBuffs(value: unknown): value is SurtrSkillExternalBuffs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const buffs = value as Partial<SurtrSkillExternalBuffs>
  return isNonNegative(buffs.attackPercent) && isNonNegative(buffs.attackAddition) && isNonNegative(buffs.attackSpeed)
}

export function getSurtrSkillExternalBuffLabel(buffs: SurtrSkillExternalBuffs): string {
  if (!isValidSurtrSkillExternalBuffs(buffs)
    || (buffs.attackPercent === 0 && buffs.attackAddition === 0 && buffs.attackSpeed === 0)) return ''
  return `外部バフ：攻撃力+${buffs.attackPercent}%・固定加算+${buffs.attackAddition}・攻撃速度+${buffs.attackSpeed}`
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
  /** Floored ATK after skill and external buffs, before the S2 single-target scale. */
  effectiveAttack: number
  attackSpeed: number
  attackInterval: number
  externalBuffs: SurtrSkillExternalBuffs
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
  externalBuffs: SurtrSkillExternalBuffs = DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS,
): SurtrSkillDpsCalculation | null {
  if (!Number.isInteger(enemyCount) || enemyCount < 1 || enemyCount > 4
    || !isNonNegative(resistance) || resistance > 100
    || (model.skillIndex !== 2 && model.skillIndex !== 3)
    || !isValidMaximumTargets(model.skillIndex, model.maximumTargets)
    || !isPositive(model.singleTargetAttackScale)
    || typeof model.blocking !== 'boolean'
    || !isPositive(model.baseAttack) || !isNonNegative(model.skillAttackBonusPercent)
    || !isPositive(model.effectiveAttack) || !isPositive(model.attackInterval)
    || !isPositive(model.attackSpeed) || !isPositive(model.operatorStats?.baseAttackTime)
    || !isValidSurtrSkillExternalBuffs(externalBuffs)
    || !isNonNegative(model.resistanceIgnore) || !isNonNegative(model.artsFragility)) return null

  const attackTargetCount = Math.min(enemyCount, model.maximumTargets)
  const attackScale = attackTargetCount === 1 ? model.singleTargetAttackScale : 1
  const attackPipeline = calculateAttackPipeline(model.baseAttack, {
    directMultiplierPercent: model.skillAttackBonusPercent + externalBuffs.attackPercent,
    finalAddition: externalBuffs.attackAddition,
    attackScale,
  })
  const effectiveAttack = attackPipeline.afterFinalMultiplier
  const attackSpeed = model.attackSpeed + externalBuffs.attackSpeed
  // Match getOperatorStats: module, potential and Remnant speed are already in the model.
  const attackInterval = model.operatorStats.baseAttackTime * 100 / Math.max(20, attackSpeed)
  const mitigation = calculateDamageBreakdown(attackPipeline.finalAttack, 'ARTS', 0, resistance, {
    resistanceIgnoreFixed: model.resistanceIgnore,
  })
  const artsFragilityMultiplier = 1 + model.artsFragility
  const unblockedTargetDamage = mitigation.result
  const blockedTargetDamage = unblockedTargetDamage * artsFragilityMultiplier
  const blockedTargetCount = model.blocking ? 1 : 0
  const unblockedTargetCount = attackTargetCount - blockedTargetCount
  const damagePerAttack = blockedTargetDamage * blockedTargetCount + unblockedTargetDamage * unblockedTargetCount
  const totalDps = damagePerAttack / attackInterval
  if (![model.skillAttackBonusPercent + externalBuffs.attackPercent, attackSpeed,
    attackPipeline.finalAttack, unblockedTargetDamage, blockedTargetDamage, damagePerAttack, totalDps]
    .every(Number.isFinite) || !isPositive(attackInterval)) return null

  return { enemyCount, attackTargetCount, attackScale, unblockedTargetDamage, blockedTargetDamage,
    blockedTargetCount, unblockedTargetCount, damagePerAttack, effectiveAttack, attackSpeed, attackInterval,
    externalBuffs: { ...externalBuffs },
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
