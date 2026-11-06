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
const alchemyScope = '作成時から攻撃力が変わらない錬金ユニット1個（S3は1つの区域）の現在の毎秒値。通常攻撃、別のユニット、範囲への出入り、効果終了までの合計は含めません。'
const alchemyDot = (scale: GuardValue, options: Partial<GuardStage> = {}): GuardStage => normal({
  label: '錬金ユニット1個の毎秒ダメージ', kind: 'SKILL_ACTION', maxTargets: null,
  actions: [{ label: '錬金ユニットの毎秒ダメージ', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', timing: 'PER_SECOND', scale }],
  periodTotal: period(alchemyScope), dpsUnsupportedReason: '錬金ユニットの現在の毎秒値のみを評価します。', notes: [alchemyScope], ...options,
})
const thornMature = (initial: string, maximum: string): GuardValue => choose('thornRegionMature', true, k(maximum), k(initial))
const ownerTokenScope = '本人の攻撃のみ。召喚物の攻撃、召喚数・再召喚・撃破による途中変化は含めません。'

export const EXPANDED_SPECIAL_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  // The next-attack skill adds displacement without changing the ordinary attack's multiplier.
  // https://prts.wiki/w/Enforcer ; first-hand S1 damage measurements:
  // https://www.taptap.cn/moment/255723093023001014
  operator('char_4036_forcer', [[1, normal({ label: '押し出し付きの通常攻撃1回', kind: 'NEXT_ATTACK',
    periodTotal: period('通常攻撃1回のみ。押し出し後の位置・衝突スタン・落下撃破はダメージへ加算しません。') })]],
  [talent(0, 'テクニカルショット', v => [effect('heavy-target-penetration', 'def_penetrate_fixed / value', {
    item: 'DEFENSE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT', value: v.read('def_penetrate_fixed'),
  }, { condition: { type: 'COMPARE', metric: 'targetWeight', comparison: 'GTE', value: v.read('value') },
    timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })], ['DAMAGE'])],
  { inputs: [n('targetWeight', '対象全員の重量ランク', 0, 0, 10)],
    deferredSkills: [{ skillIndex: 2, reason: '攻撃を置換して前方へ押し出しとスタンを与えるスキル。既存の直接ダメージ対象外の分類を維持する。' }],
    traitNotes: ['本人がブロック中の敵を全員同時に攻撃する。S1は通常攻撃の100%を残し、重量条件に応じて防御力180を無視する。'] }),
  // https://prts.wiki/w/Exusiai_the_New_Covenant : every consumed round rolls once;
  // a delivery shell consumes no ammunition. Exusiai herself belongs to Laterano.
  operator('char_1041_angel2', [1, 2, 3].map(index => [index, [
    phase('angelPhase', 'SHOT', normal({ label: index === 3 ? '孤立した敵への5連撃と実際の爆撃' : '孤立した敵への射撃と実際の爆撃', maxTargets: 1,
      ...(index === 3 ? { atk: k('atk') } : index === 2 ? { intervalAdd: k('base_attack_time'), aspd: choose('angelSpeedStolen', true, k('steal')) } : {}),
      actions: [{ label: index === 3 ? '5発消費の5連撃' : '弾薬1発の射撃', role: 'MAIN', damageType: 'PHYSICAL', scale: k('attack@atk_scale'), hits: index === 3 ? 5 : 1 }],
      dpsUnsupportedReason: '素質が実際に発動した回数を指定した1攻撃。抽選込みの周期DPSは表示しません。',
      periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '弾薬を消費する現在の1攻撃のみ。抽選・対象変更・他オペレーターの弾薬消費・終了処理は合算しません。' },
    })),
    ...(index === 3 ? [phase('angelPhase', 'DELIVERY', normal({ label: '配達先座標への配達弾1発', kind: 'SKILL_ACTION', atk: k('atk'), maxTargets: null,
      actions: [{ label: '配達弾', role: 'MAIN', damageType: 'PHYSICAL', scale: k('attack@cannon_atk_scale') }], periodTotal: period('配達弾は弾薬を消費しないため素質の爆撃を発生させない。本人の5連撃や配置された味方の攻撃は合算しません。'),
    }))] : []),
    phase('angelPhase', 'OTHER', pending(index === 1 ? '複数敵・手動停止時の一斉射撃' : '複数敵・他者の弾薬消費を含む爆撃',
      '射撃対象と独立した爆撃対象、範囲内の巻き込みと途中撃破を含む総ダメージは未対応です。', ['スキル', '素質1'])),
  ], [select('angelPhase', '計算対象', [['SHOT', '孤立した敵への1攻撃'], ...(index === 3 ? [['DELIVERY', '配達弾1発'] as [string, string]] : []), ['OTHER', '複数敵・別起点を含む合計']]),
    n('angelBombCount', '今回の弾薬消費で実際に起きた爆撃回数', 0, 0, index === 3 ? 5 : 1),
    b('angelIsolatedTarget', '有効な敵が1体だけで全命中中も変わらない', true),
    ...(index === 2 ? [b('angelSpeedStolen', '味方から攻撃速度70を奪取済み', true)] : []),
  ]] as const), [talent(0, '火力放送局', v => {
    if (v.read('prob') !== .25) v.issue('確認済みの弾薬1発あたりの爆撃確率25%と一致しません。')
    return [effect('realized-ammunition-bombs', 'aoe_atk_scale / prob', { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER',
      label: '弾薬消費で実現した素質の爆撃', value: v.read('aoe_atk_scale'), basis: 'ATK_STAT', damageType: 'PHYSICAL', hits: metric('angelBombCount'), rate: 'PER_ATTACK' },
      { target: enemyTarget, condition: all(eq('angelPhase', 'SHOT'), { type: 'COMPARE', metric: 'angelBombCount', comparison: 'GT', value: 0 }), lifetime: { type: 'CURRENT_EVENT' } }),
      status('ammo-healing', '味方の弾薬消費ごとに自身の最大HP6%を回復')]
  }, ['ADDITIONAL_DAMAGE', 'SURVIVAL']), talent(1, '銃弾協約', v => [effect('laterano-ammo-attack', 'atk / mult', {
    item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: mul(v.read('atk'), v.read('mult')),
  })], ['DAMAGE'])], { traitNotes: ['本人へのラテラーノ効果2倍を適用。孤立した敵1体への射撃では、今回の弾薬消費で実現した爆撃回数だけを加算する。配達弾は別イベント。'] }),

  // https://prts.wiki/w/溯光星源 : no chain-caster decay; S3 transmission uses damage
  // before RES and vulnerability, not the recipient's final damage. Keep that event pending.
  operator('char_1047_halo2', [
    [1, [phase('haloPhase', 'HIT', action('跳躍経路中の1回の命中', 1, { atk: k('atk'), maxTargets: 1,
      periodTotal: period('選択した敵への1回の命中のみ。跳躍順と同じ敵への再跳躍を含む攻撃全体は合算しません。') })),
      phase('haloPhase', 'ALL', pending('再跳躍を含む攻撃全体', '敵の配置に応じた跳躍経路と同一対象への命中回数は未対応です。'))],
      [select('haloPhase', '計算対象', [['HIT', '跳躍経路中の1命中'], ['ALL', '再跳躍を含む合計']])]],
    [2, [phase('haloPhase', 'DIRECT', action('最初の対象への直撃', k('atk_scale'), { maxTargets: k('max_target_attack'),
      periodTotal: period('最初に選択した対象への直撃のみ。引き寄せ対象へのダメージは別イベントとして評価します。') })),
      phase('haloPhase', 'LINK', action('1つの直撃位置からの引き寄せ命中', k('atk_scale_link'), { maxTargets: k('max_target'),
        periodTotal: period('1つの直撃位置から引き寄せる対象群への1回のみ。別の直撃位置との重なりや落下は合算しません。') })),
      phase('haloPhase', 'ALL', pending('直撃と引き寄せを含む攻撃全体', '2つの直撃位置と周囲の敵の配置による複数回命中・重なりは未対応です。'))],
      [select('haloPhase', '計算対象', [['DIRECT', '最初の対象への直撃'], ['LINK', '1か所からの引き寄せ命中'], ['ALL', '攻撃全体の合計']])]],
    [3, [phase('haloPhase', 'SINGLE', normal({ label: 'ロック対象が1体だけの通常攻撃', maxTargets: 1, atk: k('atk'), intervalAdd: k('base_attack_time'),
      actions: [{ label: '単独ロック対象への術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1 }],
      dpsUnsupportedReason: '現在の攻撃1回のみ。足止めによる攻撃速度増加や脆弱の成熟を追跡しません。',
      periodTotal: period('ロック対象が1体だけで伝導先が存在しない状態。2体の連結と伝導は別の未対応段階です。') })),
      phase('haloPhase', 'LINKED', pending('2体への攻撃と術ダメージ伝導', '本人・他者からの術ダメージを起点とする伝導と、その軽減前参照・仮想属性との連動は未対応です。'))],
      [select('haloPhase', '計算対象', [['SINGLE', '単独ロック対象への攻撃'], ['LINKED', '2体への攻撃と伝導']]), b('haloSingleLock', '実際のロック対象が1体だけ', true)]],
  ], [{ ...talent(0, 'データモデリング', v => {
    if (v.read('max_stack_cnt') !== 18) v.issue('確認済みの攻撃速度の累積上限18回と一致しません。')
    return [effect('slow-stack-speed', 'attack_speed / max_stack_cnt', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: mul(v.read('attack_speed'), metric('haloSlowStacks')) })]
  }), prefabKey: '2' }, { ...talent(1, 'エネルギー解析', v => [
    effect('early-fragile', 'halo2_t_1[weak].damage_scale', { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('halo2_t_1[weak].damage_scale') },
      { target: enemyTarget, condition: eq('haloFragile', 'EARLY') }),
    effect('mature-fragile', 'halo2_t_1[weak].damage_scale_max', { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('halo2_t_1[weak].damage_scale_max') },
      { target: enemyTarget, condition: eq('haloFragile', 'MATURE') }),
  ], ['DAMAGE']), prefabKey: '1' }], { inputs: [n('haloSlowStacks', '命中前の足止め累積回数', 18, 0, 18),
    select('haloFragile', '対象全員に付与済みの自身の脆弱', [['EARLY', '範囲内・7秒未満（10%）'], ['MATURE', '範囲内・7秒以上（14%）'], ['NONE', '範囲外（なし）']])],
    traitNotes: ['選択した対象群は同じ脆弱状態。跳躍・引き寄せの各命中には連鎖術師の減衰を適用しない。'] }),

  // https://prts.wiki/w/Necrass : S1 explosions and S2 links originate from the operator.
  operator('char_450_necras', [
    [1, [phase('necrasPhase', 'OWNER', action('召喚・強化時の爆発1回', k('atk_scale'), {
      periodTotal: period('召喚または強化1回の爆発のみ。再召喚の連続発生とHP閾値を跨ぐ合計は計算しません。'),
    })), phase('necrasPhase', 'TOKEN', pending('悲嘆する下僕の攻撃', '下僕の独立ステータスとグレードによる攻撃は未対応です。', ['スキル', '素質1', '素質2']))]],
    [2, [phase('necrasPhase', 'OWNER', action('拘束中のダメージ1回（0.5秒周期）', k('atk_scale'), {
      maxTargets: k('max_target'), periodTotal: period('リンクが続いている対象への1回のみ。睡眠・リンク中断・HP閾値変化・撃破による追加召喚は合算しません。'),
      dpsUnsupportedReason: '拘束中の1回分のみ。リンク中断とHPの変化を追跡しません。',
    })), phase('necrasPhase', 'TOKEN', pending('悲嘆する下僕の攻撃', '下僕の独立ステータスとグレードによる攻撃は未対応です。', ['スキル', '素質1', '素質2']))],
    [b('necrasLinkActive', '対象全員へのリンクが継続中', true)]],
    [3, [phase('necrasPhase', 'OWNER', action('範囲攻撃1回（最大3回中の1回）', k('attack@atk_scale'), {
      periodTotal: period('最大3回のうち現在の1回。下僕の消費・強化と途中のHP閾値変化を含む合計は計算しません。'),
    })), phase('necrasPhase', 'TOKEN', pending('特殊形態の下僕の攻撃', '特殊形態の独立ステータスと累積グレードによる攻撃は未対応です。', ['スキル', '素質1', '素質2']))]],
  ], [talent(0, '再燃', () => [status('servant-generation', '敵撃破時に下僕を生成または強化する')], ['ABILITY']),
    talent(1, '回光暗澹', v => [effect('low-hp-attack', 'hp_ratio / damage_scale', { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('damage_scale') },
      { condition: { type: 'COMPARE', metric: 'targetHpPercent', comparison: 'LT', value: percent(v.read('hp_ratio')) }, timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } })], ['DAMAGE'])],
  { inputs: [select('necrasPhase', '計算対象', [['OWNER', '本人によるスキルダメージ1回'], ['TOKEN', '悲嘆する下僕']]),
      { ...n('targetHpPercent', '対象全員の命中前HP（%）', 100, 0, 100), step: 0.01 }],
    traitNotes: ['同じHP条件にある対象群への本人由来の1回。下僕の攻撃や連続する爆発・範囲攻撃の総量は別計算。'] }),

  // https://prts.wiki/w/Spuria : no source confirms equal chances for the three exclusive outcomes.
  operator('char_4015_spuria', [1, 2].map(index => [index, [
    phase('spuriaMode', 'ACTUAL', normal({ label: '選択した素質結果での1攻撃',
      ...(index === 1 ? { aspd: k('attack_speed') } : { atk: k('atk'), aspd: k('attack_speed') }),
      actions: [{ label: '通常攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: 1, hits: choose('spuriaOutcome', 'DOUBLE', 2, 1) }],
      dpsUnsupportedReason: '実際に選択した素質の結果による1攻撃。抽選込みの期待値とスタンによる中断は計算しません。',
      periodTotal: period('素質の排他的な3効果の確率分布と、自己スタンの時間推移は未対応です。'),
      notes: ['選択した素質結果が実現した攻撃のみ。不発・2連撃・敵スタン・防御無視を同時発動させない。'] })),
    phase('spuriaMode', 'EXPECTED', pending('抽選込みの期待値', '排他的な3効果の内訳確率は原資料で確認できていないため、均等確率の期待値を作りません。', ['素質1'])),
    ...(index === 2 ? [phase('spuriaMode', 'INTERRUPTED', pending('自己スタンを伴う攻撃', '初段の後に自己スタンした場合の2連撃の継続・中断は未確認です。'))] : []),
  ], [select('spuriaMode', '計算対象', [['ACTUAL', '素質の結果を指定した1攻撃'], ['EXPECTED', '抽選込みの期待値'],
    ...(index === 2 ? [['INTERRUPTED', '自己スタンを伴う攻撃'] as [string, string]] : [])]),
    ...(index === 2 ? [b('spuriaSelfStunAbsent', '今回の攻撃で自己スタンが発生しない', true)] : [])]] as const),
  [talent(0, '弾薬性能比較試験', v => {
    if (v.read('prob') !== 0.7) v.issue('確認済みの素質全体の発動確率70%と一致しません。')
    return [effect('exclusive-double', 'description:その攻撃のみ2回攻撃になる', { item: 'ATTACK_BEHAVIOR', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true,
      status: '選択された2連撃をMAIN攻撃の命中数2として適用' }, { condition: eq('spuriaOutcome', 'DOUBLE') }),
    effect('selected-penetration', 'def_penetrate', { item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: v.read('def_penetrate') },
      { condition: eq('spuriaOutcome', 'IGNORE'), timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } }),
    effect('selected-stun', 'stun', { item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: `対象を${v.read('stun')}秒スタン` },
      { condition: eq('spuriaOutcome', 'STUN') })]
  }, ['DAMAGE', 'ATTACK_BEHAVIOR', 'STATUS'])],
  { inputs: [select('spuriaOutcome', '実際の素質結果', [['NONE', '不発'], ['DOUBLE', '2連撃'], ['STUN', '敵スタン'], ['IGNORE', '防御力80%無視']])] }),

  // https://prts.wiki/w/Thorns_the_Lodestar : cached-ATK, source-less periodic damage.
  operator('char_1039_thorn2', [
    [2, alchemyDot(k('atk_scale'), { duration: k('projectile_delay_time') })],
    [3, [phase('alchemyPhase', 'STABLE', alchemyDot(thornMature('atk_scale', 'max_atk_scale'), {
      label: '錬金区域1つの毎秒ダメージ', duration: k('projectile_delay_time'),
      defenseReductionRatio: product(-1, thornMature('def', 'max_def')),
      resistanceReductionRatio: product(-1, thornMature('magic_resistance', 'max_magic_resistance')),
    })), phase('alchemyPhase', 'TRANSITION', pending('区域の効果が上昇する途中', '継続ダメージと能力低下の更新順を追跡する途中状態は未対応です。'))],
    [select('alchemyPhase', '計算対象', [['STABLE', '現在の区域効果'], ['TRANSITION', '効果上昇中の状態変化']]),
      b('thornRegionMature', '区域の効果が最大（15秒後）', true), b('thornReductionApplied', '選択した区域の能力低下が付与済み', true)]],
  ], [talent(0, '心相', v => [effect('alchemy-atk', 'atk', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value: v.read('atk') }),
    status('alchemy-duration', '投擲時に範囲内に他のオペレーターがいると錬金ユニットの持続時間を延長')], ['DAMAGE', 'ABILITY']),
  talent(1, '視界', v => [effect('base-speed', 'attack_speed_ally', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('attack_speed_ally') }),
    effect('terrain-speed', 'attack_speed_ally_extra', { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: v.read('attack_speed_ally_extra') }, { condition: eq('thornLongPath', true) }),
    status('enemy-speed', '配置中は敵の攻撃速度を低下')], ['ABILITY'])],
  { inputs: [b('alchemyAttackUnchanged', '作成時から自身の攻撃力が不変', true), b('alchemyTargetsInArea', '対象全員が錬金効果範囲内', true),
    b('alchemyTargetsGround', '対象全員が地上にいる', true), b('thornLongPath', '自身が6マス以上の直線経路内にいる')],
    traitNotes: [alchemyScope], deferredSkills: [{ skillIndex: 1, reason: '治療と味方の防御力上昇のみを行う錬金ユニットのため、対象外（NOT_APPLICABLE）登録を使用する。未確認の攻撃効果はない。' }] }),

  // https://prts.wiki/w/Tin_Man : the source-less BUFF damage receives the unit's own DOT vulnerability.
  operator('char_4151_tinman', [[1, alchemyDot(k('atk_scale'), { duration: k('projectile_delay_time') })],
    [2, alchemyDot(k('atk_scale'), { duration: k('projectile_delay_time') })]],
  [talent(0, '「オン・ザ・ウェイ」', () => [status('recruitment', '統合戦略の希望消費と負荷臨界点を変更')], ['ABILITY']),
    talent(1, '朽ちゆく魂', v => [effect('alchemy-dot-vulnerability', 'skill@damage_scale', {
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('skill@damage_scale'),
    }, { target: enemyTarget })], ['DAMAGE'])],
  { inputs: [b('alchemyAttackUnchanged', '作成時から自身の攻撃力が不変', true), b('alchemyTargetsInArea', '対象全員が錬金効果範囲内', true),
    b('alchemyTargetsGround', '対象全員が地上にいる', true)], traitNotes: [alchemyScope, '朽ちゆく魂は錬金ユニットの継続ダメージに1回だけ適用する。'] }),

  // https://prts.wiki/w/Tecno : the operator and the puppets are distinct actors.
  operator('char_4164_tecno', [1, 2].map(index => [index, [
    phase('tecnoPhase', 'OWNER', normal({ label: '本人の通常攻撃', ...(index === 1 ? { atk: k('atk') } : { aspd: k('attack_speed') }),
      periodTotal: period(ownerTokenScope), notes: [ownerTokenScope] })),
    phase('tecnoPhase', 'TOKEN', pending('パペットダンサーの攻撃', 'パペットダンサーの独立ステータスによる攻撃は未対応です。', ['スキル', '素質1'])),
  ]] as const), [talent(0, '即席パペット', () => [status('puppets', '地面マスの敵撃破時にパペットダンサーを召喚する')], ['ABILITY'])],
  { inputs: [select('tecnoPhase', '計算対象', [['OWNER', '本人の通常攻撃'], ['TOKEN', 'パペットダンサー']])], traitNotes: [ownerTokenScope] }),

  // https://prts.wiki/w/SilverAsh_the_Reignfrost : Tenzin's projectiles use SilverAsh's ATK.
  operator('char_1045_svash2', [
    [2, [phase('silverashPhase', 'OWNER', normal({ label: '本人の斬撃1回', kind: 'SKILL_ACTION', maxTargets: k('max_target'),
      actions: [{ label: '本人の斬撃', role: 'MAIN', damageType: 'PHYSICAL', scale: k('atk_scale') }], periodTotal: period(eventScope) })),
      phase('silverashPhase', 'ALLY', pending('味方配置時の斬撃', '配置した味方自身の攻撃力を参照する斬撃は未対応です。'))],
      [select('silverashPhase', '計算対象', [['OWNER', '本人の斬撃1回'], ['ALLY', '味方配置時の斬撃']])]],
    [3, [phase('silverashPhase', 'OWNER', normal({ label: '脆弱付与済みの対象への直線攻撃', maxTargets: null,
      actions: [{ label: '本人の直線攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale: k('bird_atk_scale') }],
      damageScale: k('damage_scale'), periodTotal: period('本人からの直線攻撃のみ。脆弱の初回付与、協同攻撃との重なりや総ダメージは計算しません。'),
      notes: ['自身のS3の脆弱が命中前から有効な同条件の対象群を評価する。協同攻撃は別起点なので合算しない。'] })),
      phase('silverashPhase', 'FIRST', pending('脆弱を初めて付与する攻撃', '最初の命中における脆弱付与とダメージの処理順は未確認です。')),
      phase('silverashPhase', 'ALLY', pending('協同攻撃を含む合計', '本人と協同攻撃の索敵位置・弾道の重なり・脆弱付与順を含む合計は未対応です。'))],
      [select('silverashPhase', '計算対象', [['OWNER', '脆弱付与済みの本人の攻撃'], ['FIRST', '脆弱の初回付与'], ['ALLY', '協同攻撃を含む合計']]),
        b('silverashFragileActive', '命中前からS3の脆弱が有効', true)]],
  ], [talent(0, 'オープンゲーム', () => [status('deployment-order', '風雪の眼と配置待機順序を変更'), status('deployment-sp', '初期SPと再配置時間を変更')], ['RESOURCE']),
    talent(1, '雪境の先駆け', () => [status('kjerag-survival', '味方イェラグに凍結無効、防御力上昇、HP回復を付与')], ['SURVIVAL'])],
  { deferredSkills: [{ skillIndex: 1, reason: 'DP獲得、配置待機中の味方のコスト変更とバリアのみのため、対象外（NOT_APPLICABLE）登録を使用する。未確認の攻撃効果はない。' }] }),

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
  if (definition.operatorId === 'char_1041_angel2') recipe.conditionRequirements = [
    { when: { input: 'angelPhase', comparison: 'EQ', value: 'SHOT' }, condition: { input: 'angelIsolatedTarget', comparison: 'EQ', value: true }, reason: '射撃と全ての爆撃が同じ1体へ命中する孤立状態を指定してください。敵の増減や射撃対象以外への爆撃は未対応です。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_1047_halo2' && recipe.skillIndex === 2) recipe.conditionRequirements = [
    { when: { input: 'haloFragile', comparison: 'EQ', value: 'NONE' }, condition: { input: 'haloPhase', comparison: 'EQ', value: 'LINK' }, reason: '最初の直撃対象は自身の攻撃範囲内です。範囲内で付与済みの脆弱を指定してください。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_1047_halo2' && recipe.skillIndex === 3) recipe.conditionRequirements = [
    { when: { input: 'haloPhase', comparison: 'EQ', value: 'SINGLE' }, condition: { input: 'haloSingleLock', comparison: 'EQ', value: true }, reason: 'ロック対象が実際に1体だけの状態を指定してください。2体の場合は術ダメージ伝導が発生します。' },
    { when: { input: 'haloFragile', comparison: 'EQ', value: 'NONE' }, condition: { input: 'haloPhase', comparison: 'EQ', value: 'LINKED' }, reason: 'ロック対象は自身の攻撃範囲内です。範囲内で付与済みの脆弱を指定してください。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_450_necras' && recipe.skillIndex === 2) recipe.conditionRequirements = [
    { when: { input: 'necrasPhase', comparison: 'EQ', value: 'OWNER' }, condition: { input: 'necrasLinkActive', comparison: 'EQ', value: true }, reason: 'リンクが継続している対象への拘束ダメージを指定してください。中断後のダメージは発生しません。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_4015_spuria' && recipe.skillIndex === 2) recipe.conditionRequirements = [
    { when: { input: 'spuriaMode', comparison: 'EQ', value: 'ACTUAL' }, condition: { input: 'spuriaSelfStunAbsent', comparison: 'EQ', value: true }, reason: '自己スタンが発生しない今回の1攻撃を指定してください。初段後のスタンで中断されるケースは別の未対応段階です。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_1039_thorn2' || definition.operatorId === 'char_4151_tinman') recipe.conditionRequirements = [
    { condition: { input: 'alchemyAttackUnchanged', comparison: 'EQ', value: true }, reason: '投擲時から現在まで攻撃力が変わらない条件を指定してください。作成時の別の攻撃力は未対応です。' },
    { condition: { input: 'alchemyTargetsInArea', comparison: 'EQ', value: true }, reason: '対象全員が同じ錬金ユニットの効果範囲内にいる条件を指定してください。' },
    ...(definition.operatorId === 'char_4151_tinman' || recipe.skillIndex === 2
      ? [{ condition: { input: 'alchemyTargetsGround', comparison: 'EQ' as const, value: true }, reason: 'この錬金ユニットは地上の敵のみを対象とします。' }] : []),
    ...(definition.operatorId === 'char_1039_thorn2' && recipe.skillIndex === 3
      ? [{ condition: { input: 'thornReductionApplied', comparison: 'EQ' as const, value: true }, reason: '現在の毎秒値は選択した効果量の能力低下が既に付与された対象で評価します。' }] : []),
  ] satisfies GuardSkillRecipe['conditionRequirements']
  if (definition.operatorId === 'char_1045_svash2' && recipe.skillIndex === 3) recipe.conditionRequirements = [
    { when: { input: 'silverashPhase', comparison: 'EQ', value: 'OWNER' }, condition: { input: 'silverashFragileActive', comparison: 'EQ', value: true }, reason: 'S3の脆弱が命中前から付与されている対象を指定してください。初回付与は別の段階として未対応です。' },
  ] satisfies GuardSkillRecipe['conditionRequirements']
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
