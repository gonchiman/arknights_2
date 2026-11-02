import type { SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import {
  formatSkillStructureActivationMethod,
  formatSkillStructureDuration,
  formatSkillStructureSpRecovery,
  type SkillStructure,
} from './skillStructure.ts'

export interface DamageCalculatorThreeSkillInformationValues {
  spRecovery: string
  activationMethod: string
  initialSp: number | null
  spCost: number | null
  skillDuration: string
}

export type DamageCalculatorThreeSkillInformationKey = keyof DamageCalculatorThreeSkillInformationValues

export function buildDamageCalculatorThreeSkillInformation(
  structure: SkillStructure,
  skill: SkillRecord,
  output?: DamageCalculatorThreeOutput | null,
): readonly (readonly [string, string | number])[] {
  const values = getDamageCalculatorThreeSkillInformationValues(structure, skill, output)
  return [
    ['SP回復方法', values.spRecovery],
    ['発動方法', values.activationMethod],
    ['初期SP', values.initialSp ?? '—'],
    ['必要SP', values.spCost ?? '—'],
    ['持続', values.skillDuration],
  ]
}

export function getDamageCalculatorThreeSkillInformationValues(
  structure: SkillStructure,
  skill: SkillRecord,
  output?: DamageCalculatorThreeOutput | null,
): DamageCalculatorThreeSkillInformationValues {
  const activation = structure.activationSettings
  const usesSp = activation.spRecovery !== 'NO_SP'
  const matchingOutput = output?.structure
    && (['operatorId', 'skillId', 'skillIndex', 'levelIndex'] as const).every(
      key => output.structure!.basicInfo[key] === structure.basicInfo[key],
    ) ? output : null

  return {
    spRecovery: formatSkillStructureSpRecovery(activation.spRecovery),
    activationMethod: formatSkillStructureActivationMethod(activation.activationMethod),
    initialSp: usesSp ? activation.initialSp : null,
    spCost: usesSp ? activation.spCost : null,
    skillDuration: formatDuration(structure, skill, matchingOutput),
  }
}

const informationCollator = new Intl.Collator('ja', { numeric: true })

export function compareDamageCalculatorThreeSkillInformation(
  left: DamageCalculatorThreeSkillInformationValues,
  right: DamageCalculatorThreeSkillInformationValues,
  key: DamageCalculatorThreeSkillInformationKey,
  direction: 'asc' | 'desc',
): number {
  const a = left[key]
  const b = right[key]
  const isMissing = (value: string | number | null) => value === null || value === '—'
    || (typeof value === 'number' && !Number.isFinite(value))
  const aMissing = isMissing(a)
  const bMissing = isMissing(b)
  if (aMissing) return bMissing ? 0 : 1
  if (bMissing) return -1
  const sign = direction === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign
  if (key === 'skillDuration') {
    const aSeconds = secondsFromDuration(String(a))
    const bSeconds = secondsFromDuration(String(b))
    if (aSeconds !== null && bSeconds !== null) return (aSeconds - bSeconds) * sign
    // Non-time durations stay separate from seconds instead of becoming 0 or infinity.
    if (aSeconds !== null) return -1
    if (bSeconds !== null) return 1
  }
  return informationCollator.compare(String(a), String(b)) * sign
}

function secondsFromDuration(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)秒$/.exec(value)
  return match ? Number(match[1]) : null
}

function formatDuration(
  structure: SkillStructure,
  skill: SkillRecord,
  output: DamageCalculatorThreeOutput | null,
): string {
  if (skill.skillLevels[structure.basicInfo.levelIndex]?.durationType === 'AMMO') return '弾薬制'
  const stages = structure.effectStructure.stages
  const stage = stages.find(candidate => candidate.label === output?.activeStageLabel) ?? stages[0]
  if (structure.classificationInfo.coarseCategories.includes('MODE')
    || stage?.duration.type === 'UNTIL_MODE_CHANGE') return '次の状態切替まで'
  if (stage?.duration.type === 'SINGLE_ATTACK') return formatSkillStructureDuration(stage.duration)

  // Guard stages may describe only an initial/final hit, not the whole skill's duration.
  // A NORMAL stage can also have a condition-dependent duration already resolved by DC3.
  if (structure.guardRecipe && stage?.duration.type === 'FIXED_SECONDS'
    && output?.model && output.model.duration > 0) {
    return formatSkillStructureDuration({ type: 'FIXED_SECONDS', seconds: output.model.duration })
  }
  if (stage?.duration.type === 'UNTIL_EXIT') return '退場まで'
  if (stage?.duration.type === 'FIXED_SECONDS' && stage.duration.seconds > 0) {
    return formatSkillStructureDuration(stage.duration)
  }
  if (structure.source.duration > 0) {
    return formatSkillStructureDuration({ type: 'FIXED_SECONDS', seconds: structure.source.duration })
  }
  if (stage?.duration.type === 'SKILL_ACTION') return formatSkillStructureDuration(stage.duration)
  return '—'
}
