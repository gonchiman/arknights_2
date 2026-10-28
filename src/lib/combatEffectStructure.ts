import { DAMAGE_TYPE_LABELS, type DamageType } from './damageCalculator.ts'
import type { SkillStructureComparison } from './skillStructure.ts'

export type CombatScalar = number | boolean | string
/** A linear value with optional bounds. Null means unknown; omitted bounds impose no limit. */
export type CombatNumericValue = number | null | {
  readonly type: 'AFFINE'; readonly base: number | null; readonly coefficient: number | null
  readonly metric: string; readonly min?: number | null; readonly max?: number | null
} | { readonly type: 'METRIC'; readonly metric: string }
  | { readonly type: 'CALC'; readonly operation: 'ADD' | 'MULTIPLY' | 'DIVIDE' | 'MIN' | 'MAX'; readonly values: readonly CombatNumericValue[] }
  | { readonly type: 'CONDITIONAL'; readonly condition: CombatCondition; readonly whenTrue: CombatNumericValue; readonly whenFalse: CombatNumericValue }
export type CombatCondition =
  | { readonly type: 'COMPARE'; readonly metric: string; readonly comparison: SkillStructureComparison; readonly value: CombatScalar | null; readonly sourceBinding?: string }
  | { readonly type: 'ALL'; readonly conditions: readonly CombatCondition[] }
  | { readonly type: 'ANY'; readonly conditions: readonly CombatCondition[] }
  | { readonly type: 'UNKNOWN'; readonly reason: string }
interface CombatRecipientBase {
  readonly type: 'RECIPIENTS'
  readonly side: 'SELF' | 'ALLY' | 'ENEMY'
  readonly entity: 'UNIT' | 'ATTACK'
  readonly includeSelf: boolean
  /** Any listed faction matches; all listed tags must match. Empty filters impose no restriction. */
  readonly factionIds: readonly string[]
  readonly tagIds: readonly string[]
  readonly filterLabels?: Readonly<Record<string, string>>
  readonly selection: { readonly type: 'ALL' } | { readonly type: 'COUNT' | 'RANDOM'; readonly count: number | null }
}
export type CombatRecipientSelector = CombatRecipientBase & (
  | { readonly scope: 'SELF' | 'SQUAD' | 'BATTLEFIELD' | 'ATTACK_RANGE' | 'ATTACK_TARGET' | 'DAMAGE_SOURCE' | 'ADJACENT' }
  | { readonly scope: 'CUSTOM_RANGE'; readonly rangeId: string | null }
)
/** Events refer to the effect source unless eventActor selects a different actor. */
export type CombatEvent = 'ATTACK' | 'NORMAL_ATTACK' | 'DAMAGE_DEALT' | 'DAMAGE_RECEIVED' | 'LETHAL_DAMAGE' | 'KILL' | 'DEPLOY' | 'RETREAT' | 'SKILL_START' | 'SKILL_END'
export type CombatTiming =
  | { readonly type: 'CONTINUOUS'; readonly while: 'DEPLOYED' | 'IN_SQUAD' | 'ALWAYS' | 'CONDITION' }
  | { readonly type: 'EVENT'; readonly event: CombatEvent }
  | { readonly type: 'AFTER_EVENT'; readonly event: CombatEvent; readonly delaySeconds: number | null }
  | { readonly type: 'PERIODIC'; readonly intervalSeconds: number | null; readonly firstTickSeconds: number | null }
export type CombatLifetime =
  | { readonly type: 'FIXED_SECONDS'; readonly seconds: number | null }
  | { readonly type: 'WHILE_CONDITION'; readonly condition: CombatCondition }
  | { readonly type: 'UNTIL_EVENT'; readonly event: CombatEvent }
  | { readonly type: 'CURRENT_EVENT' }
  | { readonly type: 'WHILE_SOURCE_ACTIVE' }
  | { readonly type: 'UNSPECIFIED' }
