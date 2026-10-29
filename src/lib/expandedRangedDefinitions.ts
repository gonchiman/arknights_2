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
  ({ label: '攻撃', damageType: 'PHYSICAL', scale, hits, ...extra })
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

export const EXPANDED_RANGED_DEFINITIONS: readonly ExpandedOperatorDefinition[] = [
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
  operator('char_302_glaze', [recipe('char_302_glaze', 1, normal())], [
    talent(0, '超長距離狙撃', ['STATUS'], b => [status('distant-stun', '通常射程外の対象をスタン', {
      target: enemy, condition: eq('targetOutsideBaseRange', true), timing: { type: 'EVENT', event: 'ATTACK' },
      probability: { chance: b.read('buff_prob'), rollScope: 'APPLICATION' }, lifetime: { type: 'FIXED_SECONDS', seconds: b.read('stun') },
    })]),
  ], [bool('targetOutsideBaseRange', '対象が通常の攻撃範囲外')], [
    { skillIndex: 2, reason: '射程外への攻撃予備動作と距離による実際の攻撃周期を確認する必要がある。' },
  ]),
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
    talent(0, '弱点分析', ['DAMAGE'], b => [{ ...ctx('physical-vulnerability', 'damage_scale', { target: enemy, condition: eq('targetBlocked', true) }),
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('damage_scale') }]),
  ], [bool('targetBlocked', '対象がブロックされている')]),
  operator('char_4078_bdhkgt', [recipe('char_4078_bdhkgt', 1, normal({ atk: key('atk'), aspd: key('attack_speed') }))], [
    talent(0, '荒野を背に', ['ABILITY', 'DEPLOYMENT'], b => [atk(b.read('atk'), 'atk', { condition: eq('firstDeployment', true) }),
      status('deployment-cost', '初回配置コスト-3', { condition: eq('firstDeployment', true) })]),
  ], [bool('firstDeployment', '初回配置', true)], [
    { skillIndex: 2, reason: '飛輪の移動・停止位置と接触する敵ごとの周期命中数を確認する必要がある。' },
  ]),
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
  operator('char_4043_erato', [recipe('char_4043_erato', 2, normal({ atk: key('atk'), aspd: key('attack_speed') }))], [
    talent(0, '微睡へ捧ぐリラ', ['DAMAGE', 'ATTACK_BEHAVIOR'], b => [{ ...ctx('sleep-defense-ignore', 'def_penetrate', { condition: eq('targetSleeping', true), target: attack }),
      item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: b.read('def_penetrate') }, behavior('sleep-target', '睡眠状態の敵を攻撃可能')]),
  ], [bool('targetSleeping', '対象が睡眠中')], [
    { skillIndex: 1, reason: '睡眠付与・ダメージ・素質の防御無視の適用順序を確認する必要がある。' },
  ]),
  operator('char_145_prove', [recipe('char_145_prove', 2, [normal({ atk: key('atk'), when: { input: 'targetHpPercent', comparison: 'LT', value: 80 } }),
    normal({ id: 'invalid-target', label: '攻撃対象外', when: { input: 'targetHpPercent', comparison: 'GTE', value: 80 },
      actions: [], unresolved: ['S2はHP80%以上の敵を攻撃しません。対象のHP条件を変更してください。'] })],
    [number('targetHpPercent', '対象のHP（%）', 79, 0, 100, 0.1)], ['HP80%未満の対象を攻撃中の値。'])], [
    talent(0, 'ハンターアロー', ['DAMAGE'], b => [critical(b, conditional(eq('targetImmediatelyAhead', true), b.read('prob2'), b.read('prob')))]),
  ], [bool('targetImmediatelyAhead', '対象が正面1マスにいる')], [
    { skillIndex: 1, reason: '対象HPと攻撃倍率の段階境界および連続補間の扱いを確認する必要がある。' },
  ]),
  operator('char_4006_melnte', [recipe('char_4006_melnte', 1, normal({ atk: key('atk'), intervalAdd: key('base_attack_time') }))], [
    talent(0, 'パラメーター調整', ['DAMAGE'], b => [{ ...ctx('skill-damage', 'damage_scale', { condition: eq('skillActivationCount', 2, 'GTE') }),
      item: 'DAMAGE_SCALE', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: b.read('damage_scale') }]),
  ], [number('skillActivationCount', 'スキル発動回数', 1, 1, 100)], [
    { skillIndex: 2, reason: '飛距離によるダメージ減衰曲線を確認する必要がある。' },
  ]),
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
  ] })), recipe('char_332_archet', 3, normal({ atk: key('atk'), maxTargets: key('attack@max_target'), actions: [damage(1, key('attack@times'))] }))], [
    talent(0, 'ランデン戦術', ['RESOURCE'], b => [{ ...ctx('sniper-sp', 'sp', { timing: { type: 'PERIODIC', intervalSeconds: b.read('interval'), firstTickSeconds: null },
      condition: eq('recipientSpRecovery', 'ATTACK'), target: { ...self, side: 'ALLY', scope: 'BATTLEFIELD', tagIds: ['profession:SNIPER'], filterLabels: { 'profession:SNIPER': '狙撃' } } }),
      item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('sp') }]),
    talent(1, '鉄弦', ['SURVIVAL', 'RESOURCE'], b => [status('shield', '配置後シールドを1枚形成'),
      { ...ctx('shield-sp', 'sp'), item: 'SP_RESTORE', operation: 'ADD_VALUE', unit: 'POINT', value: b.read('sp'), condition: eq('shieldConsumed', true) }]),
  ], [], [{ skillIndex: 2, reason: '敵間の連鎖と連鎖順による攻撃回数の配分を確認する必要がある。' }]),
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
    recipe('char_430_fartth', 2, normal({ aspd: key('attack_speed') }))], [
    talent(0, '一心不乱', ['ABILITY'], b => [atk(b.read('atk'), 'atk', { condition: eq('noDamageForTenSeconds', true) })]),
    talent(1, '颯射ち', ['ABILITY', 'ATTACK_BEHAVIOR'], () => [status('reduced-target-priority', 'スキル中に狙われにくくなる'),
      behavior('ignore-physical-dodge', 'スキル中の攻撃は物理回避を無視')]),
  ], [bool('noDamageForTenSeconds', '直前10秒間被ダメージなし', true)], [
    { skillIndex: 3, reason: '射程外のスキル与ダメージ倍率を防御減算後に適用する共通操作への対応が必要。' },
  ]),
  operator('char_300_phenxi', [recipe('char_300_phenxi', 1, normal({ atk: key('atk') })),
    recipe('char_300_phenxi', 3, normal({ intervalAdd: key('base_attack_time'), actions: [damage(
      choose('targetInBlastCenter', true, key('attack@atk_scale'), key('attack@atk_scale_2')))] }),
      [bool('targetInBlastCenter', '対象が爆心地の強化範囲内', true)], [sameTargets])], [
    talent(0, '苦難陳述', ['ABILITY', 'SURVIVAL'], b => [atk(conditional(eq('selfHpPercent', 80, 'GTE'), b.read('phenxi_t_1[peak_2].peak_performance.atk'),
      conditional(eq('selfHpPercent', 50, 'GTE'), b.read('phenxi_t_1[peak_1].peak_performance.atk'), 0)), 'peak_performance.atk'),
      status('hp-loss', 'HPが徐々に減少し、この効果ではHPが0にならない')]),
    talent(1, '終焉宣告', ['ABILITY'], b => [speed(b.read('attack_speed'), { condition: eq('source.skillActive', false) })]),
  ], [number('selfHpPercent', '自身のHP（%）', 100, 0, 100, 0.1)], [
    { skillIndex: 2, reason: '灼痕弾と各灼熱の跡の位置・爆発命中数を確認する必要がある。' },
  ]),
  operator('char_197_poca', [recipe('char_197_poca', 1, normal({ atk: key('atk') })),
    recipe('char_197_poca', 2, normal({ atk: key('atk'), maxTargets: key('attack@max_target') }))], [
    talent(0, '大物猟', ['DAMAGE'], b => [{ ...ctx('weight-defense-ignore', 'def_penetrate', { target: attack, condition: eq('targetWeight', b.read('value'), 'GTE') }),
      item: 'DEFENSE_IGNORE_RATIO', operation: 'IGNORE_RATIO', unit: 'RATIO', value: b.read('def_penetrate') }]),
    talent(1, '学生の鑑', ['ABILITY'], b => [atk(b.read('atk'), 'atk', { timing: { type: 'CONTINUOUS', while: 'IN_SQUAD' },
      target: { ...self, side: 'ALLY', scope: 'SQUAD', factionIds: ['student'], filterLabels: { student: 'ウルサス学生自治団' } } })]),
  ], [number('targetWeight', '対象の重量ランク', 3, 0, 10)], [
    { skillIndex: 3, reason: '通常攻撃を停止する周期攻撃の初回命中時刻・終了境界を確認する必要がある。' },
  ]),
  operator('char_129_bluep', [recipe('char_129_bluep', 1, next(key('atk_scale'), 1, { maxTargets: 2 }))], [
    talent(0, '神経毒', ['ADDITIONAL_DAMAGE'], b => [{ ...ctx('poison', 'poison_damage', { target: enemy,
      timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' }, condition: eq('poisonActive', true) }),
      item: 'DAMAGE_OVER_TIME', operation: 'DEAL_DAMAGE', lifetime: { type: 'CURRENT_EVENT' }, damage: {
        kind: { type: 'ORDINARY', damageType: 'ARTS' }, amount: { basis: 'FIXED', value: b.read('poison_damage'), referenceTime: 'NOT_APPLICABLE' },
        rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: b.read('duration') }, cadence: { intervalSeconds: 1, firstTickSeconds: null },
        stacking: { mode: 'REPLACE', maxStacks: 1 }, refresh: 'RESET_DURATION', statusId: 'poison',
      } }], ['付与中の毎秒ダメージを評価する。付与終了時刻・更新・有限時間の毒総量は含めない。']),
  ], [bool('poisonActive', '対象に神経毒が付与中', true)], [
    { skillIndex: 2, reason: '主対象2連撃と追加対象の攻撃・毒の個別配分を確認する必要がある。' },
  ]),
]
