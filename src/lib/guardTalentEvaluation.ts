import {
  evaluateCombatCondition, resolveCombatNumericValue, formatCombatCondition, formatCombatTiming,
  formatCombatNumber, type CombatCondition, type CombatNumericValue, type CombatScalar,
} from './combatEffectStructure.ts'
import { formatTalentStructureEffectItem, formatTalentStructureEffectValue,
  type TalentStructure, type TalentStructureEffect } from './talentStructure.ts'
import type { GuardPassiveModifiers } from './guardCombatTypes.ts'

type Metrics = Readonly<Record<string, CombatScalar | null | undefined>>
type Evaluation = GuardPassiveModifiers['evaluations'][number]

/** These are calculation operations, independent of an operator or talent identity. */
const damageItems: ReadonlySet<TalentStructureEffect['item']> = new Set([
  'ATK_BUFF_RATIO', 'ATK_FLAT', 'ATTACK_SCALE', 'ATTACK_SPEED', 'DAMAGE_SCALE',
  'SPLASH_DAMAGE_SCALE', 'DEFENSE_IGNORE_RATIO', 'RESISTANCE_IGNORE_FIXED',
  'RESISTANCE_IGNORE_RATIO', 'DEFENSE_REDUCTION_RATIO', 'CRITICAL_ATTACK', 'ADDITIONAL_ATTACK',
  'DAMAGE_OVER_TIME',
])
const operations: Readonly<Record<string, readonly [string, string]>> = {
  ATK_BUFF_RATIO: ['ADD_RATIO', 'RATIO'], ATK_FLAT: ['ADD_VALUE', 'POINT'],
  ATTACK_SCALE: ['MULTIPLY', 'MULTIPLIER'], ATTACK_SPEED: ['ADD_VALUE', 'POINT'],
  DAMAGE_SCALE: ['MULTIPLY', 'MULTIPLIER'], SPLASH_DAMAGE_SCALE: ['MULTIPLY', 'MULTIPLIER'],
  DEFENSE_IGNORE_RATIO: ['IGNORE_RATIO', 'RATIO'], RESISTANCE_IGNORE_FIXED: ['IGNORE_FIXED', 'POINT'],
  RESISTANCE_IGNORE_RATIO: ['IGNORE_RATIO', 'RATIO'], DEFENSE_REDUCTION_RATIO: ['ADD_RATIO', 'RATIO'],
  CRITICAL_ATTACK: ['MULTIPLY', 'MULTIPLIER'], ADDITIONAL_ATTACK: ['DEAL_DAMAGE', 'MULTIPLIER'],
}

function supportsContext(effect: TalentStructureEffect, metrics: Metrics): boolean {
  const expected = operations[effect.item]
  if (effect.item === 'DAMAGE_OVER_TIME') {
    if (effect.operation !== 'DEAL_DAMAGE' || effect.damage.kind.type !== 'ORDINARY'
      || effect.damage.amount.basis !== 'FIXED' || effect.damage.rate !== 'PER_SECOND') return false
  } else if (!expected || effect.operation !== expected[0] || effect.unit !== expected[1]) return false
  const chance = resolveCombatNumericValue(effect.probability.chance, metrics)
  if (chance === null || !Number.isFinite(chance) || chance < 0 || chance > 1) return false
  if (effect.probability.rollScope !== 'APPLICATION'
    && !(effect.probability.rollScope === 'TICK' && effect.timing.type === 'PERIODIC'
      && effect.item === 'ADDITIONAL_ATTACK' && effect.rate === 'PER_SECOND')) return false
  if (chance !== 1 && effect.item !== 'CRITICAL_ATTACK' && effect.item !== 'ADDITIONAL_ATTACK') return false
  if (effect.afterEffects?.length || effect.timing.type === 'AFTER_EVENT'
    || effect.lifetime.type === 'UNSPECIFIED' || effect.lifetime.type === 'WHILE_CONDITION') return false
  if (effect.target.selection.type !== 'ALL') return false
  if (effect.timing.type === 'PERIODIC'
    && (effect.item !== 'ADDITIONAL_ATTACK' || effect.rate !== 'PER_SECOND'
      || effect.timing.intervalSeconds === null || effect.timing.intervalSeconds <= 0)) return false
  if (effect.timing.type === 'EVENT' && effect.timing.event === 'DAMAGE_RECEIVED'
    && (effect.item === 'ADDITIONAL_ATTACK' || effect.condition === null || effect.lifetime.type !== 'FIXED_SECONDS')) return false
  if (effect.timing.type === 'EVENT'
    && ['DEPLOY', 'RETREAT', 'LETHAL_DAMAGE', 'KILL', 'SKILL_END'].includes(effect.timing.event)) return false
  if (effect.lifetime.type === 'FIXED_SECONDS'
    && (effect.lifetime.seconds === null || !Number.isFinite(effect.lifetime.seconds) || effect.lifetime.seconds <= 0)) return false
  for (const restriction of effect.restrictions) {
    // A sampled one-attack model never triggers its extra attacks recursively. A one-stack
    // buff with an explicit active-state condition does not need a historical roll count.
    if (restriction.type === 'EXCLUDE_MODIFIER' && restriction.modifier === 'recursive_extra_attack'
      && effect.item === 'ADDITIONAL_ATTACK') continue
    if (restriction.type === 'APPLICATION_LIMIT' && restriction.count === 1
      && restriction.scope === 'SOURCE_LIFETIME' && restriction.reset === 'EFFECT_END'
      && effect.condition !== null && effect.lifetime.type === 'FIXED_SECONDS') continue
    return false
  }
  return true
}

