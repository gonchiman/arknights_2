import type { RawBlackboardCollection, SkillRecord } from '../types/skill.ts'
import {
  getReviewedSurtrXEffects, getReviewedSurtrYEffects, SURTR_X_MODULE_ID, SURTR_Y_MODULE_ID,
} from './moduleEffectStructure.ts'
import { applyOperatorModule, getOperatorModules, isOperatorModuleUnlocked } from './operatorModules.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { getSurtrRemnantAttackSpeedBonus } from './surtrRemnantAttackSpeed.ts'

export const DAMAGE_CALCULATOR_THREE_SURTR_X_ID = SURTR_X_MODULE_ID
export const DAMAGE_CALCULATOR_THREE_SURTR_Y_ID = SURTR_Y_MODULE_ID
export const DAMAGE_CALCULATOR_THREE_SURTR_MODULE_SKILL_LEVEL_INDEX = 9
const MODULE_LEVELS = [1, 2, 3] as const
const REMNANT_INTERVAL = 'surtr_t_2[withdraw].interval'
const REMNANT_SPEED = 'surtr_t_2[withdraw].attack_speed'

export interface DamageCalculatorThreeModuleSelection {
  id: string
  level: typeof MODULE_LEVELS[number]
}

function isDamageCalculatorThreeSurtrModuleSkill(skill: SkillRecord): boolean {
  return skill.operatorId === 'char_350_surtr' && skill.skillId === 'skchr_surtr_3' && skill.skillIndex === 3
}

export function getDamageCalculatorThreeSurtrModuleLevels(
  skill: SkillRecord, phaseIndex: number, operatorLevel: number, moduleId: string,
) {
  return MODULE_LEVELS.filter(level => resolveDamageCalculatorThreeSurtrModule(skill, phaseIndex, operatorLevel, {
    id: moduleId, level,
  }) !== null)
}

function numericEntries(blackboard: RawBlackboardCollection | undefined) {
  return Array.isArray(blackboard)
    ? blackboard.map(({ key, value }) => [key, value] as const)
    : Object.entries(blackboard ?? {})
}

/** Resolve the exact verified stage at potential 1. Unknown additional mechanics invalidate the result. */
export function resolveDamageCalculatorThreeSurtrModule(
  skill: SkillRecord,
  phaseIndex: number,
  operatorLevel: number,
  selection: DamageCalculatorThreeModuleSelection,
) {
  const type = selection.id === SURTR_X_MODULE_ID ? 'X' : selection.id === SURTR_Y_MODULE_ID ? 'Y' : null
  if (!type || !isDamageCalculatorThreeSurtrModuleSkill(skill) || !skill.skillLevels[DAMAGE_CALCULATOR_THREE_SURTR_MODULE_SKILL_LEVEL_INDEX]
    || !MODULE_LEVELS.includes(selection.level)
    || phaseIndex !== 2 || !Number.isInteger(operatorLevel)
    || operatorLevel < 1 || operatorLevel > (skill.operatorProfile.phases[2]?.maxLevel ?? 0)) return null
  const profile = skill.operatorProfile
  const module = getOperatorModules(profile).find(candidate => candidate.uniEquipId === selection.id)
  if (!module || module.typeName2 !== type || module.unlockEvolvePhase !== 'PHASE_2'
    || !Number.isInteger(module.unlockLevel) || module.unlockLevel! < 1
    || !isOperatorModuleUnlocked(module, phaseIndex, operatorLevel)) return null
  const stages = module.phases?.filter((phase, index) => (phase.equipLevel ?? index + 1) === selection.level)
  if (stages?.length !== 1 || stages[0].equipLevel !== selection.level) return null
  const { attributeBlackboard, parts = [] } = stages[0]
  const attributes = numericEntries(attributeBlackboard)
  const secondaryAttribute = type === 'X' ? 'magic_resistance' : 'def'
  if (!attributes.some(([key]) => key === 'atk') || new Set(attributes.map(([key]) => key)).size !== attributes.length
    || attributes.some(([key, value]) => (key !== 'atk' && key !== secondaryAttribute)
      || typeof value !== 'number' || !Number.isFinite(value))) return null
  if (!Array.isArray(parts)) return null
  const isActive = (candidate: { requiredPotentialRank?: number }) => (candidate.requiredPotentialRank ?? 0) === 0
  const traitCandidates = parts.flatMap(part => part.overrideTraitDataBundle?.candidates ?? []).filter(isActive)
  const talentCandidates = parts.flatMap(part => part.addOrOverrideTalentDataBundle?.candidates ?? []).filter(isActive)
  const expectedTalentKeys = type === 'X' ? ['magic_resist_penetrate_fixed'] : [REMNANT_INTERVAL, REMNANT_SPEED]
  if (traitCandidates.length !== 1 || talentCandidates.length !== (selection.level === 1 ? 0 : 1)) return null
  const candidates = [
    { candidate: traitCandidates[0], keys: [type === 'X' ? 'attack_speed' : 'damage_scale'] },
    ...talentCandidates.map(candidate => ({ candidate, keys: expectedTalentKeys })),
  ]
  if (candidates.some(({ candidate, keys }) => {
    const { unlockCondition } = candidate
    const entries = numericEntries(candidate.blackboard)
    return entries.length !== keys.length || keys.some(key => !entries.some(([entry, value]) =>
      entry === key && typeof value === 'number' && Number.isFinite(value)))
      || Boolean(unlockCondition && (unlockCondition.phase !== 'PHASE_2' || !Number.isInteger(unlockCondition.level)
        || unlockCondition.level! > operatorLevel))
  })) return null

  const basePassives = getOperatorPassives(profile, phaseIndex, operatorLevel, 1)
  const application = applyOperatorModule(basePassives, module, selection.level, 1)
  if (application.unsupportedReasons.length || application.moduleLevel !== selection.level) return null
  const attackBonus = application.moduleAttack
  if (type === 'Y') {
    const frames = profile.phases[phaseIndex]?.attributesKeyFrames ?? []
    const blockCount = frames[0]?.data?.blockCnt
    if (typeof blockCount !== 'number' || !Number.isSafeInteger(blockCount) || blockCount < 1
      || frames.some(frame => frame.data?.blockCnt !== blockCount)) return null
    const { blockedFragility, remnantSpeed } = getReviewedSurtrYEffects(basePassives, application, selection.level)
    if (!blockedFragility || !remnantSpeed
      || application.changes.some(change => change !== blockedFragility.change && change !== remnantSpeed.change)) return null
    return { ...selection, type, attackBonus, blockCount,
      artsFragilityMultiplier: blockedFragility.value, remnantAttackSpeedBonus: remnantSpeed.value } as const
  }

  if (getSurtrRemnantAttackSpeedBonus(application.passives, 'X', selection.level) !== 0) return null
  const { unblockedSpeed, talent } = getReviewedSurtrXEffects(basePassives, application, selection.level)
  if (!unblockedSpeed || !talent || application.changes.some(change => change !== unblockedSpeed.change && change !== talent.change)) {
    return null
  }
  return {
    ...selection,
    type,
    attackBonus,
    unblockedAttackSpeedBonus: unblockedSpeed.value,
    baseResistanceIgnore: talent.baseValue,
    resistanceIgnore: talent.equippedValue,
  } as const
}
