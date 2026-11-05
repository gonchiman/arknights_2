import { calculateAttackPipeline, calculateDamageBreakdown, getOperatorStats, type DamageType } from './damageCalculator.ts'
import type { DamageCalculatorThreeInput, DamageCalculatorThreeOutput, DamageCalculatorThreeAttackComponent } from './damageCalculatorThree.ts'
import type { SkillStructure } from './skillStructure.ts'
import type { GuardDamageAction, GuardInput, GuardPassiveModifiers, GuardStage } from './guardCombatTypes.ts'
import { guardConditionMatches, mergeGuardInputs, resolveGuardConditions, resolveGuardValue } from './guardCombatValues.ts'
import { evaluateGuardPassives, getGuardPassiveInputs } from './guardCombatPassives.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'
import type { ProbabilisticDamageBranch } from './probabilisticDamage.ts'
import { getExpandedDefinition, getExpandedSource, sameReviewedSkill } from './expandedCombatRegistry.ts'
import { evaluateGuardTraits } from './guardTraitEvaluation.ts'
import type { TraitCombatResult } from './traitCombatEvaluation.ts'
import { validateDamageCalculatorThreeEnemy } from './damageCalculatorThreeEnemy.ts'
import { getGuardVirtualAttackCapability, getMainAttackType } from './damageCalculatorThreeVirtualAttack.ts'

const TARGET_INPUT: GuardInput = { key: 'actualAttackTargetCount', label: '実際の攻撃対象数', kind: 'number',
  defaultValue: 1, min: 1, max: 10000, step: 1 }
const RESISTANCE_INPUT: GuardInput = { key: 'enemyResistance', label: '敵の術耐性', kind: 'number', defaultValue: 0, min: 0, max: 100, step: 1 }