function formatCurrentRecipientCondition(condition: CombatCondition | null): string {
  if (condition?.type === 'COMPARE' && condition.metric === 'recipient.hpRatio'
    && typeof condition.value === 'number') {
    const comparison = { EQ: '＝', NE: '≠', GT: '＞', GTE: '≧', LT: '＜', LTE: '≦' }[condition.comparison]
    return `自身のHP ${comparison} ${formatCombatNumber(condition.value * 100)}％`
  }
  return formatCombatCondition(condition)
}

function matchesRecipient(effect: TalentStructureEffect, metrics: Metrics): boolean | null {
  if (effect.target.side === 'ENEMY') return true
  if (effect.target.factionIds.length) {
    const matches = effect.target.factionIds.map(id => metrics[`source.faction.${id}`])
    if (!matches.includes(true)) return matches.includes(undefined) ? null : false
  }
  for (const tag of effect.target.tagIds) {
    if (tag.startsWith('profession:')) {
      if (metrics['source.profession'] === undefined) return null
      if (metrics['source.profession'] !== tag.slice('profession:'.length)) return false
    } else if (tag === 'arts_damage') {
      if (metrics['attack.damageType'] === undefined) return null
      if (metrics['attack.damageType'] !== 'ARTS') return false
    } else return null
  }
  return true
}

function relevant(effect: TalentStructureEffect, metrics: Metrics): boolean {
  if (!damageItems.has(effect.item)) return false
  if (effect.target.side === 'ALLY' && !effect.target.includeSelf) return false
  if (effect.item === 'ATK_BUFF_RATIO' || effect.item === 'ATK_FLAT' || effect.item === 'ATTACK_SPEED') {
    if (effect.target.side !== 'SELF' && !(effect.target.side === 'ALLY' && effect.target.includeSelf)) return false
  }
  if (effect.timing.type === 'EVENT') {
    if (effect.timing.event === 'NORMAL_ATTACK' && metrics.actionKind !== 'NORMAL') return false
    if (effect.timing.event === 'SKILL_START' && metrics.actionKind !== 'SKILL_ACTION') return false
    if (effect.item === 'ADDITIONAL_ATTACK'
      && ['DEPLOY', 'RETREAT', 'LETHAL_DAMAGE', 'DAMAGE_RECEIVED', 'KILL', 'SKILL_END'].includes(effect.timing.event)) return false
  }
  // Leave user conditions unknown here. Only an action-type exclusion means that the
  // operation is irrelevant; a false HP/status condition is still a supported effect.
  return evaluateCombatCondition(effect.condition, { actionKind: metrics.actionKind }) !== false
}

/** Apply the same semantic effects that the talent-structure page renders.
 * No operator-specific numerical formula is interpreted here.
 */
