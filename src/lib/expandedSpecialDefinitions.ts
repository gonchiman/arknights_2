import sources from '../data/expandedSpecialSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue } from './combatEffectStructure.ts'

const k = (key: string): GuardValue => ({ key })
const choose = (input: string, value: string | number | boolean, yes: GuardValue, no: GuardValue = 0,
  comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): GuardValue => ({ op: 'if', input, comparison, value, yes, no })
const product = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const sum = (...args: GuardValue[]): GuardValue => ({ op: 'add', args })
const input = (input: string): GuardValue => ({ input })
const minimum = (...args: GuardValue[]): GuardValue => ({ op: 'min', args })
const n = (key: string, label: string, value: number, min: number, max: number): GuardInput =>
  ({ key, label, kind: 'number', defaultValue: value, min, max, step: 1 })
const b = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const select = (key: string, label: string, choices: readonly [string, string][]): GuardInput =>
  ({ key, label, kind: 'select', defaultValue: choices[0][0], options: choices.map(([value, label]) => ({ value, label })) })
const eq = (metric: string, value: string | number | boolean): CombatCondition => ({ type: 'COMPARE', metric, comparison: 'EQ', value })
const metric = (metric: string): CombatNumericValue => ({ type: 'METRIC', metric })
const mul = (...values: CombatNumericValue[]): CombatNumericValue => ({ type: 'CALC', operation: 'MULTIPLY', values })
const percent = (value: number | null): number | null => value === null ? null : value * 100
const enemyTarget = { type: 'RECIPIENTS', side: 'ENEMY', entity: 'UNIT', scope: 'ATTACK_RANGE', includeSelf: false,
  factionIds: [], tagIds: [], selection: { type: 'ALL' } } as const
type Payload<T> = T extends CombatEffectContext ? Omit<T, keyof CombatEffectContext> : never
const effect = (id: string, sourceBinding: string, payload: Payload<TalentStructureEffect>, options: Partial<CombatEffectContext> = {}): TalentStructureEffect =>
  ({ id, sourceBinding, timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
    target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true,
      factionIds: [], tagIds: [], selection: { type: 'ALL' } },
    probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [],
    ...payload, ...options }) as TalentStructureEffect
const status = (id: string, text: string) => effect(id, `description:${id}`,
  { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: text })
const talent = (talentIndex: number, name: string, effects: ExpandedTalentDefinition['effects'],
  categories: ExpandedTalentDefinition['categories'] = ['ABILITY']): ExpandedTalentDefinition =>
  ({ talentIndex, name, prefabKey: String(talentIndex + 1), categories, effects })
