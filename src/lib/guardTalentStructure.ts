import { getOperatorPassives, type PassiveSource } from './operatorProfile.ts'
import type { SkillRecord } from '../types/skill.ts'
import type { DamageType } from './damageCalculator.ts'
import type { TalentCoarseCategory } from './talentCoarseClassification.ts'
import type { TalentStructure, TalentStructureEffect, TalentStructureGrowthSelection, TalentStructureDeferredCase } from './talentStructure.ts'
import type { CombatCondition, CombatNumericValue, CombatRecipientSelector, CombatEffectContext, CombatTiming } from './combatEffectStructure.ts'

/** Common effect vocabulary. The evaluator dispatches on these operations, never operator IDs. */
export type GuardTalentEffectPayload =
  | { readonly item: 'ATK_FLAT' | 'MAX_HP_FLAT' | 'HP_RESTORE_FIXED' | 'SP_RESTORE' | 'AMMO_CAPACITY' | 'FEVER' | 'TAUNT'; readonly operation: 'ADD_VALUE'; readonly value: CombatNumericValue; readonly unit: 'POINT' }
  | { readonly item: 'DEFENSE_BUFF_RATIO' | 'PHYSICAL_DODGE' | 'ARTS_DODGE' | 'DAMAGE_RESISTANCE' | 'PHYSICAL_DAMAGE_RESISTANCE' | 'MIN_HP_RATIO' | 'DEFENSE_REDUCTION_RATIO'; readonly operation: 'ADD_RATIO'; readonly value: CombatNumericValue; readonly unit: 'RATIO' }
  | { readonly item: 'RESISTANCE_IGNORE_RATIO'; readonly operation: 'IGNORE_RATIO'; readonly value: CombatNumericValue; readonly unit: 'RATIO' }
  | { readonly item: 'ATTACK_SCALE' | 'DAMAGE_SCALE' | 'SPLASH_DAMAGE_SCALE' | 'HEAL_RECEIVED_SCALE'; readonly operation: 'MULTIPLY'; readonly value: CombatNumericValue; readonly unit: 'MULTIPLIER' }
  | { readonly item: 'CRITICAL_ATTACK'; readonly operation: 'MULTIPLY'; readonly value: CombatNumericValue; readonly unit: 'MULTIPLIER' }
  | { readonly item: 'ADDITIONAL_ATTACK'; readonly operation: 'DEAL_DAMAGE'; readonly value: CombatNumericValue; readonly unit: 'MULTIPLIER'; readonly damageType: DamageType; readonly flatDamage?: CombatNumericValue; readonly hits?: CombatNumericValue; readonly rate: 'PER_ATTACK' | 'PER_SECOND'; readonly label?: string }
  | { readonly item: 'SP_RECOVERY'; readonly operation: 'ADD_VALUE'; readonly value: CombatNumericValue; readonly unit: 'PER_SECOND' }
  | { readonly item: 'STATUS' | 'ATTACK_BEHAVIOR'; readonly operation: 'SET_ENABLED'; readonly value: true; readonly unit: 'BOOLEAN'; readonly status: string }
  | { readonly item: 'HP_STEAL'; readonly operation: 'ADD_VALUE'; readonly value: CombatNumericValue; readonly maximum: CombatNumericValue; readonly unit: 'POINT' }
  | { readonly item: 'HP_RESTORE_ATK_RATIO'; readonly operation: 'RESTORE'; readonly value: null; readonly unit: 'ATK_RATIO'; readonly range: { readonly minimum: CombatNumericValue; readonly maximum: CombatNumericValue; readonly maximumInclusive: null } }

