import type { SkillRecord } from '../types/skill.ts'
import {
  calculateAttackPipeline,
  calculateDamageBreakdown,
  getOperatorStats,
  type DamageType,
  type OperatorStats,
  type SkillDamageBreakdown,
  type SkillModelDefaults,
} from './damageCalculator.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'
import { getComparisonMaximumSkillLevelIndex, getComparisonMinimumPhaseIndex } from './operatorBuildComparison.ts'
import {
  findSkillStructure,
  formatSkillStructureEffectItem,
  formatSkillStructurePredicate,
  SKILL_STRUCTURES,
  type SkillStructure,
  type SkillStructureEffect,
  type SkillStructurePredicate,
  type SkillStructureSelection,
  type SkillStructureStage,
  type SkillStructureAttackAction,
} from './skillStructure.ts'

/** Selection coverage is independent of the common calculation rules below. */
export const DAMAGE_CALCULATOR_THREE_SELECTIONS: readonly SkillStructureSelection[] = [
  { operatorId: 'char_350_surtr', skillId: 'skchr_surtr_2', skillIndex: 2, levelIndex: 9 },
  { operatorId: 'char_263_skadi', skillId: 'skcom_quickattack[3]', skillIndex: 1, levelIndex: 9 },
  ...SKILL_STRUCTURES.filter(structure => !(
    (structure.basicInfo.operatorId === 'char_350_surtr' && structure.basicInfo.skillIndex === 2)
    || (structure.basicInfo.operatorId === 'char_263_skadi' && structure.basicInfo.skillIndex === 1)
  )).map(structure => ({
    operatorId: structure.basicInfo.operatorId, skillId: structure.basicInfo.skillId,
    skillIndex: structure.basicInfo.skillIndex, levelIndex: structure.basicInfo.levelIndex,
  })),
]

/** Reviewed normal attacks. These describe the base attack, not skill formulas. */
export const DAMAGE_CALCULATOR_THREE_BASE_ATTACKS: Readonly<Record<string, {
  readonly damageType: DamageType
  readonly hitCount: number
  readonly maxTargets: number
  readonly rangedAttackScale?: number
  readonly counterRangedAttackScale?: number
}>> = {
  char_350_surtr: { damageType: 'ARTS', hitCount: 1, maxTargets: 1 },
  char_263_skadi: { damageType: 'PHYSICAL', hitCount: 1, maxTargets: 1 },
  char_172_svrash: { damageType: 'PHYSICAL', hitCount: 1, maxTargets: 1, rangedAttackScale: 0.8 },
  // PRTS, Thorns / skill 2 notes: counter damage always receives the trait's
  // reduced attack scale. Local JP character data supplies the 0.8 value.
  // https://prts.wiki/w/%E8%8D%86%E6%A3%98
  char_293_thorns: { damageType: 'PHYSICAL', hitCount: 1, maxTargets: 1,
    rangedAttackScale: 0.8, counterRangedAttackScale: 0.8 },
}

export interface DamageCalculatorThreeConditions {
  actualAttackTargetCount?: number
  skillActivationCount?: number
  skillMode?: 'INITIAL' | 'ALTERNATE'
  attackDistanceType?: 'MELEE' | 'RANGED'
}

export type DamageCalculatorThreeConditionInput = {
  kind: 'number'
  metric: 'actualAttackTargetCount' | 'skillActivationCount'
  label: string
  min: number
  max: number
  defaultValue: number
  options?: readonly { value: number; label: string }[]
} | {
  kind: 'select'
  metric: 'skillMode' | 'attackDistanceType'
  label: string
  options: readonly { value: string; label: string }[]
  defaultValue: string
}

export interface DamageCalculatorThreeInput {
  operator: SkillRecord
  skill: SkillRecord
  phaseIndex: number
  operatorLevel: number
  trust: number
  skillLevelIndex: number
  conditions?: DamageCalculatorThreeConditions
}

