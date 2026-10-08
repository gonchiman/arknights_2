import type { RawBlackboardEntry, SkillRecord } from '../types/skill.ts'
import {
  calculateAttackPipeline,
  calculateDamageBreakdown,
  getOperatorStats,
  type OperatorStats,
} from './damageCalculator.ts'
import {
  applyOperatorModule,
  getOperatorModuleId,
  getOperatorModuleLevels,
  getOperatorModules,
  isOperatorModuleUnlocked,
} from './operatorModules.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { getOperatorPotentialApplication } from './operatorPotentials.ts'
import { getSkillLevelLabel } from './skillJsonAnalysis.ts'
import { getSurtrRemnantAttackSpeedBonus } from './surtrRemnantAttackSpeed.ts'

export const SURTR_OPERATOR_ID = 'char_350_surtr'

export interface SurtrDpsSettings {
  level: number
  trust: number
  potential: number
  skillLevelIndex: number
  /** False means Surtr blocks no enemies; true means she blocks the single target. */
  blocking: boolean
  /** Apply conditional Remnant attack speed; omitted retains pre-activation DPS. */
  remnantActive?: boolean
}

export interface SurtrDpsModel {
  moduleId: string
  moduleType: 'X' | 'Y' | null
  moduleLevel: number
  skillName: string
  skillLevelIndex: number
  skillLevelLabel: string
  baseAttack: number
  skillAttackBonusPercent: number
  effectiveAttack: number
  attackInterval: number
  attackSpeed: number
  resistanceIgnore: number
  /** Fractional increase in damage, e.g. 0.1 for 10% arts fragility. */
  artsFragility: number
  remnantActive: boolean
  remnantAttackSpeedBonus: number
  operatorStats: OperatorStats
}

export interface SurtrDpsPoint {
  resistance: number
  dps: number
}

/**
 * E2 S3 single-target sustained DPS, optionally with Remnant's attack speed.
 * Module trait conditions remain independent of Remnant activation; its finite
 * forced-retreat interval never enters this sustained DPS calculation.
 */
