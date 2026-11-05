import sources from '../data/expandedArtsSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue, CombatRecipientSelector } from './combatEffectStructure.ts'

const k = (key: string): GuardValue => ({ key })
const input = (name: string): GuardValue => ({ input: name })
const product = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const sum = (...args: GuardValue[]): GuardValue => ({ op: 'add', args })
const choose = (input: string, value: string | number | boolean, yes: GuardValue, no: GuardValue = 0,
  comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): GuardValue => ({ op: 'if', input, comparison, value, yes, no })
const n = (key: string, label: string, defaultValue: number, min: number, max: number): GuardInput =>
  ({ key, label, kind: 'number', defaultValue, min, max, step: 1 })
const b = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const select = (key: string, label: string, choices: readonly [string, string][]): GuardInput =>
  ({ key, label, kind: 'select', defaultValue: choices[0][0], options: choices.map(([value, label]) => ({ value, label })) })
const eq = (metric: string, value: string | number | boolean): CombatCondition => ({ type: 'COMPARE', metric, comparison: 'EQ', value })
const cmp = (metric: string, comparison: 'GT' | 'GTE' | 'LT' | 'LTE', value: number | null): CombatCondition => ({ type: 'COMPARE', metric, comparison, value })
const metric = (name: string): CombatNumericValue => ({ type: 'METRIC', metric: name })
const mul = (...values: CombatNumericValue[]): CombatNumericValue => ({ type: 'CALC', operation: 'MULTIPLY', values })
const add = (...values: CombatNumericValue[]): CombatNumericValue => ({ type: 'CALC', operation: 'ADD', values })
const percent = (value: number | null): number | null => value === null ? null : value * 100
const target = (side: 'SELF' | 'ALLY' | 'ENEMY', scope: Exclude<CombatRecipientSelector['scope'], 'CUSTOM_RANGE'> = 'SELF'): CombatRecipientSelector =>
  ({ type: 'RECIPIENTS', side, entity: 'UNIT', scope, includeSelf: side !== 'ENEMY', factionIds: [], tagIds: [], selection: { type: 'ALL' } })
type Payload<T> = T extends CombatEffectContext ? Omit<T, keyof CombatEffectContext> : never
const effect = (id: string, sourceBinding: string, payload: Payload<TalentStructureEffect>, options: Partial<CombatEffectContext> = {}): TalentStructureEffect =>
  ({ id, sourceBinding, timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null, target: target('SELF'),
    probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [], ...payload, ...options }) as TalentStructureEffect
const atk = (value: CombatNumericValue, sourceBinding = 'atk', options: Partial<CombatEffectContext> = {}) =>
  effect('attack', sourceBinding, { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value }, options)
const speed = (value: CombatNumericValue, options: Partial<CombatEffectContext> = {}) =>
  effect('attack-speed', 'attack_speed', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value }, options)
const damage = (value: CombatNumericValue, condition: CombatCondition, sourceBinding = 'damage_scale', artsOnly = false) =>
  effect('damage-scale', sourceBinding, { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value },
    { condition, target: { ...target('ENEMY', 'ATTACK_TARGET'), tagIds: artsOnly ? ['arts_damage'] : [] } })
const status = (id: string, text: string, options: Partial<CombatEffectContext> = {}) =>
  effect(id, `description:${id}`, { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: text }, options)
const talent = (talentIndex: number, name: string, effects: ExpandedTalentDefinition['effects'],
  categories: ExpandedTalentDefinition['categories'] = ['ABILITY'], prefabKey = String(talentIndex + 1)): ExpandedTalentDefinition =>
  ({ talentIndex, name, prefabKey, categories, effects })