export interface DamageCalculatorThreeEffectEvaluation {
  effect: SkillStructureEffect
  stageId: string
  stageLabel: string
  applied: boolean
  status: 'APPLIED' | 'CONDITION_FALSE' | 'NOT_RELEVANT' | 'UNSUPPORTED' | 'INACTIVE_STAGE'
  reason: string
}

export interface DamageCalculatorThreeRow {
  axisValue: number
  perHit: number
  perAttack: number
  dps: number | null
  allTargetsPerAttack: number
  allTargetsDps: number | null
  breakdown: SkillDamageBreakdown
}

export interface DamageCalculatorThreeOutput {
  structure: SkillStructure | null
  stats: OperatorStats
  model: SkillModelDefaults | null
  damageType: DamageType | null
  axisLabel: '敵の防御力' | '敵の術耐性' | '防御力・術耐性'
  rows: DamageCalculatorThreeRow[]
  unsupportedReasons: string[]
  conditionInputs: DamageCalculatorThreeConditionInput[]
  actualTargetCount: number
  maxTargetCount: number
  effects: DamageCalculatorThreeEffectEvaluation[]
  canShowDps: boolean
  dpsReason: string | null
  effectiveAttack: number | null
  attackSpeed: number | null
  attackInterval: number | null
  activeStageLabel: string | null
  attackKind: 'NORMAL' | 'NEXT_ATTACK' | 'COUNTER'
  attackLabel: '1攻撃' | '強化攻撃' | '反撃'
  attackDistanceType: 'MELEE' | 'RANGED'
  rangePenaltyMultiplier: number
  scopeNotes: string[]
  counterCooldownSeconds: number | null
}

export function getDamageCalculatorThreeStructures(): SkillStructure[] {
  return DAMAGE_CALCULATOR_THREE_SELECTIONS.flatMap(selection => {
    const structure = findSkillStructure(selection)
    return structure ? [structure] : []
  })
}

/** Missing or unsupported input semantics must never silently become false. */
export function getDamageCalculatorThreeInputs(
  structure: SkillStructure,
  conditions: DamageCalculatorThreeConditions = {},
): DamageCalculatorThreeConditionInput[] {
  const context = resolveConditions(conditions)
  const metrics = new Set<string>(structure.effectStructure.inputRequirements ?? [])
  for (const stage of structure.effectStructure.stages) {
    if (stage.applicability) metrics.add(stage.applicability.metric)
    for (const effect of stage.effects) if (effect.condition) metrics.add(effect.condition.metric)
  }
  for (const metric of metrics) if (!['actualAttackTargetCount', 'skillActivationCount', 'skillMode', 'attackDistanceType'].includes(metric)) {
    throw new RangeError(`条件「${metric}」の入力にはまだ対応していません。`)
  }
  const base = DAMAGE_CALCULATOR_THREE_BASE_ATTACKS[structure.basicInfo.operatorId]
  if (!base) throw new RangeError('通常攻撃の基礎定義が未対応です。')
  const stage = selectStage(structure, context)
  const attack = resolveAttack(stage, context, base)
  if (attack.maxTargets > 1) metrics.add('actualAttackTargetCount')
  if (base.rangedAttackScale !== undefined && !attack.fixedTreatment) metrics.add('attackDistanceType')
  const inputs: DamageCalculatorThreeConditionInput[] = []
  if (metrics.has('skillActivationCount')) inputs.push({ kind: 'number', metric: 'skillActivationCount',
    label: 'スキル発動回数', min: 1, max: Number.MAX_SAFE_INTEGER, defaultValue: 1,
    options: structure.effectStructure.stages.flatMap(value => value.applicability?.metric === 'skillActivationCount'
      && ['EQ', 'GTE'].includes(value.applicability.comparison)
      ? [{ value: value.applicability.value, label: value.label }] : []) })
  if (metrics.has('skillMode')) inputs.push({ kind: 'select', metric: 'skillMode', label: 'スキルの状態',
    options: [{ value: 'INITIAL', label: '初期状態' }, { value: 'ALTERNATE', label: '切替後' }], defaultValue: 'INITIAL' })
  if (metrics.has('attackDistanceType') && attack.kind !== 'COUNTER') inputs.push({ kind: 'select', metric: 'attackDistanceType',
    label: '攻撃距離', options: [{ value: 'MELEE', label: '近接' }, { value: 'RANGED', label: '遠距離' }], defaultValue: 'MELEE' })
  if (metrics.has('actualAttackTargetCount')) inputs.push({ kind: 'number', metric: 'actualAttackTargetCount',
    label: '実際の攻撃対象数', min: 1, max: attack.maxTargets, defaultValue: 1 })
  return inputs
}