export interface CombatProbability {
  readonly chance: CombatNumericValue
  readonly rollScope: 'APPLICATION' | 'TICK'
  readonly sharedRollId?: string
}
export type CombatRestriction =
  | { readonly type: 'APPLICATION_LIMIT'; readonly count: number | null; readonly scope: 'TARGET' | 'SOURCE_LIFETIME'; readonly reset: 'REDEPLOY' | 'EFFECT_END' | 'UNSPECIFIED' }
  | { readonly type: 'EXCLUDE_MODIFIER'; readonly modifier: string }
export type CombatDamageKind =
  | { readonly type: 'ORDINARY'; readonly damageType: DamageType }
  | { readonly type: 'ELEMENTAL_DAMAGE'; readonly elementId: string }
  | { readonly type: 'ELEMENTAL_BUILDUP'; readonly elementId: string }
export type CombatDamageAmount =
  | { readonly basis: 'FIXED'; readonly value: CombatNumericValue; readonly referenceTime: 'NOT_APPLICABLE' }
  | { readonly basis: 'ATK_RATIO'; readonly ratio: CombatNumericValue; readonly reference: 'SOURCE' | 'TARGET'; readonly referenceTime: 'ON_APPLY' | 'EACH_TICK' | 'UNSPECIFIED' }
export interface CombatDamageOverTime {
  readonly kind: CombatDamageKind
  readonly amount: CombatDamageAmount
  readonly rate: 'PER_SECOND' | 'PER_TICK'
  readonly duration: CombatLifetime
  readonly cadence: { readonly intervalSeconds: number | null; readonly firstTickSeconds: number | null }
  readonly stacking: { readonly mode: 'ADD_STACKS' | 'REPLACE' | 'INDEPENDENT' | 'UNSPECIFIED'; readonly maxStacks: number | null }
  readonly refresh: 'RESET_DURATION' | 'INDEPENDENT' | 'IGNORE' | 'UNSPECIFIED'
  readonly statusId?: string
}
export interface CombatEffectContext {
  readonly id: string; readonly timing: CombatTiming; readonly condition: CombatCondition | null
  readonly target: CombatRecipientSelector; readonly probability: CombatProbability
  readonly lifetime: CombatLifetime; readonly restrictions: readonly CombatRestriction[]
  readonly sourceBinding: string; readonly parameterBindings?: Readonly<Record<string, string>>
  readonly afterEffects?: readonly string[]
  readonly eventActor?: CombatRecipientSelector
}