export function applyGuardTalentStructure(output: GuardPassiveModifiers, structure: TalentStructure,
  metrics: Metrics, registrationOnly = false): void {
  const source = structure.basicInfo.talentName
  const addRow = (item: string, value: string, status: Evaluation['status'], reason = '',
    details: Partial<Pick<Evaluation, 'probability' | 'timing' | 'condition'>> = {}) => {
    output.evaluations.push({ source, sourceKind: 'TALENT', talentIndex: structure.basicInfo.talentIndex,
      item, value, status, reason, ...details })
  }
  const block = (reason: string) => {
    if (registrationOnly) return
    output.blockers.push(`${source}：${reason}`)
    addRow('計算条件', '未確定', 'UNSUPPORTED', reason)
  }
  for (const constraint of structure.constraints ?? []) {
    if (evaluateCombatCondition(constraint.condition, metrics) !== true) block(constraint.reason)
  }
  for (const issue of structure.issues) block(issue)
  output.notes.push(...structure.notes)

  for (const effect of structure.effects) {
    if (!relevant(effect, metrics)) {
      addRow(formatTalentStructureEffectItem(effect.item), formatTalentStructureEffectValue(effect), 'NOT_RELEVANT',
        `${formatCombatTiming(effect.timing)}の${formatTalentStructureEffectItem(effect.item)}は、選択した1攻撃・発動1回の直接ダメージとDPSには加算しません。`,
        { timing: formatCombatTiming(effect.timing), ...(effect.condition ? { condition: formatCurrentRecipientCondition(effect.condition) } : {}) })
      continue
    }
    if (registrationOnly) {
      // Coverage describes registered operations even when live source values are absent.
      addRow(effect.item, '—', 'APPLIED')
      continue
    }
    const probability = resolveCombatNumericValue(effect.probability.chance, metrics)
    if (probability !== null && (probability < 0 || probability > 1)) { block(`効果「${effect.id}」の発動確率が有効範囲外です。`); continue }
    if (!supportsContext(effect, metrics)) { block(`効果「${effect.id}」の演算・単位・発生方式の組合せには未対応です。`); continue }
    const recipient = matchesRecipient(effect, metrics)
    if (recipient === null) { block(`効果「${effect.id}」の対象条件を確認できません。`); continue }
    if (!recipient) {
      addRow(formatTalentStructureEffectItem(effect.item), formatTalentStructureEffectValue(effect), 'NOT_RELEVANT',
        '選択した自身・攻撃は、この効果の対象条件に該当しません。')
      continue
    }
    const active = evaluateCombatCondition(effect.condition, metrics)
    if (active === null) { block(`効果「${effect.id}」の適用条件を確認できません。`); continue }
    const details: Partial<Pick<Evaluation, 'probability' | 'timing' | 'condition'>> = {
      timing: formatCombatTiming(effect.timing),
      ...(effect.condition ? { condition: formatCurrentRecipientCondition(effect.condition) } : {}),
    }
    const numeric = (value: CombatNumericValue, name: string): number | null => {
      const resolved = resolveCombatNumericValue(value, metrics)
      if (resolved === null) block(`効果「${effect.id}」の${name}を確認できません。`)
      return resolved
    }
    if (effect.item === 'DAMAGE_OVER_TIME') {
      // This is the rate of one currently applied DOT, not a simulation of its
      // application cadence, refreshes, stacking, or finite-duration damage.
      if (effect.damage.kind.type !== 'ORDINARY' || effect.damage.amount.basis !== 'FIXED') continue
      const rate = numeric(effect.damage.amount.value, '毎秒ダメージ')
      if (rate === null) continue
      if (rate < 0) { block('継続ダメージの毎秒値が有効範囲外です。'); continue }
      if (active) output.additionalActions.push({ label: source, damageType: effect.damage.kind.damageType,
        scale: 0, flatDamage: rate, hits: 1, timing: 'PER_SECOND' })
      addRow('付与中のダメージ/秒', formatCombatNumber(rate), active ? 'APPLIED' : 'CONDITION_FALSE', '', details)
      continue
    }
    if (!('value' in effect) || typeof effect.value === 'boolean' || effect.value === undefined) {
      block(`効果「${effect.id}」の数値定義を取得できません。`)
      continue
    }
    const value = numeric(effect.value, '値')
    if (value === null) continue
    const percent = (amount: number) => `${Math.round(amount * 100_000) / 1000}％`
    const status = active ? 'APPLIED' : 'CONDITION_FALSE'
    switch (effect.item) {
      case 'ATK_BUFF_RATIO':
        if (active) output.attackRatio += value
        addRow('攻撃力', `＋${percent(value)}`, status, '', details)
        break
      case 'ATK_FLAT':
        if (active) output.attackFlat += value
        addRow('攻撃力（固定値）', `＋${formatCombatNumber(value)}`, status, '', details)
        break
      case 'ATTACK_SCALE':
        if (active) output.attackScale *= value
        addRow('攻撃倍率', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'ATTACK_SPEED':
        if (active) output.attackSpeed += value
        addRow('攻撃速度', `＋${formatCombatNumber(value)}`, status, '', details)
        break
      case 'DAMAGE_SCALE':
        if (active) output.damageScale *= value
        addRow('与ダメージ', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'SPLASH_DAMAGE_SCALE':
        if (active) output.splashDamageScale = (output.splashDamageScale ?? 1) * value
        addRow('範囲対象の与ダメージ', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'DEFENSE_IGNORE_RATIO':
        if (active) output.defenseIgnoreRatio = 1 - (1 - output.defenseIgnoreRatio) * (1 - value)
        addRow('防御力無視', percent(value), status, '', details)
        break
      case 'RESISTANCE_IGNORE_FIXED':
        if (active) output.resistanceIgnoreFixed += value
        addRow('術耐性無視', formatCombatNumber(value), status, '', details)
        break
      case 'RESISTANCE_IGNORE_RATIO':
        if (active) output.resistanceIgnoreRatio = 1 - (1 - output.resistanceIgnoreRatio) * (1 - value)
        addRow('術耐性無視', percent(value), status, '', details)
        break
      case 'DEFENSE_REDUCTION_RATIO':
        if (active) output.defenseReductionRatio = 1 - (1 - output.defenseReductionRatio) * (1 - value)
        addRow('防御力低下', `－${percent(value)}`, status, '', details)
        break
      case 'CRITICAL_ATTACK': {
        const chance = numeric(effect.probability.chance, '発動確率')
        if (chance === null) break
        if (chance < 0 || chance > 1 || value < 0) { block('発動確率・攻撃倍率の参照値が有効範囲外です。'); break }
        if (active) {
          if (output.critChance !== 0) { block('複数の確率攻撃倍率の同時適用は未対応です。'); break }
          output.critChance = chance
          output.critScale = value
        }
        addRow('攻撃倍率', `×${formatCombatNumber(value)}`, status, '', { ...details, probability: chance })
        break
      }
      case 'ADDITIONAL_ATTACK': {
        const chance = numeric(effect.probability.chance, '発動確率')
        const hits = numeric(effect.hits ?? 1, '攻撃回数')
        const flatDamage = effect.flatDamage === undefined ? undefined : numeric(effect.flatDamage, '固定ダメージ')
        if (chance === null || hits === null || flatDamage === null) break
        if (chance < 0 || chance > 1 || hits < 0 || value < 0 || (flatDamage !== undefined && flatDamage < 0)) {
          block('追加攻撃の発動確率・回数・ダメージが有効範囲外です。')
          break
        }
        if (active) output.additionalActions.push({ label: effect.label ?? source, damageType: effect.damageType,
          scale: value, ...(effect.hits === undefined ? {} : { hits }),
          ...(flatDamage === undefined ? {} : { flatDamage }),
          ...(effect.probability.chance === 1 ? {} : { probability: chance }),
          ...(effect.rate === 'PER_SECOND' ? { timing: 'PER_SECOND' } : {}),
        })
        addRow(effect.rate === 'PER_SECOND' ? '追加ダメージ/秒' : '追加ダメージ',
          flatDamage === undefined ? `×${formatCombatNumber(value)}` : formatCombatNumber(flatDamage), status, '',
          { ...details, ...(chance === 1 ? {} : { probability: chance }) })
        break
      }
      default:
        block(`効果「${effect.id}」の計算操作が未対応です。`)
    }
  }
}
