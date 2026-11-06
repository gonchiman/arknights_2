import sources from '../data/expandedSummonSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
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
const ordinary = (label: string, damageType: 'PHYSICAL' | 'ARTS' | 'TRUE', options: Partial<GuardStage> = {}): GuardStage => ({
  id: 'active', label, kind: 'NORMAL', maxTargets: 1, actions: [{ label, role: 'MAIN', damageType, scale: 1 }],
  periodTotal: { kind: 'UNSUPPORTED', reason: '選択した1体の攻撃中の値を計算し、本人と召喚物・異なる配置時刻の合算は計算しません。' }, ...options,
})
const token = (tokenKey: string, label: string, damageType: 'PHYSICAL' | 'ARTS' | 'TRUE', options: Partial<GuardStage> = {}): GuardStage =>
  ordinary(label, damageType, { actor: { kind: 'TOKEN', tokenKey }, ...options })
const phase = (input: string, value: string, stage: GuardStage): GuardStage => ({ ...stage, id: value.toLowerCase(), when: { input, comparison: 'EQ', value } })
const pending = (label: string, reason: string, options: Partial<GuardStage> = {}): GuardStage => ({ id: 'pending', label, kind: 'SKILL_ACTION',
  actions: [], unresolved: [reason], calculationIssues: [{ id: label, reason, relatedSections: ['スキル'] }], ...options })
const blocked = bool('target.blockedByOwnReinforcement', '対象が自身の援軍にブロックされている')
const actorChoice = select('summonDamageActor', '計算対象', [['TOKEN', '召喚物1体'], ['OWNER', 'オペレーター本人']])
const number = (key: string, label: string, min: number, max: number, defaultValue = min): GuardInput =>
  ({ key, label, kind: 'number', min, max, defaultValue, step: 1 })