const normal = (options: Partial<GuardStage> = {}): GuardStage => ({ id: 'active', label: 'スキル中', kind: 'NORMAL',
  actions: [{ label: '通常攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }], ...options })
const action = (label: string, scale: GuardValue, options: Partial<GuardStage> = {}): GuardStage => normal({
  label, kind: 'SKILL_ACTION', maxTargets: null, actions: [{ label, role: 'MAIN', damageType: 'ARTS', scale }], ...options,
})
const phase = (input: string, value: string, stage: GuardStage): GuardStage =>
  ({ ...stage, id: value.toLowerCase(), when: { input, comparison: 'EQ', value } })
const period = (reason: string): GuardStage['periodTotal'] => ({ kind: 'UNSUPPORTED', reason })
const unresolved = (label: string, reason: string): GuardStage => normal({ label, actions: [], unresolved: [reason] })
const recipe = (id: string, index: number, stages: readonly GuardStage[], inputs: readonly GuardInput[] = []): GuardSkillRecipe => {
  const raw = sources.find(source => source.operatorId === id)!.skills.find(skill => skill.skillIndex === index)!.raw
  return { operatorId: id, skillIndex: index, inputs,
    stages: stages.map(stage => ({ ...stage, duration: stage.duration ?? (raw.duration < 0 ? 'UNTIL_EXIT' : raw.duration) })) }
}
const operator = (operatorId: string, stages: readonly [number, GuardStage | readonly GuardStage[], (readonly GuardInput[])?][],
  talents: readonly ExpandedTalentDefinition[], options: Partial<Omit<ExpandedOperatorDefinition, 'operatorId' | 'recipes' | 'talents'>> = {}): ExpandedOperatorDefinition =>
  ({ operatorId, phaseIndex: 2, skillLevelIndex: 9, talents,
    recipes: stages.map(([index, value, inputs]) => recipe(operatorId, index, Array.isArray(value) ? value : [value as GuardStage], inputs)), ...options })

const all = (...conditions: CombatCondition[]): CombatCondition => ({ type: 'ALL', conditions })
const eventScope = '指定した状態の1回を評価し、状態の付与・解除、HP・攻撃強化の途中変化を合算しません。'
const noDamage = (label: string): GuardStage => normal({ label, kind: 'SKILL_ACTION', actions: [], periodTotal: period(eventScope) })
const pending = (label: string, reason: string, sections: readonly ('スキル' | '特性' | '素質1' | '素質2')[] = ['スキル']): GuardStage => ({
  ...unresolved(label, reason), calculationIssues: [{ id: label, reason, relatedSections: sections }],
})
const titiPhase = (value: string, stage: GuardStage) => phase('titiPhase', value, stage)
const titiAttack = (maxTargets = 1): GuardStage => normal({ atk: k('atk'), maxTargets,
  actions: [{ label: '通常攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1 }],
  dpsUnsupportedReason: '睡眠の付与・解除を追跡しないため、現在の攻撃1回のみを評価します。', periodTotal: period(eventScope) })
const titiDot = (scale: GuardValue = 1): GuardStage => normal({ label: '睡眠中の毎秒ダメージ', atk: k('atk'), kind: 'SKILL_ACTION',
  actions: [], maxTargets: null, damageScale: scale, periodTotal: period(eventScope) })
const wakeScale = sum(k('min_atk_scale'), product(sum(k('max_atk_scale'), product(-1, k('min_atk_scale'))), 0.2, minimum(5, input('titiSleepSeconds'))))
const swireNormal = (): GuardStage => normal({ periodTotal: period('コイン入手、治療・爆弾設置による攻撃中断、攻撃強化の時間推移を含みません。'),
  dpsUnsupportedReason: 'コインによる行動置換や設置中断を追跡せず、通常攻撃1回を評価します。' })
const swirePhase = (value: string, stage: GuardStage) => phase('swirePhase', value, stage)

export const EXPANDED_SPECIAL_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  // https://prts.wiki/w/Titi : ordinary extra damage and sleep ticks are separate events.
  operator('char_4056_titi', [
    [1, [titiPhase('ATTACK', titiAttack()), titiPhase('DOT', titiDot()),
      titiPhase('TRANSITION', pending('睡眠の初回付与', '攻撃中に移動状態・睡眠が変わる初撃の処理順は未対応です。', ['スキル', '素質1']))],
      [select('titiPhase', '計算対象', [['ATTACK', '状態固定の通常攻撃'], ['DOT', '睡眠中の毎秒ダメージ'], ['TRANSITION', '睡眠の初回付与']])]],
    [2, titiPhase('DOT', titiDot(k('talent_scale'))), [select('titiPhase', '計算対象', [['DOT', '睡眠中の毎秒ダメージ']])]],
    [3, [titiPhase('ATTACK', titiAttack(2)), titiPhase('DOT', titiDot()),
      titiPhase('WAKE', action('スキル中の睡眠終了1回', wakeScale, { atk: k('atk'), maxTargets: 1,
        actions: [{ label: '睡眠終了', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: wakeScale }], periodTotal: period(eventScope) })),
      titiPhase('END', action('スキル終了による睡眠終了1回', wakeScale, { maxTargets: 1,
        actions: [{ label: '睡眠終了', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: wakeScale }], periodTotal: period(eventScope) })),
      titiPhase('TRANSITION', pending('睡眠の初回付与・連鎖', '命中中の睡眠付与・対象移動・次の敵への睡眠連鎖は未対応です。', ['スキル', '素質1']))],
      [select('titiPhase', '計算対象', [['ATTACK', '状態固定の通常攻撃'], ['DOT', '睡眠中の毎秒ダメージ'], ['WAKE', 'スキル中の睡眠終了'], ['END', 'スキル終了時の睡眠終了'], ['TRANSITION', '睡眠の初回付与・連鎖']]),
        { ...n('titiSleepSeconds', '睡眠の累積時間（秒）', 5, 0, 60), step: 0.001 }]],
  ], [talent(0, '止まった時の中', v => [
    effect('stationary-extra', 'extra_atk_scale', { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER',
      value: v.read('extra_atk_scale'), basis: 'ATK_STAT', damageType: 'ARTS', rate: 'PER_ATTACK' },
    { target: enemyTarget, condition: all(eq('titiPhase', 'ATTACK'), eq('titiTargetNonMoving', true)), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } }),
    effect('sleep-tick', 'damage_atk_scale', { item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', damage: {
      kind: { type: 'ORDINARY', damageType: 'ARTS' }, amount: { basis: 'ATK_RATIO', ratio: v.read('damage_atk_scale'), reference: 'SOURCE', referenceTime: 'EACH_TICK' },
      rate: 'PER_SECOND', duration: { type: 'UNSPECIFIED' }, cadence: { intervalSeconds: 1, firstTickSeconds: 0.5 },
      stacking: { mode: 'REPLACE', maxStacks: 1 }, refresh: 'UNSPECIFIED',
    } }, { target: enemyTarget, condition: eq('titiPhase', 'DOT'), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } }),
    status('sleep-access', '睡眠による無敵を無視して攻撃可能'),
  ], ['DAMAGE', 'ADDITIONAL_DAMAGE', 'STATUS']),
  talent(1, '勇者への恩賞', v => [effect('hp-speed', 'attack_speed / hp_ratio', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('attack_speed') },
    { condition: { type: 'COMPARE', metric: 'selfHpPercent', comparison: 'GTE', value: percent(v.read('hp_ratio')) } })], ['ABILITY'])],
  { inputs: [b('titiTargetNonMoving', '命中前後とも対象が非移動状態', true), b('titiTargetSleeping', '対象が睡眠中', true),
    b('titiTargetOtherwiseInvulnerable', '対象に睡眠以外の無敵・ステルス・選択不能がある'), n('selfHpPercent', '自身のHP（%）', 100, 0, 100)],
    traitNotes: [eventScope, '直接攻撃、睡眠中の毎秒値、睡眠終了時の一撃を分離する。睡眠中の撃破や自身の退場時には睡眠終了ダメージを発生させない。'] }),

  // Iana's hologram is the dollkeeper BODY; the attacking form retains her own stats.
  operator('char_4124_iana', [
    [1, action('交代時の爆発1回', k('atk_scale'), { actions: [{ label: '交代時の爆発', role: 'MAIN', damageType: 'PHYSICAL', scale: k('atk_scale') }], periodTotal: period(eventScope) })],
    [2, normal({ label: '特殊な身替り形態の攻撃', aspd: k('attack_speed'), periodTotal: period('特殊形態10秒の現在状態。素質の脆弱8秒の失効や交代前後を合算しません。') })],
  ], [talent(0, 'ジェミニ・レプリケーター', v => [effect('attacker-fragile', 'damage_scale', { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('damage_scale') },
    { target: enemyTarget, condition: eq('ianaTargetMarked', true) }), status('hologram', 'ホログラムは攻撃せず、被撃で交代'), status('reveal', 'ホログラムを攻撃した敵のステルスを無効化')], ['DAMAGE', 'STATUS'])],
  { inputs: [b('ianaTargetMarked', '対象が素質の脆弱中'), b('ianaAttackBuffActive', 'S2の攻撃速度強化が有効', true)],
    traitNotes: ['交代後の形態を評価する。脆弱ありはホログラムを攻撃した1体のみ。脆弱なしではそれ以外の敵の同条件群を指定する。'] }),

  operator('char_1033_swire2', [
    [1, [swirePhase('ATTACK', swireNormal()), swirePhase('HEAL', noDamage('コインを使う治療行動'))],
      [select('swirePhase', '計算対象', [['ATTACK', '治療へ置換されない通常攻撃'], ['HEAL', 'コインを使う治療行動']])]],
    [2, [swirePhase('ATTACK', swireNormal()), swirePhase('BOMB', normal({ label: 'シャンパン爆弾1個', kind: 'SKILL_ACTION', maxTargets: 1,
      actions: [{ label: 'シャンパン爆弾', role: 'MAIN', damageType: 'PHYSICAL', basis: 'ATK_STAT', scale: k('atk_scale'), hits: choose('swireBombMature', true, 2, 1) }], periodTotal: period(eventScope) })),
      swirePhase('CHANGED', pending('爆弾設置後に攻撃力が変化', '設置から爆発までに攻撃力が変わる場合の参照時点は未確認です。', ['スキル', '素質1']))],
      [select('swirePhase', '計算対象', [['ATTACK', '通常攻撃1回'], ['BOMB', '攻撃力が変わらない爆弾1個'], ['CHANGED', '設置後に攻撃力が変わった爆弾']]), b('swireBombMature', '爆弾が設置から3秒以上経過', true)]],
    [3, [swirePhase('ATTACK', normal({ actions: [{ label: '通常攻撃の2連撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1, hits: 2 }], periodTotal: period(eventScope) })),
      swirePhase('COIN', normal({ label: '終了時のコイン1発（攻撃強化なし）', kind: 'SKILL_ACTION', maxTargets: 1,
        actions: [{ label: 'コイン1発', role: 'MAIN', damageType: 'PHYSICAL', basis: 'ATK_STAT', scale: k('atk_scale') }], periodTotal: period(eventScope) })),
      swirePhase('COIN_BUFF', pending('攻撃強化中のコイン', 'スキル停止時の攻撃強化解除とコイン攻撃の参照順は未確認です。', ['スキル', '素質1']))],
      [select('swirePhase', '計算対象', [['ATTACK', 'スキル中の通常攻撃'], ['COIN', '攻撃強化なしのコイン1発'], ['COIN_BUFF', '攻撃強化中のコイン']])]],
  ], [talent(0, '経済循環', v => {
    if (v.read('max_stack_cnt') !== 8) v.issue('攻撃力強化の累積上限が8回と一致しません。')
    return [effect('coin-attack', 'atk / max_stack_cnt', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: mul(v.read('atk'), metric('swireAttackStacks')) }),
      status('coin-resource', '発動時と特性のコスト消費時にコインを獲得')]
  }, ['DAMAGE', 'RESOURCE']), talent(1, '財あれば憂いなし', () => [status('survival', '致命傷時にコストを消費してHPを回復')], ['SURVIVAL'])],
  { inputs: [n('swireAttackStacks', '経済循環の攻撃強化回数', 0, 0, 8)], traitNotes: ['設置と爆発の間で攻撃力が変わらない爆弾1個、またはコイン1発を評価する。爆弾やコインを通常攻撃へ合算しない。'] }),

  operator('char_4143_sensi', [
    [1, [phase('senshiPhase', 'ATTACK', normal({ label: '調理後の通常攻撃', atk: choose('senshiBuff', 'ATK', k('atk')), aspd: choose('senshiBuff', 'ASPD', k('attack_speed')), periodTotal: period(eventScope) })),
      phase('senshiPhase', 'COOKING', noDamage('調理中（攻撃停止）')), phase('senshiPhase', 'HEAL', noDamage('調理終了の治療行動'))],
      [select('senshiPhase', '計算対象', [['ATTACK', '調理後の通常攻撃'], ['COOKING', '調理中'], ['HEAL', '調理終了の治療']]),
        select('senshiBuff', '自身に付与済みの料理効果', [['NONE', 'なし'], ['ATK', '攻撃力'], ['ASPD', '攻撃速度'], ['HP', '最大HP']])]],
  ], [talent(0, '魔物食歴10年', () => [status('defense', '防御力上昇'), status('heal', '自身によるHP治療効果上昇')], ['SURVIVAL'])],
  { traitNotes: ['調理完了後に自身へ実際に付与された料理の種類を選択する。3種類の確率を推測した平均値や調理込みの時間合計は計算しない。'],
    deferredSkills: [{ skillIndex: 2, reason: '調理による攻撃停止と治療・味方支援のみを行うため、既存の対象外（NOT_APPLICABLE）登録を使用する。未確認の攻撃効果はない。' }] }),

  operator('char_4194_rmixer', [
    [1, normal({ label: '強化3連撃', kind: 'NEXT_ATTACK', actions: [{ label: '強化3連撃', role: 'MAIN', damageType: 'PHYSICAL', scale: k('atk_scale'), hits: 3 }], periodTotal: period(eventScope) })],
    [2, normal({ atk: k('atk'), periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '被致命傷による弾薬消費と攻撃速度強化の時間推移は計算しません。' } })],
    [3, normal({ label: '被撃による反撃1回', kind: 'SKILL_ACTION', atk: k('atk'), maxTargets: k('attack@max_target'),
      dpsUnsupportedReason: '被撃時の反撃1回。最小間隔は実際の反撃頻度を表しません。', periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '被撃回数と反撃の時間推移は計算しません。' } })],
  ], [talent(0, '歓迎の儀・掃射', v => {
    if (v.read('max_stack_cnt') !== 3) v.issue('掃射の累積上限が3回と一致しません。')
    return [effect('damage-stack-speed', 'attack_speed / max_stack_cnt', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: mul(v.read('attack_speed'), metric('mixerDamageStacks')) }),
      status('damage-stack-defense', 'ダメージ時に防御力を強化')]
  }, ['ABILITY', 'SURVIVAL']), talent(1, '見送りの儀・盾を構えて', () => [status('barrier', '通常攻撃しない時間に応じてバリアを獲得')], ['SURVIVAL'])],
  { inputs: [n('mixerDamageStacks', '掃射の強化回数', 3, 0, 3)], traitNotes: ['現在の強化回数を固定して本人の1攻撃を評価する。味方への給弾によるダメージと反撃の発生頻度は加算しない。'] }),
]

for (const definition of EXPANDED_SPECIAL_DEFINITIONS) for (const recipe of definition.recipes) {
  if (definition.operatorId === 'char_4056_titi') recipe.conditionRequirements = [
    { condition: { input: 'titiTargetOtherwiseInvulnerable', comparison: 'EQ', value: false }, reason: '睡眠以外の無敵・ステルス・選択不能がない対象を指定してください。' },
    { when: { input: 'titiPhase', comparison: 'EQ', value: 'ATTACK' }, condition: { input: 'titiTargetNonMoving', comparison: 'EQ', value: true }, reason: '命中前後とも非移動状態の対象を指定してください。移動中から睡眠への変化は未対応です。' },
    { when: { input: 'titiPhase', comparison: 'EQ', value: 'DOT' }, condition: { input: 'titiTargetSleeping', comparison: 'EQ', value: true }, reason: '睡眠中の敵を指定してください。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_4124_iana') recipe.conditionRequirements = [
    { when: { input: 'ianaTargetMarked', comparison: 'EQ', value: true }, condition: { input: 'actualAttackTargetCount', comparison: 'EQ', value: 1 }, reason: '素質の脆弱が付く攻撃者は1体です。ほかの敵は脆弱なしの対象群として別に評価してください。' },
    ...(recipe.skillIndex === 2 ? [{ condition: { input: 'ianaAttackBuffActive', comparison: 'EQ' as const, value: true }, reason: 'S2の攻撃速度強化が有効な特殊身替り形態を指定してください。' }] : []),
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_1033_swire2' && recipe.skillIndex === 3) recipe.conditionRequirements = [
    { when: { input: 'swirePhase', comparison: 'EQ', value: 'COIN' }, condition: { input: 'swireAttackStacks', comparison: 'EQ', value: 0 }, reason: 'コイン1発はスキル停止前後とも攻撃強化が0回の条件のみ確認済みです。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
}
