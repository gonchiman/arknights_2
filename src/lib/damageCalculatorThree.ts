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
  type SkillStructure,
  type SkillStructureEffect,
  type SkillStructurePredicate,
  type SkillStructureSelection,
} from './skillStructure.ts'

/** Selection coverage is independent of the common calculation rules below. */
export const DAMAGE_CALCULATOR_THREE_SELECTIONS: readonly SkillStructureSelection[] = [
  { operatorId: 'char_350_surtr', skillId: 'skchr_surtr_2', skillIndex: 2, levelIndex: 9 },
  { operatorId: 'char_263_skadi', skillId: 'skcom_quickattack[3]', skillIndex: 1, levelIndex: 9 },
]

/** Reviewed normal attacks. These describe the base attack, not skill formulas. */
export const DAMAGE_CALCULATOR_THREE_BASE_ATTACKS: Readonly<Record<string, {
  readonly damageType: DamageType
  readonly hitCount: number
  readonly maxTargets: number
}>> = {
  char_350_surtr: { damageType: 'ARTS', hitCount: 1, maxTargets: 1 },
  char_263_skadi: { damageType: 'PHYSICAL', hitCount: 1, maxTargets: 1 },
}

export interface DamageCalculatorThreeConditionInput {
  metric: 'actualAttackTargetCount'
  label: string
  min: number
  max: number
  defaultValue: number
}

export interface DamageCalculatorThreeInput {
  operator: SkillRecord
  skill: SkillRecord
  phaseIndex: number
  operatorLevel: number
  trust: number
  skillLevelIndex: number
  conditions?: { actualAttackTargetCount?: number }
}

export interface DamageCalculatorThreeEffectEvaluation {
  effect: SkillStructureEffect
  stageId: string
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
}

export function getDamageCalculatorThreeStructures(): SkillStructure[] {
  return DAMAGE_CALCULATOR_THREE_SELECTIONS.flatMap(selection => {
    const structure = findSkillStructure(selection)
    return structure ? [structure] : []
  })
}

/** Missing or unsupported input semantics must never silently become false. */
export function getDamageCalculatorThreeInputs(structure: SkillStructure): DamageCalculatorThreeConditionInput[] {
  const metrics = new Set<string>(structure.effectStructure.inputRequirements ?? [])
  for (const stage of structure.effectStructure.stages) {
    if (stage.applicability) metrics.add(stage.applicability.metric)
    for (const effect of stage.effects) if (effect.condition) metrics.add(effect.condition.metric)
  }
  for (const metric of metrics) if (metric !== 'actualAttackTargetCount') {
    throw new RangeError(`条件「${metric}」の入力にはまだ対応していません。`)
  }
  const max = getUnconditionalTargetLimit(structure)
  if (max > 1) metrics.add('actualAttackTargetCount')
  return metrics.has('actualAttackTargetCount')
    ? [{ metric: 'actualAttackTargetCount', label: '実際の攻撃対象数', min: 1, max, defaultValue: 1 }]
    : []
}

/**
 * Only reviewed structures are executable. No description or blackboard
 * heuristics are used to select skill values. Passive effects and modules are
 * outside this calculation's scope; the base attack's damage type is retained.
 */
