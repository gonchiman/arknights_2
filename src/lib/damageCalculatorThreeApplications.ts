import type { DamageCalculatorThreeInput, DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import type { EffectApplicationRow } from './effectApplication.ts'
import { buildGuardSkillApplicationRows, buildGuardTalentApplicationRows } from './guardEffectApplication.ts'
import { buildTraitApplicationRows } from './traitEffectApplication.ts'
import {
  formatSkillStructureEffectItem, formatSkillStructureEffectValue, formatSkillStructureEffectTiming,
  formatSkillStructurePredicate,
} from './skillStructure.ts'
import {
  formatTalentStructureEffectItem, formatTalentStructureEffectValue, formatTalentStructureTiming,
  formatTalentStructureCondition, formatTalentStructureTarget, type TalentStructureEffect,
} from './talentStructure.ts'
import { DAMAGE_TYPE_LABELS } from './damageCalculator.ts'

/** Display adapters consume the same input/output pair as the result table. */
export function buildDamageCalculatorThreeApplicationRows(
  input: DamageCalculatorThreeInput, output: DamageCalculatorThreeOutput,
): EffectApplicationRow[] {
  return [
    ...(output.guard ? buildGuardSkillApplicationRows(input, output) : buildSkillApplicationRows(output)),
    ...buildTraitApplicationRows(input, output),
    ...(output.guard ? buildGuardTalentApplicationRows(input, output) : buildTalentApplicationRows(output)),
  ].map(row => output.rows.length === 0 && row.status === 'APPLIED'
    ? { ...row, status: 'UNVERIFIED', reason: output.unsupportedReasons.join(' / ') || '計算結果を確定できません。' }
    : row)
}

function buildSkillApplicationRows(output: DamageCalculatorThreeOutput): EffectApplicationRow[] {
  const structure = output.structure
  if (!structure) return []
  const hasStages = structure.effectStructure.stages.length > 1
  return structure.effectStructure.stages.flatMap(stage => stage.effects.flatMap(effect => {
    const evaluation = output.effects.find(entry => entry.stageId === stage.id && entry.effect.id === effect.id)
    const condition = [stage.applicability, effect.condition].filter(value => value !== null)
      .map(predicate => formatSkillStructurePredicate(predicate))
    if (effect.target === 'GROUND_ENEMIES_IN_ACTION_RANGE') condition.push('地上の敵')
    if (effect.item === 'APPLY_STATUS' && effect.value.maxWeight !== undefined) condition.push(`敵の重量 ≦ ${effect.value.maxWeight}`)
    const base: EffectApplicationRow = {
      id: `skill/${stage.id}/${effect.id}`, category: 'SKILL', name: structure.basicInfo.skillName,
      item: formatSkillStructureEffectItem(effect.item), value: formatSkillStructureEffectValue(effect),
      timing: formatSkillStructureEffectTiming(effect.timing), condition: condition.join(' かつ ') || 'なし',
      status: evaluation?.status ?? 'UNVERIFIED',
      reason: evaluation?.reason ?? (output.unsupportedReasons.join(' / ') || 'この効果の計算結果を確認できません。'),
      ...(hasStages ? { stage: stage.label } : {}),
    }
    if (effect.item === 'ATTACK_SPEED' && base.status === 'APPLIED' && output.attackKind !== 'NORMAL') {
      base.status = 'NOT_RELEVANT'
      base.reason = '1回分の攻撃ダメージには攻撃速度を使用しません。'
    }
    if (effect.item !== 'DIRECT_DAMAGE') return [base]
    // The action executor replaces normal hits. Keep damage type, scale and count separate.
    const actions = stage.effects.filter(candidate => candidate.item === 'DIRECT_DAMAGE')
    const prefix = actions.length > 1 ? `攻撃${actions.indexOf(effect) + 1}・` : ''
    const values: [string, string][] = [
      ['ダメージ種別', DAMAGE_TYPE_LABELS[effect.value.damageType]],
      ['攻撃倍率', `×${number(effect.value.attackScale)}`],
      ['打撃回数', `${number(effect.value.count)}回`],
    ]
    return values.map(([item, value], index) => ({ ...base, id: `${base.id}/${index}`, item: prefix + item, value }))
  }))
}

function buildTalentApplicationRows(output: DamageCalculatorThreeOutput): EffectApplicationRow[] {
  const hasProbability = output.talentEffects.some(entry => entry.effect && entry.effect.probability.chance !== 1)
  return output.talentEffects.map((entry, index) => ({
    id: `talent/${entry.talentIndex}/${entry.effect?.id ?? index}`, category: 'TALENT', categoryLabel: `素質${entry.talentIndex + 1}`,
    name: entry.talentName,
    item: entry.effect ? formatTalentStructureEffectItem(entry.effect.item) : '未確認',
    value: entry.effect ? formatTalentStructureEffectValue(entry.effect) : '未確認',
    timing: entry.effect ? formatTalentStructureTiming(entry.effect.timing) : '未確認',
    condition: entry.effect ? formatTalentApplicationCondition(entry.effect) : '未確認',
    status: entry.effect?.item === 'ATTACK_SPEED' && entry.status === 'APPLIED' && output.attackKind !== 'NORMAL'
      ? 'NOT_RELEVANT' : entry.status,
    reason: entry.effect?.item === 'ATTACK_SPEED' && entry.status === 'APPLIED' && output.attackKind !== 'NORMAL'
      ? '1回分の攻撃ダメージには攻撃速度を使用しません。' : entry.reason,
    ...(hasProbability ? { probability: entry.effect?.probability.chance === null || !entry.effect
      ? '未確認' : `${number(entry.effect.probability.chance * 100)}％` } : {}),
  }))
}

function formatTalentApplicationCondition(effect: TalentStructureEffect): string {
  const conditions: string[] = []
  if (effect.target.factionIds.length > 0 || effect.target.tagIds.length > 0) conditions.push(formatTalentStructureTarget(effect.target))
  if (effect.condition) conditions.push(formatTalentStructureCondition(effect.condition))
  return conditions.join(' かつ ') || 'なし'
}

function number(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 }).format(value)
}
