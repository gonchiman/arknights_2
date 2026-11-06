import sources from '../data/expandedElementalSources.json' with { type: 'json' }
import { EXPANDED_ELEMENTAL_EVENT_DEFINITIONS } from './expandedElementalEventDefinitions.ts'
import { EXPANDED_TRAGODIA_DEFINITIONS } from './expandedTragodiaDefinitions.ts'
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardElementalBuildup, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue } from './combatEffectStructure.ts'

const key = (key: string): GuardValue => ({ key })
const choice = (input: string, value: string | boolean, yes: GuardValue, no: GuardValue = 0): GuardValue =>
  ({ op: 'if', input, comparison: 'EQ', value, yes, no })
const eq = (metric: string, value: string | boolean): CombatCondition => ({ type: 'COMPARE', metric, comparison: 'EQ', value })
const yes = (condition: CombatCondition, whenTrue: CombatNumericValue, whenFalse: CombatNumericValue): CombatNumericValue =>
  ({ type: 'CONDITIONAL', condition, whenTrue, whenFalse })
const select = (key: string, label: string, options: [string, string][]): GuardInput => ({ key, label, kind: 'select',
  defaultValue: options[0][0], options: options.map(([value, label]) => ({ value, label })) })
const bool = (key: string, label: string): GuardInput => ({ key, label, kind: 'boolean', defaultValue: false })
type Payload<T> = T extends CombatEffectContext ? Omit<T, keyof CombatEffectContext> : never
const effect = (id: string, sourceBinding: string, payload: Payload<TalentStructureEffect>, context: Partial<CombatEffectContext> = {}): TalentStructureEffect => ({
  id, sourceBinding, timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
  target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true,
    factionIds: [], tagIds: [], selection: { type: 'ALL' } },
  probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [],
  ...payload, ...context,
}) as TalentStructureEffect
const talent = (name: string, effects: ExpandedTalentDefinition['effects'], categories: ExpandedTalentDefinition['categories'] = ['DAMAGE']): ExpandedTalentDefinition =>
  ({ talentIndex: 0, name, prefabKey: '1', categories, effects })
const attack = (damageType: 'PHYSICAL' | 'ARTS'): GuardDamageAction => ({ label: damageType === 'PHYSICAL' ? '物理攻撃' : '術攻撃', role: 'MAIN', damageType, scale: 1 })
const elemental = (label: string, elementId: string, scale: GuardValue, role: 'MAIN' | 'ADDITIONAL' = 'ADDITIONAL'): GuardDamageAction =>
  ({ label, role, damageType: 'ELEMENTAL', damageKind: { type: 'ELEMENTAL_DAMAGE', elementId }, scale,
    ...(role === 'ADDITIONAL' ? { basis: 'ATK_STAT' } : {}) })
const fixedState = '選択した爆発状態での攻撃を評価します。元素ゲージ・爆発開始と終了の時刻・他者による爆発ダメージは加算しません。'
const normal = (actions: GuardDamageAction[], options: Partial<GuardStage> = {}): GuardStage =>
  ({ id: 'active', label: 'スキル中', kind: 'NORMAL', actions, ...options })
const definition = (operatorId: string, stages: GuardStage[], inputs: GuardInput[], talents: ExpandedTalentDefinition[], notes: string[] = [],
  conditionRequirements?: GuardSkillRecipe['conditionRequirements']): ExpandedOperatorDefinition => {
  const source = sources.find(source => source.operatorId === operatorId)!, skill = source.skills[0]
  return { operatorId, phaseIndex: source.phaseIndex, skillLevelIndex: source.skillLevelIndex, inputs, talents, traitNotes: notes,
    recipes: [{ operatorId, skillIndex: skill.skillIndex, inputs, conditionRequirements, stages: stages.map(stage => ({ ...stage,
      duration: stage.duration ?? skill.raw.duration })), notes }] }
}
const necrosis = select('targetNecrosisState', '対象の壊死状態', [['NONE', '爆発効果なし'], ['BURST', '爆発効果中']])
const burn = select('targetBurnState', '対象の灼熱状態', [['NONE', '爆発効果なし'], ['BURST', '爆発効果中']])
const neural = select('targetNeuralState', '対象の神経状態', [['NONE', '爆発効果なし'], ['BURST', '爆発効果中']])
const warmyPhase = select('warmyPhase', '評価する状態', [['NORMAL', '通常発動'], ['OVERCHARGE', 'オーバーチャージ'], ['BURST_EVENT', '素質の爆発開始1回']])

