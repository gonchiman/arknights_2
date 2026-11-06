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
  'ARTS_DAMAGE_FLAT_ADDITION',
  'WEAKPOINT_DAMAGE',
  'DRONE_MAXIMUM_MULTIPLIER', 'EXTRA_DRONES',
  'DAMAGE_CAP_PER_TARGET',
  'STORED_CHARGE_SCALE', 'EXTRA_STORED_CHARGES', 'ATK_BUFF_RATIO', 'ATK_FLAT', 'ATK_FINAL_FLAT', 'ATTACK_SCALE', 'ATTACK_SPEED', 'DAMAGE_SCALE',
  'SPLASH_DAMAGE_SCALE', 'DEFENSE_IGNORE_RATIO', 'RESISTANCE_IGNORE_FIXED',
  'RESISTANCE_IGNORE_RATIO', 'DEFENSE_REDUCTION_RATIO', 'CRITICAL_ATTACK', 'ADDITIONAL_ATTACK',
  'DAMAGE_OVER_TIME', 'ATTACK_INTERVAL_ADD', 'MINIMUM_DAMAGE_RATIO', 'DEFENSE_IGNORE_FIXED', 'RESISTANCE_REDUCTION_RATIO',
  'DEFENSE_REDUCTION_FIXED', 'DEFENSE_REDUCTION_FINAL_FIXED', 'RESISTANCE_REDUCTION_FIXED',
])
const operations: Readonly<Record<string, readonly [string, string]>> = {
  ARTS_DAMAGE_FLAT_ADDITION: ['ADD_VALUE', 'POINT'],
  WEAKPOINT_DAMAGE: ['SET_ENABLED', 'BOOLEAN'],
  DRONE_MAXIMUM_MULTIPLIER: ['MULTIPLY', 'MULTIPLIER'], EXTRA_DRONES: ['ADD_VALUE', 'POINT'],
  DAMAGE_CAP_PER_TARGET: ['SET', 'POINT'],
  STORED_CHARGE_SCALE: ['MULTIPLY', 'MULTIPLIER'], EXTRA_STORED_CHARGES: ['ADD_VALUE', 'POINT'],
  ATTACK_INTERVAL_ADD: ['ADD_VALUE', 'SECOND'], MINIMUM_DAMAGE_RATIO: ['SET', 'RATIO'],
  DEFENSE_IGNORE_FIXED: ['IGNORE_FIXED', 'POINT'],
  DEFENSE_REDUCTION_FIXED: ['ADD_VALUE', 'POINT'], RESISTANCE_REDUCTION_FIXED: ['ADD_VALUE', 'POINT'],
  DEFENSE_REDUCTION_FINAL_FIXED: ['ADD_VALUE', 'POINT'], ATK_FINAL_FLAT: ['ADD_VALUE', 'POINT'],
  RESISTANCE_REDUCTION_RATIO: ['ADD_RATIO', 'RATIO'],
  ATK_BUFF_RATIO: ['ADD_RATIO', 'RATIO'], ATK_FLAT: ['ADD_VALUE', 'POINT'],
  ATTACK_SCALE: ['MULTIPLY', 'MULTIPLIER'], ATTACK_SPEED: ['ADD_VALUE', 'POINT'],
  DAMAGE_SCALE: ['MULTIPLY', 'MULTIPLIER'], SPLASH_DAMAGE_SCALE: ['MULTIPLY', 'MULTIPLIER'],
  DEFENSE_IGNORE_RATIO: ['IGNORE_RATIO', 'RATIO'], RESISTANCE_IGNORE_FIXED: ['IGNORE_FIXED', 'POINT'],
  RESISTANCE_IGNORE_RATIO: ['IGNORE_RATIO', 'RATIO'], DEFENSE_REDUCTION_RATIO: ['ADD_RATIO', 'RATIO'],
  CRITICAL_ATTACK: ['MULTIPLY', 'MULTIPLIER'], ADDITIONAL_ATTACK: ['DEAL_DAMAGE', 'MULTIPLIER'],
}

