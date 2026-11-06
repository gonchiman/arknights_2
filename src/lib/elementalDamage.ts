import type { CombatDamageKind } from './combatEffectStructure.ts'
import type { DamageCalculationBreakdown } from './damageCalculator.ts'

export type ElementalDamageKind = Extract<CombatDamageKind, { type: 'ELEMENTAL_DAMAGE' }>
export interface ElementalDamageBreakdown extends Omit<DamageCalculationBreakdown, 'damageType'> {
  damageType: 'ELEMENTAL'
  damageKind: ElementalDamageKind
  inputElementalResistance: number
  appliedElementalResistance: number
  afterElementalResistance: number
}

/** HP damage only. Elemental buildup must never call this damage path.
 * Formula: https://prts.wiki/w/游戏数据基础#元素伤害
 * 0..100 is this calculator's reviewed resistance input range, not a game-wide cap.
 */
export function calculateElementalDamageBreakdown(attack: number, kind: ElementalDamageKind,
  elementalResistance: number): ElementalDamageBreakdown {
  if (!Number.isFinite(attack) || attack < 0 || !Number.isFinite(elementalResistance)
    || elementalResistance < 0 || elementalResistance > 100
    || kind?.type !== 'ELEMENTAL_DAMAGE' || !['necrosis', 'burn', 'neural', 'corrosion'].includes(kind.elementId))
    throw new RangeError('元素ダメージの種類・威力・元素耐性が不正です。')
  const afterElementalResistance = attack * (1 - elementalResistance / 100)
  const minimumDamage = attack * 0.05
  return { attack, damageType: 'ELEMENTAL', damageKind: kind,
    inputElementalResistance: elementalResistance, appliedElementalResistance: elementalResistance,
    afterElementalResistance, inputDefense: 0, defenseBeforeIgnore: 0, defenseIgnoreFixed: 0, appliedDefense: 0,
    inputResistance: 0, resistanceBeforeIgnore: 0, resistanceIgnoreFixed: 0, appliedResistance: 0,
    afterDefense: null, afterResistance: null, minimumDamage, minimumApplied: minimumDamage > afterElementalResistance,
    result: Math.max(minimumDamage, afterElementalResistance) }
}
