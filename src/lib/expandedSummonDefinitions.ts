import sources from '../data/expandedSummonSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardInput, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { CombatEffectContext } from './combatEffectStructure.ts'
import type { TalentStructureEffect } from './talentStructure.ts'

const key = (key: string): GuardValue => ({ key })
const input = (input: string): GuardValue => ({ input })
const add = (...args: GuardValue[]): GuardValue => ({ op: 'add', args })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const bool = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const select = (key: string, label: string, options: readonly [string, string][]): GuardInput => ({ key, label, kind: 'select',
  defaultValue: options[0][0], options: options.map(([value, label]) => ({ value, label })) })
const ctx = (id: string, sourceBinding = `description:${id}`): CombatEffectContext => ({ id, sourceBinding,
  timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
  target: { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true, factionIds: [], tagIds: [], selection: { type: 'ALL' } },
  probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [] })
const status = (id: string, text: string): TalentStructureEffect => ({ ...ctx(id), item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: text })
const talent = (index: number, name: string, effects: ExpandedTalentDefinition['effects']): ExpandedTalentDefinition =>
  ({ talentIndex: index, name, prefabKey: String(index + 1), categories: ['ABILITY'], effects })
const ordinary = (label: string, damageType: 'PHYSICAL' | 'ARTS', options: Partial<GuardStage> = {}): GuardStage => ({
  id: 'active', label, kind: 'NORMAL', maxTargets: 1, actions: [{ label, role: 'MAIN', damageType, scale: 1 }],
  periodTotal: { kind: 'UNSUPPORTED', reason: '選択した1体の攻撃中の値を計算し、本人と召喚物・異なる配置時刻の合算は計算しません。' }, ...options,
})
const token = (tokenKey: string, label: string, damageType: 'PHYSICAL' | 'ARTS', options: Partial<GuardStage> = {}): GuardStage =>
  ordinary(label, damageType, { actor: { kind: 'TOKEN', tokenKey }, ...options })
const phase = (input: string, value: string, stage: GuardStage): GuardStage => ({ ...stage, id: value.toLowerCase(), when: { input, comparison: 'EQ', value } })
const pending = (label: string, reason: string, options: Partial<GuardStage> = {}): GuardStage => ({ id: 'pending', label, kind: 'SKILL_ACTION',
  actions: [], unresolved: [reason], calculationIssues: [{ id: label, reason, relatedSections: ['スキル'] }], ...options })
const blocked = bool('target.blockedByOwnReinforcement', '対象が自身の援軍にブロックされている')
const operator = (operatorId: string, recipes: readonly [number, readonly GuardStage[], (readonly GuardInput[])?][],
  talents: readonly ExpandedTalentDefinition[], inputs: readonly GuardInput[] = []): ExpandedOperatorDefinition => {
  const source = sources.find(item => item.operatorId === operatorId)!
  const mapped = new Set(recipes.map(([index]) => index))
  return { operatorId, phaseIndex: source.phaseIndex, skillLevelIndex: source.skillLevelIndex, inputs, talents,
    recipes: recipes.map(([skillIndex, stages, inputs = []]) => ({ operatorId, skillIndex, inputs,
      stages: stages.map(stage => ({ ...stage, duration: stage.duration ?? source.skills.find(skill => skill.skillIndex === skillIndex)!.raw.duration })) })),
    deferredSkills: source.skills.filter(skill => !mapped.has(skill.skillIndex)).map(skill => ({ skillIndex: skill.skillIndex,
      reason: '回避・防御支援と召喚物の戦場状態を含む評価範囲は個別確認待ちです。' })) }
}
const scene = 'token_10010_folivo_car', tentacle = 'token_10001_deepcl_tentac', bird = 'token_10036_lasher_mcbird', hypnos = 'token_10021_blkngt_hypnos'

