import sourcesJson from '../data/expandedMeleeSources.json' with { type: 'json' }
import type { OperatorCombatProfile } from '../types/skill.ts'
import type { ExpandedOperatorDefinition, ExpandedTalentBinding, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue, CombatRecipientSelector } from './combatEffectStructure.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { TalentCoarseCategory } from './talentCoarseClassification.ts'
import { getOperatorPassives } from './operatorProfile.ts'

type E = TalentStructureEffect
type B = ExpandedTalentBinding
type N = CombatNumericValue
type Payload<T> = T extends CombatEffectContext ? Omit<T, keyof CombatEffectContext> : never
const sources = sourcesJson as unknown as {
  operatorId: string; phaseIndex: number; skillLevelIndex: number; profile: OperatorCombatProfile
  skills: { skillIndex: number; skillId: string }[]
}[]
const k = (key: string): GuardValue => ({ key })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const add = (...args: GuardValue[]): GuardValue => ({ op: 'add', args })
const choose = (input: string, value: number | boolean | string, yes: GuardValue, no: GuardValue,
  comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): GuardValue => ({ op: 'if', input, comparison, value, yes, no })
const metric = (metric: string): N => ({ type: 'METRIC', metric })
const calc = (operation: 'ADD' | 'MULTIPLY' | 'DIVIDE' | 'MIN' | 'MAX', ...values: N[]): N => ({ type: 'CALC', operation, values })
const condition = (metric: string, value: number | boolean | string, comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): CombatCondition => ({ type: 'COMPARE', metric, comparison, value })
const hp = (): GuardInput => num('selfHpPercent', '自身のHP（%）', 100, 0, 100, 0.1)
const num = (key: string, label: string, defaultValue: number, min = 0, max = 100, step = 1): GuardInput => ({ key, label, kind: 'number', defaultValue, min, max, step })
const bool = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const distance: GuardInput = { key: 'attackDistanceType', label: '攻撃距離', kind: 'select', defaultValue: 'MELEE',
  options: [{ value: 'MELEE', label: '近接' }, { value: 'RANGED', label: '遠距離' }] }
const blocked = () => bool('targetBlockedBySelf', '対象を自身でブロック')
const P = 'PHYSICAL', A = 'ARTS', T = 'TRUE'
const attack = (damageType: 'PHYSICAL' | 'ARTS' | 'TRUE', scale: GuardValue = 1, hits: GuardValue = 1,
  extra: Partial<GuardDamageAction> = {}): GuardDamageAction => ({ label: '攻撃', role: 'MAIN', damageType, scale, hits, ...extra })
const normal = (damageType: 'PHYSICAL' | 'ARTS' | 'TRUE', extra: Partial<GuardStage> = {}): GuardStage => ({
  id: 'active', label: 'スキル中', kind: 'NORMAL', actions: [attack(damageType)], ...extra,
})
const next = (damageType: 'PHYSICAL' | 'ARTS' | 'TRUE', scale: GuardValue, hits: GuardValue = 1,
  extra: Partial<GuardStage> = {}) => normal(damageType, { label: '強化攻撃', kind: 'NEXT_ATTACK', actions: [attack(damageType, scale, hits)], ...extra })
const burst = (damageType: 'PHYSICAL' | 'ARTS' | 'TRUE', scale: GuardValue, hits: GuardValue = 1,
  extra: Partial<GuardStage> = {}) => normal(damageType, { label: '発動1回', kind: 'SKILL_ACTION', actions: [attack(damageType, scale, hits)], ...extra })
const recipe = (skillIndex: number, stage: GuardStage, inputs: GuardInput[] = [], notes: string[] = []): Omit<GuardSkillRecipe, 'operatorId'> =>
  ({ skillIndex, inputs, stages: [stage], notes })
const self: CombatRecipientSelector = { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true,
  factionIds: [], tagIds: [], selection: { type: 'ALL' } }
function effect(id: string, sourceBinding: string, payload: Payload<E>, options: Partial<CombatEffectContext> = {}): E {
  return { id, sourceBinding, target: self, timing: { type: 'CONTINUOUS', while: 'DEPLOYED' },
    condition: null, probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [],
    ...payload, ...options } as E
}
const atk = (value: N, binding = 'atk', active: CombatCondition | null = null) => effect('attack', binding,
  { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value }, { condition: active })
const speed = (value: N, binding = 'attack_speed', active: CombatCondition | null = null) => effect('attack-speed', binding,
  { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value }, { condition: active })
const scale = (value: N, binding = 'atk_scale', active: CombatCondition | null = null) => effect('attack-scale', binding,
  { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value }, { condition: active })
const damage = (value: N, binding = 'damage_scale', active: CombatCondition | null = null) => effect('damage-scale', binding,
  { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value }, { condition: active })
const critical = (b: B, chance: N = b.read('prob')) => effect('critical', 'atk_scale', { item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('atk_scale') },
  { timing: { type: 'EVENT', event: 'ATTACK' }, probability: { chance, rollScope: 'APPLICATION' }, lifetime: { type: 'CURRENT_EVENT' } })
