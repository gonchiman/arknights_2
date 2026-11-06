import sources from '../data/expandedElementalSources.json' with { type: 'json' }
import { ELEMENTAL_BUILDUP_INPUTS } from './elementalBuildup.ts'
import type { ExpandedOperatorDefinition, ExpandedTalentBinding, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardElementalBuildup, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { CombatCondition, CombatEffectContext, CombatEvent, CombatNumericValue } from './combatEffectStructure.ts'
import type { TalentStructureEffect } from './talentStructure.ts'

// Each selection is one realized event. Periodic effects are not added once per
// normal attack; their clocks, overlap and burst transitions are not simulated.
const eventKey = 'elementalEvent'
const key = (key: string): GuardValue => ({ key })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const choice = (input: string, value: string, yes: GuardValue, no: GuardValue = 0): GuardValue =>
  ({ op: 'if', input, comparison: 'EQ', value, yes, no })
const eq = (metric: string, value: string | boolean | number): CombatCondition => ({ type: 'COMPARE', metric, comparison: 'EQ', value })
const selected = (value: string) => eq(eventKey, value)
const both = (...conditions: CombatCondition[]): CombatCondition => ({ type: 'ALL', conditions })
const numericChoice = (condition: CombatCondition, whenTrue: CombatNumericValue, whenFalse: CombatNumericValue): CombatNumericValue =>
  ({ type: 'CONDITIONAL', condition, whenTrue, whenFalse })
const input = (key: string, label: string, options: [string, string][]): GuardInput => ({ key, label, kind: 'select',
  defaultValue: options[0][0], options: options.map(([value, label]) => ({ value, label })) })
const eventInput = (options: [string, string][]) => input(eventKey, '評価する1回', options)
const count = (key: string, label: string, min: number, max: number, defaultValue = min): GuardInput =>
  ({ key, label, kind: 'number', min, max, step: 1, defaultValue })
const enemy = (scope: 'ATTACK_TARGET' | 'ATTACK_RANGE' | 'BATTLEFIELD' = 'ATTACK_TARGET'): CombatEffectContext['target'] =>
  ({ type: 'RECIPIENTS', side: 'ENEMY', entity: 'UNIT', scope, includeSelf: false, factionIds: [], tagIds: [], selection: { type: 'ALL' } })
type Payload<T> = T extends CombatEffectContext ? Omit<T, keyof CombatEffectContext> : never
const effect = (id: string, sourceBinding: string, payload: Payload<TalentStructureEffect>, context: Partial<CombatEffectContext> = {}): TalentStructureEffect => ({
  id, sourceBinding, timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
  target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true,
    factionIds: [], tagIds: [], selection: { type: 'ALL' } }, probability: { chance: 1, rollScope: 'APPLICATION' },
  lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [], ...payload, ...context,
}) as TalentStructureEffect
const state = (id: string, binding: string, status: string) => effect(id, binding,
  { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status })
const eventContext = (event: CombatEvent, condition: CombatCondition, scope: 'ATTACK_TARGET' | 'ATTACK_RANGE' | 'BATTLEFIELD' = 'ATTACK_TARGET'): Partial<CombatEffectContext> =>
  ({ timing: { type: 'EVENT', event }, condition, lifetime: { type: 'CURRENT_EVENT' }, target: enemy(scope) })
const talent = (talentIndex: number, name: string, prefabKey: string, effects: ExpandedTalentDefinition['effects'],
  categories: ExpandedTalentDefinition['categories'] = ['DAMAGE']): ExpandedTalentDefinition => ({ talentIndex, name, prefabKey, effects, categories })
const talentBuildup = (id: string, binding: string, elementId: string, value: CombatNumericValue, condition: CombatCondition) => effect(id, binding,
  { item: 'ELEMENTAL_BUILDUP', operation: 'APPLY_ELEMENTAL_BUILDUP', unit: 'MULTIPLIER', value,
    basis: 'ATK_STAT', damageKind: { type: 'ELEMENTAL_BUILDUP', elementId } }, eventContext('PERIODIC_TICK', condition))