/**
 * Only reviewed structures are executable. No description or blackboard
 * heuristics are used to select skill values. Talents, potential, modules and
 * external modifiers are outside this scope; reviewed normal-attack traits
 * supply damage type and the Lord's conditional ranged attack scale.
 */
export function buildDamageCalculatorThreeOutput(input: DamageCalculatorThreeInput): DamageCalculatorThreeOutput {
  const reasons = [...validateOperator(input)]
  const context = resolveConditions(input.conditions)
  const conditionErrors = validateConditions(context)
  reasons.push(...conditionErrors)
  const safeContext = conditionErrors.length ? resolveConditions() : context
  // Invalid numbers are rejected; defaults only let us prepare an error output.
  const stats = getOperatorStats(input.operator.operatorProfile,
    Number.isFinite(input.phaseIndex) ? input.phaseIndex : 0,
    Number.isFinite(input.operatorLevel) ? input.operatorLevel : 1,
    Number.isFinite(input.trust) ? input.trust : 0)
  const selection: SkillStructureSelection = {
    operatorId: input.skill.operatorId, skillId: input.skill.skillId,
    skillIndex: input.skill.skillIndex, levelIndex: input.skillLevelIndex,
  }
  const allowed = DAMAGE_CALCULATOR_THREE_SELECTIONS.some(value => sameSelection(value, selection))
  const structure = allowed ? findSkillStructure(selection) : null
  const base = DAMAGE_CALCULATOR_THREE_BASE_ATTACKS[input.operator.operatorId]
  const damageType = base?.damageType ?? null
  const axisLabel = damageType === 'PHYSICAL' ? '敵の防御力' : damageType === 'ARTS' ? '敵の術耐性' : '防御力・術耐性'
  if (input.skill.operatorId !== input.operator.operatorId) reasons.push('選択したオペレーターとスキルが一致していません。')
  if (!structure) reasons.push('選択したスキル・スキルレベルの構造化データは、計算機３では未対応です。')
  if (!base) reasons.push('通常攻撃の基礎定義が未対応です。')
  if (!Number.isInteger(input.skillLevelIndex) || !input.skill.skillLevels[input.skillLevelIndex]) {
    reasons.push('選択したスキルレベルのデータを取得できません。')
  }

  let conditionInputs: DamageCalculatorThreeConditionInput[] = []
  let stage: SkillStructureStage | null = null
  let attack: ResolvedAttack | null = null
  if (structure && base) {
    try {
      conditionInputs = getDamageCalculatorThreeInputs(structure, safeContext)
      stage = selectStage(structure, safeContext)
      attack = resolveAttack(stage, safeContext, base)
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : '条件の入力を解決できません。')
    }
  }
  const maxTargetCount = attack?.maxTargets ?? base?.maxTargets ?? 1
  const actualTargetCount = context.actualAttackTargetCount
  if (Number.isSafeInteger(actualTargetCount) && actualTargetCount > maxTargetCount) {
    reasons.push('実際の攻撃対象数は1〜' + maxTargetCount + '体の整数で指定してください。')
  }
  const attackKind = attack?.kind ?? 'NORMAL'
  const attackLabel = attackKind === 'NEXT_ATTACK' ? '強化攻撃' : attackKind === 'COUNTER' ? '反撃' : '1攻撃'
  const attackDistanceType = attack?.treatment ?? 'MELEE'
  const rangePenaltyMultiplier = attack?.rangePenaltyMultiplier ?? 1
  const counterCooldownSeconds = attackKind === 'COUNTER' ? attack?.action?.cooldownSeconds ?? null : null
  const effectiveContext = { ...safeContext, attackDistanceType }
  const effects: DamageCalculatorThreeEffectEvaluation[] = []
  const scopeNotes: string[] = []
  let atkRatio = 0, attackSpeedBonus = 0, attackScale = 1
  if (structure && stage && attack && reasons.length === 0) {
    for (const candidate of structure.effectStructure.stages) for (const effect of candidate.effects) {
      const active = candidate.id === stage.id
      const evaluation: DamageCalculatorThreeEffectEvaluation = {
        effect, stageId: candidate.id, stageLabel: candidate.label, applied: false,
        status: active ? 'APPLIED' : 'INACTIVE_STAGE',
        reason: active ? '条件なし' : '選択中の段階ではありません。',
      }
      effects.push(evaluation)
      if (!active) continue
      if (!evaluatePredicate(effect.condition, effectiveContext)) {
        evaluation.status = 'CONDITION_FALSE'
        evaluation.reason = '条件不成立：' + formatSkillStructurePredicate(effect.condition)
        continue
      }
      if (isOutsideDamageScope(effect)) {
        evaluation.status = 'NOT_RELEVANT'
        evaluation.reason = '1回のダメージ・DPSの計算には使用しません。'
        continue
      }
      const sustained = effect.timing === 'WHILE_STAGE_ACTIVE'
      const onAttack = effect.timing === 'ON_ATTACK' || effect.timing === 'ON_NEXT_NORMAL_ATTACK'
      if (effect.item === 'ATK_BUFF_RATIO' && sustained && effect.target === 'SELF'
        && Number.isFinite(effect.value) && effect.value >= -1) {
        atkRatio += effect.value
      } else if (effect.item === 'ATTACK_SPEED' && sustained && effect.target === 'SELF' && Number.isFinite(effect.value)) {
        attackSpeedBonus += effect.value
      } else if (effect.item === 'ATTACK_SCALE' && (sustained || onAttack) && effect.target === 'SELF_ATTACK'
        && Number.isFinite(effect.value) && effect.value >= 0) {
        attackScale *= effect.value
      } else if (effect.item === 'MAX_TARGETS' && sustained && effect.target === 'SELF_ATTACK'
        && Number.isSafeInteger(effect.value) && effect.value > 0) {
        // resolveAttack already uses this limit for the actual-target input.
      } else if (effect.item === 'ATTACK_TREATMENT' && (sustained || onAttack) && effect.target === 'SELF_ATTACK') {
        // Attack treatment and damage type are separate; only treatment changes.
      } else if (effect.item === 'TRAIT_RANGED_ATK_PENALTY' && (sustained || onAttack) && effect.target === 'SELF_ATTACK') {
        // resolveAttack combines the enabled flag with the reviewed base trait.
      } else if (effect.item === 'NORMAL_ATTACK_ENABLED' && sustained && effect.target === 'SELF') {
        // The trigger model replaces normal attacks when they are disabled.
      } else if (effect.item === 'TRIGGERED_ATTACK' && effect.timing === 'ON_INCOMING_NORMAL_ATTACK'
        && effect.target === 'ENEMIES_IN_ACTION_RANGE' && attackKind === 'COUNTER') {
        // The action's count, target limit, treatment and cooldown stay together.
      } else {
        evaluation.status = 'UNSUPPORTED'
        evaluation.reason = '「' + formatSkillStructureEffectItem(effect.item) + '」の適用方法にはまだ対応していません。'
        reasons.push(evaluation.reason)
        continue
      }
      evaluation.applied = true
      evaluation.reason = effect.condition ? '条件成立：' + formatSkillStructurePredicate(effect.condition) : '条件なし'
    }
  }

  let dpsReason: string | null = null
  if (attackKind === 'NEXT_ATTACK') {
    dpsReason = '次の通常攻撃1回のため、連続攻撃のDPSは表示しません。'
    scopeNotes.push('強化攻撃1回の値です。SP回復や発動間隔を含む周期DPSは計算しません。')
  } else if (attackKind === 'COUNTER') {
    dpsReason = '敵の通常攻撃を受ける頻度が未指定のため、反撃DPSは表示しません。'
    scopeNotes.push('敵の通常攻撃を受けた時の反撃1回分です。最短再発動間隔を通常攻撃の間隔としては使用しません。')
  }
  if (stage?.effects.some(effect => effect.item === 'HP_LOSS_RATE')) {
    scopeNotes.push('HP減少の詳細、継続時間、退場までの総ダメージは計算対象外です。')
  }
  const attackSpeedValue = stats.attackSpeed + attackSpeedBonus
  const normalInterval = stats.baseAttackTime * 100 / Math.max(20, attackSpeedValue)
  if (!Number.isFinite(normalInterval) || normalInterval <= 0) reasons.push('攻撃間隔を計算できません。')
  const unsupportedReasons = [...new Set(reasons)]
  const canShowDps = unsupportedReasons.length === 0 && dpsReason === null
  const duration = stage?.duration.type === 'FIXED_SECONDS' ? stage.duration.seconds : 0
  // Counter frequency cannot be derived from the operator's normal interval.
  const attackInterval = attackKind === 'COUNTER' ? null : normalInterval
  const model: SkillModelDefaults | null = unsupportedReasons.length === 0 && base ? {
    directMultiplierPercent: atkRatio * 100, attackScalePercent: attackScale * 100,
    hitCount: base.hitCount * (attackKind === 'COUNTER' ? attack?.action?.count ?? 1 : 1),
    attackInterval: attackInterval ?? 0, duration, ammoCount: 0, notes: [],
  } : null
  const attackPipeline = model ? calculateAttackPipeline(stats.attack, {
    directMultiplierPercent: model.directMultiplierPercent,
    attackScale: attackScale * rangePenaltyMultiplier,
  }) : null
  const effectiveAttack = attackPipeline?.finalAttack ?? null
  const rows: DamageCalculatorThreeRow[] = model && attackPipeline && damageType
    ? getDamageSensitivityTablePoints(damageType, [attackPipeline.finalAttack * 0.95]).map(axisValue => {
      const mitigation = calculateDamageBreakdown(attackPipeline.finalAttack, damageType,
        damageType === 'PHYSICAL' ? axisValue : 0, damageType === 'ARTS' ? axisValue : 0)
      const perHit = mitigation.result
      const perAttack = perHit * model.hitCount
      const dps = canShowDps && attackInterval ? perAttack / attackInterval : null
      const breakdown: SkillDamageBreakdown = {
        attackPipeline, mitigation, perHit, perAttack, dps, total: null,
        hitCount: model.hitCount, attackInterval: model.attackInterval, duration, ammoCount: 0,
        canShowDps, totalMode: 'NONE',
      }
      return { axisValue, perHit, perAttack, dps, allTargetsPerAttack: perAttack * actualTargetCount,
        allTargetsDps: dps === null ? null : dps * actualTargetCount, breakdown }
    }) : []
  return { structure, stats, model, damageType, axisLabel, rows, unsupportedReasons, conditionInputs,
    actualTargetCount, maxTargetCount, effects, canShowDps, dpsReason, effectiveAttack,
    attackSpeed: model ? attackSpeedValue : null,
    attackInterval: model ? attackInterval : null, activeStageLabel: stage?.label ?? null,
    attackKind, attackLabel, attackDistanceType, rangePenaltyMultiplier, scopeNotes, counterCooldownSeconds }
}

