import sources from '../data/expandedRangedSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition, ExpandedTalentBinding } from './expandedCombatTypes.ts'
import type { GuardSkillRecipe, GuardStage, GuardValue, GuardInput, GuardDamageAction } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { CombatEffectContext, CombatCondition, CombatNumericValue, CombatRecipientSelector } from './combatEffectStructure.ts'
import type { TalentCoarseCategory } from './talentCoarseClassification.ts'

// Reviewed against the JP 60e3aaf434919fbca931024a59d51088e810a9d3 snapshot.
// Recipes describe one attack/current skill state. Ammunition, SP cycles and spatial travel are not simulated.
type E = TalentStructureEffect
type N = CombatNumericValue
const key = (key: string): GuardValue => ({ key })
const input = (input: string): GuardValue => ({ input })
const mul = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const add = (...args: GuardValue[]): GuardValue => ({ op: 'add', args })
const choose = (input: string, value: number | string | boolean, yes: GuardValue, no: GuardValue,
  comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): GuardValue => ({ op: 'if', input, comparison, value, yes, no })
const number = (key: string, label: string, defaultValue: number, min: number, max: number, step = 1): GuardInput =>
  ({ key, label, kind: 'number', defaultValue, min, max, step })
const bool = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const eq = (metric: string, value: number | string | boolean | null, comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): CombatCondition =>
  ({ type: 'COMPARE', metric, comparison, value })
const conditional = (condition: CombatCondition, whenTrue: N, whenFalse: N): N => ({ type: 'CONDITIONAL', condition, whenTrue, whenFalse })
const self: CombatRecipientSelector = { type: 'RECIPIENTS', side: 'SELF', entity: 'UNIT', scope: 'SELF', includeSelf: true,
  factionIds: [], tagIds: [], selection: { type: 'ALL' } }
