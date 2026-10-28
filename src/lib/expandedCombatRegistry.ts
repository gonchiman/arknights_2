import meleeSources from '../data/expandedMeleeSources.json' with { type: 'json' }
import rangedSources from '../data/expandedRangedSources.json' with { type: 'json' }
import artsSources from '../data/expandedArtsSources.json' with { type: 'json' }
import { EXPANDED_MELEE_DEFINITIONS } from './expandedMeleeDefinitions.ts'
import { EXPANDED_RANGED_DEFINITIONS } from './expandedRangedDefinitions.ts'
import { EXPANDED_ARTS_DEFINITIONS } from './expandedArtsDefinitions.ts'
import type { ExpandedOperatorDefinition, ExpandedOperatorSource } from './expandedCombatTypes.ts'
import type { RawBlackboardEntry, RawSkillLevel } from '../types/skill.ts'
import type { PassiveSource } from './operatorProfile.ts'

export const EXPANDED_OPERATOR_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  ...EXPANDED_MELEE_DEFINITIONS, ...EXPANDED_RANGED_DEFINITIONS, ...EXPANDED_ARTS_DEFINITIONS,
]
export const EXPANDED_OPERATOR_SOURCES = [...meleeSources, ...rangedSources, ...artsSources] as unknown as readonly ExpandedOperatorSource[]
export const EXPANDED_OPERATOR_IDS = EXPANDED_OPERATOR_DEFINITIONS.map(definition => definition.operatorId)
export const getExpandedDefinition = (id: string) => EXPANDED_OPERATOR_DEFINITIONS.find(definition => definition.operatorId === id)
export const getExpandedSource = (id: string) => EXPANDED_OPERATOR_SOURCES.find(source => source.operatorId === id)

/** Normalize only formatting. Additional clauses/changed numeric keys never silently inherit a recipe. */
export function sameReviewedDescription(actual: string, expected: string): boolean {
  const clean = (text: string) => text.replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').replace(/\s+/g, '')
  return clean(actual) === clean(expected)
}

/** Order/formatting may change; new source fields and ambiguous keys require review. */
export function sameReviewedBlackboard(actual: readonly RawBlackboardEntry[] = [],
  expected: readonly RawBlackboardEntry[] = [], compareValues = true): boolean {
  const signature = (entries: readonly RawBlackboardEntry[]) => {
    const keys = entries.map(entry => entry.key?.toLowerCase())
    if (keys.some(key => !key) || new Set(keys).size !== keys.length
      || entries.some(entry => typeof entry.value !== 'number' || !Number.isFinite(entry.value))) return null
    return JSON.stringify(entries.map(entry => [entry.key!.toLowerCase(), compareValues ? entry.value : null,
      entry.valueStr ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  }
  const actualSignature = signature(actual)
  return actualSignature !== null && actualSignature === signature(expected)
}

export function sameReviewedPassive(actual: PassiveSource | undefined, expected: PassiveSource | undefined,
  compareValues = true): boolean {
  return !!actual && !!expected && actual.sourceKind === expected.sourceKind
    && actual.sourceName === expected.sourceName && actual.talentIndex === expected.talentIndex
    && actual.prefabKey === expected.prefabKey && actual.tokenKey === expected.tokenKey
    && actual.requiredPotentialRank === expected.requiredPotentialRank
    && actual.unlockCondition?.phase === expected.unlockCondition?.phase
    && actual.unlockCondition?.level === expected.unlockCondition?.level
    && sameReviewedDescription(actual.description, expected.description)
    && sameReviewedBlackboard(actual.blackboard, expected.blackboard, compareValues)
}

export function sameReviewedSkill(actual: RawSkillLevel | undefined, expected: RawSkillLevel | undefined): boolean {
  return !!actual && !!expected && sameReviewedDescription(actual.description ?? '', expected.description ?? '')
    && sameReviewedBlackboard(actual.blackboard, expected.blackboard)
    && actual.name === expected.name && actual.duration === expected.duration
    && actual.durationType === expected.durationType && actual.skillType === expected.skillType
    && actual.rangeId === expected.rangeId
    && actual.spData?.spType === expected.spData?.spType && actual.spData?.initSp === expected.spData?.initSp
    && actual.spData?.spCost === expected.spData?.spCost && actual.spData?.maxChargeTime === expected.spData?.maxChargeTime
}