export function resolveCombatNumericValue(value: CombatNumericValue, metrics: Readonly<Record<string, CombatScalar | null | undefined>>): number | null {
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value.type === 'CONDITIONAL') {
    const condition = evaluateCombatCondition(value.condition, metrics)
    return condition === null ? null : resolveCombatNumericValue(condition ? value.whenTrue : value.whenFalse, metrics)
  }
  if (value.type === 'CALC') {
    const values = value.values.map(entry => resolveCombatNumericValue(entry, metrics))
    if (!values.length || values.some(entry => entry === null)) return null
    const operands = values as number[]
    if (value.operation === 'DIVIDE' && (operands.length !== 2 || operands[1] === 0)) return null
    const result = value.operation === 'ADD' ? operands.reduce((a, b) => a + b, 0)
      : value.operation === 'MULTIPLY' ? operands.reduce((a, b) => a * b, 1)
        : value.operation === 'DIVIDE' ? operands[0] / operands[1]
          : value.operation === 'MIN' ? Math.min(...operands) : Math.max(...operands)
    return Number.isFinite(result) ? result : null
  }
  const metric = metrics[value.metric]
  if (value.type === 'METRIC') return typeof metric === 'number' && Number.isFinite(metric) ? metric : null
  if (typeof metric !== 'number' || !Number.isFinite(metric)
    || ![value.base, value.coefficient].every(entry => typeof entry === 'number' && Number.isFinite(entry))
    || [value.min, value.max].some(entry => entry !== undefined && (entry === null || !Number.isFinite(entry)))
    || (value.min !== undefined && value.max !== undefined && value.min! > value.max!)) return null
  const result = value.base! + value.coefficient! * metric
  if (!Number.isFinite(result)) return null
  return Math.min(value.max ?? Infinity, Math.max(value.min ?? -Infinity, result))
}
/** Three-valued evaluation prevents missing inputs from silently selecting the opposite branch. */
export function evaluateCombatCondition(condition: CombatCondition | null, metrics: Readonly<Record<string, CombatScalar | null | undefined>>): boolean | null {
  if (condition === null) return true
  if (condition.type === 'UNKNOWN') return null
  if (condition.type === 'ALL' || condition.type === 'ANY') {
    if (condition.conditions.length === 0) return null
    const results = condition.conditions.map(entry => evaluateCombatCondition(entry, metrics))
    if (condition.type === 'ALL') return results.includes(false) ? false : results.includes(null) ? null : true
    return results.includes(true) ? true : results.includes(null) ? null : false
  }
  const actual = metrics[condition.metric], expected = condition.value
  if (actual === null || actual === undefined || expected === null || typeof actual !== typeof expected) return null
  if ((typeof actual === 'number' && !Number.isFinite(actual)) || (typeof expected === 'number' && !Number.isFinite(expected))) return null
  if (condition.comparison === 'EQ') return actual === expected
  if (condition.comparison === 'NE') return actual !== expected
  if (typeof actual !== 'number' || typeof expected !== 'number') return null
  return { GT: actual > expected, GTE: actual >= expected, LT: actual < expected, LTE: actual <= expected }[condition.comparison]
}
export function resolveCombatProbability(probability: CombatProbability, metrics: Readonly<Record<string, CombatScalar | null | undefined>> = {}): number | null {
  const chance = resolveCombatNumericValue(probability.chance, metrics)
  return chance !== null && chance >= 0 && chance <= 1 ? chance : null
}

