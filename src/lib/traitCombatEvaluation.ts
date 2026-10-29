import { evaluateCombatCondition, resolveCombatNumericValue, resolveCombatProbability,
  formatCombatNumber, type CombatNumericValue, type CombatScalar } from './combatEffectStructure.ts'
import { formatTraitStructureEffectItem, type TraitStructure, type TraitStructureEffect } from './traitStructure.ts'

export interface TraitCombatContext {
  readonly kind: 'NORMAL' | 'NEXT_ATTACK' | 'SKILL_ACTION' | 'COUNTER'
  readonly metrics: Readonly<Record<string, CombatScalar | undefined>>
  /** A skill replaces this property of the normal attack instead of multiplying it again. */
  readonly overriddenItems?: readonly TraitStructureEffect['item'][]
  readonly disabledEffectIds?: readonly string[]
  /** Skill-specific changes to a stored charge apply after resolving the trait's cap. */
  readonly attackRatioScale?: number
}

export interface TraitCombatEvaluation {
  readonly effectId: string
  readonly status: 'APPLIED' | 'CONDITION_FALSE' | 'NOT_RELEVANT' | 'UNSUPPORTED'
  readonly value: string
  readonly reason: string
}

export interface TraitCombatResult {
  damageType?: 'PHYSICAL' | 'ARTS'
  hitCount?: number
  maxTargets?: number | null
  attackScale: number
  attackRatio: number
  splashScale?: number
  evaluations: TraitCombatEvaluation[]
  blockers: string[]
}

