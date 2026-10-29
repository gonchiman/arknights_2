import { EXPANDED_OPERATOR_DEFINITIONS, getExpandedSource } from './expandedCombatRegistry.ts'
import { buildGuardSkillStructures } from './guardSkillStructure.ts'
import type { GuardSource } from './guardCombatTypes.ts'
import type { SkillStructure } from './skillStructure.ts'

export function buildExpandedSkillStructures(): SkillStructure[] {
  return EXPANDED_OPERATOR_DEFINITIONS.flatMap(definition => {
    const source = getExpandedSource(definition.operatorId)
    if (!source) throw new RangeError(`確認済みデータがありません：${definition.operatorId}`)
    const guardSource: GuardSource = { id: source.operatorId, name: source.operatorName,
      subProfessionId: source.subProfessionId, trait: '', talents: [],
      skills: source.skills.map(skill => ({ ...skill, supported: true })) }
    const recipes = [...definition.recipes, ...(definition.deferredSkills ?? []).map(skill => ({
      operatorId: definition.operatorId, skillIndex: skill.skillIndex, inputs: [],
      stages: [{ id: 'pending', label: '計算保留', kind: 'SKILL_ACTION' as const, actions: [],
        unresolved: [skill.reason], calculationIssues: [{ id: `${definition.operatorId}-s${skill.skillIndex}-deferred`,
          reason: skill.reason, relatedSections: ['スキル'] as const }] }],
    }))]
    return buildGuardSkillStructures(recipes, [guardSource], definition.skillLevelIndex)
  })
}