type ConditionContext = Required<DamageCalculatorThreeConditions>
type BaseAttack = (typeof DAMAGE_CALCULATOR_THREE_BASE_ATTACKS)[string]
interface ResolvedAttack {
  kind: DamageCalculatorThreeOutput['attackKind']
  treatment: 'MELEE' | 'RANGED'
  fixedTreatment: boolean
  maxTargets: number
  rangePenaltyMultiplier: number
  action: SkillStructureAttackAction | null
}

function resolveConditions(conditions: DamageCalculatorThreeConditions = {}): ConditionContext {
  return {
    actualAttackTargetCount: conditions.actualAttackTargetCount ?? 1,
    skillActivationCount: conditions.skillActivationCount ?? 1,
    skillMode: conditions.skillMode ?? 'INITIAL',
    attackDistanceType: conditions.attackDistanceType ?? 'MELEE',
  }
}

function validateConditions(context: ConditionContext): string[] {
  const reasons: string[] = []
  if (!Number.isSafeInteger(context.actualAttackTargetCount) || context.actualAttackTargetCount < 1) {
    reasons.push('実際の攻撃対象数は1体以上の整数で指定してください。')
  }
  if (!Number.isSafeInteger(context.skillActivationCount) || context.skillActivationCount < 1) {
    reasons.push('スキル発動回数は1回以上の整数で指定してください。')
  }
  if (!['INITIAL', 'ALTERNATE'].includes(context.skillMode)) reasons.push('スキルの状態を選択してください。')
  if (!['MELEE', 'RANGED'].includes(context.attackDistanceType)) reasons.push('攻撃距離を選択してください。')
  return reasons
}