type N = CombatNumericValue
type C = CombatCondition
type E = TalentStructureEffect
interface Definition {
  readonly operatorId: string; readonly name: string; readonly prefabKey: string
  readonly categories: readonly TalentCoarseCategory[]
  readonly effects: (binding: Binding) => readonly E[]
  readonly notes?: readonly string[]
  readonly deferred?: readonly { title: string; unresolved: string; currentTreatment: string }[]
  readonly constraints?: (binding: Binding) => NonNullable<TalentStructure['constraints']>
}
interface Binding {
  read(key: string): number | null
  descriptionNumber(binding: string, pattern: RegExp, scale?: number): number | null
  issue(message: string): void
}
const metric = (name: string): N => ({ type: 'METRIC', metric: name })
const calc = (operation: 'ADD' | 'MULTIPLY' | 'DIVIDE' | 'MIN' | 'MAX', ...values: N[]): N => ({ type: 'CALC', operation, values })
const add = (...values: N[]): N => calc('ADD', ...values)
const mul = (...values: N[]): N => calc('MULTIPLY', ...values)
const compare = (name: string, comparison: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE', value: string | number | boolean | null): C => ({ type: 'COMPARE', metric: name, comparison, value })
const eq = (name: string, value: string | number | boolean): C => compare(name, 'EQ', value)
const choice = (condition: C, whenTrue: N, whenFalse: N): N => ({ type: 'CONDITIONAL', condition, whenTrue, whenFalse })
const all = (...conditions: C[]): C => ({ type: 'ALL', conditions })
const any = (...conditions: C[]): C => ({ type: 'ANY', conditions })
const skill = (index: number, key: string, otherwise: N): N => choice(eq('skillIndex', index), metric(`skill.${key}`), otherwise)
const self = (): CombatRecipientSelector => recipients('SELF', 'SELF')
const attack = (): CombatRecipientSelector => ({ ...self(), entity: 'ATTACK' })
const enemy = (): CombatRecipientSelector => recipients('ENEMY', 'ATTACK_TARGET')
const allies = (scope: 'SQUAD' | 'BATTLEFIELD' | 'ATTACK_RANGE' | 'ADJACENT' = 'BATTLEFIELD', includeSelf = true): CombatRecipientSelector => recipients('ALLY', scope, includeSelf)
const faction = (id: string, label: string, includeSelf = true): CombatRecipientSelector => ({ ...allies('BATTLEFIELD', includeSelf), factionIds: [id], filterLabels: { [id]: label } })
const tagged = (target: CombatRecipientSelector, id: string, label: string): CombatRecipientSelector => ({ ...target, tagIds: [...target.tagIds, id], filterLabels: { ...target.filterLabels, [id]: label } })
const on = (event: Extract<CombatTiming, { type: 'EVENT' }>['event']): CombatTiming => ({ type: 'EVENT', event })
const during: CombatTiming = { type: 'CONTINUOUS', while: 'DEPLOYED' }
const perSecond: CombatTiming = { type: 'PERIODIC', intervalSeconds: 1, firstTickSeconds: null }
function recipients(side: CombatRecipientSelector['side'], scope: 'SELF' | 'SQUAD' | 'BATTLEFIELD' | 'ATTACK_RANGE' | 'ATTACK_TARGET' | 'DAMAGE_SOURCE' | 'ADJACENT', includeSelf = side === 'SELF'): CombatRecipientSelector {
  return { type: 'RECIPIENTS', side, entity: 'UNIT', scope, includeSelf, factionIds: [], tagIds: [], selection: { type: 'ALL' } }
}
function context(id: string, sourceBinding: string, target = self(), timing = during): CombatEffectContext {
  return { id, sourceBinding, target, timing, condition: null, probability: { chance: 1, rollScope: 'APPLICATION' },
    lifetime: timing.type === 'CONTINUOUS' ? { type: 'WHILE_SOURCE_ACTIVE' } : { type: 'CURRENT_EVENT' }, restrictions: [] }
}
type EffectPayload<T> = T extends CombatEffectContext ? Omit<T, keyof CombatEffectContext> : never
function effect(id: string, sourceBinding: string, payload: EffectPayload<E>, options: Partial<CombatEffectContext> = {}): E {
  return { ...context(id, sourceBinding, options.target, options.timing), ...payload, ...options } as E
}
function atk(id: string, value: N, sourceBinding: string, options: Partial<CombatEffectContext> = {}): E {
  return effect(id, sourceBinding, { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value }, options)
}
function ratio(item: 'DEFENSE_BUFF_RATIO' | 'PHYSICAL_DODGE' | 'ARTS_DODGE' | 'DAMAGE_RESISTANCE' | 'PHYSICAL_DAMAGE_RESISTANCE' | 'MIN_HP_RATIO' | 'DEFENSE_REDUCTION_RATIO', value: N, sourceBinding: string, options: Partial<CombatEffectContext> = {}): E {
  return effect(item.toLowerCase(), sourceBinding, { item, operation: 'ADD_RATIO', value, unit: 'RATIO' }, options)
}
function points(item: 'ATK_FLAT' | 'MAX_HP_FLAT' | 'HP_RESTORE_FIXED' | 'SP_RESTORE' | 'AMMO_CAPACITY' | 'FEVER' | 'TAUNT', value: N, sourceBinding: string, options: Partial<CombatEffectContext> = {}): E {
  return effect(item.toLowerCase(), sourceBinding, { item, operation: 'ADD_VALUE', value, unit: 'POINT' }, options)
}
function scale(item: 'ATTACK_SCALE' | 'DAMAGE_SCALE' | 'SPLASH_DAMAGE_SCALE' | 'HEAL_RECEIVED_SCALE', value: N, sourceBinding: string, options: Partial<CombatEffectContext> = {}): E {
  return effect(item.toLowerCase(), sourceBinding, { item, operation: 'MULTIPLY', value, unit: 'MULTIPLIER' }, options)
}
function status(id: string, statusName: string, sourceBinding: string, options: Partial<CombatEffectContext> = {}): E {
  return effect(id, sourceBinding, { item: 'STATUS', operation: 'SET_ENABLED', value: true, unit: 'BOOLEAN', status: statusName }, options)
}
function behavior(id: string, statusName: string, options: Partial<CombatEffectContext> = {}): E {
  return effect(id, `description:${id}`, { item: 'ATTACK_BEHAVIOR', operation: 'SET_ENABLED', value: true, unit: 'BOOLEAN', status: statusName }, options)
}
function additional(id: string, value: N, sourceBinding: string, damageType: DamageType, options: Partial<CombatEffectContext> = {}, extra: Partial<Extract<GuardTalentEffectPayload, { item: 'ADDITIONAL_ATTACK' }>> = {}): E {
  return effect(id, sourceBinding, { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', value, unit: 'MULTIPLIER', damageType, rate: 'PER_ATTACK', ...extra }, { timing: on('ATTACK'), target: enemy(), ...options })
}
function berserkValue(b: Binding, key: string): N {
  const threshold = b.read('min_hp_ratio')
  if (threshold !== null && (threshold < 0 || threshold >= 1)) b.issue('不屈のHP閾値が有効範囲外です。')
  return mul(b.read(key), calc('MIN', 1, calc('MAX', 0, calc('DIVIDE', add(1, mul(-0.01, metric('selfHpPercent'))), add(1, mul(-1, threshold))))))
}
const once = [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'SOURCE_LIFETIME', reset: 'REDEPLOY' }] as const
const definitions: readonly Definition[] = [
  { operatorId: 'char_264_f12yin', name: 'ハードパンチャー', prefabKey: '1', categories: ['DAMAGE', 'ABILITY'], effects: b => [
    effect('critical-attack', 'atk_scale', { item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', value: b.read('atk_scale'), unit: 'MULTIPLIER' }, { target: attack(), timing: on('ATTACK'), probability: { chance: skill(3, 'talent@prob', b.read('prob')), rollScope: 'APPLICATION', sharedRollId: 'critical-attack' }, parameterBindings: { chance: 'prob / skill:talent@prob' } }),
    atk('enemy-atk-debuff', b.read('atk'), 'atk', { target: enemy(), timing: on('ATTACK'), probability: { chance: skill(3, 'talent@prob', b.read('prob')), rollScope: 'APPLICATION', sharedRollId: 'critical-attack' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('duration') }, restrictions: [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'TARGET', reset: 'EFFECT_END' }] }),
  ] },
  { operatorId: 'char_264_f12yin', name: '頑健', prefabKey: '2', categories: ['ABILITY', 'SURVIVAL'], effects: b => [ratio('DEFENSE_BUFF_RATIO', b.read('def'), 'def'), ratio('PHYSICAL_DODGE', b.read('prob'), 'prob')] },
  { operatorId: 'char_2024_chyue', name: '止戈', prefabKey: '1', categories: ['DAMAGE'], effects: b => [
    scale('DAMAGE_SCALE', b.read('damage_scale'), 'damage_scale', { condition: eq('talentActive', true), target: attack(), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('up_duration') } }),
    status('damage-increase-mark', '与ダメージ上昇の対象', 'prob', { target: enemy(), timing: on('NORMAL_ATTACK'), probability: { chance: b.read('prob'), rollScope: 'APPLICATION' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('up_duration') } }),
  ], notes: ['止戈の適用状態を入力します。確率と効果時間から常時発動とは仮定しません。'] },
  { operatorId: 'char_2024_chyue', name: '万象客となり', prefabKey: '2', categories: ['RESOURCE'], effects: b => [points('SP_RESTORE', b.read('sp'), 'sp', { timing: on('SKILL_END'), condition: compare('skill.killCount', 'GTE', 1) })] },
  { operatorId: 'char_4037_demetr', name: 'ファミリーの流儀', prefabKey: '1', categories: ['DAMAGE'], effects: b => [
    ratio('DEFENSE_REDUCTION_RATIO', calc('MIN', 1, mul(-1, b.read('attack@def'), metric('defenseDebuffStacks'))), 'attack@def', { target: enemy(), timing: on('ATTACK'), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('attack@def_dec_duration') }, parameterBindings: { maxStacks: 'attack@limited_stack_cnt / attack@s2_limited_stack_cnt' } }),
    scale('DAMAGE_SCALE', choice(compare('targetHpPercent', 'GTE', multiplyNumber(b.read('min_hp_ratio'), 100)), add(1, b.read('min_add_on_scale')), choice(compare('targetHpPercent', 'LTE', multiplyNumber(b.read('max_hp_ratio'), 100)), add(1, b.read('max_add_on_scale')), null)), 'min_add_on_scale / max_add_on_scale', { target: attack() }),
  ], constraints: b => [{ condition: any(all(eq('skillIndex', 2), compare('defenseDebuffStacks', 'LTE', b.read('attack@s2_limited_stack_cnt'))), all(compare('skillIndex', 'NE', 2), compare('defenseDebuffStacks', 'LTE', b.read('attack@limited_stack_cnt')))), reason: '防御力低下の重複数がスキルの上限を超えています。' }],
    deferred: [{ title: '残りHPに応じた与ダメージ上昇曲線', unresolved: '中間HPにおける補間方式と防御低下の適用順序は未確認。', currentTreatment: '確認済みのHP両端と指定した重複数に限定して計算する。' }] },
  { operatorId: 'char_4037_demetr', name: '路地裏の勘', prefabKey: '2', categories: ['SURVIVAL'], effects: b => ['PHYSICAL_DODGE', 'ARTS_DODGE'].map(item => ratio(item as 'PHYSICAL_DODGE' | 'ARTS_DODGE', add(b.read('init_prob'), mul(-1, b.read('dec_prob'), calc('MIN', b.read('trig_cnt'), calc('MAX', 0, metric('source.dodgeDecayStacks'))))), 'init_prob / dec_prob / trig_cnt')),
    deferred: [{ title: '回避減衰の更新時刻', unresolved: '秒の境界での更新順序と端数時刻の扱いは未確認。', currentTreatment: 'データの減衰回数に対する式を保持し、経過時間から減衰回数を推測しない。' }] },
  { operatorId: 'char_4082_qiubai', name: '虚突', prefabKey: '1', categories: ['ADDITIONAL_DAMAGE'], effects: b => [additional('conditional-arts', mul(b.read('atk_scale'), skill(3, 'talent_scale', 1)), 'atk_scale / skill:talent_scale', 'ARTS', { condition: eq('targetSlowedOrBound', true) })] },
  { operatorId: 'char_4082_qiubai', name: '落英', prefabKey: '2', categories: ['STATUS'], effects: b => [status('bind', 'バインド', 'duration', { timing: on('ATTACK'), target: enemy(), probability: { chance: b.read('prob'), rollScope: 'APPLICATION' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('duration') } })] },
  { operatorId: 'char_4182_oblvns', name: '讃歌の音符', prefabKey: '1', categories: ['DAMAGE', 'ATTACK_BEHAVIOR'], effects: b => [
    effect('note-defense-ignore', 'def_penetrate_ratio', { item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: mul(b.read('def_penetrate_ratio'), metric('noteCount')) }, { target: { ...faction('mujica', 'Ave Mujica'), entity: 'ATTACK' }, parameterBindings: { maxStacks: 'max_cnt' } }),
    effect('note-resistance-ignore', 'magic_resist_penetrate_ratio', { item: 'RESISTANCE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: mul(b.read('magic_resist_penetrate_ratio'), metric('noteCount')) }, { target: { ...faction('mujica', 'Ave Mujica'), entity: 'ATTACK' }, parameterBindings: { maxStacks: 'max_cnt' } }),
    behavior('tracking-note', '敵を追尾する音符攻撃'), behavior('permanent-attack', '常時攻撃'),
    behavior('note-expiration', '範囲外の音符を消滅', { condition: eq('projectile.outsideAttackRange', true), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('delay') } }),
  ], notes: ['戦場中の音符数を指定値に固定します。移動・消滅・再命中は時間シミュレーションの対象外です。'] },
  { operatorId: 'char_4182_oblvns', name: '忘却を恐れるなかれ', prefabKey: '2', categories: ['RESOURCE', 'ABILITY', 'ATTACK_BEHAVIOR'], effects: b => [
    effect('range-attack-speed', 'attack_speed', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', value: b.read('attack_speed'), unit: 'POINT' }, { target: allies('ATTACK_RANGE'), condition: eq('recipient.inSourceAttackRange', true) }),
    points('FEVER', b.read('cnt'), 'cnt', { timing: on('DAMAGE_DEALT') }),
    behavior('shared-attack-range', '重なる味方の攻撃範囲を追加', { target: faction('mujica', 'Ave Mujica', false), condition: eq('ally.attackRangeOverlapsSource', true) }),
  ] },
  { operatorId: 'char_4088_hodrer', name: '攻勢の機', prefabKey: '1', categories: ['DAMAGE'], effects: b => [scale('ATTACK_SCALE', choice(eq('targetStunnedOrBound', true), b.read('atk_scale'), b.read('atk_scale_2')), 'atk_scale / atk_scale_2', { timing: on('ATTACK'), target: attack() })] },
  { operatorId: 'char_4088_hodrer', name: '残火の幕', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [ratio('DAMAGE_RESISTANCE', b.read('damage_resistance'), 'damage_resistance', { target: tagged(allies('ADJACENT'), 'self_or_tile_behind', '自身と後ろ1マス') })] },
  { operatorId: 'char_4145_ulpia', name: '本性の維持', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [points('HP_RESTORE_FIXED', choice(compare('selfHpPercent', 'LTE', multiplyNumber(b.read('hp_ratio'), 100)), b.read('value2'), b.read('value1')), 'value1 / value2 / hp_ratio', { timing: on('DAMAGE_RECEIVED') })] },
  { operatorId: 'char_4145_ulpia', name: '育まれし血脈', prefabKey: '1', categories: ['ABILITY'], effects: b => [
    points('ATK_FLAT', mul(b.read('atk'), metric('killStacks')), 'atk', { parameterBindings: { maxStacks: 'max_stack_cnt' } }),
    points('MAX_HP_FLAT', mul(b.read('max_hp'), metric('killStacks')), 'max_hp', { parameterBindings: { maxStacks: 'max_stack_cnt' } }),
    { ...points('ATK_FLAT', mul(b.read('ulpia_t_1[abyssal].atk'), metric('killStacks')), 'ulpia_t_1[abyssal].atk', { target: faction('abyssal', 'アビサルハンター', false) }), id: 'ally-atk-flat' },
    { ...points('MAX_HP_FLAT', mul(b.read('ulpia_t_1[abyssal].max_hp'), metric('killStacks')), 'ulpia_t_1[abyssal].max_hp', { target: faction('abyssal', 'アビサルハンター', false) }), id: 'ally-hp-flat' },
  ] },
  { operatorId: 'char_4058_pepe', name: '語り継がれるもの', prefabKey: '1', categories: ['RESOURCE'], effects: b => [points('SP_RESTORE', calc('MIN', b.read('max_sp'), mul(b.read('sp'), metric('skill.killCount'))), 'sp / max_sp', { timing: on('SKILL_END') })] },
  { operatorId: 'char_4058_pepe', name: '芳しき睡蓮', prefabKey: '2', categories: ['ABILITY'], effects: b => [atk('guard-atk', b.read('atk'), 'atk', { target: tagged(allies(), 'profession:WARRIOR', '前衛') })] },
  { operatorId: 'char_1051_headb2', name: '渦巻く激情', prefabKey: '1', categories: ['DAMAGE', 'ADDITIONAL_DAMAGE', 'STATUS'], effects: b => [
    scale('SPLASH_DAMAGE_SCALE', b.read('damage_scale'), 'damage_scale', { target: attack() }),
    additional('terrain-damage', mul(b.read('attack@splash_atk_scale'), skill(3, 'splash_atk_scale_bonus', 1)), 'attack@splash_atk_scale / skill:splash_atk_scale_bonus', 'PHYSICAL', { condition: compare('terrainHitCount', 'GT', 0), target: tagged(recipients('ENEMY', 'ADJACENT'), 'adjacent_high_tile_ground', '命中した高台の隣接4マス・地上') }, { hits: metric('terrainHitCount'), label: '高台による追加ダメージ' }),
    status('terrain-slow', '足止め', 'attack@sluggish', { timing: on('ATTACK'), target: tagged(recipients('ENEMY', 'ADJACENT'), 'adjacent_high_tile_ground', '命中した高台の隣接4マス・地上'), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('attack@sluggish') } }),
  ] },
  { operatorId: 'char_1051_headb2', name: '連帯のうねり', prefabKey: '2', categories: ['ABILITY'], effects: b => [
    atk('self-atk', mul(b.read('atk'), b.read('scale_bonus')), 'atk / scale_bonus', { condition: eq('source.skillActive', true), lifetime: { type: 'UNTIL_EVENT', event: 'SKILL_END' } }),
    ratio('DEFENSE_BUFF_RATIO', mul(b.read('def'), b.read('scale_bonus')), 'def / scale_bonus', { condition: eq('source.skillActive', true), lifetime: { type: 'UNTIL_EVENT', event: 'SKILL_END' } }),
    atk('ally-atk', choice(eq('recipient.isUrsusStudent', true), mul(b.read('atk'), b.read('scale_bonus')), b.read('atk')), 'atk / scale_bonus', { target: allies('BATTLEFIELD', false), condition: eq('source.skillActive', true), lifetime: { type: 'UNTIL_EVENT', event: 'SKILL_END' } }),
    { ...ratio('DEFENSE_BUFF_RATIO', choice(eq('recipient.isUrsusStudent', true), mul(b.read('def'), b.read('scale_bonus')), b.read('def')), 'def / scale_bonus', { target: allies('BATTLEFIELD', false), condition: eq('source.skillActive', true), lifetime: { type: 'UNTIL_EVENT', event: 'SKILL_END' } }), id: 'ally-defense' },
  ] },
  { operatorId: 'char_010_chen', name: '発破', prefabKey: '1', categories: ['RESOURCE'], effects: b => [points('SP_RESTORE', b.read('sp'), 'sp', { target: tagged(allies(), 'offensive_or_defensive_sp', '攻撃回復・被撃回復'), timing: { type: 'PERIODIC', intervalSeconds: b.read('interval'), firstTickSeconds: null } })] },
  { operatorId: 'char_010_chen', name: '帯刀格闘術', prefabKey: '2', categories: ['ABILITY', 'SURVIVAL'], effects: b => [atk('self-atk', b.read('atk'), 'atk'), ratio('DEFENSE_BUFF_RATIO', b.read('def'), 'def'), ratio('PHYSICAL_DODGE', b.read('prob'), 'prob')] },
  { operatorId: 'char_4116_blkkgt', name: '「天性の武者」', prefabKey: '1', categories: ['DAMAGE', 'STATUS'], effects: b => [
    effect('critical-attack', 'atk_scale', { item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('atk_scale') }, { timing: on('DAMAGE_DEALT'), target: attack(), probability: { chance: choice(any(eq('skillIndex', 3), all(eq('skillIndex', 2), eq('targetBlocked', true))), metric('skill.prob'), b.read('prob')), rollScope: 'APPLICATION', sharedRollId: 'critical-attack' }, parameterBindings: { chance: 'prob / skill:prob' } }),
    status('tremble', '戦慄', 'not_combat', { timing: on('DAMAGE_DEALT'), target: enemy(), probability: { chance: choice(any(eq('skillIndex', 3), all(eq('skillIndex', 2), eq('targetBlocked', true))), metric('skill.prob'), b.read('prob')), rollScope: 'APPLICATION', sharedRollId: 'critical-attack' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('not_combat') } }),
  ] },
  { operatorId: 'char_4116_blkkgt', name: '生ける伝説', prefabKey: '2', categories: ['DAMAGE'], effects: b => [effect('tremble-defense-ignore', 'def_penetrate', { item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', value: b.read('def_penetrate'), unit: 'RATIO' }, { timing: on('ATTACK'), target: attack(), condition: eq('targetTrembling', true) })] },
  { operatorId: 'char_017_huang', name: '緊急蘇生術', prefabKey: '1', categories: ['SURVIVAL'], effects: b => [
    effect('emergency-heal', 'huang_t_1[heal].hp_ratio', { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', value: b.read('huang_t_1[heal].hp_ratio'), unit: 'MAX_HP_RATIO' }, { condition: compare('source.hpRatio', 'LT', b.read('hp_ratio')), restrictions: once }),
    ratio('MIN_HP_RATIO', b.read('huang_t_1[lock].min_hp_ratio'), 'huang_t_1[lock].min_hp_ratio', { condition: compare('source.hpRatio', 'LT', b.read('hp_ratio')), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('huang_t_1[lock].duration') }, restrictions: once, afterEffects: ['emergency-heal'] }),
  ] },
  { operatorId: 'char_017_huang', name: 'スパルタ訓練の成果', prefabKey: '2', categories: ['STATUS'], effects: b => [status('resist', 'レジスト', 'description:resist', { timing: { type: 'AFTER_EVENT', event: 'DEPLOY', delaySeconds: b.read('interval') }, lifetime: { type: 'UNTIL_EVENT', event: 'RETREAT' }, parameterBindings: { delaySeconds: 'interval', statusResistance: 'one_minus_status_resistance' } })] },
  { operatorId: 'char_1026_gvial2', name: '戦場の豪斧', prefabKey: '1', categories: ['ABILITY'], effects: b => [atk('blocked-atk', add(b.read('atk'), mul(b.read('atk_add'), metric('blockedEnemyCount'))), 'atk / atk_add'), ratio('DEFENSE_BUFF_RATIO', add(b.read('def'), mul(b.read('def_add'), metric('blockedEnemyCount'))), 'def / def_add')], constraints: () => [{ condition: any(all(eq('skillIndex', 3), compare('blockedEnemyCount', 'LTE', 5)), all(compare('skillIndex', 'NE', 3), compare('blockedEnemyCount', 'LTE', 3))), reason: 'ブロック数がこのスキル中の上限を超えています。' }] },
  { operatorId: 'char_1026_gvial2', name: '医学の心得', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [scale('HEAL_RECEIVED_SCALE', choice(compare('source.hpRatio', 'LT', b.read('hp_ratio')), b.read('heal_scale_2'), b.read('heal_scale_1')), 'heal_scale_1 / heal_scale_2 / hp_ratio')] },
  { operatorId: 'char_4098_vvana', name: '眼前を照らす燭火', prefabKey: '1', categories: ['DAMAGE', 'SURVIVAL'], effects: b => [
    scale('DAMAGE_SCALE', add(1, mul(b.read('damage_scale_m'), choice(eq('eliteInRange', true), b.read('super_scale'), 1))), 'damage_scale_m / super_scale', { target: tagged(attack(), 'arts_damage', '術ダメージ') }),
    ratio('DAMAGE_RESISTANCE', mul(b.read('damage_resistance_pm'), choice(eq('eliteInRange', true), b.read('super_scale'), 1)), 'damage_resistance_pm / super_scale', { target: tagged(self(), 'physical_arts_damage', '物理・術ダメージ') }),
  ] },
  { operatorId: 'char_4098_vvana', name: '散華', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [status('melee-shield', '近接攻撃を1回無効化するシールド', 'prob', { timing: on('ATTACK'), condition: eq('target.isEliteOrBoss', true), probability: { chance: b.read('prob'), rollScope: 'APPLICATION' }, lifetime: { type: 'UNSPECIFIED' }, restrictions: [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'SOURCE_LIFETIME', reset: 'EFFECT_END' }] })], deferred: [{ title: 'シールドの消費時点', unresolved: '近接攻撃の回避・無効化との優先順位は未確認。', currentTreatment: '1回無効化と重複不可を保持し、消費イベントの順序は確定しない。' }] },
  { operatorId: 'char_1019_siege2', name: '諸王の息', prefabKey: '1', categories: ['ABILITY', 'SURVIVAL'], effects: b => [atk('nearby-ally-atk', mul(b.read('atk'), metric('nearbyAllyCount')), 'atk'), ratio('PHYSICAL_DAMAGE_RESISTANCE', b.read('damage_resistance'), 'damage_resistance', { target: tagged(allies('ADJACENT'), 'self_and_adjacent_eight', '自身と周囲8マス') })] },
  { operatorId: 'char_1019_siege2', name: '縛られざる鋒芒', prefabKey: '2', categories: ['STATUS'], effects: b => [status('once-tremble', '戦慄', 'not_combat', { timing: on('DAMAGE_DEALT'), target: enemy(), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('not_combat') }, restrictions: [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'TARGET', reset: 'UNSPECIFIED' }] })] },
  { operatorId: 'char_1050_chen3', name: '形意洞察', prefabKey: '1', categories: ['ABILITY', 'DAMAGE'], effects: b => [atk('self-atk', b.read('atk'), 'atk'), effect('self-attack-speed', 'attack_speed', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', value: b.read('attack_speed'), unit: 'POINT' }), behavior('weakpoint-damage', '弱点ダメージ', { target: attack() })],
    deferred: [{ title: '弱点ダメージの軽減式', unresolved: '弱点ダメージと敵の防御性能の計算順序は未確認。', currentTreatment: '攻撃力・攻撃速度の補正は構造化し、DC3の最終ダメージは保留する。' }] },
  { operatorId: 'char_1050_chen3', name: '寒暑覚知', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [
    effect('random-heal', 'heal_atk_scale_min / heal_atk_scale_max', { item: 'HP_RESTORE_ATK_RATIO', operation: 'RESTORE', value: null, unit: 'ATK_RATIO', range: { minimum: multiplyNumber(b.read('heal_atk_scale_min'), 0.01), maximum: multiplyNumber(b.read('heal_atk_scale_max'), 0.01), maximumInclusive: null } }, { timing: { type: 'PERIODIC', intervalSeconds: b.read('stack_time'), firstTickSeconds: null }, condition: compare('source.secondsSinceDamageReceived', 'GTE', b.read('stack_time')), parameterBindings: { minimumPercent: 'heal_atk_scale_min', maximumPercent: 'heal_atk_scale_max' } }),
    status('next-attack-dodge', '次の物理・術攻撃を回避', 'description:dodge', { timing: { type: 'PERIODIC', intervalSeconds: b.read('stack_time'), firstTickSeconds: null }, condition: compare('source.secondsSinceDamageReceived', 'GTE', b.read('stack_time')), lifetime: { type: 'UNSPECIFIED' }, restrictions: [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'SOURCE_LIFETIME', reset: 'EFFECT_END' }] }),
  ], deferred: [{ title: 'ランダム回復量の抽選', unresolved: '説明の30～160%とデータの上端161の対応・抽選単位は未確認。', currentTreatment: '発動条件と効果を保持し、回復量の期待値を確定しない。' }] },
  { operatorId: 'char_188_helage', name: '月満ち星隠る', prefabKey: '1', categories: ['ABILITY'], effects: b => [effect('berserk-speed', 'min_attack_speed / min_hp_ratio', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', value: berserkValue(b, 'min_attack_speed'), unit: 'POINT' })] },
  { operatorId: 'char_188_helage', name: '策その身に宿る', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [points('HP_RESTORE_FIXED', b.read('hp_recovery_per_sec'), 'hp_recovery_per_sec', { timing: perSecond, condition: eq('source.blockCount', 0) })] },
  { operatorId: 'char_4121_zuole', name: '持燭人', prefabKey: '1', categories: ['ABILITY', 'RESOURCE'], effects: b => [effect('berserk-speed', 'min_attack_speed / min_hp_ratio', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', value: berserkValue(b, 'min_attack_speed'), unit: 'POINT' }), effect('berserk-sp', 'min_sp_recovery_per_sec / min_hp_ratio', { item: 'SP_RECOVERY', operation: 'ADD_VALUE', value: berserkValue(b, 'min_sp_recovery_per_sec'), unit: 'PER_SECOND' })] },
  { operatorId: 'char_4121_zuole', name: '守正自明', prefabKey: '2', categories: ['RESOURCE'], effects: b => [false, true].map(low => ({ ...points('SP_RESTORE', b.read('sp'), 'sp', { timing: on('ATTACK'), condition: compare('source.hpRatio', low ? 'LT' : 'GTE', b.read('hp_ratio')), probability: { chance: b.read(low ? 'prob_2' : 'prob_1'), rollScope: 'APPLICATION' } }), id: low ? 'low-hp-sp' : 'normal-hp-sp' })) },
  { operatorId: 'char_485_pallas', name: '英雄の生誕', prefabKey: '1', categories: ['ABILITY'], effects: b => [atk('minos-peak-performance', b.read('peak_performance.atk'), 'peak_performance.atk', { target: faction('minos', 'ミノス'), condition: compare('recipient.hpRatio', 'GTE', b.read('peak_performance.hp_ratio')), parameterBindings: { recipientHpCondition: 'peak_performance.hp_ratio' } })] },
  { operatorId: 'char_485_pallas', name: '女神の抱擁', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [points('HP_RESTORE_FIXED', mul(b.read('value'), metric('attack.targetCount')), 'value', { timing: on('ATTACK'), target: tagged(allies('ADJACENT'), 'self_or_tile_ahead', '自身と前方1マス') })] },
  { operatorId: 'char_1014_nearl2', name: '「長夜の終わり」', prefabKey: '1', categories: ['ADDITIONAL_DAMAGE', 'STATUS'], effects: b => [
    additional('deployment-damage', b.read('atk_scale'), 'atk_scale', 'TRUE', { timing: on('DEPLOY'), target: recipients('ENEMY', 'ADJACENT') }, { hits: choice(eq('deployment.previousOperatorKazimierz', true), 2, 1) }),
    status('deployment-stun', 'スタン', 'stun', { timing: on('DEPLOY'), target: recipients('ENEMY', 'ADJACENT'), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('stun') } }),
  ] },
  { operatorId: 'char_1014_nearl2', name: '破暁', prefabKey: '2', categories: ['DAMAGE'], effects: b => [effect('defense-ignore', 'def_penetrate', { item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', value: b.read('def_penetrate'), unit: 'RATIO' }, { target: attack(), timing: on('ATTACK') })] },
  { operatorId: 'char_4011_lessng', name: '苦しみを意志に', prefabKey: '1', categories: ['SURVIVAL'], effects: b => [ratio('DAMAGE_RESISTANCE', b.read('damage_resistance'), 'damage_resistance', { condition: all(compare('source.blockCount', 'GT', 0), eq('damageSource.blockedBySelf', false)), target: tagged(self(), 'physical_arts_damage', '物理・術ダメージ') })] },
  { operatorId: 'char_4011_lessng', name: '痛みを砥石に', prefabKey: '2', categories: ['ABILITY'], effects: b => [atk('recent-damage-atk', b.read('atk'), 'atk', { timing: on('DAMAGE_RECEIVED'), condition: eq('recentDamageTaken', true), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('add_atk_duration') }, restrictions: [{ type: 'APPLICATION_LIMIT', count: 1, scope: 'SOURCE_LIFETIME', reset: 'EFFECT_END' }] })] },
  { operatorId: 'char_1032_excu2', name: '選ばれし者', prefabKey: '1', categories: ['ADDITIONAL_DAMAGE'], effects: b => [additional('extra-attack', 1, 'prob / prob_add', 'PHYSICAL', { timing: on('NORMAL_ATTACK'), condition: eq('actionKind', 'NORMAL'), probability: { chance: calc('MIN', 1, add(b.read('prob'), mul(b.read('prob_add'), metric('ammoSpent')))), rollScope: 'APPLICATION' }, restrictions: [{ type: 'EXCLUDE_MODIFIER', modifier: 'recursive_extra_attack' }], parameterBindings: { probabilityReset: 'description:skill_end' } })], notes: ['消費弾薬数を固定した時点の1攻撃を計算します。追加攻撃を起点とする再抽選は行いません。'] },
  { operatorId: 'char_1032_excu2', name: '銃弾の共感', prefabKey: '2', categories: ['RESOURCE'], effects: b => [points('AMMO_CAPACITY', mul(b.read('add_count'), calc('MIN', b.read('add_count_max_stack'), metric('battlefield.lateranoCount'))), 'add_count / add_count_max_stack', { condition: eq('skill.usesAmmo', true) })] },
  { operatorId: 'char_4010_etlchi', name: '血の集積', prefabKey: '1', categories: ['ADDITIONAL_DAMAGE', 'SURVIVAL'], effects: b => [
    { ...context('arts-dot-rate', 'magic_value', enemy(), on('ATTACK')), condition: eq('dotActive', true), item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', lifetime: { type: 'CURRENT_EVENT' },
      damage: { kind: { type: 'ORDINARY', damageType: 'ARTS' }, amount: { basis: 'FIXED', value: b.read('magic_value'), referenceTime: 'NOT_APPLICABLE' }, rate: 'PER_SECOND',
        duration: { type: 'FIXED_SECONDS', seconds: b.read('dot_duration') }, cadence: { intervalSeconds: b.read('interval'), firstTickSeconds: null },
        stacking: { mode: 'UNSPECIFIED', maxStacks: null }, refresh: 'UNSPECIFIED' }, parameterBindings: { 'damage.duration.seconds': 'dot_duration', 'damage.cadence.intervalSeconds': 'interval' } },
    effect('steal-max-hp', 'attack@steal_hp', { item: 'HP_STEAL', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('attack@steal_hp'), maximum: b.read('attack@steal_hp_max') }, { timing: on('ATTACK'), target: enemy() }),
  ], notes: ['最大HP奪取によるHP変化はダメージに加算しません。継続ダメージは付与中の毎秒値として別計算します。'], deferred: [{ title: '継続ダメージの再付与と終了境界', unresolved: '重複・更新と終了時刻の命中順序は未確認。', currentTreatment: '付与中の毎秒値を計算し、有限時間の総ダメージに換算しない。' }] },
  { operatorId: 'char_4010_etlchi', name: '返り咲き', prefabKey: '2', categories: ['SURVIVAL'], effects: b => [
    effect('emergency-heal', 'etlchi_t_2[heal].hp_ratio', { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', value: b.read('etlchi_t_2[heal].hp_ratio'), unit: 'MAX_HP_RATIO' }, { condition: compare('source.hpRatio', 'LT', b.read('hp_ratio')), restrictions: once }),
    ratio('PHYSICAL_DAMAGE_RESISTANCE', b.read('damage_resistance'), 'damage_resistance', { condition: eq('source.emergencyHealActivated', true), lifetime: { type: 'UNTIL_EVENT', event: 'RETREAT' }, afterEffects: ['emergency-heal'] }),
  ] },
  { operatorId: 'char_4064_mlynar', name: '遊侠', prefabKey: '1', categories: ['DAMAGE', 'SURVIVAL'], effects: b => [
    scale('ATTACK_SCALE', choice(compare('nearbyEnemyCount', 'GTE', b.read('cnt')), b.read('atk_scale_up'), b.read('atk_scale_base')), 'atk_scale_base / atk_scale_up / cnt', { target: attack(), timing: on('ATTACK') }),
    ratio('DAMAGE_RESISTANCE', b.read('damage_resistance'), 'damage_resistance', { condition: compare('nearbyEnemyCount', 'GTE', b.read('cnt')) }),
  ] },
  { operatorId: 'char_4064_mlynar', name: '我関せず', prefabKey: '2', categories: ['ATTACK_BEHAVIOR', 'ADDITIONAL_DAMAGE'], effects: b => [points('TAUNT', b.read('taunt_level'), 'taunt_level'), additional('ally-counter', b.read('atk_scale'), 'atk_scale', 'TRUE', { timing: on('DAMAGE_RECEIVED'), eventActor: faction('kazimierz', 'カジミエーシュ'), target: recipients('ENEMY', 'DAMAGE_SOURCE'), parameterBindings: { eventActor: 'description:kazimierz_ally_receives_attack' } })] },
  { operatorId: 'char_1043_leizi2', name: '明断', prefabKey: '1', categories: ['DAMAGE', 'ADDITIONAL_DAMAGE', 'STATUS'], effects: b => [
    scale('ATTACK_SCALE', b.read('atk_scale[skill_up]'), 'atk_scale[skill_up]', { target: attack(), condition: eq('source.skillActive', true), lifetime: { type: 'UNTIL_EVENT', event: 'SKILL_END' } }),
    additional('periodic-lightning', b.read('atk_scale_t'), 'atk_scale_t', 'ARTS', { timing: { type: 'PERIODIC', intervalSeconds: b.read('interval'), firstTickSeconds: null }, target: tagged(recipients('ENEMY', 'ATTACK_RANGE'), 'per_tile', '各マス内の敵全員'), probability: { chance: b.descriptionNumber('lightning_probability', /毎秒(10)%/, 0.01), rollScope: 'TICK' }, parameterBindings: { chance: 'description:lightning_probability', hits: 'interval' } }, { hits: calc('DIVIDE', 1, b.read('interval')), rate: 'PER_SECOND', label: '周期落雷の期待値' }),
    status('liftoff', '離陸', 'description:liftoff', { condition: eq('source.skillActive', false) }),
  ] },
  { operatorId: 'char_1043_leizi2', name: '責問', prefabKey: '2', categories: ['ADDITIONAL_DAMAGE', 'STATUS'], effects: b => [
    additional('skill-start-lightning', b.read('atk_scale_t2'), 'atk_scale_t2', 'ARTS', { timing: on('SKILL_START'), condition: eq('actionKind', 'SKILL_ACTION'), target: tagged(recipients('ENEMY', 'ATTACK_RANGE'), 'ground_tile', '地面マス') }),
    status('skill-start-tremble', '戦慄', 'not_combat', { timing: on('SKILL_START'), target: tagged(recipients('ENEMY', 'ATTACK_RANGE'), 'ground_tile', '地面マス'), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('not_combat') } }),
  ] },
]

export const GUARD_TALENT_OPERATOR_IDS: readonly string[] = [...new Set(definitions.map(definition => definition.operatorId))]
export function getGuardTalentIdentity(operatorId: string): readonly { name: string; prefabKey: string }[] {
  return definitions.filter(definition => definition.operatorId === operatorId).map(({ name, prefabKey }) => ({ name, prefabKey }))
}

/** The same source-bound records serve the structure page and the calculation evaluator. */
export function buildGuardTalentStructures(rows: readonly SkillRecord[], growth: TalentStructureGrowthSelection = {}, registrationOnly = false): TalentStructure[] {
  const operators = new Map(rows.map(row => [row.operatorId, row]))
  return GUARD_TALENT_OPERATOR_IDS.flatMap(operatorId => {
    const operator = operators.get(operatorId)
    if (!operator) return []
    const phaseIndex = growth.phaseIndex ?? Math.max(0, operator.operatorProfile.phases.length - 1)
    const maxLevel = operator.operatorProfile.phases[phaseIndex]?.maxLevel ?? (registrationOnly ? 90 : undefined)
    const operatorLevel = growth.operatorLevel ?? maxLevel
    if (phaseIndex !== 2 || !operatorLevel || !maxLevel || !Number.isInteger(operatorLevel) || operatorLevel < 1 || operatorLevel > maxLevel) return []
    const sources = getOperatorPassives(operator.operatorProfile, phaseIndex, operatorLevel, 1).sources
    return definitions.filter(definition => definition.operatorId === operatorId).flatMap((definition, talentIndex) => {
      let source = sources.find(candidate => candidate.sourceKind === 'TALENT' && candidate.talentIndex === talentIndex)
      if (registrationOnly) source = { sourceKind: 'TALENT', talentIndex, sourceName: definition.name, description: source?.description ?? '', blackboard: source?.blackboard ?? [], requiredPotentialRank: 0, prefabKey: definition.prefabKey, tokenKey: null, unlockCondition: { phase: 'PHASE_2', level: 1 } }
      if (!source || (!registrationOnly && !source.description) || source.sourceName !== definition.name || source.prefabKey !== definition.prefabKey || source.requiredPotentialRank !== 0 || source.unlockCondition?.phase !== 'PHASE_2') return []
      const verifiedSource = source
      const issues: string[] = []
      const binding: Binding = {
        read: key => readNumber(verifiedSource, key, issues),
        issue: message => { issues.push(message) },
        descriptionNumber: (key, pattern, multiplier = 1) => {
          const match = verifiedSource.description.normalize('NFKC').match(pattern)?.[1]
          if (match === undefined || !Number.isFinite(Number(match))) { issues.push(`説明文の数値「${key}」を確認できません。`); return null }
          return Number(match) * multiplier
        },
      }
      const effects = definition.effects(binding)
      const constraints = definition.constraints?.(binding)
      return [{ basicInfo: { operatorId, operatorName: operator.operatorName, talentIndex, talentName: definition.name, phaseIndex, operatorLevel, potentialRank: 1, module: 'NONE' },
        classificationInfo: { coarseCategories: definition.categories }, activationSettings: { activationMethod: 'PASSIVE', triggers: [...new Map(effects.map(effect => [JSON.stringify(effect.timing), effect.timing])).values()] },
        effects, source: { description: verifiedSource.description, blackboard: verifiedSource.blackboard, requiredPotentialRank: verifiedSource.requiredPotentialRank, unlockCondition: verifiedSource.unlockCondition, prefabKey: verifiedSource.prefabKey },
        deferred: (definition.deferred ?? []).map((entry, index): TalentStructureDeferredCase => ({ id: `${operatorId}-${talentIndex}-${index}`, title: entry.title, status: 'DEFERRED', unresolved: entry.unresolved, currentTreatment: entry.currentTreatment, impact: '該当する状態変化・時間経過の計算は未対応。', resumeWhen: '効果の処理順序・数値の出典を確認できたとき。', references: [] })),
        issues: registrationOnly ? [] : [...new Set(issues)], notes: definition.notes ?? [], constraints,
      } satisfies TalentStructure]
    })
  })
}
function readNumber(source: PassiveSource, key: string, issues: string[]): number | null {
  const entries = source.blackboard.filter(entry => entry.key?.toLowerCase() === key.toLowerCase())
  const value = entries.length === 1 ? entries[0].value : undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) { issues.push(`参照値「${key}」を確認できません。`); return null }
  return value
}
function multiplyNumber(value: number | null, multiplier: number): number | null { return value === null ? null : value * multiplier }
