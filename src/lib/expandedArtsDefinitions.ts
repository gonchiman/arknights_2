import sources from '../data/expandedArtsSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue, CombatRecipientSelector } from './combatEffectStructure.ts'

const k = (key: string): GuardValue => ({ key })
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
  maxTargets: 1, actions: [{ label: '術攻撃', damageType: 'ARTS', scale: 1 }], ...options })
const next = (scale: GuardValue, maxTargets: GuardValue | null = 1): GuardStage =>
  normal({ label: '強化攻撃', kind: 'NEXT_ATTACK', maxTargets, actions: [{ label: '強化攻撃', damageType: 'ARTS', scale }] })
const recipe = (operatorId: string, skillIndex: number, stages: readonly GuardStage[], inputs: readonly GuardInput[] = [], notes: readonly string[] = []): GuardSkillRecipe => {
  const raw = sources.find(source => source.operatorId === operatorId)!.skills.find(skill => skill.skillIndex === skillIndex)!.raw
  return { operatorId, skillIndex, inputs, notes, stages: stages.map(stage => ({ ...stage,
    duration: stage.duration ?? (raw.duration < 0 ? 'UNTIL_EXIT' : raw.duration),
  })) }
}
const operator = (operatorId: string, stages: readonly [number, GuardStage | readonly GuardStage[]][], talents: readonly ExpandedTalentDefinition[],
  options: Partial<Omit<ExpandedOperatorDefinition, 'operatorId' | 'recipes' | 'talents'>> = {}): ExpandedOperatorDefinition =>
  ({ operatorId, phaseIndex: 2, skillLevelIndex: 9, talents,
    recipes: stages.map(([index, value]) => recipe(operatorId, index, Array.isArray(value) ? value : [value as GuardStage])), ...options })
const hp = n('targetHpPercent', '対象のHP（%）', 100, 0, 100)
const aoeNotes = ['選択した全対象が同じ攻撃に命中する条件。範囲外の敵と敵の位置変化は含めない。']