const operator = (operatorId: string, recipes: readonly [number, readonly GuardStage[], (readonly GuardInput[])?, Pick<GuardSkillRecipe, 'conditionRequirements'>?][],
  talents: readonly ExpandedTalentDefinition[], inputs: readonly GuardInput[] = []): ExpandedOperatorDefinition => {
  const source = sources.find(item => item.operatorId === operatorId)!
  const mapped = new Set(recipes.map(([index]) => index))
  return { operatorId, phaseIndex: source.phaseIndex, skillLevelIndex: source.skillLevelIndex, inputs, talents,
    recipes: recipes.map(([skillIndex, stages, inputs = [], options = {}]) => ({ operatorId, skillIndex, inputs, ...options,
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
  operator('char_110_deepcl', [
    [1, [token(tentacle, '触手1体・スキル中', 'PHYSICAL', { atk: key('atk') })]],
    [2, [phase('summonDamageActor', 'TOKEN', token(tentacle, '触手1体・物理回避支援中', 'PHYSICAL')),
      phase('summonDamageActor', 'OWNER', ordinary('ディピカ本人・物理回避支援中', 'ARTS'))], [actorChoice]],
  ],
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
    [1, [ordinary('クロージャ本人・シールド支援中', 'PHYSICAL', {
      notes: ['指揮センターは攻撃しない。シールド・コスト増加中も続く本人の攻撃を評価。'] })]],
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
  operator('char_242_otter', [
    [1, [phase('summonDamageActor', 'TOKEN', token('token_10004_otter_motter', '機械川獺1体・回避支援中', 'PHYSICAL', { duration: 'UNTIL_EXIT' })),
      phase('summonDamageActor', 'OWNER', ordinary('メイヤー本人・回避支援中', 'ARTS', { duration: 'UNTIL_EXIT' }))], [actorChoice]],
    [2, [{ id: 'explosion', label: '機械川獺1体の爆発', kind: 'SKILL_ACTION', maxTargets: null,
    actions: [{ label: 'メイヤーの攻撃力を参照する爆発', role: 'MAIN', damageType: 'ARTS', scale: key('atk_scale') }],
    periodTotal: { kind: 'UNSUPPORTED', reason: '機械川獺1体の爆発1回。複数体の爆発範囲の重なり・SP周期は計算しません。' } }]]],
    [talent(0, 'メカ・カワウソ', () => [status('meebo', '機械川獺を召喚。ブロック中の敵の攻撃速度低下は与ダメージを増やさない')])]),

  operator('char_248_mgllan', [
    [1, [ordinary('マゼラン本人・バインド支援中', 'ARTS', {
      notes: ['フリーズモジュールのドローンはダメージを与えない。本人の通常攻撃は継続する。'] })]],
    [2, [phase('summonDamageActor', 'TOKEN', token('token_10005_mgllan_drone2', 'DDF・L 1体・スキル中', 'ARTS', {
      aspd: key('attack_speed'), maxTargets: null,
      notes: ['攻撃が命中する同じ範囲内の対象を計算。終了時のドローン回収は攻撃中のDPSへ含めない。'] })),
      phase('summonDamageActor', 'OWNER', ordinary('マゼラン本人・スキル中', 'ARTS', { aspd: key('attack_speed') }))], [actorChoice]],
    [3, [phase('summonDamageActor', 'TOKEN', token('token_10005_mgllan_drone3', 'DDF・A 1体・スキル中', 'PHYSICAL', {
      atk: key('atk'), maxTargets: null })),
      phase('summonDamageActor', 'OWNER', ordinary('マゼラン本人・スキル中', 'ARTS', { atk: key('atk') }))], [actorChoice]],
  ], [talent(0, '支援ドローン・DDF', () => [status('ddf', '装備スキルに対応したドローンを召喚。配置可能数を攻撃倍率へ加えない')]),
    talent(1, '光学迷彩カスタム', () => [status('ddf-camouflage', '配置後のドローンをステルス状態にする')])]),

  operator('char_2023_ling', [
    [1, [phase('summonDamageActor', 'TOKEN', token('token_10020_ling_soul1', '清平1体・スキル中', 'ARTS', { atk: key('atk'), aspd: key('attack_speed') })),
      phase('summonDamageActor', 'OWNER', ordinary('リィン本人・スキル中', 'ARTS', { atk: key('atk'), aspd: key('attack_speed') }))], [actorChoice]],
    [2, [phase('summonDamageActor', 'TOKEN', token('token_10020_ling_soul2', '逍遥1体・スキル発動1回', 'ARTS', { kind: 'SKILL_ACTION', maxTargets: 2,
      actions: [{ label: '逍遥のスキル攻撃', role: 'MAIN', damageType: 'ARTS', scale: key('atk_scale') }],
      periodTotal: { kind: 'UNSUPPORTED', reason: '選択した召喚物1体の発動1回のみ。他の召喚物やリィン本人との重複・再発動周期は計算しません。' } })),
      phase('summonDamageActor', 'OWNER', ordinary('リィン本人・スキル発動1回', 'ARTS', { kind: 'SKILL_ACTION', maxTargets: 2,
        actions: [{ label: 'リィンのスキル攻撃', role: 'MAIN', damageType: 'ARTS', scale: key('atk_scale') }] }))], [actorChoice]],
    // https://prts.wiki/w/“弦惊” : merged ATK +80% adds to S3's +100%; BAT is 1.5 + 0.8.
    // https://prts.wiki/w/令 : every 0.5s aura is damage sourced by Ling, not Thunderer.
    [3, [
      ...(['BASIC', 'MERGED'] as const).map(form => phase('lingS3Actor', form, token('token_10020_ling_soul3',
        form === 'BASIC' ? '弦驚1体・基本形態' : '弦驚1体・上位形態', form === 'BASIC' ? 'PHYSICAL' : 'ARTS', {
          atk: add(key('atk'), form === 'BASIC' ? 0 : 0.8), intervalAdd: form === 'BASIC' ? 0 : 0.8, maxTargets: form === 'BASIC' ? 2 : 4,
          actions: [{ label: '弦驚の通常攻撃', role: 'MAIN', damageType: form === 'BASIC' ? 'PHYSICAL' : 'ARTS', scale: 1 },
            { label: 'リィン参照・隣接4マスの継続術ダメージ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'OWNER_ATK_STAT',
              scale: key('atk_scale'), timing: 'PER_SECOND', hits: { op: 'if', input: 'targetInLingAura', comparison: 'EQ', value: true, yes: 2, no: 0 } }],
          notes: ['複数対象時は弦驚にブロックされ、全対象が同じ継続ダメージ範囲条件の地上敵。通常攻撃と0.5秒の継続ダメージを別々に軽減。合体の80%はリィンに加えない。'] }))),
      phase('lingS3Actor', 'AURA', token('token_10020_ling_soul3', '弦驚1体の隣接4マス・継続ダメージ1回', 'ARTS', {
        kind: 'SKILL_ACTION', maxTargets: null, actions: [{ label: 'リィン参照・継続術ダメージ1回', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'OWNER_ATK_STAT', scale: key('atk_scale') }],
        notes: ['隣接4マス内の地上敵への1回。弦驚の攻撃や他の弦驚との範囲重複は合算しない。'] })),
      phase('lingS3Actor', 'OWNER', ordinary('リィン本人・スキル中', 'ARTS', { atk: key('atk') })),
    ], [select('lingS3Actor', '計算対象', [['BASIC', '弦驚・基本形態'], ['MERGED', '弦驚・上位形態'], ['AURA', '継続ダメージ1回'], ['OWNER', 'リィン本人']]),
      bool('targetInLingAura', '通常攻撃の対象が隣接4マス内', true)], {
      conditionRequirements: [{ when: { input: 'lingS3Actor', comparison: 'EQ', value: 'MERGED' },
        condition: { input: 'lingRefundStacks', comparison: 'GTE', value: 1 }, reason: '合体で召喚物を吸収するため、上位形態ではリィンの攻撃力上昇が1回以上必要です。' }],
    }],
  ], [talent(0, '灯を挑げ夢に問い', () => [status('ling-summon', 'スキルごとに異なる召喚物を使用')]),
    talent(1, '酔吟の興、ここに極まれり', v => [{ ...ctx('ling-refund-atk', 'atk'), item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
      value: { type: 'CALC', operation: 'MULTIPLY', values: [v.read('atk'), { type: 'METRIC', metric: 'lingRefundStacks' }] } },
      status('ling-refund-sp', '撃破・吸収・回収時にリィン本人のSPを回復。攻撃力上昇はリィン本人にだけ適用')])],
    [number('lingRefundStacks', 'リィンの攻撃力上昇の重複数', 0, 5)]),

  // https://prts.wiki/w/凯尔希 : the S2 ASPD belongs to Kal'tsit; Mon3tr only gains ATK.
  operator('char_003_kalts', ([1, 2, 3] as const).map(index => [index, [
    phase('mon3trEvent', 'ATTACK', token('token_10002_kalts_mon3tr', index === 3 ? 'Mon3tr・攻撃力+260%の時点の1攻撃' : 'Mon3tr 1体・スキル中', index === 3 ? 'TRUE' : 'PHYSICAL', index === 3
      ? { kind: 'SKILL_ACTION', atk: key('attack@atk'), notes: ['260%が適用されている時点の1回。毎秒更新される減衰途中の攻撃力や、20秒間のDPS・総量は算出しない。'] }
      : index === 2
      ? { atk: key('attack@atk'), maxTargets: 3, notes: ['複数対象を指定する場合、全対象がMon3trにブロックされている状態。攻撃速度+100はケルシーの治療にだけ適用。'] }
      : { notes: ['防御力上昇中もMon3trは通常攻撃を続ける。ケルシーの治療や物理回避は与ダメージに加えない。'] })),
    ...(index === 3 ? [phase('mon3trEvent', 'DECAY', pending('Mon3tr・攻撃力減衰中', '攻撃力の上昇は毎秒更新されますが、減衰曲線と更新時点の適用順は未確認です。', {
      actor: { kind: 'TOKEN', tokenKey: 'token_10002_kalts_mon3tr' } }))] : []),
    phase('mon3trEvent', 'DEATH', { id: 'death', label: 'Mon3tr死亡時・素質の爆発1回', kind: 'SKILL_ACTION', maxTargets: null,
      actor: { kind: 'TOKEN', tokenKey: 'token_10002_kalts_mon3tr' },
      actions: [{ label: 'ブレークリビルド', role: 'ADDITIONAL', damageType: 'TRUE', basis: 'ATK_STAT', scale: 0, flatDamage: 1200 }],
      periodTotal: { kind: 'UNSUPPORTED', reason: '死亡時の素質ダメージ1回。手動撤退では発生しません。死亡頻度は計算しません。' } }),
  ], [select('mon3trEvent', '計算対象', index === 3
    ? [['ATTACK', '攻撃力+260%時の1攻撃'], ['DECAY', '攻撃力減衰中'], ['DEATH', 'Mon3tr死亡時の爆発']]
    : [['ATTACK', 'Mon3trの攻撃'], ['DEATH', 'Mon3tr死亡時の爆発']])]]),
  [talent(0, 'Mon3tr', () => [status('mon3tr', 'Mon3trを配置・治療可能。ケルシーの範囲外でMon3trの防御力が0になる')]),
    talent(1, 'ブレークリビルド', () => [status('mon3tr-death', '死亡時の1200確定ダメージは専用の段階で評価。生存中の攻撃へ重複加算しない')])]),

  // https://prts.wiki/w/伺夜 : S1 revives at 0, adds one at 1/2, and heals without a fourth wolf at 3.
  operator('char_427_vigil', [
    [1, [token('token_10028_vigil_wolf', '狼の群れ・スキル発動後', 'PHYSICAL', { duration: 'UNTIL_EXIT',
      actions: [{ label: '増加後の狼の隻影による連撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1,
        hits: { op: 'min', args: [3, add(input('wolfCountBeforeSkill'), 1)] } }],
      notes: ['発動直前の隻影数から発動後の攻撃回数を計算。0体は1体に復活、3体時は全回復だけで4体にならない。以後の自然増加・致命傷による減少は含めない。'] })],
      [number('wolfCountBeforeSkill', '発動直前の狼の隻影数', 0, 3, 1)]],
    [2, [token('token_10028_vigil_wolf', '狼の群れ・強化された次の1攻撃', 'PHYSICAL', { kind: 'NEXT_ATTACK',
    actions: [{ label: '狼の隻影による連撃', role: 'MAIN', damageType: 'PHYSICAL', scale: key('vigil_wolf_s_2.atk_scale'), hits: input('wolfCount') }],
    notes: ['指定した狼の隻影数が1攻撃中に変化しない状態。ブロック数は連撃数を決めるが、攻撃対象数は1体。'] })], [number('wolfCount', '狼の隻影の数', 1, 3, 2)]],
    // https://prts.wiki/w/伺夜 : only Vigil's own extra arts damage receives the tactician trait.
    [3, [phase('summonDamageActor', 'TOKEN', token('token_10028_vigil_wolf', '狼の群れ・スキル中', 'PHYSICAL', {
      actions: [{ label: '狼の隻影による連撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1, hits: input('wolfCount') },
        { label: 'ヴィジェルの攻撃力を参照する術追撃', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'OWNER_ATK_STAT', scale: key('attack@vigil_s_3.atk_scale'),
          hits: { op: 'if', input: blocked.key, comparison: 'EQ', value: true, yes: input('wolfCount'), no: 0 } }],
      notes: ['狼の命中ごとに術追撃。狼の攻撃力・狼への攻撃倍率をヴィジェル参照部分に使用しない。'] })),
      phase('summonDamageActor', 'OWNER', ordinary('ヴィジェル本人・スキル中', 'PHYSICAL', {
        actions: [{ label: '本人の3連撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1, hits: 3 },
          { label: '本人の術追撃', role: 'ADDITIONAL', damageType: 'ARTS', scale: key('attack@vigil_s_3.atk_scale'),
            hits: { op: 'if', input: blocked.key, comparison: 'EQ', value: true, yes: 3, no: 0 } }] }))],
      [actorChoice, number('wolfCount', '狼の隻影の数', 1, 3, 2)]],
  ],
    [talent(0, '群狼の統率者', () => [status('wolf-count', '狼の隻影の数に応じてブロック数と攻撃回数が増加。致命傷で減少')]),
      talent(1, '飢えたる群狼', v => {
        // The same penetration exists on the token's independently validated talent source.
        if (v.read('def_penetrate_fixed') !== 175) v.issue('本人と狼の群れの確認済み防御無視175が一致しません。')
        return [{ ...ctx('wolf-defense-ignore', 'def_penetrate_fixed'),
          condition: { type: 'COMPARE', metric: 'target.blockedByOwnReinforcement', comparison: 'EQ', value: true },
          item: 'DEFENSE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT', value: v.read('def_penetrate_fixed') }]
      })], [{ ...blocked, defaultValue: true }]),

  operator('char_452_bstalk', [[2, [token('token_10014_bstalk_crab', 'ハガネガニ1体・スキル中', 'PHYSICAL', {
    notes: ['スキルで召喚したハガネガニ1体の攻撃。配置可能マス数とカニの同時命中数を攻撃倍率にしない。防御力70%を攻撃力へ加えない。'] })]]],
    [talent(0, 'プロブリーダー', () => [status('crab', 'ハガネガニを召喚。死亡後の復活周期は攻撃中のDPSへ含めない')])]),

  // https://prts.wiki/w/Radian : inspiration uses Radian's final ATK, updates every second,
  // and is a final addition to each token. S3's Slow / arts vulnerability precede its damage.
  operator('char_4195_radian', [
    [1, [phase('summonDamageActor', 'TOKEN', token('token_10051_radian_tower1', 'ダイウ1体・バリア展開中', 'PHYSICAL', {
      notes: ['3体ブロックは攻撃対象数ではなく、通常攻撃は1体。鼓舞の攻撃力はレイディアンの12%を最終加算。'] })),
      phase('summonDamageActor', 'OWNER', ordinary('レイディアン本人・バリア展開中', 'ARTS'))], [actorChoice]],
    [2, [phase('summonDamageActor', 'TOKEN', token('token_10052_radian_tower2', 'サイガ1体・鼓舞更新後の命中', 'PHYSICAL', {
      atk: key('atk'), actions: [{ label: '選択した地上敵1体に命中した弾', role: 'MAIN', damageType: 'PHYSICAL', scale: 1, hits: input('radianBulletHits') }],
      dpsUnsupportedReason: '選択した敵1体に命中する弾数で評価します。弾道・次の発射時の命中対象を含むDPSは未対応です。',
      notes: ['発射する3発を自動的に同じ敵へ命中させない。指定した命中数だけを個別に軽減する。本人への80%と召喚物への80%を別計算した後、鼓舞を最終加算。'] })),
      phase('summonDamageActor', 'OWNER', ordinary('レイディアン本人・スキル中', 'ARTS', { atk: key('atk') }))],
      [actorChoice, number('radianBulletHits', '1回の発射で対象に命中した弾数', 1, 3)]],
    [3, [phase('radianS3Actor', 'TOKEN', token('token_10053_radian_tower3', 'サントラ1体・鼓舞更新後の通常攻撃', 'ARTS', {
      atk: key('atk'), actions: [{ label: 'サントラの術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1,
        damageScaleWhenType: { damageType: 'ARTS', scale: key('damage_scale') } }] })),
      phase('radianS3Actor', 'COOPERATIVE', token('token_10053_radian_tower3', 'サントラ1体・鼓舞更新後の連携1回', 'ARTS', {
        kind: 'SKILL_ACTION', atk: key('atk'), actions: [{ label: 'サントラの連携術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1,
          damageScaleWhenType: { damageType: 'ARTS', scale: key('damage_scale') } }],
        notes: ['攻撃可能状態で、範囲内の他の召喚物に連携する1体の1回。誘発元の攻撃と合算しない。'] })),
      phase('radianS3Actor', 'OWNER', ordinary('レイディアン本人・スキル中', 'ARTS', { atk: key('atk'),
        actions: [{ label: 'レイディアンの術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1,
          damageScaleWhenType: { damageType: 'ARTS', scale: key('attack@damage_scale') } }] }))],
      [select('radianS3Actor', '計算対象', [['TOKEN', 'サントラの通常攻撃'], ['COOPERATIVE', 'サントラの連携攻撃1回'], ['OWNER', 'レイディアン本人']])]],
  ], [talent(0, 'ゲーム仕込みのアイデア', () => [status('radian-summon', 'スキルごとに異なる召喚物を使用')]),
    talent(1, 'がんばれ～', v => {
      if (v.read('atk') !== 0.12) v.issue('確認済みの召喚物への攻撃力鼓舞12%と一致しません。')
      return [status('radian-inspiration', '召喚物にレイディアン本人の攻撃力・防御力・HPの12%を鼓舞として最終加算。本人は鼓舞を受けない')]
    })]),

  operator('char_249_mlyss', ([1, 2, 3] as const).map(index => [index, [
    phase('mlyssActor', 'OWNER', ordinary('ミュルジス本人・スキル中', 'PHYSICAL', { atk: key('atk'), ...(index === 1 ? { aspd: key('attack_speed') } : {}),
      notes: ['本人に適用される攻撃力・攻撃速度上昇を評価。コピーしたオペレーターのステータスや水影の攻撃を混ぜない。'] })),
    phase('mlyssActor', 'TOKEN', pending('うつろう水影の攻撃', 'コピー元のステータス・近接時の奪取・遠距離時の分裂と命中先を含む評価は未対応です。')),
  ], [select('mlyssActor', '計算対象', [['OWNER', 'ミュルジス本人'], ['TOKEN', 'うつろう水影']])]]),
    [talent(0, '清き水、即ち命なり', () => [status('flowing-shape', 'うつろう水影によるコピーは専用段階で区別。本人のステータスを変更しない')]),
      talent(1, '開源節流', () => [status('rhine-cost', 'ライン生命の配置コストを軽減。攻撃性能へ加算しない')])], [blocked]),
]