const state = (id: string, text: string): E => effect(id, `description:${id}`,
  { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: text })
const berserk = (b: B): E => speed(calc('MULTIPLY', b.read('min_attack_speed'), calc('MIN', 1, calc('MAX', 0,
  calc('DIVIDE', calc('ADD', 1, calc('MULTIPLY', -0.01, metric('selfHpPercent'))), calc('ADD', 1, calc('MULTIPLY', -1, b.read('min_hp_ratio'))))))),
  'min_attack_speed / min_hp_ratio')
type TalentOverride = { categories?: readonly TalentCoarseCategory[]; effects: (b: B) => readonly E[]; notes?: readonly string[] }
/** Every operator below was individually reviewed against the retained JP snapshot.
 * Unchanged survival/resource/control clauses are preserved as descriptive states;
 * only the separately listed numeric effects participate in direct-damage calculation.
 */
function define(suffix: string, recipes: Omit<GuardSkillRecipe, 'operatorId'>[], overrides: Record<number, TalentOverride> = {},
  inputs: GuardInput[] = [], reasons: Record<number, string> = {}, notes: string[] = []): ExpandedOperatorDefinition {
  const source = sources.find(source => source.operatorId.endsWith(`_${suffix}`))!
  if (!source) throw new Error(`Reviewed melee source missing: ${suffix}`)
  const selected = getOperatorPassives(source.profile, source.phaseIndex, source.profile.phases[source.phaseIndex].maxLevel!, 1).sources
    .filter(value => value.sourceKind === 'TALENT' && value.talentIndex !== null && value.description)
  const talents: ExpandedTalentDefinition[] = selected.map(value => {
    const override = overrides[value.talentIndex!]
    return { talentIndex: value.talentIndex!, name: value.sourceName, prefabKey: value.prefabKey!,
      categories: override?.categories ?? ['SURVIVAL'],
      effects: b => [...(override?.effects(b) ?? []), state('reviewed-description', value.description)],
      notes: override?.notes ?? [],
    }
  })
  return { operatorId: source.operatorId, phaseIndex: source.phaseIndex, skillLevelIndex: source.skillLevelIndex,
    inputs, recipes: recipes.map(recipe => ({ ...recipe, operatorId: source.operatorId })), talents, traitNotes: notes,
    deferredSkills: source.skills.filter(skill => !recipes.some(recipe => recipe.skillIndex === skill.skillIndex)).map(skill => ({
      skillIndex: skill.skillIndex, reason: reasons[skill.skillIndex] ?? 'このスキルの攻撃動作・時間変化は今回の計算範囲に含めていません。',
    })) }
}
const ability = (effects: (b: B) => readonly E[]): TalentOverride => ({ categories: ['ABILITY'], effects })
const RESOURCE: TalentOverride = { categories: ['RESOURCE'], effects: () => [] }
const CONTROL: TalentOverride = { categories: ['STATUS'], effects: () => [] }
const DEPLOY: TalentOverride = { categories: ['DEPLOYMENT'], effects: () => [] }
const MOVE_NOTE = ['同じ対象が攻撃範囲内にいる場合の直接ダメージ。強制移動後の位置・落下撃破は計算しない。']
const FIXED_PERIOD = { kind: 'CONSTANT_RATE' } as const
const STATE_PERIOD = { kind: 'UNSUPPORTED', reason: '入力した状態での1攻撃を評価し、状態の変化を含む総ダメージは計算しません。' } as const
const charge = () => num('traitChargePercent', '特性の攻撃力蓄積（%）', 100, 0, 100, 0.1)

