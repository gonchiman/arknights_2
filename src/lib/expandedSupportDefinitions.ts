import sources from '../data/expandedSupportSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardInput, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue } from './combatEffectStructure.ts'
import type { TalentStructureEffect } from './talentStructure.ts'

const key = (key: string): GuardValue => ({ key })
const input = (input: string): GuardValue => ({ input })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const eq = (metric: string, value: string | boolean): CombatCondition => ({ type: 'COMPARE', metric, comparison: 'EQ', value })
const choose = (condition: CombatCondition, whenTrue: CombatNumericValue, whenFalse: CombatNumericValue): CombatNumericValue =>
  ({ type: 'CONDITIONAL', condition, whenTrue, whenFalse })
const select = (key: string, label: string, values: readonly [string, string][]): GuardInput =>
  ({ key, label, kind: 'select', defaultValue: values[0][0], options: values.map(([value, label]) => ({ value, label })) })
const bool = (key: string, label: string, defaultValue = true): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const ctx = (id: string, sourceBinding = `description:${id}`): CombatEffectContext => ({ id, sourceBinding,
  timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
  target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true, factionIds: [], tagIds: [], selection: { type: 'ALL' } },
  probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [] })
const status = (id: string, text: string): TalentStructureEffect => ({ ...ctx(id), item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: text })
const talent = (talentIndex: number, name: string, effects: ExpandedTalentDefinition['effects']): ExpandedTalentDefinition =>
  ({ talentIndex, name, prefabKey: String(talentIndex + 1), categories: ['ABILITY'], effects })
const single = (label: string, options: Partial<GuardStage> = {}): GuardStage => ({ id: 'event', label, kind: 'SKILL_ACTION', maxTargets: 1,
  actions: [], periodTotal: { kind: 'UNSUPPORTED', reason: '選択したダメージ発生1回を計算し、発生回数・途中の状態変化・全期間の合算は計算しません。' }, ...options })
const phase = (input: string, value: string, stage: GuardStage): GuardStage => ({ ...stage, id: value.toLowerCase(), when: { input, comparison: 'EQ', value } })
const pending = (label: string, reason: string, relatedSections: readonly ('スキル' | '素質1' | '素質2')[] = ['スキル']): GuardStage =>
  single(label, { unresolved: [reason], calculationIssues: [{ id: label, reason, relatedSections }] })
const operator = (operatorId: string, recipes: readonly [number, readonly GuardStage[], (readonly GuardInput[])?][],
  talents: readonly ExpandedTalentDefinition[], inputs: readonly GuardInput[] = []): ExpandedOperatorDefinition => {
  const source = sources.find(source => source.operatorId === operatorId)!
  const indices = new Set(recipes.map(([index]) => index))
  return { operatorId, phaseIndex: source.phaseIndex, skillLevelIndex: source.skillLevelIndex, inputs, talents,
    recipes: recipes.map(([skillIndex, stages, inputs = []]) => ({ operatorId, skillIndex, inputs,
      stages: stages.map(stage => ({ ...stage, duration: stage.duration ?? source.skills.find(skill => skill.skillIndex === skillIndex)!.raw.duration })) })),
    deferredSkills: source.skills.filter(skill => !indices.has(skill.skillIndex)).map(skill => ({ skillIndex: skill.skillIndex,
      reason: '回復・味方支援のみのスキル効果はダメージ計算の対象外。' })) }
}