function sameSelection(a: SkillStructureSelection, b: SkillStructureSelection): boolean {
  return a.operatorId === b.operatorId && a.skillId === b.skillId && a.skillIndex === b.skillIndex && a.levelIndex === b.levelIndex
}

function selectStage(structure: SkillStructure, context: ConditionContext): SkillStructureStage {
  const stages = structure.effectStructure.stages.filter(stage => evaluatePredicate(stage.applicability, context))
  if (stages.length !== 1) throw new RangeError('計算対象の段階を一つに決定できません。')
  return stages[0]
}

function resolveAttack(stage: SkillStructureStage, context: ConditionContext, base: BaseAttack): ResolvedAttack {
  let normalEnabled = true, maxTargets = base.maxTargets
  let penaltyEnabled = true
  let treatment: 'MELEE' | 'RANGED' | null = null
  let nextAttack = stage.duration.type === 'SINGLE_ATTACK'
  const actions: SkillStructureAttackAction[] = []
  for (const effect of stage.effects) {
    if (!evaluatePredicate(effect.condition, context)) continue
    if (effect.item === 'NORMAL_ATTACK_ENABLED' && effect.timing === 'WHILE_STAGE_ACTIVE') normalEnabled = effect.value
    if (effect.item === 'MAX_TARGETS' && effect.timing === 'WHILE_STAGE_ACTIVE') maxTargets = effect.value
    if (effect.item === 'ATTACK_TREATMENT') treatment = effect.value
    if (effect.item === 'TRAIT_RANGED_ATK_PENALTY') penaltyEnabled = effect.value
    if (effect.timing === 'ON_NEXT_NORMAL_ATTACK') nextAttack = true
    if (effect.item === 'TRIGGERED_ATTACK') {
      if (effect.timing !== 'ON_INCOMING_NORMAL_ATTACK' || effect.target !== 'ENEMIES_IN_ACTION_RANGE') {
        throw new RangeError('この追加攻撃の発動契機には対応していません。')
      }
      const action = effect.value
      if (!Number.isSafeInteger(action.count) || action.count < 1 || !Number.isSafeInteger(action.maxTargets)
        || action.maxTargets < 1 || !Number.isFinite(action.cooldownSeconds) || action.cooldownSeconds < 0) {
        throw new RangeError('反撃の攻撃回数・対象数・最短再発動間隔を取得できません。')
      }
      actions.push(action)
    }
  }
  if (!Number.isSafeInteger(maxTargets) || maxTargets < 1) throw new RangeError('対象数上限の設定を解決できません。')
  if (actions.length > 1 || (actions.length && normalEnabled)) {
    throw new RangeError('通常攻撃と独立した追加攻撃を組み合わせる計算にはまだ対応していません。')
  }
  if (!normalEnabled) {
    if (actions.length !== 1) throw new RangeError('通常攻撃を行わず、計算可能な反撃がありません。')
    const action = actions[0]
    if (action.treatment === 'RANGED' && base.counterRangedAttackScale === undefined) {
      throw new RangeError('反撃に対する遠距離特性倍率が未確認です。')
    }
    return { kind: 'COUNTER', treatment: action.treatment, fixedTreatment: true,
      maxTargets: action.maxTargets, action,
      rangePenaltyMultiplier: action.treatment === 'RANGED' ? base.counterRangedAttackScale! : 1 }
  }
  const effectiveTreatment = treatment ?? (base.rangedAttackScale !== undefined ? context.attackDistanceType : 'MELEE')
  return {
    kind: nextAttack ? 'NEXT_ATTACK' : 'NORMAL', treatment: effectiveTreatment, fixedTreatment: treatment !== null,
    maxTargets, action: null,
    rangePenaltyMultiplier: effectiveTreatment === 'RANGED' && penaltyEnabled ? base.rangedAttackScale ?? 1 : 1,
  }
}