const enemy: CombatRecipientSelector = { ...self, side: 'ENEMY', scope: 'ATTACK_TARGET', includeSelf: false }
const attack: CombatRecipientSelector = { ...self, entity: 'ATTACK' }
const ctx = (id: string, sourceBinding: string, options: Partial<CombatEffectContext> = {}): CombatEffectContext => ({
  id, sourceBinding, target: self, timing: { type: 'CONTINUOUS', while: 'DEPLOYED' }, condition: null,
  probability: { chance: 1, rollScope: 'APPLICATION' }, lifetime: { type: 'WHILE_SOURCE_ACTIVE' }, restrictions: [], ...options,
})
const atk = (value: N, sourceBinding = 'atk', options: Partial<CombatEffectContext> = {}): E =>
  ({ ...ctx(`atk-${sourceBinding}`, sourceBinding, options), item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO', value })
const speed = (value: N, options: Partial<CombatEffectContext> = {}): E =>
  ({ ...ctx('attack-speed', 'attack_speed', options), item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value })
const scale = (value: N, options: Partial<CombatEffectContext> = {}): E =>
  ({ ...ctx('attack-scale', 'atk_scale', { target: attack, ...options }), item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value })
const behavior = (id: string, status: string, options: Partial<CombatEffectContext> = {}): E =>
  ({ ...ctx(id, `description:${id}`, options), item: 'ATTACK_BEHAVIOR', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status })
const status = (id: string, text: string, options: Partial<CombatEffectContext> = {}): E =>
  ({ ...ctx(id, `description:${id}`, options), item: 'STATUS', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true, status: text })
const critical = (b: ExpandedTalentBinding, probability: N = b.read('prob')): E => ({
  ...ctx('critical-attack', 'atk_scale', { target: attack, timing: { type: 'EVENT', event: 'ATTACK' },
    lifetime: { type: 'CURRENT_EVENT' }, probability: { chance: probability, rollScope: 'APPLICATION', sharedRollId: 'critical-attack' } }),
  item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('atk_scale'),
})
const talent = (talentIndex: number, name: string, categories: readonly TalentCoarseCategory[],
  effects: ExpandedTalentDefinition['effects'], notes: readonly string[] = []): ExpandedTalentDefinition =>
  ({ talentIndex, name, prefabKey: String(talentIndex + 1), categories, effects, notes })
const damage = (scale: GuardValue = 1, hits: GuardValue = 1, extra: Partial<GuardDamageAction> = {}): GuardDamageAction =>
  ({ label: '攻撃', role: 'MAIN', damageType: 'PHYSICAL', scale, hits, ...extra })
const normal = (extra: Partial<GuardStage> = {}): GuardStage =>
  ({ id: 'active', label: 'スキル中', kind: 'NORMAL', actions: [damage()], ...extra })
const next = (scale: GuardValue = key('atk_scale'), hits: GuardValue = 1, extra: Partial<GuardStage> = {}): GuardStage =>
  normal({ label: '強化攻撃', kind: 'NEXT_ATTACK', actions: [damage(scale, hits)], ...extra })
const burst = (scale: GuardValue = key('atk_scale'), extra: Partial<GuardStage> = {}): GuardStage =>
  normal({ label: '発動1回', kind: 'SKILL_ACTION', actions: [damage(scale)], ...extra })
const recipe = (operatorId: string, skillIndex: number, stage: GuardStage | readonly GuardStage[],
  inputs: readonly GuardInput[] = [], notes: readonly string[] = []): GuardSkillRecipe => {
  const raw = sources.find(source => source.operatorId === operatorId)!.skills.find(skill => skill.skillIndex === skillIndex)!.raw
  return { operatorId, skillIndex, inputs, notes, stages: (Array.isArray(stage) ? stage : [stage]).map(s => ({
    ...s, duration: s.duration ?? (raw.duration < 0 ? 'UNTIL_EXIT' : raw.duration),
  })) }
}
const operator = (operatorId: string, recipes: readonly GuardSkillRecipe[], talents: readonly ExpandedTalentDefinition[],
  inputs: readonly GuardInput[] = [], deferredSkills: ExpandedOperatorDefinition['deferredSkills'] = [],
  traitNotes: readonly string[] = []): ExpandedOperatorDefinition => {
  const source = sources.find(source => source.operatorId === operatorId)!
  return { operatorId, phaseIndex: source.phaseIndex, skillLevelIndex: source.skillLevelIndex, recipes, talents, inputs, deferredSkills, traitNotes }
}
const ammoNote = '攻撃中の1攻撃・DPSを計算する。弾薬数、弾薬消費の確率、スキル全体の総ダメージは含めない。'
const sameTargets = '選択した敵全員が、同じ条件で攻撃または爆発を受けるものとして計算する。'
const frontal = bool('targetInFrontalTiles', '対象が正面横3マスにいる')
const projectileDpsReason = '投擲物の飛行・帰還・回収待ちを含む攻撃周期を計算していないため、1投擲分のダメージのみ表示します。'
const hunterDpsReason = '装填と消費を含む攻撃周期を計算していないため、装填済みの弾による1攻撃分のダメージのみ表示します。'
const withExistingDefenseDown = (stage: GuardStage, condition: string): readonly GuardStage[] => [
  { ...stage, label: '防御低下付与済みの対象への攻撃', when: { input: condition, comparison: 'EQ', value: true },
    periodTotal: { kind: 'UNSUPPORTED', reason: '防御低下の付与・更新・解除の時間変化を含む総量は計算しません。' } },
  { ...stage, id: 'defense-down-unknown', label: '初回付与の順序未確認', actions: [],
    when: { input: condition, comparison: 'EQ', value: false },
    unresolved: ['防御低下が付与済みの対象を指定してください。初回の付与とダメージの前後関係は未確認です。'] },
]

export const EXPANDED_RANGED_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  operator('char_4221_ju', [
    { ...recipe('char_4221_ju', 1, next(key('atk_scale_s1'), 1, {
      label: 'HP50%以下の対象への強化攻撃', maxTargets: 1,
      dpsUnsupportedReason: '対象の残りHPによる非致死上限を適用した1攻撃のみ計算します。',
      periodTotal: { kind: 'UNSUPPORTED', reason: '対象のHP減少・重傷付与とチャージの時間変化は計算しません。' },
    })), conditionRequirements: [
      { condition: { input: 'targetHpPercent', comparison: 'LTE', value: 50 }, reason: 'S1は残りHPが50%以下の対象のみ選択できます。' },
      { condition: { input: 'targetCriticallyWounded', comparison: 'EQ', value: false }, reason: '重傷状態の対象への攻撃は計算対象外です。' },
    ] },
    { ...recipe('char_4221_ju', 2, [
      normal({ id: 'normal', label: '通常攻撃1回', atk: key('atk'), maxTargets: key('attack@max_target_s2'),
        when: { input: 'phase', comparison: 'EQ', value: 'normal' },
        dpsUnsupportedReason: '対象の残りHPによる非致死上限を適用した1攻撃のみ計算します。',
        periodTotal: { kind: 'UNSUPPORTED', reason: '対象のHP減少と別に発生する追加ダメージは時間積算しません。' } }),
      burst(key('atk_scale_s2_extra'), { id: 'extra', label: '追加物理ダメージ1回', atk: key('atk'), maxTargets: 1,
        actions: [damage(key('atk_scale_s2_extra'), 1, { role: 'ADDITIONAL', label: '追加物理ダメージ' })],
        when: { input: 'phase', comparison: 'EQ', value: 'extra' },
        dpsUnsupportedReason: '独立した追加ダメージの1命中のみ計算します。',
        periodTotal: { kind: 'UNSUPPORTED', reason: '追加ダメージの発生待ち・対象選択・規矩の再付与は計算しません。' } }),
    ], [{ key: 'phase', label: '計算する攻撃', kind: 'select', defaultValue: 'normal', options: [
      { value: 'normal', label: '通常攻撃' }, { value: 'extra', label: '追加物理ダメージ' },
    ] }, bool('extraDamageMarkApplied', '対象に規矩を付与済み')],
    ['通常攻撃と追加物理ダメージを別の命中として評価する。追加は検出から命中までHP条件が変わらず、規矩未付与の対象に成立する最初の1回。両段階の合計は計算しない。']),
    conditionRequirements: [
      { condition: { input: 'targetCriticallyWounded', comparison: 'EQ', value: false }, reason: '重傷状態の対象への攻撃は計算対象外です。' },
      { when: { input: 'phase', comparison: 'EQ', value: 'extra' }, condition: { input: 'targetHpPercent', comparison: 'LT', value: 50 },
        reason: '追加物理ダメージは検出時から残りHPが50%未満の対象のみ計算できます。' },
      { when: { input: 'phase', comparison: 'EQ', value: 'extra' }, condition: { input: 'extraDamageMarkApplied', comparison: 'EQ', value: false },
        reason: '規矩を付与済みの対象には追加物理ダメージが再発動しません。' },
    ] },
  ], [talent(0, '墨守', ['DAMAGE', 'STATUS', 'RESOURCE', 'ATTACK_BEHAVIOR'], b => [
    // The nonlethal limit applies to all damage from Ju, including the independent S2 effect.
    // https://prts.wiki/w/矩#天赋
    { ...ctx('nonlethal-damage-cap', 'description:leave_1_hp', { target: attack }),
      item: 'DAMAGE_CAP_PER_TARGET', operation: 'SET', unit: 'POINT',
      value: { type: 'CALC', operation: 'ADD', values: [{ type: 'METRIC', metric: 'targetCurrentHp' }, -1] } },
    status('critical-injury', '致命ダメージを受けた対象のHPを1残して重傷を付与', { target: enemy,
      timing: { type: 'EVENT', event: 'LETHAL_DAMAGE' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('interval') },
      parameterBindings: { movementSpeedRatio: 'move_speed' } }),
    behavior('exclude-critically-wounded', '重傷状態の敵を攻撃対象に選ばない'),
    { ...ctx('critical-injury-kill-sp', 'sp', { target: { ...self, side: 'ALLY', scope: 'DAMAGE_SOURCE' },
      timing: { type: 'EVENT', event: 'KILL' }, condition: eq('targetCriticallyWounded', true), lifetime: { type: 'CURRENT_EVENT' } }),
      item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('sp') },
  ])], [number('targetCurrentHp', '対象の残りHP', 10000, 1, 1000000000, 0.1),
    number('targetHpPercent', '対象の残りHP（%）', 25, 0.01, 100, 0.01),
    bool('targetCriticallyWounded', '対象が重傷状態')], [],
  ['選択した全対象が同じ残りHP・HP割合・重傷状態にある1命中を評価する。HP1を残す非致死上限を反映し、重傷後の自然死亡はダメージに含めない。']),
  operator('char_1035_wisdel', [
    recipe('char_1035_wisdel', 1, next(1, 1, { label: '孤立した主対象1体への強化攻撃', maxTargets: 1,
      traitOverrides: ['AFTERSHOCK'], actions: [damage(), damage(key('append_atk_scale'), 3, { label: '余震3回' })],
      periodTotal: { kind: 'UNSUPPORTED', reason: '別対象の残影爆発・影の攻撃・通常攻撃を含む時間合算は計算しません。' } }), [],
    ['https://prts.wiki/w/EW：残影は無期限・非重複で退場時に消滅し、余震ごとに独立して爆発を判定する。孤立した主対象1体に3回とも余震が命中する場合。']),
    recipe('char_1035_wisdel', 2, [
      normal({ label: 'OD前・孤立した主対象1体', atk: key('atk'), intervalAdd: key('base_attack_time'), maxTargets: 1,
        when: { input: 'overdrive', comparison: 'EQ', value: false },
        periodTotal: { kind: 'UNSUPPORTED', reason: 'ODへの切替、複数対象の爆発の重複、影の攻撃を含む総量は計算しません。' } }),
      normal({ id: 'overdrive-unresolved', label: 'オーバードライブ中', actions: [],
        when: { input: 'overdrive', comparison: 'EQ', value: true },
        unresolved: ['OD前の孤立対象1体のみ計算できます。OD4連撃の残影の消費・再付与と命中配分は未確認です。'] }),
    ], [bool('overdrive', 'オーバードライブ中')]),
    recipe('char_1035_wisdel', 3, normal({ label: '孤立した主対象1体', atk: key('atk'), intervalAdd: key('base_attack_time'),
      maxTargets: 1, actions: [damage(key('attack@atk_scale_3'))],
      periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '弾薬終了や影の攻撃を含む総量は計算しません。' } })),
  ], [
    // The primary/aftershock multiplier excludes the afterimage explosion: https://prts.wiki/w/EW
    talent(0, 'ビッグサプライズ！', ['DAMAGE', 'ADDITIONAL_DAMAGE', 'STATUS'], b => [
      scale(b.read('attack@main_atk_scale')),
      { ...ctx('afterimage-explosion', 'attack@bomb_atk_scale', { target: enemy,
        timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' },
        probability: { chance: conditional(eq('skillIndex', 3), { type: 'METRIC', metric: 'skill.attack@prob' }, b.read('attack@prob')),
          rollScope: 'APPLICATION' } }),
        item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: b.read('attack@bomb_atk_scale'),
        damageType: 'PHYSICAL', basis: 'ATK_STAT', rate: 'PER_ATTACK', label: '残影の爆発',
        hits: conditional(eq('skillIndex', 1), 3, 1) },
      status('afterimage-mark', '攻撃主対象に残影を付与し、爆発でスタン', { target: enemy }),
    ]),
    talent(1, 'くたばり損ない', ['SUMMON', 'SURVIVAL'], () => [status('revenant-shadow', '配置時にレヴァナントの影を召喚'),
      status('shadow-camouflage', '影が周囲にいる間は迷彩')]),
  ], [], [],
  ['ウィシャデル本人が孤立した対象1体を攻撃する値。別の敵の残影からの巻き込みと、別ユニットのレヴァナントの影による攻撃は合算しない。']),
  operator('char_204_platnm', [1, 2].map(index => recipe('char_204_platnm', index, [
    normal({ label: '力溜め最大の1射', atk: key('atk'), ...(index === 2 ? { aspd: key('attack_speed'), duration: 'UNTIL_EXIT' as const } : {}),
      when: { input: 'chargeAtMaximum', comparison: 'EQ', value: true },
      dpsUnsupportedReason: '力溜めが最大になった1射のみ計算します。通常の連射間隔からの充電量・継続DPSは未計算です。' }),
    normal({ id: 'charging', label: '力溜め途中', actions: [], when: { input: 'chargeAtMaximum', comparison: 'EQ', value: false },
      unresolved: ['力溜めの最大倍率を受ける1射のみ計算できます。途中の充電量とフレーム単位の計測基準は未確認です。'] }),
  ])), [talent(0, '力溜め', ['DAMAGE'], b => [scale(b.read('attack@max_atk_scale'), { condition: eq('chargeAtMaximum', true) })])],
  [bool('chargeAtMaximum', '力溜めが最大', true)]),
  operator('char_4138_narant', [1, 2, 3].map(index => {
    const actions = index === 1 ? [damage(key('attack@atk_scale'))]
      : index === 2 ? [damage(key('attack@atk_scale')),
        damage(key('attack@atk_scale_comeback'), choose('targetOnReturnPath', true, 1, 0), { label: '帰路の命中', role: 'ADDITIONAL' })]
        : [damage(key('attack@atk_scale'), key('cnt')),
          damage(key('atk_scale_aoe'), choose('targetWithinSurroundingTiles', true, 1, 0), { label: '回収時の範囲攻撃', role: 'ADDITIONAL' })]
    return recipe('char_4138_narant', index, [
      normal({ label: '奪取上限・孤立対象への1投擲', maxTargets: 1, actions, dpsUnsupportedReason: projectileDpsReason,
        when: { input: 'stealAlreadyCapped', comparison: 'EQ', value: true } }),
      normal({ id: 'steal-changing', label: '奪取の蓄積中', actions: [],
        when: { input: 'stealAlreadyCapped', comparison: 'EQ', value: false },
        unresolved: ['自身の攻撃力増加と対象の防御力低下が、両方とも奪取上限に達した状態のみ計算できます。命中ごとの奪取とダメージの適用順は未確認です。'] }),
    ], index === 2 ? [bool('targetOnReturnPath', '帰路も同じ対象に命中', true)]
      : index === 3 ? [bool('targetWithinSurroundingTiles', '回収時に対象が周囲8マス内')] : [],
    ['対象が1体だけの状態で、1投擲の全命中を計算する。S1の跳躍先や、S2・S3で別の敵に命中する状態は対象外。'])
  }), [
    // Steal changes both units through final additions: https://prts.wiki/w/Narantuya
    talent(0, '砂賊の流儀', ['ABILITY', 'DAMAGE'], b => [
      { ...ctx('stolen-attack', 'attack@steal_atk_max', { condition: eq('stealAlreadyCapped', true) }),
        item: 'ATK_FINAL_FLAT', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('attack@steal_atk_max') },
      { ...ctx('stolen-target-defense', 'attack@steal_def_max', { target: enemy, condition: eq('stealAlreadyCapped', true) }),
        item: 'DEFENSE_REDUCTION_FINAL_FIXED', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('attack@steal_def_max') },
      status('stolen-defense', '奪取で自身の防御力が上昇し、対象の攻撃力が低下'),
    ]),
    talent(1, '婀娜やかな虚影', ['SURVIVAL'], () => [status('dodge', '物理・術回避を獲得'),
      status('surrounding-hit-rate', '周囲8マス内の敵の物理・術命中率が低下', { target: enemy })]),
  ], [bool('stealAlreadyCapped', '自身ATK・対象DEFの奪取が両方上限到達済み', true)]),
  operator('char_113_cqbw', [
    recipe('char_113_cqbw', 1, burst(key('atk_scale'), { label: '榴弾の爆発', maxTargets: null, duration: 0 })),
    recipe('char_113_cqbw', 2, burst(key('atk_scale'), { label: '地雷1個の爆発', maxTargets: null }), [],
      ['地雷1個の爆発を評価する。設置から起爆までの時間と、複数の地雷の連続起爆は計算しない。']),
    recipe('char_113_cqbw', 3, burst(key('atk_scale'), { label: '爆弾1個の爆発', maxTargets: null }), [],
      ['付着した爆弾1個の爆発を評価する。複数の爆弾の重複や、先行する爆発によるスタン状態の変化は計算しない。']),
  ], [
    talent(0, '潜伏', ['SURVIVAL'], () => [status('concealment', '配置から10秒後に物理・術回避が上昇し狙われにくくなる')]),
    talent(1, '悪巧み', ['DAMAGE'], b => [{ ...ctx('stun-physical-vulnerability', 'damage_scale', {
      target: enemy, condition: { type: 'ALL', conditions: [eq('targetStunnedAtDamage', true),
        eq('targetInAttackRange', true), eq('attack.damageType', 'PHYSICAL')] },
    }), item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('damage_scale') }]),
  ], [bool('targetStunnedAtDamage', 'ダメージ発生時に対象がスタン中'),
    bool('targetInAttackRange', '対象がWの攻撃範囲内', true)], [], [sameTargets]),
  operator('char_340_shwaz', [1, 2, 3].map(index => {
    const stage = index === 1 ? next() : normal({ atk: key('atk'), ...(index === 3 ? { intervalAdd: key('base_attack_time') } : {}) })
    return recipe('char_340_shwaz', index, [
      { ...stage, label: '防御低下付与済みの対象への攻撃', when: { input: 'lethalArrowDefenseDownActive', comparison: 'EQ', value: true },
        periodTotal: { kind: 'UNSUPPORTED', reason: '防御低下の付与・更新・解除の時間変化を含む総量は計算しません。' } },
      { ...stage, id: 'defense-down-unknown', label: '初回付与の順序未確認', actions: [],
        when: { input: 'lethalArrowDefenseDownActive', comparison: 'EQ', value: false },
        unresolved: ['リーサルアローの防御低下が付与済みの対象を指定してください。初回の付与とダメージの前後関係は未確認です。'] },
    ], [], ['リーサルアローの防御低下が有効な状態の1攻撃を計算する。'])
  }), [
    talent(0, 'リーサルアロー', ['DAMAGE'], b => [
      critical(b, { type: 'METRIC', metric: 'skill.talent@prob' }),
      { ...ctx('lethal-arrow-defense-down', 'def', { target: enemy, condition: eq('lethalArrowDefenseDownActive', true) }),
        item: 'DEFENSE_REDUCTION_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
        value: { type: 'CALC', operation: 'MULTIPLY', values: [-1, b.read('def')] } },
    ]),
    talent(1, 'クロスファイア', ['ABILITY'], b => [atk(b.read('atk'), 'atk', { condition: eq('anotherSniperDeployed', true) }),
      behavior('sniper-attack-buff', '条件を満たす配置中の狙撃にも攻撃力上昇', { condition: eq('anotherSniperDeployed', true),
        target: { ...self, side: 'ALLY', scope: 'BATTLEFIELD', includeSelf: false, tagIds: ['profession:SNIPER'] } }),
    ]),
  ], [bool('lethalArrowDefenseDownActive', 'リーサルアローの防御低下が付与済み', true),
    bool('anotherSniperDeployed', 'ほかの狙撃が配置中')]),
  operator('char_4211_snhunt', [
    recipe('char_4211_snhunt', 1, next(key('atk_scale'), 1, { includesSkillActivation: true })),
    recipe('char_4211_snhunt', 2, burst(1, { actions: [damage(
      choose('targetStationary', true, key('atk_scale_2'), key('atk_scale_1')), 2)] }),
      [bool('targetStationary', '対象が移動していない')]),
  ], [talent(0, '裂雲の一撃', ['ADDITIONAL_DAMAGE', 'STATUS'], b => [
    { ...ctx('cloudbeast-hit', 'atk_scale', { target: enemy, timing: { type: 'EVENT', event: 'SKILL_START' }, lifetime: { type: 'CURRENT_EVENT' } }),
      item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER', value: b.read('atk_scale'), basis: 'ATK_STAT',
      damageType: 'PHYSICAL', rate: 'PER_ATTACK', label: '裂雲獣' },
    status('cloudbeast-cold', '裂雲獣の攻撃で寒冷を付与', { target: enemy, timing: { type: 'EVENT', event: 'SKILL_START' },
      lifetime: { type: 'FIXED_SECONDS', seconds: b.read('cold') } }),
  ])]),
  operator('char_4104_coldst', [
    recipe('char_4104_coldst', 1, normal({ atk: key('atk'), dpsUnsupportedReason: hunterDpsReason })),
    recipe('char_4104_coldst', 2, normal({ atk: key('atk'), dpsUnsupportedReason: hunterDpsReason })),
  ], [talent(0, '負けん気', ['DAMAGE'], b => [scale(b.read('atk_scale'), {
    condition: eq('secondsSinceNormalAttack', b.read('attack@delay'), 'GTE'),
  })])], [number('secondsSinceNormalAttack', '前回の通常攻撃からの時間（秒）', 0, 0, 1000, 0.1)]),
  operator('char_4117_ray', [
    // The additional special bullet inherits the hunter's 120% trait: https://prts.wiki/w/Ray
    recipe('char_4117_ray', 1, next(key('atk_scale'), 1, { label: '特殊弾1発', duration: 0 })),
    recipe('char_4117_ray', 2, normal({ atk: key('atk'), dpsUnsupportedReason: hunterDpsReason })),
    recipe('char_4117_ray', 3, normal({ actions: [damage(key('attack@atk_scale'))], dpsUnsupportedReason: hunterDpsReason }), [],
      ['初回の装填完了後、弾が装填されている状態の1攻撃を評価する。']),
  ], [
    talent(0, '巡回のおとも', ['DAMAGE', 'SUMMON'], b => [
      { ...ctx('sandbeast-damage', 'damage_scale', { target: enemy, condition: { type: 'ALL', conditions: [
        eq('targetInSandbeastArea', true), eq('attack.damageType', 'PHYSICAL'),
      ] } }), item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER',
      value: { type: 'CALC', operation: 'ADD', values: [1, b.read('damage_scale')] } },
      behavior('sandbeast-targeting', 'サンドビーストの周囲8マスを追加攻撃範囲として優先攻撃'),
    ]),
    talent(1, '一意専心', ['ABILITY'], b => [atk({ type: 'CALC', operation: 'MULTIPLY',
      values: [b.read('atk'), { type: 'METRIC', metric: 'sameTargetAttackStacks' }] })]),
  ], [bool('targetInSandbeastArea', '対象がサンドビーストの周囲8マス内'),
    number('sameTargetAttackStacks', '今回の攻撃に適用する同一対象の累積数', 0, 0, 3)]),
  operator('char_1027_greyy2', [
    recipe('char_1027_greyy2', 1, normal({ atk: key('atk'), aspd: key('attack_speed'), periodTotal: { kind: 'CONSTANT_RATE' } })),
    recipe('char_1027_greyy2', 2, normal({ duration: key('projectile_delay_time'), actions: [damage(),
      damage(mul(key('atk_scale'), 1 / 1.5), input('activeLightningBalls'), { label: 'ライトニングボール（毎秒）', role: 'ADDITIONAL',
        damageType: 'ARTS', basis: 'ATK_STAT', timing: 'PER_SECOND', traitOverrides: ['AFTERSHOCK', 'DAMAGE_TYPE'] }),
    ], periodTotal: { kind: 'UNSUPPORTED', reason: '球の発射・着弾・終了時点を含む総命中数は計算しません。' } }),
      [number('activeLightningBalls', '対象に命中中のライトニングボール数', 1, 0, 2)],
      ['通常攻撃と1.5秒ごとの球の攻撃を別々に軽減し、対象が両方の範囲内にいる現在の毎秒値を計算する。']),
  ], [talent(0, 'ライトニングチェーン', ['STATUS'], b => [status('attack-slow', '攻撃時に確率で足止め', {
    target: enemy, timing: { type: 'EVENT', event: 'ATTACK' }, probability: { chance: b.read('attack@prob'), rollScope: 'APPLICATION' },
    lifetime: { type: 'FIXED_SECONDS', seconds: b.read('attack@sluggish') },
  })])], [], [], [sameTargets]),
  operator('char_391_rosmon', [
    recipe('char_391_rosmon', 1, next(1, 1, { actions: [damage(),
      damage(key('extra_atk_scale'), 1, { label: '追加術ダメージ', role: 'ADDITIONAL', damageType: 'ARTS',
        traitOverrides: ['AFTERSHOCK', 'DAMAGE_TYPE'] }),
    ] })),
    recipe('char_391_rosmon', 2, normal({ atk: key('atk'), intervalAdd: key('base_attack_time'), traitOverrides: ['AFTERSHOCK'],
      actions: [damage(), damage(0.5, add(1, key('add_times')), { label: '余震' })], periodTotal: { kind: 'CONSTANT_RATE' } })),
    recipe('char_391_rosmon', 3, normal({ label: 'ブロック対象1体への攻撃', atk: key('atk'), intervalAdd: key('base_attack_time'),
      maxTargets: 1, defenseReductionFixed: choose('targetBlockedByEquipment', true, 160, 0),
      periodTotal: { kind: 'UNSUPPORTED', reason: 'ブロック状態と戦術装備の存続、2対象の爆発範囲の重複は時間積算しません。' } }),
      [bool('targetBlockedByEquipment', '対象を戦術装備でブロック中', true)],
      ['ブロック中の対象1体だけを攻撃し、別対象への攻撃範囲が重ならない状態を評価する。戦術装備以外の味方がブロックしている場合は、防御低下なしで計算する。']),
  ], [
    talent(0, '殲滅戦用装備', ['DAMAGE'], b => [{ ...ctx('equipment-defense-ignore', 'def_penetrate_fixed'),
      item: 'DEFENSE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT', value: b.read('def_penetrate_fixed') }]),
    talent(1, '思念維持', ['ABILITY'], b => [atk(b.read('atk'), 'atk', { condition: eq('thoughtMaintenanceActive', true) }),
      behavior('caster-attack-buff', '配置時に選択した術師も攻撃力上昇', { target: { ...self, side: 'ALLY', scope: 'BATTLEFIELD',
        includeSelf: false, tagIds: ['profession:CASTER'], selection: { type: 'RANDOM', count: 1 } } }),
    ]),
  ], [bool('thoughtMaintenanceActive', '思念維持の攻撃力上昇が有効', true)], [], [sameTargets]),
  operator('char_4213_skybx', [
    recipe('char_4213_skybx', 1, next()),
    recipe('char_4213_skybx', 2, normal({ actions: [damage(key('attack@atk_scale'))] }), [],
      ['通常の1発を評価する。手動停止時の残弾一斉発射と対象のランダム配分は計算しない。', ammoNote]),
  ], [talent(0, '開けろ、管理局だ！', ['STATUS'], b => [status('first-damage-silence', '敵ごとに一度だけ特殊能力を無効化', {
    target: enemy, timing: { type: 'EVENT', event: 'DAMAGE_DEALT' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('silence') },
  })])], [], [], [sameTargets]),
  operator('char_4055_bgsnow', [
    recipe('char_4055_bgsnow', 1, normal({ atk: key('atk'), actions: [
      damage(1, 1, { label: '通常', probability: add(1, mul(-1, key('prob'))) }),
      damage(key('atk_scale'), 1, { label: '強化', probability: key('prob') }),
    ] })),
    recipe('char_4055_bgsnow', 2, burst(key('atk_scale'), { actions: [damage(key('atk_scale'), 3)] })),
    recipe('char_4055_bgsnow', 3, normal({ intervalAdd: key('base_attack_time'),
      actions: [damage(choose('targetInForwardThreeTiles', true, key('bgsnow_s_3[atk_up].atk_scale'), key('atk_scale')))],
      periodTotal: { kind: 'CONSTANT_RATE' } }), [bool('targetInForwardThreeTiles', '対象が正面の強化範囲内')]),
  ], [
    talent(0, 'オートタイプライター', ['SUMMON'], () => [status('typewriter', 'タイプライターを配置可能')],
      ['タイプライターは別ユニット。パゼオンカ自身の攻撃だけを計算する。']),
    talent(1, '弱点速記', ['DAMAGE'], () => [{ ...ctx('typewriter-defense-reduction', 'description:18% / 23%', { target: enemy }),
      item: 'DEFENSE_REDUCTION_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
      value: conditional(eq('typewriterDefenseReduction', 'ADJACENT'), 0.23, conditional(eq('typewriterDefenseReduction', 'NORMAL'), 0.18, 0)),
    }], ['タイプライターが付与した防御低下の、現在の状態を指定する。付与・4秒後の解除の時間変化は計算しない。']),
  ], [{ key: 'typewriterDefenseReduction', label: 'タイプライターの防御低下', kind: 'select', defaultValue: 'NONE',
    options: [{ value: 'NONE', label: 'なし' }, { value: 'NORMAL', label: '18%' }, { value: 'ADJACENT', label: '隣接時23%' }] }]),
  operator('char_4100_caper', [
    recipe('char_4100_caper', 1, next()),
    recipe('char_4100_caper', 2, normal({ atk: key('atk'), actions: [damage(1, key('cnt'))], dpsUnsupportedReason: projectileDpsReason })),
  ], [talent(0, '遊び心', ['DAMAGE'], b => [critical(b)])]),
  operator('char_4177_brigid', [
    recipe('char_4177_brigid', 1, [
      next(key('atk_scale'), 1, { label: '跳躍先がない単体への1投擲', maxTargets: 1,
        when: { input: 'noBounceTargets', comparison: 'EQ', value: true } }),
      next(1, 1, { id: 'bounce-unknown', label: '跳躍あり', actions: [],
        when: { input: 'noBounceTargets', comparison: 'EQ', value: false },
        unresolved: ['跳躍先がない対象1体への攻撃のみ計算できます。跳躍の対象再選択と初回を含む総命中数は未確認です。'] }),
    ], [bool('noBounceTargets', '対象の周囲に跳躍先なし', true)]),
    recipe('char_4177_brigid', 2, normal({ atk: key('atk'), dpsUnsupportedReason: projectileDpsReason, actions: [
      damage(1, 1, { label: '投擲命中' }),
      damage(key('attack@cut_scale'), 4, { label: '追加攻撃', role: 'ADDITIONAL' }),
    ] })),
  ], [talent(0, '組紐の名手', ['SURVIVAL'], () => [status('physical-dodge', 'ダメージ20回後に物理回避上昇')])]),
  operator('char_2012_typhon', [
    recipe('char_2012_typhon', 1, normal({ atk: key('atk'), aspd: key('attack_speed') }),
      [number('defenseIgnoreStacks', '今回の攻撃に適用する防御無視累積数', 5, 0, 5),
        bool('firstSkillHitOnTarget', 'スキル中、この対象への初回命中')],
      ['入力した防御無視の累積数と初回命中の状態で1攻撃を計算する。攻撃中の累積・8秒経過による解除・初回補正の消費は時間積算しない。']),
    ...[2, 3].map(index => recipe('char_2012_typhon', index, [
      normal({ label: '防御無視上限・命中済みの単体', maxTargets: 1,
        ...(index === 2 ? { atk: key('atk') } : { intervalAdd: key('base_attack_time') }),
        actions: [damage(index === 2 ? 1 : key('attack@s3_atk_scale'), index === 2 ? 2 : key('attack@s3_max_hit_num'))],
        when: { input: 'typhonStableState', comparison: 'EQ', value: true },
        periodTotal: { kind: 'UNSUPPORTED', reason: '対象の初回命中・防御無視累積・弾薬終了までの時間変化は積算しません。' } }),
      normal({ id: 'changing-passives', label: '初回命中・防御無視蓄積中', actions: [],
        when: { input: 'typhonStableState', comparison: 'EQ', value: false },
        unresolved: ['対象が1体だけで、防御無視が上限かつスキル中に一度以上命中済みの状態のみ計算できます。連撃途中の素質の累積・消費は未計算です。'] }),
    ], [bool('typhonStableState', '防御無視上限・スキル中に命中済み', true)],
    ['対象が1体のみの状態で、2本の矢または5連撃がすべて同じ対象へ命中する1攻撃を計算する。'])),
  ], [
    talent(0, '鋭牙の如く', ['DAMAGE'], b => [{ ...ctx('stack-defense-ignore', 'def_penetrate', { target: attack }),
      item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO',
      value: { type: 'CALC', operation: 'MULTIPLY', values: [b.read('def_penetrate'),
        conditional(eq('skillIndex', 1), { type: 'METRIC', metric: 'defenseIgnoreStacks' }, b.read('max_stack_cnt'))] } }]),
    talent(1, '泥沼の如く', ['DAMAGE', 'STATUS'], b => [
      scale(conditional(eq('skillIndex', 1), conditional(eq('firstSkillHitOnTarget', true), b.read('atk_scale'), 1), 1)),
      status('first-hit-slow', 'スキル中の初回命中で足止め', { target: enemy,
        condition: { type: 'ALL', conditions: [eq('skillIndex', 1), eq('firstSkillHitOnTarget', true)] },
        timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('sluggish') } }),
    ]),
  ]),
  operator('char_4193_lemuen', [
    recipe('char_4193_lemuen', 1, normal({ maxTargets: 2, actions: [damage(key('attack@atk_scale'))] }), [], [ammoNote]),
    recipe('char_4193_lemuen', 2, normal({ atk: key('atk'), aspd: key('attack_speed'),
      actions: [damage(choose('targetWanted', true,
        add(key('attack@main_atk_scale'), mul(key('attack@ex_atk_scale'), input('aimSteps'))), 1))],
      dpsUnsupportedReason: '照準時間とHP・防御力による自動発射時点を含む周期は計算せず、指定した照準段階の1発を評価します。',
    }), [number('aimSteps', '照準段階（0〜14）', 0, 0, 14)],
      ['指名手配中の対象は0.25秒ごとの照準段階を指定する。自動発射に至る敵HPの時間変化は推定しない。']),
    recipe('char_4193_lemuen', 3, burst(1, { label: '爆撃1発', maxTargets: null, actions: [damage(
      choose('targetInBlastCenter', true, key('attack@proj_atk_scale_1'), key('attack@proj_atk_scale_2')))] }),
      [bool('targetInBlastCenter', '対象が爆心地の強化範囲内', true)],
      ['スキル終了時の攻撃力で爆撃1発を評価する。複数の爆撃の重複・命中数・時間変化は計算しない。']),
  ], [
    talent(0, '越境追跡許可', ['DAMAGE', 'ATTACK_BEHAVIOR'], b => [
      { ...ctx('wanted-vulnerability', 'damage_scale', { target: enemy, condition: eq('targetWanted', true) }),
        item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('damage_scale') },
      behavior('wanted-targeting', '攻撃範囲外の指名手配中の敵も攻撃可能', { condition: eq('targetWanted', true) }),
    ]),
    talent(1, '逃走犯引き渡し手続き', ['ABILITY', 'RESOURCE'], b => [
      atk(b.read('atk'), 'atk', { condition: eq('deploymentSeconds', b.read('interval'), 'GTE') }),
      { ...ctx('extra-ammo', 'add_count', { condition: eq('deploymentSeconds', b.read('interval'), 'GTE') }),
        item: 'AMMO_CAPACITY', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('add_count') },
    ]),
  ], [bool('targetWanted', '対象が指名手配中'), number('deploymentSeconds', '配置からの経過時間（秒）', 20, 0, 1000, 0.1)], [], [sameTargets]),
  operator('char_363_toddi', [
    recipe('char_363_toddi', 1, normal({ defenseReductionRatio: choose('targetMarked', true, mul(-1, key('def')), 0),
      actions: [damage(key('attack@atk_scale'))], periodTotal: { kind: 'CONSTANT_RATE' } }),
      [bool('targetMarked', '対象に信号矢のマークが付いている', true)]),
    recipe('char_363_toddi', 2, normal({ intervalAdd: key('base_attack_time'), maxTargets: null, actions: [
      damage(key('attack@atk_scale'), 1, { label: '竜矢', targets: 1 }),
      damage(key('attack@splash_atk_scale'), 1, { label: '遅延爆発', role: 'ADDITIONAL' }),
    ] }), [], [ammoNote, '主対象に竜矢と爆発、周囲の選択対象には爆発が命中する。1.5秒後の爆発時も同じ状態である条件。']),
  ], [talent(0, 'パッションスナイプ', ['DAMAGE'], b => [scale(b.read('atk_scale'), { condition: eq('targetSarkaz', true) })])],
  [bool('targetSarkaz', '対象がサルカズ')]),
  operator('char_346_aosta', [
    recipe('char_346_aosta', 1, normal({ atk: key('atk'), aspd: key('attack_speed') })),
    recipe('char_346_aosta', 2, normal({ atk: key('atk'), intervalAdd: key('base_attack_time') })),
  ], [talent(0, '釘刺創', ['ADDITIONAL_DAMAGE'], b => [{
    ...ctx('bleeding', 'atk_scale / duration', { target: enemy, timing: { type: 'EVENT', event: 'ATTACK' },
      lifetime: { type: 'CURRENT_EVENT' }, condition: eq('bleedingActive', true) }),
    item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', lifetime: { type: 'CURRENT_EVENT' }, damage: {
      kind: { type: 'ORDINARY', damageType: 'ARTS' }, amount: { basis: 'ATK_RATIO', reference: 'SOURCE', referenceTime: 'ON_APPLY',
        ratio: { type: 'CALC', operation: 'MULTIPLY', values: [b.read('atk_scale'),
          conditional(eq('skillIndex', 2), { type: 'METRIC', metric: 'skill.talent_scale' }, 1)] } },
      rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: b.read('duration') },
      cadence: { intervalSeconds: 1, firstTickSeconds: null }, stacking: { mode: 'REPLACE', maxStacks: 1 },
      refresh: 'RESET_DURATION', statusId: 'bleeding',
    },
  }], ['未ブロックの敵への攻撃で付与する流血の、付与中の毎秒ダメージを計算する。特性の150%倍率は流血に適用しない。付与・更新・終了の時間積算は行わない。'])],
  [frontal, bool('bleedingActive', '対象に釘刺創の流血が付与中', true)], [], [sameTargets]),
  // Additional reviewed JP roster: ecca6444cc87b91e2a04d6a3a0c24799e8a68c0e.
  operator('char_366_acdrop', [
    recipe('char_366_acdrop', 1, normal({ aspd: key('attack_speed'), periodTotal: { kind: 'CONSTANT_RATE' } })),
    recipe('char_366_acdrop', 2, normal({ atk: key('atk'), actions: [damage(1, 2)], periodTotal: { kind: 'CONSTANT_RATE' } })),
  ], [
    talent(0, 'スライドショット', ['DAMAGE'], b => [{
      ...ctx('minimum-damage', 'atk_scale', { target: attack }),
      item: 'MINIMUM_DAMAGE_RATIO', operation: 'SET', unit: 'RATIO',
      value: conditional(eq('targetInForwardTwoTiles', true), b.read('atk_scale_2'), b.read('atk_scale')),
    }]),
  ], [bool('targetInForwardTwoTiles', '対象が前方直線2マスにいる')]),
  operator('char_279_excu', [
    recipe('char_279_excu', 1, normal({ atk: key('atk'), traitOverrides: ['ATTACK_SCALE'],
      actions: [damage(1.5)], periodTotal: { kind: 'CONSTANT_RATE' } })),
    recipe('char_279_excu', 2, normal({ intervalAdd: key('base_attack_time'), actions: [damage(1, 2)],
      periodTotal: { kind: 'CONSTANT_RATE' } })),
  ], [
    talent(0, 'アサルトカスタム', ['DAMAGE'], b => [{
      ...ctx('defense-ignore', 'def_penetrate_fixed', { target: attack }),
      item: 'DEFENSE_IGNORE_FIXED', operation: 'IGNORE_FIXED', unit: 'POINT', value: b.read('def_penetrate_fixed'),
    }]),
  ], [frontal], [], [sameTargets, 'S1は確認済みの特性倍率150%を、正面以外を含む全攻撃対象へ適用する。']),
  operator('char_4014_lunacu', [
    recipe('char_4014_lunacu', 1, normal({ atk: key('atk'), periodTotal: { kind: 'CONSTANT_RATE' } })),
    recipe('char_4014_lunacu', 2, normal({ aspd: key('attack_speed'), periodTotal: { kind: 'CONSTANT_RATE' } })),
  ], [
    talent(0, '荒野の掟', ['ABILITY', 'SURVIVAL'], b => [{
      ...ctx('active-attack-interval', 'base_attack_time', { condition: eq('source.skillActive', true) }),
      item: 'ATTACK_INTERVAL_ADD', operation: 'ADD_VALUE', unit: 'SECOND', value: b.read('base_attack_time'),
    }, status('inactive-camouflage', 'スキル未発動時に迷彩', { condition: eq('source.skillActive', false) })]),
  ]),
  operator('char_4203_kichi', [
    recipe('char_4203_kichi', 1, normal({ atk: mul(key('atk'), input('attackBuffStacks')), intervalAdd: key('base_attack_time'),
      periodTotal: { kind: 'UNSUPPORTED', reason: '攻撃と撃破による効果の累積推移を含む総ダメージは未計算です。' } }),
      [number('attackBuffStacks', '攻撃力上昇の累積回数', 0, 0, 4)],
      ['入力した累積回数が既に適用された攻撃を計算する。攻撃による累積の進行は含めない。']),
    recipe('char_4203_kichi', 2, normal({ atk: key('atk'), intervalAdd: key('base_attack_time'),
      periodTotal: { kind: 'UNSUPPORTED', reason: '撃破による与ダメージ上昇の推移を含む総ダメージは未計算です。' } })),
  ], [
    talent(0, '豪運ラッシュ！', ['DAMAGE'], b => [{
      ...ctx('kill-type-damage', 'damage_scale'), item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER',
      value: { type: 'CALC', operation: 'ADD', values: [1, { type: 'CALC', operation: 'MULTIPLY',
        values: [b.read('damage_scale'), { type: 'METRIC', metric: 'defeatedEnemyTypes' }] }] },
    }]),
  ], [frontal, number('defeatedEnemyTypes', '撃破した敵の種類数（上限3）', 0, 0, 3)], [],
  [sameTargets, '入力した撃破種類数の与ダメージ補正を固定して評価する。']),
  operator('char_118_yuki', [
    recipe('char_118_yuki', 1, normal({ periodTotal: { kind: 'CONSTANT_RATE' } })),
    recipe('char_118_yuki', 2, burst(1, { label: '手裏剣の1周期ダメージ', maxTargets: null, duration: 0,
      actions: [damage(key('attack@atk_scale'), 1, { label: '1周期（1秒）', damageType: 'ARTS', traitOverrides: ['DAMAGE_TYPE'] })] }), [],
      ['手裏剣1個から受ける1周期の術ダメージを計算する。飛行・停留中の全命中数、投擲全体の1攻撃ダメージ・DPS・スキル総量は計算しない。']),
  ], [
    talent(0, '大型手裏剣', ['ABILITY'], b => [atk(b.read('atk')), {
      ...ctx('attack-interval', 'base_attack_time'), item: 'ATTACK_INTERVAL_ADD', operation: 'ADD_VALUE', unit: 'SECOND',
      value: b.read('base_attack_time'),
    }]),
  ], [], [], [sameTargets]),
  operator('char_126_shotst', [1, 2].map(index => recipe('char_126_shotst', index,
    withExistingDefenseDown(index === 1
      ? next(key('atk_scale'), 1, { defenseReductionRatio: mul(-1, key('def')), duration: 0 })
      : burst(key('atk_scale'), { defenseReductionRatio: mul(-1, key('def')), maxTargets: 5, duration: 0 }),
    'meteorDefenseDownActive'), [bool('meteorDefenseDownActive', 'このスキルの防御低下が付与済み', true)])), [
    talent(0, '対空エキスパート', ['DAMAGE'], b => [scale(b.read('atk_scale'), { condition: eq('targetAirborne', true) })]),
  ], [bool('targetAirborne', '対象が飛行ユニット')], [], [sameTargets]),
  operator('char_219_meteo', [recipe('char_219_meteo', 1, next()),
    recipe('char_219_meteo', 2, withExistingDefenseDown(burst(key('atk_scale'), {
      defenseReductionFixed: mul(-1, key('def')), maxTargets: null, duration: 0,
    }), 'meteoriteDefenseDownActive'), [bool('meteoriteDefenseDownActive', '榴弾装填の防御低下が付与済み', true)])], [
    talent(0, '弾頭改造', ['ABILITY', 'DAMAGE'], b => [atk(b.read('atk'), 'atk', {
      timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' },
      probability: { chance: b.read('prob'), rollScope: 'APPLICATION', sharedRollId: 'meteorite-attack-bonus' },
    })]),
  ], [], [], [sameTargets]),
  operator('char_1013_chen2', [
    recipe('char_1013_chen2', 1, normal({ atk: key('atk'), traitOverrides: ['ATTACK_SCALE'], actions: [damage(1.5)],
      periodTotal: { kind: 'UNSUPPORTED', duration: 'AMMO', reason: '確率的な弾薬消費とスキル継続時間を計算していないため、総ダメージは未計算です。' } }), [], [ammoNote]),
    recipe('char_1013_chen2', 2, withExistingDefenseDown(normal({ atk: key('atk'),
      defenseReductionFixed: mul(-1, key('attack@def')) }), 'waterDefenseDownActive'),
      [frontal, bool('waterDefenseDownActive', '水域の防御低下が付与済み', true)], [ammoNote]),
    recipe('char_1013_chen2', 3, withExistingDefenseDown(normal({ atk: key('atk'),
      defenseReductionFixed: mul(-1, key('attack@def')), traitOverrides: ['ATTACK_SCALE'], actions: [damage(1.5, 2)] }),
    'waterDefenseDownActive'), [bool('waterDefenseDownActive', '水域の防御低下が付与済み', true)], [ammoNote]),
  ], [
    talent(0, '勤倹節約', ['RESOURCE'], b => [
      status('self-ammo-preservation', '自身の弾薬を確率で消費しない', { timing: { type: 'EVENT', event: 'ATTACK' },
        lifetime: { type: 'CURRENT_EVENT' }, probability: { chance: b.read('spareshot_chen.prob'), rollScope: 'APPLICATION' } }),
      status('ally-ammo-preservation', '他の狙撃の弾薬を確率で消費しない', { target: { ...self, side: 'ALLY', scope: 'BATTLEFIELD',
        includeSelf: false, tagIds: ['profession:SNIPER'] }, timing: { type: 'EVENT', event: 'ATTACK' },
        lifetime: { type: 'CURRENT_EVENT' }, probability: { chance: b.read('prob'), rollScope: 'APPLICATION' } }),
    ]),
    talent(1, '海辺の遊龍', ['ABILITY'], b => [speed({ type: 'CALC', operation: 'ADD',
      values: [b.read('chen2_t_2[common].attack_speed'), conditional(eq('mapHasWater', true), b.read('chen2_t_2[map].attack_speed'), 0)] })]),
  ], [bool('mapHasWater', '戦場に水場がある')], [],
  [sameTargets, 'S1・S3は確認済みの特性倍率150%を、正面以外を含む全攻撃対象へ適用する。']),
  operator('char_124_kroos', [recipe('char_124_kroos', 1, next(key('atk_scale'), key('times')))], [
    talent(0, '精密射撃・初級', ['DAMAGE'], b => [critical(b)]),
  ]),
  operator('char_211_adnach', [recipe('char_211_adnach', 1, normal({ atk: key('atk') }))], [
    talent(0, '戦略家', ['ABILITY', 'ATTACK_BEHAVIOR'], b => [speed(b.read('attack_speed')), behavior('ranged-priority', '遠距離攻撃する敵を優先')]),
  ]),
  operator('char_282_catap', [recipe('char_282_catap', 1, normal())], [
    talent(0, '軽量化', ['DEPLOYMENT'], () => [status('deployment-cost', '配置コスト-1')]),
  ], [], [], ['範囲内の選択対象に同じ物理ダメージを与える。爆破範囲の面積から敵数を推定しない。']),
  operator('char_235_jesica', [recipe('char_235_jesica', 1, next()), recipe('char_235_jesica', 2, normal({ atk: key('atk') }))], [
    talent(0, 'スピードリロード', ['ABILITY'], b => [speed(b.read('attack_speed'))]),
  ]),
  operator('char_190_clour', [recipe('char_190_clour', 1, normal({ atk: key('atk') })),
    recipe('char_190_clour', 2, normal({ atk: key('atk'), maxTargets: key('attack@max_target') }))], [
    talent(0, '狩人の経験', ['RESOURCE'], b => [{ ...ctx('sp-recovery', 'sp_recovery_per_sec'), item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: b.read('sp_recovery_per_sec') }]),
  ]),
  operator('char_133_mm', [recipe('char_133_mm', 1, next()),
    recipe('char_133_mm', 2, normal({ atk: key('atk'), intervalAdd: key('base_attack_time') }))], [
    talent(0, 'ヴィクトリアの探偵', ['ABILITY'], b => [atk(b.read('atk')), speed(b.read('attack_speed'))]),
  ]),
  operator('char_302_glaze', [recipe('char_302_glaze', 1, normal()),
    recipe('char_302_glaze', 2, normal({ atk: key('atk'), intervalAdd: key('base_attack_time'),
      dpsUnsupportedReason: '通常射程外への攻撃予備動作を含む周期を計算していないため、1攻撃のダメージのみ表示します。' }))], [
    talent(0, '超長距離狙撃', ['STATUS'], b => [status('distant-stun', '通常射程外の対象をスタン', {
      target: enemy, condition: eq('targetOutsideBaseRange', true), timing: { type: 'EVENT', event: 'ATTACK' },
      probability: { chance: b.read('buff_prob'), rollScope: 'APPLICATION' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('stun') },
    })]),
  ], [bool('targetOutsideBaseRange', '対象が通常の攻撃範囲外')]),
  operator('char_4062_totter', [recipe('char_4062_totter', 1, next(key('atk_scale'), 1, { maxTargets: key('max_target') })),
    recipe('char_4062_totter', 2, normal({ aspd: key('attack_speed'), maxTargets: key('attack@s2n.max_target'),
      actions: [damage(choose('actualAttackTargetCount', 1, key('attack@s2c.atk_scale'), 1))] }))], [
    talent(0, '鋭い眼光', ['ABILITY', 'ATTACK_BEHAVIOR'], b => [atk(b.read('atk'), 'atk', { condition: eq('stealthedEnemyInRange', true) }),
      behavior('target-stealth', 'ステルス状態の敵を攻撃可能')]),
  ], [bool('stealthedEnemyInRange', '攻撃範囲内にステルス状態の敵')]),
  operator('char_440_pinecn', [recipe('char_440_pinecn', 1, burst(key('atk_scale'),
    { maxTargets: null, defenseIgnoreFixed: key('def_penetrate_fixed') })),
    recipe('char_440_pinecn', 2, normal({ atk: choose('skillActivationCount', 1, key('pinecn_s_2[a].atk'),
      choose('skillActivationCount', 2, key('pinecn_s_2[b].atk'), choose('skillActivationCount', 3, key('pinecn_s_2[c].atk'), key('pinecn_s_2[d].atk')))),
      actions: [damage()] }), [number('skillActivationCount', 'スキル発動回数', 1, 1, 100)])], [
    talent(0, 'ポータブル電源', ['RESOURCE'], b => [{ ...ctx('sp-recovery', 'sp_recovery_per_sec', { condition: eq('deploymentSeconds', b.read('duration'), 'LT') }),
      item: 'SP_RECOVERY', operation: 'ADD_VALUE', unit: 'PER_SECOND', value: b.read('sp_recovery_per_sec') }]),
  ], [frontal, number('deploymentSeconds', '配置からの経過時間（秒）', 0, 0, 1000, 0.1)], [], [sameTargets]),
  operator('char_367_swllow', [recipe('char_367_swllow', 1, next(key('atk_scale'), 2)),
    recipe('char_367_swllow', 2, normal({ atk: key('atk'), actions: [damage(1, 3)] }))], [
    talent(0, '追い風', ['ABILITY', 'DAMAGE'], b => [speed(b.read('attack_speed')), critical(b)]),
  ]),
  operator('char_365_aprl', [recipe('char_365_aprl', 1, next()), recipe('char_365_aprl', 2, normal({ atk: key('atk') }))], [
    talent(0, 'ベテランハンター', ['DEPLOYMENT'], b => [{ ...ctx('redeploy', 'respawn_time'), item: 'REDEPLOY_TIME', operation: 'ADD_VALUE', unit: 'SECOND', value: b.read('respawn_time') },
      status('deployment-cost', '配置コスト-1')]),
  ]),
  operator('char_1021_kroos2', [recipe('char_1021_kroos2', 1, normal({ atk: key('atk'), actions: [damage(1, 2)] })),
    recipe('char_1021_kroos2', 2, normal({ intervalAdd: key('base_attack_time'),
      actions: [damage(1, choose('fourHitMode', true, 4, 2))] }), [bool('fourHitMode', '32回命中後の4連撃')],
    ['選択した2連撃または4連撃の状態を評価する。32回目の命中をまたぐ移行中の攻撃は含めない。'])], [
    talent(0, '的中', ['DAMAGE', 'STATUS'], b => [critical(b), status('critical-stun', '確率攻撃時にスタン', { target: enemy,
      timing: { type: 'EVENT', event: 'ATTACK' }, probability: { chance: b.read('prob'), rollScope: 'APPLICATION', sharedRollId: 'critical-attack' },
      lifetime: { type: 'FIXED_SECONDS', seconds: b.read('stun') } })]),
  ]),
  operator('char_498_inside', [recipe('char_498_inside', 1, normal({ actions: [damage(key('attack@atk_scale'))] }), [], [ammoNote]),
    recipe('char_498_inside', 2, normal({ atk: key('atk'), intervalAdd: key('base_attack_time') }), [], [ammoNote])], [
    talent(0, '火力支援', ['RESOURCE'], b => [{ ...ctx('self-ammo', 'self_ammo', { condition: eq('deploymentSeconds', b.read('duration'), 'GTE') }),
      item: 'AMMO_CAPACITY', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('self_ammo') },
      { ...ctx('ally-ammo', 'ally_ammo', { condition: eq('deploymentSeconds', b.read('duration'), 'GTE'),
        target: { ...self, side: 'ALLY', scope: 'BATTLEFIELD', includeSelf: false, factionIds: ['laterano'],
          selection: { type: 'RANDOM', count: 1 }, filterLabels: { laterano: 'ラテラーノ' } } }),
      item: 'AMMO_CAPACITY', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('ally_ammo') }]),
  ], [number('deploymentSeconds', '配置からの経過時間（秒）', 20, 0, 1000, 0.1)]),
  operator('char_379_sesa', [recipe('char_379_sesa', 1, normal({ atk: key('atk') })),
    recipe('char_379_sesa', 2, normal({ actions: [damage(key('attack@atk_scale'))] }), [],
      ['遅延起爆する榴弾が、同じ状態の対象へ継続して命中する場合の攻撃中DPS。'])], [
    talent(0, '弱点分析', ['DAMAGE'], b => [{ ...ctx('physical-vulnerability', 'damage_scale', { target: enemy,
      condition: { type: 'ALL', conditions: [eq('targetBlocked', true), eq('attack.damageType', 'PHYSICAL')] } }),
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('damage_scale') }]),
  ], [bool('targetBlocked', '対象がブロックされている')]),
  operator('char_4078_bdhkgt', [recipe('char_4078_bdhkgt', 1, normal({ atk: key('atk'), aspd: key('attack_speed') })),
    recipe('char_4078_bdhkgt', 2, normal({ label: '飛輪の停留中', fixedAttackInterval: key('interval'), maxTargets: null,
      duration: key('projectile_delay_time'), actions: [damage(key('atk_scale'))],
      periodTotal: { kind: 'UNSUPPORTED', reason: '飛輪の移動中の命中数と停留開始・終了時点を含む総量は計算しません。' } }), [],
      ['飛輪が停止位置に到達した後、対象が範囲内にいる1周期と毎秒値を評価する。'])], [
    talent(0, '荒野を背に', ['ABILITY', 'DEPLOYMENT'], b => [atk(b.read('atk'), 'atk', { condition: eq('firstDeployment', true) }),
      status('deployment-cost', '初回配置コスト-3', { condition: eq('firstDeployment', true) })]),
  ], [bool('firstDeployment', '初回配置', true)]),
  operator('char_158_milu', [recipe('char_158_milu', 1, normal({ atk: key('atk') })),
    recipe('char_158_milu', 2, burst(key('atk_scale'), { maxTargets: null, actions: [damage(key('atk_scale'), input('bombHits'))] }),
      [number('bombHits', '各対象に命中する爆弾数', 1, 1, 3)], ['爆弾の配置確率は推定せず、入力した命中数で計算する。', sameTargets])], [
    talent(0, '暗殺者', ['DAMAGE'], b => [scale(b.read('atk_scale'), { condition: eq('targetRanged', true) })]),
  ], [bool('targetRanged', '対象が遠距離攻撃ユニット')]),
  operator('char_218_cuttle', [recipe('char_218_cuttle', 1, normal({ atk: key('atk') })),
    recipe('char_218_cuttle', 2, [normal({ atk: key('atk'), when: { input: 'targetHpPercent', comparison: 'GT', value: 50 } }),
      normal({ id: 'invalid-target', label: '攻撃対象外', when: { input: 'targetHpPercent', comparison: 'LTE', value: 50 },
        actions: [], unresolved: ['S2はHP50%以下の敵を攻撃しません。対象のHP条件を変更してください。'] })],
      [number('targetHpPercent', '対象のHP（%）', 100, 0, 100, 0.1)], ['HPが50%を超える対象を攻撃中の値。途中のHP減少による攻撃停止は含めない。'])], [
    talent(0, '深海の第六感', ['ABILITY'], b => [speed(b.read('attack_speed'), { timing: { type: 'CONTINUOUS', while: 'IN_SQUAD' },
      target: { ...self, side: 'ALLY', scope: 'SQUAD', factionIds: ['abyssal'], filterLabels: { abyssal: 'アビサルハンター' } } })]),
  ]),
  operator('char_4043_erato', [recipe('char_4043_erato', 1, [
    next(key('atk_scale'), 1, { label: '睡眠付与済みの対象への攻撃', when: { input: 'targetSleeping', comparison: 'EQ', value: true } }),
    next(1, 1, { id: 'sleep-order-unknown', label: '初回睡眠付与の順序未確認', actions: [],
      when: { input: 'targetSleeping', comparison: 'EQ', value: false },
      unresolved: ['睡眠付与済みの対象のみ計算できます。初回の睡眠付与とダメージの前後関係は未確認です。'] }),
  ], [bool('targetSleeping', '対象が睡眠中', true)]),
    recipe('char_4043_erato', 2, normal({ atk: key('atk'), aspd: key('attack_speed') }))], [
    talent(0, '微睡へ捧ぐリラ', ['DAMAGE', 'ATTACK_BEHAVIOR'], b => [{ ...ctx('sleep-defense-ignore', 'def_penetrate', { condition: eq('targetSleeping', true), target: attack }),
      item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: b.read('def_penetrate') }, behavior('sleep-target', '睡眠状態の敵を攻撃可能')]),
  ], [bool('targetSleeping', '対象が睡眠中')]),
  operator('char_145_prove', [
    // The 20% HP unit is continuous, not quantized, and modifies attack scale: https://prts.wiki/w/Provence
    recipe('char_145_prove', 1, normal({ actions: [damage(add(1,
      mul(add(1, mul(-0.01, input('targetHpPercent'))), key('atk_scale_up'), 5)))],
      periodTotal: { kind: 'UNSUPPORTED', reason: '対象HPの変化に伴う攻撃倍率の時間積算は計算しません。' } }),
      [number('targetHpPercent', '対象のHP（%）', 100, 0.1, 100, 0.1)]),
    recipe('char_145_prove', 2, [normal({ atk: key('atk'), when: { input: 'targetHpPercent', comparison: 'LT', value: 80 } }),
    normal({ id: 'invalid-target', label: '攻撃対象外', when: { input: 'targetHpPercent', comparison: 'GTE', value: 80 },
      actions: [], unresolved: ['S2はHP80%以上の敵を攻撃しません。対象のHP条件を変更してください。'] })],
    [number('targetHpPercent', '対象のHP（%）', 79, 0, 100, 0.1)], ['HP80%未満の対象を攻撃中の値。'])], [
    talent(0, 'ハンターアロー', ['DAMAGE'], b => [critical(b, conditional(eq('targetImmediatelyAhead', true), b.read('prob2'), b.read('prob')))]),
  ], [bool('targetImmediatelyAhead', '対象が正面1マスにいる')]),
  operator('char_4006_melnte', [recipe('char_4006_melnte', 1, normal({ atk: key('atk'), intervalAdd: key('base_attack_time') })),
    // Reviewed projectile curve and seconds since launch: https://prts.wiki/w/Melanite
    recipe('char_4006_melnte', 2, [
      burst(choose('projectileFlightSeconds', 0.1,
        mul(key('atk_scale'), add(1.002363, mul(-0.02363, input('projectileFlightSeconds')))),
        add(key('atk_scale'), mul(add(key('scale'), mul(-1, key('atk_scale'))),
          add(input('projectileFlightSeconds'), -0.1), 1 / 0.24)), 'LTE'),
      { label: '飛翔時間を指定した貫通弾1発', maxTargets: null, duration: 0,
        when: { input: 'projectileFlightSeconds', comparison: 'LTE', value: 0.34 } }),
      burst(1, { id: 'flight-curve-unknown', label: '終端の飛翔区間', actions: [],
        when: { input: 'projectileFlightSeconds', comparison: 'GT', value: 0.34 },
        unresolved: ['発射後0〜0.34秒の減衰曲線を確認済みです。0.34秒超から消失までの区間は未確認です。'] }),
    ], [number('projectileFlightSeconds', '命中時の発射後経過時間（秒）', 0.1, 0, 0.4, 0.01)],
    ['全対象が指定した飛翔時間の倍率で命中するものとして計算する。対象ごとに距離が異なる合計は計算しない。'])], [
    talent(0, 'パラメーター調整', ['DAMAGE'], b => [{ ...ctx('skill-damage', 'damage_scale', { condition: eq('skillActivationCount', 2, 'GTE') }),
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('damage_scale') }]),
  ], [number('skillActivationCount', 'スキル発動回数', 1, 1, 100)]),
  operator('char_103_angel', [recipe('char_103_angel', 1, next(key('atk_scale'), key('times'))),
    recipe('char_103_angel', 2, normal({ actions: [damage(key('attack@atk_scale'), key('attack@times'))] })),
    recipe('char_103_angel', 3, normal({ intervalAdd: key('base_attack_time'), actions: [damage(key('attack@atk_scale'), key('attack@times'))] }))], [
    talent(0, 'スピードリロード', ['ABILITY'], b => [speed(b.read('attack_speed'))]),
    talent(1, '天使の祝福', ['ABILITY'], b => [atk(b.read('atk')), status('max-hp', '最大HP+10%'),
      behavior('random-ally-blessing', '配置中、ランダムな味方1名にも攻撃力・最大HP上昇を付与')]),
  ]),
  operator('char_332_archet', [recipe('char_332_archet', 1, next(key('atk_scale'), 1, { maxTargets: key('max_target'), actions: [
    damage(key('atk_scale'), 1, { label: '主対象', targets: 1 }),
    damage(key('atk_scale_2'), 1, { label: '周囲の対象', targets: add(input('actualAttackTargetCount'), -1) }),
  ] })), recipe('char_332_archet', 2, burst(key('atk_scale'), { maxTargets: key('times'), actions: Array.from({ length: 5 }, (_, index) =>
    damage(key('atk_scale'), add(key('times'), -index), { label: index === 0 ? '主対象' : `連鎖${index}`,
      targets: choose('actualAttackTargetCount', index + 1, 1, 0, 'GTE') })) }), [],
    ['選択対象が順に連鎖範囲に入り、主対象から5・4・3・2・1回命中する1発動の値。']),
    recipe('char_332_archet', 3, normal({ atk: key('atk'), maxTargets: key('attack@max_target'), actions: [damage(1, key('attack@times'))] }))], [
    talent(0, 'ランデン戦術', ['RESOURCE'], b => [{ ...ctx('sniper-sp', 'sp', { timing: { type: 'PERIODIC', intervalSeconds: b.read('interval'), firstTickSeconds: null },
      condition: eq('recipientSpRecovery', 'ATTACK'), target: { ...self, side: 'ALLY', scope: 'BATTLEFIELD', tagIds: ['profession:SNIPER'], filterLabels: { 'profession:SNIPER': '狙撃' } } }),
      item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('sp') }]),
    talent(1, '鉄弦', ['SURVIVAL', 'RESOURCE'], b => [status('shield', '配置後シールドを1枚形成'),
      { ...ctx('shield-sp', 'sp'), item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('sp'), condition: eq('shieldConsumed', true) }]),
  ]),
  operator('char_456_ash', [recipe('char_456_ash', 1, normal({ atk: key('atk'), actions: [damage(1, key('attack@times'))] })),
    recipe('char_456_ash', 2, normal({ intervalAdd: key('base_attack_time'), actions: [damage(choose('targetStunned', true, key('ash_s_2[atk_scale].atk_scale'), 1))] }),
      [bool('targetStunned', '対象がスタン中', true)], [ammoNote, 'スタン状態を固定して評価する。スタン終了をまたぐ銃弾全体の総量は含めない。']),
    recipe('char_456_ash', 3, burst(1, { maxTargets: null, actions: [
      damage(key('atk_scale'), choose('contactHit', true, 1, 0), { label: '接触' }),
      damage(choose('hitHighGround', true, key('hitwall_scale'), key('not_hitwall_scale')), choose('explosionHit', true, 1, 0), { label: '爆発' }),
    ] }), [bool('contactHit', '対象に弾が接触', true), bool('explosionHit', '対象に爆発が命中', true), bool('hitHighGround', '弾が高台に衝突')], [sameTargets])], [
    talent(0, 'スタングレネード', ['STATUS'], b => [status('deploy-stun', '配置時に対象と周囲をスタン', { target: enemy,
      timing: { type: 'EVENT', event: 'DEPLOY' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('stun') } })]),
    talent(1, 'アサルトラッシュ', ['RESOURCE', 'DEPLOYMENT'], b => [status('first-deploy-cost', '初回配置コスト-3', { condition: eq('firstDeployment', true) }),
      { ...ctx('first-deploy-sp', 'sp', { timing: { type: 'EVENT', event: 'DEPLOY' }, condition: eq('firstDeployment', true) }), item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('sp') }]),
  ]),
  operator('char_430_fartth', [recipe('char_430_fartth', 1, normal({ atk: key('atk'), aspd: key('attack_speed') })),
    recipe('char_430_fartth', 2, normal({ aspd: key('attack_speed') })),
    recipe('char_430_fartth', 3, normal({ atk: key('atk'),
      damageScale: choose('targetOutsideBaseRange', true, key('damage_scale'), 1), periodTotal: { kind: 'CONSTANT_RATE' } }),
      [bool('targetOutsideBaseRange', '対象が通常の攻撃範囲外')])], [
    talent(0, '一心不乱', ['ABILITY'], b => [atk(b.read('atk'), 'atk', { condition: eq('noDamageForTenSeconds', true) })]),
    talent(1, '颯射ち', ['ABILITY', 'ATTACK_BEHAVIOR'], () => [status('reduced-target-priority', 'スキル中に狙われにくくなる'),
      behavior('ignore-physical-dodge', 'スキル中の攻撃は物理回避を無視')]),
  ], [bool('noDamageForTenSeconds', '直前10秒間被ダメージなし', true)]),
  operator('char_300_phenxi', [recipe('char_300_phenxi', 1, normal({ atk: key('atk') })),
    recipe('char_300_phenxi', 2, [
      burst(key('atk_scale'), { label: '終点爆発1回', maxTargets: null, duration: 0,
        when: { input: 'explosionPart', comparison: 'EQ', value: 'END' } }),
      burst(key('atk_scale_2'), { id: 'trail-explosion', label: '灼熱跡の爆発1回', maxTargets: null, duration: 0,
        when: { input: 'explosionPart', comparison: 'EQ', value: 'TRAIL' } }),
    ], [{ key: 'explosionPart', label: '爆発', kind: 'select', defaultValue: 'END',
      options: [{ value: 'END', label: '終点爆発1回' }, { value: 'TRAIL', label: '灼熱跡の爆発1回' }] }],
    ['選択した爆発1回のダメージを計算する。弾道上の各爆発の命中数を合計した1発動全体のダメージは計算しない。']),
    recipe('char_300_phenxi', 3, normal({ intervalAdd: key('base_attack_time'), actions: [damage(
      choose('targetInBlastCenter', true, key('attack@atk_scale'), key('attack@atk_scale_2')))] }),
      [bool('targetInBlastCenter', '対象が爆心地の強化範囲内', true)], [sameTargets])], [
    talent(0, '苦難陳述', ['ABILITY', 'SURVIVAL'], b => [atk(conditional(eq('selfHpPercent', 80, 'GTE'), b.read('phenxi_t_1[peak_2].peak_performance.atk'),
      conditional(eq('selfHpPercent', 50, 'GTE'), b.read('phenxi_t_1[peak_1].peak_performance.atk'), 0)), 'peak_performance.atk'),
      status('hp-loss', 'HPが徐々に減少し、この効果ではHPが0にならない')]),
    talent(1, '終焉宣告', ['ABILITY'], b => [speed(b.read('attack_speed'), { condition: eq('source.skillActive', false) })]),
  ], [number('selfHpPercent', '自身のHP（%）', 100, 0, 100, 0.1)]),
  operator('char_197_poca', [recipe('char_197_poca', 1, normal({ atk: key('atk') })),
    recipe('char_197_poca', 2, normal({ atk: key('atk'), maxTargets: key('attack@max_target') })),
    recipe('char_197_poca', 3, normal({ label: 'バインドランス命中中', atk: key('atk'), maxTargets: key('max_target'),
      fixedAttackInterval: key('hit_interval'), duration: key('hit_duration'),
      periodTotal: { kind: 'UNSUPPORTED', reason: '初回・終了時点を含む総命中数は計算しません。' } }), [],
      ['ランス命中後の1秒ごとのダメージを計算する。'])], [
    talent(0, '大物猟', ['DAMAGE'], b => [{ ...ctx('weight-defense-ignore', 'def_penetrate', { target: attack, condition: eq('targetWeight', b.read('value'), 'GTE') }),
      item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: b.read('def_penetrate') }]),
    talent(1, '学生の鑑', ['ABILITY'], b => [atk(b.read('atk'), 'atk', { timing: { type: 'CONTINUOUS', while: 'IN_SQUAD' },
      target: { ...self, side: 'ALLY', scope: 'SQUAD', factionIds: ['student'], filterLabels: { student: 'ウルサス学生自治団' } } })]),
  ], [number('targetWeight', '対象の重量ランク', 3, 0, 10)]),
  operator('char_129_bluep', [recipe('char_129_bluep', 1, next(key('atk_scale'), 1, { maxTargets: 2 })),
    recipe('char_129_bluep', 2, normal({ atk: key('atk'), maxTargets: 3, actions: [
      damage(1, key('attack@times'), { label: '主対象', targets: 1 }),
      damage(1, 1, { label: '追加対象', targets: add(input('actualAttackTargetCount'), -1) }),
    ] }))], [
    talent(0, '神経毒', ['ADDITIONAL_DAMAGE'], b => [{ ...ctx('poison', 'poison_damage', { target: enemy,
      timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' }, condition: eq('poisonActive', true) }),
      item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', lifetime: { type: 'CURRENT_EVENT' }, damage: {
        kind: { type: 'ORDINARY', damageType: 'ARTS' }, amount: { basis: 'FIXED', value: b.read('poison_damage'), referenceTime: 'NOT_APPLICABLE' },
        rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: b.read('duration') }, cadence: { intervalSeconds: 1, firstTickSeconds: null },
        stacking: { mode: 'REPLACE', maxStacks: 1 }, refresh: 'RESET_DURATION', statusId: 'poison',
      } }], ['付与中の毎秒ダメージを評価する。付与終了時刻・更新・有限時間の毒総量は含めない。']),
  ], [bool('poisonActive', '対象に神経毒が付与中', true)]),
]
