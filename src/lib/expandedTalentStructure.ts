import type { SkillRecord } from '../types/skill.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { expandSkillDescription } from './skillJsonAnalysis.ts'
import type { TalentStructure, TalentStructureGrowthSelection } from './talentStructure.ts'
import { getExpandedDefinition, getExpandedSource, sameReviewedPassive } from './expandedCombatRegistry.ts'

/** Bind reviewed semantics to live, potential-one sources; missing data is never replaced with snapshot values. */
export function buildExpandedTalentStructures(rows: readonly SkillRecord[], growth: TalentStructureGrowthSelection = {},
  registrationOnly = false): TalentStructure[] {
  return [...new Map(rows.map(row => [row.operatorId, row])).values()].flatMap(operator => {
    const definition = getExpandedDefinition(operator.operatorId), snapshot = getExpandedSource(operator.operatorId)
    if (!definition || !snapshot) return []
    const phaseIndex = growth.phaseIndex ?? definition.phaseIndex
    const operatorLevel = growth.operatorLevel ?? operator.operatorProfile.phases[phaseIndex]?.maxLevel ?? 1
    const sources = getOperatorPassives(operator.operatorProfile, phaseIndex, operatorLevel, 1).sources
    const expected = getOperatorPassives(snapshot.profile, definition.phaseIndex,
      snapshot.profile.phases[definition.phaseIndex]?.maxLevel ?? 1, 1).sources
    return definition.talents.map(talent => {
      const issues: string[] = []
      const source = (registrationOnly ? expected : sources).find(value => value.sourceKind === 'TALENT' && value.talentIndex === talent.talentIndex)
      const reference = expected.find(value => value.sourceKind === 'TALENT' && value.talentIndex === talent.talentIndex)
      if (phaseIndex !== definition.phaseIndex || !source || !reference || source.sourceName !== talent.name
        || source.prefabKey !== talent.prefabKey || source.requiredPotentialRank !== 0
        || !sameReviewedPassive(source, reference, false)) {
        if (!registrationOnly) issues.push('確認済みの素質と名称・説明文・昇進条件・識別子が一致しません。')
      }
      const effects = talent.effects({
        read(key) {
          const values = source?.blackboard.filter(entry => entry.key?.toLowerCase() === key.toLowerCase()) ?? []
          if (values.length !== 1 || typeof values[0].value !== 'number' || !Number.isFinite(values[0].value)) {
            if (!registrationOnly) issues.push(`素質の数値「${key}」が欠落・重複・不正です。`)
            return null
          }
          return values[0].value
        },
        issue(message) { if (!registrationOnly) issues.push(message) },
      })
      return {
        basicInfo: { operatorId: operator.operatorId, operatorName: operator.operatorName, talentIndex: talent.talentIndex,
          talentName: talent.name, phaseIndex, operatorLevel, potentialRank: 1, module: 'NONE' },
        classificationInfo: { coarseCategories: talent.categories },
        activationSettings: { activationMethod: 'PASSIVE', triggers: effects.map(effect => effect.timing) }, effects,
        source: { description: expandSkillDescription(source?.description ?? '', source?.blackboard ?? []).replace(/<[^>]+>/g, ''),
          blackboard: source?.blackboard ?? [], requiredPotentialRank: source?.requiredPotentialRank ?? 0,
          unlockCondition: source?.unlockCondition, prefabKey: source?.prefabKey ?? null },
        issues: [...new Set(issues)], notes: talent.notes ?? [], deferred: [],
      } satisfies TalentStructure
    })
  })
}