const INITIAL_ELEMENTAL_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  definition('char_4225_tanya', [normal([attack('PHYSICAL')])], [], [talent('粗悪溶剤耐性', v => {
    v.read('ep_damage_resistance[other]'); v.read('ep_damage_resistance[water]')
    return [effect('elemental-intake', 'ep_damage_resistance[other] / ep_damage_resistance[water]',
      { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: '自身が受ける元素損傷を軽減' }),
    ]
  }, ['SURVIVAL'])]),
  definition('char_4148_philae', [normal([attack('PHYSICAL')])], [], [talent('神河の使い', v => {
    v.read('damage_resistance')
    return [
    effect('elemental-intake', 'damage_resistance', { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: '自身が受ける元素損傷を軽減' }),
    effect('sp', 'sp', { item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('sp') },
      { timing: { type: 'EVENT', event: 'DAMAGE_RECEIVED' }, condition: eq('receivedNecrosisBuildup', true), lifetime: { type: 'CURRENT_EVENT' } }),
    ]
  }, ['SURVIVAL', 'RESOURCE'])]),
  definition('char_499_kaitou', [normal([attack('ARTS'), elemental('爆発効果中への追加元素ダメージ', 'necrosis',
    choice(necrosis.key, 'BURST', key('attack@extra_ep_damage_scale')))], { aspd: key('attack_speed'), maxTargets: 2,
      periodTotal: { kind: 'UNSUPPORTED', reason: fixedState } })],
  [necrosis, bool('otherNecrosisBurstInRange', '範囲内の他の敵が壊死爆発効果中')], [talent('予告状', v => [
    effect('attack', 'atk', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: yes({ type: 'ANY',
      conditions: [{ type: 'ALL', conditions: [{ type: 'COMPARE', metric: 'skillIndex', comparison: 'EQ', value: 2 }, eq(necrosis.key, 'BURST')] },
        { type: 'ALL', conditions: [{ type: 'COMPARE', metric: 'skillIndex', comparison: 'EQ', value: 1 }, eq('targetElementalBurst', 'NECROSIS')] },
        eq('otherNecrosisBurstInRange', true)] }, v.read('atk'), 0) }),
  ])], [fixedState, '選択した全対象が同じ壊死状態。対象が爆発効果中なら、自身の攻撃力上昇条件も成立する。']),
  definition('char_4081_warmy', [
    normal([attack('ARTS')], { id: 'normal', label: '通常発動', when: { input: warmyPhase.key, comparison: 'EQ', value: 'NORMAL' },
      atk: key('atk'), intervalAdd: key('base_attack_time'), maxTargets: 2, resistanceReductionFixed: choice(burn.key, 'BURST', 20),
      periodTotal: { kind: 'UNSUPPORTED', reason: fixedState } }),
    normal([attack('ARTS'), elemental('灼熱爆発効果中への追加元素ダメージ', 'burn', choice(burn.key, 'BURST', key('attack@ep_damage_scale')))],
      { id: 'overcharge', label: 'オーバーチャージ', when: { input: warmyPhase.key, comparison: 'EQ', value: 'OVERCHARGE' },
        atk: key('atk'), intervalAdd: key('base_attack_time'), maxTargets: 3, duration: key('enhanced_duration'),
        resistanceReductionFixed: choice(burn.key, 'BURST', 20), periodTotal: { kind: 'UNSUPPORTED', reason: fixedState } }),
    normal([], { id: 'burst-event', label: '素質の爆発開始1回', kind: 'SKILL_ACTION',
      when: { input: warmyPhase.key, comparison: 'EQ', value: 'BURST_EVENT' }, atk: key('atk'), duration: 0, maxTargets: 1,
      periodTotal: { kind: 'UNSUPPORTED', reason: '外部の灼熱爆発開始に反応した素質1回。スキル全体の発生回数は計算しません。' } }),
  ], [warmyPhase, burn], [talent('吹きこぼれ', v => [effect('burst', 'ep_damage_scale',
    { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: v.read('ep_damage_scale'),
      damageType: 'ELEMENTAL', damageKind: { type: 'ELEMENTAL_DAMAGE', elementId: 'burn' }, basis: 'ATK_STAT', rate: 'PER_ATTACK', label: '灼熱爆発開始時の素質ダメージ' },
    { timing: { type: 'EVENT', event: 'ELEMENTAL_BURST' }, lifetime: { type: 'CURRENT_EVENT' }, condition: eq(warmyPhase.key, 'BURST_EVENT'),
      target: { type: 'RECIPIENTS', side: 'ENEMY', entity: 'UNIT', scope: 'ATTACK_RANGE', includeSelf: false,
        factionIds: [], tagIds: [], selection: { type: 'ALL' } } })])],
  [fixedState, '灼熱爆発効果中の術耐性低下20は適用済み。素質300%は爆発開始1回の別イベントで、各通常攻撃には加算しない。'],
  [{ when: { input: warmyPhase.key, comparison: 'EQ', value: 'BURST_EVENT' }, condition: { input: burn.key, comparison: 'EQ', value: 'BURST' },
    reason: '爆発開始イベントでは対象の灼熱状態を爆発効果中にしてください。' }]),
  definition('char_4187_graceb', [
    normal([{ ...attack('PHYSICAL'), scale: key('atk_scale'), hits: 3 }], { id: 'physical', label: '神経爆発効果なし', kind: 'SKILL_ACTION',
      when: { input: neural.key, comparison: 'EQ', value: 'NONE' }, maxTargets: key('max_target'), duration: 0 }),
    normal([{ ...elemental('神経爆発効果中への元素3連撃', 'neural', key('atk_scale'), 'MAIN'), hits: 3 }],
      { id: 'elemental', label: '神経爆発効果中', kind: 'SKILL_ACTION', when: { input: neural.key, comparison: 'EQ', value: 'BURST' },
        maxTargets: key('max_target'), duration: 0, traitOverrides: ['DAMAGE_TYPE'] }),
  ], [neural, bool('neuralBurstEnemyDefeated', '神経爆発効果中の敵を撃破済み')], [talent('機に乗じた哀れみ', v => [
    effect('attack', 'atk / atk_bonus', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
      value: yes(eq('neuralBurstEnemyDefeated', true), v.read('atk_bonus'), v.read('atk')) }),
  ])], ['対象全員が同じ神経状態。素質の攻撃力上昇は10%から15%への変更で、合計25%にしない。',
    '仮想属性は主攻撃の3連撃を物理または術へ変更する。元素爆発そのものの6000ダメージは含めない。']),
]