/** Reviewed damage events. Healing and buffs to other operators are not self ATK bonuses. */
export const EXPANDED_SUPPORT_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  // https://prts.wiki/w/Saileach : the flag aura starts before its landing damage.
  operator('char_479_sleach', [[3, [single('軍旗の着弾1回', { maxTargets: null, blockCountAdd: -1,
    damageScale: key('damage_scale'),
    actions: [{ label: '軍旗の範囲物理ダメージ', role: 'MAIN', damageType: 'PHYSICAL', basis: 'ATK_STAT', scale: key('atk_scale') }],
    dpsUnsupportedReason: '軍旗の着弾1回。スキル中の通常攻撃は停止する。',
    notes: ['軍旗着弾前に有効になる30%脆弱を適用。全対象が旗の脆弱範囲と着弾範囲の両方にいる条件。対象数は主対象と周囲を合わせた数。'] })]]], [
    talent(0, '決意の旗', v => { v.read('sleach_t_1[ally].attack_speed'); v.read('sleach_t_1[enemy].attack_speed')
      return [status('flag-speed', '軍旗周囲の味方攻撃速度上昇・敵攻撃速度低下。着弾1回の威力へは加算しない')] }),
    talent(1, '士気向上', v => { v.read('value'); return [status('deployment-cost', '次に配置するオペレーターのコスト減少')] }),
  ]),
  operator('char_1012_skadi2', [[3, [single('自身の範囲内の毎秒ダメージ', { maxTargets: null,
    actions: [{ label: '自身の範囲内の確定ダメージ', role: 'MAIN', damageType: 'TRUE', basis: 'ATK_STAT', scale: key('atk_scale'), timing: 'PER_SECOND' },
      { label: 'シーボーン範囲の確定ダメージ', role: 'MAIN', damageType: 'TRUE', basis: 'ATK_STAT', scale: key('atk_scale'), timing: 'PER_SECOND',
        hits: { op: 'if', input: 'skadiSeabornOverlap', comparison: 'EQ', value: true, yes: 1, no: 0 } }],
    notes: ['全対象が本人の範囲内。重複ありは全対象がシーボーンの範囲内でもある状態。シーボーンの独立攻撃力を使わず、本人の攻撃力を参照する。'] })]]], [
    talent(0, '太古の血族', () => [status('seaborn-range', 'シーボーンの範囲を追加範囲として使用。同じ対象へのS3ダメージは重複可能')]),
    talent(1, '捕食本能', v => [{ ...ctx('nearby-ally-atk', 'skadi2_t_2[atk][1].atk / skadi2_t_2[atk][2].atk'),
      item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
      value: choose(eq('skadiAlly', 'ABYSSAL'), v.read('skadi2_t_2[atk][2].atk'), choose(eq('skadiAlly', 'OTHER'), v.read('skadi2_t_2[atk][1].atk'), 0)) }]),
  ], [select('skadiAlly', '範囲内の味方', [['NONE', 'なし'], ['OTHER', '他のオペレーター'], ['ABYSSAL', 'アビサルハンター']]), bool('skadiSeabornOverlap', 'シーボーン範囲と重複', false)]),

  operator('char_4134_cetsyr', [[2, [single('微塵1個の命中', { actions: [{ label: '微塵の命中', role: 'MAIN', damageType: 'TRUE', basis: 'ATK_STAT', scale: key('atk_scale') }],
    notes: ['回転・接触・再生による命中回数は求めず、微塵1個が敵1体に命中した場合を計算する。'] })]]], [
    talent(0, '過去の塵埃', () => [status('dust', '旋回する微塵を生成し、味方への回復効果を強化')]),
    talent(1, '魔王の残響', () => [status('sarkaz-resistance', '味方が敵サルカズから受けるダメージを軽減')]),
  ]),

  // https://prts.wiki/w/三角初华: the talent is a source-less added damage event, before the triggering damage.
  // Its live coefficient is checked below because GuardValue cannot bind another talent's blackboard.
  operator('char_4184_dolris', [
    [1, [single('味方Mujicaの1ダメージ発生に付随する素質ダメージ', { actions: [
      { label: '悲しみを恐れるなかれ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', scale: 0.3 }],
      notes: ['攻撃範囲内の味方Ave Mujicaが敵へ与えるダメージ1回に付随する分のみ。味方本人の攻撃ダメージは含めない。'] })]],
    [2, [phase('dolrisDamageSource', 'SKILL', single('0.3秒周期のスキルダメージ1回', { actions: [
      { label: 'スキルの術ダメージ', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: key('attack@atk_scale') },
      { label: '悲しみを恐れるなかれ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', scale: 0.3 }],
      notes: ['本人のスキルダメージにも素質の付随ダメージが1回発生。付随分から再帰発動しない。選択した敵1体への1回分。'] })),
      phase('dolrisDamageSource', 'ALLY', single('味方Mujicaの1ダメージ発生に付随する素質ダメージ', { actions: [
        { label: '悲しみを恐れるなかれ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', scale: 0.3 }] }))],
      [select('dolrisDamageSource', '計算対象', [['SKILL', '本人のスキルダメージ'], ['ALLY', '味方Mujicaによる素質の発動']])]],
  ], [talent(0, '偽りの仮面', () => [status('healing-priority', 'スキル未発動時に治療。発動中は豊川祥子を優先して治療')]),
    talent(1, '悲しみを恐れるなかれ', v => {
      if (v.read('atk_scale') !== 0.3) v.issue('素質の追加ダメージ倍率が確認済みの30%と一致しません。')
      return [status('mujica-extra', '範囲内のAve Mujicaが敵へ与えるダメージに、三角初華の攻撃力30%の術ダメージを付随させる'),
        status('fever', '味方Ave Mujicaの治療でFeverを蓄積。Fever中の時間延長は計算しない')]
    })]),

  operator('char_4202_haruka', [
    [2, [phase('harukaHealingSource', 'MEASURED', single('治療1回に伴う術ダメージ', { maxTargets: key('max_target_extra'), actions: [
      { label: '回復量からの術ダメージ', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: 0, flatDamage: mul(input('harukaActualHealing'), key('atk_scale_extra')) }],
      notes: ['スキル発動中にハルカから受けた実際の回復量を入力する。過剰回復・被治療補正・シャボン玉生成時の攻撃力を含む回復量の算出は別途必要。1人への1回の治療から、同じ周囲範囲内の最大3体へのダメージを計算する。'] })),
      phase('harukaHealingSource', 'AUTOMATIC', pending('回復量の自動算出', '残りHP・被治療補正・シャボン玉生成時の攻撃力を含む実回復量の自動計算は未対応です。', ['スキル', '素質2']))],
      [select('harukaHealingSource', '回復量', [['MEASURED', '実回復量を指定'], ['AUTOMATIC', '自動算出']]),
        { key: 'harukaActualHealing', label: '1回の実回復量', kind: 'number', defaultValue: 100, min: 0, max: 1000000, step: 0.1 }]],
    [3, [{ ...single('シャボン玉への攻撃で付与した浮遊中の毎秒ダメージ', { maxTargets: null, atk: key('atk'), actions: [
      { label: '浮遊中の術ダメージ', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: key('atk_scale'), timing: 'PER_SECOND' }],
      notes: ['選択した全対象にハルカのスキルによる浮遊とダメージ効果が付与されている間を評価。通常の治療間隔をダメージ周期に使わない。'] }), when: { input: 'harukaLevitateActive', comparison: 'EQ', value: true } },
      { ...pending('浮遊の付与・解除', '敵の攻撃・浮遊耐性・重さ・再付与による状態推移と持続時間合計は未対応です。'), id: 'transition', when: { input: 'harukaLevitateActive', comparison: 'EQ', value: false } }],
      [bool('harukaLevitateActive', 'スキルによる浮遊が有効')]],
  ], [talent(0, '儚き水泡', () => [status('bubble', '味方へ加護を持つシャボン玉を付与。被攻撃後に破裂')]),
    talent(1, '舞い上がる花火', () => [status('bubble-heal', '破裂時にシャボン玉生成時の攻撃力を基準として味方を治療')])]),
]
