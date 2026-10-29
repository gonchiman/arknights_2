import type { OperatorCombatProfile, RawSkillLevel } from '../types/skill.ts'
import type { GuardInput, GuardSkillRecipe } from './guardCombatTypes.ts'
import type { TalentCoarseCategory } from './talentCoarseClassification.ts'
import type { TalentStructureEffect } from './talentStructure.ts'

/** A reviewed source snapshot is separate from the executable semantic definition. */
export interface ExpandedOperatorSource {
  operatorId: string
  operatorName: string
  profession: string
  rarity: number
  subProfessionId: string
  phaseIndex: number
  skillLevelIndex: number
  profile: OperatorCombatProfile
  skills: { skillIndex: number; skillId: string; raw: RawSkillLevel }[]
}
export interface ExpandedTalentBinding {
  read(key: string): number | null
  issue(message: string): void
}
export interface ExpandedTalentDefinition {
  talentIndex: number
  name: string
  prefabKey: string
  categories: readonly TalentCoarseCategory[]
  effects: (binding: ExpandedTalentBinding) => readonly TalentStructureEffect[]
  notes?: readonly string[]
}
export interface ExpandedOperatorDefinition {
  operatorId: string
  phaseIndex: number
  skillLevelIndex: number
  inputs?: readonly GuardInput[]
  recipes: readonly GuardSkillRecipe[]
  talents: readonly ExpandedTalentDefinition[]
  traitNotes?: readonly string[]
  deferredSkills?: readonly { skillIndex: number; reason: string }[]
}