function evaluatePredicate(predicate: SkillStructurePredicate | null, context: ConditionContext): boolean {
  if (!predicate) return true
  if (!['actualAttackTargetCount', 'skillActivationCount', 'skillMode', 'attackDistanceType'].includes(predicate.metric)) {
    throw new RangeError('条件「' + String(predicate.metric) + '」は未対応です。')
  }
  const actual = context[predicate.metric]
  if (predicate.metric === 'skillMode' || predicate.metric === 'attackDistanceType') {
    if (predicate.comparison === 'EQ') return actual === predicate.value
    if (predicate.comparison === 'NE') return actual !== predicate.value
    throw new RangeError('状態・攻撃距離の比較方法が未対応です。')
  }
  if (typeof actual !== 'number' || !Number.isFinite(actual) || !Number.isFinite(predicate.value)) {
    throw new RangeError('条件の数値を取得できません。')
  }
  switch (predicate.comparison) {
    case 'EQ': return actual === predicate.value
    case 'NE': return actual !== predicate.value
    case 'GT': return actual > predicate.value
    case 'GTE': return actual >= predicate.value
    case 'LT': return actual < predicate.value
    case 'LTE': return actual <= predicate.value
  }
}

function isOutsideDamageScope(effect: SkillStructureEffect): boolean {
  return ['ATTACK_RANGE', 'DEF_BUFF_RATIO', 'MAX_HP_BUFF_RATIO', 'MAX_HP', 'HP', 'SP', 'HP_RESTORE_RATIO', 'HP_LOSS_RATE'].includes(effect.item)
}