/** Reviewed JP skills. Unsupported mechanisms remain explicitly deferred, never approximated by a normal attack. */
export const EXPANDED_ARTS_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  operator('char_121_lava', [[1, normal({ aspd: k('attack_speed'), maxTargets: null })]], [
    talent(0, '高速チャージ', v => [effect('deploy-sp', 'sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('sp') },
      { timing: { type: 'EVENT', event: 'DEPLOY' }, lifetime: { type: 'CURRENT_EVENT' } })], ['RESOURCE']),
  ], { phaseIndex: 1, skillLevelIndex: 6, traitNotes: aoeNotes }),
  operator('char_210_stward', [[1, next(k('atk_scale'))]], [talent(0, '堅実家', v => [atk(v.read('atk')), status('priority', '防御力が最も高い敵を優先')], ['ABILITY', 'ATTACK_BEHAVIOR'])],
    { phaseIndex: 1, skillLevelIndex: 6 }),
  operator('char_278_orchid', [[1, normal({ atk: k('atk'), aspd: k('attack_speed') })]], [talent(0, '攻撃速度上昇', v => [speed(v.read('attack_speed'))])],
    { phaseIndex: 1, skillLevelIndex: 6 }),
  operator('char_109_fmout', [[1, normal({ aspd: k('attack_speed'), maxTargets: null })], [2, normal({ atk: k('atk'), maxTargets: null })]], [
    talent(0, '占い', v => [atk(v.read('atk'), 'atk', { condition: eq('fortuneResult', 'ATK') }),
      speed(v.read('attack_speed'), { condition: eq('fortuneResult', 'ASPD') }),
      status('max-hp', `最大HP+${percent(v.read('max_hp')) ?? '未確定'}%`, { condition: eq('fortuneResult', 'HP') })]),
  ], { inputs: [select('fortuneResult', '占いの結果', [['ATK', '攻撃力'], ['ASPD', '攻撃速度'], ['HP', '最大HP']])], traitNotes: aoeNotes }),
  operator('char_253_greyy', [[1, normal({ aspd: k('attack_speed'), maxTargets: null })], [2, normal({ aspd: k('attack_speed'), maxTargets: null })]], [
    talent(0, '静電場', () => [status('sluggish', '攻撃対象を足止め')], ['STATUS']),
  ], { traitNotes: aoeNotes }),
  operator('char_4051_akkord', [[1, next(k('atk_scale'), null)]], [
    talent(0, '律動の共鳴', v => [atk(v.read('atk'), 'atk', { condition: eq('allyInAttackRange', true) })]),
  ], { inputs: [b('allyInAttackRange', '攻撃範囲内に自身以外の味方')], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 2, reason: '味方位置ごとのソニックブームと主攻撃の重複命中を扱う範囲モデルが必要。' }] }),
  operator('char_183_skgoat', [[1, normal({ atk: k('atk') })]], [
    talent(0, '地質調査', () => [status('sluggish-extension', '特性の足止め時間を延長')], ['STATUS']),
  ], { deferredSkills: [{ skillIndex: 2, reason: '攻撃を停止して足止めを行うスキル。直接ダメージの出力対象外。' }] }),
  operator('char_002_amiya', [[1, normal({ aspd: k('attack_speed') })],
    [2, normal({ maxTargets: null, actions: [{ label: 'ランダム連続攻撃', damageType: 'ARTS', scale: k('attack@atk_scale'), hits: k('attack@times'), targets: 1 }] })],
    [3, normal({ atk: k('atk'), actions: [{ label: '確定攻撃', damageType: 'TRUE', scale: 1 }] })]], [
    talent(0, 'アブソープション', v => [
      effect('attack-sp', 'amiya_t_1[atk].sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('amiya_t_1[atk].sp') }, { timing: { type: 'EVENT', event: 'ATTACK' } }),
      effect('kill-sp', 'amiya_t_1[kill].sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('amiya_t_1[kill].sp') }, { timing: { type: 'EVENT', event: 'KILL' } }),
    ], ['RESOURCE']),
  ], { traitNotes: ['ランダム攻撃は同条件の対象への均等な配分期待値。SP回復とスキル後のスタン・強制退場は周期DPSに含めない。'] }),
  operator('char_405_absin', [[1, normal({ atk: k('atk'), duration: 'UNTIL_EXIT' })],
    [2, [normal({ when: { input: 'targetHpPercent', comparison: 'LT', value: 50 },
      actions: [{ label: '4連続攻撃', damageType: 'ARTS', scale: k('attack@atk_scale'), hits: k('attack@times') }] }),
    normal({ id: 'invalid-target', label: '攻撃対象外', when: { input: 'targetHpPercent', comparison: 'GTE', value: 50 },
      actions: [], unresolved: ['S2はHP50%未満の敵だけを攻撃する。対象のHP条件を変更してください。'] })]]], [
    talent(0, '法の執行者', v => [damage(v.read('damage_scale'), cmp('targetHpPercent', 'LT', percent(v.read('hp_ratio'))))], ['DAMAGE']),
  ], { inputs: [{ ...hp, defaultValue: 30 }], traitNotes: ['対象のHP割合が一定の条件で計算する。ダメージによるHPの推移は含めない。'] }),
  operator('char_411_tomimi', [[1, normal({ aspd: k('attack_speed'), actions: [{ label: '物理攻撃', damageType: 'PHYSICAL', scale: 1 }] })]], [
    talent(0, '荒野術師流戦法', v => [atk(v.read('atk')), status('physical-mode', 'スキル中は地上対象への物理攻撃・攻撃範囲縮小')], ['ABILITY', 'ATTACK_BEHAVIOR']),
  ], { traitNotes: ['スキル中の地上の敵への攻撃を計算する。'], deferredSkills: [{ skillIndex: 2, reason: '確率選択されるスタン・攻撃倍率・範囲攻撃の分岐と命中対象を扱う必要がある。' }] }),
  operator('char_466_qanik', [[1, normal({ aspd: k('attack_speed') })]], [
    talent(0, '氷原生存術', v => [damage(v.read('damage_scale'), eq('targetAirborne', true), 'damage_scale', true)], ['DAMAGE']),
  ], { inputs: [b('targetAirborne', '対象が空中にいる')], deferredSkills: [{ skillIndex: 2, reason: '浮遊の付与・終了時の追加ダメージを時系列で評価する必要がある。' }] }),
  operator('char_166_skfire', [[1, normal({ atk: k('atk'), maxTargets: null })]], [
    talent(0, 'アーツバースト', v => [damage(v.read('damage_scale'), eq('targetBlocked', true), 'damage_scale', true)], ['DAMAGE']),
  ], { inputs: [b('targetBlocked', '対象がブロックされている')], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 2, reason: '隕石の発生・命中時間とスキル中の攻撃間隔の適用方式を確認する必要がある。' }] }),
  operator('char_373_lionhd', [[1, normal({ atk: k('atk'), maxTargets: null })]], [
    talent(0, '破片爆散', v => [atk(mul(v.read('atk'), { type: 'CALC', operation: 'MIN', values: [metric('nearbyEnemyCount'), v.read('max_valid_stack_cnt')] }), 'atk × 対象数')]),
  ], { inputs: [n('nearbyEnemyCount', '攻撃範囲内の敵数', 1, 0, 100)], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 2, reason: '術耐性低下の新規付与とダメージの適用順序を確認する必要がある。' }] }),
  operator('char_341_sntlla', [[1, normal({ atk: k('atk'), aspd: k('attack_speed'), maxTargets: null })]], [
    talent(0, '寒地の民', v => [atk(v.read('atk'), 'atk', { condition: cmp('secondsSinceDeploy', 'GTE', v.read('interval')) }),
      status('status-resistance', '配置20秒後にレジスト', { condition: cmp('secondsSinceDeploy', 'GTE', v.read('interval')) })], ['ABILITY', 'STATUS']),
  ], { inputs: [n('secondsSinceDeploy', '配置からの経過時間（秒）', 20, 0, 3600)], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 2, reason: 'ランダムなマスへの氷柱と敵の位置に依存する命中確率のモデルが必要。' }] }),
  operator('char_4031_liesel', [[1, next(k('atk_scale'), null)]], [
    talent(0, '指揮者の素質', v => [damage(v.read('damage_scale'), cmp('actualAttackTargetCount', 'GTE', v.read('min_target_cnt')))], ['DAMAGE'], '0'),
  ], { traitNotes: aoeNotes, deferredSkills: [{ skillIndex: 2, reason: '複数の爆発の重複命中と継続ダメージの付与・更新を扱う必要がある。' }] }),
  operator('char_489_serum', [[1, normal({ atk: k('atk'), maxTargets: null })], [2, normal({ atk: k('atk'), maxTargets: null })]], [
    talent(0, '戦術的調整', v => [effect('sp-recovery', 'sp_recovery_per_sec', { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { condition: cmp('source.secondsSinceLastNormalAttack', 'GTE', v.read('delay')) })], ['RESOURCE']),
  ], { traitNotes: aoeNotes }),
  operator('char_494_vendla', [[1, normal({ aspd: k('attack_speed') })]], [
    talent(0, '土壌改良', v => [effect('heal-scale', 'heal_scale', { item: 'HEAL_RECEIVED_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('heal_scale') },
      { target: { ...target('ALLY', 'ATTACK_RANGE'), selection: { type: 'COUNT', count: 1 } } })], ['SURVIVAL']),
  ], { traitNotes: ['呪癒師の味方への回復量はダメージに含めない。'],
    deferredSkills: [{ skillIndex: 2, reason: '付与先が受ける攻撃を契機とした反撃の回数・間隔を指定する仕組みが必要。' }] }),
  operator('char_174_slbell', [[1, normal({ maxTargets: k('attack@max_target') })]], [
    talent(0, '弱体化', v => [damage(v.read('damage_scale'), cmp('targetHpPercent', 'LT', percent(v.read('hp_ratio'))))], ['DAMAGE']),
    talent(1, 'ハーモニー', () => [status('two-targets', '攻撃対象数+1（攻撃定義に反映）')], ['ATTACK_BEHAVIOR']),
  ], { inputs: [hp], deferredSkills: [{ skillIndex: 2, reason: '敵の防御力・術耐性の低下を表す共通のスキル効果を追加する必要がある。' }] }),
  operator('char_254_vodfox', [[1, normal({ atk: k('atk'), duration: 'UNTIL_EXIT' })]], [
    talent(0, '潰敗への誘い', v => [damage(add(1, mul(add(v.read('damage_scale'), -1), metric('skill.scale_delta_to_one'))), cmp('targetHpPercent', 'LT', percent(v.read('hp_ratio'))), 'damage_scale / skill:scale_delta_to_one')], ['DAMAGE']),
  ], { inputs: [hp], deferredSkills: [{ skillIndex: 2, reason: '呪いの人形の配置位置・効果範囲・存続時間のモデルが必要。' }] }),
  operator('char_4079_haini', [[1, next(k('atk_scale'), k('max_target'))]], [
    talent(0, '測量機器の応用', v => [damage(v.read('damage_scale'), eq('targetEliteOrBoss', false))], ['DAMAGE']),
  ], { inputs: [b('targetEliteOrBoss', '対象がエリート・ボス')], deferredSkills: [{ skillIndex: 2, reason: '撃破によって変化する脆弱倍率と適用対象の履歴を扱う必要がある。' }] }),
  operator('char_195_glassb', [[1, normal({ intervalAdd: k('base_attack_time') })], [2, normal({ atk: k('atk'), maxTargets: k('attack@max_target') })]], [
    talent(0, '探究者', v => [speed(v.read('attack_speed')), effect('defense', 'def', { item: 'DEFENSE_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('def') })]),
  ]),
  operator('char_326_glacus', [[1, normal({ atk: k('atk'), maxTargets: k('attack@max_target') })]], [
    talent(0, '対空装置', v => [effect('drone-attack-scale', 'atk_scale', { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { condition: eq('targetDrone', true) }), status('drone-priority', 'ドローンを優先して攻撃')], ['DAMAGE', 'ATTACK_BEHAVIOR']),
  ], { inputs: [b('targetDrone', '対象がドローン')], deferredSkills: [{ skillIndex: 2, reason: '対ドローン倍率と素質の通常攻撃倍率の適用範囲を確認する必要がある。' }] }),
  operator('char_4032_provs', [[1, next(k('atk_scale'))]], [
    talent(0, 'カジミエーシュの法律家', v => [speed(v.read('attack_speed')), status('ally-speed', 'ランダムな味方カジミエーシュ1名の攻撃速度を上昇',
      { target: { ...target('ALLY', 'BATTLEFIELD'), includeSelf: false, factionIds: ['kazimierz'], selection: { type: 'RANDOM', count: 1 } } })]),
  ], { deferredSkills: [{ skillIndex: 2, reason: '発動時の全体ダメージとスキル中の通常攻撃を分けて出力する必要がある。' }] }),
  operator('char_4122_grabds', [[1, next(k('atk_scale'), 2)]], [
    talent(0, '「いい子にしてて」', v => [speed(v.read('attack_speed')), status('wildbeast-slow', '野生動物への足止め時間を延長')], ['ABILITY', 'STATUS']),
  ], { deferredSkills: [{ skillIndex: 2, reason: '攻撃停止・睡眠付与の段階から通常攻撃へ移行する時間と対象状態を確認する必要がある。' }] }),
  operator('char_180_amgoat', [[1, normal({ aspd: k('amgoat_s_1[a].attack_speed'), atk: choose('skillActivationCount', 2, k('amgoat_s_1[b].atk'), 0, 'GTE') })],
    [3, normal({ atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: k('attack@max_target') })]], [
    talent(0, 'フレイムブレス', v => [atk(v.read('atk'), 'atk', { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:CASTER'] } })]),
    talent(1, 'カオスフレイム', () => [status('initial-sp', '配置後SPが7〜15回復')], ['RESOURCE']),
  ], { inputs: [n('skillActivationCount', 'スキル発動回数', 1, 1, 100)], deferredSkills: [{ skillIndex: 2, reason: '主対象と周囲への倍率差、および術耐性低下と命中の適用順序を扱う必要がある。' }] }),
  operator('char_213_mostma', [[1, normal({ atk: k('atk'), maxTargets: null })],
    [3, normal({ atk: k('atk'), maxTargets: null })]], [
    talent(0, 'スキルブースト・術師', v => [effect('caster-sp', 'sp_recovery_per_sec', { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:CASTER'] } })], ['RESOURCE']),
    talent(1, '時間認知鈍化', () => [status('enemy-slow', '攻撃範囲内の敵の移動速度低下', { target: target('ENEMY', 'ATTACK_RANGE') })], ['STATUS']),
  ], { traitNotes: aoeNotes, deferredSkills: [{ skillIndex: 2, reason: '毎秒ダメージの初回・最終発生時点を確認し、通常攻撃を行わない継続ダメージとして出力する必要がある。' }] }),
  operator('char_291_aglina', [[1, normal({ atk: k('atk') })],
    [2, normal({ intervalScale: k('base_attack_time'), actions: [{ label: '術攻撃', damageType: 'ARTS', scale: k('damage_scale') }],
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
  operator('char_344_beewax', [[1, normal({ atk: k('atk'), maxTargets: null })]], [
    talent(0, '砂原の加護', v => [effect('self-regen', 'hp_recovery_per_sec_by_max_hp_ratio',
      { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', unit: 'MAX_HP_RATIO', value: v.read('hp_recovery_per_sec_by_max_hp_ratio') },
      { timing: { type: 'PERIODIC', intervalSeconds: 1, firstTickSeconds: null }, condition: eq('source.skillActive', false) })], ['SURVIVAL']),
  ], { traitNotes: aoeNotes, deferredSkills: [{ skillIndex: 2, reason: '召喚した砂の碑の位置を中心とした発動時ダメージと、術師自身の攻撃を分ける必要がある。' }] }),
  operator('char_388_mint', [[1, normal({ maxTargets: null, actions: [{ label: '範囲術攻撃', damageType: 'ARTS', scale: k('attack@atk_scale') }] })]], [
    talent(0, '地質学者', v => [effect('ally-defense', 'def', { item: 'DEFENSE_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('def') },
      { target: { ...target('ALLY', 'ADJACENT'), includeSelf: false }, condition: eq('source.skillActive', false) }),
      status('reduced-target-priority', 'スキル中は敵に狙われにくくなる', { condition: eq('source.skillActive', true) })], ['ABILITY', 'SURVIVAL']),
  ], { traitNotes: aoeNotes, deferredSkills: [{ skillIndex: 2, reason: '通常攻撃と終了時の範囲ダメージを分け、引き寄せによる攻撃対象の変化を扱う必要がある。' }] }),
  operator('char_426_billro', [[1, normal({ atk: k('atk'), maxTargets: null })],
    [2, normal({ atk: choose('overcharged', true, k('atk')), intervalAdd: k('base_attack_time'), maxTargets: null })]], [
    talent(0, '血肉饗宴', v => [effect('activation-heal', 'heal_scale / billro_t_1[enhance].heal_scale',
      { item: 'HP_RESTORE_RATIO', operation: 'RESTORE', unit: 'MAX_HP_RATIO', value: { type: 'CONDITIONAL', condition: eq('overcharged', true),
        whenTrue: v.read('billro_t_1[enhance].heal_scale'), whenFalse: v.read('heal_scale') } },
      { timing: { type: 'EVENT', event: 'SKILL_START' }, lifetime: { type: 'CURRENT_EVENT' } })], ['SURVIVAL']),
    talent(1, '狂嵐の兆し', v => [effect('charged-sp-recovery', 'sp_recovery_per_sec',
      { item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: v.read('sp_recovery_per_sec') },
      { condition: eq('source.spAtLeastSkillCost', true) })], ['RESOURCE']),
  ], { inputs: [b('overcharged', 'オーバーチャージ')], traitNotes: aoeNotes,
    deferredSkills: [{ skillIndex: 3, reason: '時間経過による攻撃力上昇と、命中ごとの被ダメージ上昇の適用順序・累積を扱う必要がある。' }] }),
]
