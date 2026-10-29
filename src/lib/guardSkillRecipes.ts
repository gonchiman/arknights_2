import type { DamageType } from './damageCalculator.ts'
import type { GuardCalculationSection, GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'

const k = (key: string): GuardValue => ({ key })
const i = (input: string): GuardValue => ({ input })
const add = (...args: GuardValue[]): GuardValue => ({ op: 'add', args })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const min = (...args: GuardValue[]): GuardValue => ({ op: 'min', args })
const max = (...args: GuardValue[]): GuardValue => ({ op: 'max', args })
const choose = (input: string, value: number | boolean | string, yes: GuardValue, no: GuardValue,
  comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): GuardValue => ({ op: 'if', input, comparison, value, yes, no })
const n = (key: string, label: string, defaultValue: number, min = 0, max = 100, step = 1): GuardInput =>
  ({ key, label, kind: 'number', defaultValue, min, max, step })
const b = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const a = (damageType: DamageType, scale: GuardValue = 1, hits: GuardValue = 1,
  rest: Partial<GuardDamageAction> = {}): GuardDamageAction => ({ label: '攻撃', damageType, scale, hits, ...rest })
const stage = (damageType: DamageType, rest: Partial<GuardStage> = {}): GuardStage => ({
  id: 'active', label: 'スキル中', kind: 'NORMAL', actions: [a(damageType)], ...rest,
})
const next = (damageType: DamageType, scale: GuardValue, hits: GuardValue = 1, rest: Partial<GuardStage> = {}): GuardStage =>
  stage(damageType, { label: '強化攻撃', kind: 'NEXT_ATTACK', actions: [a(damageType, scale, hits)], ...rest })
const burst = (damageType: DamageType, scale: GuardValue, hits: GuardValue = 1, rest: Partial<GuardStage> = {}): GuardStage =>
  stage(damageType, { label: '発動1回', kind: 'SKILL_ACTION', actions: [a(damageType, scale, hits)], ...rest })
const phase = (...values: [string, string][]): GuardInput => ({ key: 'phase', label: '計算する段階', kind: 'select',
  defaultValue: values[0][0], options: values.map(([value, label]) => ({ value, label })) })
const at = (value: string, item: GuardStage): GuardStage => ({ ...item, id: value, when: { input: 'phase', comparison: 'EQ', value } })
const pending = (id: string, reason: string, relatedSections: readonly GuardCalculationSection[] = ['スキル']) =>
  ({ unresolved: [reason], calculationIssues: [{ id, reason, relatedSections }] })
const make = (operatorId: string, skillIndex: number, stages: GuardStage[], inputs: GuardInput[] = [], notes: string[] = []): GuardSkillRecipe =>
  ({ operatorId, skillIndex, inputs, stages, notes })
const hp = () => n('selfHpPercent', '自身のHP（%）', 100, 0, 100, 0.1)
const activations = () => n('skillActivationCount', 'スキル発動回数', 1, 1, 100)
const stacks = (max: number, label = '攻撃による累積数') => n('attackStacks', label, 0, 0, max)
const blocked = () => b('targetBlocked', '対象が味方にブロックされている')
const PHYS = 'PHYSICAL', ARTS = 'ARTS', TRUE = 'TRUE'

/** Reviewed 特化3 recipes. Text is retained in the source snapshot, never executed as a formula. */
export const GUARD_SKILL_RECIPES: readonly GuardSkillRecipe[] = [
  make('char_264_f12yin', 1, [next(PHYS, k('atk_scale'), 1, { maxTargets: k('max_target') })]),
  make('char_264_f12yin', 2, [
    at('initial', stage(PHYS, { label: '初期状態', maxTargets: 1 })),
    at('stance', stage(PHYS, { label: '猛虎の構え', atk: k('atk'), maxTargets: 2, duration: 'UNTIL_EXIT' })),
  ], [phase(['initial', '初期状態'], ['stance', '猛虎の構え'])], ['回復・防御低下は直接ダメージに加算しない。構え中は自身がブロック中の敵を対象とする。']),
  make('char_264_f12yin', 3, [stage(PHYS, { atk: k('atk'), intervalAdd: k('base_attack_time'),
    maxTargets: k('attack@max_target'), duration: 30, actions: [a(PHYS, 1, 2)],
    notes: ['突き飛ばし後も同じ敵が射程内にいる条件の1攻撃・DPS。'] })]),

  make('char_2024_chyue', 1, [burst(PHYS, k('atk_scale'), choose('charges', 3, 3, 1), { maxTargets: 1 })],
    [n('charges', '発動前のチャージ数', 1, 1, 3)]),
  make('char_2024_chyue', 2, [burst(PHYS, 1, 1, { maxTargets: k('max_target'), actions: [
    a(PHYS, k('atk_scale'), 1, { label: '初撃' }),
    a(PHYS, k('atk_scale_down'), 1, { label: '浮遊解除時', targets: i('levitatedTargets') }),
  ], ...pending('chyue-s2-levitation-talent-order', '第一素質の発動・再発動と浮遊解除ダメージの増幅順序を確認する必要があります。', ['スキル', '素質1']) })],
    [n('levitatedTargets', '浮遊解除の対象数', 0, 0, 4)]),
  make('char_2024_chyue', 3, [burst(PHYS, k('atk_scale'), choose('enhancedMode', true, 2, 1),
    { maxTargets: null, notes: ['合計5回発動による強化後の状態を選択する。5回目の発動中の切替時刻を推定しない。強化後もスキル発動1回の値で、通常攻撃・SP回復を含む周期DPSは含めない。'] })], [b('enhancedMode', '強化後の状態')]),

  make('char_4037_demetr', 1, [next(PHYS, k('atk_scale'), 2)]),
  make('char_4037_demetr', 2, [stage(PHYS, { aspd: k('attack_speed'), maxTargets: k('attack@max_target'),
    duration: 22, actions: [a(PHYS, k('attack@atk_scale'))] })]),
  make('char_4037_demetr', 3, [stage(PHYS, { atk: k('attack@demetr_s3[bonus].atk'),
    aspd: k('attack@demetr_s3[bonus].attack_speed'), duration: 30, actions: [
      a(PHYS, 1, 1, { label: '通常打撃', probability: add(1, mul(-1, k('attack@demetr_s3[bonus].prob'))) }),
      a(PHYS, k('attack@demetr_s3[bonus].prob_atk_scale'), 1, { label: '強化打撃', probability: k('attack@demetr_s3[bonus].prob') }),
    ], notes: ['同一の対象へ攻撃し続ける条件。移動・再選択・退場による攻撃中断は含めない。'] })]),

  make('char_4082_qiubai', 1, [next(PHYS, 1, 1, { traitOverrides: ['ATTACK_SCALE'], maxTargets: null, actions: [
    a(PHYS, 1, 1, { label: '通常攻撃', targets: 1 }), a(ARTS, k('aoe_scale'), 1, { label: 'バインド終了時' }),
  ], notes: ['対象がバインド終了まで生存し、同じ範囲内にいる条件。遅延ダメージを含む強化攻撃1回。'] })]),
  make('char_4082_qiubai', 2, [
    at('normal', stage(PHYS, { atk: k('atk'), duration: 5 })),
    at('start', burst(ARTS, k('sword_begin_atk_scale'), 1, { label: '発動時', traitOverrides: ['ATTACK_SCALE'], maxTargets: null })),
    at('end', burst(PHYS, k('sword_end_atk_scale'), 1, { label: '終了時', traitOverrides: ['ATTACK_SCALE'], atk: k('atk'), maxTargets: null })),
  ], [phase(['normal', '通常攻撃'], ['start', '発動時'], ['end', '終了時'])], ['地上の敵を対象とする。発動時・通常攻撃・終了時は別々に評価する。']),
  make('char_4082_qiubai', 3, [stage(ARTS, { atk: k('atk'), attackTreatment: 'MELEE', traitOverrides: ['DAMAGE_TYPE'],
    aspd: mul(k('attack_speed'), i('attackStacks')), maxTargets: 3, duration: 30,
    actions: [a(ARTS)] })], [stacks(8)], ['選択した累積数における攻撃性能。累積までの時間を積分した総ダメージではない。']),

  make('char_4182_oblvns', 1, [burst(ARTS, 1, 1, { maxTargets: 1,
    actions: Array.from({ length: 8 }, (_, index) => a(ARTS, k(index === 0 ? 'atk_scale' : `atk_scale_${index + 1}`), 1,
      { label: `第${index + 1}音符` })), notes: ['8つの音符すべてが同一対象に命中する条件。'] })]),
  make('char_4182_oblvns', 2, [
    at('piano', stage(PHYS, { label: 'ピアノ', atk: k('attack@atk'), maxTargets: null,
      actions: [a(PHYS, 1, choose('fever', true, 2, 1))], ...pending('oblvns-s2-piano-hit-frequency', '音符の貫通・飛行・命中頻度を通常攻撃間隔へ換算する規則が未確定です。') })),
    at('organ', stage(ARTS, { label: 'オルガン', aspd: k('attack@attack_speed'),
      actions: [a(ARTS, 1, choose('fever', true, 2, 1))], ...pending('oblvns-s2-organ-hit-frequency', '音符の飛行・命中頻度を通常攻撃間隔へ換算する規則が未確定です。') })),
  ], [phase(['piano', 'ピアノ'], ['organ', 'オルガン']), b('fever', 'Fever状態')]),
  make('char_4182_oblvns', 3, [stage(ARTS, { duration: 25, actions: [
    a(PHYS, k('attack@atk_scale'), 2, { label: 'ピアノの音符', targets: 1 }),
    a(ARTS, k('attack@atk_scale'), 2, { label: 'オルガンの音符', targets: 1 }),
  ], ...pending('oblvns-s3-note-targets', '異なる敵を追尾する音符の命中先と継続時間中の再命中頻度が未確定です。') })]),

  make('char_4088_hodrer', 1, [next(PHYS, k('atk_scale'))], [], ['攻撃後の最大HP25%回復は直接ダメージに加算しない。']),
  make('char_4088_hodrer', 2, [
    at('initial', stage(PHYS, { label: '初期状態', atk: k('atk'), duration: 'UNTIL_EXIT' })),
    at('stance', stage(PHYS, { label: '切替後', atk: k('atk'), intervalAdd: k('base_attack_time'), blockCountAdd: k('block_cnt'), duration: 'UNTIL_EXIT' })),
  ], [phase(['initial', '初期状態'], ['stance', '切替後'])], ['スキルのパッシブ攻撃力増加は両状態に適用。スタン成功を確定せず、素質の状態条件入力を使う。']),
  make('char_4088_hodrer', 3, [
    at('normal', stage(PHYS, { atk: k('atk'), duration: 70, actions: [a(PHYS),
      a(TRUE, 0, 1, { flatDamage: k('attack@damage'), timing: 'PER_SECOND', traitOverrides: ['DAMAGE_TYPE', 'HIT_COUNT', 'ATTACK_SCALE', 'SPLASH_DAMAGE'], label: '付与中の毎秒確定ダメージ' })] })),
    at('dot', burst(TRUE, 0, 1, { label: '付与中の毎秒ダメージ', maxTargets: null,
      actions: [a(TRUE, 0, 1, { flatDamage: k('attack@damage'), label: '1秒分の確定ダメージ' })] })),
  ], [phase(['normal', '通常攻撃'], ['dot', '付与中の1秒分'])], ['確定ダメージ付与済みの敵を指定する。HP減少、回復、敵の出入り、付与時間全体の積分は含めない。']),

  make('char_4145_ulpia', 1, [burst(PHYS, k('atk_scale'), 1, { maxTargets: k('max_target') })], [], ['引き寄せによる位置変化後の追加攻撃は含めない。']),
  make('char_4145_ulpia', 2, [stage(PHYS, { atk: k('atk'), blockCountAdd: k('block_cnt'), duration: 'UNTIL_EXIT' })], [], ['スキルによる第一素質の回復強化は直接ダメージを変えない。']),
  make('char_4145_ulpia', 3, [
    at('normal', stage(PHYS, { atk: k('atk'), duration: 25 })),
    at('anchor', burst(PHYS, k('atk_scale'), 1, { label: '錨の着弾', atk: k('atk'), maxTargets: null })),
  ], [phase(['normal', '通常攻撃'], ['anchor', '錨の着弾'])], ['着弾攻撃と継続する通常攻撃を分けて計算。移動による攻撃中断は含めない。']),

  make('char_4058_pepe', 1, [next(PHYS, k('atk_scale'))], [], ['範囲攻撃の主対象と周辺対象の倍率は特性から別々に処理する。']),
  make('char_4058_pepe', 2, [stage(PHYS, { atk: k('atk'), aspd: add(k('attack_speed'),
    mul(k('attack_speed_extra'), min(2, add(i('skillActivationCount'), -1)))), duration: 18 })], [activations()],
    ['指定した命中対象数での1攻撃。ランダム主対象の変更を含む移動シミュレーションは行わない。']),
  make('char_4058_pepe', 3, [stage(PHYS, { atk: add(k('atk'), mul(k('attack@atk'), i('attackStacks'))),
    intervalAdd: k('base_attack_time'), duration: 40 })], [stacks(4)], ['選択した累積数と命中対象数での性能。スタン・範囲拡大による敵の位置変化は含めない。']),

  make('char_1051_headb2', 1, [stage(PHYS, { atk: k('atk'), aspd: k('attack_speed'), duration: 30 })]),
  make('char_1051_headb2', 2, [
    { ...stage(PHYS, { atk: k('atk'), duration: 16 }), id: 'first', label: '初回',
      when: { input: 'skillActivationCount', comparison: 'EQ', value: 1 } },
    { ...stage(PHYS, { atk: k('headb2_s_2[second].atk'), duration: 'UNTIL_EXIT' }), id: 'later', label: '2回目以降',
      when: { input: 'skillActivationCount', comparison: 'GTE', value: 2 } },
  ], [activations()]),
  make('char_1051_headb2', 3, [burst(PHYS, 1, 1, { maxTargets: null, atk: k('atk_base'),
    actions: Array.from({ length: 5 }, (_, index) => a(PHYS, k('atk_scale'), 1,
      { label: `第${index + 1}撃`, attackBonus: mul(index, k('atk_step')) })),
    ...pending('headb2-s3-terrain-splash', '連撃ごとの高台経由の追加攻撃と拡散先を確認する必要があります。', ['スキル', '素質1', '特性']) })]),

  make('char_010_chen', 1, [next(PHYS, k('atk_scale'), 1, { traitOverrides: ['HIT_COUNT'] })], [], ['強化攻撃は説明に記載されたダメージ1回として定義し、剣豪の通常攻撃2ヒットを追加乗算しない。スタン1.5秒を保持。']),
  make('char_010_chen', 2, [burst(PHYS, 1, 1, { maxTargets: k('max_target'), actions: [
    a(PHYS, k('atk_scale'), 1, { label: '物理斬撃' }), a(ARTS, k('atk_scale'), 1, { label: '術斬撃' }),
  ] })]),
  make('char_010_chen', 3, [burst(PHYS, k('atk_scale'), k('times'), { maxTargets: 1,
    notes: ['対象が途中で倒れない条件の1発動。途中撃破時の対象再選択は含めない。'] })]),

  make('char_4116_blkkgt', 1, [next(PHYS, k('atk_scale_s1'), 1, { maxTargets: k('max_target') })]),
  make('char_4116_blkkgt', 2, [burst(PHYS, k('dot_scale'), choose('targetBlocked', true,
    k('blkkgt_s_2[blocked].trig_cnt'), k('blkkgt_s_2[not_blocked].trig_cnt')), { maxTargets: k('max_target') })], [blocked()]),
  make('char_4116_blkkgt', 3, [burst(PHYS, 1, 1, { maxTargets: k('max_target'), actions: [
    a(PHYS, k('d_atk_scale'), 10, { label: '連続斬撃' }), a(PHYS, k('e_atk_scale_end'), 1, { label: '終撃' }),
  ], notes: ['全ての攻撃が同じ対象に命中する条件。引き寄せによる範囲への出入りは含めない。'] })]),

  make('char_017_huang', 1, [next(PHYS, k('atk_scale'))]),
  make('char_017_huang', 2, [stage(PHYS, { atk: k('atk'), duration: 'UNTIL_EXIT' })]),
  make('char_017_huang', 3, [
    at('normal', stage(PHYS, { atk: i('currentAtkBonus'), maxTargets: null, duration: 10,
      notes: ['現在の攻撃力上昇割合を指定する。増加曲線を推定して期間総ダメージを出さない。'] })),
    at('end', burst(PHYS, k('damage_by_atk_scale'), 1, { label: '終了時の爆発', atk: k('atk'), maxTargets: null })),
  ], [phase(['normal', '通常攻撃'], ['end', '終了時の爆発']), n('currentAtkBonus', '現在の攻撃力上昇割合', 0.8, 0, 0.8, 0.01)]),

  make('char_1026_gvial2', 1, [stage(PHYS, { atk: k('atk'), duration: 25 })]),
  make('char_1026_gvial2', 2, [stage(PHYS, { atk: k('atk'), duration: 40 })], [], ['引き寄せ前後で同じ対象が射程内にいる場合の性能。']),
  make('char_1026_gvial2', 3, [stage(PHYS, { atk: k('atk'), aspd: k('attack_speed'), blockCountAdd: k('block_cnt'), duration: 25 })], [], ['被ダメージ軽減と終了後のHP減少は、直接ダメージ・DPSへ加算しない。']),

  make('char_4098_vvana', 1, [next(ARTS, k('atk_scale'), choose('overcharge', true, 3, 2))], [b('overcharge', 'オーバーチャージ')]),
  make('char_4098_vvana', 2, [stage(ARTS, { atk: k('atk'), aspd: i('stolenAttackSpeed'), maxTargets: 2, duration: 35, actions: [
    a(ARTS, 1, 1, { label: '単撃', probability: k('attack@prob_once') }),
    a(ARTS, k('attack@atk_scale_twice'), 2, { label: '2連撃', probability: k('attack@prob_twice') }),
  ] })], [n('stolenAttackSpeed', '奪取した攻撃速度', 0, 0, 40)], ['指定した奪取量の性能。奪取量が変わるまでの経過時間は積分しない。']),
  make('char_4098_vvana', 3, [stage(ARTS, { atk: k('atk'), intervalAdd: k('base_attack_time'),
    duration: choose('skillActivationCount', 2, k('enhance_duration'), 15, 'GTE'),
    actions: [a(ARTS, 1, choose('skillActivationCount', 2, 3, 2, 'GTE'))] })], [activations()]),

  make('char_1019_siege2', 1, [next(ARTS, 1, 1, { maxTargets: null, actions: [
    a(ARTS, 1, 1, { label: '通常打撃', targets: 1 }), a(TRUE, k('atk_scale'), 1, { label: '隣接4マスへの追加攻撃', traitOverrides: ['DAMAGE_TYPE', 'HIT_COUNT'] }),
  ] })]),
  make('char_1019_siege2', 2, [stage(ARTS, { atk: k('atk'), maxTargets: k('attack@max_target'), duration: 'UNTIL_EXIT' })], [], ['SP回復速度は発動周期を計算しないためDPSに加算しない。']),
  make('char_1019_siege2', 3, [stage(TRUE, { atk: k('atk'), intervalAdd: k('base_attack_time'), traitOverrides: ['DAMAGE_TYPE'],
    maxTargets: k('attack@max_target'), duration: 25,
    notes: ['召喚物・味方によって攻撃可能な対象が成立している条件の通常攻撃。召喚物の独立ダメージは含めない。'] })]),

  make('char_1050_chen3', 1, [stage(ARTS, { atk: k('atk'), duration: 18, actions: [a(ARTS, 1, 2)] })]),
  make('char_1050_chen3', 2, [
    at('slashes', burst(ARTS, k('atk_scale'), 10, { label: '連続斬撃', maxTargets: 1 })),
    at('normal', stage(ARTS, { label: '斬撃後', atk: k('chen3_s2[respawn_buff].atk'), duration: 6 })),
  ], [phase(['slashes', '連続斬撃'], ['normal', '斬撃後の通常攻撃'])], ['斬撃中に対象が倒れない条件。撃破時の残り回数増加・対象変更・移動は含めない。']),
  make('char_1050_chen3', 3, [
    at('normal', stage(ARTS, { maxTargets: k('attack@max_target'), duration: 20, actions: [a(ARTS, k('attack@atk_scale'), 3)] })),
    at('wave', burst(ARTS, 1, 1, { label: '剣気1回の命中', maxTargets: null, actions: [a(ARTS, k('hp_ratio'), 1,
      { label: '剣気', basis: 'TARGET_CURRENT_HP', minimumAttackScale: k('projectile_min_atk_scale') })] })),
  ], [phase(['normal', '通常攻撃'], ['wave', '剣気1回の命中']), n('targetCurrentHp', '命中直前の敵HP', 10000, 1, 10000000)], ['剣気の反射・再命中回数は推定しない。']),

  make('char_188_helage', 1, [next(PHYS, k('atk_scale'), 2)]),
  make('char_188_helage', 2, [stage(PHYS, { atk: k('atk'), duration: 13, actions: [a(PHYS, 1, 2)] })]),
  make('char_188_helage', 3, [stage(PHYS, { atk: k('atk'), maxTargets: k('attack@max_target'), duration: 15 })]),

  make('char_4121_zuole', 1, [next(PHYS, k('atk_scale'), choose('selfHpPercent', 50, 3, choose('selfHpPercent', 80, 2, 1, 'LT'), 'LT'))], [hp()]),
  make('char_4121_zuole', 2, [stage(PHYS, { atk: k('atk'), maxTargets: 2, duration: 12 })], [], ['HP減少後のHP割合を素質条件に指定する。バリア量は直接攻撃ダメージを変えない。']),
  make('char_4121_zuole', 3, [burst(PHYS, 1, 1, { maxTargets: 3, actions: [
    a(PHYS, k('atk_scale'), add(k('times'), -1), { label: '通常斬撃' }),
    a(PHYS, mul(k('atk_scale'), k('last_atk_bonus')), 1, { label: '終撃' }),
  ] })]),

  make('char_485_pallas', 1, [next(PHYS, k('atk_scale'), 2)]),
  make('char_485_pallas', 2, [stage(PHYS, { atk: k('atk'), duration: 25 })]),
  make('char_485_pallas', 3, [stage(PHYS, { atk: add(k('atk'), choose('frontAlly', false,
    choose('selfHpPercent', 80, add(k('attack@peak_performance.atk'), -0.25), 0, 'GTE'), 0)), maxTargets: k('attack@max_target'), duration: 30 })],
    [b('frontAlly', '前方の近距離マスに味方OP'), hp()], ['自身への勇猛は素質の勇猛と重ねず高い方を適用する必要がある。'],),

  make('char_1014_nearl2', 1, [stage(PHYS, { atk: k('atk'), aspd: k('attack_speed'), duration: 'UNTIL_EXIT' })]),
  make('char_1014_nearl2', 2, [stage(PHYS, { atk: k('atk'), duration: 27 })], [], ['配置可能数・シールド・退場・再配置時間は直接ダメージに加算しない。']),
  make('char_1014_nearl2', 3, [
    at('normal', stage(PHYS, { atk: k('atk'), duration: 25, actions: [a(PHYS)] })),
    at('true', stage(TRUE, { label: '自身・ブレイジング・サンがブロック中', atk: k('atk'), duration: 25, actions: [a(TRUE)] })),
    at('sun', burst(TRUE, k('value'), 1, { label: '召喚時', maxTargets: null,
      ...pending('nearl2-s3-summon-attack-order', '召喚時ダメージとスキル攻撃力増加の適用順序を確認する必要があります。') })),
  ], [phase(['normal', '通常攻撃（ブロック条件なし）'], ['true', '通常攻撃（ブロック条件成立）'], ['sun', 'ブレイジング・サン召喚時'])],
    ['ブレイジング・サンの被撃による生存時間・敵の配置はシミュレーションしない。']),

  make('char_4011_lessng', 1, [next(PHYS, k('atk_scale'))]),
  make('char_4011_lessng', 2, [stage(PHYS, { atk: k('atk'), duration: 24, actions: [a(PHYS, 1, 2)] })], [], ['第一素質の被ダメージ軽減倍率は直接ダメージを変えない。']),
  make('char_4011_lessng', 3, [stage(PHYS, { duration: 20, actions: [a(PHYS, choose('targetBlocked', true, k('lessng_s3[atk_scale].atk_scale'), 1))] })],
    [blocked()], ['発動時の600術ダメージは自身へのダメージであり、敵への攻撃に加算しない。']),

  make('char_1032_excu2', 1, [stage(PHYS, { atk: k('atk'), defenseIgnoreFixed: k('def_penetrate_fixed') })], [], ['弾薬1発分の通常攻撃。再発動・途中停止を含む周期DPSは計算しない。']),
  make('char_1032_excu2', 2, [stage(PHYS, { atk: k('atk') })], [], ['弾薬1発分の通常攻撃。回避による弾薬補充とスキル全体の継続時間は含めない。']),
  make('char_1032_excu2', 3, [
    at('normal', stage(PHYS, { atk: add(k('atk'), mul(k('attack@atk'), min(k('attack@max_stack_cnt'), i('ammoSpent')))),
      intervalAdd: k('base_attack_time') })),
    at('end', burst(PHYS, k('attack@final_atk_scale'), 1, { label: '終了時', atk: add(k('atk'), mul(k('attack@atk'), min(k('attack@max_stack_cnt'), i('ammoSpent')))), maxTargets: null })),
  ], [phase(['normal', '通常攻撃'], ['end', '終了時の追加攻撃']), n('ammoSpent', '弾薬消費による累積数', 0, 0, 100)],
    ['指定した累積数の性能。終了時の攻撃対象は発動中に攻撃した敵で、実際に残存する敵数を指定する。']),

  make('char_4010_etlchi', 1, [next(PHYS, k('atk_scale'), 2)]),
  make('char_4010_etlchi', 2, [burst(PHYS, k('atk_scale'), 1, { label: '鎌1回の接触', maxTargets: null,
    notes: ['接触1回のダメージ。0.5秒ごとの接触判定と2本の鎌の位置・重複を通常攻撃DPSと同一視しない。'] })]),
  make('char_4010_etlchi', 3, [stage(PHYS, { atk: k('atk'), aspd: k('attack_speed'), duration: 20,
    ...pending('etlchi-s3-hp-transfer', '心燭の最低ダメージ35%・HP上限・敵へのHP減少転写を通常の軽減計算と分離する必要があります。') })]),

  make('char_4064_mlynar', 1, [stage(PHYS, { duration: 30, maxTargets: null, actions: [a(PHYS, k('attack@atk_scale'))] })]),
  make('char_4064_mlynar', 2, [stage(PHYS, { duration: 20, intervalAdd: k('base_attack_time'), maxTargets: null,
    actions: [a(PHYS, k('attack@atk_scale'), 2)] })], [], ['指定した特性の蓄積状態での攻撃。撃破時の次回スキルへの引継ぎは含めない。']),
  make('char_4064_mlynar', 3, [stage(PHYS, { duration: 28, maxTargets: k('attack@max_target'),
    traitAttackRatioScale: max(0, add(k('trait_up'), mul(k('per_kill_reduce'), i('skillKillCount')))), actions: [
    a(PHYS, k('attack@atk_scale'), 1, { label: '通常攻撃' }),
    a(TRUE, k('atk_scale'), 1, { label: '自身の攻撃による確定ダメージ' }),
  ] })], [n('skillKillCount', '今回のスキル中の撃破数', 0, 0, 100)], ['他のカジミエーシュOPが誘発する確定ダメージは、他者の攻撃頻度が未指定のため含めない。']),

  make('char_1043_leizi2', 1, [burst(PHYS, k('attack@atk_scale_s1'), 1, { maxTargets: null })], [], ['1回の発動のみ。チャージを使い切るまでの特性維持は蓄積条件で扱う。']),
  make('char_1043_leizi2', 2, [stage(PHYS, { duration: 36, maxTargets: k('attack@max_target_s2'),
    atk: mul(k('thunder_atk'), i('attackStacks')), actions: [a(PHYS, k('attack@atk_scale_s2'))] })],
    [stacks(25, 'スキル中の落雷による累積数')]),
  make('char_1043_leizi2', 3, [stage(PHYS, { duration: 24, intervalAdd: k('base_attack_time'), maxTargets: null,
    actions: [a(PHYS, k('attack@atk_scale_s3'))], ...pending('leizi2-s3-current-contacts', '電流の生成・反射・再接触による術ダメージの回数と持続を確認する必要があります。') })]),
]

export function findGuardSkillRecipe(operatorId: string, skillIndex: number): GuardSkillRecipe | null {
  return GUARD_SKILL_RECIPES.find(recipe => recipe.operatorId === operatorId && recipe.skillIndex === skillIndex) ?? null
}
