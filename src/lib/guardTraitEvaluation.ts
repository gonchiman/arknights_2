import type { GuardConditions, GuardDamageAction, GuardStage } from './guardCombatTypes.ts'
import { resolveGuardValue } from './guardCombatValues.ts'
import { buildTraitStructures, type TraitStructureEffect, type TraitStructureOperator } from './traitStructure.ts'
import { evaluateTraitStructure, type TraitCombatResult } from './traitCombatEvaluation.ts'
import { GUARD_SKILL_SOURCES } from './guardSkillSources.ts'
import { calculateMechAccordCurrentScale } from './mechAccordDamage.ts'

/** Resolve the shared trait first, then apply the skill's explicit replacements. */
export function evaluateGuardTraits(operator: TraitStructureOperator, stage: GuardStage, conditions: GuardConditions,
  board: ReadonlyMap<string, number>, growth: { phaseIndex: number; operatorLevel: number },
  droneModifiers: { maximumMultiplier?: number; extraUnits?: number } = {}) {
  const structure = buildTraitStructures([operator], growth)[0] ?? null
  const reviewed = GUARD_SKILL_SOURCES.find(source => source.id === operator.operatorId)
  const identityErrors = reviewed && (operator.profession !== 'WARRIOR' || operator.subProfessionId !== reviewed.subProfessionId)
    ? ['確認済みのオペレーターと職業・職分が一致しません。']
    : reviewed && !structure ? ['確認済みの職分の特性構造を取得できません。'] : []
  const value = (expression: Parameters<typeof resolveGuardValue>[0]) => resolveGuardValue(expression, board, conditions)
  const frames = operator.operatorProfile.phases[growth.phaseIndex]?.attributesKeyFrames ?? []
  const baseBlockCount = frames.at(-1)?.data?.blockCnt
  const blockCount = typeof baseBlockCount === 'number'
    ? baseBlockCount + (stage.blockCountAdd === undefined ? 0 : value(stage.blockCountAdd)) : undefined
  const overrides: TraitStructureEffect['item'][] = [...(stage.traitOverrides ?? []),
    ...(stage.maxTargets === undefined ? [] : ['MAX_TARGETS', 'ATTACK_TARGETING'] as const)]
  const context = {
    kind: stage.kind,
    metrics: { ...conditions, 'source.skillActive': true, 'source.blockCount': blockCount,
      'attack.targetCount': conditions.actualAttackTargetCount ?? 1,
      'attack.distanceType': stage.attackTreatment ?? conditions.attackDistanceType ?? 'MELEE',
      'target.blockedBySource': conditions.targetBlockedBySelf,
      'source.isBlocking': stage.attackTreatment ? stage.attackTreatment === 'MELEE' : conditions.sourceIsBlocking ?? conditions.isBlocking,
      'target.inFrontalTiles': conditions.targetInFrontalTiles },
    attackRatioScale: stage.traitAttackRatioScale === undefined ? 1 : value(stage.traitAttackRatioScale),
    chainDamageRetention: stage.chainDamageRetention === undefined ? undefined : value(stage.chainDamageRetention),
    overriddenItems: overrides,
    disabledEffectIds: stage.attackTreatment === 'MELEE' ? ['ranged-attack-scale'] : undefined,
  }
  const evaluation = evaluateTraitStructure(structure, context)
  if (structure?.effects.some(effect => effect.item === 'STORED_CHARGE_MERGE_COUNT')
    && !overrides.includes('STORED_CHARGES'))
    evaluation.blockers.push('転置エネルギーは通常貯蔵と異なる命中定義を必要とします。')
  const droneBlockers: string[] = []
  if (evaluation.droneRamp && !stage.actions.some(action => action.drone))
    droneBlockers.push('浮遊ユニットを含む確認済みの攻撃定義がありません。')
  if (stage.actions.filter(action => action.drone?.includeTalentExtraUnits).length > 1)
    droneBlockers.push('素質の追加浮遊ユニットを複数の攻撃へ重複適用できません。')
  const actionEvaluations: TraitCombatResult[] = []
  const splashActions = new Map<GuardDamageAction, number>()
  const actions = stage.actions.flatMap(action => {
    if (action.drone) {
      if (!evaluation.droneRamp || action.damageType !== 'ARTS' || action.basis === 'ATK_STAT' || action.basis === 'TARGET_DEFENSE'
        || action.basis === 'TARGET_CURRENT_HP' || action.timing === 'PER_SECOND' || action.flatDamage !== undefined
        || action.isStoredCharge) throw new RangeError('浮遊ユニットの攻撃定義・特性を確認できません。')
      const maximum = action.drone.atMaximum === undefined ? 0 : value(action.drone.atMaximum)
      if (maximum !== 0 && maximum !== 1) throw new RangeError('浮遊ユニットの上限到達状態が不正です。')
      const maximumMultiplier = (droneModifiers.maximumMultiplier ?? 1)
        * (action.drone.maximumMultiplier === undefined ? 1 : value(action.drone.maximumMultiplier))
      const scale = calculateMechAccordCurrentScale(evaluation.droneRamp, value(action.drone.sameTargetAttack), maximumMultiplier, maximum === 1)
      const extra = action.drone.includeTalentExtraUnits ? droneModifiers.extraUnits ?? 0 : 0
      const count = (action.hits === undefined ? 1 : value(action.hits)) + extra
      if (!Number.isSafeInteger(extra) || extra < 0 || !Number.isSafeInteger(count) || count < 1 || count > 100)
        throw new RangeError('浮遊ユニット数が有効範囲外です。')
      return [{ ...action, hits: count, scale: { op: 'mul' as const, args: [action.scale, scale] } }]
    }
    // Stat-based DOT is not a normal attack: it keeps its own type and cadence,
    // without the job's hit count, attack scale, splash, or chain rules.
    if (action.basis === 'ATK_STAT' || action.basis === 'OWNER_ATK_STAT' || action.basis === 'DEF_STAT') return [{ ...action }]
    const overriddenItems: TraitStructureEffect['item'][] = [...overrides, ...(action.traitOverrides ?? [])]
    const current = action.traitOverrides?.length
      ? evaluateTraitStructure(structure, { ...context, overriddenItems }) : evaluation
    actionEvaluations.push(current)
    const transformed: GuardDamageAction = { ...action,
      damageType: current.damageType ?? action.damageType,
      hits: current.hitCount ?? action.hits,
      scale: current.attackScale === 1 ? action.scale : { op: 'mul', args: [action.scale, current.attackScale] },
    }
    if (current.splashScale !== undefined && action.damageType === 'PHYSICAL') splashActions.set(transformed, current.splashScale)
    if (current.chainRetention !== undefined) {
      const count = Number(conditions.actualAttackTargetCount ?? 1)
      if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new RangeError('跳躍攻撃の対象数が不正です。')
      return Array.from({ length: count }, (_, index) => ({ ...transformed,
        label: index === 0 ? `${action.label}（主対象）` : `${action.label}（跳躍${index}）`,
        scale: { op: 'mul' as const, args: [transformed.scale, current.chainRetention! ** index] }, targets: 1,
      }))
    }
    if (current.aftershockScale !== undefined) return [transformed, { ...transformed,
      label: `${action.label}（余震）`, scale: { op: 'mul' as const, args: [transformed.scale, current.aftershockScale] } }]
    if (current.storedChargeCount !== undefined && stage.kind === 'NORMAL' && action.role === 'MAIN'
      && !action.isStoredCharge && (!action.timing || action.timing === 'PER_ATTACK')
      && (!action.basis || action.basis === 'ATK')) {
      return [transformed, { ...transformed, label: `${action.label}（貯蔵弾）`, isStoredCharge: true, hits: current.storedChargeCount }]
    }
    return transformed
  })
  // A multi-part skill may replace one component while another inherits a trait.
  const evaluations = evaluation.evaluations.map(row => {
    if (!actionEvaluations.length) return row
    const matching = actionEvaluations.flatMap(result => result.evaluations.filter(entry => entry.effectId === row.effectId))
    return matching.find(entry => entry.status === 'UNSUPPORTED')
      ?? matching.find(entry => entry.status === 'APPLIED')
      ?? matching.find(entry => entry.status === 'CONDITION_FALSE') ?? matching[0] ?? row
  })
  const maxTargets = stage.maxTargets !== undefined ? stage.maxTargets === null ? null : value(stage.maxTargets)
    : evaluation.maxTargets !== undefined ? evaluation.maxTargets : splashActions.size ? null : 1
  return { evaluation: { ...evaluation, evaluations,
    blockers: [...new Set([...identityErrors, ...droneBlockers,
      ...(actionEvaluations.length ? actionEvaluations.flatMap(result => result.blockers) : evaluation.blockers)])] },
    actions, splashActions, maxTargets }
}
