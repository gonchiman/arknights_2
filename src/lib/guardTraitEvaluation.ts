import type { GuardConditions, GuardDamageAction, GuardStage } from './guardCombatTypes.ts'
import { resolveGuardValue } from './guardCombatValues.ts'
import { buildTraitStructures, type TraitStructureEffect, type TraitStructureOperator } from './traitStructure.ts'
import { evaluateTraitStructure, type TraitCombatResult } from './traitCombatEvaluation.ts'
import { GUARD_SKILL_SOURCES } from './guardSkillSources.ts'

/** Resolve the shared trait first, then apply the skill's explicit replacements. */
export function evaluateGuardTraits(operator: TraitStructureOperator, stage: GuardStage, conditions: GuardConditions,
  board: ReadonlyMap<string, number>, growth: { phaseIndex: number; operatorLevel: number }) {
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
      'target.inFrontalTiles': conditions.targetInFrontalTiles },
    attackRatioScale: stage.traitAttackRatioScale === undefined ? 1 : value(stage.traitAttackRatioScale),
    overriddenItems: overrides,
    disabledEffectIds: stage.attackTreatment === 'MELEE' ? ['ranged-attack-scale'] : undefined,
  }
  const evaluation = evaluateTraitStructure(structure, context)
  const actionEvaluations: TraitCombatResult[] = []
  const splashActions = new Map<GuardDamageAction, number>()
  const actions = stage.actions.map(action => {
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
    blockers: [...new Set([...identityErrors, ...(actionEvaluations.length ? actionEvaluations.flatMap(result => result.blockers) : evaluation.blockers)])] },
    actions, splashActions, maxTargets }
}