const talentDamage = (id: string, binding: string, value: CombatNumericValue, damageType: 'ARTS' | 'ELEMENTAL', elementId: string,
  event: CombatEvent, condition: CombatCondition, scope: 'ATTACK_TARGET' | 'ATTACK_RANGE' | 'BATTLEFIELD' = 'ATTACK_TARGET') => effect(id, binding,
  { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value, damageType,
    ...(damageType === 'ELEMENTAL' ? { damageKind: { type: 'ELEMENTAL_DAMAGE', elementId } as const } : {}),
    basis: 'ATK_STAT', rate: 'PER_ATTACK' }, eventContext(event, condition, scope))
const main = (damageType: 'PHYSICAL' | 'ARTS', scale: GuardValue = 1, stat = false): GuardDamageAction =>
  ({ id: 'main', label: damageType === 'ARTS' ? '術ダメージ' : '物理攻撃', role: 'MAIN', damageType, scale, ...(stat ? { basis: 'ATK_STAT' } : {}) })
const extraElemental = (elementId: string, scale: GuardValue): GuardDamageAction => ({ label: '爆発効果中への追加元素ダメージ',
  role: 'ADDITIONAL', damageType: 'ELEMENTAL', damageKind: { type: 'ELEMENTAL_DAMAGE', elementId }, basis: 'ATK_STAT', scale })
const buildup = (elementId: string, scale: GuardValue, basis: GuardElementalBuildup['basis'] = { type: 'ATK_STAT' }): GuardElementalBuildup =>
  ({ id: 'skill', label: ({ necrosis: '壊死', burn: '灼熱', neural: '神経' }[elementId] ?? elementId) + '損傷',
    damageKind: { type: 'ELEMENTAL_BUILDUP', elementId }, basis, scale })
const periodTotal = { kind: 'UNSUPPORTED', reason: '個別イベント1回。周期・同時発生・元素爆発への遷移・スキル期間総量は未対応です。' } as const
function stage(id: string, label: string, actions: GuardDamageAction[], elementalBuildups: GuardElementalBuildup[] = [],
  options: Partial<GuardStage> = {}): GuardStage {
  return { id, label, kind: 'SKILL_ACTION', when: { input: eventKey, comparison: 'EQ', value: id }, actions,
    elementalBuildups, duration: 0, periodTotal, dpsUnsupportedReason: periodTotal.reason,
    resistanceReductionFixed: choice('targetElementalBurst', 'BURN', 20),
    defenseReductionFixed: mul(120, { input: 'previousCorrosionBursts' }), ...options }
}
function recipe(operatorId: string, skillIndex: number, stages: GuardStage[], inputs: GuardInput[] = [],
  requirements: NonNullable<GuardSkillRecipe['conditionRequirements']> = []): GuardSkillRecipe {
  return { operatorId, skillIndex, stages, inputs: [...inputs, ...ELEMENTAL_BUILDUP_INPUTS,
    count('previousCorrosionBursts', '対象の過去の侵蝕爆発回数', 0, 100)],
    conditionRequirements: [{ when: { input: 'targetElementalBurst', comparison: 'EQ', value: 'CORROSION' },
      condition: { input: 'previousCorrosionBursts', comparison: 'GTE', value: 1 }, reason: '侵蝕爆発効果中は過去の侵蝕爆発回数が1以上必要です。' }, ...requirements],
    notes: ['選択したイベントを受ける全対象が同じ状態。別のイベントは合算しない。', periodTotal.reason] }
}
const def = (operatorId: string, talents: ExpandedTalentDefinition[], recipes: GuardSkillRecipe[]): ExpandedOperatorDefinition =>
  ({ operatorId, phaseIndex: 2, skillLevelIndex: 9, talents, recipes })