const normal = (options: Partial<GuardStage> = {}): GuardStage => ({ id: 'active', label: 'スキル中', kind: 'NORMAL',
  actions: [{ label: '術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1 }], ...options })
const next = (scale: GuardValue, maxTargets?: GuardValue | null): GuardStage =>
  normal({ label: '強化攻撃', kind: 'NEXT_ATTACK', maxTargets, actions: [{ label: '強化攻撃', role: 'MAIN', damageType: 'ARTS', scale }] })
const action = (label: string, scale: GuardValue, maxTargets: GuardValue | null = null): GuardStage =>
  normal({ label, kind: 'SKILL_ACTION', maxTargets, actions: [{ label, role: 'MAIN', damageType: 'ARTS', scale }] })
const phase = (input: string, value: string, stage: GuardStage): GuardStage =>
  ({ ...stage, id: value.toLowerCase(), when: { input, comparison: 'EQ', value } })
const unresolvedPeriod = (reason: string): GuardStage['periodTotal'] => ({ kind: 'UNSUPPORTED', reason })
const periodic = (label: string, scale: GuardValue, options: Partial<GuardStage> = {}): GuardStage => normal({
  maxTargets: null, actions: [{ label, role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale, timing: 'PER_SECOND' }],
  periodTotal: unresolvedPeriod('付与・更新・初回と最終回の時刻を扱わず、有効な範囲内の毎秒ダメージを計算します。'), ...options,
})
const physical = (options: Partial<GuardStage> = {}): GuardStage => normal({
  actions: [{ label: '物理攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }], ...options,
})
const singleDeviceStages = (stage: GuardStage): readonly GuardStage[] => [
  { ...stage, when: { input: 'selfDeviceCount', comparison: 'LT', value: 2 } },
  physical({ id: 'multiple-devices', label: '複数装置の重複', actions: [],
    when: { input: 'selfDeviceCount', comparison: 'GTE', value: 2 },
    unresolved: ['同じ支援装置2基から自身へ付与する攻撃力の重複方式は未確認です。0基または1基で指定してください。'] }),
]
const recipe = (operatorId: string, skillIndex: number, stages: readonly GuardStage[], inputs: readonly GuardInput[] = [], notes: readonly string[] = []): GuardSkillRecipe => {
  const raw = sources.find(source => source.operatorId === operatorId)!.skills.find(skill => skill.skillIndex === skillIndex)!.raw
  return { operatorId, skillIndex, inputs, notes, stages: stages.map(stage => ({ ...stage,
    duration: stage.duration ?? (raw.duration < 0 ? 'UNTIL_EXIT' : raw.duration),
  })) }
}
const operator = (operatorId: string, stages: readonly [number, GuardStage | readonly GuardStage[], (readonly GuardInput[])?][], talents: readonly ExpandedTalentDefinition[],
  options: Partial<Omit<ExpandedOperatorDefinition, 'operatorId' | 'recipes' | 'talents'>> = {}): ExpandedOperatorDefinition =>
  ({ operatorId, phaseIndex: 2, skillLevelIndex: 9, talents,
    recipes: stages.map(([index, value, inputs]) => recipe(operatorId, index, Array.isArray(value) ? value : [value as GuardStage], inputs)), ...options })
const hp = n('targetHpPercent', '対象のHP（%）', 100, 0, 100)
const aoeNotes = ['選択した全対象が同じ攻撃に命中する条件。範囲外の敵と敵の位置変化は含めない。']

/** Reviewed JP skills. Unsupported mechanisms remain explicitly deferred, never approximated by a normal attack. */
export const EXPANDED_ARTS_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  operator('char_121_lava', [[1, normal({ aspd: k('attack_speed') })]], [
    talent(0, '高速チャージ', v => [effect('deploy-sp', 'sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('sp') },
      { timing: { type: 'EVENT', event: 'DEPLOY' }, lifetime: { type: 'CURRENT_EVENT' } })], ['RESOURCE']),
  ], { phaseIndex: 1, skillLevelIndex: 6, traitNotes: aoeNotes }),
  operator('char_210_stward', [[1, next(k('atk_scale'))]], [talent(0, '堅実家', v => [atk(v.read('atk')), status('priority', '防御力が最も高い敵を優先')], ['ABILITY', 'ATTACK_BEHAVIOR'])],
    { phaseIndex: 1, skillLevelIndex: 6 }),
  operator('char_278_orchid', [[1, normal({ atk: k('atk'), aspd: k('attack_speed') })]], [talent(0, '攻撃速度上昇', v => [speed(v.read('attack_speed'))])],
    { phaseIndex: 1, skillLevelIndex: 6 }),
  operator('char_109_fmout', [[1, normal({ aspd: k('attack_speed') })], [2, normal({ atk: k('atk') })]], [
    talent(0, '占い', v => [atk(v.read('atk'), 'atk', { condition: eq('fortuneResult', 'ATK') }),
      speed(v.read('attack_speed'), { condition: eq('fortuneResult', 'ASPD') }),
      status('max-hp', `最大HP+${percent(v.read('max_hp')) ?? '未確定'}%`, { condition: eq('fortuneResult', 'HP') })]),
  ], { inputs: [select('fortuneResult', '占いの結果', [['ATK', '攻撃力'], ['ASPD', '攻撃速度'], ['HP', '最大HP']])], traitNotes: aoeNotes }),
  operator('char_253_greyy', [[1, normal({ aspd: k('attack_speed') })], [2, normal({ aspd: k('attack_speed') })]], [
    talent(0, '静電場', () => [status('sluggish', '攻撃対象を足止め')], ['STATUS']),
  ], { traitNotes: aoeNotes }),
  operator('char_4051_akkord', [[1, next(k('atk_scale'))],
    [2, normal({ atk: k('atk'), maxTargets: null, actions: [
      { label: '通常攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1 },
      { label: 'ソニックブーム', role: 'ADDITIONAL', damageType: 'ARTS', scale: k('attack@aoe_atk_scale'), hits: input('sonicBoomHits') },
    ], periodTotal: unresolvedPeriod('オペレーターと敵の配置が一定の1攻撃を評価し、移動を含む総ダメージは計算しません。') }),
      [n('sonicBoomHits', '対象に命中するソニックブームの数', 0, 0, 20)]]], [
    talent(0, '律動の共鳴', v => [atk(v.read('atk'), 'atk', { condition: { type: 'ANY', conditions: [
      eq('allyInAttackRange', true), { type: 'ALL', conditions: [eq('skillIndex', 2), cmp('sonicBoomHits', 'GT', 0)] },
    ] } })]),
  ], { inputs: [b('allyInAttackRange', '攻撃範囲内に自身以外の味方')],
    traitNotes: [...aoeNotes, 'S2のソニックブームは対象ごとの実命中数を指定する。1回以上命中する場合は範囲内の他オペレーターが必要なため、素質の攻撃力上昇も適用する。選択した全敵が通常攻撃と同じ数のソニックブームを受ける固定配置を評価する。'] }),
  operator('char_183_skgoat', [[1, normal({ atk: k('atk') })]], [
    talent(0, '地質調査', () => [status('sluggish-extension', '特性の足止め時間を延長')], ['STATUS']),
  ], { deferredSkills: [{ skillIndex: 2, reason: '攻撃を停止して足止めを行うスキル。直接ダメージの出力対象外。' }] }),
  operator('char_002_amiya', [[1, normal({ aspd: k('attack_speed') })],
    [2, normal({ maxTargets: null, actions: [{ label: 'ランダム連続攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale'), hits: k('attack@times'), targets: 1 }] })],
    [3, normal({ atk: k('atk'), traitOverrides: ['DAMAGE_TYPE'], actions: [{ label: '確定攻撃', role: 'MAIN', damageType: 'TRUE', scale: 1 }] })]], [
    talent(0, 'アブソープション', v => [
      effect('attack-sp', 'amiya_t_1[atk].sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('amiya_t_1[atk].sp') }, { timing: { type: 'EVENT', event: 'ATTACK' } }),
      effect('kill-sp', 'amiya_t_1[kill].sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('amiya_t_1[kill].sp') }, { timing: { type: 'EVENT', event: 'KILL' } }),
    ], ['RESOURCE']),
  ], { traitNotes: ['ランダム攻撃は同条件の対象への均等な配分期待値。SP回復とスキル後のスタン・強制退場は周期DPSに含めない。'] }),
  operator('char_405_absin', [[1, normal({ atk: k('atk'), duration: 'UNTIL_EXIT' })],
    [2, [normal({ when: { input: 'targetHpPercent', comparison: 'LT', value: 50 },
      actions: [{ label: '4連続攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale'), hits: k('attack@times') }] }),
    normal({ id: 'invalid-target', label: '攻撃対象外', when: { input: 'targetHpPercent', comparison: 'GTE', value: 50 },
      actions: [], unresolved: ['S2はHP50%未満の敵だけを攻撃する。対象のHP条件を変更してください。'] })]]], [
    talent(0, '法の執行者', v => [damage(v.read('damage_scale'), cmp('targetHpPercent', 'LT', percent(v.read('hp_ratio'))))], ['DAMAGE']),
  ], { inputs: [{ ...hp, defaultValue: 30 }], traitNotes: ['対象のHP割合が一定の条件で計算する。ダメージによるHPの推移は含めない。'] }),
  operator('char_411_tomimi', [[1, normal({ aspd: k('attack_speed'), traitOverrides: ['DAMAGE_TYPE'], actions: [{ label: '物理攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }] })]], [
    talent(0, '荒野術師流戦法', v => [atk(v.read('atk')), status('physical-mode', 'スキル中は地上対象への物理攻撃・攻撃範囲縮小')], ['ABILITY', 'ATTACK_BEHAVIOR']),
  ], { traitNotes: ['スキル中の地上の敵への攻撃を計算する。'], deferredSkills: [{ skillIndex: 2, reason: '確率選択されるスタン・攻撃倍率・範囲攻撃の分岐と命中対象を扱う必要がある。' }] }),
  operator('char_466_qanik', [[1, normal({ aspd: k('attack_speed') })]], [
    talent(0, '氷原生存術', v => [damage(v.read('damage_scale'), eq('targetAirborne', true), 'damage_scale', true)], ['DAMAGE']),
  ], { inputs: [b('targetAirborne', '対象が空中にいる')], deferredSkills: [{ skillIndex: 2, reason: '浮遊の付与・終了時の追加ダメージを時系列で評価する必要がある。' }] }),
  operator('char_166_skfire', [[1, normal({ atk: k('atk') })]], [
    talent(0, 'アーツバースト', v => [damage(v.read('damage_scale'), eq('targetBlocked', true), 'damage_scale', true)], ['DAMAGE']),
  ], { inputs: [b('targetBlocked', '対象がブロックされている')], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 2, reason: '隕石の発生・命中時間とスキル中の攻撃間隔の適用方式を確認する必要がある。' }] }),
  operator('char_373_lionhd', [[1, normal({ atk: k('atk') })],
    [2, [
      { ...action('弱点解析＆爆破', k('atk_scale')), resistanceReductionRatio: product(-1, k('magic_resistance')),
        when: { input: 'lionhardtDebuffActive', comparison: 'EQ', value: true } },
      { ...action('初回命中', k('atk_scale')), id: 'first-hit', actions: [],
        when: { input: 'lionhardtDebuffActive', comparison: 'EQ', value: false },
        unresolved: ['術耐性低下が有効でない対象は、新規付与と命中の処理順序を確認する必要があります。'] },
    ], [b('lionhardtDebuffActive', '命中前から同スキルの術耐性低下が有効', true)]]], [
    talent(0, '破片爆散', v => [atk(mul(v.read('atk'), { type: 'CALC', operation: 'MIN', values: [metric('nearbyEnemyCount'), v.read('max_valid_stack_cnt')] }), 'atk × 対象数')]),
  ], { inputs: [n('nearbyEnemyCount', '攻撃範囲内の敵数', 1, 0, 100)],
    traitNotes: [...aoeNotes, 'S2は同スキルの術耐性低下が既に有効な対象への1回分を計算する。初回命中は未対応。'] }),
  operator('char_341_sntlla', [[1, normal({ atk: k('atk'), aspd: k('attack_speed') })]], [
    talent(0, '寒地の民', v => [atk(v.read('atk'), 'atk', { condition: cmp('secondsSinceDeploy', 'GTE', v.read('interval')) }),
      status('status-resistance', '配置20秒後にレジスト', { condition: cmp('secondsSinceDeploy', 'GTE', v.read('interval')) })], ['ABILITY', 'STATUS']),
  ], { inputs: [n('secondsSinceDeploy', '配置からの経過時間（秒）', 20, 0, 3600)], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 2, reason: 'ランダムなマスへの氷柱と敵の位置に依存する命中確率のモデルが必要。' }] }),
  operator('char_4031_liesel', [[1, next(k('atk_scale'))]], [
    talent(0, '指揮者の素質', v => [damage(v.read('damage_scale'), cmp('actualAttackTargetCount', 'GTE', v.read('min_target_cnt')))], ['DAMAGE'], '0'),
  ], { traitNotes: aoeNotes, deferredSkills: [{ skillIndex: 2, reason: '複数の爆発の重複命中と継続ダメージの付与・更新を扱う必要がある。' }] }),
  operator('char_489_serum', [[1, normal({ atk: k('atk') })], [2, normal({ atk: k('atk') })]], [
    talent(0, '戦術的調整', v => [effect('sp-recovery', 'sp_recovery_per_sec', { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { condition: cmp('source.secondsSinceLastNormalAttack', 'GTE', v.read('delay')) })], ['RESOURCE']),
  ], { traitNotes: aoeNotes }),
  operator('char_494_vendla', [[1, normal({ aspd: k('attack_speed') })], [2, [
    phase('vendelaPhase', 'NORMAL', normal({ atk: k('atk'),
      notes: ['通常攻撃のみの値。反撃は「反撃1回」で別に評価し、反撃込みの時間平均DPSにはしない。'],
      periodTotal: unresolvedPeriod('味方への被撃回数・時刻を指定していないため、反撃込みの総ダメージは未計算です。') })),
    phase('vendelaPhase', 'COUNTER', { ...action('反撃1回', k('atk_scale'), 1), atk: k('atk') }),
  ]]], [
    talent(0, '土壌改良', v => [effect('heal-scale', 'heal_scale', { item: 'HEAL_RECEIVED_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('heal_scale') },
      { target: { ...target('ALLY', 'ATTACK_RANGE'), selection: { type: 'COUNT', count: 1 } } })], ['SURVIVAL']),
  ], { inputs: [select('vendelaPhase', '評価する攻撃', [['NORMAL', '通常攻撃'], ['COUNTER', '反撃1回']])],
    traitNotes: ['呪癒師の味方への回復量はダメージに含めない。反撃は指定された味方がダメージを受けた1回分。'] }),
  operator('char_174_slbell', [[1, normal({ maxTargets: k('attack@max_target') })],
    [2, normal({ maxTargets: 2, defenseReductionRatio: { op: 'mul', args: [-1, k('def')] },
      resistanceReductionRatio: { op: 'mul', args: [-1, k('magic_resistance')] } })]], [
    talent(0, '弱体化', v => [damage(v.read('damage_scale'), cmp('targetHpPercent', 'LT', percent(v.read('hp_ratio'))))], ['DAMAGE']),
    talent(1, 'ハーモニー', () => [status('two-targets', '攻撃対象数+1（攻撃定義に反映）')], ['ATTACK_BEHAVIOR']),
  ], { inputs: [hp] }),
  operator('char_254_vodfox', [[1, normal({ atk: k('atk'), duration: 'UNTIL_EXIT' })],
    [2, normal({ defenseReductionRatio: choose('targetInDollRange', true, product(-1, k('def'))),
      periodTotal: unresolvedPeriod('人形の効果範囲内かを固定条件として評価し、配置・消滅時刻は計算しません。') }),
      [b('targetInDollRange', '対象が呪いの人形の効果範囲内')]]], [
    talent(0, '潰敗への誘い', v => [damage(add(1, mul(add(v.read('damage_scale'), -1),
      { type: 'CONDITIONAL', condition: eq('skillIndex', 1), whenTrue: metric('skill.scale_delta_to_one'), whenFalse: 1 })),
      cmp('targetHpPercent', 'LT', percent(v.read('hp_ratio'))), 'damage_scale / skill:scale_delta_to_one')], ['DAMAGE']),
  ], { inputs: [hp], traitNotes: ['S2は自身の通常攻撃を評価する。人形の範囲・残存時間は入力条件とし、味方への支援量は合算しない。'] }),
  operator('char_4079_haini', [[1, next(k('atk_scale'), k('max_target'))],
    [2, normal({ atk: k('atk'), maxTargets: k('attack@max_target'),
      periodTotal: unresolvedPeriod('スキル中の撃破による脆弱倍率の変化を計算していないため、総ダメージは未計算です。') })]], [
    talent(0, '測量機器の応用', v => [damage(add(1, mul(add(v.read('damage_scale'), -1),
      { type: 'CONDITIONAL', condition: eq('skillIndex', 2), whenFalse: 1,
        whenTrue: { type: 'CALC', operation: 'MIN', values: [metric('skill.attack@max_talent_up'),
          add(1, mul(metric('defeatedNormalEnemies'), metric('skill.attack@talent_up')))] } })),
      eq('targetEliteOrBoss', false), 'damage_scale / skill:attack@talent_up')], ['DAMAGE']),
  ], { inputs: [b('targetEliteOrBoss', '対象がエリート・ボス'), n('defeatedNormalEnemies', 'S2中に範囲内で倒れた通常敵の数', 0, 0, 100)],
    traitNotes: ['指定した撃破数と脆弱倍率が一定の時点を評価する。'] }),
  operator('char_195_glassb', [[1, normal({ intervalAdd: k('base_attack_time') })], [2, normal({ atk: k('atk'), maxTargets: k('attack@max_target') })]], [
    talent(0, '探究者', v => [speed(v.read('attack_speed')), effect('defense', 'def', { item: 'DEFENSE_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('def') })]),
  ]),
  operator('char_326_glacus', [[1, normal({ atk: k('atk'), maxTargets: k('attack@max_target') })]], [
    talent(0, '対空装置', v => [effect('drone-attack-scale', 'atk_scale', { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { condition: eq('targetDrone', true) }), status('drone-priority', 'ドローンを優先して攻撃')], ['DAMAGE', 'ATTACK_BEHAVIOR']),
  ], { inputs: [b('targetDrone', '対象がドローン')], deferredSkills: [{ skillIndex: 2, reason: '対ドローン倍率と素質の通常攻撃倍率の適用範囲を確認する必要がある。' }] }),
  operator('char_4032_provs', [[1, next(k('atk_scale'))], [2, [
    phase('provisoPhase', 'NORMAL', normal({ intervalAdd: k('base_attack_time'),
      periodTotal: unresolvedPeriod('発動時の範囲攻撃と通常攻撃を段階別に評価するため、合計の総ダメージは未計算です。') })),
    phase('provisoPhase', 'ACTIVATION', action('発動時の範囲攻撃', k('atk_scale'))),
  ]]], [
    talent(0, 'カジミエーシュの法律家', v => [speed(v.read('attack_speed')), status('ally-speed', 'ランダムな味方カジミエーシュ1名の攻撃速度を上昇',
      { target: { ...target('ALLY', 'BATTLEFIELD'), includeSelf: false, factionIds: ['kazimierz'], selection: { type: 'RANDOM', count: 1 } } })]),
  ], { inputs: [select('provisoPhase', 'S2の段階', [['NORMAL', '通常攻撃'], ['ACTIVATION', '発動時']])],
    traitNotes: ['発動時の範囲攻撃とスキル中の通常攻撃は、それぞれの段階を選択して評価する。'] }),
  operator('char_4122_grabds', [[1, next(k('atk_scale'), 2)], [2, [
    phase('grainbudsPhase', 'ATTACK', normal({ label: '睡眠終了後の通常攻撃', aspd: k('attack_speed'), maxTargets: k('max_target'),
      periodTotal: unresolvedPeriod('初期の攻撃停止期間と睡眠終了後の攻撃をつなぐ時系列は計算していないため、総ダメージは未計算です。') })),
    phase('grainbudsPhase', 'SLEEP', normal({ label: '攻撃停止中', kind: 'SKILL_ACTION', actions: [] })),
  ]]], [
    talent(0, '「いい子にしてて」', v => [speed(v.read('attack_speed')), status('wildbeast-slow', '野生動物への足止め時間を延長')], ['ABILITY', 'STATUS']),
  ], { inputs: [select('grainbudsPhase', 'S2の段階', [['ATTACK', '睡眠終了後'], ['SLEEP', '攻撃停止中']])],
    traitNotes: ['睡眠終了後は攻撃可能な敵を指定する。睡眠付与・解除と攻撃再開の時刻は再現しない。'] }),
  operator('char_180_amgoat', [[1, normal({ aspd: k('amgoat_s_1[a].attack_speed'), atk: choose('skillActivationCount', 2, k('amgoat_s_1[b].atk'), 0, 'GTE') })],
    [3, normal({ atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: k('attack@max_target') })]], [
    talent(0, 'フレイムブレス', v => [atk(v.read('atk'), 'atk', { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:CASTER'] } })]),
    talent(1, 'カオスフレイム', () => [status('initial-sp', '配置後SPが7〜15回復')], ['RESOURCE']),
  ], { inputs: [n('skillActivationCount', 'スキル発動回数', 1, 1, 100)], deferredSkills: [{ skillIndex: 2, reason: '主対象と周囲への倍率差、および術耐性低下と命中の適用順序を扱う必要がある。' }] }),
  operator('char_213_mostma', [[1, normal({ atk: k('atk') })],
    [2, periodic('時荒びの黒き錠の毎秒ダメージ', k('atk_scale'))],
    [3, normal({ atk: k('atk') })]], [
    talent(0, 'スキルブースト・術師', v => [effect('caster-sp', 'sp_recovery_per_sec', { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:CASTER'] } })], ['RESOURCE']),
    talent(1, '時間認知鈍化', () => [status('enemy-slow', '攻撃範囲内の敵の移動速度低下', { target: target('ENEMY', 'ATTACK_RANGE') })], ['STATUS']),
  ], { traitNotes: aoeNotes }),
  operator('char_291_aglina', [[1, normal({ atk: k('atk') })],
    [2, normal({ intervalScale: k('base_attack_time'), actions: [{ label: '術攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('damage_scale') }],
      notes: ['攻撃間隔は基礎間隔の15%として計算する。アニメーションのイベント時刻・フレーム丸めによる実命中間隔の差は含めない。'] })],
    [3, normal({ atk: k('atk'), maxTargets: k('attack@max_target') })]], [
    talent(0, 'アクセルフィールド', v => [speed(v.read('attack_speed'), { target: target('ALLY', 'BATTLEFIELD') })]),
    talent(1, 'ダブルワーク', v => [effect('ally-regen', 'hp_recovery_per_sec', { item: 'HP_RESTORE_FIXED', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('hp_recovery_per_sec') },
      { target: target('ALLY', 'BATTLEFIELD'), timing: { type: 'PERIODIC', intervalSeconds: 1, firstTickSeconds: null }, condition: eq('source.skillActive', false) })], ['SURVIVAL']),
  ]),
  operator('char_358_lisa', [[1, normal({ atk: k('atk'), aspd: k('attack_speed') })], [2, normal({ atk: k('atk'), maxTargets: k('attack@max_target'), duration: 'UNTIL_EXIT' })]], [
    talent(0, 'スキルブースト・補助', v => [effect('support-sp', 'sp_recovery_per_sec', { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:SUPPORT'] } })], ['RESOURCE']),
    talent(1, '狐の祟り', v => [damage(v.read('damage_scale'), eq('targetAlreadySlowed', true))], ['DAMAGE']),
  ], { inputs: [b('targetAlreadySlowed', '命中前から対象が足止め中')],
    traitNotes: ['命中前の足止め状態が一定の条件で計算する。初回命中からの脆弱の付与・失効は再現しない。'],
    deferredSkills: [{ skillIndex: 3, reason: '攻撃を停止して回復・足止め・脆弱付与を行うスキル。直接ダメージの出力対象外。' }] }),
  operator('char_164_nightm', [[1, normal()]], [
    talent(0, '二重人格', v => [atk(v.read('atk'), 'atk', { condition: eq('skillIndex', 2) }),
      effect('physical-dodge', 'prob', { item: 'PHYSICAL_DODGE', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('prob') }, { condition: eq('skillIndex', 1) }),
      effect('arts-dodge', 'prob', { item: 'ARTS_DODGE', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('prob') }, { condition: eq('skillIndex', 1) })], ['ABILITY', 'SURVIVAL']),
  ], { traitNotes: ['S1の通常攻撃によるダメージを計算する。味方の回復量は含めない。'],
    deferredSkills: [{ skillIndex: 2, reason: '対象の移動距離・移動速度・効果時間に依存する確定ダメージのモデルが必要。' }] }),
  operator('char_344_beewax', [[1, normal({ atk: k('atk') })], [2, [
    phase('beeswaxPhase', 'NORMAL', normal({
      periodTotal: unresolvedPeriod('砂の碑の出現時ダメージと自身の通常攻撃を別に評価するため、総ダメージは未計算です。') })),
    phase('beeswaxPhase', 'SUMMON', action('砂の碑の出現時', k('atk_scale'))),
  ]]], [
    talent(0, '砂原の加護', v => [effect('self-regen', 'hp_recovery_per_sec_by_max_hp_ratio',
      { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', unit: 'MAX_HP_RATIO', value: v.read('hp_recovery_per_sec_by_max_hp_ratio') },
      { timing: { type: 'PERIODIC', intervalSeconds: 1, firstTickSeconds: null }, condition: eq('source.skillActive', false) })], ['SURVIVAL']),
  ], { inputs: [select('beeswaxPhase', 'S2の段階', [['NORMAL', '自身の通常攻撃'], ['SUMMON', '砂の碑の出現時']])],
    traitNotes: ['出現時は砂の碑の周囲、自身の通常攻撃は自身の範囲内にいる対象を指定する。'] }),
  operator('char_388_mint', [[1, normal({ actions: [{ label: '範囲術攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale') }] })], [2, [
    phase('mintPhase', 'NORMAL', normal({ actions: [{ label: '範囲術攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale') }],
      periodTotal: unresolvedPeriod('終了時の範囲攻撃と通常攻撃を段階別に評価するため、総ダメージは未計算です。') })),
    phase('mintPhase', 'END', action('スキル終了時の範囲攻撃', k('atk_scale'))),
  ]]], [
    talent(0, '地質学者', v => [effect('ally-defense', 'def', { item: 'DEFENSE_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('def') },
      { target: { ...target('ALLY', 'ADJACENT'), includeSelf: false }, condition: eq('source.skillActive', false) }),
      status('reduced-target-priority', 'スキル中は敵に狙われにくくなる', { condition: eq('source.skillActive', true) })], ['ABILITY', 'SURVIVAL']),
  ], { inputs: [select('mintPhase', 'S2の段階', [['NORMAL', '通常攻撃'], ['END', 'スキル終了時']])],
    traitNotes: [...aoeNotes, '通常攻撃と終了時ダメージを分けて評価する。引き寄せによる敵の位置変化は含めない。'] }),
  operator('char_426_billro', [[1, normal({ atk: k('atk') })],
    [2, normal({ atk: choose('overcharged', true, k('atk')), intervalAdd: k('base_attack_time') })],
    // The current hit adds its mark before damage: https://prts.wiki/w/Carnelian#技能
    [3, normal({ atk: product(k('atk'), input('currentAttackRisePercent'), 0.01),
      damageScale: sum(1, choose('overcharged', true,
        product(k('attack@damage_scale'), { op: 'min', args: [5, sum(input('existingMarkStacks'), 1)] }))),
      notes: ['OC時は命中前の刻印数に今回の1回分を加え、最大5回としてダメージに適用する。'],
      periodTotal: unresolvedPeriod('現在の攻撃力上昇率と今回の命中で加わる刻印を含む1攻撃を評価し、その後の時間上昇・刻印蓄積は計算しません。') }),
      [n('currentAttackRisePercent', '現在の攻撃力上昇（上限に対する%）', 100, 0, 100),
        n('existingMarkStacks', '命中前の刻印数', 0, 0, 5)]]], [
    talent(0, '血肉饗宴', v => [effect('activation-heal', 'heal_scale / billro_t_1[enhance].heal_scale',
      { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', unit: 'MAX_HP_RATIO', value: { type: 'CONDITIONAL', condition: eq('overcharged', true),
        whenTrue: v.read('billro_t_1[enhance].heal_scale'), whenFalse: v.read('heal_scale') } },
      { timing: { type: 'EVENT', event: 'SKILL_START' }, lifetime: { type: 'CURRENT_EVENT' } })], ['SURVIVAL']),
    talent(1, '狂嵐の兆し', v => [effect('charged-sp-recovery', 'sp_recovery_per_sec',
      { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { condition: eq('source.spAtLeastSkillCost', true) })], ['RESOURCE']),
  ], { inputs: [b('overcharged', 'オーバーチャージ')], traitNotes: aoeNotes }),
  // JP runtime snapshot; mechanics references: https://prts.wiki/w/Ifrit and /Ceobe.
  operator('char_134_ifrit', [[1, normal({ atk: k('atk'), aspd: k('attack_speed'), periodTotal: { kind: 'CONSTANT_RATE' } })],
    [2, normal({ label: '強化攻撃', kind: 'NEXT_ATTACK', actions: [
      { label: '強化攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('atk_scale') },
      { label: 'やけど付与中', role: 'ADDITIONAL', damageType: 'ARTS', scale: k('burn.atk_scale'), timing: 'PER_SECOND' },
    ], notes: ['やけどは付与中の毎秒ダメージ。付与・更新・終了時刻や退場後の推移は含めない。'] })]], [
    talent(0, '精神融解', v => [effect('resistance-reduction', 'magic_resistance', {
      item: 'RESISTANCE_REDUCTION_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: mul(-1, v.read('magic_resistance')),
    }, { target: target('ENEMY', 'ATTACK_RANGE') })], ['DAMAGE']),
    talent(1, 'ライン回路', v => [effect('periodic-sp', 'sp', {
      item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('sp'),
    }, { timing: { type: 'PERIODIC', intervalSeconds: v.read('interval'), firstTickSeconds: null } })], ['RESOURCE']),
  ], { traitNotes: ['選択した全対象が直線範囲内にいる条件。S2の防御力低下は自身の術ダメージを変化させない。'],
    deferredSkills: [{ skillIndex: 3, reason: '通常攻撃を停止する毎秒攻撃と固定術耐性低下を一体で扱う計算段階が必要。' }] }),
  operator('char_2013_cerber', [[1, next(k('atk_scale'))],
    [2, normal({ intervalScale: k('base_attack_time'), periodTotal: { kind: 'CONSTANT_RATE' } })],
    [3, normal({ atk: k('atk'), traitOverrides: ['DAMAGE_TYPE'],
      actions: [{ label: '物理攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }], periodTotal: { kind: 'CONSTANT_RATE' } })]], [
    talent(0, 'そぎおとし', v => [effect('defense-based-arts', 'atk_scale', {
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: v.read('atk_scale'),
      damageType: 'ARTS', rate: 'PER_ATTACK', basis: 'TARGET_DEFENSE', label: 'そぎおとし',
    }, { target: target('ENEMY', 'ATTACK_TARGET'), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })], ['ADDITIONAL_DAMAGE']),
    talent(1, 'ひとりたび', v => [atk(v.read('atk'), 'atk', { condition: eq('adjacentAllyPresent', false) }),
      speed(v.read('attack_speed'), { condition: eq('adjacentAllyPresent', false) })]),
  ], { inputs: [b('adjacentAllyPresent', '隣接4マスに味方がいる')],
    traitNotes: ['そぎおとしは対象の現在の防御力を参照し、物理防御無視や自身の攻撃倍率は適用しない。'] }),
  // Chain targets share the selected conditions and form one reachable chain.
  // Decay is multiplicative per jump: https://prts.wiki/w/Passenger#特性
  operator('char_306_leizi', [[1, normal({ atk: k('atk'), periodTotal: { kind: 'CONSTANT_RATE' } })],
    [2, normal({ atk: k('atk'), chainDamageRetention: 1, periodTotal: { kind: 'CONSTANT_RATE' } })]], [
    talent(0, '雷行自在', v => [effect('unblocked-attack-scale', 'atk_scale', {
      item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale'),
    }, { condition: eq('targetBlocked', false) })], ['DAMAGE']),
  ], { inputs: [b('targetBlocked', '対象がブロックされている')] }),
  operator('char_4004_pudd', [[1, normal({ aspd: k('attack_speed'), periodTotal: { kind: 'CONSTANT_RATE' } })]], [
    talent(0, '電磁波', v => [atk(v.read('atk'))]),
  ], { deferredSkills: [{ skillIndex: 2, reason: '同じ対象への再跳躍を含む命中列と、単独対象時の跳躍終了を扱う必要がある。' }] }),
  operator('char_472_pasngr', [[1, next(k('pasngr_s_1.atk_scale'), k('pasngr_s_1.max_target'))],
    [2, normal({ atk: k('atk'), intervalScale: { op: 'add', args: [1, k('base_attack_time')] }, maxTargets: k('attack@max_target'),
      periodTotal: { kind: 'UNSUPPORTED', reason: '素質の増幅の付与・更新・失効とHP推移を計算していないため、総ダメージは未計算です。' } })]], [
    talent(0, 'メカニズムアナライズ', v => [effect('active-analysis-amplification', 'pasngr_t_1[enhance].damage_scale', {
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('pasngr_t_1[enhance].damage_scale'),
    }, { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('analysisAmplificationActive', true),
      lifetime: { type: 'FIXED_SECONDS', seconds: v.read('pasngr_t_1[enhance].duration') } })], ['DAMAGE']),
    talent(1, 'ラストソルジャー', v => [atk(v.read('atk'), 'atk', { condition: eq('adjacentEnemyPresent', false) })]),
  ], { inputs: [b('analysisAmplificationActive', '命中時に素質1の増幅が有効'), b('adjacentEnemyPresent', '隣接4マスに敵がいる')],
    traitNotes: ['対象全員の命中時の増幅状態を指定する。HP80%以上の対象への命中による増幅の付与・更新、3秒後の失効はシミュレートしない。'],
    deferredSkills: [{ skillIndex: 3, reason: 'サンダーストームの初回・最終発生、複数ストームと通常攻撃の重なりを扱う必要がある。' }] }),
  operator('char_4027_heyak', [[1, next(k('atk_scale'), 2)],
    [2, [normal({ when: { input: 'targetCanBeLevitated', comparison: 'EQ', value: false },
      maxTargets: null, actions: [{ label: 'ランダム9連続攻撃', role: 'MAIN', damageType: 'ARTS',
      scale: k('attack@atk_scale'), hits: 9, targets: 1 }],
      periodTotal: unresolvedPeriod('浮遊状態の付与・終了による素質倍率の変化を計算していないため、総ダメージは未計算です。') }),
    normal({ id: 'levitation-transition', label: '浮遊による状態変化',
      when: { input: 'targetCanBeLevitated', comparison: 'EQ', value: true }, actions: [],
      unresolved: ['浮遊が有効な対象への9連続攻撃は、命中途中の浮遊付与と素質倍率の変化を扱う必要があるため未対応です。'] })],
      [b('targetCanBeLevitated', '対象に浮遊が有効')]]], [
    talent(0, '伝承の終焉', v => [effect('airborne-attack-scale', 'atk_scale',
      { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { condition: eq('targetAirborne', true) }), status('silence', `${v.read('silence')}秒間の特殊能力無効化`,
        { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('targetAirborne', true) })], ['DAMAGE', 'STATUS']),
    talent(1, '今は無き翼', v => [status('antigravity', `HP${percent(v.read('hp_ratio'))}%以上の敵に反重力を付与`,
      { target: target('ENEMY', 'ATTACK_RANGE') })], ['STATUS']),
  ], { inputs: [b('targetAirborne', '命中時に対象が空中にいる')],
    traitNotes: ['S2は飛行中または浮遊無効の敵など、浮遊付与で空中状態が変化しない対象に限定する。全対象の空中状態・防御条件が同じ場合の均等な配分期待値。浮遊が有効な対象は未対応。'],
    deferredSkills: [{ skillIndex: 3, reason: '複数の旋風の進路・距離による倍率と最初の命中対象を扱う必要がある。' }] }),
  operator('char_1020_reed2', [[1, normal({ atk: k('atk'), aspd: k('attack_speed'),
    periodTotal: unresolvedPeriod('灼痕の確率付与・更新・失効を計算していないため、総ダメージは未計算です。') })]], [
    talent(0, '灼けつく炎', v => [damage(v.read('damage_scale'), eq('reedScarActive', true), 'damage_scale', true),
      status('scar-application', `${percent(v.read('prob'))}%の確率で${v.read('duration')}秒間の灼痕を付与`,
        { target: target('ENEMY', 'ATTACK_TARGET'), timing: { type: 'EVENT', event: 'ATTACK' } }),
      status('scar-attack-reduction', `灼痕中の攻撃力${percent(v.read('atk'))}%`,
        { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('reedScarActive', true) })], ['DAMAGE', 'STATUS']),
    talent(1, '耀映', v => [status('self-heal', `自身以外への治療量の${percent(v.read('scale'))}%で自身を治療`)], ['SURVIVAL']),
  ], { inputs: [b('reedScarActive', '命中時に灼痕が有効')],
    traitNotes: ['灼痕が有効かを命中時の条件として指定する。30%の付与確率を脆弱倍率に乗算した平均値ではない。回復量は含めない。'],
    deferredSkills: [
      { skillIndex: 2, reason: '複数火球と通常攻撃の発生・接触位置・再接触間隔を扱う必要がある。' },
      { skillIndex: 3, reason: '灼痕の継続ダメージと撃破時爆発・周囲への伝播を一体で扱う必要がある。' },
    ] }),
  operator('char_1024_hbisc2', [[1, normal({ atk: k('atk'),
    periodTotal: unresolvedPeriod('対術脆弱の付与・更新・失効の時刻を計算していないため、総ダメージは未計算です。') })]], [
    talent(0, '朝瞬の花', v => [damage(v.read('damage_scale'), eq('hibiscusWeaknessActive', true), 'damage_scale', true),
      status('arts-weakness-application', `攻撃対象に${v.read('weak[magic][limit]')}秒間の対術脆弱を付与`,
        { target: target('ENEMY', 'ATTACK_TARGET'), timing: { type: 'EVENT', event: 'ATTACK' } })], ['DAMAGE', 'STATUS']),
  ], { inputs: [b('hibiscusWeaknessActive', '命中時に素質の対術脆弱が有効')],
    traitNotes: ['命中時の対術脆弱の状態を指定する。付与・更新・失効と味方への回復量は含めない。'],
    deferredSkills: [{ skillIndex: 2, reason: '通常攻撃を行わない毎秒攻撃と、素質の適用時点を扱う必要がある。' }] }),
  operator('char_141_nights', [[1, normal({ atk: k('atk'),
    periodTotal: unresolvedPeriod('術耐性低下の付与・更新・失効の時刻を計算していないため、総ダメージは未計算です。') })],
    [2, normal({ atk: k('atk'), aspd: k('attack_speed'),
      periodTotal: unresolvedPeriod('術耐性低下の付与・更新・失効の時刻を計算していないため、総ダメージは未計算です。') })]], [
    talent(0, '黒い霧', v => [effect('active-resistance-reduction', 'magic_resistance',
      { item: 'RESISTANCE_REDUCTION_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: mul(-1, v.read('magic_resistance')) },
      { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('hazeDebuffActive', true),
        lifetime: { type: 'FIXED_SECONDS', seconds: v.read('duration') } })], ['DAMAGE']),
  ], { inputs: [b('hazeDebuffActive', '命中時に素質の術耐性低下が有効')],
    traitNotes: ['命中時の術耐性低下の状態を指定する。付与・更新・失効と、各命中時に効果が残っているかの判定は再現しない。'] }),
  operator('char_1011_lava2', [
    [1, normal({ atk: k('atk'), maxTargets: null,
      actions: [{ label: '範囲術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1, hits: input('lavaBlastHits') }],
      periodTotal: unresolvedPeriod('2つの範囲攻撃が対象に命中する回数を固定し、対象と発生範囲の移動は計算しません。') }),
      [n('lavaBlastHits', '対象に命中する範囲攻撃の数', 1, 1, 2)]],
    [2, periodic('炎の輪の毎秒ダメージ', product(k('atk_scale'), input('lavaRingHits'))),
      [n('lavaRingHits', '対象が入っている炎の輪の数', 1, 1, 2)]],
  ], [talent(0, '呪術戦線', v => [
    effect('first-deploy-sp', 'lava2_t_1[self].sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('lava2_t_1[self].sp') },
      { timing: { type: 'EVENT', event: 'DEPLOY' }, lifetime: { type: 'CURRENT_EVENT' } }),
    effect('ally-deploy-sp', 'lava2_t_1[ally].sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('lava2_t_1[ally].sp') },
      { target: { ...target('ALLY', 'BATTLEFIELD'), includeSelf: false, tagIds: ['profession:CASTER'] },
        timing: { type: 'EVENT', event: 'DEPLOY' }, lifetime: { type: 'CURRENT_EVENT' } }),
    status('initial-sp-ally', '自身以外の味方術師のストックSPを増加', { target: { ...target('ALLY', 'BATTLEFIELD'), includeSelf: false } }),
  ], ['RESOURCE'])], { traitNotes: ['全対象が指定数の攻撃範囲に含まれる固定配置を評価する。S2は通常攻撃を加算せず、炎の輪が有効な間の毎秒ダメージを計算する。'] }),
  operator('char_258_podego', [
    [2, periodic('胞子内の毎秒ダメージ', k('atk_scale'), { duration: k('projectile_delay_time') })],
  ], [talent(0, 'ガーデナー', v => [atk(v.read('atk'), 'atk',
    { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:SUPPORT'] } })])], {
    deferredSkills: [{ skillIndex: 1, reason: '味方への治療に切り替わるスキルで、直接ダメージの対象外。' }],
    traitNotes: ['S2は胞子範囲内の毎秒ダメージを評価する。投擲前後の自身の通常攻撃や、胞子への出入りは合算しない。'],
  }),
  operator('char_484_robrta', [[1, physical({ atk: k('atk') })]], [
    talent(0, 'メイクツール調達', () => [status('device-shield', '支援装置から防御力上昇とシールドを付与')], ['SURVIVAL']),
  ], { deferredSkills: [{ skillIndex: 2, reason: '攻撃を停止して防御・ブロックを強化するため、直接ダメージの対象外。' }] }),
  operator('char_4162_cathy', [[1, physical({ atk: k('s1_atk') })]], [
    talent(0, '指向性支援信号', () => [status('device-barrier', '支援装置から最大HPに応じたバリアを付与・補充')], ['SURVIVAL']),
  ], { deferredSkills: [{ skillIndex: 2, reason: '攻撃を停止して耐久とバリア付与を強化するため、直接ダメージの対象外。' }] }),
  operator('char_4212_nasti', [
    [1, physical({ atk: k('atk'), blockCountAdd: choose('selfDeviceActive', true, 1), maxTargets: choose('selfDeviceActive', true, 3, 2) }),
      [b('selfDeviceActive', '自身が支援装置のブロック数増加を受けている')]],
    [3, physical({ atk: k('atk') })],
  ], [
    talent(0, '前方工事中', () => [status('support-devices', '支援装置を使用可能、装備スキルにより性能が変化')], ['RESOURCE']),
    talent(1, '注意喚起', () => [status('protection', '自身と対象の味方に加護を付与'), status('periodic-sp', '遠距離攻撃を行う敵がいる場合にSPを定期回復')], ['SURVIVAL', 'RESOURCE']),
  ], { deferredSkills: [{ skillIndex: 2, reason: '攻撃を停止してバリアを付与し装置を起動するため、直接ダメージの対象外。' }],
    traitNotes: ['自身の通常攻撃を評価する。S1は自身がブロックする敵を指定し、支援装置のブロック増加は最大1基分を評価する。'] }),
  operator('char_4178_alanna', [
    [1, physical({ aspd: choose('selfDeviceActive', true, k('attack_speed')) })],
    [2, physical({ atk: k('atk'), aspd: k('attack_speed') })],
  ], [talent(0, '臨時改装', v => [
    effect('device-defense-ignore', 'def_penetrate_fixed_bb', { item: 'DEFENSE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT',
      value: mul(v.read('def_penetrate_fixed_bb'), { type: 'CONDITIONAL', condition: eq('skillIndex', 2), whenTrue: metric('skill.multi'), whenFalse: 1 }) },
      { condition: eq('selfDeviceActive', true) }),
    status('device-support', '装置の効果は重複不可、配置後30秒持続'),
  ], ['DAMAGE', 'RESOURCE'])], { inputs: [b('selfDeviceActive', '自身が支援装置の効果を受けている')],
    traitNotes: ['自身が装置の効果対象かを指定する。支援先の味方のダメージや装置の配置・消滅時刻は合算しない。'] }),
  operator('char_433_windft', [
    [1, singleDeviceStages(physical({ kind: 'NEXT_ATTACK', maxTargets: null,
      actions: [{ label: '周囲の地上敵への攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: k('atk_scale') }] }))],
    [2, singleDeviceStages(physical({ atk: k('atk'), intervalAdd: k('base_attack_time'),
      periodTotal: unresolvedPeriod('バッテリーによる効果が一定の攻撃を評価し、効果の終了や装置の獲得は計算しません。') }))],
  ], [talent(0, '進退を共に', v => [
    atk(mul(v.read('atk'), metric('selfDeviceCount'),
      { type: 'CONDITIONAL', condition: eq('skillIndex', 2), whenTrue: metric('skill.talent_scale'), whenFalse: 1 }), 'atk / selfDeviceCount'),
    status('battery-support', '高信頼性バッテリーで前方の術師・補助を支援'),
  ], ['ABILITY', 'RESOURCE'])], { inputs: [n('selfDeviceCount', '自身に有効な高信頼性バッテリー数', 0, 0, 2)],
    traitNotes: ['自身が支援を受ける固定配置を評価する。2基からの攻撃力重複は未確認のため停止する。'] }),
  operator('char_4072_ironmn', [
    [1, singleDeviceStages(physical({ atk: product(0.12, k('fake_scale'), input('selfDeviceCount')),
      actions: [{ label: '物理攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: k('attack@atk_scale') }],
      periodTotal: unresolvedPeriod('装置の支援が一定の攻撃を評価し、装置の配置・破壊時刻は計算しません。') })),
      [n('selfDeviceCount', '自身を支援している装置の数', 0, 0, 2)]],
    [2, physical({ atk: k('atk'), maxTargets: 2 })],
  ], [
    talent(0, '戦場のエンジニア', () => [status('support-devices', '支援装置を使用可能、装備スキルにより性能が変化')], ['RESOURCE']),
    talent(1, '経費削減', () => [status('device-recovery', '周囲で破壊された支援装置を確率で再獲得')], ['RESOURCE']),
  ], { deferredSkills: [{ skillIndex: 3, reason: '装置への攻撃回数と装置の砲撃ダメージを別の攻撃主体として扱う必要がある。' }],
    traitNotes: ['自身の攻撃を評価する。S1は装置1基の基本攻撃力上昇12%を4倍にし、スキル倍率200%は別に適用する。S2は自身がブロックする敵だけを指定する。'] }),
]