/** Execute the same reviewed recipe used by the structure page. No description parsing. */
export function buildGuardDamageOutput(input: DamageCalculatorThreeInput, structure: SkillStructure,
  initialErrors: string[] = []): DamageCalculatorThreeOutput {
  const recipe = structure.guardRecipe!
  const expanded = getExpandedDefinition(recipe.operatorId)
  // Invalid values still block output; safe display statistics must not throw before that error is shown.
  const stats = getOperatorStats(input.operator.operatorProfile,
    Number.isFinite(input.phaseIndex) ? input.phaseIndex : 0,
    Number.isFinite(input.operatorLevel) ? input.operatorLevel : 1,
    Number.isFinite(input.trust) ? input.trust : 0)
  const enemyErrors = validateDamageCalculatorThreeEnemy(input.enemy)
  const enemy = enemyErrors.length ? undefined : input.enemy
  const reasons = [...initialErrors, ...enemyErrors]
  const suppliedConditions = enemy
    ? { ...input.conditions?.guard, enemyResistance: enemy.resistance } : input.conditions?.guard ?? {}
  let inputs: GuardInput[] = []
  try { inputs = mergeGuardInputs([TARGET_INPUT], getGuardPassiveInputs(input.operator.operatorId), recipe.inputs) }
  catch (error) { reasons.push(message(error)) }
  const resolved = resolveGuardConditions(inputs, suppliedConditions)
  const conditions = resolved.values
  reasons.push(...resolved.errors)
  if (input.operator.operatorId !== recipe.operatorId || input.skill.operatorId !== recipe.operatorId
    || input.skill.skillId !== structure.basicInfo.skillId || input.skillLevelIndex !== structure.basicInfo.levelIndex) reasons.push('選択したオペレーター・スキル・特化段階が一致していません。')
  const raw = input.skill.skillLevels[structure.basicInfo.levelIndex]
  if (!raw) reasons.push('選択したスキルレベルのデータがありません。')
  if (expanded) {
    const reviewed = getExpandedSource(recipe.operatorId)?.skills.find(skill => skill.skillId === input.skill.skillId && skill.skillIndex === recipe.skillIndex)?.raw
    if (!sameReviewedSkill(raw, reviewed)
      || input.phaseIndex !== expanded.phaseIndex) reasons.push('確認済みのスキル説明文・数値・昇進段階と一致しません。')
  }
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
  const nativePassive = evaluateGuardPassives(input.operator, conditions, { kind, skillIndex: recipe.skillIndex, stageId: stage?.id ?? '', stage,
    phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel })
  let passive = nativePassive
  reasons.push(...passive.blockers, ...(stage?.unresolved ?? []))
  for (const [label, fraction] of Object.entries({ 発動確率: passive.critChance,
    防御力無視: passive.defenseIgnoreRatio, 術耐性無視: passive.resistanceIgnoreRatio, 防御力低下: passive.defenseReductionRatio,
    術耐性低下: passive.resistanceReductionRatio ?? 0, 最低ダメージ比率: passive.minimumDamageRatio ?? 0 })) {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) reasons.push(`素質の${label}が有効範囲外です。`)
  }
  const actualTargetCount = Number(conditions.actualAttackTargetCount ?? 1)
  let traitEvaluation: TraitCombatResult | undefined
  let splashActions = new Map<GuardDamageAction, number>()
  let maxTargets: number | null = 1, atk = 0, aspd = 0, interval: number | null = null, duration = 0
  let actions: GuardDamageAction[] = []
  const actionPassives = new Map<GuardDamageAction, GuardPassiveModifiers>()
  let mainAttackType: DamageType | null = null
  let stageDefenseIgnoreRatio = 0, stageDefenseIgnoreFixed = 0, stageResistanceIgnoreFixed = 0
  let defenseIgnoreRatio = passive.defenseIgnoreRatio, defenseIgnoreFixed = passive.defenseIgnoreFixed
  let resistanceIgnoreFixed = passive.resistanceIgnoreFixed
  try {
    if (stage) {
      const traits = evaluateGuardTraits(input.operator, stage, conditions, board,
        { phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel })
      traitEvaluation = traits.evaluation
      splashActions = traits.splashActions
      reasons.push(...traitEvaluation.blockers)
      let resolvedActions = traits.actions
      mainAttackType = getMainAttackType(resolvedActions)
      if (input.virtualMainAttackType !== undefined) {
        const virtualType = input.virtualMainAttackType
        const capability = getGuardVirtualAttackCapability(stage)
        if (virtualType !== 'PHYSICAL' && virtualType !== 'ARTS') {
          throw new RangeError('仮想攻撃属性は物理または術を指定してください。')
        }
        if (!capability.supported) throw new RangeError(capability.reason!)
        // Same-type selection is exactly the native evaluation, including all existing passive semantics.
        if (virtualType !== mainAttackType) {
          const virtualPassive = evaluateGuardPassives(input.operator, conditions, { kind, skillIndex: recipe.skillIndex,
            stageId: stage.id, stage, phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel,
            virtualMainAttackType: virtualType })
          reasons.push(...virtualPassive.blockers)
          passive = virtualPassive
          // Never exchange defense and resistance effects. Each mitigation branch reads its own values.
          defenseIgnoreRatio = passive.defenseIgnoreRatio
          defenseIgnoreFixed = passive.defenseIgnoreFixed
          resistanceIgnoreFixed = passive.resistanceIgnoreFixed
          const transformed = new Map(resolvedActions.map(action => [action,
            action.role === 'MAIN' ? { ...action, damageType: virtualType } : action] as const))
          resolvedActions = resolvedActions.map(action => transformed.get(action)!)
          splashActions = new Map([...splashActions].map(([action, scale]) => [transformed.get(action)!, scale]))
          // Attribute-restricted passives follow the transformed main attack only.
          // Additional and periodic components retain their native attribute and modifiers.
          for (const action of resolvedActions) actionPassives.set(action, action.role === 'MAIN' ? passive : nativePassive)
        }
      }
      passive.attackRatio += traitEvaluation.attackRatio
      if (nativePassive !== passive) nativePassive.attackRatio += traitEvaluation.attackRatio
      maxTargets = traits.maxTargets
      if (maxTargets !== null && (!Number.isSafeInteger(maxTargets) || maxTargets < 1)) throw new RangeError('攻撃対象数の上限が不正です。')
      if (maxTargets !== null && actualTargetCount > maxTargets) reasons.push(`実際の攻撃対象数を1〜${maxTargets}体で指定してください。`)
      if (maxTargets !== null) inputs = inputs.map(item => item.key === TARGET_INPUT.key ? { ...item, max: maxTargets! } : item)
      atk = value(stage.atk)
      aspd = value(stage.aspd)
      if (atk < -1) throw new RangeError('攻撃力増加割合が不正です。')
      stageDefenseIgnoreRatio = value(stage.defenseIgnoreRatio)
      stageDefenseIgnoreFixed = value(stage.defenseIgnoreFixed)
      stageResistanceIgnoreFixed = value(stage.resistanceIgnoreFixed)
      defenseIgnoreRatio = 1 - (1 - passive.defenseIgnoreRatio) * (1 - stageDefenseIgnoreRatio)
      defenseIgnoreFixed += stageDefenseIgnoreFixed
      resistanceIgnoreFixed += stageResistanceIgnoreFixed
      const defenseReduction = value(stage.defenseReductionRatio)
      const resistanceReduction = value(stage.resistanceReductionRatio)
      const damageScale = value(stage.damageScale, 1)
      if (defenseReduction < 0 || defenseReduction > 1 || resistanceReduction < 0 || resistanceReduction > 1)
        throw new RangeError('スキルの防御力・術耐性低下率が有効範囲外です。')
      if (damageScale < 0) throw new RangeError('スキルの与ダメージ倍率が有効範囲外です。')
      for (const modifiers of new Set([passive, nativePassive])) {
        modifiers.defenseReductionRatio = 1 - (1 - modifiers.defenseReductionRatio) * (1 - defenseReduction)
        modifiers.resistanceReductionRatio = 1 - (1 - (modifiers.resistanceReductionRatio ?? 0)) * (1 - resistanceReduction)
        modifiers.damageScale *= damageScale
      }
      const baseTime = stats.baseAttackTime * value(stage.intervalScale, 1) + value(stage.intervalAdd) + (passive.attackIntervalAdd ?? 0)
      const speed = stats.attackSpeed + aspd + passive.attackSpeed
      if (!Number.isFinite(speed) || !Number.isFinite(baseTime) || baseTime <= 0) throw new RangeError('攻撃間隔を計算できません。')
      interval = kind === 'NORMAL' ? baseTime * 100 / Math.max(20, speed) : null
      duration = stage.duration === 'UNTIL_EXIT' ? 0 : Math.max(0, value(stage.duration, raw?.duration ?? 0))
      const talentActions = nativePassive.additionalActions.map(action => action.basis !== 'TARGET_DEFENSE' && action.basis !== 'ATK_STAT' && (!action.timing || action.timing === 'PER_ATTACK')
        ? { ...action, scale: { op: 'mul' as const, args: [action.scale, traitEvaluation!.attackScale] } } : action)
      if (nativePassive !== passive) for (const action of talentActions) actionPassives.set(action, nativePassive)
      actions = [...resolvedActions, ...talentActions].filter(action => action.timing !== 'ON_DEPLOY')
    }
  } catch (error) { reasons.push(message(error)) }
  const types = new Set(actions.map(action => action.damageType))
  const damageType: DamageType | null = types.size === 1 ? [...types][0] : null
  const axisType: DamageType = types.has('PHYSICAL') || actions.some(action => action.basis === 'TARGET_DEFENSE')
    ? 'PHYSICAL' : types.has('ARTS') ? 'ARTS' : 'TRUE'
  if (axisType === 'PHYSICAL' && types.has('ARTS')) {
    inputs.push(RESISTANCE_INPUT)
    if (enemy) conditions.enemyResistance = enemy.resistance
    else {
      const resistance = resolveGuardConditions([RESISTANCE_INPUT], suppliedConditions)
      Object.assign(conditions, resistance.values)
      reasons.push(...resistance.errors)
    }
  }
  const axisLabel = axisType === 'PHYSICAL' ? '敵の防御力' as const : axisType === 'ARTS' ? '敵の術耐性' as const : '防御力・術耐性' as const
  const attackSpeed = stats.attackSpeed + aspd + passive.attackSpeed
  const pipeline = (scale = 1, extraBonus = 0, modifiers = passive, includeAttackScale = true) => calculateAttackPipeline(stats.attack, {
    directAddition: modifiers.attackFlat,
    directMultiplierPercent: (atk + modifiers.attackRatio + extraBonus) * 100,
    attackScale: scale * (includeAttackScale ? modifiers.attackScale : 1),
  })
  const scopeNotes = [...(recipe.notes ?? []), ...(stage?.notes ?? []), ...passive.notes,
    '選択したHP・状態・累積数が一定の条件で評価します。回復・移動・途中撃破による時間変化は含めません。']
  const directActions = actions.filter(action => action.timing !== 'PER_SECOND')
  const periodicActions = actions.filter(action => action.timing === 'PER_SECOND')
  const hasRandomTargets = directActions.some(action => action.targets !== undefined)
    || splashActions.size > 0
  const canShowDps = kind === 'NORMAL' && interval !== null
  const dpsReason = canShowDps ? null : kind === 'NEXT_ATTACK' ? '強化攻撃1回の値です。SP回復を含む周期DPSは計算しません。'
    : '選択した段階の1回分の値です。動作時間・SP回復を含むDPSは計算しません。'
  const points = enemy ? [axisType === 'PHYSICAL' ? enemy.defense : axisType === 'ARTS' ? enemy.resistance : 0]
    : getDamageSensitivityTablePoints(axisType, directActions.map(action => {
      try { return pipeline(value(action.scale, 1), value(action.attackBonus), actionPassives.get(action), action.basis !== 'ATK_STAT').finalAttack * 0.95 } catch { return 0 }
    }))

  function componentsAt(axis: number, list: readonly GuardDamageAction[]): DamageCalculatorThreeAttackComponent[] {
    const components: DamageCalculatorThreeAttackComponent[] = []
    for (const [index, action] of list.entries()) {
      const modifiers = actionPassives.get(action) ?? passive
      const actionDefenseIgnoreRatio = modifiers === passive ? defenseIgnoreRatio
        : 1 - (1 - modifiers.defenseIgnoreRatio) * (1 - stageDefenseIgnoreRatio)
      const actionDefenseIgnoreFixed = modifiers === passive ? defenseIgnoreFixed : modifiers.defenseIgnoreFixed + stageDefenseIgnoreFixed
      const actionResistanceIgnoreFixed = modifiers === passive ? resistanceIgnoreFixed : modifiers.resistanceIgnoreFixed + stageResistanceIgnoreFixed
      const scale = value(action.scale, 1), count = value(action.hits, 1), probability = value(action.probability, 1)
      const targets = value(action.targets, actualTargetCount)
      if (scale < 0 || count < 0 || (action.timing !== 'PER_SECOND' && !Number.isSafeInteger(count)) || probability < 0 || probability > 1
        || targets < 0 || targets > actualTargetCount) throw new RangeError(`「${action.label}」の倍率・回数・命中数が不正です。`)
      const includeAttackScale = action.basis !== 'ATK_STAT'
      const basePipeline = pipeline(scale, value(action.attackBonus), modifiers, includeAttackScale)
      const normalAmount = action.basis === 'TARGET_CURRENT_HP'
        ? Math.max(Number(conditions.targetCurrentHp) * scale, pipeline(value(action.minimumAttackScale), 0, modifiers).finalAttack)
        : basePipeline.finalAttack + value(action.flatDamage)
      if (!Number.isFinite(normalAmount) || normalAmount < 0) throw new RangeError(`「${action.label}」のダメージを解決できません。`)
      const variants = splashActions.has(action)
        ? [{ label: `${action.label}（主対象）`, targets: Math.min(1, targets), factor: 1, damageScale: 1 },
          { label: `${action.label}（周囲）`, targets: Math.max(0, targets - 1), factor: splashActions.get(action)!, damageScale: modifiers.splashDamageScale ?? 1 }]
        : [{ label: action.label, targets, factor: 1, damageScale: 1 }]
      for (const [variantIndex, variant] of variants.entries()) {
        if (variant.targets === 0 || count === 0) continue
        const hitFactor = variant.targets / actualTargetCount
        const defense = enemy?.defense ?? (axisType === 'PHYSICAL' ? axis : 0)
        const resistance = enemy?.resistance ?? (axisType === 'ARTS' ? axis : Number(conditions.enemyResistance ?? 0))
        const appliedDefense = defense * (1 - modifiers.defenseReductionRatio)
        const appliedResistance = resistance * (1 - (modifiers.resistanceReductionRatio ?? 0)) * (1 - modifiers.resistanceIgnoreRatio)
        const allowsCritical = action.basis !== 'TARGET_DEFENSE' && action.basis !== 'ATK_STAT'
        const branches: ProbabilisticDamageBranch[] = [
          { id: 'NORMAL' as const, probability: allowsCritical ? 1 - modifiers.critChance : 1, scale: 1, attackBonus: 0 },
          { id: 'IGNORE' as const, probability: allowsCritical ? modifiers.critChance : 0, scale: modifiers.critScale, attackBonus: modifiers.criticalAttackRatio ?? 0 },
        ].filter(branch => branch.probability > 0).map(branch => {
          const branchPipeline = pipeline(scale, value(action.attackBonus) + branch.attackBonus, modifiers, includeAttackScale)
          const amount = (action.basis === 'TARGET_DEFENSE' ? appliedDefense * scale
            : branch.attackBonus !== 0 && (!action.basis || action.basis === 'ATK')
              ? branchPipeline.finalAttack + value(action.flatDamage) : normalAmount) * branch.scale * variant.factor
          const minimumDamage = (!action.basis || action.basis === 'ATK') && action.timing !== 'PER_SECOND'
            ? branchPipeline.afterFinalMultiplier * (modifiers.minimumDamageRatio ?? 0) : 0
          const mitigation = calculateDamageBreakdown(amount, action.damageType, appliedDefense, appliedResistance,
            { defenseIgnoreFixed: appliedDefense * actionDefenseIgnoreRatio + actionDefenseIgnoreFixed,
              resistanceIgnoreFixed: actionResistanceIgnoreFixed, minimumDamage })
          return { id: branch.id, probability: branch.probability,
            defenseIgnoreRatio: actionDefenseIgnoreRatio, damage: mitigation.result * count * modifiers.damageScale * variant.damageScale * probability * hitFactor, mitigation }
        })
        const expectedDamage = branches.reduce((sum, branch) => sum + branch.damage * branch.probability, 0)
        if (!Number.isFinite(expectedDamage)) throw new RangeError('ダメージ期待値を計算できません。')
        components.push({ id: `guard-${index}-${variantIndex}`, label: variant.label, order: components.length + 1,
          role: action.role, damageType: action.damageType, attackScale: scale * variant.factor, count, targetAirborne: false,
          defenseIgnoreChance: actionDefenseIgnoreRatio > 0 ? 1 : 0, defenseIgnoreRatio: actionDefenseIgnoreRatio, expectedDamage,
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
    traitEvaluation, mainAttackType,
    structure, stats, model: unsupportedReasons.length ? null : {
      directMultiplierPercent: atk * 100, attackScalePercent: 100,
      hitCount: rows[0]?.attackComponents.reduce((sum, component) => sum + component.expectedHitCount, 0) ?? 0,
      attackInterval: interval ?? 0, duration, ammoCount: 0, notes: [],
    },
    damageType, axisLabel, rows, unsupportedReasons, conditionInputs: [], actualTargetCount,
    maxTargetCount: maxTargets, effects: [], canShowDps: unsupportedReasons.length === 0 && canShowDps, dpsReason,
    effectiveAttack: unsupportedReasons.length ? null : pipeline(traitEvaluation?.attackScale ?? 1).finalAttack,
    attackSpeed: unsupportedReasons.length ? null : attackSpeed, attackInterval: unsupportedReasons.length ? null : interval,
    activeStageLabel: stage?.label ?? null, attackKind: kind, attackLabel: kind === 'NORMAL' ? '1攻撃' : kind === 'NEXT_ATTACK' ? '強化攻撃' : 'スキル',
    attackDistanceType: stage?.attackTreatment ?? (conditions.attackDistanceType === 'RANGED' ? 'RANGED' : 'MELEE'), rangePenaltyMultiplier: 1,
    scopeNotes: [...scopeNotes, ...(dpsReason ? [dpsReason] : [])], counterCooldownSeconds: null,
    talentEffects: [], talentAttackRatio: passive.attackRatio, resistanceIgnoreFixed, hasUnsupportedTalentDamage: false,
    damageOverTime: null, hasAttackSequence: true,
    hasProbabilisticDamage: passive.critChance > 0 && passive.critChance < 1
      || [...actionPassives.values()].some(modifiers => modifiers.critChance > 0 && modifiers.critChance < 1)
      || directActions.some(action => action.probability !== undefined),
    initialTargetState: null, hasRandomTargets,
    guard: { inputs, conditions, evaluations: passive.evaluations, unresolved: unsupportedReasons },
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : '計算条件を解決できません。' }