const comparisons = { EQ: '＝', NE: '≠', GT: '＞', GTE: '≧', LT: '＜', LTE: '≦' }
const metrics: Record<string, string> = {
  'target.isAirborne': '対象の空中状態', 'battlefield.hasSeaMonster': '戦場の海の怪物', 'target.canUseRangedAttack': '敵の遠距離攻撃能力',
  'target.inAttackRange': '対象が攻撃範囲内', 'source.secondsSinceLastNormalAttack': '通常攻撃をしない時間', 'source.blockCount': '自身のブロック数',
  'source.hpRatio': '自身のHP割合', 'target.isBlocked': '対象のブロック状態', skillIndex: 'スキル番号', actionKind: '計算する攻撃',
  selfHpPercent: '自身のHP（％）', targetHpPercent: '対象のHP（％）', defenseDebuffStacks: '防御力低下の重複数', noteCount: '戦場の音符数',
  targetSlowedOrBound: '対象が足止め・バインド中', targetStunnedOrBound: '対象がスタン・バインド中', targetTrembling: '対象が戦慄中',
  talentActive: '素質の効果が適用中', selfInTalentRange: '自身が素質の効果範囲内', killStacks: '撃破による強化回数', terrainHitCount: '高台効果の命中回数',
  targetBlocked: '対象をブロック中', blockedEnemyCount: 'ブロック中の敵の数', eliteInRange: '攻撃範囲内にエリート・ボスが存在',
  nearbyAllyCount: '周囲の味方数', recentDamageTaken: '被ダメージ後の強化が有効', ammoSpent: '消費した弾薬数', dotActive: '継続ダメージを付与中', nearbyEnemyCount: '周囲の敵の数',
  'skill.talent@prob': 'スキル中の素質発動確率', 'skill.talent_scale': 'スキルの素質効果倍率', 'skill.splash_atk_scale_bonus': 'スキルの高台効果倍率', 'skill.prob': 'スキルの発動確率',
  'skill.killCount': 'スキル中の撃破数', 'skill.usesAmmo': '弾薬消費系スキル', 'source.dodgeDecayStacks': '回避の減衰回数', 'source.secondsSinceDeploy': '配置からの経過秒数',
  'source.secondsSinceDamageReceived': '被ダメージからの経過秒数', 'projectile.outsideAttackRange': '音符が攻撃範囲外', 'ally.attackRangeOverlapsSource': '味方の攻撃範囲が自身と重なる',
  'recipient.isUrsusStudent': '対象がウルサス学生自治団に所属', 'target.isEliteOrBoss': '対象がエリート・ボス', 'attack.targetCount': '攻撃対象数',
  'deployment.previousOperatorKazimierz': '直前に配置したオペレーターがカジミエーシュに所属', 'damageSource.blockedBySelf': '攻撃元を自身でブロック中',
  'battlefield.lateranoCount': '配置中のラテラーノ所属人数', 'source.emergencyHealActivated': '緊急回復を発動済み', 'damagedAlly.isKazimierz': '攻撃を受けた味方がカジミエーシュに所属',
  'source.skillActive': 'スキル発動中', 'recipient.hpRatio': '対象のHP割合', 'recipient.inSourceAttackRange': '対象が自身の攻撃範囲内',
}
const events: Record<CombatEvent, string> = { ATTACK: '攻撃', NORMAL_ATTACK: '通常攻撃', DAMAGE_DEALT: '与ダメージ', DAMAGE_RECEIVED: '被ダメージ', LETHAL_DAMAGE: '致命ダメージ', KILL: '撃破', DEPLOY: '配置', RETREAT: '退場', SKILL_START: 'スキル開始', SKILL_END: 'スキル終了' }
export function formatCombatNumericValue(value: CombatNumericValue): string {
  if (value === null) return '未確認'
  if (typeof value === 'number') return formatCombatNumber(value)
  if (value.type === 'METRIC') return metrics[value.metric] ?? value.metric
  if (value.type === 'CONDITIONAL') return `${formatCombatCondition(value.condition)}：${formatCombatNumericValue(value.whenTrue)}／それ以外：${formatCombatNumericValue(value.whenFalse)}`
  if (value.type === 'CALC') {
    const values = value.values.map(formatCombatNumericValue)
    if (value.operation === 'MIN' || value.operation === 'MAX') return `${value.operation === 'MIN' ? '最小' : '最大'}（${values.join('、')}）`
    return `（${values.join({ ADD: '＋', MULTIPLY: '×', DIVIDE: '÷' }[value.operation])}）`
  }
  const bounds = [value.min !== undefined ? `下限${formatCombatNumericValue(value.min)}` : '', value.max !== undefined ? `上限${formatCombatNumericValue(value.max)}` : ''].filter(Boolean)
  return `${formatCombatNumericValue(value.base)}＋${formatCombatNumericValue(value.coefficient)}×${metrics[value.metric] ?? value.metric}${bounds.length ? `（${bounds.join('・')}）` : ''}`
}
export function formatCombatCondition(condition: CombatCondition | null): string {
  if (!condition) return 'なし'
  if (condition.type === 'COMPARE' && condition.comparison === 'EQ' && typeof condition.value === 'boolean') {
    if (condition.metric === 'target.isAirborne') return condition.value ? '空中の敵' : '地上の敵'
    if (condition.metric === 'battlefield.hasSeaMonster') return condition.value ? '戦場に海の怪物あり' : '戦場に海の怪物なし'
    if (['targetSlowedOrBound', 'targetStunnedOrBound', 'targetTrembling', 'talentActive', 'selfInTalentRange', 'targetBlocked', 'eliteInRange', 'recentDamageTaken', 'dotActive'].includes(condition.metric)) return `${metrics[condition.metric] ?? condition.metric}：${condition.value ? 'あり' : 'なし'}`
  }
  if (condition.type === 'UNKNOWN') return `未確定：${condition.reason}`
  if (condition.type === 'ALL' || condition.type === 'ANY') return `（${condition.conditions.map(formatCombatCondition).join(condition.type === 'ALL' ? ' かつ ' : ' または ')}）`
  if (condition.metric === 'target.canUseRangedAttack' && condition.comparison === 'EQ' && typeof condition.value === 'boolean') return condition.value ? '遠距離攻撃が可能な敵' : '遠距離攻撃を行えない敵'
  if (condition.metric === 'source.secondsSinceLastNormalAttack' && condition.comparison === 'GTE') return condition.value === null ? '通常攻撃をしない待ち時間が未確認' : `通常攻撃せずに${condition.value}秒以上経過`
  const value = condition.metric === 'actionKind' && typeof condition.value === 'string'
    ? ({ NORMAL: '通常攻撃', NEXT_ATTACK: '次の通常攻撃', SKILL_ACTION: 'スキル動作' }[condition.value] ?? condition.value) : scalar(condition.value)
  return `${metrics[condition.metric] ?? condition.metric}${comparisons[condition.comparison]}${value}`
}
export function formatCombatTiming(timing: CombatTiming): string {
  if (timing.type === 'CONTINUOUS') return { DEPLOYED: '配置中', IN_SQUAD: '編成中', ALWAYS: '常時', CONDITION: '条件成立中' }[timing.while]
  if (timing.type === 'EVENT') return `${events[timing.event]}時`
  if (timing.type === 'PERIODIC') return timing.intervalSeconds === null ? '周期未確認' : `${formatCombatNumber(timing.intervalSeconds)}秒ごと`
  return timing.delaySeconds === null ? `${events[timing.event]}後（待ち時間未確認）` : `${events[timing.event]}から${formatCombatNumber(timing.delaySeconds)}秒後`
}
export function formatCombatRecipient(target: CombatRecipientSelector): string {
  const side = { SELF: target.entity === 'ATTACK' ? '自身の攻撃' : '自身', ALLY: '味方', ENEMY: '敵' }[target.side]
  const scope = { SELF: '', SQUAD: '', BATTLEFIELD: '戦場の', ATTACK_RANGE: '攻撃範囲内の', ATTACK_TARGET: '攻撃対象の', DAMAGE_SOURCE: 'ダメージ発生元の', ADJACENT: '隣接する', CUSTOM_RANGE: '指定範囲の' }[target.scope]
  const filters = [...target.factionIds, ...target.tagIds].map(id => target.filterLabels?.[id] ?? id)
  const selection = target.selection.type === 'ALL' ? (target.side === 'ALLY' && !filters.length ? '全員' : '') : `${target.selection.type === 'RANDOM' ? 'ランダム' : '最大'}${target.selection.count ?? '未確認'}体`
  return `${scope}${side}${filters.length ? `【${filters.join('・')}】` : ''}${selection}${target.side === 'ALLY' ? target.includeSelf ? '（自身を含む）' : '（自身を除く）' : ''}`
}
export function formatCombatDamageKind(kind: CombatDamageKind): string {
  return kind.type === 'ORDINARY' ? DAMAGE_TYPE_LABELS[kind.damageType] : `${kind.elementId}：${kind.type === 'ELEMENTAL_DAMAGE' ? '元素ダメージ' : '元素損傷'}`
}
export function formatCombatLifetime(lifetime: CombatLifetime): string {
  if (lifetime.type === 'FIXED_SECONDS') return lifetime.seconds === null ? '未確認' : `${formatCombatNumber(lifetime.seconds)}秒`
  if (lifetime.type === 'WHILE_CONDITION') return `条件成立中：${formatCombatCondition(lifetime.condition)}`
  if (lifetime.type === 'UNTIL_EVENT') return `${events[lifetime.event]}まで`
  if (lifetime.type === 'WHILE_SOURCE_ACTIVE') return '効果元が有効な間'
  return lifetime.type === 'CURRENT_EVENT' ? '当該イベントのみ' : '未確定'
}