export function deriveSurtrDpsModel(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  moduleId = '',
  moduleLevel = 3,
): SurtrDpsModel | null {
  if (record.operatorId !== SURTR_OPERATOR_ID || record.skillIndex !== 3) return null
  const profile = record.operatorProfile
  const phase = profile.phases[2]
  const maxLevel = phase?.maxLevel
  if (!isPositive(maxLevel) || !Number.isInteger(settings.level)
    || settings.level < 1 || settings.level > maxLevel
    || !isNonNegative(settings.trust) || settings.trust > 100
    || !Number.isInteger(settings.potential) || settings.potential < 1
    || !Number.isInteger(settings.skillLevelIndex) || settings.skillLevelIndex < 0
    || typeof settings.blocking !== 'boolean'
    || (settings.remnantActive !== undefined && typeof settings.remnantActive !== 'boolean')) return null
  const frames = phase.attributesKeyFrames
  if (!frames?.length || frames.some((frame) => !isPositive(frame.level)
    || !isPositive(frame.data?.atk) || !isPositive(frame.data?.attackSpeed)
    || !isPositive(frame.data?.baseAttackTime))) return null
  if (!profile.favorKeyFrames.length || profile.favorKeyFrames.some((frame) => (
    !isNonNegative(frame.level) || !isNonNegative(frame.data?.atk)
  ))) return null

  const skill = record.skillLevels[settings.skillLevelIndex]
  const skillAttackBonus = readValue(skill?.blackboard, 'atk')
  if (!skill || !isNonNegative(skillAttackBonus)) return null
  const potential = getOperatorPotentialApplication(profile, settings.potential)
  if (potential.potentialRank !== settings.potential || potential.unsupportedReasons.length) return null

  const module = moduleId ? getOperatorModules(profile).find((candidate, index) => (
    getOperatorModuleId(candidate, index) === moduleId
  )) : undefined
  if (moduleId && (!module || !Number.isInteger(moduleLevel)
    || !getOperatorModuleLevels(module).includes(moduleLevel)
    || !isOperatorModuleUnlocked(module, 2, settings.level))) return null
  const moduleType = module?.typeName2?.trim() ?? null
  if ((module && moduleType === null) || (moduleType !== null && moduleType !== 'X' && moduleType !== 'Y')) return null
  const basePassives = getOperatorPassives(profile, 2, settings.level, settings.potential)
  const moduleApplication = applyOperatorModule(basePassives, module, moduleLevel, settings.potential)
  if (module && (moduleApplication.unsupportedReasons.length
    || !moduleApplication.attributeEffects.some((effect) => effect.key === 'atk'))) return null
  const passives = moduleApplication.passives
  const resistanceIgnore = readValue(passives.sources.find((source) => (
    source.sourceKind === 'TALENT' && source.talentIndex === 0
  ))?.blackboard, 'magic_resist_penetrate_fixed')
  if (!isNonNegative(resistanceIgnore)) return null

  const trait = passives.sources.find((source) => source.sourceKind === 'TRAIT')
  const nonBlockingSpeed = moduleType === 'X' ? readValue(trait?.blackboard, 'attack_speed') : 0
  const blockedDamageScale = moduleType === 'Y' ? readValue(trait?.blackboard, 'damage_scale') : 1
  if (!isNonNegative(nonBlockingSpeed) || !isPositive(blockedDamageScale) || blockedDamageScale < 1) return null
  const remnantActive = settings.remnantActive === true
  const remnantAttackSpeedBonus = remnantActive
    ? getSurtrRemnantAttackSpeedBonus(passives, moduleType, module ? moduleApplication.moduleLevel : 0)
    : 0
  if (remnantAttackSpeedBonus === null) return null
  const stats = getOperatorStats(profile, 2, settings.level, settings.trust, {
    moduleAttack: moduleApplication.moduleAttack,
    potentialAttack: potential.potentialAttack,
    attackSpeedBonus: potential.attackSpeedBonus + moduleApplication.attackSpeedBonus
      + (settings.blocking ? 0 : nonBlockingSpeed) + remnantAttackSpeedBonus,
  })
  const attack = calculateAttackPipeline(stats.attack, { directMultiplierPercent: skillAttackBonus * 100 })
  if (!isPositive(attack.finalAttack) || !isPositive(stats.attackInterval)) return null

  return {
    moduleId,
    moduleType,
    moduleLevel: module ? moduleApplication.moduleLevel : 0,
    skillName: skill.name ?? record.skillName,
    skillLevelIndex: settings.skillLevelIndex,
    skillLevelLabel: getSkillLevelLabel(settings.skillLevelIndex, record.skillLevels.length),
    baseAttack: stats.attack,
    skillAttackBonusPercent: skillAttackBonus * 100,
    effectiveAttack: attack.finalAttack,
    attackInterval: stats.attackInterval,
    attackSpeed: stats.attackSpeed,
    resistanceIgnore,
    artsFragility: settings.blocking ? blockedDamageScale - 1 : 0,
    remnantActive,
    remnantAttackSpeedBonus,
    operatorStats: stats,
  }
}

/** Resistance is the target's value before Surtr's fixed resistance ignore. */
export function calculateSurtrDps(model: SurtrDpsModel, resistance: number): number | null {
  if (!isNonNegative(resistance) || resistance > 100
    || !isPositive(model.effectiveAttack) || !isPositive(model.attackInterval)
    || !isNonNegative(model.resistanceIgnore) || !isNonNegative(model.artsFragility)) return null
  const damage = calculateDamageBreakdown(model.effectiveAttack, 'ARTS', 0, resistance, {
    resistanceIgnoreFixed: model.resistanceIgnore,
  }).result
  const dps = damage * (1 + model.artsFragility) / model.attackInterval
  return Number.isFinite(dps) ? dps : null
}

export function buildSurtrDpsCurve(model: SurtrDpsModel): SurtrDpsPoint[] {
  const points: SurtrDpsPoint[] = []
  for (let resistance = 0; resistance <= 100; resistance += 1) {
    const dps = calculateSurtrDps(model, resistance)
    if (dps === null) return []
    points.push({ resistance, dps })
  }
  return points
}

function readValue(entries: readonly RawBlackboardEntry[] | undefined, key: string): number | undefined {
  return entries?.find((entry) => entry.key?.toLowerCase() === key)?.value
}

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
