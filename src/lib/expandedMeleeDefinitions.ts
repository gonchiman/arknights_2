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
const input = (input: string): GuardValue => ({ input })
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
const enemies: CombatRecipientSelector = { ...self, side: 'ENEMY', scope: 'ATTACK_TARGET', includeSelf: false }
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
const phaseInput = (options: readonly { value: string; label: string }[]): GuardInput => ({ key: 'damagePhase', label: '攻撃段階',
  kind: 'select', defaultValue: options[0].value, options })
const phase = (value: string) => ({ input: 'damagePhase', comparison: 'EQ', value }) as const
const counter = (b: B): E => effect('damage-received-counter', 'atk_scale', {
  item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: b.read('atk_scale'), damageType: A, rate: 'PER_ATTACK',
}, { timing: { type: 'EVENT', event: 'DAMAGE_RECEIVED' }, target: { ...enemies, scope: 'DAMAGE_SOURCE' }, lifetime: { type: 'CURRENT_EVENT' } })

/** A trap event is not an operator attack cycle. Normal shooting is a separate selection. */
function trapRecipe(skillIndex: number, trap: GuardStage, inputs: GuardInput[] = [], extraStages: GuardStage[] = [],
  normalOptions: Partial<GuardStage> = {}, notes: string[] = []): Omit<GuardSkillRecipe, 'operatorId'> {
  return { skillIndex, inputs: [phaseInput([{ value: 'trap', label: trap.label },
    { value: 'normal', label: '本人の通常射撃' }, ...extraStages.map(stage => ({ value: stage.id, label: stage.label }))]), ...inputs],
    stages: [{ ...trap, id: 'trap', when: phase('trap'), periodTotal: STATE_PERIOD },
      normal(P, { id: 'normal', label: '本人の通常射撃', when: phase('normal'), duration: 'UNTIL_EXIT', periodTotal: STATE_PERIOD, ...normalOptions }),
      ...extraStages.map(stage => ({ ...stage, when: phase(stage.id) }))],
    notes: ['罠は地上の対象への選択した発動1回。罠の配置・再使用間隔、本人の射撃は合算しない。', ...notes] }
}
const elaTargetState: GuardInput = { key: 'elaTargetState', label: '対象の状態', kind: 'select', defaultValue: 'GROUND', options: [
  { value: 'GROUND', label: '地上・罠効果なし' }, { value: 'MINE', label: '地上・罠効果中' }, { value: 'AIR', label: '空中・罠効果なし' },
] }
/** These values also remain in the validated talent structure; never infer a proc from skill text. */
function retainedTalentValue(suffix: string, talentIndex: number, key: string): number {
  const source = sources.find(source => source.operatorId.endsWith(`_${suffix}`))!
  const passive = getOperatorPassives(source.profile, source.phaseIndex, source.profile.phases[source.phaseIndex].maxLevel!, 1).sources
    .find(value => value.sourceKind === 'TALENT' && value.talentIndex === talentIndex)
  const value = passive?.blackboard.find(entry => entry.key === key)?.value
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Reviewed talent parameter missing: ${suffix}/${talentIndex}/${key}`)
  return value
}
const bagpipeActions = (skillScale: GuardValue = 1, hits: GuardValue = 1): GuardDamageAction[] => [
  attack(P, skillScale, hits, { label: '主対象への攻撃', targets: 1 }),
  // The second target is the same normal attack, so it also follows a virtual MAIN attribute.
  // Its proc multiplier is explicit; ATK_STAT prevents applying the critical branch a second time.
  attack(P, mul(skillScale, retainedTalentValue('bpipe', 0, 'atk_scale')), hits, {
    label: '精密装填による2体目への攻撃', basis: 'ATK_STAT', probability: retainedTalentValue('bpipe', 0, 'prob'),
    targets: add(input('actualAttackTargetCount'), -1),
  }),
]
const stolenTargets = (defaultValue = 0) => num('aliveStolenTargets', '命中前の窃取攻撃力の有効対象数', defaultValue, 0, 200)
function existingResistanceDebuff(skillIndex: number, stage: GuardStage, reason: string): Omit<GuardSkillRecipe, 'operatorId'> {
  return { skillIndex, inputs: [bool('existingResistanceDebuff', '全対象・全命中で既存の術耐性低下が有効', true)], stages: [
    { ...stage, when: { input: 'existingResistanceDebuff', comparison: 'EQ', value: true }, periodTotal: STATE_PERIOD },
    { ...stage, id: 'new-resistance-debuff', label: '術耐性低下の新規付与', when: { input: 'existingResistanceDebuff', comparison: 'EQ', value: false },
      periodTotal: STATE_PERIOD, unresolved: [reason] },
  ] }
}
const nonlethalInputs = (): GuardInput[] => [num('targetCurrentHp', '命中直前の各対象のHP', 10000, 1, 10000000, .1),
  bool('targetCriticallyWounded', '命中前から対象が重傷中')]
const nonlethalTalent: TalentOverride = { categories: ['DAMAGE', 'STATUS', 'RESOURCE'], effects: () => [
  effect('leave-one-hp', 'description:nonlethal', { item: 'DAMAGE_CAP_PER_TARGET', operation: 'SET', unit: 'POINT',
    value: calc('MAX', 0, calc('ADD', metric('targetCurrentHp'), -1)) }),
] }
const rejectWounded = { condition: { input: 'targetCriticallyWounded', comparison: 'EQ', value: false },
  reason: '通常攻撃では重傷状態の対象を選べません。' } as const

export const EXPANDED_MELEE_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  define('vulpis', [recipe(1, next(P, 1, 1, { actions: [attack(P),
    attack(A, k('extra_damage_ratio'), 1, { role: 'ADDITIONAL', label: 'S1の追加術ダメージ', basis: 'ATK_STAT' })] })),
    recipe(2, burst(A, k('atk_scale'), 1, { maxTargets: k('max_target') })),
    recipe(3, normal(P, { atk: k('atk'), aspd: input('currentSkillAttackSpeed'), maxTargets: 2, periodTotal: STATE_PERIOD }),
      [num('currentSkillAttackSpeed', '減衰後の現在の攻撃速度加算', 180, 0, 180)],
      ['攻撃速度の減衰を積分せず、選択した現在の攻撃間隔を表示する。対象は本人がブロックしている同条件の敵。'])],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('fox-hunt-extra', 'atk_scale',
      { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: b.read('atk_scale'),
        damageType: A, basis: 'ATK_STAT', rate: 'PER_ATTACK', label: '追跡者の追加術ダメージ' },
      { target: enemies, condition: condition('foxHuntAvailable', true), timing: { type: 'EVENT', event: 'DAMAGE_DEALT' },
        lifetime: { type: 'CURRENT_EVENT' }, restrictions: [{ type: 'EXCLUDE_MODIFIER', modifier: 'recursive_extra_attack' }] })],
      notes: ['初めてダメージを与える命中自身も素質の追加術が発生する。本人が与えた附加ダメージからは再発動しない。'] },
      1: { categories: ['SURVIVAL', 'RESOURCE'], effects: () => [] } },
    [bool('foxHuntAvailable', '全対象が初回命中か追跡者の10秒効果中', true)], {},
    ['初回・効果中は各主攻撃対象へ素質の30%術を1回だけ加算する。S1の290%追加術と素質自身の30%追加術は新たな素質発動元にしない。効果終了後の対象は入力を無効にする。',
      'https://prts.wiki/w/忍冬 の第一素質備考に基づき、初回命中・附加ダメージの非再帰を区別する。']),
  define('haak', [recipe(1, normal(P, { aspd: k('attack_speed'), periodTotal: FIXED_PERIOD })),
    ...[2, 3].map(skillIndex => recipe(skillIndex, normal(P, { label: '味方への15連射終了後の本人射撃',
      ...(skillIndex === 3 ? { atk: k('atk'), aspd: k('attack_speed') } : {}), periodTotal: STATE_PERIOD }), [],
      ['有効な味方へのスキル射撃が完了し、本人の強化が有効な段階。味方への500固定攻撃15発は敵へのダメージに加算しない。',
        '開始時の味方射撃・敵への攻撃再開時刻を含むスキル全体の総量は計算しない。']))],
    { 0: { categories: ['DAMAGE', 'SURVIVAL', 'STATUS'], effects: b => [critical(b, .25)],
      notes: ['混合薬物弾の4効果は同確率で排他的に選ばれ、ダメージを変える150%攻撃は25%。残り75%は通常の攻撃値。https://prts.wiki/w/阿 第一素質備考。'] } }),
  define('saga', [
    { skillIndex: 2, inputs: [phaseInput([{ value: 'impact', label: '強制撃破前の物理ダメージ1回' },
      { value: 'execution', label: '0.7秒後の強制撃破' }])],
      conditionRequirements: [{ when: { input: 'targetCriticallyWounded', comparison: 'EQ', value: true },
        condition: { input: 'targetCurrentHp', comparison: 'EQ', value: 1 }, reason: '既に重傷中の対象はHP1で指定してください。' }],
      stages: [burst(P, k('atk_scale'), 1, { id: 'impact', label: '強制撃破前の物理ダメージ1回', when: phase('impact'), maxTargets: 6, periodTotal: STATE_PERIOD }),
        burst(P, 0, 1, { id: 'execution', label: '0.7秒後の強制撃破', when: phase('execution'), maxTargets: 6, periodTotal: STATE_PERIOD,
          unresolved: ['0.7秒後の重傷対象の強制撃破は通常の追加ダメージではないため、ダメージ量へ換算しない。'] })],
      notes: ['S2は重傷済みの敵も選択できる。最初の400%物理には非致死上限を適用し、その後の強制撃破を分離する。チャージ3回を命中数にしない。'] },
    { skillIndex: 3, inputs: [phaseInput([{ value: 'first', label: '追加攻撃前の初撃のみ' }, { value: 'sequence', label: '追加攻撃を含む1攻撃' }])],
      conditionRequirements: [rejectWounded], stages: [
        normal(P, { id: 'first', label: '追加攻撃前の初撃のみ', when: phase('first'), atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: 2,
          dpsUnsupportedReason: '追加攻撃の条件判定とHP推移を含まない初撃のみ。連続DPSは計算しない。', periodTotal: STATE_PERIOD }),
        normal(P, { id: 'sequence', label: '追加攻撃を含む1攻撃', when: phase('sequence'), atk: k('atk'), maxTargets: 2,
          unresolved: ['初撃後のHP判定・追加攻撃・重傷による対象外化の順序を含む連続処理は未対応。独立した初撃のみ計算する。'] }),
      ], notes: ['選択対象が本人にブロックされ、初撃直前は重傷ではない条件。初撃と追加攻撃を1命中に合算して上限を適用しない。'] },
  ], { 0: nonlethalTalent }, nonlethalInputs(), { 1: '瞬間的なコスト回復のみで、直接ダメージの対象外。' },
    ['非致死のHP1残しは本人の全ダメージに適用する。対象ごとの軽減後ダメージを現在HP−1で制限する。命中後のHP変化、重傷の自然死亡、SP回復は数値へ加算しない。']),
  define('lolxh', [
    { skillIndex: 1, inputs: [phaseInput([{ value: 'changed', label: '切替後の近接攻撃1回' }, { value: 'initial', label: '初期状態の攻撃1回' }]), distance],
      conditionRequirements: [rejectWounded], stages: [
        normal(P, { id: 'changed', label: '切替後の近接攻撃1回', when: phase('changed'), aspd: k('attack_speed'),
          attackTreatment: 'MELEE', maxTargets: 2, duration: 'UNTIL_EXIT', periodTotal: STATE_PERIOD }),
        normal(P, { id: 'initial', label: '初期状態の攻撃1回', when: phase('initial'), duration: 'UNTIL_EXIT', periodTotal: STATE_PERIOD }),
      ], notes: ['切替後は本人がブロックしている敵を最大2体まで攻撃し、遠距離80%補正を受けない。初期状態の遠距離攻撃には80%補正を適用する。'] },
    { skillIndex: 2, inputs: [phaseInput([{ value: 'first', label: '追加攻撃前の初撃のみ' },
      { value: 'extra', label: '成立済みの追加攻撃1命中' }, { value: 'sequence', label: '初撃と追加攻撃の合計' }]),
      bool('extraAttackTriggered', '50%未満の条件で追加攻撃が成立済み')],
      conditionRequirements: [rejectWounded, { when: phase('extra'), condition: { input: 'extraAttackTriggered', comparison: 'EQ', value: true },
        reason: '追加攻撃は対象HP50%未満の条件が成立した命中のみ指定してください。' }], stages: [
        normal(P, { id: 'first', label: '追加攻撃前の初撃のみ', when: phase('first'), atk: k('atk'), attackTreatment: 'MELEE', maxTargets: 2,
          dpsUnsupportedReason: '追加攻撃の条件判定とHP推移を含まない初撃のみ。連続DPSは計算しない。', periodTotal: STATE_PERIOD }),
        normal(P, { id: 'extra', label: '成立済みの追加攻撃1命中', when: phase('extra'), atk: k('atk'), attackTreatment: 'MELEE', maxTargets: 2,
          defenseIgnoreFixed: k('attack@def_penetrate_fixed'), dpsUnsupportedReason: '追加攻撃直前のHPから1命中のみ評価し、初撃との合計やDPSは計算しない。', periodTotal: STATE_PERIOD }),
        normal(P, { id: 'sequence', label: '初撃と追加攻撃の合計', when: phase('sequence'), atk: k('atk'), attackTreatment: 'MELEE', maxTargets: 2,
          unresolved: ['初撃後のHP判定・追加攻撃・重傷による対象外化の順序を含む連続処理は未対応。選択した1命中のみ計算する。'] }),
      ], notes: ['現在HPは選択した命中の直前の値。追加攻撃の200防御無視を初撃へ適用しない。主攻撃と同様に追加攻撃にも非致死上限を適用する。'] },
  ], { 0: nonlethalTalent }, nonlethalInputs(), {},
    ['本人の全ダメージにHP1を残す上限を適用する。重傷状態の対象を通常攻撃することはできない。命中ごとの対象HPが同じ場合だけ複数体を合計する。']),
  define('blitz', [{ skillIndex: 2, inputs: [phaseInput([{ value: 'normal', label: '発動後の通常射撃' },
    { value: 'activation', label: '発動時の一撃' }]), bool('targetStunned', '命中時の対象がスタン中', true)],
    stages: [normal(P, { id: 'normal', label: '発動後の通常射撃', when: phase('normal'), aspd: k('attack_speed'), periodTotal: STATE_PERIOD }),
      burst(P, k('atk_scale'), 1, { id: 'activation', label: '発動時の一撃', when: phase('activation'), maxTargets: 3,
        periodTotal: STATE_PERIOD, unresolved: ['発動時のダメージ・スタン付与・素質強化の適用順は未確認。発動後の通常射撃のみ計算する。'] })],
    notes: ['発動時にはブロック対象が必要。ここでは発動後の選択命中を評価し、発動時の一撃と7秒間の総量は合算しない。'] }],
    { 0: { categories: ['DAMAGE', 'ATTACK_BEHAVIOR'], effects: b => [
      scale(calc('MULTIPLY', b.read('atk_scale'), metric('skill.talent_scale')), 'atk_scale / skill.talent_scale', condition('targetStunned', true)),
    ] } }, [], { 1: 'スタン付与後に素質の160%攻撃倍率が通常攻撃へ適用される段階は未実装。直接ダメージの対象外としては扱わない。' }),
  define('tmoris', [1, 2].map(skillIndex => {
    const stage = skillIndex === 1
      ? burst(A, k('atk_scale'), k('times'), { maxTargets: null })
      : normal(A, { actions: [attack(A, k('attack@atk_scale'))], fixedAttackInterval: k('attack@interval'), maxTargets: null })
    return { skillIndex, inputs: [bool('existingSlowOrFear', '全対象・全命中で既存の足止めか恐怖の効果が有効', true)], stages: [
      { ...stage, when: { input: 'existingSlowOrFear', comparison: 'EQ', value: true }, periodTotal: STATE_PERIOD },
      { ...stage, id: 'changing-control', label: '状態の新規付与・変化中', when: { input: 'existingSlowOrFear', comparison: 'EQ', value: false },
        periodTotal: STATE_PERIOD, unresolved: ['確率足止めの新規付与・失効と各命中の順序を含む期待値は未対応。全命中で既存の足止めか恐怖の効果が有効な状態のみ計算する。'] },
    ], notes: ['本人もAve Mujicaの与ダメージ強化対象。地上の同条件の敵への選択した発動・命中を評価する。',
      'S1は1回の発動5連撃。チャージ・他メンバーによる再発動・Feverの連続発動を加算しない。S2は固定1秒周期で通常の物理攻撃を追加しない。',
      '足止め免疫・恐怖免疫は内部効果の扱いが異なるため、免疫の有無から与ダメージ強化の成立を自動推測しない。'] }
  }), { 0: CONTROL, 1: { categories: ['DAMAGE', 'RESOURCE'], effects: b => [
    damage(b.read('damage_scale'), 'damage_scale', condition('existingSlowOrFear', true)),
  ] } }),
  define('amoris', [1, 2].map(skillIndex => {
    const stage = normal(P, { label: skillIndex === 1 ? '既存脆弱中の3連撃' : '既存脆弱中の8連撃', maxTargets: 1,
      actions: [attack(P, k('attack@atk_scale_heavy'), skillIndex === 1 ? 1 : 2, { label: '強打' }),
        attack(P, k('attack@atk_scale_light'), skillIndex === 1 ? 2 : 6, { label: '軽打' })],
      dpsUnsupportedReason: '特殊連撃全体の周期は未確認。選択した1組の連撃ダメージのみ計算する。', periodTotal: STATE_PERIOD })
    return { skillIndex, inputs: [bool('existingVulnerability', '全命中で既存の8%脆弱が有効', true)], stages: [
      { ...stage, when: { input: 'existingVulnerability', comparison: 'EQ', value: true } },
      { ...stage, id: 'changing-vulnerability', label: '脆弱の新規付与・変化中',
        when: { input: 'existingVulnerability', comparison: 'EQ', value: false },
        unresolved: ['各ダメージ前に抽選される脆弱の新規付与・失効・更新を含む連撃の期待値は未対応。全命中で既存の8%脆弱が有効な状態のみ計算する。'] },
    ], notes: ['攻撃範囲内の攻撃可能な敵が1体だけで、その敵が連撃中ずっと生存する場合。S1は前方の攻撃対象、S2は各ランダム攻撃の唯一の対象とする。',
      '特性の範囲攻撃は主対象を重複攻撃しない。別対象への飛び火・複数対象の抽選・敵がいないマスへの攻撃・Feverの再発動は含めない。'] }
  }), { 0: { categories: ['DAMAGE', 'ATTACK_BEHAVIOR'], effects: b => [
    damage(b.read('damage_scale'), 'damage_scale', condition('existingVulnerability', true)),
  ] }, 1: { categories: ['ABILITY', 'RESOURCE'], effects: b => [atk(b.read('atk'))] } }),
  define('shu', [recipe(3, normal(P, { atk: add(k('atk'), choose('groundEnemyOnSownTile', true, k('e_atk'), 0)),
    aspd: choose('groundEnemyOnSownTile', true, k('e_attack_speed'), 0), periodTotal: STATE_PERIOD }),
    [bool('groundEnemyOnSownTile', '育種マス上に地上の敵がいる')])],
    { 1: { categories: ['ABILITY', 'RESOURCE'], effects: b => [
      atk(b.read('atk'), 'atk', condition('fourSuiInSquad', true)),
      speed(b.read('attack_speed'), 'attack_speed', condition('threeSameProfessionDeployed', true)),
    ] } }, [bool('fourSuiInSquad', '編成中の歳が4名以上'), bool('threeSameProfessionDeployed', '戦場の同じ職業の味方が3名以上')],
    { 1: '治療へ置き換わるスキルで、直接ダメージの対象外。', 2: '通常攻撃を治療へ置き換えるスキルで、直接ダメージの対象外。' },
    ['S3中の本人の通常攻撃を評価する。治療・加護・転移をダメージに換算しない。育種マスの追加強化と素質の編成・配置条件を個別に指定する。']),
  define('ayer', [recipe(1, next(A, k('atk_scale'), 1, { maxTargets: k('max_target'), attackTreatment: 'MELEE' })),
    recipe(2, normal(A, { maxTargets: null, attackTreatment: 'MELEE', periodTotal: FIXED_PERIOD, actions: [
      attack(A, k('attack@atk_scale'), 1, { label: '主対象への通常攻撃', targets: 1 }),
      attack(A, k('atk_scale'), 1, { label: 'ブロック対象への追加術攻撃', role: 'ADDITIONAL',
        targets: add(input('actualAttackTargetCount'), choose('mainTargetReceivesExtra', true, 0, -1)) }),
    ] }), [bool('mainTargetReceivesExtra', '主対象も追加術攻撃の対象', true)],
    ['対象数は主対象と追加攻撃を受ける敵の合計（重複を除く）。主対象以外は本人または周囲8マスの味方がブロックしている同条件の敵。本人の1攻撃につき追加攻撃1回。'])],
    { 0: ability(b => [speed(b.read('attack_speed'))]) }, [], {},
    ['S1とS2はいずれも遠距離80%補正を受けない。S2は自身がブロックしている敵も追加攻撃の対象。味方の攻撃回数は加算しない。']),
  define('bpipe', [recipe(1, normal(P, { atk: k('atk'), aspd: k('attack_speed'), maxTargets: 2,
    actions: bagpipeActions(), periodTotal: FIXED_PERIOD })),
    recipe(2, next(P, k('atk_scale'), 2, { maxTargets: 2, actions: bagpipeActions(k('atk_scale'), 2) })),
    recipe(3, normal(P, { atk: k('atk'), intervalScale: add(1, k('base_attack_time')), maxTargets: 2,
      actions: bagpipeActions(1, 3), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['DAMAGE', 'ATTACK_BEHAVIOR'], effects: b => {
      // The second-target action binds the retained coefficient and probability.
      // Reject live changes so its branch cannot disagree with the primary attack.
      for (const key of ['prob', 'atk_scale']) {
        if (b.read(key) !== retainedTalentValue('bpipe', 0, key))
          b.issue(`主対象と2体目の攻撃に使う確認済み素質値「${key}」が変更されています。`)
      }
      return [critical(b)]
    } }, 1: RESOURCE }, [], {},
    ['主対象1体と、素質発動時だけ攻撃する2体目を分けて軽減後の期待値を求める。対象は同じ防御・術耐性で、選択命中の間は生存している。連撃の回数を対象数やチャージ数に換算しない。']),
  define('ines', [
    { skillIndex: 1, inputs: [phaseInput([{ value: 'stable', label: '窃取済み・付与時から攻撃力一定' },
      { value: 'first', label: '初回窃取・攻撃力変化中' }]), stolenTargets(1)],
      conditionRequirements: [{ when: phase('stable'), condition: { input: 'aliveStolenTargets', comparison: 'GTE', value: 1 },
        reason: '窃取済みの生存対象を含むため、有効対象数は1体以上で指定してください。' }],
      stages: [next(P, 1, 1, { id: 'stable', label: '窃取済み・付与時から攻撃力一定', when: phase('stable'), periodTotal: STATE_PERIOD, actions: [
        attack(P), attack(A, k('bleed_atk_scale'), 1, { label: '付与済み継続ダメージ', role: 'ADDITIONAL', basis: 'ATK_STAT', timing: 'PER_SECOND' }),
      ] }), next(P, 1, 1, { id: 'first', label: '初回窃取・攻撃力変化中', when: phase('first'), periodTotal: STATE_PERIOD,
        unresolved: ['初回命中時の窃取と継続ダメージの攻撃力保存の順序、再付与時の保存値更新は未確認。窃取済みで付与時から攻撃力が一定の状態のみ計算する。'] })],
      notes: ['次の強化攻撃1回と、既に付与された継続効果の毎秒値を分ける。継続効果の付与時から有効な窃取対象数が同じ条件。3秒間の総量や通常攻撃を含むSP周期は計算しない。'] },
    recipe(2, normal(P, { atk: k('atk'), aspd: mul(k('attack@steal_atk_speed'), input('speedStealStacks')), periodTotal: STATE_PERIOD }),
      [stolenTargets(), num('speedStealStacks', '現在有効な攻撃速度窃取回数', 0, 0, 10)]),
    { skillIndex: 3, inputs: [phaseInput([{ value: 'normal', label: '再配置後の通常攻撃' },
      { value: 'first-shadow', label: '窃取前の影哨の初回命中' }, { value: 'changing-shadow', label: '攻撃力変化中の影哨の命中' }]), stolenTargets()],
      conditionRequirements: [{ when: phase('first-shadow'), condition: { input: 'aliveStolenTargets', comparison: 'EQ', value: 0 },
        reason: '窃取前の初回命中は、有効対象数0体で指定してください。' }],
      stages: [normal(P, { id: 'normal', label: '再配置後の通常攻撃', when: phase('normal'), atk: k('atk'), periodTotal: STATE_PERIOD }),
        burst(P, k('atk_scale'), 1, { id: 'first-shadow', label: '窃取前の影哨の初回命中', when: phase('first-shadow'), atk: k('atk'), periodTotal: STATE_PERIOD }),
        burst(P, k('atk_scale'), 1, { id: 'changing-shadow', label: '攻撃力変化中の影哨の命中', when: phase('changing-shadow'), atk: k('atk'), periodTotal: STATE_PERIOD,
          unresolved: ['影哨の連続衝突と素質の攻撃力加算・参照時刻を確認する必要がある。窃取前の最初の命中だけを計算する。'] })],
      notes: ['初回配置は影哨を残して離脱する非攻撃段階。数値は2回目以降の配置を対象とし、通常攻撃と影哨の命中を合算しない。影哨の初回命中前に本人が別の敵へダメージを与えていない条件。'] },
  ], { 0: { categories: ['ABILITY', 'STATUS'], effects: b => [effect('stolen-attack', 'steal_atk / steal_atk_max',
    { item: 'ATK_FINAL_FLAT', operation: 'ADD_VALUE', unit: 'POINT',
      value: calc('MIN', b.read('steal_atk_max'), calc('MULTIPLY', b.read('steal_atk'), metric('aliveStolenTargets'))) })] },
    1: CONTROL }, [], {}, ['窃取攻撃力は通常の攻撃力増加割合を適用した後に加算する。選択した命中で新たに得る窃取は、その命中の攻撃力へ先取りしない。']),
  define('aprot2', [existingResistanceDebuff(1, normal(A, { maxTargets: 3, intervalScale: add(1, k('base_attack_time')) }),
    '素質による術耐性低下の新規発動と命中の順序は未確認。既存の低下が有効なブロック対象への攻撃を計算する。'),
    existingResistanceDebuff(2, normal(A, { maxTargets: null, actions: [attack(A, k('attack@atk_scale'), k('attack@times'), { targets: 1 })] }),
      '連撃途中の素質発動による術耐性変化は未確認。選択した全対象・6命中で既存の低下が有効な状態のみ計算する。')],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('phantomIntegratedStrategies', true)),
      speed(b.read('attack_speed'), 'attack_speed', condition('phantomIntegratedStrategies', true))]),
      1: { categories: ['DAMAGE'], effects: b => [effect('existing-resistance-debuff', 'magic_resistance / duration',
        { item: 'RESISTANCE_REDUCTION_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: calc('MULTIPLY', -1, b.read('magic_resistance')) },
        { target: enemies, condition: condition('existingResistanceDebuff', true), lifetime: { type: 'FIXED_SECONDS', seconds: b.read('duration') } })] } },
    [bool('phantomIntegratedStrategies', 'ファントムと緋き貴石のステージ')], {},
    ['S1は本人がブロックしている敵を最大3体まで攻撃。S2は同じ防御・術耐性の敵に合計6発を配分した平均値。素質の発動率を低下率へ掛けず、既に有効な25%低下を適用する。HP減少と途中退場は時間積算しない。']),
  define('chiave', [existingResistanceDebuff(2, burst(A, k('atk_scale'), 1, { maxTargets: null, resistanceReductionRatio: mul(-1, k('magic_resistance')) }),
    '術耐性低下の新規付与と発動ダメージの適用順序は未確認。既に同スキルの低下が有効な対象への再発動のみ計算する。')],
    { 0: { categories: ['ABILITY', 'DEPLOYMENT'], effects: b => [atk(calc('MULTIPLY', b.read('atk'), metric('deployedRobotCount')), 'atk')] } },
    [num('deployedRobotCount', '配置中のロボット数', 0, 0, 8)], { 1: 'コスト回復のみを行うスキルで、直接ダメージの対象外。' },
    ['本人の発動ダメージだけを評価する。ロボットは固定データの8名を対象とし、テラ大陸調査団・U-Official・召喚物は含めない。再発動が可能なSP条件と既存の8秒間の術耐性低下を前提とする。']),
  define('franka', [recipe(1, normal(P, { atk: k('atk'), aspd: k('attack_speed'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('thermite-defense-ignore', 'prob',
      { item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: 1 },
      { timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' }, probability: {
        chance: { type: 'CONDITIONAL', condition: condition('skillIndex', 2),
          whenTrue: calc('MULTIPLY', b.read('prob'), metric('skill.talent_scale')), whenFalse: b.read('prob') },
        rollScope: 'APPLICATION',
      } })] } }),
  define('robin', [trapRecipe(1, burst(P, k('atk_scale'), 1, { label: '罠の発動1回' })),
    trapRecipe(2, burst(P, k('atk_scale'), 1, { label: '罠の発動1回' }), [], [], {}, MOVE_NOTE)], { 0: RESOURCE }),
  define('rfrost', [trapRecipe(1, burst(P, k('atk_scale'), 1, { label: '罠の発動1回' })),
    trapRecipe(2, burst(P, k('trap_atk_scale'), 1, { label: '罠1回と追撃', actions: [
      attack(P, k('trap_atk_scale'), 1, { label: 'ウェルカムマット' }),
      attack(P, k('atk_scale'), choose('targetInAttackRange', true, k('times'), 0), { role: 'ADDITIONAL', label: '本人の追加通常攻撃' }),
    ] }), [bool('targetInAttackRange', '罠の対象が本人の攻撃範囲内', true)])], { 0: RESOURCE }),
  define('wulfen', [trapRecipe(1, burst(P, k('atk_scale'), 1, { label: '罠1個の起爆', maxTargets: null })),
    trapRecipe(2, burst(P, k('atk_scale'), 2, { label: '既存の防御低下中・罠1個の起爆', maxTargets: null,
      defenseReductionRatio: mul(-1, k('def')) }), [bool('normalTargetDebuffActive', '本人射撃の対象に同スキルの防御低下')],
    [burst(P, k('atk_scale'), 2, { id: 'first-trap', label: '防御低下前・罠1個の起爆', maxTargets: null,
      unresolved: ['防御力低下の新規付与と2回のダメージの適用順序は未確認。既に低下が有効な命中のみ計算する。'] })],
    { defenseReductionRatio: choose('normalTargetDebuffActive', true, mul(-1, k('def')), 0) },
    ['同時に起爆する他の罠は含めず、対象がこの罠の2ヒットを受ける条件。'])], { 0: RESOURCE }),
  define('ela', [recipe(1, normal(P, { label: '本人の通常射撃', duration: 'UNTIL_EXIT', periodTotal: STATE_PERIOD })),
    recipe(2, normal(P, { maxTargets: null, defenseIgnoreFixed: k('def_penetrate_fixed'), periodTotal: STATE_PERIOD })),
    recipe(3, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'),
      damageScale: choose('elaTargetState', 'MINE', k('damage_scale'), 1),
      periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '40発の弾薬と罠の失効を時間積算しない。選択した状態での本人の1射撃。' } }))],
    { 0: RESOURCE, 1: { categories: ['DAMAGE'], effects: b => [critical(b, { type: 'CONDITIONAL',
      condition: condition('elaTargetState', 'MINE'), whenTrue: 1, whenFalse: b.read('prob') })] } }, [elaTargetState], {},
    ['罠の足止め・スタン・脆弱が既に有効な対象を選択する。空中の対象には罠効果を適用しない。S2の全対象は同じ状態。']),
  define('wang', [trapRecipe(1, normal(A, { label: '碁石1個の有効な持続効果', maxTargets: 1, duration: k('attack@sluggish'),
      actions: [attack(A, k('attack@atk_scale'), 1, { label: '碁石の毎秒術ダメージ', basis: 'ATK_STAT', timing: 'PER_SECOND' })] })),
    trapRecipe(2, burst(A, k('attack@atk_scale'), 1, { label: '碁石1個の発動', maxTargets: null })),
    { skillIndex: 3, inputs: [phaseInput([{ value: 'trap', label: '碁石1個の発動' }])], stages: [
      burst(A, k('atk_scale'), 1, { id: 'trap', label: '碁石1個の発動', when: phase('trap'), maxTargets: null, periodTotal: STATE_PERIOD }),
    ], notes: ['S3発動中、本人は攻撃しない。地上の対象に1個の碁石が命中する値。自動配置・連鎖配置・弾薬の消費を命中数に換算しない。'] }],
    { 0: RESOURCE, 1: { categories: ['DAMAGE'], effects: b => [
      damage(calc('ADD', 1, calc('MULTIPLY', b.read('attack@per_atk_scale'), metric('stoneBonusStacks'))),
        'attack@per_atk_scale', condition('damagePhase', 'trap')),
      effect('stone-resistance-ignore', 'attack@per_magic_resist_penetrate_fixed', { item: 'RESISTANCE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT',
        value: calc('MULTIPLY', b.read('attack@per_magic_resist_penetrate_fixed'), metric('stoneBonusStacks')) }, { condition: condition('damagePhase', 'trap') }),
    ] } }, [num('stoneBonusStacks', '選択した碁石の有効な連続配置補正数', 3, 0, 3)], {},
    ['連続配置補正は罠だけに適用する。配置の幾何から重複数を推測しない。S1は単一の持続効果が有効な毎秒値で、再付与・重複と初回/最終回の時刻は含めない。']),
  define('doroth', [1, 2, 3].map(index => trapRecipe(index,
    burst(index === 3 ? A : P, k('atk_scale'), 1, { label: index === 1
      ? '配置時から夢想家10回・既存防御低下中の罠1個' : '配置時から夢想家10回・罠1個',
      maxTargets: index === 1 ? 1 : null, ...(index === 1 ? { defenseReductionRatio: mul(-1, k('def')) } : {}) }),
    [num('normalAttackTalentStacks', '本人射撃時の夢想家の有効回数', 10, 0, 10),
      ...(index === 1 ? [bool('normalTargetDebuffActive', '本人射撃の対象に同スキルの防御低下')] : [])],
    [burst(index === 3 ? A : P, k('atk_scale'), 1, { id: 'changing-trap', label: '攻撃力変化中・新規防御低下の罠',
      unresolved: ['罠の攻撃力参照時刻・新規の夢想家加算と命中の適用順序は未確認。S1の新規防御低下の順序も未確認。'] })],
    index === 1 ? { defenseReductionRatio: choose('normalTargetDebuffActive', true, mul(-1, k('def')), 0) } : {},
    ['この罠の配置時から選択命中まで夢想家10回が有効で、攻撃力が変化していない条件。全期間への保証ではない。S3の誘爆は合算しない。'])),
    { 0: RESOURCE, 1: ability(b => [atk(calc('MULTIPLY', b.read('atk'), { type: 'CONDITIONAL', condition: condition('damagePhase', 'normal'),
      whenTrue: metric('normalAttackTalentStacks'), whenFalse: b.read('max_stack_cnt') }), 'atk / max_stack_cnt')]) }),
  define('tippi', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), actions: [attack(P, 1, 3)], periodTotal: FIXED_PERIOD }))], {}, [], {},
    ['スキルにより離陸している本人の攻撃。空中の敵を2体ブロックする特性を攻撃対象数には流用しない。']),
  define('ctrail', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), maxTargets: choose('targetAirborne', true, k('attack@max_target'), k('attack@max_walk_target')),
      periodTotal: FIXED_PERIOD }), [bool('targetAirborne', '選択した対象すべてが空中にいる')])],
    { 0: { categories: ['DAMAGE', 'SURVIVAL'], effects: b => [scale(b.read('atk_scale'))] } }, [], {},
    ['両スキルとも離陸中のため素質の攻撃力倍率110%を適用する。S2は選択した全対象が地上または空中の同条件で、混在する配分は含めない。']),
  define('hadiya', [{ ...recipe(1, normal(P, { atk: choose('tacticalReconfiguration', true, k('extra.atk'), 0), periodTotal: STATE_PERIOD }),
    [bool('tacticalReconfiguration', 'S1の戦術換装が有効'), num('costBuffStacks', 'コスト消費後の素質の有効回数', 5, 1, 5)]),
    conditionRequirements: [{ when: { input: 'tacticalReconfiguration', comparison: 'EQ', value: true },
      condition: { input: 'costBuffStacks', comparison: 'GTE', value: 2 },
      reason: '戦術換装後は配置と換装で最低2回のコストを消費している必要があります。' }],
  },
    recipe(2, normal(P, { atk: k('atk'), maxTargets: k('attack@max_target'), periodTotal: STATE_PERIOD }),
      [num('costBuffStacks', 'コスト消費後の素質の有効回数', 5, 2, 5)])],
    { 0: { categories: ['ABILITY', 'STATUS'], effects: b => [atk(calc('MULTIPLY', b.read('atk'), metric('costBuffStacks')), 'atk / max_stack_cnt')] } }, [], {},
    ['素質回数は配置・発動・戦術換装のコストを消費した後の状態。消費のたびに入力へ再加算しない。換装・15秒延長を含む時間推移と総量は計算しない。']),
  define('horn', [recipe(1, next(P, k('atk_scale'))),
    { skillIndex: 2, inputs: [phaseInput([{ value: 'normal', label: '通常段階の砲撃' }, { value: 'overdrive', label: 'オーバードライブ中の砲撃' },
      { value: 'discharge', label: '手動停止時の一斉射撃' }])], stages: [
      normal(P, { id: 'normal', when: phase('normal'), maxTargets: null, actions: [attack(P, k('attack@s2.atk_scale'))],
        periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '弾薬の消費とオーバードライブへの移行を時間積算しない。' } }),
      normal(P, { id: 'overdrive', when: phase('overdrive'), maxTargets: null, actions: [attack(P, k('attack@s2.atk_scale')),
        attack(A, k('attack@s2.magic_atk_scale'), 1, { role: 'ADDITIONAL', label: '追加範囲術ダメージ' })],
        periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '残弾数と手動停止時の一斉射撃は合算しない。' } }),
      burst(P, k('attack@s2.atk_scale'), 1, { id: 'discharge', when: phase('discharge'), maxTargets: null,
        unresolved: ['手動停止時の残弾の発射順序・ダメージ単位・発動時の攻撃力参照を個別に確認する必要がある。'] }),
    ], notes: ['S2はブロック中も範囲攻撃。通常段階とオーバードライブの1砲撃を評価する。'] },
    recipe(3, normal(P, { atk: choose('overdrive', true, k('horn_s_3[overload_start].atk'), k('atk')),
      intervalAdd: k('base_attack_time'), periodTotal: STATE_PERIOD }), [bool('overdrive', 'オーバードライブ中')])],
    { 0: ability(b => [atk(b.read('atk'))]), 1: ability(b => [speed(b.read('attack_speed'), 'attack_speed', condition('revived', true))]) },
    [bool('sourceIsBlocking', '自身が敵をブロック中'), bool('revived', '血戦が発動済み')]),
  define('ashlok', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), attackTreatment: 'RANGED', intervalScale: add(1, k('base_attack_time')), periodTotal: FIXED_PERIOD }))],
    { 0: ability(b => [atk({ type: 'CONDITIONAL', condition: condition('allAdjacentGround', true),
      whenTrue: b.read('ashlok_t_1.atk'), whenFalse: b.read('atk') }, 'atk / ashlok_t_1.atk')]) },
    [bool('sourceIsBlocking', '自身が敵をブロック中'), bool('allAdjacentGround', '隣接4マスがすべて地面')]),
  define('firwhl', [recipe(1, next(P, k('atk_scale'), 1, { actions: [attack(P, k('atk_scale')),
    attack(A, choose('burnActive', true, k('burn.atk_scale'), 0), 1,
      { role: 'ADDITIONAL', label: '付与中の燃焼', basis: 'ATK_STAT', timing: 'PER_SECOND' })] })),
    recipe(2, normal(P, { actions: [attack(P), attack(A, choose('burnActive', true, k('burn.atk_scale'), 0), 1,
      { role: 'ADDITIONAL', label: '燃焼エリアの毎秒ダメージ', basis: 'ATK_STAT', timing: 'PER_SECOND' })], periodTotal: STATE_PERIOD }))],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('sourceIsBlocking', false))]) },
    [bool('sourceIsBlocking', '自身が敵をブロック中'), bool('burnActive', '選択した対象が燃焼中', true)], {},
    ['選択した砲撃対象への直接ダメージと、同じ対象が燃焼中の毎秒値。燃焼の付与・終了・重複・エリア外の敵は合算しない。']),
  define('makiri', [recipe(2, normal(P, { atk: k('makiri_s_2[passive].atk'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['ABILITY'], effects: () => [], notes: ['重装・補助への素質。先鋒のマツキリ本人には適用しない。'] } }, [],
    { 1: 'コスト回復と配置待機中の味方の配置コスト軽減のみ。' }),
  define('gravel', [recipe(1, normal(P, { duration: k('duration'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { duration: k('duration'), periodTotal: FIXED_PERIOD }))], {}, [], {},
    ['通常攻撃1動作の合計値。演出上の2ヒットは攻撃力・防御力を双方半分にした2回で、合計は通常の1攻撃と同値。']),
  define('mortis', [recipe(1, normal(P, { blockCountAdd: k('block_cnt'), periodTotal: STATE_PERIOD })),
    recipe(2, normal(A, { intervalAdd: k('base_attack_time'), maxTargets: null,
      actions: [attack(A, k('attack@atk_scale'), 3, { targets: 1 })], periodTotal: STATE_PERIOD }), [],
      ['同じ術耐性の敵へのランダム3連撃。1体欄は対象数で均等配分した期待値。'])],
    { 1: RESOURCE }, [], {}, ['本体が攻撃中の段階。自傷・壊死損傷・身替りへの交代・Feverの時間推移は計算しない。']),
  define('vrdant', [recipe(1, normal(P, { duration: 'UNTIL_EXIT' })),
    recipe(2, normal(A, { aspd: k('attack_speed'), periodTotal: STATE_PERIOD }))], {}, [], {},
    ['本体が攻撃中の段階。HP減少による交代と、身替りの攻撃・回復は合算しない。']),
  define('blemsh', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD })),
    recipe(3, normal(P, { atk: k('atk'), actions: [attack(P), attack(A, k('attack@blemsh_s_3_extra_dmg[magic].atk_scale'), 1,
      { role: 'ADDITIONAL', label: '追加術ダメージ' })], periodTotal: STATE_PERIOD }))],
    { 0: RESOURCE, 1: { categories: ['DAMAGE', 'ATTACK_BEHAVIOR'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('targetSleeping', true))] } },
    [bool('targetSleeping', '命中時に対象が睡眠中')], {}, ['睡眠の有無は選択した命中時の状態。回復量と睡眠の付与・解除の時刻は計算しない。']),
  define('crosly', [recipe(1, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD })),
    recipe(2, burst(P, k('attack@atk_scale_s2'), 1, { maxTargets: null }), [], ['煙幕終了時の地面の敵への1回分。']),
    recipe(3, burst(P, k('attack@atk_scale_s3'), 2), [],
      ['姿を現した時の2連撃1回。2秒間隔と同一対象6秒制限があるため、連続DPSと16秒の総量は計算しない。'])],
    { 1: { categories: ['DAMAGE'], effects: b => [damage(b.read('damage_scale'), 'damage_scale', { type: 'ALL', conditions: [
      condition('targetHasDamagedSelf', false), condition('attack.damageType', P),
    ] })] } }, [bool('targetHasDamagedSelf', '対象からダメージを受けた')], {}, ['選択する攻撃対象は地面の敵。']),
  define('hsgma2', [{ skillIndex: 1, inputs: [phaseInput([{ value: 'normal', label: '通常攻撃' }, { value: 'counter', label: '被攻撃時の反撃' }])], stages: [
      normal(A, { id: 'normal', when: phase('normal'), atk: k('atk'), duration: 'UNTIL_EXIT' }),
      burst(A, k('atk_scale'), 1, { id: 'counter', when: phase('counter'), atk: k('atk') }),
    ], notes: ['被攻撃時の反撃は1回ごとに評価し、敵からの攻撃頻度を通常攻撃のDPSへ加算しない。'] },
    { skillIndex: 2, inputs: [phaseInput([{ value: 'strike', label: 'ブロック対象への3連撃' }, { value: 'shield', label: '盾の接触1回' }])], stages: [
      burst(A, k('attack@atk_scale'), 3, { id: 'strike', when: phase('strike'), maxTargets: 3 }),
      burst(A, k('shield_atk_scale'), 1, { id: 'shield', when: phase('shield'), maxTargets: null }),
    ], notes: ['3連撃と盾の接触1回を別に評価する。盾の軌道・接触時間・回復によるHP変化は計算しない。'] },
    recipe(3, normal(A, { atk: k('atk'), maxTargets: k('attack@max_target'),
      actions: [attack(A, 1, choose('finalStand', true, 4, 2))], duration: choose('finalStand', true, k('before_dead_duration'), 32), periodTotal: STATE_PERIOD }),
      [bool('finalStand', '手動停止後の退場前11秒')])],
    { 1: ability(b => [atk(calc('MULTIPLY', b.read('min_atk'), calc('MIN', 1, calc('MAX', 0,
      calc('DIVIDE', calc('ADD', 1, calc('MULTIPLY', -0.01, metric('selfHpPercent'))), calc('ADD', 1, calc('MULTIPLY', -1, b.read('min_hp_ratio'))))))),
      'min_atk / min_hp_ratio')]) }, [hp()]),
  define('texas2', [recipe(1, normal(P, { atk: k('atk'), actions: [attack(P), attack(A, 0, 1,
    { role: 'ADDITIONAL', label: '付与中の継続術ダメージ', timing: 'PER_SECOND', basis: 'ATK_STAT',
      flatDamage: choose('dotActive', true, k('attack@texas2_s_1[dot].dot_damage'), 0) })], periodTotal: STATE_PERIOD }),
      [bool('dotActive', '対象に継続ダメージが付与中', true)]),
    { skillIndex: 2, inputs: [phaseInput([{ value: 'normal', label: '配置後の通常攻撃' }, { value: 'deploy', label: '配置時の範囲ダメージ' }])], stages: [
      normal(A, { id: 'normal', when: phase('normal'), atk: k('atk'), actions: [attack(A, 1, 2)],
        resistanceReductionRatio: mul(-1, k('magic_resistance')), periodTotal: STATE_PERIOD }),
      burst(A, k('atk_scale'), 1, { id: 'deploy', when: phase('deploy'), maxTargets: null,
        unresolved: ['配置時の攻撃力上昇・術耐性低下と範囲ダメージの適用順序は未確認。'] }),
    ], notes: ['通常攻撃は自身が術耐性低下を付与済みの敵への2連撃。配置時ダメージと再発動の時系列は合算しない。'] },
    { skillIndex: 3, inputs: [phaseInput([{ value: 'normal', label: '通常攻撃と剣雨' }, { value: 'deploy', label: '配置時の2連撃' }])], stages: [
      normal(P, { id: 'normal', when: phase('normal'), maxTargets: k('max_target'), actions: [attack(P, 1, 1, { targets: 1 }),
        attack(A, k('atk_scale'), 1, { role: 'ADDITIONAL', label: '毎秒の剣雨', timing: 'PER_SECOND', basis: 'ATK_STAT' })], periodTotal: STATE_PERIOD }),
      burst(A, k('appear.atk_scale'), 2, { id: 'deploy', when: phase('deploy'), maxTargets: null }),
    ], notes: ['同じ防御力・術耐性の敵への合計を計算する。通常攻撃は1体、剣雨は最大4体。再発動と途中撃破は計算しない。'] }],
    { 0: ability(b => [atk(b.read('atk'))]), 1: ability(b => [speed(b.read('attack_speed'), 'attack_speed', condition('firstKillDone', false))]) },
    [bool('firstKillDone', '配置後に敵を1体以上撃破済み')]),
  define('yato2', [recipe(1, normal(P, { aspd: k('attack_speed'), actions: [attack(P, 1, choose('comboThirdAttack', true, 6, 2))],
      dpsUnsupportedReason: '3度目の6連撃を含む攻撃動作の長さは未対応。選択した1攻撃の値を表示する。', periodTotal: STATE_PERIOD }),
      [bool('comboThirdAttack', '同一対象に対する3度目の攻撃')]),
    recipe(2, burst(P, k('atk_scale'), 16, { maxTargets: null })),
    recipe(3, burst(P, k('atk_scale'), 1, { maxTargets: null }), [],
      ['突進中に対象へ接触する1回分。移動距離や敵の大きさから命中回数を推定しない。'])],
    { 0: { categories: ['ADDITIONAL_DAMAGE'], effects: b => [effect('kirin-arts', 'attack@atk_scale_1', {
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', damageType: A, rate: 'PER_ATTACK',
      value: calc('MULTIPLY', b.read('attack@atk_scale_1'), { type: 'CONDITIONAL', condition: condition('skillIndex', 2),
        whenTrue: metric('skill.talent_scale'), whenFalse: { type: 'CONDITIONAL', condition: condition('skillIndex', 3), whenTrue: metric('skill.atk_scale'), whenFalse: 1 } }),
      hits: { type: 'CONDITIONAL', condition: condition('skillIndex', 2), whenTrue: 16, whenFalse: { type: 'CONDITIONAL',
        condition: condition('skillIndex', 1), whenTrue: { type: 'CONDITIONAL', condition: condition('comboThirdAttack', true), whenTrue: 6, whenFalse: 2 }, whenFalse: 1 } },
    }, { target: enemies, timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })] },
      1: ability(b => [atk(b.read('atk'))]) }),
  define('ghost2', [recipe(1, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed'), periodTotal: STATE_PERIOD })),
    recipe(3, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: 2, actions: [attack(P),
      attack(P, choose('targetHpAtLeastSelf', true, k('attack@atk_scale_ex'), 0), 1, { role: 'ADDITIONAL', label: 'HP割合条件の追加物理ダメージ' })],
      periodTotal: STATE_PERIOD }), [bool('targetHpAtLeastSelf', '対象のHP割合が自身以上')])],
    { 0: { categories: ['ADDITIONAL_DAMAGE', 'STATUS'], effects: () => [], notes: ['身替りの継続術ダメージは本体の攻撃に加算しない。'] } }, [], {},
    ['本体の攻撃段階のみ。HP交換・消費、スキル終了後の身替りへの交代と身替り中のダメージは合算しない。']),
  define('rdoc', [recipe(1, normal(P, { intervalAdd: k('base_attack_time'),
    periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '31発の弾薬の消費時間と回復行動は計算しない。' } }))],
    { 0: { categories: ['DAMAGE', 'SURVIVAL'], effects: b => [effect('fixed-defense-ignore', 'def_penetrate_fixed', {
      item: 'DEFENSE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT', value: b.read('def_penetrate_fixed'),
    })] } }, [blocked()], { 2: '味方への注射器による治療。ダメージは与えない。' }),
  define('blackd', [recipe(2, normal(P, { periodTotal: FIXED_PERIOD }))], {}, [],
    { 1: 'コスト回復のみの即時スキル。ダメージ発生なし。' }),
  define('bison', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD }))], {}, [],
    { 2: 'スキル中は攻撃を停止し、味方と自身の防御力を強化する。' }),
  define('snakek', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD }))], {}, [],
    { 2: 'スキル中は攻撃を停止し、防御・ブロック数を強化して自身を回復する。' }),
  define('bubble', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD }))], {}, [],
    { 2: '攻撃停止中の反撃は自身の防御力を参照するため、攻撃力による通常攻撃に置き換えない。' }),
  define('yak', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })), recipe(2, normal(P, { periodTotal: FIXED_PERIOD }))]),
  define('beagle', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD }))]),
  // State inputs below select an actual attack, never a simulated timeline or an
  // average of incompatible phases. Separate summon/counter damage stays explicit.
  define('udflow', [recipe(1, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed'), maxTargets: k('attack@max_target'), periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['ADDITIONAL_DAMAGE'], effects: b => [effect('cell-inhibitor-dot', 'damage / damage_seamonster / duration / interval', {
      item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', damage: {
        kind: { type: 'ORDINARY', damageType: A }, amount: { basis: 'FIXED', referenceTime: 'NOT_APPLICABLE',
          value: { type: 'CONDITIONAL', condition: condition('targetSeaMonster', true), whenTrue: b.read('damage_seamonster'), whenFalse: b.read('damage') } },
        rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: b.read('duration') },
        cadence: { intervalSeconds: b.read('interval'), firstTickSeconds: null }, stacking: { mode: 'REPLACE', maxStacks: 1 }, refresh: 'RESET_DURATION',
      },
    }, { target: enemies, timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' }, condition: condition('dotActive', true) })],
      notes: ['選択した対象全員に付与中の毎秒ダメージ。毒の付与・更新・終了時刻を含む総量は計算しない。'] } },
    [bool('dotActive', '対象に継続ダメージが付与中', true), bool('targetSeaMonster', '対象は海の怪物')]),
  define('odda', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD }))],
    { 0: ability(b => [atk(b.read('atk'), 'atk', condition('physicalDamageCount', b.read('count') ?? NaN, 'GTE'))]) },
    [num('physicalDamageCount', 'これまでに与えた物理ダメージの回数', 0, 0, 9999)], {},
    ['主対象と、その周囲にいる敵への50%物理ダメージを別々に防御軽減する。']),
  define('aurora', [recipe(1, normal(P, { blockCountAdd: k('block_cnt'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'),
    actions: [attack(P, choose('targetFrozen', true, k('atk_scale'), 1))],
    periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '9発の途中で変わる寒冷・凍結と弾薬消費の時間推移は計算しない。' } }),
    [bool('targetFrozen', '命中時に対象が凍結中')])]),
  define('kirara', [recipe(1, next(P, 1, 1, { actions: [attack(P), attack(A, k('kirara_s_1.atk_scale'), 1, { role: 'ADDITIONAL', label: '追加術ダメージ' })] })),
    { skillIndex: 2, inputs: [phaseInput([{ value: 'periodic', label: '継続術ダメージのみ' }, { value: 'combined', label: '通常攻撃との合計' }])], stages: [
      burst(A, 1, 1, { id: 'periodic', label: '継続術ダメージのみ', when: phase('periodic'), maxTargets: null,
        actions: [attack(A, k('attack@atk_scale'), 1, { label: 'アンカーポイントの毎秒術ダメージ', basis: 'ATK_STAT', timing: 'PER_SECOND' })],
        periodTotal: STATE_PERIOD }),
      burst(A, 1, 1, { id: 'combined', label: '通常攻撃との合計', when: phase('combined'), actions: [],
        unresolved: ['通常攻撃の継続・中断と周期命中の時間関係は未確認です。継続術ダメージだけを選択してください。'] }),
    ], notes: ['素質の3倍は自己回復のみ。継続術ダメージの倍率へ掛けない。最初と最後の命中時刻・期間合計は計算しない。'] }], {}, [], {}),
  define('swire', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })), recipe(2, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['ABILITY'], effects: () => [], notes: ['周囲8マスの味方への素質。スワイヤー自身の攻撃力には加算しない。'] } }, [blocked()],
    {}),
  define('phatom', [recipe(1, normal(P, { duration: k('duration'), periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: mul(k('atk'), input('remainingStacks')), periodTotal: STATE_PERIOD }),
    [num('remainingStacks', '攻撃前に残っている強化回数', 10, 0, 10)]),
    recipe(3, burst(P, k('atk_scale'), 1, { maxTargets: null }), [], MOVE_NOTE)],
    { 0: { categories: ['SUMMON'], effects: () => [], notes: ['ファントム本体の攻撃。別途配置する鏡映虚影の攻撃は合算しない。'] }, 1: DEPLOY }),
  define('kafka', [{ skillIndex: 2, inputs: [phaseInput([{ value: 'normal', label: '配置後の通常攻撃' }, { value: 'deploy', label: '配置時の範囲ダメージ' }])],
    stages: [normal(A, { id: 'normal', when: phase('normal'), duration: k('duration'), periodTotal: STATE_PERIOD }),
      burst(A, k('atk_scale'), 1, { id: 'deploy', when: phase('deploy'), maxTargets: null })],
    notes: ['目標マス内の地面の敵を対象とし、配置時の範囲ダメージと、その後の単体通常攻撃を分けて評価する。'] }],
    { 0: ability(b => [atk(b.read('atk'))]) }, [], { 1: '終了時の術ダメージと、パッシブ効果期間の攻撃力上昇が失効する順序を確認する必要がある。' }),
  define('ascln', [recipe(1, next(P, k('atk_scale'), 2)),
    recipe(2, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD })),
    recipe(3, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['ADDITIONAL_DAMAGE', 'STATUS'], effects: b => [effect('stacked-arts-dot', 'atk_ratio / max_stack_cnt / debuff_duration / interval', {
      item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', damage: {
        kind: { type: 'ORDINARY', damageType: A }, amount: { basis: 'ATK_RATIO', reference: 'SOURCE', referenceTime: 'EACH_TICK',
          ratio: calc('MULTIPLY', b.read('atk_ratio'), calc('MIN', b.read('max_stack_cnt'), metric('dotStacks'))) },
        rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: b.read('debuff_duration') },
        cadence: { intervalSeconds: b.read('interval'), firstTickSeconds: null },
        stacking: { mode: 'ADD_STACKS', maxStacks: b.read('max_stack_cnt') }, refresh: 'UNSPECIFIED',
      },
    }, { target: enemies, timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })],
      notes: ['選択した対象全員に付与中の重複数で毎秒値を評価する。S1の210%倍率を毒に乗せず、現在の攻撃力を参照する。更新・伝播・途中撃破は計算しない。'] },
      1: ability(b => [speed(calc('ADD', b.read('attack_speed'), { type: 'CONDITIONAL', condition: condition('adjacentHighTile', true),
        whenTrue: b.read('attack_speed_add'), whenFalse: 0 }), 'attack_speed / attack_speed_add')]) },
    [num('dotStacks', '対象に付与中の素質の重複数', 0, 0, 3), bool('adjacentHighTile', '隣接4マスに高台がある')]),
  define('lmlee', [recipe(1, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' })),
    { skillIndex: 2, inputs: [phaseInput([{ value: 'normal', label: '通常攻撃' }, { value: 'explosion', label: 'マークの爆発' }]),
      num('markHits', 'マーク中に対象が攻撃を受けた回数', 0, 0, 30)], stages: [
      normal(P, { id: 'normal', when: phase('normal'), aspd: k('attack_speed'), duration: 'UNTIL_EXIT' }),
      burst(A, add(k('default_atk_scale'), mul(k('factor_atk_scale'), input('markHits'))), 1,
        { id: 'explosion', when: phase('explosion'), maxTargets: null }),
    ], notes: ['爆発は入力した被攻撃回数での1回分。味方攻撃・途中撃破・5秒以内の発動時刻は計算しない。'] },
    recipe(3, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' }), [], MOVE_NOTE)],
    { 0: ability(b => [speed(calc('MULTIPLY', b.read('lmlee_t_1[self].attack_speed'), {
      type: 'CONDITIONAL', condition: condition('nearbyEnemyCount', b.read('cnt') ?? NaN), whenTrue: 2, whenFalse: 1,
    }), 'lmlee_t_1[self].attack_speed / cnt')]) }, [num('nearbyEnemyCount', '周囲8マスの敵数', 1, 0, 9999)]),
  define('bena', [recipe(1, normal(P, { atk: k('atk'), defenseIgnoreRatio: k('def_penetrate'), periodTotal: STATE_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), aspd: k('attack_speed'), periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['SURVIVAL', 'ATTACK_BEHAVIOR'], effects: () => [], notes: ['素質の術攻撃は身替りのみ。本体の攻撃は物理のまま。'] } }, [], {},
    ['本体が生存して攻撃している段階を評価する。身替りへの交代、HP消費、身替りの攻撃を含む総ダメージは計算しない。']),
  define('kazema', [recipe(1, next(P, k('atk_scale')))],
    { 0: { categories: ['ADDITIONAL_DAMAGE'], effects: () => [], notes: ['身替りの出現時ダメージは本体のS1攻撃に加算しない。'] } }, [],
    { 2: '本体と召喚した身替りの攻撃、および身替り出現時の術ダメージを一体で扱う必要がある。' },
    ['本体の強化攻撃1回。HP減少による交代と身替りの出現は計算しない。']),
  define('mizuki', [recipe(1, next(P, k('atk_scale'))),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: STATE_PERIOD })),
    recipe(3, normal(P, { atk: k('atk'), periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['ADDITIONAL_DAMAGE'], effects: b => [1, 2, 3].map(index => effect(`lowest-hp-arts-${index}`, 'attack@mizuki_t_1.atk_scale / attack@max_target', {
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', damageType: A, rate: 'PER_ATTACK',
      value: calc('MULTIPLY', b.read('attack@mizuki_t_1.atk_scale'), { type: 'CONDITIONAL',
        condition: condition('skillIndex', 1), whenTrue: metric('skill.talent_scale'), whenFalse: 1 }),
    }, { condition: condition('skillIndex', index), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' },
      target: { ...enemies, selection: { type: 'COUNT', count: b.read('attack@max_target') === null ? null : b.read('attack@max_target')! + index - 1 } },
    })), notes: ['追加術ダメージはHPの低い1/2/3体のみ。同じ防御力・術耐性の対象への合計を計算し、1体欄は全対象で均等に割った平均値。'] },
      1: ability(b => [atk(b.read('atk'), 'atk', condition('lowHpEnemyInRange', true))]) },
    [bool('lowHpEnemyInRange', '範囲内にHP50%未満の敵がいる')]),
  define('jesca2', [recipe(1, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' })),
    recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: FIXED_PERIOD })),
    { skillIndex: 3, inputs: [phaseInput([{ value: 'normal', label: '通常射撃' }, { value: 'shell', label: '防盾配置時の砲弾' }])], stages: [
      normal(P, { id: 'normal', when: phase('normal'), atk: k('atk'), intervalAdd: k('base_attack_time'),
        periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '20発の弾薬と、防盾配置に伴う砲弾の発生時刻は合算しない。' } }),
      burst(P, k('attack@extrabomb.atk_scale'), 1, { id: 'shell', when: phase('shell'), atk: k('atk'), maxTargets: null }),
    ], notes: ['通常射撃と、防盾を配置した時の砲弾1発を別に評価する。防盾の配置回数・弾薬消費の時間推移は計算しない。'] }],
    { 0: { categories: ['SUMMON', 'SURVIVAL'], effects: () => [] }, 1: RESOURCE }),
  define('branch', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })),
    recipe(2, normal(P, { atk: k('atk'), maxTargets: 3, periodTotal: FIXED_PERIOD }), [], ['自身がブロック中の敵のみを選択する。'])]),
  define('pianst', [recipe(1, normal(A, { atk: k('atk'), periodTotal: STATE_PERIOD }))],
    { 0: { categories: ['ADDITIONAL_DAMAGE', 'SURVIVAL'], effects: b => [counter(b)], notes: ['通常攻撃を評価する。敵の術攻撃で発生する反撃は合算しない。'] } }, [],
    { 2: '被弾による攻撃力蓄積と、終了時の爆発に蓄積が適用される順序を確認する必要がある。' }),
  define('nothin', [recipe(2, normal(P, { atk: k('atk'), aspd: choose('randomEffect', 'speed', k('attack_speed'), 0), duration: 'UNTIL_EXIT' }),
    [{ key: 'randomEffect', label: '発動した追加効果', kind: 'select', defaultValue: 'speed', options: [
      { value: 'speed', label: '自身の攻撃速度上昇' }, { value: 'enemySpeed', label: '敵の攻撃速度低下' },
      { value: 'dodge', label: '物理回避' }, { value: 'block', label: 'ブロック数増加' },
    ] }])], { 0: { categories: ['DAMAGE', 'STATUS'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('ambushReady', true))] } },
    [bool('ambushReady', '4秒以上攻撃していない後の次の攻撃')], { 1: 'HP低下時の攻撃停止と回復。直接ダメージを変更するスキルではない。' }),
  define('talr', [recipe(1, normal(P, { atk: k('atk'), duration: 'UNTIL_EXIT' })),
    recipe(2, normal(P, { maxTargets: k('max_target'), fixedAttackInterval: 1, actions: [attack(P, k('atk_scale'))], periodTotal: STATE_PERIOD }), [],
    ['バインド中の対象への毎秒ダメージ。通常攻撃は加算しない。コスト不足による途中退場・最初と最後の命中時刻は計算しない。'])],
    { 0: { categories: ['DAMAGE'], effects: b => [damage(b.read('damage_scale'), 'damage_scale', condition('targetBlockedBySelf', false))] } }, [blocked()]),
  define('judge', [recipe(1, next(P, 1, 1, { actions: [
    attack(P, choose('overcharged', true, k('judge_s_1_enhance_checker.atk_scale'), 1)),
    attack(A, mul(k('atk_scale_2'), choose('overcharged', true, k('judge_s_1_enhance_checker.atk_scale'), 1)), 1,
      { role: 'ADDITIONAL', label: '追加術ダメージ' }),
  ] }), [bool('overcharged', 'オーバーチャージ')]),
    recipe(2, normal(A, { maxTargets: null, fixedAttackInterval: 1, actions: [attack(A, k('atk_scale'))], periodTotal: STATE_PERIOD }), [],
      ['周囲の地面の敵への毎秒術ダメージ。スキル中は通常攻撃しない。']),
    recipe(3, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: STATE_PERIOD }))],
    { 1: { categories: ['ADDITIONAL_DAMAGE'], effects: b => [{ ...counter(b), condition: condition('selfBarrierActive', true) }],
      notes: ['敵からの攻撃で発生する反撃は自身の通常攻撃に加算しない。被弾頻度を含む総量は計算しない。'] } }, [bool('selfBarrierActive', '自身のバリアが有効', true)]),
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
  define('cement', [recipe(2, normal(P, { periodTotal: FIXED_PERIOD })), recipe(1, burst(P, k('atk_scale'), 1, { maxTargets: null }))], {}, [],
    {}),
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
  // https://prts.wiki/w/红 : the talent raises post-mitigation damage to a fraction of ATK, not skill-scaled ATK.
  define('red', [recipe(1, normal(P, { atk: k('atk'), periodTotal: FIXED_PERIOD })),
    recipe(2, burst(P, k('atk_scale'), 1, { label: '配置時の範囲攻撃', maxTargets: null, duration: 0, periodTotal: STATE_PERIOD }), [], ['配置時に周囲の地上敵へ与える1回。再配置周期やスタン後の通常攻撃は合算しない。'])],
    { 0: { categories: ['DAMAGE'], effects: b => [effect('minimum-damage', 'atk_scale', {
      item: 'MINIMUM_DAMAGE_RATIO', operation: 'SET', unit: 'RATIO', value: b.read('atk_scale'),
    })] } }, [], {}),
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
  define('brownb', [recipe(1, normal(P, { duration: 'UNTIL_EXIT', periodTotal: STATE_PERIOD })), recipe(2, normal(P, { intervalAdd: k('base_attack_time') }))],
    { 0: ability(b => [atk(calc('MULTIPLY', b.read('atk'), metric('sameTargetStacks')), 'atk × sameTargetStacks')]) },
    [num('sameTargetStacks', '同じ敵への攻撃による累積数', 0, 0, 5)], {}),

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
  define('grani', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })), recipe(2, normal(P, { atk: k('atk'), maxTargets: add(1, k('block_cnt')) }))], {}, [], {}),
  define('puzzle', [recipe(1, next(P, k('atk_scale')))], { 0: { categories: ['DAMAGE', 'RESOURCE'], effects: b => [scale(b.read('atk_scale'), 'atk_scale', condition('targetFullHp', true))] } },
    [bool('targetFullHp', '攻撃前の対象HPが最大')], { 2: '術の継続ダメージの付与・重複・更新と攻撃ごとのHP条件を解決する必要がある。' }),

  define('durnar', [recipe(1, normal(A, { atk: k('atk') })), recipe(2, normal(A, { atk: k('atk'), maxTargets: 3 }))], { 0: ability(b => [atk(b.read('atk'))]) }),
  // https://prts.wiki/w/星熊 : thorns directly selects the enemy damage source.
  define('hsguma', [recipe(1, normal(P, { atk: k('atk') })),
    { skillIndex: 2, inputs: [phaseInput([{ value: 'normal', label: '通常攻撃' }, { value: 'counter', label: '被攻撃時の反撃1回' }])], stages: [
      normal(P, { id: 'normal', label: '通常攻撃', when: phase('normal'), duration: 'UNTIL_EXIT', periodTotal: STATE_PERIOD }),
      burst(P, k('atk_scale'), 1, { id: 'counter', label: '被攻撃時の反撃1回', when: phase('counter'), maxTargets: 1,
        actions: [attack(P, k('atk_scale'), 1, { label: '攻撃元の敵への反撃', basis: 'ATK_STAT' })],
        dpsUnsupportedReason: '敵からの攻撃1回に対する反撃。敵の攻撃頻度は計算しません。', periodTotal: STATE_PERIOD }),
    ], notes: ['通常攻撃と反撃は別イベント。反撃の対象は攻撃元の敵1体で、通常攻撃へ合算しない。'] },
    recipe(3, burst(P, 1, 1, { label: '盾回転のダメージ判定1回', atk: k('atk'), maxTargets: null,
      periodTotal: STATE_PERIOD }), [], ['前方1マス内の地上敵に対する1回の判定。盾の回転周期と攻撃速度の関係を仮定したDPS・期間合計は計算しない。'])], {}, [], {}),
  // https://prts.wiki/w/Nian : normal attacks stop; only the enemy damage source is countered.
  define('nian', [recipe(1, normal(A, { atk: k('atk') })),
    recipe(2, burst(A, k('atk_scale'), 1, { id: 'counter', label: '攻撃停止中の反撃1回', blockCountAdd: k('block_cnt'), maxTargets: 1,
      actions: [attack(A, k('atk_scale'), 1, { label: '攻撃元の敵への反撃', basis: 'ATK_STAT' })],
      dpsUnsupportedReason: '敵からの攻撃1回に対する反撃。敵の攻撃頻度は計算しません。', periodTotal: STATE_PERIOD }), [],
      ['通常攻撃を行わない。攻撃元の敵1体への反撃だけを評価し、ブロック数を反撃対象数に使わない。']),
    recipe(3, normal(P, { atk: k('nian_s_3[self].atk') }))], {}, [], {}),
  define('mudrok', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })), recipe(2, next(P, k('atk_scale'), 1, { maxTargets: null })), recipe(3, normal(P, { label: '行動再開後', duration: k('awake'),
    atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: 3 }), [], ['最初の10秒間の行動停止後、攻撃可能な20秒間の1攻撃・DPSを評価する。'])], {}, [],
    {}),
  define('liskam', [recipe(1, normal(P, { duration: k('duration'), periodTotal: FIXED_PERIOD })), recipe(2, normal(A, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: k('attack@max_target') }))], { 0: RESOURCE }, [],
    {}),
  define('moeshd', [recipe(1, normal(P, { periodTotal: FIXED_PERIOD })), recipe(2, burst(P, k('atk_scale'), 1, { maxTargets: null }), [], MOVE_NOTE)], {}, [], {}),
  define('hpsts', [recipe(1, normal(P, { blockCountAdd: k('block_cnt'), maxTargets: 1, periodTotal: FIXED_PERIOD })), recipe(2, normal(P, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: add(3, k('block_cnt')) }))], {}, [],
    {}),
  define('asbest', [recipe(1, normal(A, { periodTotal: FIXED_PERIOD })), recipe(2, normal(A, { atk: k('atk'), intervalAdd: k('base_attack_time'), maxTargets: null }))], { 0: RESOURCE }, [],
    {}),

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
  // https://prts.wiki/w/慕斯 : the S1 ATK buff lasts from attack start until that attack finishes, including the double hit.
  define('frncat', [recipe(1, next(A, 1, 1, { atk: k('atk'), maxTargets: 1, periodTotal: STATE_PERIOD }), [],
    ['強化攻撃1回と、その攻撃で20%の確率で発生する素質の2撃目を評価。敵の攻撃力低下は与ダメージへ加算しない。']),
    recipe(2, normal(A, { atk: k('atk'), periodTotal: FIXED_PERIOD }))],
    { 0: { categories: ['ATTACK_BEHAVIOR', 'DAMAGE'], effects: b => [effect('combo', 'prob',
      { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: 1, damageType: A, rate: 'PER_ATTACK' },
      { timing: { type: 'EVENT', event: 'ATTACK' }, probability: { chance: b.read('prob'), rollScope: 'APPLICATION' },
        lifetime: { type: 'CURRENT_EVENT' }, restrictions: [{ type: 'EXCLUDE_MODIFIER', modifier: 'recursive_extra_attack' }] })] } }),
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
  define('luton', [recipe(1, next(P, k('atk_scale'))), recipe(2, normal(A, {
    label: '強磁場・地上への周期ダメージ1回', maxTargets: null, fixedAttackInterval: k('interval'),
    actions: [attack(A, k('magic_atk_scale'), 1, { label: '強磁場の周期ダメージ' })],
    periodTotal: { kind: 'UNSUPPORTED', reason: '2秒ごとの1命中と毎秒値を評価。初回・最終発生時点と移動による範囲内外の変化を含む総量は計算しません。' },
  }), [], ['通常攻撃を停止し、強磁場のダメージだけを計算。防御力上昇は攻撃力へ加算しない。', ...MOVE_NOTE])]),
  define('jaksel', [recipe(1, next(P, k('atk_scale'))), recipe(2, burst(P, k('attack@atk_scale'), 1, {
    id: 'counter', label: '物理回避後の反撃1回', maxTargets: 1,
    actions: [attack(P, k('attack@atk_scale'), 1, { label: '回避後の反撃', basis: 'ATK_STAT' })],
    periodTotal: STATE_PERIOD, dpsUnsupportedReason: '回避が成立した後の反撃1回。回避率や最短間隔を実際の反撃頻度へ置き換えない。' }), [],
    ['通常攻撃は停止。素質の攻撃速度上昇は反撃の威力を変えない。'])],
    { 0: ability(b => [speed(b.read('charge_atk_speed_on_evade.attack_speed'), 'charge_atk_speed_on_evade.attack_speed', condition('dodgeSpeedActive', true))]) },
    [bool('dodgeSpeedActive', '回避後の攻撃速度上昇中')],
    {}),
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