export function buildDamageCalculatorThreeOutput(input: DamageCalculatorThreeInput): DamageCalculatorThreeOutput {
  const reasons = validateOperator(input)
  // Invalid UI numbers are rejected below; safe values only keep the shared
  // interpolation helper from receiving NaN while preparing the error output.
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
  const baseAttack = DAMAGE_CALCULATOR_THREE_BASE_ATTACKS[input.operator.operatorId]
  const damageType = baseAttack?.damageType ?? null
  const axisLabel = damageType === 'PHYSICAL' ? '敵の防御力' : damageType === 'ARTS' ? '敵の術耐性' : '防御力・術耐性'
  if (input.skill.operatorId !== input.operator.operatorId) reasons.push('選択したオペレーターとスキルが一致していません。')
  if (!structure) reasons.push('選択したスキル・スキルレベルの構造化データは、計算機３では未対応です。')
  if (!baseAttack) reasons.push('通常攻撃の基礎定義が未対応です。')
  if (!Number.isInteger(input.skillLevelIndex) || !input.skill.skillLevels[input.skillLevelIndex]) {
    reasons.push('選択したスキルレベルのデータを取得できません。')
  }

  let conditionInputs: DamageCalculatorThreeConditionInput[] = []
  let maxTargetCount = baseAttack?.maxTargets ?? 1
  if (structure) {
    try {
      conditionInputs = getDamageCalculatorThreeInputs(structure)
      maxTargetCount = getUnconditionalTargetLimit(structure, maxTargetCount)
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : '条件の入力を解決できません。')
    }
  }
  const actualTargetCount = input.conditions?.actualAttackTargetCount ?? 1
  if (!Number.isInteger(actualTargetCount) || actualTargetCount < 1 || actualTargetCount > maxTargetCount) {
    reasons.push(`実際の攻撃対象数は1〜${maxTargetCount}体の整数で指定してください。`)
  }

  const effects: DamageCalculatorThreeEffectEvaluation[] = []
  let atkRatio = 0, attackSpeedBonus = 0, attackScale = 1
  let normalAttackEnabled = true
  let dpsReason: string | null = null
  let duration = 0
  if (structure && reasons.length === 0) {
    const stages = structure.effectStructure.stages.filter(stage => evaluatePredicate(stage.applicability, actualTargetCount))
    if (stages.length !== 1) reasons.push('計算対象の段階を一つに決定できません。')
    for (const stage of structure.effectStructure.stages) {
      const stageActive = stages.includes(stage)
      if (stageActive) {
        duration = stage.duration.type === 'FIXED_SECONDS' ? stage.duration.seconds : 0
        if (stage.duration.type === 'SINGLE_ATTACK') dpsReason = '次の通常攻撃1回のため、連続攻撃のDPSは表示しません。'
      }
      for (const effect of stage.effects) {
        const evaluation: DamageCalculatorThreeEffectEvaluation = {
          effect, stageId: stage.id, applied: false,
          status: stageActive ? 'APPLIED' : 'INACTIVE_STAGE',
          reason: !stageActive ? '選択中の段階ではありません。' : effect.condition
            ? `条件成立：${formatSkillStructurePredicate(effect.condition)}` : '条件なし',
        }
        effects.push(evaluation)
        if (!stageActive) continue
        if (!evaluatePredicate(effect.condition, actualTargetCount)) {
          evaluation.status = 'CONDITION_FALSE'
          evaluation.reason = `条件不成立：${formatSkillStructurePredicate(effect.condition)}`
          continue
        }
        // These effects affect positioning or survival, not outgoing attack
        // damage/DPS. Their absence would block other outputs such as lifetime.
        if (['ATTACK_RANGE', 'DEF_BUFF_RATIO', 'MAX_HP_BUFF_RATIO', 'MAX_HP', 'HP', 'SP', 'HP_RESTORE_RATIO', 'HP_LOSS_RATE'].includes(effect.item)) {
          evaluation.status = 'NOT_RELEVANT'
          evaluation.reason = '1攻撃のダメージ・DPSの計算には使用しません。'
          continue
        }
        const sustained = effect.timing === 'WHILE_STAGE_ACTIVE'
        const onAttack = effect.timing === 'ON_ATTACK' || effect.timing === 'ON_NEXT_NORMAL_ATTACK'
        if (effect.item === 'ATK_BUFF_RATIO' && sustained && effect.target === 'SELF' && Number.isFinite(effect.value)) {
          atkRatio += effect.value
        } else if (effect.item === 'ATTACK_SPEED' && sustained && effect.target === 'SELF' && Number.isFinite(effect.value)) {
          attackSpeedBonus += effect.value
        } else if (effect.item === 'ATTACK_SCALE' && (sustained || onAttack) && effect.target === 'SELF_ATTACK'
          && Number.isFinite(effect.value) && effect.value >= 0) {
          attackScale *= effect.value
          if (effect.timing === 'ON_NEXT_NORMAL_ATTACK') dpsReason = '次の通常攻撃1回のため、連続攻撃のDPSは表示しません。'
        } else if (effect.item === 'MAX_TARGETS' && sustained && effect.target === 'SELF_ATTACK') {
          // Already validated separately before evaluating target-count conditions.
        } else if (effect.item === 'NORMAL_ATTACK_ENABLED' && sustained && effect.target === 'SELF') {
          normalAttackEnabled = effect.value
        } else {
          evaluation.status = 'UNSUPPORTED'
          evaluation.reason = `「${formatSkillStructureEffectItem(effect.item)}」の適用方法にはまだ対応していません。`
          reasons.push(evaluation.reason)
          continue
        }
        evaluation.applied = true
      }
    }
  }
  if (!normalAttackEnabled) reasons.push('この段階では通常攻撃を行いません。別の攻撃モデルが必要です。')
  const attackInterval = stats.baseAttackTime * 100 / Math.max(20, stats.attackSpeed + attackSpeedBonus)
  if (!Number.isFinite(attackInterval) || attackInterval <= 0) reasons.push('攻撃間隔を計算できません。')
  const unsupportedReasons = [...new Set(reasons)]
  const canShowDps = unsupportedReasons.length === 0 && dpsReason === null
  const model: SkillModelDefaults | null = unsupportedReasons.length === 0 ? {
    directMultiplierPercent: atkRatio * 100, attackScalePercent: attackScale * 100,
    hitCount: baseAttack!.hitCount, attackInterval, duration, ammoCount: 0, notes: [],
  } : null
  const attackPipeline = model ? calculateAttackPipeline(stats.attack, {
    directMultiplierPercent: model.directMultiplierPercent, attackScale,
  }) : null
  const effectiveAttack = attackPipeline?.finalAttack ?? null
  const rows: DamageCalculatorThreeRow[] = model && attackPipeline && damageType
    ? getDamageSensitivityTablePoints(damageType, [attackPipeline.finalAttack * 0.95]).map(axisValue => {
      const mitigation = calculateDamageBreakdown(attackPipeline.finalAttack, damageType,
        damageType === 'PHYSICAL' ? axisValue : 0, damageType === 'ARTS' ? axisValue : 0)
      const perHit = mitigation.result
      const perAttack = perHit * model.hitCount
      const dps = canShowDps ? perAttack / attackInterval : null
      const breakdown: SkillDamageBreakdown = {
        attackPipeline, mitigation, perHit, perAttack, dps, total: null,
        hitCount: model.hitCount, attackInterval, duration, ammoCount: 0,
        canShowDps, totalMode: 'NONE',
      }
      return { axisValue, perHit, perAttack, dps, allTargetsPerAttack: perAttack * actualTargetCount,
        allTargetsDps: dps === null ? null : dps * actualTargetCount, breakdown }
    }) : []
  const attackSpeed = model ? stats.attackSpeed + attackSpeedBonus : null
  return { structure, stats, model, damageType, axisLabel, rows, unsupportedReasons, conditionInputs,
    actualTargetCount, maxTargetCount, effects, canShowDps, dpsReason, effectiveAttack, attackSpeed }
}