export function getCombatContextDefinitionRows(effect: CombatEffectContext, lifetimeLabel = '効果の有効期間'): [string, string | number][] {
  const rows: [string, string | number][] = [['タイミング', formatCombatTiming(effect.timing)], ['発生方式', effect.timing.type]]
  if (effect.eventActor) rows.push(['イベント発生者', formatCombatRecipient(effect.eventActor)])
  if (effect.timing.type === 'CONTINUOUS') rows.push(['効果元の有効状態', effect.timing.while])
  if (effect.timing.type === 'EVENT' || effect.timing.type === 'AFTER_EVENT') rows.push(['発生イベント', events[effect.timing.event]])
  if (effect.timing.type === 'AFTER_EVENT') rows.push(['待ち時間（秒）', effect.timing.delaySeconds ?? '未確認'])
  if (effect.timing.type === 'PERIODIC') rows.push(['周期（秒）', effect.timing.intervalSeconds ?? '未確認'], ['初回時刻（秒）', effect.timing.firstTickSeconds ?? '未確定'])
  appendCondition(rows, effect.condition, '条件')
  rows.push(['対象', formatCombatRecipient(effect.target)], ['対象の側', effect.target.side], ['対象の単位', effect.target.entity], ['対象の母集団', effect.target.scope], ['自身を含む', effect.target.includeSelf ? 'はい' : 'いいえ'],
    ['陣営ID（いずれか）', effect.target.factionIds.join('、') || '制限なし'], ['タグID（すべて）', effect.target.tagIds.join('、') || '制限なし'], ['対象の選び方', effect.target.selection.type])
  if (effect.target.selection.type !== 'ALL') rows.push(['選択数', effect.target.selection.count ?? '未確認'])
  if (effect.target.scope === 'CUSTOM_RANGE') rows.push(['範囲ID', effect.target.rangeId ?? '未確認'])
  rows.push(['発動確率', typeof effect.probability.chance === 'object' && effect.probability.chance !== null
    ? `${formatCombatNumericValue({ type: 'CALC', operation: 'MULTIPLY', values: [effect.probability.chance, 100] })}％`
    : resolveCombatProbability(effect.probability) === null ? '未確認' : `${formatCombatNumber((effect.probability.chance as number) * 100)}％`], ['抽選単位', effect.probability.rollScope])
  if (typeof effect.probability.chance === 'object' && effect.probability.chance !== null) rows.push(...getCombatNumericDefinitionRows(effect.probability.chance, '確率'))
  if (effect.probability.sharedRollId) rows.push(['共有する抽選', effect.probability.sharedRollId])
  rows.push([lifetimeLabel, formatCombatLifetime(effect.lifetime)])
  if (effect.lifetime.type === 'FIXED_SECONDS') rows.push(['有効期間（秒）', effect.lifetime.seconds ?? '未確認'])
  if (effect.lifetime.type === 'WHILE_CONDITION') appendCondition(rows, effect.lifetime.condition, '有効期間の条件')
  if (!effect.restrictions.length) rows.push(['追加制約', '定義なし'])
  for (const [index, restriction] of effect.restrictions.entries()) {
    const label = `制約${index + 1}`
    rows.push([label, restriction.type])
    if (restriction.type === 'APPLICATION_LIMIT') rows.push([`${label}の上限回数`, restriction.count ?? '未確定'], [`${label}の単位`, restriction.scope], [`${label}のリセット`, restriction.reset])
    else rows.push([`${label}で除外する補正`, restriction.modifier])
  }
  rows.push(['参照キー', effect.sourceBinding])
  for (const [key, binding] of Object.entries(effect.parameterBindings ?? {})) rows.push([`参照キー：${key}`, binding])
  for (const [index, dependency] of (effect.afterEffects ?? []).entries()) rows.push([`先に処理する効果${index + 1}`, dependency])
  return rows
}
export function getCombatNumericDefinitionRows(value: CombatNumericValue, prefix = '値'): [string, string | number][] {
  if (value === null || typeof value === 'number') return [[prefix, value ?? '未確認']]
  if (value.type === 'METRIC') return [[`${prefix}の形式`, '指標'], [`${prefix}の指標`, value.metric]]
  if (value.type === 'CALC') return [[`${prefix}の演算`, value.operation], ...value.values.flatMap((entry, index) => getCombatNumericDefinitionRows(entry, `${prefix}${index + 1}`))]
  if (value.type === 'CONDITIONAL') return [[`${prefix}の条件`, formatCombatCondition(value.condition)], ...getCombatNumericDefinitionRows(value.whenTrue, `${prefix}・成立時`), ...getCombatNumericDefinitionRows(value.whenFalse, `${prefix}・不成立時`)]
  return [[`${prefix}の形式`, '定数＋係数×指標'], [`${prefix}の定数`, value.base ?? '未確認'], [`${prefix}の係数`, value.coefficient ?? '未確認'], [`${prefix}の指標`, value.metric], [`${prefix}の下限`, value.min === undefined ? '下限なし' : value.min ?? '未確認'], [`${prefix}の上限`, value.max === undefined ? '上限なし' : value.max ?? '未確認']]
}
export function getCombatDotDefinitionRows(damage: CombatDamageOverTime): [string, string | number][] {
  const rows: [string, string | number][] = [['出力種別', damage.kind.type], ['ダメージ種別', formatCombatDamageKind(damage.kind)], ['量の基準', damage.amount.basis], ['参照時点', damage.amount.referenceTime]]
  if (damage.amount.basis === 'FIXED') rows.push(...getCombatNumericDefinitionRows(damage.amount.value, '固定値'))
  else rows.push(['攻撃力の参照元', damage.amount.reference], ...getCombatNumericDefinitionRows(damage.amount.ratio, '攻撃力倍率'))
  rows.push(['量の時間単位', damage.rate], ['持続時間', formatCombatLifetime(damage.duration)])
  if (damage.duration.type === 'FIXED_SECONDS') rows.push(['持続時間（秒）', damage.duration.seconds ?? '未確認'])
  if (damage.duration.type === 'WHILE_CONDITION') appendCondition(rows, damage.duration.condition, '持続条件')
  rows.push(['処理間隔（秒）', damage.cadence.intervalSeconds ?? '未確定'], ['初回ダメージの時刻（秒）', damage.cadence.firstTickSeconds ?? '未確定'], ['重複方式', damage.stacking.mode], ['最大重複数', damage.stacking.maxStacks ?? '未確定'], ['再付与時の更新', damage.refresh])
  if (damage.statusId) rows.push(['状態名ID', damage.statusId])
  return rows
}
function appendCondition(rows: [string, string | number][], condition: CombatCondition | null, prefix: string) {
  if (!condition) { rows.push([prefix, 'なし']); return }
  rows.push([`${prefix}の形式`, condition.type])
  if (condition.type === 'UNKNOWN') { rows.push([`${prefix}の保留理由`, condition.reason]); return }
  if (condition.type === 'ALL' || condition.type === 'ANY') {
    rows.push([`${prefix}の結合`, condition.type === 'ALL' ? 'すべて成立' : 'いずれか成立'])
    for (const [index, child] of condition.conditions.entries()) appendCondition(rows, child, `${prefix}${/\d$/.test(prefix) ? '.' : ''}${index + 1}`)
  } else {
    rows.push([`${prefix}の指標`, condition.metric], [`${prefix}の比較`, comparisons[condition.comparison]], [`${prefix}の値`, scalar(condition.value)])
    if (condition.sourceBinding) rows.push([`${prefix}の参照キー`, condition.sourceBinding])
  }
}
export function formatCombatNumber(value: number): string { return String(Math.round(value * 1_000_000) / 1_000_000) }
function scalar(value: CombatScalar | null): string { return value === null ? '未確認' : value === true ? 'はい' : value === false ? 'いいえ' : String(value) }
