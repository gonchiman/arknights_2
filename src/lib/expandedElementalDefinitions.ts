import sources from '../data/expandedElementalSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
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

export const EXPANDED_ELEMENTAL_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
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
      conditions: [eq(necrosis.key, 'BURST'), eq('otherNecrosisBurstInRange', true)] }, v.read('atk'), 0) }),
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
