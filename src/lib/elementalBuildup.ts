import type { CombatDamageKind } from './combatEffectStructure.ts'
import type { GuardInput } from './guardCombatTypes.ts'

export type ElementalBuildupKind = Extract<CombatDamageKind, { type: 'ELEMENTAL_BUILDUP' }>
export const ELEMENT_LABELS: Readonly<Record<string, string>> = { necrosis: '壊死', burn: '灼熱', neural: '神経', corrosion: '侵蝕' }
export const ELEMENTAL_BUILDUP_INPUTS: readonly GuardInput[] = [
  { key: 'targetElementalBurst', label: '対象の元素爆発', kind: 'select', defaultValue: 'NONE', options: [
    { value: 'NONE', label: '爆発効果なし' }, ...Object.entries(ELEMENT_LABELS).map(([id, label]) => ({ value: id.toUpperCase(), label: `${label}爆発効果中` })),
  ] },
  { key: 'elementalGaugeRemaining', label: '爆発までの残り元素値', kind: 'number', defaultValue: 1000, min: 0, max: 1000000, step: 0.1 },
  { key: 'elementalBuildupResistance', label: '敵の元素損傷耐性', kind: 'number', defaultValue: 0, min: 0, max: 100, step: 1 },
  { key: 'targetElementalImmune', label: '敵の元素損傷無効', kind: 'boolean', defaultValue: false },
]
/** A finite, per-target application. This is not HP damage or a damage-per-second value. */
export interface ElementalBuildupResult {
  elementId: string
  label: string
  basis: 'ATK_STAT' | 'DEALT_DAMAGE'
  perApplication: number
  allTargetsPerApplication: number
  status: 'APPLIED' | 'BURST_ACTIVE' | 'IMMUNE'
  remainingGaugeAfter: number | null
}

/** No 5% HP-damage floor: 100% buildup resistance prevents the entire buildup.
 * https://prts.wiki/w/元素#元素值（EP）
 * Only finite applications before a new burst are supported. Equality starts a burst.
 */
export function calculateElementalBuildup(amount: number, kind: ElementalBuildupKind,
  resistance: number, remaining: number, activeBurst: string, immune: boolean) {
  if (kind?.type !== 'ELEMENTAL_BUILDUP' || !Object.hasOwn(ELEMENT_LABELS, kind.elementId)
    || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(resistance) || resistance < 0 || resistance > 100
    || !Number.isFinite(remaining) || remaining < 0 || remaining > 1000000
    || !['NONE', 'NECROSIS', 'BURN', 'NEURAL', 'CORROSION'].includes(activeBurst) || typeof immune !== 'boolean')
    throw new RangeError('元素損傷の種類・損傷量・耐性・残り元素値が不正です。')
  if (activeBurst !== 'NONE') return { amount: 0, status: 'BURST_ACTIVE' as const, remaining: null }
  if (immune) return { amount: 0, status: 'IMMUNE' as const, remaining }
  if (remaining === 0) throw new RangeError('爆発効果なしの場合、残り元素値は0より大きい値が必要です。')
  const applied = amount * (1 - resistance / 100)
  if (applied >= remaining)
    throw new RangeError(`${ELEMENT_LABELS[kind.elementId]}損傷が爆発までの残り元素値に到達します。爆発開始と攻撃内の状態変化は未対応です。`)
  return { amount: applied, status: 'APPLIED' as const, remaining: remaining - applied }
}