function supportsContext(effect: TalentStructureEffect, metrics: Metrics): boolean {
  if (effect.timing.type === 'EVENT' && effect.timing.event === 'ELEMENTAL_BURST'
    && (effect.item !== 'ADDITIONAL_ATTACK' || effect.condition === null || effect.rate !== 'PER_ATTACK')) return false
  if (effect.item === 'ADDITIONAL_ATTACK' && effect.basis === 'TARGET_DEFENSE'
    && (effect.rate !== 'PER_ATTACK' || effect.flatDamage !== undefined)) return false
  const expected = operations[effect.item]
  if (effect.item === 'DAMAGE_OVER_TIME') {
    if (effect.operation !== 'DEAL_DAMAGE' || effect.damage.kind.type !== 'ORDINARY'
      || effect.damage.rate !== 'PER_SECOND') return false
    if (effect.damage.amount.basis === 'ATK_RATIO' && (effect.damage.amount.reference !== 'SOURCE'
      || effect.damage.amount.referenceTime === 'UNSPECIFIED')) return false
  } else if (!expected || effect.operation !== expected[0] || effect.unit !== expected[1]) return false
  const chance = resolveCombatNumericValue(effect.probability.chance, metrics)
  if (chance === null || !Number.isFinite(chance) || chance < 0 || chance > 1) return false
  if (effect.probability.rollScope !== 'APPLICATION'
    && !(effect.probability.rollScope === 'TICK' && effect.timing.type === 'PERIODIC'
      && effect.item === 'ADDITIONAL_ATTACK' && effect.rate === 'PER_SECOND')) return false
  if (chance !== 1 && effect.item !== 'CRITICAL_ATTACK' && effect.item !== 'ADDITIONAL_ATTACK'
    && !(['ATK_BUFF_RATIO', 'DEFENSE_IGNORE_RATIO'].includes(effect.item) && effect.timing.type === 'EVENT' && effect.timing.event === 'ATTACK'
      && effect.lifetime.type === 'CURRENT_EVENT')) return false
  if (effect.afterEffects?.length || effect.timing.type === 'AFTER_EVENT'
    || effect.lifetime.type === 'UNSPECIFIED' || effect.lifetime.type === 'WHILE_CONDITION') return false
  if (effect.target.selection.type !== 'ALL'
    && !(effect.item === 'ADDITIONAL_ATTACK' && ['COUNT', 'RANDOM'].includes(effect.target.selection.type))) return false
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
  // Counterfactual attacks must re-evaluate arts-only enemy vulnerabilities as well as self buffs.
  if (metrics['virtual.attackTypeComparison'] === true && effect.target.tagIds.includes('arts_damage')
    && metrics['attack.damageType'] !== 'ARTS') return false
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
  if ((effect.item === 'STORED_CHARGE_SCALE' || effect.item === 'EXTRA_STORED_CHARGES') && metrics.actionKind !== 'NORMAL') return false
  if (effect.target.side === 'ALLY' && !effect.target.includeSelf) return false
  if (effect.item === 'ATK_BUFF_RATIO' || effect.item === 'ATK_FLAT' || effect.item === 'ATK_FINAL_FLAT' || effect.item === 'ATTACK_SPEED'
    || effect.item === 'ATTACK_INTERVAL_ADD') {
    if (effect.target.side !== 'SELF' && !(effect.target.side === 'ALLY' && effect.target.includeSelf)) return false
  }
  if (effect.timing.type === 'EVENT') {
    if (effect.timing.event === 'NORMAL_ATTACK' && metrics.actionKind !== 'NORMAL') return false
    if (effect.timing.event === 'SKILL_START' && metrics.actionKind !== 'SKILL_ACTION' && metrics.includesSkillActivation !== true) return false
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
        { timing: formatCombatTiming(effect.timing), condition: formatCurrentRecipientCondition(effect.condition) })
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
      condition: formatCurrentRecipientCondition(effect.condition),
    }
    const numeric = (value: CombatNumericValue, name: string): number | null => {
      const resolved = resolveCombatNumericValue(value, metrics)
      if (resolved === null) block(`効果「${effect.id}」の${name}を確認できません。`)
      return resolved
    }
    if (effect.item === 'DAMAGE_OVER_TIME') {
      // This is the rate of one currently applied DOT, not a simulation of its
      // application cadence, refreshes, stacking, or finite-duration damage.
      if (effect.damage.kind.type !== 'ORDINARY') continue
      const amount = effect.damage.amount
      const rate = numeric(amount.basis === 'FIXED' ? amount.value : amount.ratio,
        amount.basis === 'FIXED' ? '毎秒ダメージ' : '毎秒ダメージの攻撃力比率')
      if (rate === null) continue
      if (rate < 0) { block('継続ダメージの毎秒値が有効範囲外です。'); continue }
      if (active) output.additionalActions.push({ label: source, role: 'ADDITIONAL', damageType: effect.damage.kind.damageType,
        ...(amount.basis === 'FIXED' ? { scale: 0, flatDamage: rate } : { scale: rate, basis: 'ATK_STAT' }),
        hits: 1, timing: 'PER_SECOND' })
      addRow('付与中のダメージ/秒', amount.basis === 'FIXED' ? formatCombatNumber(rate) : `攻撃力×${formatCombatNumber(rate)}`,
        active ? 'APPLIED' : 'CONDITION_FALSE', '', details)
      continue
    }
    if (effect.item === 'WEAKPOINT_DAMAGE') {
      if (effect.value !== true) { block('弱点ダメージの有効化が不正です。'); continue }
      if (active) output.weakpointDamage = true
      addRow('弱点ダメージ', '有効', active ? 'APPLIED' : 'CONDITION_FALSE', '', details)
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
      case 'DRONE_MAXIMUM_MULTIPLIER':
        if (value < 1) { block('浮遊ユニットの上限補正が有効範囲外です。'); break }
        if (active) output.droneMaximumMultiplier = (output.droneMaximumMultiplier ?? 1) * value
        addRow('浮遊ユニットの倍率上限補正', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'EXTRA_DRONES':
        if (!Number.isSafeInteger(value) || value < 0 || value > 100) { block('追加浮遊ユニット数が有効範囲外です。'); break }
        if (active) output.extraDrones = (output.extraDrones ?? 0) + value
        addRow('追加浮遊ユニット数', `${value}体`, status, '', details)
        break
      case 'ATK_BUFF_RATIO':
        if (value < -1) { block('攻撃力増加割合が有効範囲外です。'); break }
        if (active && probability !== 1 && probability !== 0) {
          if (output.critChance !== 0) { block('複数の確率攻撃補正の同時適用は未対応です。'); break }
          output.critChance = probability!
          output.critScale = 1
          output.criticalAttackRatio = value
        } else if (active && probability === 1) output.attackRatio += value
        addRow('攻撃力', `＋${percent(value)}`, status, '', { ...details, ...(probability === 1 ? {} : { probability: probability! }) })
        break
      case 'ATK_FLAT':
        if (active) output.attackFlat += value
        addRow('攻撃力（固定値）', `＋${formatCombatNumber(value)}`, status, '', details)
        break
      case 'ATK_FINAL_FLAT':
        if (active) output.attackFinalFlat = (output.attackFinalFlat ?? 0) + value
        addRow('攻撃力（最終加算）', `＋${formatCombatNumber(value)}`, status, '', details)
        break
      case 'STORED_CHARGE_SCALE':
        if (value < 0) { block('貯蔵弾の倍率が有効範囲外です。'); break }
        if (active) output.storedChargeScale = (output.storedChargeScale ?? 1) * value
        addRow('貯蔵弾の攻撃倍率', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'EXTRA_STORED_CHARGES':
        if (!Number.isSafeInteger(value) || value < 0) { block('追加貯蔵弾数が有効範囲外です。'); break }
        if (active) output.extraStoredCharges = (output.extraStoredCharges ?? 0) + value
        addRow('追加貯蔵弾数', `${value}発`, status, '', details)
        break
      case 'ATTACK_SCALE':
        if (active) output.attackScale *= value
        addRow('攻撃倍率', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'ATTACK_SPEED':
        if (active) output.attackSpeed += value
        addRow('攻撃速度', `＋${formatCombatNumber(value)}`, status, '', details)
        break
      case 'ATTACK_INTERVAL_ADD':
        if (active) output.attackIntervalAdd = (output.attackIntervalAdd ?? 0) + value
        addRow('攻撃間隔の加算', `${value < 0 ? '' : '＋'}${formatCombatNumber(value)}秒`, status, '', details)
        break
      case 'MINIMUM_DAMAGE_RATIO':
        if (value < 0 || value > 1) { block('最低ダメージの攻撃力比率が有効範囲外です。'); break }
        if (active) output.minimumDamageRatio = Math.max(output.minimumDamageRatio ?? 0, value)
        addRow('最低ダメージの攻撃力比率', percent(value), status, '', details)
        break
      case 'DEFENSE_IGNORE_FIXED':
        if (value < 0) { block('防御力固定無視が有効範囲外です。'); break }
        if (active) output.defenseIgnoreFixed += value
        addRow('防御力固定無視', formatCombatNumber(value), status, '', details)
        break
      case 'DAMAGE_SCALE':
        if (active) output.damageScale *= value
        addRow('与ダメージ', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'ARTS_DAMAGE_FLAT_ADDITION':
        if (value < 0) { block('術ダメージ固定加算は0以上で指定してください。'); break }
        if (active) output.artsDamageFlatAddition = (output.artsDamageFlatAddition ?? 0) + value
        addRow('術ダメージ固定加算（軽減前）', `＋${formatCombatNumber(value)}`, status, '', details)
        break
      case 'DAMAGE_CAP_PER_TARGET':
        if (value < 0) { block('対象ごとのダメージ上限が有効範囲外です。'); break }
        if (active) output.damageCapPerTarget = Math.min(output.damageCapPerTarget ?? Infinity, value)
        addRow('対象ごとのダメージ上限', formatCombatNumber(value), status, '', details)
        break
      case 'SPLASH_DAMAGE_SCALE':
        if (active) output.splashDamageScale = (output.splashDamageScale ?? 1) * value
        addRow('範囲対象の与ダメージ', `×${formatCombatNumber(value)}`, status, '', details)
        break
      case 'DEFENSE_IGNORE_RATIO':
        if (value < 0 || value > 1) { block('防御力無視の割合が有効範囲外です。'); break }
        if (active && probability !== 1 && probability !== 0) {
          if (output.critChance !== 0) { block('確率防御無視と別の確率攻撃補正の同時適用は未対応です。'); break }
          output.critChance = probability!
          output.critScale = 1
          output.criticalDefenseIgnoreRatio = value
        } else if (active && probability === 1) {
          // A guaranteed proc still belongs to the attack event; it must not
          // become a permanent modifier of stat-based periodic damage.
          const attackOnly = effect.timing.type === 'EVENT' && effect.timing.event === 'ATTACK'
            && effect.lifetime.type === 'CURRENT_EVENT'
          if (attackOnly) output.attackDefenseIgnoreRatio = 1 - (1 - (output.attackDefenseIgnoreRatio ?? 0)) * (1 - value)
          else output.defenseIgnoreRatio = 1 - (1 - output.defenseIgnoreRatio) * (1 - value)
        }
        addRow('防御力無視', percent(value), status, '', { ...details, ...(probability === 1 ? {} : { probability: probability! }) })
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
      case 'DEFENSE_REDUCTION_FIXED':
      case 'DEFENSE_REDUCTION_FINAL_FIXED':
      case 'RESISTANCE_REDUCTION_FIXED': {
        if (value < 0) { block('固定低下量は0以上で指定してください。'); break }
        const key = effect.item === 'DEFENSE_REDUCTION_FIXED' ? 'defenseReductionFixed'
          : effect.item === 'DEFENSE_REDUCTION_FINAL_FIXED' ? 'defenseReductionFinalFixed' : 'resistanceReductionFixed'
        if (active) output[key] = (output[key] ?? 0) + value
        addRow(formatTalentStructureEffectItem(effect.item), `－${formatCombatNumber(value)}`, status, '', details)
        break
      }
      case 'RESISTANCE_REDUCTION_RATIO':
        if (value < 0 || value > 1) { block('術耐性低下の割合が有効範囲外です。'); break }
        if (active) output.resistanceReductionRatio = 1 - (1 - (output.resistanceReductionRatio ?? 0)) * (1 - value)
        addRow('術耐性低下', `－${percent(value)}`, status, '', details)
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
        // RANDOM uses the same expected total for a homogeneous selected enemy pool.
        // The recipe must constrain the pool; this does not assign hits to named enemies.
        const targetLimit = effect.target.selection.type !== 'ALL' ? numeric(effect.target.selection.count, '対象数') : undefined
        const actualTargets = Number(metrics.actualAttackTargetCount ?? 1)
        if (targetLimit === null) break
        if (targetLimit !== undefined && (!Number.isSafeInteger(targetLimit) || targetLimit < 1
          || !Number.isSafeInteger(actualTargets) || actualTargets < 1)) { block('追加攻撃の対象数が有効範囲外です。'); break }
        if (chance === null || hits === null || flatDamage === null) break
        if (chance < 0 || chance > 1 || hits < 0 || value < 0 || (flatDamage !== undefined && flatDamage < 0)) {
          block('追加攻撃の発動確率・回数・ダメージが有効範囲外です。')
          break
        }
        if (active) output.additionalActions.push({ label: effect.label ?? source, role: 'ADDITIONAL', damageType: effect.damageType,
          ...(effect.damageKind === undefined ? {} : { damageKind: effect.damageKind }),
          scale: value, ...(effect.hits === undefined ? {} : { hits }),
          ...(effect.basis === undefined ? {} : { basis: effect.basis }),
          ...(flatDamage === undefined ? {} : { flatDamage }),
          ...(targetLimit === undefined ? {} : { targets: Math.min(targetLimit, actualTargets) }),
          ...(effect.probability.chance === 1 ? {} : { probability: chance }),
          ...(effect.rate === 'PER_SECOND' ? { timing: 'PER_SECOND' } : {}),
        })
        addRow(effect.rate === 'PER_SECOND' ? '追加ダメージ/秒' : '追加ダメージ',
          flatDamage === undefined ? `${effect.basis === 'TARGET_DEFENSE' ? '対象の防御力' : ''}×${formatCombatNumber(value)}` : formatCombatNumber(flatDamage), status, '',
          { ...details, ...(chance === 1 ? {} : { probability: chance }) })
        break
      }
      default:
        block(`効果「${effect.id}」の計算操作が未対応です。`)
    }
  }
}