// The incoming-necrosis multiplier affects the skill and the periodic talent.
// Its reviewed value is shared by those recipes; changed live data must stop.
function exact(v: ExpandedTalentBinding, name: string, expected: number) {
  if (v.read(name) !== expected) v.issue(`${name}の値が個別イベント計算の確認済み値と一致しません。`)
}
const cello = 'char_245_cello', yu = 'char_2026_yu', cairn = 'char_4214_cairn'
const christ = 'char_4198_christ', mantra = 'char_4204_mantra', blaze = 'char_1040_blaze2'
const bobb = 'char_487_bobb', nymph = 'char_4146_nymph'
const periodic = 'TALENT_TICK', palsy = 'PALSY_TRIGGER', burst = 'BURST_EVENT'
const blocked = [periodic, 'ブロック対象への素質1周期（1秒）'] as [string, string]
const normalAttack = ['ATTACK', '通常攻撃1回'] as [string, string]
const palsyOption = [palsy, '麻痺による攻撃中断1回'] as [string, string]
const burstOption = [burst, '灼熱爆発開始の素質1回'] as [string, string]
const blazeState = input('blazeState', '自身の状態', [['ACTIVE', '配置中・ダウンなし'], ['DOWN', 'ダウン中']])
const activeOnly: NonNullable<GuardSkillRecipe['conditionRequirements']> = [
  { condition: { input: blazeState.key, comparison: 'EQ', value: 'ACTIVE' }, reason: 'ダウン中はスキルが終了します。スキル中の攻撃力でのダウン状態計算には対応していません。' },
  { when: { input: eventKey, comparison: 'EQ', value: burst }, condition: { input: 'targetElementalBurst', comparison: 'EQ', value: 'BURN' },
    reason: '灼熱爆発開始イベントは灼熱爆発効果中を指定してください。' },
]
const bobbFirst = input('bobbTargetHistory', '対象への与ダメージ履歴', [['FIRST', '初回'], ['REPEAT', '2回目以降']])
const bobbFirstScale = (scale: GuardValue): GuardValue => ({ op: 'add', args: [scale, choice(bobbFirst.key, 'FIRST', 0.16)] })
const nymphStacks = count('nymphNecrosisStacks', '範囲内の壊死爆発による累積数', 0, 10)
const nymphTickRequirement: NonNullable<GuardSkillRecipe['conditionRequirements']> = [
  { when: { input: eventKey, comparison: 'EQ', value: periodic }, condition: { input: 'targetElementalBurst', comparison: 'EQ', value: 'NECROSIS' },
    reason: '付与中の素質の元素周期ダメージは壊死爆発効果中のみ発生します。' },
]
const EVENT_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  def(cello, [
    talent(0, '言葉なき哀歌', '1', v => {
      v.read('sluggish')
      return [talentBuildup('aura', 'ep_damage_ratio', 'necrosis', { type: 'CALC', operation: 'MULTIPLY',
        values: [v.read('ep_damage_ratio'), numericChoice(eq('skillIndex', 3), 1.5, 1.2)] }, selected(periodic)),
        state('slow', 'sluggish', '素質の周期で足止め')]
    }),
    talent(1, '精神逆構築', '2', v => { exact(v, 'ep_damage_scale', 1.2)
      return [state('necrosis-incoming', 'ep_damage_scale', '範囲内への壊死損傷1.2倍（S3は1.5倍・各イベントへ適用）')]
    }),
  ], [
    recipe(cello, 1, [stage('ATTACK', '強化攻撃1回', [main('ARTS', key('atk_scale'))], [buildup('necrosis', mul(key('ep_damage_ratio'), 1.2))]),
      stage(periodic, '素質の範囲損傷1周期（1秒）', [], [], { maxTargets: null })],
    [eventInput([['ATTACK', '強化攻撃1回'], [periodic, '素質の範囲損傷1周期（1秒）']])],
    [{ when: { input: 'targetElementalBurst', comparison: 'EQ', value: 'NECROSIS' }, condition: { input: eventKey, comparison: 'EQ', value: periodic },
      reason: 'S1は壊死爆発効果中の敵を攻撃しません。' }]),
    recipe(cello, 2, [stage('ATTACK', '本人の通常攻撃1回', [main('ARTS')], [buildup('necrosis', mul(key('ep_damage_ratio'), 1.2))], { aspd: key('attack_speed'), maxTargets: 2 }),
      stage('ALLY_DAMAGE', '範囲内への選出味方1与ダメージ', [], [buildup('necrosis', mul(key('ep_damage_ratio'), 1.2))], { maxTargets: null }),
      stage(periodic, '素質の範囲損傷1周期（1秒）', [], [], { maxTargets: null })],
    [eventInput([normalAttack, ['ALLY_DAMAGE', '範囲内への選出味方1与ダメージ'], [periodic, '素質の範囲損傷1周期（1秒）']])]),
    recipe(cello, 3, [stage(periodic, '素質の範囲損傷1周期（1秒）', [], [], { atk: key('atk'), maxTargets: null })],
      [eventInput([[periodic, '素質の範囲損傷1周期（1秒）']])]),
  ]),
  def(yu, [
    talent(0, '礼には礼を', '1', v => [
      talentDamage('blocked-damage', 'yu_t_1[enemy].atk_scale', v.read('yu_t_1[enemy].atk_scale'), 'ARTS', 'burn', 'PERIODIC_TICK', selected(periodic)),
      talentBuildup('blocked-buildup', 'yu_t_1[enemy].ep_damage_ratio', 'burn', v.read('yu_t_1[enemy].ep_damage_ratio'), selected(periodic)),
      effect('shelter', 'damage_resistance', { item: 'DAMAGE_RESISTANCE', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('damage_resistance') }),
      ...(v.read('yu_t_1[enemy].interval') === 1 ? [] : (v.issue('素質の確認済み周期1秒と一致しません。'), [])),
    ]),
    talent(1, '閑雲市に隠れ', '2', v => { v.read('cnt'); v.read('ep_heal_ratio'); v.read('hp_recovery_per_sec_by_max_hp_ratio'); v.read('interval')
      return [state('recovery', 'cnt / ep_heal_ratio / hp_recovery_per_sec_by_max_hp_ratio / interval', '配置人数の条件を満たすとHP・元素損傷を回復')]
    }, ['SURVIVAL']),
  ], [
    recipe(yu, 1, [stage('RESPONSE', '攻撃者への反応1回', [], [buildup('burn', key('ep_damage_ratio'))]),
      stage(periodic, blocked[1], [], [], { maxTargets: 3 }), stage('ATTACK', '通常攻撃1回', [main('PHYSICAL')])],
    [eventInput([['RESPONSE', '攻撃者への反応1回'], blocked, normalAttack])]),
    recipe(yu, 2, [stage('ATTACK', 'スキル中の術攻撃1回', [main('ARTS')], [], { atk: key('atk'), traitOverrides: ['DAMAGE_TYPE'], blockCountAdd: key('block_cnt') }),
      stage('START', '発動時の範囲術ダメージ1回', [main('ARTS', key('atk_scale'), true)], [], { atk: key('atk'), maxTargets: null, traitOverrides: ['DAMAGE_TYPE'] }),
      stage(periodic, blocked[1], [], [], { atk: key('atk'), maxTargets: 5, blockCountAdd: key('block_cnt') })],
    [eventInput([normalAttack, ['START', '発動時の範囲術ダメージ1回'], blocked])]),
    recipe(yu, 3, [stage('WALL', '炎の壁を通過した味方の術1命中', [], [buildup('burn', key('ep_damage_ratio'))], { atk: key('atk') }),
      stage(periodic, blocked[1], [], [], { atk: key('atk'), maxTargets: 3 }), stage('ATTACK', '通常攻撃1回', [main('PHYSICAL')], [], { atk: key('atk') })],
    [eventInput([['WALL', '炎の壁を通過した味方の術1命中'], blocked, normalAttack])]),
  ]),
  def(cairn, [talent(0, '過飽和説明', '1', v => [talentBuildup('blocked', 'ep_damage_ratio', 'neural', v.read('ep_damage_ratio'), selected(periodic))])], [
    recipe(cairn, 1, [stage(periodic, blocked[1], [], [], { maxTargets: 3 }), stage('ATTACK', '通常攻撃1回', [main('PHYSICAL')])], [eventInput([blocked, normalAttack])]),
    recipe(cairn, 2, [stage('SKILL_TICK', '周囲8マスの地上敵への1周期（1秒）', [main('ARTS', key('atk_scale'), true)], [buildup('neural', key('ep_damage_ratio'))],
      { maxTargets: null, traitOverrides: ['DAMAGE_TYPE'] }), stage(periodic, blocked[1], [], [], { maxTargets: 3 }), stage('ATTACK', '通常攻撃1回', [main('PHYSICAL')])],
    [eventInput([['SKILL_TICK', '周囲8マスの地上敵への1周期（1秒）'], blocked, normalAttack])]),
  ]),
  def(christ, [talent(0, '魅惑のご馳走', '1', v => [talentDamage('palsy', 'atk_scale', v.read('atk_scale'), 'ELEMENTAL', 'neural',
    'PALSY_TRIGGER', selected(palsy), 'ATTACK_RANGE')])], [
    recipe(christ, 1, [stage('ATTACK', '通常攻撃1回', [main('ARTS')], [buildup('neural', key('attack@ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main', damageType: 'ARTS' })],
      { atk: key('atk'), maxTargets: key('attack@max_target') }), stage(palsy, palsyOption[1], [], [], { atk: key('atk') })], [eventInput([normalAttack, palsyOption])]),
    recipe(christ, 2, [stage('SKILL_TICK', '感知霊体の1周期（1秒）', [main('ARTS', key('atk_scale'), true),
      extraElemental('neural', choice('targetElementalBurst', 'NEURAL', key('atk_scale_ep')))], [], { maxTargets: null }),
      stage(palsy, palsyOption[1], [])], [eventInput([['SKILL_TICK', '感知霊体の1周期（1秒）'], palsyOption])]),
  ]),
  def(mantra, [
    talent(0, '沈黙の領域', '1', v => [talentDamage('palsy', 'atk_scale', v.read('atk_scale'), 'ELEMENTAL', 'neural', 'PALSY_TRIGGER', selected(palsy), 'BATTLEFIELD'),
      ...(v.read('prob') === 0.1 ? [] : (v.issue('確認済みの麻痺回数非消費確率と一致しません。'), [])),
      state('palsy-preservation', 'prob', '麻痺回数の非消費確率10%（今回の元素ダメージは確定）')]),
    talent(1, '全域洞察', '2', () => [state('entrance-palsy', 'description', '最寄り出現地点の敵へ麻痺1回を付与')], ['STATUS']),
  ], [recipe(mantra, 1, [stage('ATTACK', '強化攻撃1回', [main('ARTS', key('atk_scale')),
      extraElemental('neural', choice('targetElementalBurst', 'NEURAL', key('element_atk_scale')))],
    [buildup('neural', key('ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main' })]), stage(palsy, palsyOption[1], [])],
  [eventInput([['ATTACK', '強化攻撃1回'], palsyOption])]),
    // Primary and bounce targets have unequal damage; never average their
    // elemental gauges or claim that every target receives the primary hit.
    // https://prts.wiki/w/真言 — skill 2 damage/buildup and skill 3 overflow notes.
    recipe(mantra, 2, [
      stage('PRIMARY', '主対象の1命中', [main('ARTS', key('attack@atk_scale')),
        extraElemental('neural', choice('targetElementalBurst', 'NEURAL', key('attack@element_atk_scale')))],
      [buildup('neural', key('attack@ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main' })]),
      stage('BOUNCE', '跳躍対象の1命中', [main('ARTS', key('attack@chain.atk_scale')),
        extraElemental('neural', choice('targetElementalBurst', 'NEURAL', key('attack@element_atk_scale')))],
      [buildup('neural', key('attack@ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main' })], { maxTargets: key('chain_times') }),
      stage(palsy, palsyOption[1], []),
    ], [eventInput([['PRIMARY', '主対象の1命中'], ['BOUNCE', '跳躍対象の1命中'], palsyOption])]),
    recipe(mantra, 3, [stage('ATTACK', '通常攻撃1回', [main('ARTS')], [], { atk: key('atk'), maxTargets: key('attack@max_target') }),
      stage('OVERFLOW', '発生した溢れ麻痺1回の元素跳躍', [{ role: 'MAIN', label: '溢れ麻痺の元素跳躍', damageType: 'ELEMENTAL',
        damageKind: { type: 'ELEMENTAL_DAMAGE', elementId: 'neural' }, scale: key('atk_scale'), basis: 'ATK_STAT' }], [],
      { atk: key('atk'), maxTargets: key('max_target'), traitOverrides: ['DAMAGE_TYPE'] }),
      stage(palsy, palsyOption[1], [], [], { atk: key('atk') })],
    [eventInput([normalAttack, ['OVERFLOW', '発生した溢れ麻痺1回の元素跳躍'], palsyOption])]),
  ]),
  def(blaze, [
    talent(0, '融点起爆', '1', v => [talentDamage('burst', 'ep_damage_scale', v.read('ep_damage_scale'), 'ELEMENTAL', 'burn', 'ELEMENTAL_BURST', selected(burst), 'BATTLEFIELD'),
      effect('healing', 'hp_ratio', { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', unit: 'MAX_HP_RATIO', value: v.read('hp_ratio') },
        { timing: { type: 'EVENT', event: 'ELEMENTAL_BURST' }, condition: selected(burst), lifetime: { type: 'CURRENT_EVENT' } })]),
    talent(1, '窮地再燃', '2', v => { v.read('hp_recovery_per_sec_by_max_hp_ratio'); v.read('stun'); v.read('dynamic')
      return [state('downed', 'hp_recovery_per_sec_by_max_hp_ratio / stun / dynamic', '致命ダメージでスキル終了・ダウン、バリアと回復、復帰時スタン')]
    }, ['SURVIVAL', 'STATUS']),
  ], [recipe(blaze, 3, [stage('ATTACK', '残弾を1消費する範囲攻撃', [main('ARTS'), extraElemental('burn', choice('targetElementalBurst', 'BURN', key('attack@atk_scale')))], [],
      { atk: key('atk'), intervalAdd: key('base_attack_time'), maxTargets: null }), stage(burst, burstOption[1], [], [], { atk: key('atk') })],
    [eventInput([['ATTACK', '残弾を1消費する範囲攻撃'], burstOption]), blazeState, count('remainingAmmo', '攻撃前の残弾', 1, 1000, 25)], activeOnly)]),
  // The initial mark ticks immediately. Sum its 16% with this event's skill
  // buildup, rather than claiming an unverified ordering of the two applications.
  // https://prts.wiki/w/波卜 — talent notes: immediate + each following second.
  def(bobb, [talent(0, '熱焦点誘導', '1', v => {
    exact(v, 'attack@ep_damage_ratio_talent', 0.16); exact(v, 'attack@dmg_duration', 5)
    return [talentBuildup('mark-tick', 'attack@ep_damage_ratio_talent', 'burn', v.read('attack@ep_damage_ratio_talent'), selected(periodic)),
      state('initial-tick', 'attack@ep_damage_ratio_talent / attack@dmg_duration', '初回ダメージ時の即時損傷はスキル損傷と合算・以後5秒間の各周期は別イベント')]
  })], [
    recipe(bobb, 1, [stage('ATTACK', '強化攻撃1回・初回なら素質の即時損傷込み', [main('ARTS', key('atk_scale'))],
      [{ ...buildup('burn', bobbFirstScale(key('ep_damage_ratio'))), label: '灼熱損傷（初回の即時素質を含む）' }]),
      stage(periodic, '付与中の素質1周期（1秒）', [])],
    [eventInput([['ATTACK', '強化攻撃1回'], [periodic, '付与中の素質1周期（1秒）']]), bobbFirst]),
    recipe(bobb, 2, [stage('SKILL_TICK', '地上の灼熱エリア1周期・初回なら素質の即時損傷込み', [main('ARTS', key('attack@atk_scale'), true)],
      [{ ...buildup('burn', bobbFirstScale(key('attack@ep_damage_ratio'))), label: '灼熱損傷（初回の即時素質を含む）' }], { maxTargets: null }),
      stage(periodic, '付与中の素質1周期（1秒）', [], [], { maxTargets: null })],
    [eventInput([['SKILL_TICK', '地上の灼熱エリア1周期（1秒）'], [periodic, '付与中の素質1周期（1秒）']]), bobbFirst]),
  ]),
  // A mark is its own clock and ends with necrosis or the operator's departure.
  // Do not add a tick for every attack or include the enemy burst's 800 HP/s.
  // https://prts.wiki/w/妮芙 — talent/skill notes.
  def(nymph, [
    talent(0, '抜け落つ魂', '1', v => [talentDamage('necrosis-mark', 'element_atk_scale',
      numericChoice(both(eq('skillIndex', 2), selected('EMPOWERED_TICK')), 1, v.read('element_atk_scale')), 'ELEMENTAL', 'necrosis',
      'PERIODIC_TICK', both({ type: 'ANY', conditions: [selected(periodic), selected('EMPOWERED_TICK')] }, eq('targetElementalBurst', 'NECROSIS')))]),
    talent(1, '心を覗く鍵', '2', v => {
      exact(v, 'max_stack_cnt', 10)
      return [effect('attack', 'atk / max_stack_cnt', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
        value: { type: 'CALC', operation: 'MULTIPLY', values: [v.read('atk'), { type: 'METRIC', metric: nymphStacks.key }] } })]
    }, ['ABILITY']),
  ], [
    recipe(nymph, 1, [stage('ATTACK', '通常攻撃1回', [
      extraElemental('necrosis', choice('targetElementalBurst', 'NECROSIS', key('attack@extra_ep_damage_scale'))), main('ARTS')],
    [buildup('necrosis', key('attack@ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main', damageType: 'ARTS' })], { atk: key('atk') }),
      stage(periodic, '付与中の素質1周期（1秒）', [], [], { atk: key('atk') })],
    [eventInput([normalAttack, [periodic, '付与中の素質1周期（1秒）']]), nymphStacks], nymphTickRequirement),
    recipe(nymph, 3, [stage('ATTACK', '壊死爆発効果なしの主攻撃1命中', [main('ARTS')], [],
      { atk: key('atk'), aspd: key('attack_speed'), maxTargets: key('attack@max_target') }),
      stage('ATTACK_NECROSIS', '壊死爆発効果中への主元素1命中', [{ id: 'main', label: '主攻撃の元素ダメージ', role: 'MAIN', damageType: 'ELEMENTAL',
        damageKind: { type: 'ELEMENTAL_DAMAGE', elementId: 'necrosis' }, scale: key('attack@split_atk_scale'), basis: 'ATK_STAT' }], [],
      { atk: key('atk'), aspd: key('attack_speed'), maxTargets: key('attack@max_target'), traitOverrides: ['DAMAGE_TYPE'] }),
      stage(periodic, '付与中の素質1周期（1秒）', [], [], { atk: key('atk'), maxTargets: null })],
    [eventInput([['ATTACK', '壊死爆発効果なしの主攻撃1命中'], ['ATTACK_NECROSIS', '壊死爆発効果中の主元素1命中'], [periodic, '付与中の素質1周期（1秒）']]), nymphStacks],
    [...nymphTickRequirement,
      { when: { input: eventKey, comparison: 'EQ', value: 'ATTACK_NECROSIS' }, condition: { input: 'targetElementalBurst', comparison: 'EQ', value: 'NECROSIS' }, reason: '主攻撃の元素化は壊死爆発効果中に発生します。' },
      { when: { input: eventKey, comparison: 'EQ', value: 'ATTACK' }, condition: { input: 'targetElementalBurst', comparison: 'NE', value: 'NECROSIS' }, reason: '壊死爆発効果中は主元素命中を選んでください。' },
    ]),
  ]),
]

