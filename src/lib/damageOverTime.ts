import { calculateDamageBreakdown } from './damageCalculator.ts'
import { resolveCombatNumericValue, type CombatDamageOverTime, type CombatScalar } from './combatEffectStructure.ts'

export interface DamageOverTimeRate {
  durationSeconds: number
  rawDamagePerSecond: number
}
export interface DamageOverTimeRateResolution {
  rate: DamageOverTimeRate | null
  status: 'UNSUPPORTED' | 'UNVERIFIED' | null
  reason: string | null
}
export interface MaintainedDamageOverTime {
  durationSeconds: number
  rawDamagePerSecond: number
  damagePerSecond: number
  allTargetsDamagePerSecond: number
  enemyResistance: number
  steadyDps: number | null
  steadyDpsReason: string | null
}

/** Rate model only: unknown tick timing never becomes a finite-duration hit count or total. */
export function resolveSingleStackDamageOverTimeRate(damage: CombatDamageOverTime,
  metrics: Readonly<Record<string, CombatScalar | null | undefined>> = {}): DamageOverTimeRateResolution {
  const fail = (status: 'UNSUPPORTED' | 'UNVERIFIED', reason: string): DamageOverTimeRateResolution => ({ rate: null, status, reason })
  if (damage.kind.type !== 'ORDINARY' || damage.kind.damageType !== 'ARTS'
    || damage.amount.basis !== 'FIXED' || damage.amount.referenceTime !== 'NOT_APPLICABLE'
    || damage.rate !== 'PER_SECOND' || damage.duration.type !== 'FIXED_SECONDS') {
    return fail('UNSUPPORTED', '固定値・毎秒量・術属性・固定時間の継続ダメージ以外は未対応です。')
  }
  const rawDamagePerSecond = resolveCombatNumericValue(damage.amount.value, metrics)
  const durationSeconds = damage.duration.seconds
  if (rawDamagePerSecond === null || durationSeconds === null) return fail('UNVERIFIED', '継続ダメージの毎秒量・持続時間を取得できません。')
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || rawDamagePerSecond < 0) return fail('UNSUPPORTED', '継続ダメージの毎秒量・持続時間が計算範囲外です。')
  if (damage.stacking.mode === 'UNSPECIFIED' || damage.stacking.maxStacks === null || damage.refresh === 'UNSPECIFIED') {
    return fail('UNVERIFIED', '継続ダメージの重複・再付与の扱いが未確認です。')
  }
  if (damage.stacking.mode !== 'REPLACE' || damage.stacking.maxStacks !== 1 || damage.refresh !== 'RESET_DURATION') {
    return fail('UNSUPPORTED', '単一効果の持続時間を更新する継続ダメージ以外は未対応です。')
  }
  return { rate: { durationSeconds, rawDamagePerSecond }, status: null, reason: null }
}

/** Same-target, uninterrupted application. Attack frequency is not inferred for counters. */
export function calculateMaintainedDamageOverTime(rate: DamageOverTimeRate, input: {
  enemyResistance: number
  actualTargetCount: number
  attackInterval: number | null
  attackKind: 'NORMAL' | 'NEXT_ATTACK' | 'COUNTER'
}): MaintainedDamageOverTime | null {
  if (!Number.isFinite(rate.rawDamagePerSecond) || rate.rawDamagePerSecond < 0
    || !Number.isFinite(rate.durationSeconds) || rate.durationSeconds <= 0
    || !Number.isFinite(input.enemyResistance) || input.enemyResistance < 0 || input.enemyResistance > 100
    || !Number.isSafeInteger(input.actualTargetCount) || input.actualTargetCount < 1) return null
  const damagePerSecond = calculateDamageBreakdown(rate.rawDamagePerSecond, 'ARTS', 0, input.enemyResistance).result
  const allTargetsDamagePerSecond = damagePerSecond * input.actualTargetCount
  if (!Number.isFinite(allTargetsDamagePerSecond)) return null
  const steadyDpsReason = input.attackKind === 'COUNTER' ? '反撃の発生頻度が未指定のため、定常DPSは算出しません。'
    : input.attackKind === 'NEXT_ATTACK' ? '強化攻撃1回のため、定常DPSは算出しません。'
      : input.attackInterval === null || !Number.isFinite(input.attackInterval) || input.attackInterval <= 0 ? '攻撃間隔を取得できません。'
        : input.attackInterval >= rate.durationSeconds ? '攻撃間隔が持続時間以上の場合の定常DPSは未対応です。' : null
  return { ...rate, damagePerSecond, allTargetsDamagePerSecond, enemyResistance: input.enemyResistance,
    steadyDps: steadyDpsReason === null ? damagePerSecond : null, steadyDpsReason }
}