function sameSelection(a: SkillStructureSelection, b: SkillStructureSelection): boolean {
  return a.operatorId === b.operatorId && a.skillId === b.skillId && a.skillIndex === b.skillIndex && a.levelIndex === b.levelIndex
}

function getUnconditionalTargetLimit(structure: SkillStructure, initial = 1): number {
  let limit = initial
  for (const stage of structure.effectStructure.stages) for (const effect of stage.effects) {
    if (effect.item !== 'MAX_TARGETS') continue
    if (stage.applicability || effect.condition || effect.timing !== 'WHILE_STAGE_ACTIVE'
      || effect.target !== 'SELF_ATTACK' || !Number.isInteger(effect.value) || effect.value < 1) {
      throw new RangeError('対象数上限の設定を解決できません。')
    }
    limit = effect.value
  }
  return limit
}

function evaluatePredicate(predicate: SkillStructurePredicate | null, actualTargetCount: number): boolean {
  if (!predicate) return true
  if (predicate.metric !== 'actualAttackTargetCount') throw new RangeError(`条件「${predicate.metric}」は未対応です。`)
  const value = predicate.value
  switch (predicate.comparison) {
    case 'EQ': return actualTargetCount === value
    case 'NE': return actualTargetCount !== value
    case 'GT': return actualTargetCount > value
    case 'GTE': return actualTargetCount >= value
    case 'LT': return actualTargetCount < value
    case 'LTE': return actualTargetCount <= value
  }
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
