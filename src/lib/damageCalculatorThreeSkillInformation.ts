import type { SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import {
  formatSkillStructureActivationMethod,
  formatSkillStructureDuration,
  formatSkillStructureSpRecovery,
  type SkillStructure,
} from './skillStructure.ts'

export function buildDamageCalculatorThreeSkillInformation(
  structure: SkillStructure,
  skill: SkillRecord,
  output?: DamageCalculatorThreeOutput | null,
): readonly (readonly [string, string | number])[] {
  const activation = structure.activationSettings
  const usesSp = activation.spRecovery !== 'NO_SP'
  const matchingOutput = output?.structure
    && (['operatorId', 'skillId', 'skillIndex', 'levelIndex'] as const).every(
      key => output.structure!.basicInfo[key] === structure.basicInfo[key],
    ) ? output : null

  return [
    ['SP回復方法', formatSkillStructureSpRecovery(activation.spRecovery)],
    ['発動方法', formatSkillStructureActivationMethod(activation.activationMethod)],
    ['初期SP', usesSp ? activation.initialSp : '—'],
    ['必要SP', usesSp ? activation.spCost : '—'],
    ['持続', formatDuration(structure, skill, matchingOutput)],
  ]
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