const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const numberInput = (key: string, label: string, max: number, defaultValue = 0): GuardInput =>
  ({ key, label, kind: 'number', defaultValue, min: 0, max, step: 1 })
const singleApplication = '対象全員が同じ爆発状態・残り元素値での1回。元素損傷はHPダメージへ加算せず、爆発開始を含む場合は計算を停止します。'
const corrosionCount = numberInput('previousCorrosionBursts', '対象の過去の侵蝕爆発回数', 100)
const noCrossing: GuardStage['periodTotal'] = { kind: 'UNSUPPORTED', reason: '元素ゲージ・爆発開始と終了の時間変化は未対応です。' }
const buildup = (elementId: string, scale: GuardValue, basis: GuardElementalBuildup['basis'] = { type: 'ATK_STAT' },
  id = 'skill'): GuardElementalBuildup => ({ id, label: `${{ necrosis: '壊死', burn: '灼熱', neural: '神経', corrosion: '侵蝕' }[elementId]}損傷`,
    damageKind: { type: 'ELEMENTAL_BUILDUP', elementId }, scale, basis })
const main = (type: 'PHYSICAL' | 'ARTS', options: Partial<GuardDamageAction> = {}): GuardDamageAction =>
  ({ ...attack(type), id: 'main', ...options })
function applicationStage(actions: GuardDamageAction[], elementalBuildups: GuardElementalBuildup[], options: Partial<GuardStage> = {}): GuardStage {
  return normal(actions, { elementalBuildups, periodTotal: noCrossing,
    resistanceReductionFixed: choice('targetElementalBurst', 'BURN', 20),
    defenseReductionFixed: mul(120, { input: corrosionCount.key }), ...options })
}
function recipe(operatorId: string, skillIndex: number, stages: GuardStage[], inputs: GuardInput[] = []): GuardSkillRecipe {
  const raw = sources.find(source => source.operatorId === operatorId)!.skills.find(skill => skill.skillIndex === skillIndex)!.raw
  return { operatorId, skillIndex, inputs: [...inputs, corrosionCount], notes: [singleApplication],
    conditionRequirements: [{ when: { input: 'targetElementalBurst', comparison: 'EQ', value: 'CORROSION' },
      condition: { input: corrosionCount.key, comparison: 'GTE', value: 1 }, reason: '侵蝕爆発効果中は過去の侵蝕爆発回数を1以上にしてください。' }],
    stages: stages.map(stage => ({ ...stage, duration: stage.duration ?? raw.duration })) }
}
const th = 'char_4102_threye', bo = 'char_4223_botany'
const is4 = bool('inExplorersSilverfrost', '探索者と銀氷の果て')
const botanyStacks = numberInput('corrosionBurstsInRange', '範囲内の侵蝕爆発による累積数', 3)
const botanyGauge = select('botanyGaugeKind', '対象の最大元素値', [['NORMAL', '1000（通常・エリート）'], ['BOSS', '2000（ボス）']])
const botanyFresh = (yes: GuardValue): GuardValue => choice('targetElementalBurst', 'NONE', choice(botanyGauge.key, 'NORMAL',
  { op: 'if', input: 'elementalGaugeRemaining', comparison: 'EQ', value: 1000, yes, no: 0 },
  { op: 'if', input: 'elementalGaugeRemaining', comparison: 'EQ', value: 2000, yes, no: 0 }))
