import type { DamageCalculatorThreeInput, DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import type { EffectApplicationRow } from './effectApplication.ts'
import { getExpandedDefinition, getExpandedSource } from './expandedCombatRegistry.ts'
import type { GuardStage } from './guardCombatTypes.ts'
import { evaluateGuardTraits } from './guardTraitEvaluation.ts'
import { buildTraitStructures, formatTraitStructureCondition, formatTraitStructureEffectItem,
  formatTraitStructureEffectValue, formatTraitStructureTiming } from './traitStructure.ts'

type ExpandedTraitCoverage = 'SUPPORTED' | 'NOT_APPLICABLE' | 'UNSUPPORTED'

/** Registration is checked against the same executable trait rules and skill overrides. */
export function getExpandedTraitCoverage(operatorId: string, stage: GuardStage): ExpandedTraitCoverage {
  const definition = getExpandedDefinition(operatorId), source = getExpandedSource(operatorId)
  if (!definition || !source) return 'UNSUPPORTED'
  const operator = { operatorId, operatorName: source.operatorName, profession: source.profession,
    professionLabel: source.profession, subProfessionId: source.subProfessionId,
    subProfessionName: source.subProfessionId, operatorProfile: source.profile }
  const growth = { phaseIndex: definition.phaseIndex, operatorLevel: source.profile.phases[definition.phaseIndex].maxLevel! }
  const structure = buildTraitStructures([operator], growth)[0]
  if (!structure?.effects.length || structure.status === 'UNREVIEWED') return 'UNSUPPORTED'
  const recipe = definition.recipes.find(recipe => recipe.stages.some(candidate => candidate === stage
    || JSON.stringify(candidate) === JSON.stringify(stage)))
  const raw = source.skills.find(skill => skill.skillIndex === recipe?.skillIndex)?.raw
  const relevant = structure.effects.filter(effect => effect.calculationRelevance !== 'NOT_RELEVANT'
    && !['ATTACK_RANGE', 'RANGED_ATTACK_ENABLED', 'NORMAL_ATTACK_ENABLED'].includes(effect.item)
    && effect.operation !== 'RESET_SOURCE_VALUE')
  if (!relevant.length) return 'NOT_APPLICABLE'
  if (!recipe || !raw || !stage.actions.length) return 'UNSUPPORTED'
  const board = new Map((raw.blackboard ?? []).flatMap(entry => typeof entry.value === 'number' && entry.key
    ? [[entry.key.toLowerCase(), entry.value] as const] : []))
  const conditions = { actualAttackTargetCount: 1, ...Object.fromEntries([
    ...(definition.inputs ?? []), ...recipe.inputs,
  ].map(input => [input.key, input.defaultValue])) }
  try {
    const result = evaluateGuardTraits(operator, stage, conditions, board, growth).evaluation
    const rows = result.evaluations.filter(row => relevant.some(effect => effect.id === row.effectId))
    return result.blockers.length || rows.some(row => row.status === 'UNSUPPORTED') ? 'UNSUPPORTED'
      : rows.some(row => row.status === 'APPLIED' || row.status === 'CONDITION_FALSE') ? 'SUPPORTED' : 'NOT_APPLICABLE'
  } catch { return 'UNSUPPORTED' }
}

/** Display the actual numerical evaluator's decisions, without re-applying effects. */
export function buildTraitApplicationRows(input: DamageCalculatorThreeInput, output: DamageCalculatorThreeOutput): EffectApplicationRow[] {
  const structure = buildTraitStructures([input.operator], { phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel })[0]
  const name = input.operator.subProfessionName || '特性', prefix = `trait:${input.operator.operatorId}:`
  if (!structure?.effects.length) return [{ id: `${prefix}unverified`, category: 'TRAIT', name,
    item: '特性', value: '—', timing: '—', condition: '—', status: 'UNVERIFIED',
    reason: structure?.issues.join(' ') || '選択した育成段階の特性定義を確認できません。' }]
  const ready = output.rows.length > 0 && output.model !== null && output.unsupportedReasons.length === 0
  return structure.effects.flatMap(effect => {
    const evaluation = output.traitEvaluation?.evaluations.find(row => row.effectId === effect.id)
    const status = evaluation?.status === 'APPLIED' && !ready ? 'UNSUPPORTED' : evaluation?.status ?? 'UNVERIFIED'
    const row: EffectApplicationRow = { id: prefix + effect.id, category: 'TRAIT', name,
      item: formatTraitStructureEffectItem(effect.item), value: status === 'APPLIED' && evaluation ? evaluation.value : formatTraitStructureEffectValue(effect),
      timing: formatTraitStructureTiming(effect.timing), condition: formatTraitStructureCondition(effect.condition), status,
      reason: !ready && evaluation?.status === 'APPLIED' ? output.unsupportedReasons.join(' ')
        : evaluation?.reason ?? '特性の計算結果を確認できません。' }
    if (effect.operation !== 'INCREASE_TO_CAP') return [row]
    return [row, { ...row, id: `${row.id}:progression`, item: '攻撃力の蓄積推移', value: '未確定',
      timing: formatTraitStructureTiming(effect.timing), condition: formatTraitStructureCondition(effect.value.accumulateWhile),
      status: 'UNVERIFIED', reason: '最大値までの補間方式と更新間隔が未確認です。現在の計算は入力した蓄積量を固定して扱います。' } satisfies EffectApplicationRow]
  })
}
