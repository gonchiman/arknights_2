import { DAMAGE_CALCULATOR_THREE_BASE_ATTACKS, type DamageCalculatorThreeInput, type DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import type { EffectApplicationRow } from './effectApplication.ts'
import { guardConditionMatches, resolveGuardValue } from './guardCombatValues.ts'
import { getExpandedDefinition, getExpandedSource } from './expandedCombatRegistry.ts'
import type { GuardStage, GuardValue } from './guardCombatTypes.ts'
import { buildTraitStructures, formatTraitStructureCondition, formatTraitStructureEffectItem,
  formatTraitStructureEffectValue, formatTraitStructureTiming, type TraitStructureEffect } from './traitStructure.ts'

type Decision = Pick<EffectApplicationRow, 'status' | 'reason'> & Partial<Pick<EffectApplicationRow, 'value' | 'item' | 'timing' | 'condition'>>
const excluded = (reason: string): Decision => ({ status: 'NOT_RELEVANT', reason })
const applied = (reason: string): Decision => ({ status: 'APPLIED', reason })

type ExpandedTraitCoverage = 'SUPPORTED' | 'NOT_APPLICABLE' | 'UNSUPPORTED'

/** Metadata establishes the meaning; this check confirms the fixed factor is
 * present in the executable scale, without applying it a second time. */
function containsMultiplicativeFactor(value: GuardValue, factor: number): boolean {
  return typeof value === 'number' ? value === factor
    : 'op' in value && value.op === 'mul' && value.args.some(argument => containsMultiplicativeFactor(argument, factor))
}

/** Registration coverage uses reviewed snapshots, not the currently loaded profile
 * or a default-condition calculation. Non-damage effects never imply support. */
export function getExpandedTraitCoverage(operatorId: string, stage: GuardStage): ExpandedTraitCoverage {
  const definition = getExpandedDefinition(operatorId), source = getExpandedSource(operatorId)
  if (!definition || !source) return 'UNSUPPORTED'
  const structure = buildTraitStructures([{ operatorId, operatorName: source.operatorName,
    profession: source.profession, professionLabel: source.profession, subProfessionId: source.subProfessionId,
    subProfessionName: source.subProfessionId, operatorProfile: source.profile }], { phaseIndex: definition.phaseIndex })[0]
  if (!structure?.effects.length || structure.status === 'UNREVIEWED' || structure.issues.length) return 'UNSUPPORTED'
  const recipe = definition.recipes.find(recipe => recipe.stages.some(candidate => candidate === stage
    || JSON.stringify(candidate) === JSON.stringify(stage)))
  const raw = source.skills.find(skill => skill.skillIndex === recipe?.skillIndex)?.raw
  const board = new Map((raw?.blackboard ?? []).flatMap(entry => typeof entry.value === 'number' && entry.key
    ? [[entry.key.toLowerCase(), entry.value] as const] : []))
  const conditions = { actualAttackTargetCount: 1, ...Object.fromEntries([
    ...(definition.inputs ?? []), ...(recipe?.inputs ?? []),
  ].map(input => [input.key, input.defaultValue])) }
  const direct = stage.actions.filter(action => !action.timing || action.timing === 'PER_ATTACK')
  const matchingRatio = (key: string, active: boolean | string, inactive: boolean | string, scale: number): boolean => direct.every(action => {
    const without = resolveGuardValue(action.scale, board, { ...conditions, [key]: inactive })
    const withTrait = resolveGuardValue(action.scale, board, { ...conditions, [key]: active })
    return without > 0 && Math.abs(withTrait / without - scale) < 1e-9
  })
  const states = structure.effects.map<ExpandedTraitCoverage>(effect => {
    if (effect.calculationRelevance === 'NOT_RELEVANT' || effect.item === 'ATTACK_RANGE'
      || effect.item === 'RANGED_ATTACK_ENABLED' || effect.item === 'NORMAL_ATTACK_ENABLED'
      || effect.operation === 'RESET_SOURCE_VALUE') return 'NOT_APPLICABLE'
    // Deferred skill placeholders do not establish the shape of an attack.
    if (!recipe || !raw || !direct.length) return 'UNSUPPORTED'
    try {
      if (effect.item === 'ATTACK_SCALE') {
        if (typeof effect.value !== 'number') return 'UNSUPPORTED'
        if (effect.id === 'frontal-attack-scale') return matchingRatio('targetInFrontalTiles', true, false, effect.value)
          ? 'SUPPORTED' : 'UNSUPPORTED'
        if (effect.id === 'unblocked-by-source-scale') return matchingRatio('targetBlockedBySelf', false, true, effect.value)
          ? 'SUPPORTED' : 'UNSUPPORTED'
        if (effect.id === 'ranged-attack-scale') {
          if (stage.attackTreatment === 'MELEE') return 'NOT_APPLICABLE'
          if (stage.attackTreatment === 'RANGED') return direct.every(action => containsMultiplicativeFactor(action.scale, effect.value as number))
            ? 'SUPPORTED' : 'UNSUPPORTED'
          return matchingRatio('attackDistanceType', 'RANGED', 'MELEE', effect.value) ? 'SUPPORTED' : 'UNSUPPORTED'
        }
        return 'UNSUPPORTED'
      }
      // A skill action defines its own normal-attack replacements.
      if (['DAMAGE_TYPE', 'HIT_COUNT', 'MAX_TARGETS', 'ATTACK_TARGETING'].includes(effect.item)
        && stage.kind === 'SKILL_ACTION') return 'NOT_APPLICABLE'
      if (effect.item === 'DAMAGE_TYPE') return direct.some(action => action.damageType === effect.value)
        ? 'SUPPORTED' : 'NOT_APPLICABLE'
      if (effect.item === 'ATTACK_TARGETING') return stage.maxTargets === null ? 'SUPPORTED' : 'NOT_APPLICABLE'
      if (effect.item === 'HIT_COUNT') return typeof effect.value === 'number'
        && direct.length === 1 && resolveGuardValue(direct[0].hits ?? 1, board, conditions) === effect.value
        ? 'SUPPORTED' : 'NOT_APPLICABLE'
      if (effect.item === 'MAX_TARGETS') {
        if (stage.maxTargets === null) return 'NOT_APPLICABLE'
        const frames = source.profile.phases[definition.phaseIndex]?.attributesKeyFrames ?? []
        const block = frames.at(-1)?.data?.blockCnt
        return typeof block === 'number' && resolveGuardValue(stage.maxTargets ?? 1, board, conditions) === block
          ? 'SUPPORTED' : 'UNSUPPORTED'
      }
      return 'UNSUPPORTED'
    } catch { return 'UNSUPPORTED' }
  })
  return states.includes('UNSUPPORTED') ? 'UNSUPPORTED' : states.includes('SUPPORTED') ? 'SUPPORTED' : 'NOT_APPLICABLE'
}

/** Explain the existing calculation; this adapter never applies a trait modifier. */
export function buildTraitApplicationRows(input: DamageCalculatorThreeInput, output: DamageCalculatorThreeOutput): EffectApplicationRow[] {
  const structure = buildTraitStructures([input.operator], { phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel })[0]
  const name = input.operator.subProfessionName || '特性'
  const prefix = `trait:${input.operator.operatorId}:`
  if (!structure?.effects.length) return [{ id: `${prefix}unverified`, category: 'TRAIT', name,
    item: '特性', value: '—', timing: '—', condition: '—', status: 'UNVERIFIED',
    reason: structure?.issues.join(' ') || '選択した育成段階の特性定義を確認できません。' }]

  const guard = output.guard
  const traitLogs = guard?.evaluations.filter(entry => 'sourceKind' in entry && entry.sourceKind === 'TRAIT') ?? []
  const log = (item: string) => traitLogs.find(entry => entry.item === item)
  const attackLog = log('攻撃属性・回数・対象')
  const scaleLog = log('攻撃倍率')
  let stage: NonNullable<NonNullable<DamageCalculatorThreeOutput['structure']>['guardRecipe']>['stages'][number] | undefined
  try {
    const matches = output.structure?.guardRecipe?.stages.filter(candidate => !candidate.when || guardConditionMatches(candidate.when, guard?.conditions ?? {}))
    if (matches?.length === 1) stage = matches[0]
  } catch { /* Invalid stage selections are reported by the calculator. */ }
  const directActions = stage?.actions.filter(action => !action.timing || action.timing === 'PER_ATTACK') ?? []
  const base = DAMAGE_CALCULATOR_THREE_BASE_ATTACKS[input.operator.operatorId]
  const calculationReady = output.rows.length > 0 && output.model !== null && output.unsupportedReasons.length === 0
  // The expanded executor validates the live source and the selected recipe;
  // these rows then inspect that recipe instead of inventing a generic "applied" log.
  const expanded = getExpandedDefinition(input.operator.operatorId)
  const attackRuleApplied = attackLog?.status === 'APPLIED' || (Boolean(expanded) && calculationReady)
  const blocked = (): Decision => ({ status: 'UNSUPPORTED', reason: output.unsupportedReasons.join(' ') || '選択した条件では計算結果を取得できません。' })
  const unknown = (reason: string): Decision => ({ status: 'UNVERIFIED', reason })
  const actualRule = (reason: string): Decision => calculationReady ? applied(reason) : blocked()
  const falseCondition = (reason: string): Decision => ({ status: 'CONDITION_FALSE', reason })
  const includedConditionalScale = (key: string, active: boolean | string, inactive: boolean | string, scale: number): boolean | null => {
    if (!expanded || !guard || !directActions.length) return null
    const raw = input.skill.skillLevels[input.skillLevelIndex]
    const board = new Map((raw?.blackboard ?? []).flatMap(entry => typeof entry.value === 'number' && entry.key
      ? [[entry.key.toLowerCase(), entry.value] as const] : []))
    try {
      return directActions.every(action => {
        const without = resolveGuardValue(action.scale ?? 1, board, { ...guard.conditions, [key]: inactive })
        const withTrait = resolveGuardValue(action.scale ?? 1, board, { ...guard.conditions, [key]: active })
        return without > 0 && Math.abs(withTrait / without - scale) < 1e-9
      })
    } catch { return null }
  }

  function evaluate(effect: TraitStructureEffect): Decision {
    // These rules do not change this fixed-condition attack calculation, even if
    // their own recovery cadence or placement behavior remains unresolved.
    if (effect.item === 'HP' || effect.item === 'ALLY_HEALING_ENABLED' || effect.item === 'DAMAGE_TO_HEAL_RATIO') return excluded('回復量・治療可否は、固定した条件の攻撃ダメージには加算しません。')
    if (effect.item === 'ATTACK_PRIORITY') return excluded('攻撃対象の選択順は計算しません。指定した対象へのダメージを計算します。')
    if (effect.item === 'STATUS') return excluded('状態の付与・失効は再現しません。状態によるダメージ変化は各効果の入力条件で扱います。')
    if (effect.item === 'DEFENSE_BUFF_RATIO' || effect.item === 'MAGIC_RESISTANCE') return excluded('自身の防御力・術耐性は、固定した条件の攻撃ダメージには加算しません。')
    if (effect.item === 'BLOCK_COUNT') return excluded('ブロック数の増減や敵の位置は計算しません。攻撃対象数は攻撃定義と入力値で扱います。')
    if (effect.item === 'ATTACK_RANGE' || effect.item === 'RANGED_ATTACK_ENABLED') return excluded('攻撃範囲・射程への出入りは計算せず、指定した対象に命中する条件で扱います。')
    if (effect.item === 'NORMAL_ATTACK_ENABLED') return falseCondition('スキル中の攻撃を計算しているため、スキル未発動時の通常攻撃停止は適用しません。')
    if (effect.operation === 'RESET_SOURCE_VALUE') return excluded('スキル終了による蓄積量のリセットは、選択した状態の攻撃計算には含めません。')

    if (effect.operation === 'INCREASE_TO_CAP') {
      const evaluation = log('攻撃力')
      if (!guard || !evaluation) return { status: 'UNSUPPORTED', reason: '指定した蓄積量を攻撃力へ反映する計算がありません。' }
      if (evaluation.status !== 'APPLIED') return { status: evaluation.status, reason: evaluation.reason }
      return { ...actualRule('入力した蓄積率から算出した特性の攻撃力上昇を使用します。蓄積の時間変化は計算しません。'),
        item: '蓄積による攻撃力上昇', value: evaluation.value, timing: '選択した状態', condition: `蓄積率 ${guard.conditions.traitChargePercent}％` }
    }
    if (effect.item === 'ATTACK_SCALE') {
      if (typeof effect.value !== 'number') return unknown('特性の攻撃力倍率を確認できません。')
      const traitScale = effect.value
      if (effect.id === 'frontal-attack-scale') {
        if (!calculationReady) return blocked()
        if (guard?.conditions.targetInFrontalTiles === false) return falseCondition('対象が正面横3マスの外にいるため、特性の攻撃倍率を適用しません。')
        if (!expanded || guard?.conditions.targetInFrontalTiles !== true || !directActions.length)
          return unknown('正面範囲の条件と攻撃倍率の対応を確認できません。')
        if (includedConditionalScale('targetInFrontalTiles', true, false, traitScale) === true)
          return applied('攻撃定義の倍率に正面範囲の1.5倍を反映しています。特性を追加で乗算しません。')
        return unknown('特性の正面倍率を現在の攻撃定義で確認できません。')
      }
      if (effect.id === 'unblocked-by-source-scale') {
        if (guard?.conditions.targetBlockedBySelf === true) return falseCondition('自身が対象をブロックしているため、攻撃力倍率を適用しません。')
        if (includedConditionalScale('targetBlockedBySelf', false, true, traitScale) === true)
          return actualRule('対象を自身でブロックしていない条件の倍率を、攻撃定義に反映しています。')
        if (scaleLog?.status === 'APPLIED' && scaleLog.value === `×${effect.value}`) return actualRule('対象を自身でブロックしていない条件で、特性の攻撃倍率を使用しています。')
      }
      if (effect.id === 'ranged-attack-scale') {
        const override = output.effects.find(entry => entry.applied && (
          (entry.effect.item === 'TRAIT_RANGED_ATK_PENALTY' && entry.effect.value === false)
          || (entry.effect.item === 'ATTACK_TREATMENT' && entry.effect.value === 'MELEE')))
        if (override) return excluded('選択したスキルの攻撃処理により、遠距離攻撃の減衰は適用しません。')
        if (expanded && guard) {
          if (stage?.attackTreatment === 'MELEE') return excluded('スキルの攻撃は近接攻撃扱いのため、遠距離攻撃の減衰は適用しません。')
          if (stage?.attackTreatment === 'RANGED' && directActions.length
            && directActions.every(action => containsMultiplicativeFactor(action.scale, traitScale))) {
            return { ...actualRule('遠距離攻撃扱いのため、攻撃定義に含まれる特性の80%倍率を使用しています。'), condition: '遠距離攻撃扱い' }
          }
          if (includedConditionalScale('attackDistanceType', 'RANGED', 'MELEE', traitScale) === true) {
            return guard.conditions.attackDistanceType === 'RANGED'
              ? actualRule('攻撃定義に特性の遠距離倍率を反映しています。')
              : falseCondition('近接攻撃のため、遠距離攻撃の減衰は適用しません。')
          }
          // Constant attack scales cannot establish whether a skill disabled
          // the penalty or forced ranged treatment; do not guess from 0.8 alone.
          return calculationReady ? unknown('スキル固有の攻撃倍率と遠距離減衰の内訳を確認できません。') : blocked()
        }
        if (output.attackDistanceType !== 'RANGED') return falseCondition('近接攻撃のため、遠距離攻撃の減衰は適用しません。')
        if (!guard && output.rangePenaltyMultiplier === effect.value && base?.rangedAttackScale === effect.value) return actualRule('計算中の攻撃に特性の遠距離倍率を乗算しています。')
        if (scaleLog?.status === 'APPLIED') return scaleLog.value === `×${effect.value}`
          ? actualRule('特性の遠距離倍率を攻撃倍率へ反映しています。')
          : excluded('選択したスキルの攻撃処理では、遠距離攻撃の減衰を使用しません。')
        if (guard && traitLogs.some(entry => entry.status === 'NOT_RELEVANT')) return excluded('選択したスキルの攻撃列では、特性の遠距離倍率を使用しません。')
      }
      return calculationReady ? unknown('特性倍率と現在の攻撃計算との対応を確認できません。') : blocked()
    }

    // An explicit action sequence supplies its own hit count and damage type.
    // In particular, Irene's two S1 hits must not receive another 2× trait factor.
    if (effect.item === 'HIT_COUNT') {
      if (output.attackKind === 'SKILL_ACTION' || (!guard && output.hasAttackSequence)) return excluded('スキルの攻撃列で打撃数を指定しているため、通常攻撃の2ヒットを追加適用しません。')
      if (typeof effect.value !== 'number') return unknown('通常攻撃のヒット数を確認できません。')
      if (!guard && base?.hitCount === effect.value && output.model?.hitCount === effect.value) return actualRule('通常攻撃のヒット数を基礎攻撃定義から使用しています。')
      if (guard && attackRuleApplied && directActions.length === 1 && directActions[0].hits === effect.value) {
        if (!calculationReady) return blocked()
        if (output.rows[0]?.attackComponents.some(component => component.count === effect.value)) return applied('攻撃定義のヒット数に反映済みです。特性を別に乗算しません。')
        return unknown('攻撃定義のヒット数と計算結果の打撃数が一致しません。')
      }
      if (stage) return excluded('選択したスキルの打撃数を使用するため、通常攻撃の2ヒットは追加しません。')
      return calculationReady ? unknown('通常攻撃のヒット数と現在の攻撃計算との対応を確認できません。') : blocked()
    }
    if (effect.item === 'DAMAGE_TYPE') {
      if (output.attackKind === 'SKILL_ACTION') return excluded('スキル固有の攻撃のダメージ種別を使用します。')
      if (!guard && base?.damageType === effect.value && output.damageType === effect.value) return actualRule('基礎攻撃のダメージ種別として計算しています。')
      if (guard && directActions.some(action => action.damageType === effect.value) && attackRuleApplied) return actualRule('攻撃定義のダメージ種別に反映済みです。')
      if (stage && directActions.every(action => action.damageType !== effect.value)) return excluded('選択したスキルの攻撃でダメージ種別を変更しています。')
      return calculationReady ? unknown('特性のダメージ種別と現在の攻撃計算との対応を確認できません。') : blocked()
    }
    if (effect.item === 'MAX_TARGETS') {
      if (output.attackKind === 'SKILL_ACTION' || (stage && stage.maxTargets === null)) return excluded('選択したスキル固有の攻撃対象数を使用します。')
      if (guard && attackRuleApplied && output.maxTargetCount !== null) return {
        ...actualRule('現在のブロック数を反映した攻撃定義の対象数上限を使用しています。'), value: `${output.maxTargetCount}体` }
      return calculationReady ? unknown('ブロック数と攻撃対象数上限との対応を確認できません。') : blocked()
    }
    if (effect.item === 'ATTACK_TARGETING') {
      if (output.attackKind === 'SKILL_ACTION') return excluded('通常攻撃ではなく、スキル固有の対象選択を使用します。')
      if (guard && attackRuleApplied && stage?.maxTargets === null && output.maxTargetCount === null) return actualRule('範囲内の敵数を入力値として扱い、全対象へのダメージを計算しています。範囲形状や移動は計算しません。')
      return calculationReady ? unknown('範囲攻撃の対象選択と現在の攻撃計算との対応を確認できません。') : blocked()
    }
    if (effect.item === 'SPLASH_DAMAGE') {
      if (typeof effect.value.attackScale !== 'number') return unknown('周囲へのダメージ倍率を確認できません。')
      if (guard && attackRuleApplied && directActions.some(action => action.damageType === 'PHYSICAL')) {
        if (output.actualTargetCount <= 1) return falseCondition('攻撃対象が1体のため、周囲へのダメージは発生しません。')
        // The current executor explicitly splits PHYSICAL hammer attacks into
        // main (1) and surrounding (0.5) variants. Do not claim arbitrary values.
        if (effect.value.attackScale === 0.5 && output.rows[0]?.attackComponents.some(component => component.id.endsWith('-1')))
          return actualRule('主対象と周囲の対象を分け、周囲への攻撃力倍率0.5を使用しています。')
      }
      return calculationReady ? unknown('周囲へのダメージ倍率と現在の攻撃計算との対応を確認できません。') : blocked()
    }
    return { status: 'UNSUPPORTED', reason: 'この特性効果の計算への適用は未対応です。' }
  }

  return structure.effects.flatMap(effect => {
    const row: EffectApplicationRow = { id: prefix + effect.id, category: 'TRAIT', name,
      item: formatTraitStructureEffectItem(effect.item), value: formatTraitStructureEffectValue(effect),
      timing: formatTraitStructureTiming(effect.timing), condition: formatTraitStructureCondition(effect.condition), ...evaluate(effect) }
    if (effect.operation !== 'INCREASE_TO_CAP') return [row]
    return [row, { ...row, id: `${row.id}:progression`, item: '攻撃力の蓄積推移', value: '未確定',
      timing: formatTraitStructureTiming(effect.timing), condition: formatTraitStructureCondition(effect.value.accumulateWhile),
      status: 'UNVERIFIED', reason: '最大値までの補間方式と更新間隔が未確認です。現在の計算は入力した蓄積量を固定して扱います。' } satisfies EffectApplicationRow]
  })
}