export const EXPANDED_MELEE_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  // Reviewed individually against the retained JP snapshot. These recipes share
  // the existing hit/crit/target/trait evaluators; state inputs are not time simulations.
  define('weedy', [recipe(1, next(P, k('atk_scale'), 1, { maxTargets: 2 }), [], MOVE_NOTE),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: null, duration: 'UNTIL_EXIT' }), [], MOVE_NOTE)],
    { 0: { categories: ['SUMMON'], effects: () => [], notes: ['蓄水砲は別ユニット。ウィーディ自身の攻撃には合算しない。'] }, 1: RESOURCE }, [],
    { 3: '移動距離に応じた確定ダメージと、隣接する蓄水砲の同時発射を計算する必要がある。' }),
  define('glady', [recipe(1, next(P, k('atk_scale')), [], MOVE_NOTE),
    recipe(2, normal(P, { intervalAdd: k('base_attack_time'), maxTargets: k('attack@max_target'),
      actions: [attack(P, k('attack@atk_scale'))], periodTotal: FIXED_PERIOD }), [], MOVE_NOTE)],
    { 1: { categories: ['DAMAGE'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('targetWeight', 3, 'LTE'))] } },
    [num('targetWeight', '対象の重量ランク', 0, 0, 10)],
    { 3: '渦の周期命中、通常攻撃の継続、強制移動と終了時点を一体で確認する必要がある。' }),
  define('flamtl', [recipe(2, burst(P, k('atk_scale'), 2, { maxTargets: k('max_target') }))],
    { 0: { categories: ['ATTACK_BEHAVIOR'], effects: () => [effect('dodge-followup', 'description:double-attack', {
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: 1, damageType: P, rate: 'PER_ATTACK',
    }, { condition: condition('dodgeAttackReady', true), timing: { type: 'EVENT', event: 'NORMAL_ATTACK' },
      lifetime: { type: 'CURRENT_EVENT' } })] } }, [bool('dodgeAttackReady', '回避後の2連撃が有効')],
    { 1: 'コスト回復と回避のみ。コスト・回避の時間推移は計算対象外。',
      3: '回避後の次の通常攻撃の2連撃・対象数変化を主攻撃として扱う必要がある。' },
    ['回避後の次の通常攻撃かどうかを指定する。被弾・回避の発生頻度は計算しない。']),
  define('zumama', [recipe(1, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' })),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: STATE_PERIOD })),
    recipe(3, normal(P, { atk: k('atk'), blockCountAdd: k('block_cnt'), periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['DAMAGE', 'SURVIVAL'], effects: b => [damage(b.read('atk_scale'), 'atk_scale', condition('selfHpPercent', 50, 'GT'))] },
      1: RESOURCE }, [hp()]),
  define('fuze', [recipe(1, normal(P, { atk: k('atk'), aspd: k('attack_speed'),
      periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '100発の弾薬の消費時間と継続時間は計算しません。' } })),
    recipe(2, burst(P, k('atk_scale'), 5, { maxTargets: null }), [],
      ['発動可能な高台・地面の配置条件で、同じ対象に5回の爆発が命中する場合。'])]),
  define('tachak', [recipe(2, normal(P, { intervalAdd: k('base_attack_time'), maxTargets: null,
    actions: [attack(P, 1, 1, { targets: 1, probability: add(1, mul(-1, k('prob'))) }),
      attack(P, k('atk_scale'), 1, { targets: 1, probability: k('prob') })], periodTotal: FIXED_PERIOD }), [],
    ['同じ防御力の敵へのランダム攻撃の期待値。通常攻撃の2ヒットは剣豪の特性から適用する。'])], {}, [],
    { 1: '燃焼エリアの初回・最終の周期命中と、エリア内への通常攻撃の防御無視を扱う必要がある。' }),
  define('almond', [recipe(1, next(P, k('atk_scale')), [], MOVE_NOTE)], { 0: RESOURCE }, [],
    { 2: '拘束中の周期命中について、初回・最終の発生時点と通常攻撃の停止を確認する必要がある。' }),
  define('varkis', [recipe(1, next(P, k('atk_scale'), 3)),
    recipe(2, normal(P, { actions: [attack(P, k('attack@s2_atk_scale'))], periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['DAMAGE'], effects: b => [scale(b.read('talent_atk_scale'), 'talent_atk_scale', condition('targetHpNotAboveSelf', true))] } },
    [bool('targetHpNotAboveSelf', '対象の残りHP割合が自身以下', true)]),
  define('sophia', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), blockCountAdd: k('block_cnt'), maxTargets: add(2, k('block_cnt')), periodTotal: FIXED_PERIOD }))],
    { 0: ability(b => [speed(calc('MULTIPLY', metric('skill.talent_scale'), {
      type: 'CONDITIONAL', condition: condition('skillIndex', 1),
      whenTrue: b.read('sophia_t_1_less.attack_speed'), whenFalse: b.read('attack_speed'),
    }), 'attack_speed / sophia_t_1_less.attack_speed')]) }, [blocked()], {},
    ['S1は自身のブロック数2に対する半分の素質、S2はブロック数3に対する素質を適用する。']),
  define('snsant', [recipe(1, next(P, k('atk_scale')), [], MOVE_NOTE),
    recipe(2, burst(A, k('atk_scale'), 1, { maxTargets: null }), [], MOVE_NOTE)], { 0: CONTROL }),
  define('cement', [recipe(1, burst(P, k('atk_scale'), 1, { maxTargets: null }))], {}, [],
    { 2: '防御力の強化と被弾による消費のみ。防御・生存の時間推移は計算対象外。' }),
  define('dagda', [recipe(1, next(P, k('attack@defensive_atk_scale'))),
    recipe(2, normal(P, { atk: k('atk'), actions: [attack(P, 1, 2)], periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('critical', 'atk_scale / atk_up_each_time / atk_up_max_value', {
      item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', unit: 'MULTIPLIER',
      value: calc('MIN', b.read('atk_up_max_value'), calc('ADD', b.read('atk_scale'), calc('MULTIPLY', b.read('atk_up_each_time'), metric('killStacks')))),
    }, { timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' }, probability: {
      chance: { type: 'CONDITIONAL', condition: condition('skillIndex', 2), whenTrue: metric('skill.talent@prob'), whenFalse: b.read('prob') },
      rollScope: 'APPLICATION',
    } })] } }, [num('killStacks', '素質の撃破による強化回数', 0, 0, 18)], {},
    ['S1は防御効果の発動後に行う強化攻撃。撃破による素質の強化回数を固定して評価する。']),
  define('takila', [recipe(1, normal(P, { aspd: k('attack_speed'), actions: [attack(P, k('attack@atk_scale'))], periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { actions: [attack(P, k('attack@atk_scale'))], maxTargets: choose('overcharged', true, k('attack@plus_max_target'), 2),
      duration: choose('overcharged', true, k('enhance_duration'), 15), periodTotal: FIXED_PERIOD }), [bool('overcharged', 'オーバーチャージ')])],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('inactive-counter', 'atk_scale', {
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: b.read('atk_scale'), damageType: A, rate: 'PER_ATTACK',
    }, { timing: { type: 'EVENT', event: 'DAMAGE_RECEIVED' }, condition: condition('source.skillActive', false), lifetime: { type: 'CURRENT_EVENT' } })] } },
    [charge()]),
  define('mantic', [recipe(1, normal(P, { duration: 'UNTIL_EXIT' })),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: STATE_PERIOD }))],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('stealthAttackReady', true))]) },
    [bool('stealthAttackReady', 'ステルス解除時の強化攻撃')], {}, ['ステルス解除時の1攻撃かどうかを指定する。再ステルスの待機時間は計算しない。']),
  define('morgan', [recipe(1, normal(P, { actions: [attack(P, k('attack@atk_scale'))], periodTotal: STATE_PERIOD })),
    recipe(2, normal(P, { actions: [attack(P, k('attack@atk_scale'))], periodTotal: STATE_PERIOD }))],
    { 0: ability(b => [atk(calc('MULTIPLY', b.read('min_atk'), calc('MIN', 1, calc('MAX', 0,
      calc('DIVIDE', calc('ADD', 1, calc('MULTIPLY', -0.01, metric('selfHpPercent'))), calc('ADD', 1, calc('MULTIPLY', -1, b.read('min_hp_ratio'))))))),
      'min_atk / min_hp_ratio')]) }, [hp()], {}, ['HP入力はスキルや攻撃による減少後の値を使用する。']),
  define('laios', [recipe(2, burst(P, k('atk_scale')), [], ['攻撃停止時間の終了時、ブロックしている1体への発動1回のダメージ。'])],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('known-enemy-ignore', 'def_penetrate', {
      item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: b.read('def_penetrate'),
    }, { condition: condition('hasDefeatedSameEnemy', true) })] } }, [bool('hasDefeatedSameEnemy', '同名の敵を撃破済み')],
    { 1: 'ボスの初回出現に伴う攻撃停止と、HP条件の時間変化を扱う必要がある。' }),
  define('noirc2', [recipe(2, burst(P, k('multi_atk_scale'), k('multi_times')))],
    { 0: ability(b => [berserk(b)]), 1: ability(b => [atk(calc('MULTIPLY', b.read('atk'), metric('spiritStacks')), 'atk × spiritStacks')]) },
    [hp(), num('spiritStacks', '発動前の練気の累積回数', 0, 0, 3)],
    { 1: '被弾を契機とした発動と、撃破による再発動・練気の強化順序を確認する必要がある。' }),
  define('red', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('minimum-damage', 'atk_scale', {
      item: 'MINIMUM_DAMAGE_RATIO', operation: 'SET', unit: 'RATIO', value: b.read('atk_scale'),
    })] } }, [], { 2: '配置時範囲攻撃への最低ダメージ保証の適用範囲を確認する必要がある。' }),
  define('wscoot', [recipe(1, normal(P, { aspd: k('attack_speed'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { actions: [attack(P, k('attack@atk_scale'))], maxTargets: k('attack@max_target'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['ADDITIONAL_DAMAGE'], effects: b => [effect('full-charge-extra', 'atk_scale', {
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: b.read('atk_scale'), damageType: P, rate: 'PER_ATTACK',
    }, { condition: condition('traitChargePercent', 100), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })] } }, [charge()]),
  define('melan', [recipe(1, normal(P, { atk: k('atk') }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  define('popka', [recipe(1, normal(P, { atk: k('atk') }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  define('midn', [recipe(1, normal(A, { atk: k('atk'), traitOverrides: ['DAMAGE_TYPE'] }))],
    { 0: { categories: ['DAMAGE'], effects: b => [critical(b)] } }, [distance]),
  define('gyuki', [recipe(2, normal(P, { atk: k('atk') }))], {}, [], { 1: 'HP回復のみ。回復量・回復周期の計算は未対応。' }),
  define('estell', [recipe(1, normal(P, { atk: k('atk') })), recipe(2, normal(P, { atk: k('atk') }))]),
  define('cutter', [
    recipe(1, burst(P, k('atk_scale'), k('times'), { maxTargets: null, actions: [attack(P, k('atk_scale'), k('times'), { targets: 1 })] }), [],
      ['同じ防御力の敵をランダムに選ぶ4投分の期待値。1体欄は対象数で均等配分した値。']),
    recipe(2, burst(P, mul(k('atk_scale'), choose('targetAirborne', true, k('cutter_s_2[drone].atk_scale'), 1)), 1, { maxTargets: k('max_target') }),
      [bool('targetAirborne', '対象が飛行ユニット')]),
  ], { 0: RESOURCE }),
  define('spikes', [recipe(1, normal(P, { attackTreatment: 'RANGED', actions: [attack(P, k('attack@atk_scale'), 2)] }), [],
      ['ブロック数0のため遠距離攻撃として特性の80%倍率を適用する。']),
    recipe(2, normal(A, { attackTreatment: 'MELEE', maxTargets: k('attack@max_target'), actions: [attack(A, k('attack@atk_scale'))] }))],
    { 0: { categories: ['DAMAGE', 'ATTACK_BEHAVIOR'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('targetDrone', true))] } },
    [bool('targetDrone', '対象がドローン')]),
  define('quartz', [recipe(1, normal(P, { atk: k('atk') })), recipe(2, normal(P, { aspd: k('attack_speed'),
    actions: [attack(P, k('attack@s2_atk_scale'))] }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  define('humus', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, {
    atk: choose('selfHpPercent', 80, k('humus_s_2[peak_2].peak_performance.atk'),
      choose('selfHpPercent', 50, k('humus_s_2[peak_1].peak_performance.atk'), 0, 'GTE'), 'GTE') }), [hp()])]),
  define('doberm', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, { atk: k('atk') }))],
    { 0: { categories: ['ABILITY'], effects: () => [], notes: ['攻撃力上昇の対象は星3のみ。星4のドーベルマン自身には加算しない。'] } }, [blocked()]),
  define('utage', [recipe(2, normal(A, { atk: k('atk'), duration: k('duration') }))], { 0: ability(b => [berserk(b)]) }, [hp()],
    { 1: '攻撃停止・防御・回復スキル。回復の時間変化は未対応。' }, ['HP入力はスキル発動による減少後の値を使用する。']),
  define('whitew', [recipe(1, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' }), [distance]),
    recipe(2, normal(A, { atk: k('atk'), attackTreatment: 'MELEE', maxTargets: 2 }))], { 0: CONTROL }),
  define('leto', [recipe(1, normal(P, { atk: k('atk'), aspd: k('attack_speed') }), [distance]),
    recipe(2, normal(P, { atk: k('atk'), attackTreatment: 'MELEE', maxTargets: k('attack@max_target') }))], { 0: ability(b => [speed(b.read('attack_speed'))]) }),
  define('ghost', [recipe(1, normal(P, { atk: k('atk') })), recipe(2, normal(P, { atk: k('atk') }))]),
  define('broca', [recipe(1, normal(A, { atk: k('atk'), traitOverrides: ['DAMAGE_TYPE'] })), recipe(2, normal(A, { atk: k('atk'), traitOverrides: ['DAMAGE_TYPE'], intervalAdd: k('base_attack_time') }))],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('blockedEnemyCount', 2, 'GTE'))]) }, [num('blockedEnemyCount', '自身がブロックしている敵数', 0, 0, 3)]),
  define('astesi', [recipe(1, normal(A, { atk: k('atk') })), recipe(2, normal(A, { atk: k('atk'), maxTargets: add(1, k('block_cnt')) }))],
    { 0: ability(b => [speed(calc('MULTIPLY', b.read('attack_speed'), metric('talentStacks')), 'attack_speed × talentStacks')]) },
    [num('talentStacks', '配置後20秒ごとの強化回数', 0, 0, 5)]),
  define('sidero', [recipe(2, normal(A, { atk: k('atk') }))],
    { 0: ability(b => [speed(b.read('attack_speed'), 'attack_speed', condition('sevenKills', true))]) },
    [bool('sevenKills', '配置後に7体以上撃破')], { 1: 'HP回復のみ。回復量・回復周期の計算は未対応。' }),
  define('bibeak', [recipe(2, burst(A, k('atk_scale'), 1, { maxTargets: k('max_target') }))],
    { 0: ability(b => [speed(calc('MULTIPLY', b.read('attack_speed'), metric('killStacks')), 'attack_speed × killStacks')]) },
    [num('killStacks', '撃破による強化回数', 0, 0, 5)], { 1: '主対象への2連撃と、別の敵への術攻撃を区別する出力が必要。' }),
  define('crow', [recipe(1, next(P, k('atk_scale'), 2)), recipe(2, normal(P, {
    atk: add(k('atk'), choose('targetHpPercent', 50, k('crow_s_2[atk].atk'), 0, 'LT')), intervalAdd: k('base_attack_time') }),
      [num('targetHpPercent', '対象のHP（%）', 100, 0, 100, 0.1)])],
    { 0: ability(b => [speed(calc('MULTIPLY', b.read('attack_speed'), metric('killStacks')), 'attack_speed × killStacks')]) },
    [num('killStacks', '撃破による強化回数', 0, 0, 12)]),
  define('highmo', [recipe(1, next(P, k('atk_scale'), 2)), recipe(2, normal(P, { atk: k('atk') }))],
    { 1: ability(b => [speed(b.read('attack_speed'), 'attack_speed', condition('mizukiMode', true))]) }, [bool('mizukiMode', 'ミヅキと紺碧の樹')]),
  define('akafyu', [recipe(1, normal(P, { atk: k('atk'), actions: [attack(P, 1, 2)] })), recipe(2, normal(P, { atk: k('atk') }))],
    { 0: ability(b => [berserk(b)]) }, [hp()], {}, ['HP入力はスキル発動による減少後の値を使用する。']),
  define('savage', [recipe(1, next(P, k('atk_scale'))), recipe(2, burst(P, k('atk_scale'), 1, { maxTargets: k('max_target') }))],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('adjacentHighTiles', 2, 'GTE'))]) }, [num('adjacentHighTiles', '隣接4マスの高台数', 0, 0, 4)]),
  define('flint', [recipe(1, next(P, k('atk_scale')), [], MOVE_NOTE), recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed') }))],
    { 0: { categories: ['DAMAGE'], effects: b => [damage(b.read('damage_scale'), 'damage_scale',
      { type: 'ANY', conditions: [condition('skillIndex', 2), condition('targetBlockedBySelf', false)] })] } }, [blocked()]),
  define('tiger', [recipe(1, next(P, 1, 1, { atk: k('atk'), defenseIgnoreRatio: k('def_penetrate') })), recipe(2, normal(A, { atk: k('atk') }))],
    { 0: ability(b => [atk(b.read('charge_on_evade.atk'), 'charge_on_evade.atk', condition('dodgeAttackReady', true))]) },
    [bool('dodgeAttackReady', '回避成功後の強化攻撃')], {}, ['回避後の攻撃強化が有効な1攻撃を評価する。発動頻度を含む長時間平均は計算しない。']),
  define('brownb', [recipe(2, normal(P, { intervalAdd: k('base_attack_time') }))],
    { 0: ability(b => [atk(calc('MULTIPLY', b.read('atk'), metric('sameTargetStacks')), 'atk × sameTargetStacks')]) },
    [num('sameTargetStacks', '同じ敵への攻撃による累積数', 0, 0, 5)], { 1: '物理回避のみ。回避の時間推移は未対応。' }),

  define('wyvern', [recipe(1, normal(P, { atk: k('atk') }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  define('falco', [recipe(1, normal(P, { atk: k('atk'), aspd: k('attack_speed') }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  define('scave', [recipe(2, normal(P, { atk: k('atk') }))], { 0: ability(b => [atk(b.read('atk'), 'atk', condition('noAdjacentAlly', true))]) },
    [bool('noAdjacentAlly', '隣接4マスに味方がいない')], { 1: 'コスト回復のみ。通常攻撃とSP回復を含む周期計算は未対応。' }),
  define('texas', [recipe(2, burst(A, k('atk_scale'), 2, { maxTargets: null }))], { 0: RESOURCE }, [], { 1: 'コスト回復のみ。周期計算は未対応。' }),
  define('headbr', [recipe(2, normal(P, { atk: k('atk') }))], { 0: RESOURCE }, [], { 1: 'コスト回復のみ。周期計算は未対応。' }),
  define('siege', [recipe(2, next(P, k('atk_scale'), 1, { maxTargets: null })),
    recipe(3, normal(P, { intervalAdd: k('base_attack_time'), actions: [attack(P, k('attack@atk_scale'))] }))],
    { 0: ability(b => [atk(b.read('atk'))]), 1: RESOURCE }, [], { 1: 'コスト回復のみ。周期計算は未対応。' }),
  define('sddrag', [recipe(1, normal(P, { atk: k('atk'), aspd: k('attack_speed') })), recipe(2, normal(P, { atk: k('atk'),
    actions: [attack(P), attack(A, k('attack@skill.atk_scale'), 1, { role: 'ADDITIONAL', label: '追加術ダメージ' })] }))]),
  define('wildmn', [recipe(1, normal(P, { aspd: k('attack_speed') })), recipe(2, normal(P, { atk: k('atk') }), [], MOVE_NOTE)], { 0: DEPLOY }),
  define('ctable', [recipe(1, normal(P, { atk: k('atk') })), recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed'), duration: 0 }), [],
    ['弾薬が残っている状態の1攻撃・攻撃中DPS。18発の消費時間と通常攻撃を含む周期は計算しない。'])],
    { 0: ability(b => [speed(b.read('attack_speed'), 'attack_speed', condition('selfBlocking', false)), atk(b.read('atk'), 'atk', condition('selfBlocking', true))]) },
    [bool('selfBlocking', '自身が敵をブロック中')]),
  define('chilc', [recipe(2, normal(P, { aspd: k('attack_speed') }))], {}, [], { 1: '攻撃停止・ランダムなコスト獲得。直接ダメージを与えない。' }),
  define('grani', [recipe(2, normal(P, { atk: k('atk'), maxTargets: add(1, k('block_cnt')) }))], {}, [], { 1: '防御強化のみ。防御・生存計算は未対応。' }),
  define('puzzle', [recipe(1, next(P, k('atk_scale')))], { 0: { categories: ['DAMAGE', 'RESOURCE'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('targetFullHp', true))] } },
    [bool('targetFullHp', '攻撃前の対象HPが最大')], { 2: '術の継続ダメージの付与・重複・更新と攻撃ごとのHP条件を解決する必要がある。' }),

  define('durnar', [recipe(1, normal(A, { atk: k('atk') })), recipe(2, normal(A, { atk: k('atk'), maxTargets: 3 }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  define('hsguma', [recipe(1, normal(P, { atk: k('atk') }))], {}, [],
    { 2: '通常攻撃と被撃時反撃を別イベントとして出力する必要がある。',
      3: '盾の回転中のダメージ判定間隔と攻撃速度の扱いを確認する必要がある。' }),
  define('nian', [recipe(1, normal(A, { atk: k('atk') })), recipe(3, normal(P, { atk: k('nian_s_3[self].atk') }))], {}, [],
    { 2: '攻撃停止と被撃時の術反撃。反撃イベントの計算は今回未対応。' }),
  define('mudrok', [recipe(2, next(P, k('atk_scale'), 1, { maxTargets: null })), recipe(3, normal(P, { label: '行動再開後', duration: k('awake'),
    atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: 3 }), [], ['最初の10秒間の行動停止後、攻撃可能な20秒間の1攻撃・DPSを評価する。'])], {}, [],
    { 1: '防御強化のみ。防御・生存計算は未対応。' }),
  define('liskam', [recipe(2, normal(A, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: k('attack@max_target') }))], { 0: RESOURCE }, [],
    { 1: '防御・ダメージ無効化のみ。生存計算は未対応。' }),
  define('moeshd', [recipe(2, burst(P, k('atk_scale'), 1, { maxTargets: null }), [], MOVE_NOTE)], {}, [], { 1: '防御・回避強化のみ。生存計算は未対応。' }),
  define('hpsts', [recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: add(3, k('block_cnt')) }))], {}, [],
    { 1: '防御・回復強化のみ。生存計算は未対応。' }),
  define('asbest', [recipe(2, normal(A, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: null }))], { 0: RESOURCE }, [],
    { 1: '術ダメージ軽減のみ。生存計算は未対応。' }),

  define('rope', [recipe(1, next(P, k('atk_scale')), [], MOVE_NOTE), recipe(2, burst(P, k('atk_scale'), 1, { maxTargets: k('max_target') }), [], MOVE_NOTE)]),
  define('sqrrel', [recipe(1, next(P, k('atk_scale'), 1, { maxTargets: 2 }), [], MOVE_NOTE), recipe(2, burst(P, k('atk_scale'), 1, { maxTargets: null }), [], MOVE_NOTE)]),
  define('slchan', [recipe(1, next(A, k('atk_scale')), [], MOVE_NOTE), recipe(2, burst(T, k('atk_scale'), 1, { maxTargets: k('max_target') }), [], MOVE_NOTE)],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('selfBlocking', false))]) }, [bool('selfBlocking', '自身が敵をブロック中')]),
  define('panda', [recipe(2, burst(P, k('atk_scale'), 1, { maxTargets: null }), [], MOVE_NOTE)], {}, [],
    { 1: '強制移動と通常攻撃判定の関係を確認する必要がある。' }),
  define('strong', [recipe(1, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' })), recipe(2, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' }))],
    { 0: { categories: ['DAMAGE'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('targetInfectedCreature', true))] } },
    [bool('targetInfectedCreature', '対象が感染生物')]),
  define('waaifu', [recipe(1, normal(P, { atk: k('waaifu_s_1[self].atk') }), [], MOVE_NOTE)],
    { 0: { categories: ['DAMAGE', 'STATUS'], effects: b => [critical(b)] } }, [], { 2: '配置時ダメージと第一素質の適用関係を確認する必要がある。' }),

  define('wintim', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, { aspd: k('attack_speed'),
    periodTotal: { kind: 'UNSUPPORTED', reason: '被弾によって素質の攻撃速度上昇を失う時点が未確定です。' } }))],
    { 0: ability(b => [speed(b.read('attack_speed'), 'attack_speed', condition('hasTakenDamage', false))]) },
    [bool('hasTakenDamage', '配置後にダメージを受けた')]),
  define('frostl', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, { aspd: k('attack_speed'), periodTotal: FIXED_PERIOD }))],
    { 0: ability(b => [effect('attack-interval', 'base_attack_time',
      { item: 'ATTACK_INTERVAL_ADD', operation: 'ADD_VALUE', unit: 'SECOND', value: b.read('base_attack_time') })]) }, [distance]),
  define('vigna', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['ABILITY', 'DAMAGE'], effects: b => [effect('power-spear', 'atk / prob2',
      { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: b.read('atk') },
      { timing: { type: 'EVENT', event: 'ATTACK' }, probability: { chance: b.read('prob2'), rollScope: 'APPLICATION' },
        lifetime: { type: 'CURRENT_EVENT' } })] } }),
  define('frncat', [recipe(2, normal(A, { atk: k('atk'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['ATTACK_BEHAVIOR', 'DAMAGE'], effects: b => [effect('combo', 'prob',
      { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: 1, damageType: A, rate: 'PER_ATTACK' },
      { timing: { type: 'EVENT', event: 'ATTACK' }, probability: { chance: b.read('prob'), rollScope: 'APPLICATION' },
        lifetime: { type: 'CURRENT_EVENT' }, restrictions: [{ type: 'EXCLUDE_MODIFIER', modifier: 'recursive_extra_attack' }] })] } }, [],
    { 1: '強化攻撃と素質の2連撃が同時発動した際、2撃目への攻撃力上昇の適用を確認する必要がある。' }),
  define('peacok', [recipe(1, next(P, 1, 1, { actions: [
      attack(P, k('atk_scale'), 1, { label: '通常の断罪', probability: add(1, mul(-1, k('peacok_s_1[crit].prob'))) }),
      attack(P, mul(k('atk_scale'), k('peacok_s_1[crit].atk_scale')), 1,
        { label: '会心の断罪', probability: k('peacok_s_1[crit].prob') }),
    ] })), recipe(2, burst(A, k('success.atk_scale'), 1, { maxTargets: null,
      actions: [attack(A, k('success.atk_scale'), 1, { probability: add(1, mul(-1, k('prob'))) })] }))],
    { 0: DEPLOY }, [], {}, ['行動可能な状態での発動1回を評価する。配置直後のスタン中は攻撃できない。']),
  define('fang2', [recipe(1, next(P, k('atk_scale'), 2)), recipe(2, normal(P, {
    atk: k('atk'), blockCountAdd: k('block_cnt'), maxTargets: add(1, k('block_cnt')), periodTotal: FIXED_PERIOD }))], { 0: DEPLOY }),
  define('bryota', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD }))], {}, [blocked()]),
  define('rfalcn', [recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['DAMAGE'], effects: b => [critical(b, { type: 'CONDITIONAL', condition: condition('skillIndex', 2),
      whenTrue: calc('MULTIPLY', b.read('prob'), metric('skill.talent@prob_scaler')), whenFalse: b.read('prob') })] }, 1: RESOURCE }, [],
    { 1: 'コスト回復のみ。通常攻撃とSP回復を含む周期計算は未対応。' }),
  define('buildr', [{ skillIndex: 2, inputs: [num('skillActivationCount', 'スキル発動回数', 1, 1, 100)], stages: [
    normal(P, { label: '初回', atk: k('atk'), duration: k('duration'), periodTotal: FIXED_PERIOD,
      when: { input: 'skillActivationCount', comparison: 'EQ', value: 1 } }),
    normal(P, { id: 'permanent', label: '2回目以降', atk: k('buildr_s_2[b].atk'), duration: 'UNTIL_EXIT',
      when: { input: 'skillActivationCount', comparison: 'GTE', value: 2 } }),
  ] }], {}, [], { 1: 'コスト回復のみ。通常攻撃とSP回復を含む周期計算は未対応。' }),
  define('luton', [recipe(1, next(P, k('atk_scale')))], {}, [],
    { 2: '通常攻撃を停止して行う2秒ごとの術ダメージについて、周期攻撃としての出力と初回・最終発生時点を確認する必要がある。' }),
  define('jaksel', [recipe(1, next(P, k('atk_scale')))],
    { 0: ability(b => [speed(b.read('charge_atk_speed_on_evade.attack_speed'), 'charge_atk_speed_on_evade.attack_speed', condition('dodgeSpeedActive', true))]) },
    [bool('dodgeSpeedActive', '回避後の攻撃速度上昇中')],
    { 2: '回避を契機とした反撃と、反撃の最短間隔を含むイベント計算が必要。' }),
  define('ethan', [recipe(1, normal(P, { duration: 'UNTIL_EXIT', actions: [attack(P),
    attack(A, 0, 1, { role: 'ADDITIONAL', label: '付与中の継続術ダメージ', timing: 'PER_SECOND', traitOverrides: ['DAMAGE_TYPE'],
      flatDamage: choose('poisonActive', true, k('attack@poison_damage'), 0) }),
  ] }), [bool('poisonActive', '継続ダメージ付与中', true)],
  ['継続ダメージが付与中の毎秒値を評価する。付与直後・更新・終了までの時間推移は含めない。']),
  recipe(2, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD }))], { 0: CONTROL }),
  define('flameb', [recipe(1, next(P, k('atk_scale'))),
    recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed'), duration: 'UNTIL_EXIT' }))]),
  define('surfer', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD }))], { 0: RESOURCE }, [],
    { 2: '攻撃ごとの防御力奪取とダメージの適用順序・累積を確認する必要がある。' }),
  define('chimes', [recipe(1, normal(P, { atk: k('atk'),
    periodTotal: { kind: 'UNSUPPORTED', reason: 'HP条件による素質の攻撃力変化を期間全体では計算できません。' } }))],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('selfHpPercent', 50, 'GTE'))]) }, [hp()],
    { 2: 'スキル中に上昇する攻撃力の時系列と、手動停止時点の攻撃力を確認する必要がある。' }),
]
