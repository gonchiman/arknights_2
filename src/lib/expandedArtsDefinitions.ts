import sources from '../data/expandedArtsSources.json' with { type: 'json' }
import { EBENHOLZ_SUMMON_RECIPE, STAINLESS_SUMMON_RECIPE } from './expandedSummonActorRecipes.ts'
import type { OperatorCombatProfile } from '../types/skill.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
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


const chargeInput = n('storedChargeCount', '通常貯蔵弾数', 0, 0, 3)
const volleyReason = '現在の貯蔵弾を含む斉射1回を評価し、再貯蔵・次回発射までの時間は計算しません。'
const volley = (options: Partial<GuardStage> = {}): GuardStage => normal({
  dpsUnsupportedReason: volleyReason, periodTotal: unresolvedPeriod(volleyReason), ...options,
})
const quickVolley = (intervalScale: GuardValue = k('base_attack_time')): GuardStage => volley({ intervalScale,
  actions: [{ label: '通常弾', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale') }],
})
const storedScale = (value: CombatNumericValue) => effect('stored-scale', 'atk_scale',
  { item: 'STORED_CHARGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value })
const extraChargeCondition = (eligibility: CombatCondition): CombatCondition => ({ type: 'ALL',
  conditions: [eq('extraStoredChargeHeld', true), eligibility] })
const extraCharge = (value: CombatNumericValue, eligibility: CombatCondition) => effect('extra-stored-charge', 'times_2',
  { item: 'EXTRA_STORED_CHARGES', operation: 'ADD_VALUE', unit: 'POINT', value }, { condition: extraChargeCondition(eligibility) })
const numericIf = (condition: CombatCondition, whenTrue: CombatNumericValue, whenFalse: CombatNumericValue = 0): CombatNumericValue =>
  ({ type: 'CONDITIONAL', condition, whenTrue, whenFalse })

const droneState = select('droneState', '浮遊ユニットの倍率状態', [['FIRST', '初撃'], ['CAPPED', '上限到達']])
const droneReason = '本体と浮遊ユニットが同じ1体へ与える現在の1回分を評価します。移動・再索敵・倍率上昇中の攻撃周期は計算しません。'
const droneHit = (released: boolean, count: GuardValue = 1, maximumMultiplier: GuardValue = 1,
  includeTalentExtraUnits = false): GuardDamageAction => ({
  label: released ? '放出した浮遊ユニット' : '付随する浮遊ユニット', role: released ? 'MAIN' : 'ADDITIONAL', damageType: 'ARTS',
  scale: 1, hits: count, targets: 1, drone: { sameTargetAttack: 1, atMaximum: choose('droneState', 'CAPPED', 1), maximumMultiplier, includeTalentExtraUnits },
})
const droneVolley = (drone: GuardDamageAction, options: Partial<GuardStage> = {}): GuardStage => normal({
  maxTargets: 1, dpsUnsupportedReason: droneReason, periodTotal: unresolvedPeriod(droneReason),
  actions: [{ label: '本体の術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1, targets: 1 }, drone], ...options,
})
const droneNotes = ['本体の攻撃範囲内にいる同じ1体を、全浮遊ユニットが攻撃する状態を評価する。初撃または上限到達状態を全ユニット共通で指定する。']

/** Callers must reject changed live values when a retained value is coupled to a recipe. */
function reviewedTalentNumber(operatorId: string, talentIndex: number, key: string): number {
  const source = sources.find(source => source.operatorId === operatorId)!
  const passives = getOperatorPassives(source.profile as unknown as OperatorCombatProfile, source.phaseIndex,
    source.profile.phases[source.phaseIndex].maxLevel!, 1)
  const value = passives.sources.find(entry => entry.sourceKind === 'TALENT' && entry.talentIndex === talentIndex)
    ?.blackboard.find(entry => entry.key === key)?.value
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`確認済み素質値がありません: ${operatorId}/${key}`)
  return value
}
const ggMisses = n('goldenglowExplosionMisses', '全ユニット共通・直前までの連続不発回数', 0, 0, 40)
const ggBoundaryReason = '連続不発39〜40回での確定自爆への遷移境界は未確認。0〜38回の次の攻撃機会だけを計算する。'
const ggEventReason = '本体1回と各ユニットの次の攻撃機会の期待値。命中の時間同期、帰還・再索敵、以後の確率推移は計算しません。'
const ggNormalProbability = sum(1, product(-reviewedTalentNumber('char_377_gdglow', 0, 'attack@prob'),
  sum(1, input('goldenglowExplosionMisses'))))
const ggStages = (skillIndex: number): GuardStage[] => {
  const drone = { ...droneHit(true, sum(1, k('attack@cnt'))), probability: ggNormalProbability }
  const stage = droneVolley(drone, { atk: k('atk'), aspd: skillIndex === 1 ? k('attack_speed') : 0,
    dpsUnsupportedReason: ggEventReason, periodTotal: unresolvedPeriod(ggEventReason),
    ...(skillIndex === 3 ? { actions: [drone] } : {}) })
  return [{ ...stage, when: { input: ggMisses.key, comparison: 'LTE', value: 38 } },
    { ...stage, id: 'unconfirmed-explosion-boundary', label: '確定自爆への遷移境界',
      when: { input: ggMisses.key, comparison: 'GTE', value: 39 }, unresolved: [ggBoundaryReason],
      calculationIssues: [{ id: 'goldenglow-explosion-prd-boundary', reason: ggBoundaryReason, relatedSections: ['素質1'] }] }]
}

/** Reviewed JP skills. Unsupported mechanisms remain explicitly deferred, never approximated by a normal attack. */
export const EXPANDED_ARTS_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  operator('char_328_cammou', [
    [1, droneVolley(droneHit(false), { atk: k('atk') })],
    [2, droneVolley(droneHit(true), { atk: k('atk') })],
  ], [talent(0, 'シンクロ', v => [speed(v.read('attack_speed'))])],
  { inputs: [droneState], traitNotes: [...droneNotes, 'S2のスタンは現在のダメージ値を変えず、確率・移動抑止は評価しない。'] }),
  operator('char_4013_kjera', [[1, droneVolley(droneHit(false), { atk: k('atk') })],
    [2, [phase('kjeraFreezeState', 'IMMUNE', droneVolley(droneHit(true, sum(1, k('attack@cnt'))), { atk: k('atk'), label: '凍結無効の対象' })),
      phase('kjeraFreezeState', 'CHANGING', droneVolley(droneHit(true, sum(1, k('attack@cnt'))), { atk: k('atk'), label: '凍結が有効な対象',
        unresolved: ['寒冷の重複による凍結・術耐性変化と本体/各ユニットの命中順は未確認。凍結無効の対象だけを計算する。'] }))],
      [select('kjeraFreezeState', '対象の凍結耐性', [['IMMUNE', '凍結無効'], ['CHANGING', '凍結が有効']])]]], [
    talent(0, '俯瞰', v => [atk(numericIf(cmp('groundTilesInRange', 'GT', v.read('cnt')), v.read('kjera_t_1[high].atk'), v.read('atk')))], ['DAMAGE']),
  ], { inputs: [droneState, n('groundTilesInRange', '攻撃範囲内の地面マス数', 0, 0, 100)],
    traitNotes: [...droneNotes, 'S2は凍結無効で術耐性が変化しない対象。22%の寒冷付与を与ダメージ倍率へ換算しない。'] }),
  operator('char_4054_malist', [[1, droneVolley(droneHit(false), { atk: k('atk'), aspd: k('attack_speed') })],
    [2, [phase('droneState', 'CAPPED', droneVolley({ ...droneHit(false, 2), scale: k('atk_scale') }, {
      kind: 'NEXT_ATTACK', label: '上限到達済みの強化2連撃', actions: [
        { label: '本体の強化2連撃', role: 'MAIN', damageType: 'ARTS', scale: k('atk_scale'), hits: 2, targets: 1 },
        { ...droneHit(false, 2), scale: k('atk_scale') },
      ] })), phase('droneState', 'FIRST', droneVolley(droneHit(false), { kind: 'NEXT_ATTACK', label: '倍率上昇中の強化2連撃',
        unresolved: ['2連撃に付随するユニットの倍率進行順は未確認。両命中が上限倍率の状態のみ計算する。'] }))],
      [{ ...droneState, defaultValue: 'CAPPED' }]]], [
    talent(0, 'インスピレーション', v => [effect('critical', 'prob / atk_scale',
      { item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' },
        probability: { chance: v.read('prob'), rollScope: 'APPLICATION' } })], ['DAMAGE']),
  ], { inputs: [droneState], traitNotes: [...droneNotes, 'S2の200%倍率は本体と付随ユニットの各2命中へ適用。3回チャージを命中数へ加算しない。'] }),
  operator('char_4040_rockr', [
    [1, droneVolley(droneHit(false), { aspd: k('attack_speed') })],
    [2, [phase('rockrockPhase', 'NORMAL', droneVolley(droneHit(true), { label: '前半', aspd: k('attack_speed') })),
      phase('rockrockPhase', 'OVERDRIVE', droneVolley(droneHit(true, 1, k('scale')), { label: 'オーバードライブ', atk: k('atk'), aspd: k('attack_speed') }))],
      [select('rockrockPhase', 'スキル段階', [['NORMAL', '前半'], ['OVERDRIVE', 'オーバードライブ']])]],
  ], [talent(0, '礎石', v => [atk(mul(v.read('atk'), metric('rockrockTalentStacks')), 'atk / max_stack_cnt / interval')], ['DAMAGE'])],
  { inputs: [droneState, n('rockrockTalentStacks', '礎石の強化段階', 0, 0, 4)],
    traitNotes: [...droneNotes, 'S2のオーバードライブは浮遊ユニットの上限だけを2倍にする。発動後の経過時間・スタン期間は計算しない。'] }),
  operator('char_1038_whitw2', [
    [1, [phase('lapplandS1State', 'ACTIVE', droneVolley(droneHit(true, 2, 1, true), { atk: k('atk') })),
      phase('lapplandS1State', 'INITIAL', droneVolley(droneHit(false, 2, 1, true), { label: '初期状態' }))],
      [select('lapplandS1State', 'スキル状態', [['ACTIVE', '発動状態'], ['INITIAL', '初期状態']])]],
    [2, droneVolley(droneHit(true, sum(1, k('attack@cnt')), 1, true), { atk: k('atk') })],
    [3, droneVolley({ ...droneHit(false, sum(1, k('attack@cnt')), 1, true), label: '到達済みの特殊浮遊ユニット' }, {
      atk: k('atk'), label: '追尾対象への到達後', actions: [
        { label: '本体の術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1, targets: 1 },
        { ...droneHit(false, sum(1, k('attack@cnt')), 1, true), label: '到達済みの特殊浮遊ユニット' },
        { label: '重複しない周囲の継続術ダメージ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT',
          scale: k('attack@magic_atk_scale'), timing: 'PER_SECOND', targets: 1 },
      ],
    })],
  ], [
    talent(0, '群狼の統率者', v => [
      effect('drone-maximum', 'scale', { item: 'DRONE_MAXIMUM_MULTIPLIER', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('scale') },
        { condition: cmp('lapplandTalentStage', 'GTE', 1) }),
      status('drone-silence', '浮遊ユニットの命中時に特殊能力を無効化', { condition: cmp('lapplandTalentStage', 'GTE', 2) }),
      effect('extra-drone', 'description:drone_count', { item: 'EXTRA_DRONES', operation: 'ADD_VALUE', unit: 'POINT', value: 1 },
        { condition: cmp('lapplandTalentStage', 'GTE', 3) }),
    ], ['DAMAGE', 'STATUS', 'ABILITY']),
    talent(1, 'シラクーザの幸運', () => [status('squad-initial-sp', '編成中のシラクーザのストックSPを増加')], ['RESOURCE']),
  ], { inputs: [droneState, n('lapplandTalentStage', '群狼の統率者の獲得段階', 0, 0, 3)],
    traitNotes: [...droneNotes, 'S1発動状態は静止している対象への攻撃。S1の常時追加1体は初期状態でも有効。素質は上限110%を121%にし、最終段階で1体追加する。',
      'S3は全ユニットが同じ対象へ到達済みで、本体の攻撃範囲とユニット周囲0.9マスにいる状態。120%の継続効果は1つだけ有効で、ユニット数を掛けない。',
      'S3の特殊ユニットの命中は通常攻撃・スキル直接ダメージに属さず、仮想主攻撃の属性を引き継がない。1.3秒の展開時間を命中周期に換算しない。'] }),
  operator('char_377_gdglow', [1, 2, 3].map(index => [index, ggStages(index)]), [
    talent(0, '電流暴走', v => {
      // The normal branch uses the complement of this retained probability. Numerical
      // talent changes are otherwise allowed by the registry, so validate this coupling.
      for (const key of ['attack@prob', 'attack@max_stack_cnt']) {
        if (v.read(key) !== reviewedTalentNumber('char_377_gdglow', 0, key))
          v.issue(`自爆と通常弾の分岐に使う確認済み素質値「${key}」が変更されています。`)
      }
      return [effect('explosion', 'attack@atk_scale_2 / attack@prob / attack@max_stack_cnt',
      { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: v.read('attack@atk_scale_2'),
        damageType: 'ARTS', basis: 'ATK_STAT', rate: 'PER_ATTACK', hits: add(1, metric('skill.attack@cnt')), label: '浮遊ユニットの自爆' },
      { timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' }, target: target('ENEMY', 'ATTACK_TARGET'),
        probability: { chance: mul(v.read('attack@prob'), add(1, metric(ggMisses.key))), rollScope: 'APPLICATION' } })]
    }, ['DAMAGE']),
    talent(1, '精密誘電', v => [effect('resistance-ignore', 'magic_resist_penetrate_fixed',
      { item: 'RESISTANCE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT', value: v.read('magic_resist_penetrate_fixed') })], ['DAMAGE']),
  ], { inputs: [droneState, ggMisses], traitNotes: [
    '全ユニットが同じ1体を攻撃し、同じ連続不発回数・特性倍率状態にある条件。自爆範囲内の別の敵は含めない。S1/S2ではその対象が本体の攻撃範囲にもいる。',
    '通常弾と自爆は同じ攻撃機会の排他的な分岐。自爆へ特性の倍率を掛けず、自爆した後の特性・確率の推移や帰還時間を推測しない。',
    'S3は本体の攻撃を含めない。自爆は素質由来の術ダメージとして仮想主攻撃属性を引き継がない。',
  ] }),
  operator('char_338_iris', [
    [1, quickVolley()],
    [2, normal({ ...action('睡眠終了時の爆発', k('atk_scale')), actions: [{ label: '睡眠終了時の爆発', role: 'MAIN', damageType: 'ARTS',
      scale: k('atk_scale'), hits: input('sleepExplosionHits') }], periodTotal: unresolvedPeriod('命中する睡眠終了時の爆発だけを評価し、睡眠中の通常攻撃は加算しません。') }),
      [n('sleepExplosionHits', '対象に命中する睡眠終了時の爆発数', 1, 1, 2)]],
  ], [talent(0, '開かずの宝箱', v => [storedScale(v.read('atk_scale'))], ['DAMAGE'])],
  { inputs: [chargeInput], traitNotes: ['貯蔵弾の倍率は貯蔵弾だけに適用する。S2は睡眠終了時の爆発だけを評価し、貯蔵弾を追加しない。', ...aoeNotes] }),
  operator('char_4046_ebnhlz', [
    [1, quickVolley()],
    [2, EBENHOLZ_SUMMON_RECIPE.stages, EBENHOLZ_SUMMON_RECIPE.inputs],
    [3, [volley({ atk: k('atk'), aspd: k('attack_speed'), when: { input: 'targetEliteOrBoss', comparison: 'EQ', value: true } }),
      volley({ id: 'ineligible-target', label: '攻撃対象外', actions: [], when: { input: 'targetEliteOrBoss', comparison: 'EQ', value: false },
        unresolved: ['S3はエリート・ボスのみを攻撃します。対象の種別を変更してください。'] })]],
  ], [
    talent(0, 'デュナーミク', v => [storedScale(mul(v.read('atk_scale'), numericIf(eq('skillIndex', 3), metric('skill.talent_scale_multiplier'), 1))),
      extraCharge(v.read('times_2'), eq('targetEliteOrBoss', true))], ['DAMAGE', 'ABILITY']),
    talent(1, 'アポジャトゥーラ', v => [effect('isolated-additional', 'atk_scale', { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE',
      unit: 'MULTIPLIER', value: v.read('atk_scale'), damageType: 'ARTS', rate: 'PER_ATTACK',
      hits: add(1, metric('storedChargeCount'), numericIf(extraChargeCondition(eq('targetEliteOrBoss', true)), 1)) },
      { condition: eq('targetIsolated', true), target: target('ENEMY', 'ATTACK_TARGET'), timing: { type: 'EVENT', event: 'NORMAL_ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })], ['DAMAGE']),
  ], { inputs: [chargeInput, b('extraStoredChargeHeld', 'エリート・ボス用の貯蔵弾を所持'), b('targetEliteOrBoss', '対象がエリート・ボス', true), b('targetIsolated', '対象の周囲に他の敵がいない')],
    traitNotes: ['通常貯蔵弾と対象限定の追加貯蔵弾を分ける。孤立時の追加術ダメージは本人の通常弾・各貯蔵弾それぞれで発生し、貯蔵弾専用倍率を受けない。残像の爆発には本人の攻撃素質を継承しない。'] }),
  operator('char_4110_delphn', [
    [1, quickVolley()],
    [2, [volley({ atk: k('atk'), when: { input: 'targetHpPercent', comparison: 'GTE', value: 50 }, actions: [
      { label: '通常弾', role: 'MAIN', damageType: 'ARTS', scale: 1 },
      { label: '付与中の継続ダメージ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', timing: 'PER_SECOND', scale: product(k('damage_addition'), input('delphineDotStacks')) },
    ] }), periodic('付与中の継続ダメージ', product(k('damage_addition'), input('delphineDotStacks')),
      { id: 'low-hp-dot', label: 'HP50%未満・付与済み継続ダメージ', atk: k('atk'), maxTargets: 1, when: { input: 'targetHpPercent', comparison: 'LT', value: 50 } })],
      [n('delphineDotStacks', '現在付与中の継続ダメージ重複数', 0, 0, 4)]],
  ], [
    talent(0, '血で刃を濯ぐ', v => [damage(v.read('damage_scale'), cmp('targetHpPercent', 'GTE', percent(v.read('hp_ratio'))))], ['DAMAGE']),
    talent(1, '仇討ちの決意', v => [effect('chapter-sarkaz-scale', 'atk_scale', { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { condition: eq('chapter13Sarkaz', true) }), extraCharge(v.read('times_2'), eq('chapter13Sarkaz', true))], ['DAMAGE', 'ABILITY']),
  ], { inputs: [chargeInput, hp, b('chapter13Sarkaz', '第13章「悪兆渦流」のサルカズが対象'), b('extraStoredChargeHeld', 'サルカズ用の貯蔵弾を所持')],
    traitNotes: ['対象HPと付与済み継続ダメージの重複数を固定する。S2のHP50%未満の対象には通常攻撃を追加しない。命中によるHP低下・重複数の変化は計算しない。'] }),
  operator('char_297_hamoni', [
    [1, quickVolley()],
    [2, [phase('harmoniePhase', 'VOLLEY', volley({ label: 'ブロック中の対象への斉射', intervalScale: k('base_attack_time') })),
      phase('harmoniePhase', 'WATER', periodic('水域', 0, { actions: [{ label: '水域', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT',
        timing: 'PER_SECOND', scale: 0, flatDamage: k('damage_value') }] }))],
      [select('harmoniePhase', '計算対象', [['VOLLEY', 'ブロック中の対象への斉射'], ['WATER', '水域の毎秒ダメージ']])]],
  ], [talent(0, '思わぬ出会い', v => [effect('blocked-attack-scale', 'atk_scale', { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
    { condition: { type: 'ANY', conditions: [eq('targetBlocked', true), { type: 'ALL', conditions: [eq('skillIndex', 2), eq('harmoniePhase', 'VOLLEY')] }] } })], ['DAMAGE'])],
  { inputs: [chargeInput, b('targetBlocked', '対象がブロックされている')],
    // https://prts.wiki/w/和弦: the talent increases attack scale, not post-mitigation damage.
    traitNotes: ['S2の通常攻撃はブロック中の対象への斉射を評価する。水域は別に評価し、攻撃力・貯蔵弾・素質の攻撃倍率を適用しない。'] }),
  operator('char_469_indigo', [
    [1, quickVolley(sum(1, k('base_attack_time')))],
    [2, [phase('indigoPhase', 'VOLLEY', volley({ label: 'バインド前の対象への斉射', intervalScale: k('base_attack_time') })),
      phase('indigoPhase', 'BIND', periodic('バインド中の継続ダメージ', k('indigo_s_2[damage].atk_scale'), { actions: [
        { label: 'バインド中の継続ダメージ', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', timing: 'PER_SECOND',
          scale: k('indigo_s_2[damage].atk_scale'), hits: 2 },
      ] }))],
      [select('indigoPhase', '計算対象', [['VOLLEY', 'バインド前の対象への斉射'], ['BIND', 'バインド中の毎秒ダメージ']])]],
  ], [talent(0, '柔光のとばり', () => [status('bind', '各弾の命中時に確率でバインド付与'), status('avoid-bound', 'バインド中の敵を通常攻撃の対象にしない')], ['STATUS', 'ATTACK_BEHAVIOR'])],
  { inputs: [chargeInput], traitNotes: ['通常攻撃は発射時にバインドされていない対象への斉射だけを評価する。命中後のバインド確率・次回攻撃への影響は計算しない。S2継続ダメージは現在バインド中の対象の毎秒値。'] }),

  operator('char_345_folnic', [[2, normal({ maxTargets: null, traitOverrides: ['NORMAL_ATTACK_ENABLED'],
    actions: [{ label: '薬刃弾', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale') }] })]], [
    talent(0, '薬物遮断技術', () => [status('resist', '配置後レジスト'),
      status('environment-reduction', '自然環境からの被ダメージを軽減')], ['STATUS', 'SURVIVAL']),
  ], { traitNotes: [...aoeNotes, 'S2の薬刃弾による敵への範囲ダメージを評価する。味方への治療量は加算しない。'],
    deferredSkills: [{ skillIndex: 1, reason: '味方への治療を強化するスキルで、直接ダメージの対象外。' }] }),
  operator('char_1052_kalts2', [[2, normal({ atk: k('atk'), maxTargets: null,
    traitOverrides: ['NORMAL_ATTACK_ENABLED', 'DAMAGE_TYPE'],
    actions: [{ label: '医療ユニット射撃', role: 'MAIN', damageType: 'TRUE', scale: k('attack@atk_scale') }],
    periodTotal: unresolvedPeriod('弾薬10発の消費時刻や治療対象への射撃を扱わず、敵に命中する1発と連続射撃中のDPSを評価します。') })]], [
    talent(0, '遺塵の先を', () => [status('durability', '最大HP・防御力・ブロック数・ブロック範囲を増加'),
      status('liftoff', '配置後に離陸')], ['SURVIVAL', 'ABILITY']),
    talent(1, '医師の標', () => [status('ally-shield-heal', '範囲内に配置した自身以外の味方にシールドと継続回復を付与',
      { target: { ...target('ALLY', 'ATTACK_RANGE'), includeSelf: false } })], ['SURVIVAL']),
  ], { traitNotes: [...aoeNotes, 'S2の命中範囲内にいる敵への確定ダメージを評価する。治療量・足止め・離陸中の移動はダメージに含めない。'],
    deferredSkills: [{ skillIndex: 1, reason: '治療と味方のブロック範囲を強化するスキルで、直接ダメージの対象外。' },
      { skillIndex: 3, reason: '治療と味方の移動を行うスキルで、直接ダメージの対象外。' }] }),
  operator('char_4179_monstr', [[3, normal({ atk: k('atk'), intervalAdd: k('base_attack_time'),
    blockCountAdd: k('block_cnt'), maxTargets: sum(1, k('block_cnt')),
    traitOverrides: ['NORMAL_ATTACK_ENABLED', 'DAMAGE_TYPE'],
    actions: [{ label: 'メルトダウン', role: 'MAIN', damageType: 'TRUE', scale: 1 }],
    periodTotal: unresolvedPeriod('現在の素質状態とブロック数を固定して評価し、回復による素質の更新・HP減少・致命傷による帰還時刻は計算しません。') })]], [
    talent(0, '自己修復', v => [atk(v.read('atk'), 'atk', { condition: eq('monstrCoreAttackBuffActive', true) }),
      status('healing-core', '再構成核を配置可能、核を経由する治療は減衰・跳躍数消費なし')], ['ABILITY', 'SURVIVAL']),
    talent(1, '戦術連携', v => [speed(v.read('attack_speed'), { condition: eq('monstrHealingSpeedBuffActive', true),
      lifetime: { type: 'FIXED_SECONDS', seconds: v.read('buff_duration') } })]),
  ], { inputs: [b('monstrCoreAttackBuffActive', '再配置した再構成核の攻撃力強化が有効'),
    b('monstrHealingSpeedBuffActive', '治療後の素質による攻撃速度上昇が有効', true)],
    // https://prts.wiki/w/Mon3tr: S3 withdraws the core before moving; a new core may be placed during S3.
    traitNotes: ['S3中に自身がブロックしている敵への攻撃を評価する。治療の跳躍は敵への攻撃に適用しない。',
      'S3発動時の再構成核は撤退する。再配置した核の効果範囲内かと、治療後10秒間の攻撃速度上昇が現在有効かを指定する。'],
    deferredSkills: [{ skillIndex: 1, reason: '跳躍治療を強化するスキルで、直接ダメージの対象外。' },
      { skillIndex: 2, reason: '再構成核による治療と攻撃速度支援を強化するスキルで、直接ダメージの対象外。' }] }),
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
  operator('char_411_tomimi', [[1, normal({ aspd: k('attack_speed'), traitOverrides: ['DAMAGE_TYPE'], actions: [{ label: '物理攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }] })],
    [2, [
      ...(['STUN', 'POWER', 'AREA'] as const).map(outcome => phase('tomimiOutcome', outcome, physical({
        label: { STUN: 'スタン効果の攻撃1回', POWER: '攻撃力220%の攻撃1回', AREA: '範囲攻撃1回' }[outcome],
        maxTargets: outcome === 'AREA' ? null : 1, traitOverrides: ['DAMAGE_TYPE'],
        actions: [{ label: '実現した効果の攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: outcome === 'POWER' ? k('attack@tomimi_s_2.atk_scale') : 1 }],
        dpsUnsupportedReason: '今回実現した抽選結果の1回。3効果の出現確率や連続攻撃の期待値は計算しません。',
        periodTotal: unresolvedPeriod('攻撃ごとの抽選結果を時間方向に積算していません。'),
      }))),
      phase('tomimiOutcome', 'EXPECTED', physical({ label: '抽選込みの期待値', actions: [],
        unresolved: ['3効果の出現確率と範囲攻撃の対象数分布は未確認です。実現した効果を指定してください。'] })),
    ], [select('tomimiOutcome', '今回の効果', [['STUN', 'スタン'], ['POWER', '攻撃力上昇'], ['AREA', '範囲攻撃'], ['EXPECTED', '抽選込みの期待値']])]]], [
    talent(0, '荒野術師流戦法', v => [atk(v.read('atk')), status('physical-mode', 'スキル中は地上対象への物理攻撃・攻撃範囲縮小')], ['ABILITY', 'ATTACK_BEHAVIOR']),
  ], { traitNotes: ['スキル中の地上の敵への攻撃を計算する。S2は特化3の100%発動時に実現した1効果を指定し、3効果を同時適用しない。'] }),
  // https://prts.wiki/w/Qanipalaat : the periodic link and the levitation-expiry explosion are separate effects.
  operator('char_466_qanik', [[1, normal({ aspd: k('attack_speed') })],
    [2, [phase('qanikEvent', 'TICK', { ...action('リンクの継続攻撃1回', k('trigger_atk_scale'), k('max_target')),
      dpsUnsupportedReason: '0.5秒ごとの継続効果の1回。初回の浮遊付与順やリンクの中断時刻は積算しません。',
      periodTotal: unresolvedPeriod('浮遊の付与・終了、リンクの中断を含む期間総量は未計算です。') }),
      phase('qanikEvent', 'EXPLOSION', { ...action('浮遊終了による爆発1回', k('critical_damage_scale')),
        dpsUnsupportedReason: '同スキルの浮遊が終了した際の爆発1回。爆発源は1体。',
        periodTotal: unresolvedPeriod('周囲への爆発の重なりや浮遊の終了時刻は積算しません。') })],
      [select('qanikEvent', '計算する効果', [['TICK', '継続攻撃1回'], ['EXPLOSION', '浮遊終了の爆発1回']])]]], [
    talent(0, '氷原生存術', v => [damage(v.read('damage_scale'), eq('targetAirborne', true), 'damage_scale', true)], ['DAMAGE']),
  ], { inputs: [b('targetAirborne', 'ダメージ時に対象が空中にいる')],
    traitNotes: ['S2は命中時の状態を指定する。継続効果は浮遊中または浮遊無効の対象への1回。爆発は浮遊の付与に成功した対象の効果終了時にのみ発生する。'] }),
  // https://prts.wiki/w/天火 : skill interval is multiplied by 1.7, not increased by 0.7 seconds.
  operator('char_166_skfire', [[1, normal({ atk: k('atk') })],
    [2, normal({ label: '隕石の命中が継続する状態', intervalScale: sum(1, k('base_attack_time')), maxTargets: null,
      actions: [{ label: '隕石1個の命中', role: 'MAIN', damageType: 'ARTS', scale: k('attack@atk_scale') }],
      periodTotal: unresolvedPeriod('隕石の落下遅延・最初と最後の命中時点を含む期間総量は計算しません。') })]], [
    talent(0, 'アーツバースト', v => [damage(v.read('damage_scale'), eq('targetBlocked', true), 'damage_scale', true)], ['DAMAGE']),
  ], { inputs: [b('targetBlocked', '対象がブロックされている')], traitNotes: aoeNotes }),
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
  operator('char_341_sntlla', [[1, normal({ atk: k('atk'), aspd: k('attack_speed') })],
    [2, [
      ...(['NONE', 'FROZEN', 'IMMUNE'] as const).map(state => phase('santallaColdState', state, {
        ...action('命中した氷柱1本', k('attack@atk_scale')),
        resistanceReductionFixed: state === 'FROZEN' ? 15 : 0,
        dpsUnsupportedReason: '指定した全対象に命中した氷柱1本。ランダムな落下位置を実命中頻度へ置き換えません。',
        periodTotal: unresolvedPeriod('落下位置・氷柱の命中数・凍結の発生と終了は計算しません。'),
      })),
      phase('santallaColdState', 'COLD', { ...action('寒冷から凍結への変化', 1), actions: [],
        unresolved: ['今回の氷柱で寒冷から凍結へ変わる場合、術耐性低下とダメージの処理順序は未対応です。'] }),
    ], [select('santallaColdState', '命中前の対象の状態', [['NONE', '寒冷なし'], ['FROZEN', '既に凍結中'], ['IMMUNE', '凍結無効'], ['COLD', '寒冷中・今回凍結']])]]], [
    talent(0, '寒地の民', v => [atk(v.read('atk'), 'atk', { condition: cmp('secondsSinceDeploy', 'GTE', v.read('interval')) }),
      status('status-resistance', '配置20秒後にレジスト', { condition: cmp('secondsSinceDeploy', 'GTE', v.read('interval')) })], ['ABILITY', 'STATUS']),
  ], { inputs: [n('secondsSinceDeploy', '配置からの経過時間（秒）', 20, 0, 3600)], traitNotes: aoeNotes }),
  // https://prts.wiki/w/复奏 : each splash checks the talent; the cached-ATK, source-less DOT does not.
  operator('char_4031_liesel', [[1, next(k('atk_scale'))],
    [2, [phase('lieselEvent', 'SPLASH', { ...action('3発のうち爆発1回', k('atk_scale')),
      dpsUnsupportedReason: '実際に命中した爆発1回。3発の位置・重複命中は合算しません。',
      periodTotal: unresolvedPeriod('3発の落下と持続効果の更新時刻は積算しません。') }),
      phase('lieselEvent', 'DOT', { ...action('継続効果の1秒分', k('liesel_s_2[dot].atk_scale')),
        actions: [{ label: '継続効果の1秒分', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: k('liesel_s_2[dot].atk_scale') }],
        dpsUnsupportedReason: '発射時から攻撃力が変化していない場合の継続効果1秒分。',
        periodTotal: unresolvedPeriod('持続効果の再付与と残り時間は積算しません。') }),
      phase('lieselEvent', 'CHANGED', { ...action('発射後に攻撃力が変化', 1), actions: [],
        unresolved: ['継続効果は弾の発射時の攻撃力を保持します。発射後に攻撃力が変化した場合の値は未対応です。'] })],
      [select('lieselEvent', '計算する効果', [['SPLASH', '爆発1回'], ['DOT', '攻撃力不変の継続効果'], ['CHANGED', '攻撃力変化後の継続効果']])]]], [
    talent(0, '指揮者の素質', v => [damage(v.read('damage_scale'), { type: 'ALL', conditions: [
      cmp('actualAttackTargetCount', 'GTE', v.read('min_target_cnt')),
      { type: 'ANY', conditions: [eq('skillIndex', 1), eq('lieselEvent', 'SPLASH')] },
    ] })], ['DAMAGE'], '0'),
  ], { traitNotes: [...aoeNotes, 'S2の対象数は選択した爆発1回に巻き込む数。継続効果には素質の倍率を適用しない。'] }),
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
  // https://prts.wiki/w/格劳克斯 : S2 disables talent 1; the drone bonus doubles attack scale.
  operator('char_326_glacus', [[1, normal({ atk: k('atk'), maxTargets: k('attack@max_target') })],
    [2, action('電磁パルス1回', choose('targetDrone', true, k('atk_scale[drone]'), k('atk_scale[normal]')))]], [
    talent(0, '対空装置', v => [effect('drone-attack-scale', 'atk_scale', { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { condition: { type: 'ALL', conditions: [eq('targetDrone', true), eq('skillIndex', 1)] } }), status('drone-priority', 'ドローンを優先して攻撃')], ['DAMAGE', 'ATTACK_BEHAVIOR']),
  ], { inputs: [b('targetDrone', '対象がドローン')], traitNotes: ['同じドローン種別の対象群への1回を評価。S2に素質150%を追加乗算しない。'] }),
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
    // PRTS /艾雅法拉: main-target RES debuff, area half-hit, then another main-target half-hit.
    [2, [phase('eyjaIgnitionTarget', 'MAIN', next(k('atk_scale'), 1)),
      phase('eyjaIgnitionTarget', 'SPLASH', next(k('atk_scale'), null))],
      [select('eyjaIgnitionTarget', '命中対象', [['MAIN', '主対象'], ['SPLASH', '周囲のみ（主対象を除く）']]),
        b('eyjaSplashAlreadyDebuffed', '周囲の対象に術耐性低下が付与済み')]],
    [3, normal({ atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: k('attack@max_target') })]], [
    talent(0, 'フレイムブレス', v => [atk(v.read('atk'), 'atk', { target: { ...target('ALLY', 'BATTLEFIELD'), tagIds: ['profession:CASTER'] } })]),
    talent(1, 'カオスフレイム', () => [status('initial-sp', '配置後SPが7〜15回復')], ['RESOURCE']),
  ], { inputs: [n('skillActivationCount', 'スキル発動回数', 1, 1, 100)], traitNotes: ['S2は主対象と周囲を別々に評価する。主対象は耐性低下を付与してから半倍率の2命中、周囲は半倍率の1命中で、この発動による耐性低下は付与されない。'] }),
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
  // https://prts.wiki/w/夜魔 : one Rupture update uses measured tile-distance, not ATK or a movement-speed estimate.
  operator('char_164_nightm', [[1, normal()], [2, [
    phase('nightmareAction', 'MOVEMENT', normal({ label: '移動創傷の更新1回', kind: 'SKILL_ACTION', maxTargets: k('max_target'), traitOverrides: ['DAMAGE_TYPE'],
      actions: [{ label: '移動距離に比例する確定ダメージ', role: 'MAIN', damageType: 'TRUE', basis: 'ATK_STAT', scale: 0,
        flatDamage: choose('movementDelta', 4, 0, product(k('value'), input('movementDelta')), 'GT') }],
      dpsUnsupportedReason: '移動創傷が有効な対象の計測更新1回。移動速度や効果時間からDPSを推定しません。',
      periodTotal: unresolvedPeriod('移動経路・更新回数・他の移動創傷との上書きは計算しません。'),
      notes: ['前回更新からの計測移動距離が4マスを超える場合はダメージ0。ナイトメア由来の1200/マスが有効な対象のみ。'] })),
    phase('nightmareAction', 'NORMAL', normal({ label: '通常攻撃1回',
      dpsUnsupportedReason: '通常攻撃1回のみ。移動創傷との時間合算は計算しません。',
      periodTotal: unresolvedPeriod('通常攻撃と移動創傷の時間合算は計算しません。') })),
  ], [select('nightmareAction', '評価する行動', [['MOVEMENT', '移動創傷の更新1回'], ['NORMAL', '通常攻撃1回']]),
    { ...n('movementDelta', '前回更新からの計測移動距離（マス）', 1, 0, 10000), step: 0.01 }]]], [
    talent(0, '二重人格', v => [atk(v.read('atk'), 'atk', { condition: eq('skillIndex', 2) }),
      effect('physical-dodge', 'prob', { item: 'PHYSICAL_DODGE', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('prob') }, { condition: eq('skillIndex', 1) }),
      effect('arts-dodge', 'prob', { item: 'ARTS_DODGE', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('prob') }, { condition: eq('skillIndex', 1) })], ['ABILITY', 'SURVIVAL']),
  ], { traitNotes: ['味方の回復量は含めない。移動創傷はナイトメア自身から付与した効果のみ。他のオペレーターの効果が残る対象は含めない。'] }),
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
    ], notes: ['やけどは付与中の毎秒ダメージ。付与・更新・終了時刻や退場後の推移は含めない。'] })],
    [3, [{ ...periodic('灼獄の毎秒ダメージ', k('atk_scale'), { kind: 'SKILL_ACTION', resistanceReductionFixed: product(-1, k('magic_resistance')),
      notes: ['術耐性低下が有効な地上の敵が攻撃範囲内に留まる状態。自身のHP減少を敵へのダメージへ加算しない。'] }),
      when: { input: 'ifritS3DebuffActive', comparison: 'EQ', value: true } },
      { ...periodic('術耐性低下の初回付与・失効', 0), id: 'initial', when: { input: 'ifritS3DebuffActive', comparison: 'EQ', value: false },
        unresolved: ['初回命中時の術耐性低下の付与順と、途中進入・退出による失効を含む時系列は未対応です。'] }],
      [b('ifritS3DebuffActive', '対象に灼獄の術耐性低下が有効', true)]]], [
    talent(0, '精神融解', v => [effect('resistance-reduction', 'magic_resistance', {
      item: 'RESISTANCE_REDUCTION_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: mul(-1, v.read('magic_resistance')),
    }, { target: target('ENEMY', 'ATTACK_RANGE') })], ['DAMAGE']),
    talent(1, 'ライン回路', v => [effect('periodic-sp', 'sp', {
      item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('sp'),
    }, { timing: { type: 'PERIODIC', intervalSeconds: v.read('interval'), firstTickSeconds: null } })], ['RESOURCE']),
  ], { traitNotes: ['選択した全対象が直線範囲内にいる条件。S2の防御力低下は自身の術ダメージを変化させない。S3は地上対象への毎秒ダメージで、通常攻撃を追加しない。'] }),
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
  operator('char_4004_pudd', [[1, normal({ aspd: k('attack_speed'), periodTotal: { kind: 'CONSTANT_RATE' } })],
    [2, normal({ label: '再跳躍を含む連鎖1回', atk: k('atk'), maxTargets: k('attack@max_target'),
      traitOverrides: ['CHAIN_ATTACK'],
      actions: Array.from({ length: 4 }, (_, bounce) => ({ label: bounce === 0 ? '初撃' : `第${bounce}跳躍`,
        role: 'MAIN' as const, damageType: 'ARTS' as const, scale: 0.85 ** bounce, targets: 1,
        hits: bounce === 0 ? 1 : choose('actualAttackTargetCount', 1, 0, 1) })),
      dpsUnsupportedReason: '互いに跳躍可能な同一防御条件の敵への連鎖1回。1体では初撃のみ、2体以上では再跳躍を含む計4命中。',
      periodTotal: unresolvedPeriod('跳躍中の撃破・移動と次の発射までの時間は計算しません。'),
      notes: ['全対象に命中する経路を指定した場合の1体平均。未命中の敵や跳躍範囲外の敵を対象数へ含めない。https://prts.wiki/w/布丁'] })]], [
    talent(0, '電磁波', v => [atk(v.read('atk'))]),
  ]),
  operator('char_472_pasngr', [[1, next(k('pasngr_s_1.atk_scale'), k('pasngr_s_1.max_target'))],
    [2, normal({ atk: k('atk'), intervalScale: { op: 'add', args: [1, k('base_attack_time')] }, maxTargets: k('attack@max_target'),
      periodTotal: { kind: 'UNSUPPORTED', reason: '素質の増幅の付与・更新・失効とHP推移を計算していないため、総ダメージは未計算です。' } })],
    [3, { ...action('サンダーストームの連鎖1回', k('atk_scale'), k('chain.max_target')),
      traitOverrides: ['CHAIN_ATTACK'],
      actions: Array.from({ length: 4 }, (_, bounce) => ({ label: bounce === 0 ? '雷撃の初撃' : `雷撃の第${bounce}跳躍`,
        role: 'MAIN' as const, damageType: 'ARTS' as const, scale: product(k('atk_scale'), 0.85 ** bounce), targets: 1,
        hits: choose('actualAttackTargetCount', bounce, 1, 0, 'GT') })),
      dpsUnsupportedReason: '雷撃1回の連鎖。発生するストーム数、通常攻撃、ランダムな対象選択を時間方向に合算しません。',
      periodTotal: unresolvedPeriod('ストームの初回・最終発生、複数ストームと通常攻撃の重なりは未計算です。'),
      notes: ['同一防御条件で互いに跳躍可能な対象への1連鎖。https://prts.wiki/w/异客'] }]], [
    talent(0, 'メカニズムアナライズ', v => [effect('active-analysis-amplification', 'pasngr_t_1[enhance].damage_scale', {
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('pasngr_t_1[enhance].damage_scale'),
    }, { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('analysisAmplificationActive', true),
      lifetime: { type: 'FIXED_SECONDS', seconds: v.read('pasngr_t_1[enhance].duration') } })], ['DAMAGE']),
    talent(1, 'ラストソルジャー', v => [atk(v.read('atk'), 'atk', { condition: eq('adjacentEnemyPresent', false) })]),
  ], { inputs: [b('analysisAmplificationActive', '命中時に素質1の増幅が有効'), b('adjacentEnemyPresent', '隣接4マスに敵がいる')],
    traitNotes: ['対象全員の命中時の増幅状態を指定する。HP80%以上の対象への命中による増幅の付与・更新、3秒後の失効はシミュレートしない。'] }),
  operator('char_4027_heyak', [[1, next(k('atk_scale'), 2)],
    [2, [normal({ when: { input: 'targetCanBeLevitated', comparison: 'EQ', value: false },
      maxTargets: null, actions: [{ label: 'ランダム9連続攻撃', role: 'MAIN', damageType: 'ARTS',
      scale: k('attack@atk_scale'), hits: 9, targets: 1 }],
      periodTotal: unresolvedPeriod('浮遊状態の付与・終了による素質倍率の変化を計算していないため、総ダメージは未計算です。') }),
    normal({ id: 'levitation-transition', label: '浮遊による状態変化',
      when: { input: 'targetCanBeLevitated', comparison: 'EQ', value: true }, actions: [],
      unresolved: ['浮遊が有効な対象への9連続攻撃は、命中途中の浮遊付与と素質倍率の変化を扱う必要があるため未対応です。'] })],
      [b('targetCanBeLevitated', '対象に浮遊が有効')]],
    [3, [phase('heyakCollision', 'STABLE', { ...action('旋風1個の命中',
      sum(k('attack@min_atk_scale'), product(sum(k('attack@max_atk_scale'), product(-1, k('attack@min_atk_scale'))),
        { op: 'min', args: [1, product(input('heyakTornadoAge'), 1 / 1.77)] })), 1),
      dpsUnsupportedReason: '旋風1個の最初の命中。3本の進路や衝突間隔は合算しません。',
      periodTotal: unresolvedPeriod('旋風の生成遅延・移動・対象の浮遊時間は積算しません。'),
      notes: ['生成後1.77秒で倍率が上限になる。命中前から空中、または浮遊無効で状態が変化しない敵を指定する。https://prts.wiki/w/霍尔海雅'] }),
      phase('heyakCollision', 'TRANSITION', { ...action('今回の命中で浮遊を付与', 1, 1), actions: [],
        unresolved: ['新規浮遊と素質倍率の適用順が未確認です。空中状態が変化しない命中を指定してください。'] })],
      [select('heyakCollision', '命中による状態変化', [['STABLE', '空中状態が変わらない'], ['TRANSITION', '新たに浮遊する']]),
        { ...n('heyakTornadoAge', '旋風生成からの秒数', 1.77, 0, 5), step: 0.01 }]]], [
    talent(0, '伝承の終焉', v => [effect('airborne-attack-scale', 'atk_scale',
      { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('atk_scale') },
      { condition: eq('targetAirborne', true) }), status('silence', `${v.read('silence')}秒間の特殊能力無効化`,
        { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('targetAirborne', true) })], ['DAMAGE', 'STATUS']),
    talent(1, '今は無き翼', v => [status('antigravity', `HP${percent(v.read('hp_ratio'))}%以上の敵に反重力を付与`,
      { target: target('ENEMY', 'ATTACK_RANGE') })], ['STATUS']),
  ], { inputs: [b('targetAirborne', '命中時に対象が空中にいる')],
    traitNotes: ['S2・S3は飛行中または浮遊無効の敵など、浮遊付与で空中状態が変化しない対象に限定する。S2の全対象は空中状態・防御条件が同じ場合の均等な配分期待値。新規浮遊のある命中は未対応。'] }),
  operator('char_1020_reed2', [[1, normal({ atk: k('atk'), aspd: k('attack_speed'),
    periodTotal: unresolvedPeriod('灼痕の確率付与・更新・失効を計算していないため、総ダメージは未計算です。') }),
      [b('reedScarActive', '命中時に灼痕が有効')]],
    [2, { ...action('火球1個の接触1回', k('atk_scale'), 1),
      dpsUnsupportedReason: '火球1個が地上の敵1体に接触した際の1回。回転・再接触の時間は合算しません。',
      periodTotal: unresolvedPeriod('6個の火球の軌道・接触間隔・通常攻撃は積算しません。'),
      notes: ['味方の攻撃力ではなく焔影リードの攻撃力を使う。https://prts.wiki/w/焰影苇草'] },
      [b('reedScarActive', '命中時に灼痕が有効')]],
    [3, [
      phase('reedEvent', 'ATTACK', normal({ label: '通常攻撃1回', atk: k('reed2_skil_3[switch_mode].atk'), maxTargets: k('max_target'),
        dpsUnsupportedReason: '通常攻撃1回。灼痕の継続効果や爆発を合算しません。',
        periodTotal: unresolvedPeriod('灼痕の伝播・撃破時刻と継続効果は積算しません。') })),
      ...(['TICK', 'EXPLOSION'] as const).map(event => phase('reedEvent', event, {
        ...action(event === 'TICK' ? '灼痕の1秒分' : '撃破時の爆発1回', k(event === 'TICK' ? 'talent@s3_atk_scale' : 'talent@aoe_scale')),
        atk: k('reed2_skil_3[switch_mode].atk'),
        dpsUnsupportedReason: 'S3中に付与した灼痕の1イベント。爆発は1体の撃破を起点とし、連鎖を合算しません。',
        periodTotal: unresolvedPeriod('灼痕の伝播・撃破時刻と複数の爆発の重なりは積算しません。'),
        notes: ['爆発は灼痕付与の0.1秒後。S3の確定付与による術脆弱を適用する。https://prts.wiki/w/焰影苇草'],
      })),
    ], [select('reedEvent', '計算する効果', [['ATTACK', '通常攻撃'], ['TICK', '灼痕の1秒分'], ['EXPLOSION', '撃破時の爆発1回']])]]], [
    talent(0, '灼けつく炎', v => [damage(v.read('damage_scale'), { type: 'ANY', conditions: [eq('skillIndex', 3), eq('reedScarActive', true)] }, 'damage_scale', true),
      status('scar-application', `${percent(v.read('prob'))}%の確率で${v.read('duration')}秒間の灼痕を付与`,
        { target: target('ENEMY', 'ATTACK_TARGET'), timing: { type: 'EVENT', event: 'ATTACK' } }),
      status('scar-attack-reduction', `灼痕中の攻撃力${percent(v.read('atk'))}%`,
        { target: target('ENEMY', 'ATTACK_TARGET'), condition: eq('reedScarActive', true) })], ['DAMAGE', 'STATUS']),
    talent(1, '耀映', v => [status('self-heal', `自身以外への治療量の${percent(v.read('scale'))}%で自身を治療`)], ['SURVIVAL']),
  ], { traitNotes: ['S1・S2は灼痕が有効かを命中時の条件として指定する。30%の付与確率を脆弱倍率に乗算した平均値ではない。S3は確定付与のため当該ダメージにも術脆弱を適用する。回復量は含めない。'] }),
  operator('char_1024_hbisc2', [[1, normal({ atk: k('atk'),
    periodTotal: unresolvedPeriod('対術脆弱の付与・更新・失効の時刻を計算していないため、総ダメージは未計算です。') })],
    [2, { ...action('毎秒攻撃の1回', k('atk_scale'), k('max_target')),
      dpsUnsupportedReason: '命中時の対術脆弱が指定した状態での1回。付与・更新・失効を含む連続DPSは計算しません。',
      periodTotal: unresolvedPeriod('初回・最終命中と対術脆弱の時間推移は計算しません。') }]], [
    talent(0, '朝瞬の花', v => [damage(v.read('damage_scale'), eq('hibiscusWeaknessActive', true), 'damage_scale', true),
      status('arts-weakness-application', `攻撃対象に${v.read('weak[magic][limit]')}秒間の対術脆弱を付与`,
        { target: target('ENEMY', 'ATTACK_TARGET'), timing: { type: 'EVENT', event: 'ATTACK' } })], ['DAMAGE', 'STATUS']),
  ], { inputs: [b('hibiscusWeaknessActive', '命中時に素質の対術脆弱が有効')],
    traitNotes: ['命中時の対術脆弱の状態を指定する。付与・更新・失効と味方への回復量は含めない。'] }),
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
    [3, STAINLESS_SUMMON_RECIPE.stages, STAINLESS_SUMMON_RECIPE.inputs],
  ], [
    talent(0, '戦場のエンジニア', () => [status('support-devices', '支援装置を使用可能、装備スキルにより性能が変化')], ['RESOURCE']),
    talent(1, '経費削減', () => [status('device-recovery', '周囲で破壊された支援装置を確率で再獲得')], ['RESOURCE']),
  ], {
    traitNotes: ['自身の攻撃を評価する。S1は装置1基の基本攻撃力上昇12%を4倍にし、スキル倍率200%は別に適用する。S2は自身がブロックする敵だけを指定する。'] }),
]


const eyjaIgnition = EXPANDED_ARTS_DEFINITIONS.find(definition => definition.operatorId === 'char_180_amgoat')!.recipes.find(recipe => recipe.skillIndex === 2)!
eyjaIgnition.stages = eyjaIgnition.stages.map(stage => ({ ...stage,
  resistanceReductionRatio: stage.when?.value === 'MAIN' ? product(-1, k('magic_resistance'))
    : choose('eyjaSplashAlreadyDebuffed', true, product(-1, k('magic_resistance'))),
  actions: [{ label: '爆発の命中', role: 'MAIN', damageType: 'ARTS', scale: k('atk_scale') },
    ...(stage.when?.value === 'MAIN' ? [{ label: '主対象への追加命中', role: 'MAIN' as const, damageType: 'ARTS' as const, scale: k('atk_scale_2') }] : [])],
}))
