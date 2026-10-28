import type { SkillRecord } from '../types/skill.ts'
import type { GuardConditions, GuardPassiveModifiers, GuardStage } from './guardCombatTypes.ts'
import { getExpandedDefinition, getExpandedSource, sameReviewedPassive } from './expandedCombatRegistry.ts'
import { buildExpandedTalentStructures } from './expandedTalentStructure.ts'
import { applyGuardTalentStructure } from './guardTalentEvaluation.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { resolveGuardConditions } from './guardCombatValues.ts'

export function evaluateExpandedPassives(operator: SkillRecord, conditions: GuardConditions,
  context: { kind: string; skillIndex: number; stage?: Pick<GuardStage, 'actions'>; phaseIndex?: number; operatorLevel?: number },
  registrationOnly = false): GuardPassiveModifiers {
  const output: GuardPassiveModifiers = { attackRatio: 0, attackFlat: 0, attackScale: 1, attackSpeed: 0,
    damageScale: 1, defenseIgnoreRatio: 0, defenseIgnoreFixed: 0, resistanceIgnoreFixed: 0,
    resistanceIgnoreRatio: 0, defenseReductionRatio: 0, critChance: 0, critScale: 1,
    additionalActions: [], evaluations: [], blockers: [], notes: [] }
  const definition = getExpandedDefinition(operator.operatorId)!, snapshot = getExpandedSource(operator.operatorId)!
  const phaseIndex = context.phaseIndex ?? definition.phaseIndex
  const operatorLevel = context.operatorLevel ?? operator.operatorProfile.phases[phaseIndex]?.maxLevel ?? 1
  const resolved = resolveGuardConditions(definition.inputs ?? [], conditions)
  if (!registrationOnly) output.blockers.push(...resolved.errors)
  const live = getOperatorPassives(operator.operatorProfile, phaseIndex, operatorLevel, 1).sources
  const expected = getOperatorPassives(snapshot.profile, definition.phaseIndex,
    snapshot.profile.phases[definition.phaseIndex]?.maxLevel ?? 1, 1).sources
  const trait = live.find(source => source.sourceKind === 'TRAIT'), reference = expected.find(source => source.sourceKind === 'TRAIT')
  const traitValid = operator.profession === snapshot.profession && operator.subProfessionId === snapshot.subProfessionId
    && sameReviewedPassive(trait, reference)
  if (!registrationOnly && !traitValid) output.blockers.push('確認済みの職分・特性説明文と一致しません。')
  if (!registrationOnly && (live.filter(source => source.sourceKind === 'TALENT').length !== definition.talents.length
    || phaseIndex !== definition.phaseIndex)) output.blockers.push('確認済みの昇進段階・素質数と一致しません。')
  output.notes.push(...(definition.traitNotes ?? []))
  const metrics: Record<string, number | boolean | string | undefined> = { ...conditions, ...resolved.values,
    skillIndex: context.skillIndex, actionKind: context.kind, 'source.skillActive': true,
    'source.isDeployed': true, 'source.isInSquad': true, 'source.profession': operator.profession,
    'attack.damageType': context.stage?.actions.length && context.stage.actions.every(action => action.damageType === context.stage!.actions[0].damageType)
      ? context.stage.actions[0].damageType : undefined,
  }
  for (const entry of operator.skillLevels[definition.skillLevelIndex]?.blackboard ?? []) {
    if (entry.key && typeof entry.value === 'number') metrics[`skill.${entry.key.toLowerCase()}`] = entry.value
  }
  const affiliation = operator.operatorProfile.affiliationIds
  const affiliations = affiliation ? [affiliation.nationId, affiliation.groupId, affiliation.teamId] : []
  for (const structure of buildExpandedTalentStructures([operator], { phaseIndex, operatorLevel }, registrationOnly)) {
    for (const faction of structure.effects.flatMap(effect => effect.target.factionIds)) metrics[`source.faction.${faction}`] = affiliations.includes(faction)
    applyGuardTalentStructure(output, structure, metrics, registrationOnly)
  }
  return output
}
