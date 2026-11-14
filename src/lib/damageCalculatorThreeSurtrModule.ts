import type { RawBlackboardCollection, SkillRecord } from '../types/skill.ts'
import { getReviewedSurtrXEffects, SURTR_X_MODULE_ID } from './moduleEffectStructure.ts'
import { applyOperatorModule, getOperatorModules, isOperatorModuleUnlocked } from './operatorModules.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { getSurtrRemnantAttackSpeedBonus } from './surtrRemnantAttackSpeed.ts'

export const DAMAGE_CALCULATOR_THREE_SURTR_X_ID = SURTR_X_MODULE_ID
export const DAMAGE_CALCULATOR_THREE_SURTR_X_SKILL_LEVEL_INDEX = 9
const MODULE_LEVELS = [1, 2, 3] as const

export interface DamageCalculatorThreeModuleSelection {
  id: string
  level: typeof MODULE_LEVELS[number]
}

export function isDamageCalculatorThreeSurtrXSkill(skill: Pick<SkillRecord, 'operatorId' | 'skillId' | 'skillIndex'>): boolean {
  return skill.operatorId === 'char_350_surtr' && skill.skillId === 'skchr_surtr_3' && skill.skillIndex === 3
}

export function getDamageCalculatorThreeSurtrXModuleLevels(skill: SkillRecord, phaseIndex: number, operatorLevel: number) {
  return MODULE_LEVELS.filter(level => resolveDamageCalculatorThreeSurtrXModule(skill, phaseIndex, operatorLevel, {
    id: DAMAGE_CALCULATOR_THREE_SURTR_X_ID, level,
  }) !== null)
}

function numericEntries(blackboard: RawBlackboardCollection | undefined) {
  return Array.isArray(blackboard)
    ? blackboard.map(({ key, value }) => [key, value] as const)
    : Object.entries(blackboard ?? {})
}

/** Resolve the exact verified stage at potential 1. Unknown additional mechanics invalidate the result. */
export function resolveDamageCalculatorThreeSurtrXModule(
  skill: SkillRecord,
  phaseIndex: number,
  operatorLevel: number,
  selection: DamageCalculatorThreeModuleSelection,
) {
  if (!isDamageCalculatorThreeSurtrXSkill(skill) || !skill.skillLevels[DAMAGE_CALCULATOR_THREE_SURTR_X_SKILL_LEVEL_INDEX]
    || selection.id !== DAMAGE_CALCULATOR_THREE_SURTR_X_ID || !MODULE_LEVELS.includes(selection.level)
    || phaseIndex !== 2 || !Number.isInteger(operatorLevel)
    || operatorLevel < 1 || operatorLevel > (skill.operatorProfile.phases[2]?.maxLevel ?? 0)) return null
  const profile = skill.operatorProfile
  const module = getOperatorModules(profile).find(candidate => candidate.uniEquipId === selection.id)
  if (!module || module.typeName2 !== 'X' || module.unlockEvolvePhase !== 'PHASE_2'
    || !Number.isInteger(module.unlockLevel) || module.unlockLevel! < 1
    || !isOperatorModuleUnlocked(module, phaseIndex, operatorLevel)) return null
  const stages = module.phases?.filter((phase, index) => (phase.equipLevel ?? index + 1) === selection.level)
  if (stages?.length !== 1 || stages[0].equipLevel !== selection.level) return null
  const { attributeBlackboard, parts = [] } = stages[0]
  const attributes = numericEntries(attributeBlackboard)
  if (!attributes.some(([key]) => key === 'atk') || new Set(attributes.map(([key]) => key)).size !== attributes.length
    || attributes.some(([key, value]) => (key !== 'atk' && key !== 'magic_resistance')
      || typeof value !== 'number' || !Number.isFinite(value))) return null
  if (!Array.isArray(parts)) return null
  const candidates = parts.flatMap(part => [
    ...(part.overrideTraitDataBundle?.candidates ?? []).map(candidate => ({ candidate, key: 'attack_speed' })),
    ...(part.addOrOverrideTalentDataBundle?.candidates ?? []).map(candidate => ({ candidate, key: 'magic_resist_penetrate_fixed' })),
  ]).filter(({ candidate }) => (candidate.requiredPotentialRank ?? 0) === 0)
  if (candidates.length !== (selection.level === 1 ? 1 : 2) || candidates.some(({ candidate, key }) => {
    const { unlockCondition } = candidate
    const entries = numericEntries(candidate.blackboard)
    return entries.length !== 1 || entries[0][0] !== key
      || Boolean(unlockCondition && (unlockCondition.phase !== 'PHASE_2' || !Number.isInteger(unlockCondition.level)
        || unlockCondition.level! > operatorLevel))
  })) return null

  const basePassives = getOperatorPassives(profile, phaseIndex, operatorLevel, 1)
  const application = applyOperatorModule(basePassives, module, selection.level, 1)
  if (application.unsupportedReasons.length || application.moduleLevel !== selection.level
    || getSurtrRemnantAttackSpeedBonus(application.passives, 'X', selection.level) !== 0) return null
  const { unblockedSpeed, talent } = getReviewedSurtrXEffects(basePassives, application, selection.level)
  if (!unblockedSpeed || !talent || application.changes.some(change => change !== unblockedSpeed.change && change !== talent.change)) {
    return null
  }
  return {
    ...selection,
    attackBonus: application.moduleAttack,
    unblockedAttackSpeedBonus: unblockedSpeed.value,
    baseResistanceIgnore: talent.baseValue,
    resistanceIgnore: talent.equippedValue,
  }
}