/** Each token stage is one living summon. Owner-referenced explosions deliberately keep owner stats. */
export const EXPANDED_SUMMON_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  operator('char_336_folivo', [
    [1, [token(scene, '撮影ロボット1体・擬態化中', 'PHYSICAL', { atk: key('atk'), duration: 'UNTIL_EXIT' })]],
    [2, [token(scene, '撮影ロボット1体・スキル中', 'PHYSICAL', { atk: key('atk'), notes: ['終了後の5秒スタンを攻撃中のDPSへ含めない。'] })]],
  ], [talent(0, 'ロボット撮影隊', () => [status('camera', '撮影ロボットを召喚し、周囲のステルスを無効化。台数を攻撃倍率にしない')])]),
  operator('char_110_deepcl', [[1, [token(tentacle, '触手1体・スキル中', 'PHYSICAL', { atk: key('atk') })]]],
    [talent(0, '触手召喚', () => [status('tentacle', '触手を召喚。触手自身のステータスを使用')])]),
  operator('char_4140_lasher', [
    [1, [phase('lasherActor', 'TOKEN', token(bird, 'カラクリ羽獣1体・スキル中', 'ARTS', { aspd: key('attack_speed') })),
      phase('lasherActor', 'OWNER', ordinary('サンドレコナー本人・スキル中', 'ARTS', { aspd: key('attack_speed') }))],
      [select('lasherActor', '計算対象', [['TOKEN', 'カラクリ羽獣1体'], ['OWNER', 'サンドレコナー本人']])]],
    [2, [token(bird, 'カラクリ羽獣1体・スキル中', 'ARTS', { atk: key('atk') })]],
  ], [talent(0, '職人の遺訓', v => [status('mechanical-bird', 'カラクリ羽獣を召喚。敵機械への補正は本人・カラクリ羽獣それぞれに1回適用'),
    { ...ctx('mechanical-damage', 'damage_scale'), condition: { type: 'COMPARE', metric: 'targetMechanical', comparison: 'EQ', value: true },
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('damage_scale') }])], [bool('targetMechanical', '対象が機械')]),
  // https://prts.wiki/w/Blacknight : rage is 55% of base ASPD; no external token ASPD is modeled.
  operator('char_476_blkngt', [
    [1, [phase('hypnosState', 'AWAKE', token(hypnos, '眠獣1体・休眠解除後10秒', 'PHYSICAL', {
      atk: key('blkngt_hypnos_s_1[rage].atk'), aspd: mul(100, key('blkngt_hypnos_s_1[rage].attack_speed')),
      duration: key('blkngt_hypnos_s_1[rage].duration') })),
      phase('hypnosState', 'DORMANT', pending('眠獣・休眠中', '休眠中の眠獣は攻撃しません。休眠解除後の攻撃を選択してください。', { actor: { kind: 'TOKEN', tokenKey: hypnos } }))],
      [select('hypnosState', '眠獣の状態', [['AWAKE', '休眠解除後10秒'], ['DORMANT', '休眠中']])]],
    [2, [token(hypnos, '眠獣1体・範囲術攻撃中', 'ARTS', { maxTargets: null, duration: key('blkngt_s_2.duration'),
      actions: [{ label: '眠獣の範囲術攻撃', role: 'MAIN', damageType: 'ARTS', scale: { op: 'if', input: 'targetAsleep', comparison: 'EQ', value: true,
        yes: key('blkngt_s_2.atk_scale'), no: 1 } }],
      notes: ['眠獣が生存し、全対象が同じ睡眠状態で範囲攻撃に巻き込まれる地上の敵。睡眠無効の敵にも術攻撃化は適用。本人の150%特性は眠獣へ引き継がない。'] })],
      [bool('targetAsleep', '対象が睡眠中', true)]],
  ], [talent(0, '夜行', () => [status('hypnos', '眠獣を召喚。死亡後の再召喚時間を攻撃中のDPSへ含めない')])]),
  // https://m.prts.wiki/w/渡桥 : S1 is damage sourced by Mitm, before wrecks spawn.
  operator('char_4147_mitm', [
    [1, [{ id: 'explosion', label: 'チェリー3号1体の爆発', kind: 'SKILL_ACTION', maxTargets: null,
      actions: [{ label: 'ミトムの攻撃力を参照する爆発', role: 'MAIN', damageType: 'PHYSICAL', scale: key('aoe_damage_scale') }],
      periodTotal: { kind: 'UNSUPPORTED', reason: '生存中のチェリー3号を破壊した爆発1回のみ。SP回復・再召喚を含む周期は計算しません。' },
      notes: ['爆発前から援軍にブロックされている敵だけに特性150%を適用。爆発後に生成する残骸のブロックを先取りしない。'] }]],
    [2, [ordinary('ミトム本人・スキル中', 'PHYSICAL', { atk: key('atk'), maxTargets: key('attack@max_target'),
      notes: ['スキル中のチェリー3号は攻撃停止。防御・HP補正を本人の攻撃力に加えない。'] })]],
  ], [talent(0, 'ガラクタの戦車', () => [status('cherry', 'チェリー3号の召喚・破壊後の残骸生成。残骸は攻撃しない')])], [blocked]),
  operator('char_4228_closur', [
    [2, [ordinary('クロージャ本人・スキル中', 'PHYSICAL', { atk: key('atk'), maxTargets: key('attack@max_target') })]],
    [3, [ordinary('クロージャ本人・選択した対象数段階', 'PHYSICAL', { intervalAdd: key('base_attack_time'), maxTargets: add(1, input('closureTargetStacks')),
      actions: [{ label: 'ロックオン攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: key('attack@atk_scale') }],
      notes: ['指定時点の攻撃対象数で1攻撃を計算。9攻撃ごとの対象数増加・全期間の合算は別途必要。'] })],
      [{ key: 'closureTargetStacks', label: '攻撃対象数の増加回数', kind: 'number', defaultValue: 0, min: 0, max: 6, step: 1 }]],
  ], [talent(0, 'スマートデプロイ', () => [status('command-center', '指揮センターは攻撃しない。範囲内の味方を援軍として扱う')]),
    talent(1, '極限スケジューリング', v => [{ ...ctx('rhodes-atk', 'atk'),
      target: { ...ctx('rhodes-atk').target, side: 'ALLY', scope: 'SQUAD', factionIds: ['rhodes'] },
      item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('atk') },
      status('dp-lower-bound', '所持コスト下限-3。本人の攻撃力へ加算しない')])], [blocked]),
  operator('char_242_otter', [[2, [{ id: 'explosion', label: '機械川獺1体の爆発', kind: 'SKILL_ACTION', maxTargets: null,
    actions: [{ label: 'メイヤーの攻撃力を参照する爆発', role: 'MAIN', damageType: 'ARTS', scale: key('atk_scale') }],
    periodTotal: { kind: 'UNSUPPORTED', reason: '機械川獺1体の爆発1回。複数体の爆発範囲の重なり・SP周期は計算しません。' } }]]],
    [talent(0, 'メカ・カワウソ', () => [status('meebo', '機械川獺を召喚。ブロック中の敵の攻撃速度低下は与ダメージを増やさない')])]),
]