/** Evaluates trait effects shared with the structure page; no operator or job branches. */
export function evaluateTraitStructure(structure: TraitStructure | null, context: TraitCombatContext): TraitCombatResult {
  const result: TraitCombatResult = { attackScale: 1, attackRatio: 0, evaluations: [], blockers: [] }
  if (!structure) return result
  const row = (effect: TraitStructureEffect, status: TraitCombatEvaluation['status'], value = '—', reason = '') =>
    result.evaluations.push({ effectId: effect.id, status, value, reason })
  const block = (effect: TraitStructureEffect, reason: string) => {
    row(effect, 'UNSUPPORTED', '未確認', reason)
    result.blockers.push(`特性「${formatTraitStructureEffectItem(effect.item)}」：${reason}`)
  }
  if (structure.status === 'UNREVIEWED') {
    result.blockers.push(...(structure.issues.length ? structure.issues : ['特性の構造化データを確認できません。']))
    for (const effect of structure.effects) row(effect, 'UNSUPPORTED', '未確認', '特性の確認済み定義と一致しません。')
    return result
  }
  const seen = new Set<string>()
  for (const effect of structure.effects) {
    if (seen.has(effect.id)) { block(effect, '効果IDが重複しています。'); continue }
    seen.add(effect.id)
    if (context.overriddenItems?.includes(effect.item) || context.disabledEffectIds?.includes(effect.id)) {
      row(effect, 'NOT_RELEVANT', '—', 'スキルの攻撃定義で上書きします。')
      continue
    }
    if (effect.application === 'BASE_ATTRIBUTE' || effect.calculationRelevance === 'NOT_RELEVANT'
      || effect.item === 'RANGED_ATTACK_ENABLED' || effect.item === 'ATTACK_RANGE'
      || effect.operation === 'RESET_SOURCE_VALUE') {
      row(effect, 'NOT_RELEVANT', '—', effect.application === 'BASE_ATTRIBUTE'
        ? '基本ステータスを参照し、追加の補正は行いません。' : '固定条件の直接ダメージには加算しません。')
      continue
    }
    if (effect.timing.type === 'EVENT' && effect.timing.event === 'NORMAL_ATTACK'
      && context.kind !== 'NORMAL' && context.kind !== 'NEXT_ATTACK') {
      row(effect, 'NOT_RELEVANT', '—', '通常攻撃の規則は、この攻撃動作に適用しません。')
      continue
    }
    const active = evaluateCombatCondition(effect.condition, context.metrics)
    if (active === false) { row(effect, 'CONDITION_FALSE'); continue }
    if (active === null) { block(effect, '適用条件を解決できません。'); continue }
    const timingSupported = effect.timing.type === 'CONTINUOUS'
      && (effect.timing.while === 'DEPLOYED' || effect.timing.while === 'ALWAYS')
      || effect.timing.type === 'EVENT' && ['ATTACK', 'NORMAL_ATTACK'].includes(effect.timing.event)
    if (!timingSupported || effect.target.side !== 'SELF' || effect.target.scope !== 'SELF'
      || !effect.target.includeSelf || effect.target.selection.type !== 'ALL'
      || !['CURRENT_EVENT', 'WHILE_SOURCE_ACTIVE'].includes(effect.lifetime.type)
      || effect.target.factionIds.length || effect.target.tagIds.length || effect.eventActor
      || effect.restrictions.length || effect.afterEffects?.length
      || resolveCombatProbability(effect.probability, context.metrics) !== 1) {
      block(effect, 'この効果の発動範囲・確率・制限には対応していません。')
      continue
    }
    const numeric = (value: CombatNumericValue, integer = false) => {
      const resolved = resolveCombatNumericValue(value, context.metrics)
      return resolved !== null && resolved >= 0 && (!integer || Number.isSafeInteger(resolved)) ? resolved : null
    }
    if (effect.item === 'ATTACK_SCALE') {
      const value = numeric(effect.value)
      if (value === null) { block(effect, '攻撃力倍率を解決できません。'); continue }
      result.attackScale *= value
      row(effect, 'APPLIED', `×${formatCombatNumber(value)}`)
    } else if (effect.item === 'DAMAGE_TYPE') {
      result.damageType = effect.value
      row(effect, 'APPLIED', effect.value === 'ARTS' ? '術' : '物理')
    } else if (effect.item === 'HIT_COUNT' || effect.item === 'MAX_TARGETS') {
      const value = numeric(effect.value, true)
      if (value === null || value < 1) { block(effect, '攻撃回数・対象数を解決できません。'); continue }
      if (effect.item === 'HIT_COUNT') result.hitCount = value
      else result.maxTargets = value
      row(effect, 'APPLIED', `${formatCombatNumber(value)}${effect.item === 'HIT_COUNT' ? '回' : '体'}`)
    } else if (effect.item === 'ATTACK_TARGETING') {
      const count = context.metrics['attack.targetCount']
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
        block(effect, '範囲内の攻撃対象数を指定してください。'); continue
      }
      // The selected targets are assumed to be in the attack area; this is not geometry simulation.
      result.maxTargets = effect.value.maxTargets
      row(effect, 'APPLIED', `${formatCombatNumber(count)}体`, '指定した範囲内の対象数で計算します。')
    } else if (effect.item === 'SPLASH_DAMAGE') {
      const value = numeric(effect.value.attackScale)
      if (value === null || effect.value.includeMainTarget || effect.value.center !== 'ATTACK_TARGET'
        || effect.value.damageType !== 'PHYSICAL') {
        block(effect, '周囲へのダメージ定義を解決できません。'); continue
      }
      result.splashScale = value
      const count = context.metrics['attack.targetCount']
      row(effect, typeof count === 'number' && count <= 1 ? 'CONDITION_FALSE' : 'APPLIED',
        `×${formatCombatNumber(value)}`, typeof count === 'number' && count <= 1 ? '主対象の周囲に攻撃対象がいません。' : '')
    } else if (effect.item === 'ATK_BUFF_RATIO' && effect.operation === 'INCREASE_TO_CAP') {
      const maximum = numeric(effect.value.maxRatio), charge = context.metrics.traitChargePercent
      const scale = context.attackRatioScale ?? 1
      if (maximum === null || typeof charge !== 'number' || !Number.isFinite(charge) || charge < 0 || charge > 100
        || !Number.isFinite(scale) || scale < 0) {
        block(effect, '特性の攻撃力上限・蓄積率・スキル補正を解決できません。'); continue
      }
      const value = maximum * charge / 100 * scale
      result.attackRatio += value
      row(effect, 'APPLIED', `＋${formatCombatNumber(value * 100)}％`, '指定した蓄積率で計算します。')
    } else if (effect.item === 'NORMAL_ATTACK_ENABLED') {
      if (!effect.value && (context.kind === 'NORMAL' || context.kind === 'NEXT_ATTACK')) {
        block(effect, 'この条件では通常攻撃を行いません。')
      } else row(effect, 'NOT_RELEVANT')
    } else {
      block(effect, 'この効果をダメージ計算へ適用する処理がありません。')
    }
  }
  if (!Number.isFinite(result.attackScale) || !Number.isFinite(result.attackRatio)) result.blockers.push('特性の補正値が有効範囲外です。')
  return result
}