const NEW_ELEMENTAL_DEFINITIONS: ExpandedOperatorDefinition[] = [
  { operatorId: th, phaseIndex: 2, skillLevelIndex: 9, inputs: [is4], talents: [
    { talentIndex: 0, name: '開示する者', prefabKey: '2', categories: ['DAMAGE'], effects: v => [
      effect('necrosis-buildup', 'ep_damage_ratio', { item: 'ELEMENTAL_BUILDUP', operation: 'APPLY_ELEMENTAL_BUILDUP', unit: 'MULTIPLIER',
        value: v.read('ep_damage_ratio'), basis: 'ATK_STAT', damageKind: { type: 'ELEMENTAL_BUILDUP', elementId: 'necrosis' } },
        { condition: eq(is4.key, true), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' },
          target: { type: 'RECIPIENTS', side: 'ENEMY', entity: 'UNIT', scope: 'ATTACK_TARGET', includeSelf: false,
            factionIds: [], tagIds: [], selection: { type: 'ALL' } } }),
    ] },
    { talentIndex: 1, name: '世捨て人', prefabKey: '1', categories: ['ABILITY'], effects: v => [
      effect('attack', 'atk', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('atk') }),
      effect('speed', 'attack_speed', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('attack_speed') }),
    ] },
  ], recipes: [
    recipe(th, 1, [applicationStage([main('ARTS', { scale: key('atk_scale') })], [buildup('necrosis', key('ep_damage_ratio'))], { kind: 'NEXT_ATTACK' })], [is4]),
    recipe(th, 2, [applicationStage([main('ARTS')], [buildup('necrosis', key('attack@ep_damage_ratio'))], { aspd: key('attack_speed'), maxTargets: 2 })], [is4]),
  ] },
  { operatorId: bo, phaseIndex: 2, skillLevelIndex: 9, inputs: [botanyStacks], talents: [talent('声を上げる勇気', v => {
    if (v.read('max_stack_cnt') !== botanyStacks.max) v.issue('確認済みの侵蝕爆発による累積上限と一致しません。')
    return [effect('speed', 'attack_speed / max_stack_cnt', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT',
      value: { type: 'CALC', operation: 'MULTIPLY', values: [v.read('attack_speed'), { type: 'METRIC', metric: botanyStacks.key }] } })]
  }, ['ABILITY'])], recipes: [recipe(bo, 2, [applicationStage([main('ARTS'),
    { label: '追加物理ダメージ', role: 'ADDITIONAL', damageType: 'PHYSICAL', scale: key('attack@extra_atk_scale'), traitOverrides: ['DAMAGE_TYPE'] }],
    [buildup('corrosion', key('attack@ep_damage_ratio'))], { maxTargets: key('attack@max_target') })], [botanyStacks]),
    recipe(bo, 1, [applicationStage([
      { label: '侵蝕元素値満タン時の先行追加術', role: 'ADDITIONAL', damageType: 'ARTS', scale: botanyFresh(key('botany_s1_extra.atk_scale')) },
      main('ARTS', { scale: key('atk_scale') }),
    ], [{ ...buildup('corrosion', botanyFresh(key('botany_s1_extra.ep_damage_ratio')), { type: 'ATK_STAT' }, 'fresh-target'), label: '先行追加の侵蝕損傷' },
      { ...buildup('corrosion', key('ep_damage_ratio')), label: '主攻撃の侵蝕損傷' }], { kind: 'NEXT_ATTACK',
      notes: ['追加術・追加侵蝕が主攻撃より先。侵蝕元素値満タンかつ全元素爆発効果なしの場合のみ追加する。https://prts.wiki/w/伯塔尼'] })], [botanyStacks, botanyGauge])],
    traitNotes: ['爆発回復速度25%上昇は爆発効果の経過時間に作用し、1攻撃には適用しない。'] },
]
const extraRecipes: GuardSkillRecipe[] = [
  recipe('char_4148_philae', 2, [applicationStage([main('ARTS', { scale: key('atk_scale') })], [buildup('necrosis', key('ep_damage_ratio'))],
    { id: 'counter', label: '発動可能な反撃1回', kind: 'SKILL_ACTION', traitOverrides: ['DAMAGE_TYPE'], maxTargets: null,
      atk: choice('selfElementalDamageReceived', true, key('atk')), duration: 0,
      notes: ['通常攻撃停止中。2秒の再発動制限を満たした反撃1回を計算し、敵の攻撃頻度からDPSを推定しない。'] })],
    [bool('selfElementalDamageReceived', 'スキル中に元素損傷を受けた')]),
  recipe('char_4225_tanya', 2, [
    applicationStage([], [buildup('corrosion', key('ep_damage_ratio'))], { id: 'response', label: '防御効果を1回消費', kind: 'SKILL_ACTION',
      when: { input: 'crackboneAction', comparison: 'EQ', value: 'RESPONSE' }, maxTargets: null, duration: 0 }),
    applicationStage([main('PHYSICAL')], [], { id: 'normal', label: '通常攻撃1回',
      when: { input: 'crackboneAction', comparison: 'EQ', value: 'ATTACK' } }),
  ], [select('crackboneAction', '評価する行動', [['RESPONSE', '被ダメージ時の元素損傷'], ['ATTACK', '通常攻撃']]),
    { ...numberInput('crackboneStacks', '防御効果の残り回数', 5, 5), min: 1 }]),
  recipe('char_499_kaitou', 1, [applicationStage([main('ARTS'), elemental('壊死爆発効果中への追加元素ダメージ', 'necrosis',
    choice('targetElementalBurst', 'NECROSIS', key('attack@extra_ep_damage_scale')))],
    [buildup('necrosis', key('attack@ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main', damageType: 'ARTS' })], { atk: key('atk') })],
    [bool('otherNecrosisBurstInRange', '範囲内の他の敵が壊死爆発効果中')]),
  recipe('char_4081_warmy', 1, [
    applicationStage([main('ARTS')], [buildup('burn', key('attack@ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main', damageType: 'ARTS' })],
      { when: { input: warmyPhase.key, comparison: 'EQ', value: 'NORMAL' }, aspd: key('attack_speed') }),
    applicationStage([], [], { id: 'burst-event', label: '素質の爆発開始1回', kind: 'SKILL_ACTION',
      when: { input: warmyPhase.key, comparison: 'EQ', value: 'BURST_EVENT' }, duration: 0,
      notes: ['外部の灼熱爆発開始に反応した素質1回。通常攻撃による爆発越境とは別のイベント。'] }),
  ], [select(warmyPhase.key, warmyPhase.label, [['NORMAL', '通常攻撃'], ['BURST_EVENT', '素質の爆発開始1回']])]),
  recipe('char_4187_graceb', 1, [applicationStage([main('PHYSICAL', { scale: key('attack@atk_scale'), hits: 2 })],
    [buildup('neural', key('ep_damage_ratio'), { type: 'DEALT_DAMAGE', actionId: 'main' })], { traitOverrides: ['HIT_COUNT'] })],
    [bool('neuralBurstEnemyDefeated', '神経爆発効果中の敵を撃破済み')]),
]
extraRecipes.find(recipe => recipe.operatorId === 'char_4081_warmy')!.conditionRequirements = [
  ...extraRecipes.find(recipe => recipe.operatorId === 'char_4081_warmy')!.conditionRequirements!,
  { when: { input: warmyPhase.key, comparison: 'EQ', value: 'BURST_EVENT' },
    condition: { input: 'targetElementalBurst', comparison: 'EQ', value: 'BURN' }, reason: '素質の爆発開始は対象が灼熱爆発効果中の場合のみ計算できます。' },
]
const botanyFirst = NEW_ELEMENTAL_DEFINITIONS.find(definition => definition.operatorId === bo)!.recipes.find(recipe => recipe.skillIndex === 1)!
botanyFirst.conditionRequirements = [...botanyFirst.conditionRequirements!,
  ...(['NORMAL', 'BOSS'] as const).map(kind => ({ when: { input: botanyGauge.key, comparison: 'EQ' as const, value: kind },
    condition: { input: 'elementalGaugeRemaining', comparison: 'LTE' as const, value: kind === 'NORMAL' ? 1000 : 2000 },
    reason: '残り元素値が選択した対象の最大元素値を超えています。' })),
]
export const EXPANDED_ELEMENTAL_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  ...INITIAL_ELEMENTAL_DEFINITIONS.map(definition => ({ ...definition,
    recipes: [...definition.recipes, ...extraRecipes.filter(recipe => recipe.operatorId === definition.operatorId)] })),
  ...NEW_ELEMENTAL_DEFINITIONS,
  ...EXPANDED_ELEMENTAL_EVENT_DEFINITIONS,
  ...EXPANDED_TRAGODIA_DEFINITIONS,
]
