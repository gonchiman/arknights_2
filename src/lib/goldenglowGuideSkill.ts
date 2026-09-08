import type { RawSkillLevel, SkillRecord } from '../types/skill.ts'
import { classifySkill } from './classifier.ts'
import {
  calculateAttackPipeline,
  deriveSkillModel,
  getOperatorStats,
  type AttackPipelineBreakdown,
  type BaseAttackBreakdown,
  type OperatorStats,
} from './damageCalculator.ts'
import {
  deriveGoldenglowExplosionModel,
  GOLDENGLOW_OPERATOR_ID,
  type GoldenglowExplosionModel,
} from './goldenglowExplosion.ts'
import { evaluateOperatorEffects } from './operatorEffects.ts'
import {
  applyOperatorModule,
  getOperatorModuleId,
  getOperatorModules,
  isOperatorModuleUnlocked,
  type OperatorModuleApplication,
} from './operatorModules.ts'
import { getOperatorPassives, type OperatorPassives } from './operatorProfile.ts'
import { expandSkillDescription, getSkillLevelLabel } from './skillJsonAnalysis.ts'

export interface GoldenglowGuideAttackCalculation {
  level: number
  base: BaseAttackBreakdown
  pipeline: AttackPipelineBreakdown
  skillBonusPercent: number
  passiveBonusPercent: number
}

export interface GoldenglowGuideSkill {
  skillIndex: number
  skillName: string
  skillLevelIndex: number
  skillLevelCount: number
  skillLevelLabel: string
  operatorStats: OperatorStats
  basePassives: OperatorPassives
  passives: OperatorPassives
  moduleApplication: OperatorModuleApplication
  moduleId: string
  effectiveAttack: number
  attackCalculation: GoldenglowGuideAttackCalculation
  attackInterval: number
  duration: number | null
  explosionModel: GoldenglowExplosionModel
  skillDescription: string
}

/** Guide presets use E2 maximum level, 100% trust, potential 1 and the selected module. */
export function deriveGoldenglowGuideSkills(
  records: readonly SkillRecord[],
  moduleId = '',
  moduleLevel = 3,
  skillLevelIndex?: number,
): GoldenglowGuideSkill[] {
  return records
    .filter((record) => record.operatorId === GOLDENGLOW_OPERATOR_ID)
    .flatMap((record) => {
      const result = deriveSkill(record, moduleId, moduleLevel, skillLevelIndex)
      return result ? [result] : []
    })
    .sort((a, b) => a.skillIndex - b.skillIndex)
}

function deriveSkill(
  record: SkillRecord,
  moduleId: string,
  moduleLevel: number,
  requestedSkillLevelIndex: number | undefined,
): GoldenglowGuideSkill | null {
  if (![1, 2, 3].includes(record.skillIndex)) return null
  const phase = record.operatorProfile.phases[2]
  const maxLevel = phase?.maxLevel
  if (!isPositive(maxLevel)) return null
  const maxStats = phase.attributesKeyFrames?.find((frame) => frame.level === maxLevel)?.data
  if (!maxStats || !isPositive(maxStats.atk) || !isPositive(maxStats.attackSpeed)
    || !isPositive(maxStats.baseAttackTime)) return null
  const trustFrame = record.operatorProfile.favorKeyFrames
    .filter((frame) => Number.isFinite(frame.level))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    .at(-1)
  if (!isNonNegative(trustFrame?.data?.atk)) return null

  const skillLevelIndex = requestedSkillLevelIndex ?? record.skillLevels.length - 1
  if (!Number.isInteger(skillLevelIndex) || skillLevelIndex < 0) return null
  const level = record.skillLevels[skillLevelIndex]
  if (!level || !hasUsableSkillValues(level)) return null
  const skillName = (level.name ?? record.skillName).trim()
  if (!skillName) return null
  const recordPermanent = record.classification.effectWindow.value === 'PERMANENT'
  if ((record.skillIndex === 2) !== recordPermanent) return null
  const permanent = classifySkill(level).effectWindow.value === 'PERMANENT'
  if (record.skillIndex === 2 ? !permanent : permanent || !isPositive(level.duration)) return null

  const basePassives = getOperatorPassives(record.operatorProfile, 2, maxLevel, 1)
  const module = getOperatorModules(record.operatorProfile).find((candidate, index) => (
    getOperatorModuleId(candidate, index) === moduleId
      && isOperatorModuleUnlocked(candidate, 2, maxLevel)
  ))
  const moduleApplication = applyOperatorModule(basePassives, module, moduleLevel, 1)
  const passives = moduleApplication.passives
  const resistanceIgnore = passives.sources
    .find((source) => source.sourceKind === 'TALENT' && source.talentIndex === 1)
    ?.blackboard.find((entry) => entry.key === 'magic_resist_penetrate_fixed')?.value
  if (!isNonNegative(resistanceIgnore)) return null
  const explosionModel = deriveGoldenglowExplosionModel(record.operatorId, passives, level)
  if (!explosionModel || !isPositive(explosionModel.prdStep)
    || explosionModel.prdStep > 1 || !Number.isInteger(explosionModel.prdMaxStack)) return null

  const effects = evaluateOperatorEffects(record.operatorId, passives, 'ARTS')
  const stats = getOperatorStats(record.operatorProfile, 2, maxLevel, 100, {
    moduleAttack: moduleApplication.moduleAttack,
    attackSpeedBonus: effects.modifiers.attackSpeedBonus + moduleApplication.attackSpeedBonus,
  })
  const model = deriveSkillModel(level, stats.attackInterval, stats.attackSpeed)
  const attack = calculateAttackPipeline(stats.attack, {
    directAddition: effects.modifiers.attackAddition,
    directMultiplierPercent: effects.modifiers.attackMultiplierPercent + model.directMultiplierPercent,
  })
  if (!isPositive(attack.afterFinalMultiplier) || !isPositive(model.attackInterval)) return null

  return {
    skillIndex: record.skillIndex,
    skillName,
    skillLevelIndex,
    skillLevelCount: record.skillLevels.length,
    skillLevelLabel: getSkillLevelLabel(skillLevelIndex, record.skillLevels.length),
    operatorStats: stats,
    basePassives,
    passives,
    moduleApplication,
    moduleId: module ? moduleId : '',
    effectiveAttack: attack.afterFinalMultiplier,
    attackCalculation: {
      level: maxLevel,
      base: stats.baseAttackBreakdown,
      pipeline: attack,
      skillBonusPercent: model.directMultiplierPercent,
      passiveBonusPercent: effects.modifiers.attackMultiplierPercent,
    },
    attackInterval: model.attackInterval,
    duration: permanent ? null : model.duration,
    explosionModel,
    skillDescription: expandSkillDescription(level.description ?? record.description, level.blackboard ?? [])
      .replace(/<[^>]+>/g, '')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }
}

function hasUsableSkillValues(level: RawSkillLevel): boolean {
  const values = new Map((level.blackboard ?? []).map((entry) => [entry.key?.toLowerCase(), entry.value]))
  const additionalDrones = values.get('attack@cnt')
  return isNonNegative(values.get('atk'))
    && isNonNegative(additionalDrones)
    && Number.isInteger(additionalDrones)
    && [...values.values()].every((value) => value === undefined || Number.isFinite(value))
}

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