function validateOperator(input: DamageCalculatorThreeInput): string[] {
  const reasons: string[] = []
  const phase = input.operator.operatorProfile.phases[input.phaseIndex]
  if (!Number.isInteger(input.phaseIndex) || !phase) reasons.push('選択した昇進段階のデータを取得できません。')
  if (Number.isInteger(input.phaseIndex) && phase) {
    if (input.phaseIndex < getComparisonMinimumPhaseIndex(input.skill)) {
      reasons.push('選択した昇進段階では、このスキルは解放されていません。')
    }
    if (input.skillLevelIndex > getComparisonMaximumSkillLevelIndex(input.skill, input.phaseIndex)) {
      reasons.push('選択した昇進段階では、このスキルレベルを使用できません。')
    }
  }
  if (!Number.isInteger(input.operatorLevel) || input.operatorLevel < 1 || input.operatorLevel > (phase?.maxLevel ?? 0)) {
    reasons.push('オペレーターレベルが選択した昇進段階の範囲外です。')
  }
  if (!Number.isFinite(input.trust) || input.trust < 0 || input.trust > 100) reasons.push('信頼度は0〜100で指定してください。')
  for (const key of ['atk', 'baseAttackTime', 'attackSpeed'] as const) {
    if (!phase?.attributesKeyFrames?.some(frame => typeof frame.data?.[key] === 'number'
      && Number.isFinite(frame.data[key]) && frame.data[key]! > 0)) {
      reasons.push('攻撃力・攻撃速度・基礎攻撃間隔のデータを取得できません。')
      break
    }
  }
  return reasons
}
