import { calculateAttackPipeline, calculateDamageBreakdown, getOperatorStats, type DamageType } from './damageCalculator.ts'
import type { DamageCalculatorThreeInput, DamageCalculatorThreeOutput, DamageCalculatorThreeAttackComponent } from './damageCalculatorThree.ts'
import type { SkillStructure } from './skillStructure.ts'
import type { GuardDamageAction, GuardInput, GuardPassiveModifiers, GuardStage } from './guardCombatTypes.ts'
import { guardConditionMatches, mergeGuardInputs, resolveGuardConditions, resolveGuardValue } from './guardCombatValues.ts'
import { evaluateGuardPassives, getGuardPassiveInputs } from './guardCombatPassives.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'
import type { ProbabilisticDamageBranch } from './probabilisticDamage.ts'

const TARGET_INPUT: GuardInput = { key: 'actualAttackTargetCount', label: '実際の攻撃対象数', kind: 'number',
  defaultValue: 1, min: 1, max: 10000, step: 1 }
const RESISTANCE_INPUT: GuardInput = { key: 'enemyResistance', label: '敵の術耐性', kind: 'number', defaultValue: 0, min: 0, max: 100, step: 1 }

/** Execute the same reviewed recipe used by the structure page. No description parsing. */
export function buildGuardDamageOutput(input: DamageCalculatorThreeInput, structure: SkillStructure,
  initialErrors: string[] = []): DamageCalculatorThreeOutput {
  const recipe = structure.guardRecipe!
  // Invalid values still block output; safe display statistics must not throw before that error is shown.
  const stats = getOperatorStats(input.operator.operatorProfile,
    Number.isFinite(input.phaseIndex) ? input.phaseIndex : 0,
    Number.isFinite(input.operatorLevel) ? input.operatorLevel : 1,
    Number.isFinite(input.trust) ? input.trust : 0)
  const reasons = [...initialErrors]
  let inputs: GuardInput[] = []
  try { inputs = mergeGuardInputs([TARGET_INPUT], getGuardPassiveInputs(input.operator.operatorId), recipe.inputs) }
  catch (error) { reasons.push(message(error)) }
  const resolved = resolveGuardConditions(inputs, input.conditions?.guard ?? {})
  const conditions = resolved.values
  reasons.push(...resolved.errors)
  if (input.operator.operatorId !== recipe.operatorId || input.skill.operatorId !== recipe.operatorId
    || input.skill.skillId !== structure.basicInfo.skillId || input.skillLevelIndex !== 9) reasons.push('選択したオペレーター・スキル・特化段階が一致していません。')
  const raw = input.skill.skillLevels[9]
  if (!raw) reasons.push('特化3のスキルデータがありません。')
  const sourceKeys = new Set<string>()
  for (const entry of raw?.blackboard ?? []) {
    const key = entry.key?.toLowerCase()
    if (!key || typeof entry.value !== 'number' || !Number.isFinite(entry.value) || sourceKeys.has(key)) {
      reasons.push('スキルの数値データに欠落・重複・不正な値があります。')
      break
    }
    sourceKeys.add(key)
  }
  const board = new Map((raw?.blackboard ?? []).flatMap(entry => entry.key && typeof entry.value === 'number'
    ? [[entry.key.toLowerCase(), entry.value] as const] : []))
  const value = (expression: Parameters<typeof resolveGuardValue>[0] | undefined, fallback = 0) => expression === undefined
    ? fallback : resolveGuardValue(expression, board, conditions)
  let stage: GuardStage | undefined
  try {
    const stages = recipe.stages.filter(candidate => !candidate.when || guardConditionMatches(candidate.when, conditions))
    if (stages.length !== 1) throw new RangeError('計算する段階を一意に選択できません。')
    stage = stages[0]
  } catch (error) { reasons.push(message(error)) }
  const kind = stage?.kind ?? 'NORMAL'
  const passive = evaluateGuardPassives(input.operator, conditions, { kind, skillIndex: recipe.skillIndex, stageId: stage?.id ?? '', stage })
  reasons.push(...passive.blockers, ...(stage?.unresolved ?? []))
  for (const [label, fraction] of Object.entries({ 発動確率: passive.critChance,
    防御力無視: passive.defenseIgnoreRatio, 術耐性無視: passive.resistanceIgnoreRatio, 防御力低下: passive.defenseReductionRatio })) {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) reasons.push(`素質の${label}が有効範囲外です。`)
  }
  const actualTargetCount = Number(conditions.actualAttackTargetCount ?? 1)
  let maxTargets: number | null = 1, atk = 0, aspd = 0, interval: number | null = null, duration = 0
  let actions: GuardDamageAction[] = []
  let defenseIgnoreRatio = passive.defenseIgnoreRatio, defenseIgnoreFixed = passive.defenseIgnoreFixed
  let resistanceIgnoreFixed = passive.resistanceIgnoreFixed
  try {
    if (stage) {
      maxTargets = stage.maxTargets === null ? null : value(stage.maxTargets, 1)
      if (maxTargets !== null && (!Number.isSafeInteger(maxTargets) || maxTargets < 1)) throw new RangeError('攻撃対象数の上限が不正です。')
      if (maxTargets !== null && actualTargetCount > maxTargets) reasons.push(`実際の攻撃対象数を1〜${maxTargets}体で指定してください。`)
      if (maxTargets !== null) inputs = inputs.map(item => item.key === TARGET_INPUT.key ? { ...item, max: maxTargets! } : item)
      atk = value(stage.atk)
      aspd = value(stage.aspd)
      if (atk < -1) throw new RangeError('攻撃力増加割合が不正です。')
      const combinedRatio = value(stage.defenseIgnoreRatio)
      defenseIgnoreRatio = 1 - (1 - passive.defenseIgnoreRatio) * (1 - combinedRatio)
      defenseIgnoreFixed += value(stage.defenseIgnoreFixed)
      resistanceIgnoreFixed += value(stage.resistanceIgnoreFixed)
      const baseTime = stats.baseAttackTime * value(stage.intervalScale, 1) + value(stage.intervalAdd)
      const speed = stats.attackSpeed + aspd + passive.attackSpeed
      if (!Number.isFinite(speed) || !Number.isFinite(baseTime) || baseTime <= 0) throw new RangeError('攻撃間隔を計算できません。')
      interval = kind === 'NORMAL' ? baseTime * 100 / Math.max(20, speed) : null
      duration = stage.duration === 'UNTIL_EXIT' ? 0 : value(stage.duration)
      actions = [...stage.actions, ...passive.additionalActions].filter(action => action.timing !== 'ON_DEPLOY')
    }
  } catch (error) { reasons.push(message(error)) }
  const types = new Set(actions.map(action => action.damageType))
  const damageType: DamageType | null = types.size === 1 ? [...types][0] : null
  const axisType: DamageType = types.has('PHYSICAL') ? 'PHYSICAL' : types.has('ARTS') ? 'ARTS' : 'TRUE'
  if (axisType === 'PHYSICAL' && types.has('ARTS')) {
    inputs.push(RESISTANCE_INPUT)
    const resistance = resolveGuardConditions([RESISTANCE_INPUT], input.conditions?.guard ?? {})
    Object.assign(conditions, resistance.values)
    reasons.push(...resistance.errors)
  }
  const axisLabel = axisType === 'PHYSICAL' ? '敵の防御力' as const : axisType === 'ARTS' ? '敵の術耐性' as const : '防御力・術耐性' as const
  const attackSpeed = stats.attackSpeed + aspd + passive.attackSpeed
  const pipeline = (scale = 1, extraBonus = 0) => calculateAttackPipeline(stats.attack, {
    directAddition: passive.attackFlat,
    directMultiplierPercent: (atk + passive.attackRatio + extraBonus) * 100,
    attackScale: scale * passive.attackScale,
  })
  const scopeNotes = [...(recipe.notes ?? []), ...(stage?.notes ?? []), ...passive.notes,
    '選択したHP・状態・累積数が一定の条件で評価します。回復・移動・途中撃破による時間変化は含めません。']
  const directActions = actions.filter(action => action.timing !== 'PER_SECOND')
  const periodicActions = actions.filter(action => action.timing === 'PER_SECOND')
  const hasRandomTargets = directActions.some(action => action.targets !== undefined)
    || input.operator.subProfessionId === 'hammer'
  const canShowDps = kind === 'NORMAL' && interval !== null
  const dpsReason = canShowDps ? null : kind === 'NEXT_ATTACK' ? '強化攻撃1回の値です。SP回復を含む周期DPSは計算しません。'
    : '選択した段階の1回分の値です。動作時間・SP回復を含むDPSは計算しません。'
  const points = getDamageSensitivityTablePoints(axisType, directActions.map(action => {
    try { return pipeline(value(action.scale, 1), value(action.attackBonus)).finalAttack * 0.95 } catch { return 0 }
  }))

  function componentsAt(axis: number, list: readonly GuardDamageAction[]): DamageCalculatorThreeAttackComponent[] {
    const components: DamageCalculatorThreeAttackComponent[] = []
    for (const [index, action] of list.entries()) {
      const scale = value(action.scale, 1), count = value(action.hits, 1), probability = value(action.probability, 1)
      const targets = value(action.targets, actualTargetCount)
      if (scale < 0 || count < 0 || (action.timing !== 'PER_SECOND' && !Number.isSafeInteger(count)) || probability < 0 || probability > 1
        || targets < 0 || targets > actualTargetCount) throw new RangeError(`「${action.label}」の倍率・回数・命中数が不正です。`)
      const basePipeline = pipeline(scale, value(action.attackBonus))
      const normalAmount = action.basis === 'TARGET_CURRENT_HP'
        ? Math.max(Number(conditions.targetCurrentHp) * scale, pipeline(value(action.minimumAttackScale)).finalAttack)
        : basePipeline.finalAttack + value(action.flatDamage)
      if (!Number.isFinite(normalAmount) || normalAmount < 0) throw new RangeError(`「${action.label}」のダメージを解決できません。`)
      const variants = input.operator.subProfessionId === 'hammer' && action.damageType === 'PHYSICAL' && stage?.actions.includes(action)
        ? [{ label: `${action.label}（主対象）`, targets: Math.min(1, targets), factor: 1, damageScale: 1 },
          { label: `${action.label}（周囲）`, targets: Math.max(0, targets - 1), factor: 0.5, damageScale: passive.splashDamageScale ?? 1 }]
        : [{ label: action.label, targets, factor: 1, damageScale: 1 }]
      for (const [variantIndex, variant] of variants.entries()) {
        if (variant.targets === 0 || count === 0) continue
        const hitFactor = variant.targets / actualTargetCount
        const defense = axisType === 'PHYSICAL' ? axis : 0
        const resistance = axisType === 'ARTS' ? axis : Number(conditions.enemyResistance ?? 0)
        const appliedDefense = defense * (1 - passive.defenseReductionRatio)
        const appliedResistance = resistance * (1 - passive.resistanceIgnoreRatio)
        const branches: ProbabilisticDamageBranch[] = [
          { id: 'NORMAL' as const, probability: 1 - passive.critChance, scale: 1 },
          { id: 'IGNORE' as const, probability: passive.critChance, scale: passive.critScale },
        ].filter(branch => branch.probability > 0).map(branch => {
          const amount = normalAmount * branch.scale * variant.factor
          const mitigation = calculateDamageBreakdown(amount, action.damageType, appliedDefense, appliedResistance,
            { defenseIgnoreFixed: appliedDefense * defenseIgnoreRatio + defenseIgnoreFixed, resistanceIgnoreFixed })
          return { id: branch.id, probability: branch.probability,
            defenseIgnoreRatio, damage: mitigation.result * count * passive.damageScale * variant.damageScale * probability * hitFactor, mitigation }
        })
        const expectedDamage = branches.reduce((sum, branch) => sum + branch.damage * branch.probability, 0)
        if (!Number.isFinite(expectedDamage)) throw new RangeError('ダメージ期待値を計算できません。')
        components.push({ id: `guard-${index}-${variantIndex}`, label: variant.label, order: components.length + 1,
          damageType: action.damageType, attackScale: scale * variant.factor, count, targetAirborne: false,
          defenseIgnoreChance: defenseIgnoreRatio > 0 ? 1 : 0, defenseIgnoreRatio, expectedDamage,
          expectedHitCount: count * probability * hitFactor, attackPipeline: basePipeline, branches })
      }
    }
    return components
  }

  let rows: DamageCalculatorThreeOutput['rows'] = []
  if (!reasons.length) try {
    rows = points.map(axisValue => {
      const attackComponents = componentsAt(axisValue, directActions)
      const perAttack = attackComponents.reduce((sum, component) => sum + component.expectedDamage, 0)
      const dot = periodicActions.length ? componentsAt(axisValue, periodicActions).reduce((sum, component) => sum + component.expectedDamage, 0) : null
      const dps = canShowDps && interval ? perAttack / interval : null
      const combined = dps === null ? null : dps + (dot ?? 0)
      return { axisValue, perHit: null, perAttack, dps, allTargetsPerAttack: perAttack * actualTargetCount,
        allTargetsDps: dps === null ? null : dps * actualTargetCount, breakdown: null,
        damageOverTimeDps: dot, combinedDps: combined, allTargetsCombinedDps: combined === null ? null : combined * actualTargetCount,
        attackComponents }
    })
  } catch (error) { reasons.push(message(error)); rows = [] }
  const unsupportedReasons = [...new Set(reasons)]
  return {
    structure, stats, model: unsupportedReasons.length ? null : {
      directMultiplierPercent: atk * 100, attackScalePercent: 100,
      hitCount: rows[0]?.attackComponents.reduce((sum, component) => sum + component.expectedHitCount, 0) ?? 0,
      attackInterval: interval ?? 0, duration, ammoCount: 0, notes: [],
    },
    damageType, axisLabel, rows, unsupportedReasons, conditionInputs: [], actualTargetCount,
    maxTargetCount: maxTargets, effects: [], canShowDps: unsupportedReasons.length === 0 && canShowDps, dpsReason,
    effectiveAttack: unsupportedReasons.length ? null : pipeline().finalAttack,
    attackSpeed: unsupportedReasons.length ? null : attackSpeed, attackInterval: unsupportedReasons.length ? null : interval,
    activeStageLabel: stage?.label ?? null, attackKind: kind, attackLabel: kind === 'NORMAL' ? '1攻撃' : kind === 'NEXT_ATTACK' ? '強化攻撃' : 'スキル',
    attackDistanceType: conditions.attackDistanceType === 'RANGED' ? 'RANGED' : 'MELEE', rangePenaltyMultiplier: 1,
    scopeNotes: [...scopeNotes, ...(dpsReason ? [dpsReason] : [])], counterCooldownSeconds: null,
    talentEffects: [], talentAttackRatio: passive.attackRatio, resistanceIgnoreFixed, hasUnsupportedTalentDamage: false,
    damageOverTime: null, hasAttackSequence: true,
    hasProbabilisticDamage: passive.critChance > 0 && passive.critChance < 1 || directActions.some(action => action.probability !== undefined),
    initialTargetState: null, hasRandomTargets,
    guard: { inputs, conditions, evaluations: passive.evaluations, unresolved: unsupportedReasons },
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : '計算条件を解決できません。' }
