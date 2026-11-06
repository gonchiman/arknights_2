import sources from '../data/expandedCasterSources.json' with { type: 'json' }
import type { ExpandedOperatorDefinition, ExpandedTalentDefinition } from './expandedCombatTypes.ts'
import type { GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import type { TalentStructureEffect } from './talentStructure.ts'
import type { CombatCondition, CombatEffectContext, CombatNumericValue } from './combatEffectStructure.ts'

const k = (key: string): GuardValue => ({ key })
const choose = (input: string, value: string | number | boolean, yes: GuardValue, no: GuardValue = 0,
  comparison: 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE' = 'EQ'): GuardValue => ({ op: 'if', input, comparison, value, yes, no })
const product = (...args: GuardValue[]): GuardValue => ({ op: 'mul', args })
const n = (key: string, label: string, value: number, min: number, max: number): GuardInput =>
  ({ key, label, kind: 'number', defaultValue: value, min, max, step: 1 })
const b = (key: string, label: string, defaultValue = false): GuardInput => ({ key, label, kind: 'boolean', defaultValue,
  options: [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] })
const select = (key: string, label: string, choices: readonly [string, string][]): GuardInput =>
  ({ key, label, kind: 'select', defaultValue: choices[0][0], options: choices.map(([value, label]) => ({ value, label })) })
const eq = (metric: string, value: string | number | boolean): CombatCondition => ({ type: 'COMPARE', metric, comparison: 'EQ', value })
const metric = (metric: string): CombatNumericValue => ({ type: 'METRIC', metric })
const mul = (...values: CombatNumericValue[]): CombatNumericValue => ({ type: 'CALC', operation: 'MULTIPLY', values })
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
  actions: [{ label: '術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1 }], ...options })
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
const bodyOnly = '本体の攻撃を評価し、独立した召喚ユニットの攻撃・撃破による途中の強化更新は合算しません。'
const linReason = '盾破壊の発生回数・連続撃破・味方に付与した盾のダメージを別途確認する必要があります。'
const linStages = (stage: GuardStage): readonly GuardStage[] => [phase('linPhase', 'ATTACK', stage),
  phase('linPhase', 'SHIELD', { ...unresolved('浄瑠壁の破壊', linReason),
    calculationIssues: [{ id: 'lin-shield-break', reason: linReason, relatedSections: ['スキル', '素質1'] }] })]
const gnosisReason = '攻撃中に寒冷から凍結へ変わる場合の各命中時点の状態・脆弱付与順を扱いません。凍結済みの対象を指定してください。'
const frozenStages = (stage: GuardStage): readonly GuardStage[] => [
  { ...stage, when: { input: 'gnosisTargetFrozen', comparison: 'EQ', value: true }, resistanceReductionFixed: 15,
    dpsUnsupportedReason: '既に凍結している対象への1回分を評価し、凍結の更新・解除を含む攻撃周期は計算しません。',
    periodTotal: period(gnosisReason) },
  { ...unresolved('寒冷・凍結への移行', gnosisReason), id: 'changing', when: { input: 'gnosisTargetFrozen', comparison: 'EQ', value: false },
    calculationIssues: [{ id: 'gnosis-freeze-transition', reason: gnosisReason, relatedSections: ['スキル', '素質1'] }] },
]
const aromaPeriod = '初撃の浮遊付与・落下・再攻撃の時間を扱わず、指定した1回の攻撃または落下時のダメージを評価します。'
const aromaFirstReason = '初撃で生じる空中追加ダメージに素質110%が適用される範囲を確認する必要があります。既に攻撃済みの対象を指定してください。'
const aromaFirst = eq('aromaFirstHit', true)
const chainActions = (scale: GuardValue): GuardDamageAction[] => [0, 1, 2, 3].map(jump => ({
  label: jump === 0 ? '2本の初撃' : `2本の跳躍${jump}`, role: 'MAIN', damageType: 'ARTS',
  scale: product(scale, 0.85 ** jump),
  targets: choose('actualAttackTargetCount', jump + 1, choose('actualAttackTargetCount', 1, 1, 2), 0, 'GTE'),
}))

/** Each recipe evaluates an explicit current state; unreviewed state transitions remain blocked. */
export const EXPANDED_CASTER_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
  operator('char_2015_dusk', [
    [1, normal({ label: '強化攻撃', kind: 'NEXT_ATTACK', actions: [{ label: '強化攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('atk_scale') }] })],
    [2, normal({ atk: k('atk'), aspd: k('attack_speed'), maxTargets: null,
      actions: [{ label: '術攻撃', role: 'MAIN', damageType: 'ARTS', scale: 1,
        damageScaleWhenType: { damageType: 'ARTS', scale: choose('targetHpPercent', 50, k('damage_scale'), 1, 'LTE') } }],
      periodTotal: period('対象HP・積墨の段階を固定した現在の攻撃を評価し、スキル中の変化は計算しません。') }),
      [n('targetHpPercent', '対象のHP（%）', 100, 0, 100)]],
    [3, normal({ atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: period(bodyOnly) })],
  ], [talent(0, '積墨', v => {
    if (v.read('max_stack_cnt') !== 15) v.issue('積墨の累積上限が確認済みの15回と一致しません。')
    return [effect('kill-atk', 'atk / max_stack_cnt', { item: 'ATK_BUFF_RATIO', operation: 'ADD_RATIO', unit: 'RATIO',
      value: mul(v.read('atk'), metric('duskKillStacks')) })]
  }, ['DAMAGE']),
  talent(1, '点睛', () => [status('freeling', '配置後初撃で小自在を独立ユニットとして召喚')])],
  { inputs: [n('duskKillStacks', '積墨の累積回数', 0, 0, 15), select('duskDamageSource', '計算対象', [['BODY', 'シー本体'], ['FREELING', '小自在']])],
    traitNotes: [bodyOnly, '選択した全対象が同じ範囲攻撃に命中し、同じHP条件にある状態。'] }),

  operator('char_4080_lin', [
    [1, linStages(normal({ label: '発動状態の攻撃', atk: k('atk'), intervalAdd: k('base_attack_time'), periodTotal: period(linReason) }))],
    [2, linStages(normal({ aspd: k('attack_speed'), periodTotal: period(linReason) }))],
    [3, linStages(normal({ atk: k('atk'), periodTotal: period(linReason) }))],
  ], [talent(0, '万策の構え', v => [status('shield', '被ダメージ閾値以下を無効化する浄瑠壁を生成'),
    effect('shield-break', 'atk_scale', { item: 'ADDITIONAL_ATTACK', operation: 'DEAL_DAMAGE', unit: 'MULTIPLIER',
      value: v.read('atk_scale'), damageType: 'ARTS', basis: 'ATK_STAT', rate: 'PER_ATTACK' },
      { timing: { type: 'EVENT', event: 'DAMAGE_RECEIVED' }, lifetime: { type: 'CURRENT_EVENT' }, condition: eq('linPhase', 'SHIELD') }),
    status('shield-stun', '浄瑠壁の破壊時に周囲の敵をスタン')], ['SURVIVAL', 'ADDITIONAL_DAMAGE', 'STATUS']),
  talent(1, '韜晦', () => [status('received-sp', '被撃時に確率でSPを回復')], ['RESOURCE'])],
  { inputs: [select('linPhase', '計算対象', [['ATTACK', '通常攻撃'], ['SHIELD', '盾破壊']])],
    traitNotes: ['スキルの発動状態での通常攻撃を評価する。盾破壊の追加ダメージは未対応段階として分離する。'] }),

  // https://prts.wiki/w/灵知: friendly freeze reduces RES by 15; the ending hit precedes its removal.
  operator('char_206_gnosis', [
    [1, frozenStages(normal({ label: '凍結済み対象への2連撃', kind: 'NEXT_ATTACK',
      actions: [{ label: '2連撃', role: 'MAIN', damageType: 'ARTS', scale: k('atk_scale'), hits: 2 }] }))],
    [2, frozenStages(action('凍結済み対象へのゼロバースト', k('atk_scale')))],
    [3, [
      phase('gnosisPhase', 'ATTACK', { ...frozenStages(normal({ aspd: k('attack_speed'), maxTargets: k('max_target') }))[0],
        when: undefined }),
      phase('gnosisPhase', 'ENDING', { ...action('凍結解除前の終了ダメージ', k('atk_scale')), resistanceReductionFixed: 15,
        periodTotal: period('終了時の1回分のみを評価し、通常攻撃との時間合計は計算しません。') }),
      phase('gnosisPhase', 'TRANSITION', { ...unresolved('寒冷・凍結への移行', gnosisReason),
        calculationIssues: [{ id: 'gnosis-freeze-transition', reason: gnosisReason, relatedSections: ['スキル', '素質1'] }] }),
    ], [select('gnosisPhase', '計算対象', [['ATTACK', '凍結済み対象への通常攻撃'], ['ENDING', '終了時の凍結対象へのダメージ'], ['TRANSITION', '寒冷・凍結への移行']])]],
  ], [talent(0, '堅氷', v => [status('cold', '攻撃時に寒冷を付与'),
    effect('frozen-fragile', 'damage_scale_freeze', { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('damage_scale_freeze') },
      { condition: eq('gnosisTargetFrozen', true) }),
    effect('cold-fragile', 'damage_scale_cold', { item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('damage_scale_cold') },
      { condition: eq('gnosisTargetFrozen', false) })], ['STATUS', 'DAMAGE']),
  talent(1, '履霜', () => [status('kjerag-resist', '配置10秒後から味方イェラグにレジスト')], ['STATUS'])],
  { inputs: [b('gnosisTargetFrozen', '命中前から対象が凍結中', true)], traitNotes: [gnosisReason,
    '全対象が攻撃範囲内で凍結している状態。凍結による術耐性15低下を自動適用する。'] }),

  // Both chains visit the same mutually reachable target group; individual targets may receive different jump ranks.
  operator('char_135_halo', [
    [1, normal({ label: '2本の強化チェーン', kind: 'NEXT_ATTACK', maxTargets: 4, traitOverrides: ['CHAIN_ATTACK'], actions: chainActions(k('atk_scale')) })],
    [2, normal({ atk: k('atk'), maxTargets: 4, traitOverrides: ['CHAIN_ATTACK'], actions: chainActions(1),
      periodTotal: period('現在の攻撃速度の累積段階を固定し、途中の段階上昇・対象移動を計算しません。') })],
  ], [talent(0, '研究熱心', v => {
    if (v.read('max_stack_cnt') !== 5) v.issue('研究熱心の累積上限が確認済みの5回と一致しません。')
    return [effect('stacked-speed', 'attack_speed / max_stack_cnt / interval',
      { item: 'ATTACK_SPEED', operation: 'ADD_VALUE', unit: 'POINT', value: mul(v.read('attack_speed'), metric('astgenneSpeedStacks')) })]
  })],
  { inputs: [n('astgenneSpeedStacks', '研究熱心の累積回数', 0, 0, 5), b('astgenneAllTargetsReachable', '2本とも全対象へ跳躍可能', true)],
    traitNotes: ['全対象が互いに跳躍可能で、2本とも同じ最大4体を通過する条件。単体時は1本。各対象の値は跳躍順による差を平均した値。対象が分散した配置は含めない。'] }),

  // https://prts.wiki/w/Aroma: S1 checks airborne status 0.1s after the first hit, including newly levitated enemies.
  operator('char_446_aroma', [
    [1, [{ ...normal({ label: '強化攻撃と空中対象への追加ダメージ', kind: 'NEXT_ATTACK', actions: [
      { label: '強化攻撃', role: 'MAIN', damageType: 'ARTS', scale: k('atk_scale') },
      { label: '空中対象への追加ダメージ', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT',
        scale: k('atk_scale_to_fly'), hits: choose('aromaTargetAirborne', true, 1) },
    ], periodTotal: period(aromaPeriod) }), when: { input: 'aromaFirstHit', comparison: 'EQ', value: false } },
    { ...unresolved('初撃と浮遊追加の倍率', aromaFirstReason), id: 'first-hit', when: { input: 'aromaFirstHit', comparison: 'EQ', value: true },
      calculationIssues: [{ id: 'aroma-first-extra-scale', reason: aromaFirstReason, relatedSections: ['スキル', '素質1'] }] }]],
    [2, [phase('aromaPhase', 'ATTACK', normal({ atk: k('atk'), dpsUnsupportedReason: aromaPeriod, periodTotal: period(aromaPeriod) })),
      phase('aromaPhase', 'LANDING', action('浮遊終了1回', k('attack@atk_scale_when_fly_finish'), { atk: k('atk'), maxTargets: 1,
        actions: [{ label: '浮遊終了1回', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: k('attack@atk_scale_when_fly_finish') }],
        periodTotal: period(aromaPeriod) }))],
      [select('aromaPhase', '計算対象', [['ATTACK', '通常攻撃'], ['LANDING', '浮遊終了時の追加ダメージ']]), b('aromaSkillActive', 'ダメージ時点でスキル発動中', true)]],
  ], [talent(0, '起泡性テスト', v => [effect('first-attack', 'damage_scale',
    { item: 'ATTACK_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: v.read('damage_scale') },
    { condition: { type: 'ALL', conditions: [aromaFirst, { type: 'COMPARE', metric: 'actionKind', comparison: 'NE', value: 'SKILL_ACTION' }] } }),
    status('first-levitate', '対象ごとの初撃で浮遊を付与')], ['DAMAGE', 'STATUS'])],
  { inputs: [b('aromaFirstHit', '対象への初撃'), b('aromaTargetAirborne', '命中前から対象が空中')],
    traitNotes: ['選択した全対象の初撃・空中状態が同じ条件。S1初撃は未対応段階として分離する。',
      'S2の浮遊終了はスキル発動中、かつこのオペレーターから既に攻撃済みの対象への1回分。スキル終了後や味方が浮遊させた未攻撃対象の落下は含めない。'] }),
]

// Cross-field restrictions stay outside the damage formulas and fail before numerical output.
for (const definition of EXPANDED_CASTER_DEFINITIONS) {
  if (definition.operatorId === 'char_2015_dusk') {
    for (const recipe of definition.recipes) {
      const reason = '小自在の独立ステータスと攻撃は未対応です。シー本体の攻撃だけを計算できます。'
      recipe.stages = [phase('duskDamageSource', 'BODY', recipe.stages[0]),
        phase('duskDamageSource', 'FREELING', { ...unresolved('小自在の独立攻撃', reason),
          calculationIssues: [{ id: 'dusk-freeling', reason, relatedSections: recipe.skillIndex === 3 ? ['スキル', '素質2'] : ['素質2'] }] })]
    }
  }
  if (definition.operatorId === 'char_135_halo') {
    for (const recipe of definition.recipes) {
      recipe.stages = [{ ...recipe.stages[0], when: { input: 'astgenneAllTargetsReachable', comparison: 'EQ', value: true } },
        { ...unresolved('分散した対象配置', '2本の跳躍先が異なる配置の命中配分は未対応です。'), id: 'separate-chains',
          when: { input: 'astgenneAllTargetsReachable', comparison: 'EQ', value: false },
          calculationIssues: [{ id: 'astgenne-separated-chains', reason: '2本の跳躍先が異なる配置の命中配分は未対応です。', relatedSections: ['スキル', '特性'] }] }] satisfies readonly GuardStage[]
      recipe.conditionRequirements = [{
        condition: { input: 'astgenneAllTargetsReachable', comparison: 'EQ', value: true },
        reason: '全対象が互いに跳躍可能で2本とも同じ対象群を通過する配置を指定してください。',
      }] satisfies GuardSkillRecipe['conditionRequirements']
    }
  }
  if (definition.operatorId === 'char_206_gnosis') {
    for (const recipe of definition.recipes) recipe.conditionRequirements = [{ condition: { input: 'gnosisTargetFrozen', comparison: 'EQ', value: true }, reason: gnosisReason }]
  }
  if (definition.operatorId === 'char_446_aroma') {
    const recipe = definition.recipes.find(recipe => recipe.skillIndex === 2)!
    recipe.conditionRequirements = [{ when: { input: 'aromaPhase', comparison: 'EQ', value: 'LANDING' },
      condition: { input: 'aromaFirstHit', comparison: 'EQ', value: false }, reason: '浮遊終了のダメージは対象への初撃でない条件を指定してください。' },
    { condition: { input: 'aromaSkillActive', comparison: 'EQ', value: true }, reason: 'ダメージ時点でもスキル発動中である条件を指定してください。' }]
  }
}
