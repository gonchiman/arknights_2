import type { RawBlackboardEntry } from '../types/skill.ts'
import type { DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import type { GuardConditions, GuardStage } from './guardCombatTypes.ts'
import { resolveGuardValue } from './guardCombatValues.ts'
import type { SkillStructureStage } from './skillStructure.ts'

type Stage = GuardStage | SkillStructureStage
export interface DamageThreeDurationContext {
  sourceDuration?: number | null
  blackboard?: readonly RawBlackboardEntry[]
  conditions?: GuardConditions
}

/** Use the selected stage's reviewed duration, including conditional values.
 * Raw duration is only a recipe fallback; -1 and ammunition are never seconds.
 */
export function resolveDamageThreeStageDuration(stage: Stage | null | undefined,
  context: DamageThreeDurationContext = {}): number | null {
  if (!stage || stage.periodTotal?.kind === 'UNSUPPORTED' && stage.periodTotal.duration === 'AMMO') return null
  let seconds: number | null | undefined
  if ('applicability' in stage) {
    seconds = stage.duration.type === 'FIXED_SECONDS' ? stage.duration.seconds : null
  } else {
    if (stage.kind !== 'NORMAL' || stage.duration === 'UNTIL_EXIT') return null
    const board = new Map((context.blackboard ?? []).flatMap(entry => entry.key && typeof entry.value === 'number'
      ? [[entry.key.toLowerCase(), entry.value] as const] : []))
    try { seconds = stage.duration === undefined ? context.sourceDuration
      : resolveGuardValue(stage.duration, board, context.conditions ?? {}) }
    catch { return null }
  }
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

export interface DamageThreePeriodTotalInput {
  stage: Stage | null | undefined
  attackKind: DamageCalculatorThreeOutput['attackKind']
  durationContext?: DamageThreeDurationContext
  combinedDps: number | null
  allTargetsCombinedDps: number | null
  damageOverTimeDps?: number | null
  hasUnsupportedTalentDamage?: boolean
  hasCalculationErrors?: boolean
}
export interface DamageThreePeriodTotal {
  durationSeconds: number | null
  totalDamage: number | null
  allTargetsTotalDamage: number | null
  totalDamageReason: string | null
}

/** Continuous expected damage, not an integer-hit or whole-skill simulation.
 * Every contribution must be covered before either total is published.
 */
export function calculateDamageThreePeriodTotal(input: DamageThreePeriodTotalInput): DamageThreePeriodTotal {
  const durationSeconds = resolveDamageThreeStageDuration(input.stage, input.durationContext)
  const unavailable = (totalDamageReason: string): DamageThreePeriodTotal => ({
    durationSeconds, totalDamage: null, allTargetsTotalDamage: null, totalDamageReason,
  })
  if (input.attackKind !== 'NORMAL') return unavailable('通常攻撃型の有限期間の総ダメージのみ対応しています。')
  const capability = input.stage?.periodTotal
  if (capability?.kind === 'UNSUPPORTED') return unavailable(capability.reason)
  if (durationSeconds === null) return unavailable('選択した段階の有限の継続時間を確定できません。')
  if (input.hasUnsupportedTalentDamage) return unavailable('未対応の素質ダメージがあるため、総ダメージは未計算です。')
  if (input.damageOverTimeDps !== null && input.damageOverTimeDps !== undefined) {
    return unavailable('継続ダメージの付与・更新・終了時刻が未確定です。')
  }
  if (capability?.kind !== 'CONSTANT_RATE') return unavailable('選択した段階の全ダメージ源を期間合計へ換算できるか未確認です。')
  if (input.hasCalculationErrors || input.combinedDps === null || input.allTargetsCombinedDps === null
    || ![input.combinedDps, input.allTargetsCombinedDps].every(value => Number.isFinite(value) && value >= 0)) {
    return unavailable('計算条件を解決できないため、総ダメージは未計算です。')
  }
  const totalDamage = input.combinedDps * durationSeconds
  const allTargetsTotalDamage = input.allTargetsCombinedDps * durationSeconds
  if (![totalDamage, allTargetsTotalDamage].every(Number.isFinite)) return unavailable('総ダメージが計算可能な数値の範囲を超えています。')
  return { durationSeconds, totalDamage, allTargetsTotalDamage, totalDamageReason: null }
}