const hpBefore = count('targetHpBeforeHit', '対象の命中直前HP', 1, 1000000000, 10000)
const hpState = input('targetHpSpecialState', '対象のHP特殊処理', [['STANDARD', 'バリア・同時回復・不死・蘇生なし'], ['OTHER', 'あり']])
const ordinaryHpOnly: NonNullable<GuardSkillRecipe['conditionRequirements']> = [
  { condition: { input: hpState.key, comparison: 'EQ', value: 'STANDARD' },
    reason: '実HP減少量はバリア・同時回復・不死・蘇生のない対象の単一命中だけに対応しています。' },
]
const hpLoss = (elementId: string, scale: GuardValue) => buildup(elementId, scale,
  { type: 'HP_LOST', actionId: 'main', damageType: 'ARTS', hpBefore: { input: hpBefore.key } })
const extraRecipes: GuardSkillRecipe[] = [
  // https://prts.wiki/w/妮芙 — primary hit, then the same-radius hit after 0.33 s.
  // Each event uses its own immediately preceding HP; never multiply by two and
  // reuse the original HP for a target that may have died in between.
  recipe(nymph, 2, [
    stage('FIRST_HIT', '初撃の1命中', [main('ARTS', key('atk_scale'))], [hpLoss('necrosis', key('ep_damage_ratio'))]),
    stage('AREA_HIT', '0.33秒後の範囲1命中（生存対象）', [main('ARTS', key('atk_scale'))], [hpLoss('necrosis', key('ep_damage_ratio'))], { maxTargets: null }),
    stage(periodic, '通常の素質1周期（1秒）', []), stage('EMPOWERED_TICK', 'S2付与済み素質1周期（1秒）', [], [], { maxTargets: null }),
  ], [eventInput([['FIRST_HIT', '初撃の1命中'], ['AREA_HIT', '0.33秒後の範囲1命中（生存対象）'],
    [periodic, '通常の素質1周期（1秒）'], ['EMPOWERED_TICK', 'S2付与済み素質1周期（1秒）']]), nymphStacks, hpBefore, hpState],
  [...ordinaryHpOnly, ...nymphTickRequirement,
    { when: { input: eventKey, comparison: 'EQ', value: 'EMPOWERED_TICK' }, condition: { input: 'targetElementalBurst', comparison: 'EQ', value: 'NECROSIS' },
      reason: 'S2で付与した素質周期も壊死爆発効果中のみ発生します。' },
  ]),
  // https://prts.wiki/w/烛煌 — the aura snapshots ATK when applied, produces
  // source-less precomputed arts damage, and derives buildup from actual HP loss.
  // A zero ATK scale plus fixed damage preserves that snapshot independently of
  // the operator's current level/ATK; no current attack multipliers are applied.
  recipe(blaze, 1, [
    stage('AURA_TICK', '付与済み炎輪の1周期（1秒）', [{ ...main('ARTS', 0, true), flatDamage: mul(key('atk_scale'), { input: 'appliedAuraAttack' }) }],
      [hpLoss('burn', key('element_multiplier'))], { maxTargets: null }),
    stage('ATTACK', '本人の通常攻撃1回', [main('ARTS')]), stage(burst, burstOption[1], []),
  ], [eventInput([['AURA_TICK', '付与済み炎輪の1周期（1秒）'], normalAttack, burstOption]),
    count('appliedAuraAttack', '炎輪付与時の攻撃力', 1, 1000000, 752), hpBefore, hpState, blazeState], [...ordinaryHpOnly, ...activeOnly]),
  recipe(blaze, 2, [
    stage('AREA_TICK', '地上の灼熱エリア1周期（重複なし）', [main('ARTS', key('atk_scale'), true)], [hpLoss('burn', key('element_damage_scale'))],
      { atk: key('atk'), maxTargets: null }),
    stage('ATTACK', 'HP消費後の通常攻撃1回', [main('ARTS')], [], { atk: key('atk'), maxTargets: key('attack@max_target') }),
    stage(burst, burstOption[1], [], [], { atk: key('atk') }),
  ], [eventInput([['AREA_TICK', '地上の灼熱エリア1周期（重複なし）'], normalAttack, burstOption]),
    { key: 'selfHpBeforeAttackPercent', label: '攻撃開始前の自身HP', kind: 'number', min: 0.1, max: 100, step: 0.1, defaultValue: 100 },
    hpBefore, hpState, blazeState], [...ordinaryHpOnly, ...activeOnly,
    { when: { input: eventKey, comparison: 'EQ', value: 'ATTACK' }, condition: { input: 'selfHpBeforeAttackPercent', comparison: 'GT', value: 5 },
      reason: '攻撃開始時に最大HPの5%を失います。ダウンする状態では攻撃を計算しません。' },
  ]),
]
export const EXPANDED_ELEMENTAL_EVENT_DEFINITIONS: readonly ExpandedOperatorDefinition[] = EVENT_DEFINITIONS.map(definition => ({ ...definition,
  recipes: [...definition.recipes, ...extraRecipes.filter(recipe => recipe.operatorId === definition.operatorId)],
}))

// Assert source coverage without silently registering absent/unreviewed skills.
for (const definition of EXPANDED_ELEMENTAL_EVENT_DEFINITIONS) for (const recipe of definition.recipes) {
  if (!sources.find(source => source.operatorId === definition.operatorId)?.skills.some(skill => skill.skillIndex === recipe.skillIndex))
    throw new Error(`Missing elemental event source: ${definition.operatorId} S${recipe.skillIndex}`)
}
