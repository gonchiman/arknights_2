import { calculateDamageBreakdown, type DamageType, type MitigationModifiers } from './damageCalculator.ts'

/** Weakpoint selection precedes damage-specific multipliers and extra damage floors.
 * Source: https://prts.wiki/w/伤害分类#伤害的其他特征
 * The caller supplies the attack amount and already reduced enemy attributes.
 */
export function selectWeakpointDamageType(input: {
  attack: number
  originalType: DamageType
  defense: number
  resistance: number
  /** Attribute-specific addition counted in theoretical arts damage (e.g. Logos). */
  artsDamageFlatAddition?: number
  penetration?: Pick<MitigationModifiers, 'defenseIgnoreFixed' | 'resistanceIgnoreFixed'>
  fixedWeakpoint?: 'NONE' | 'PHYSICAL' | 'ARTS'
}): DamageType {
  const penetration = input.penetration ?? {}
  if (![input.attack, input.defense, input.resistance, input.artsDamageFlatAddition ?? 0, penetration.defenseIgnoreFixed ?? 0,
    penetration.resistanceIgnoreFixed ?? 0].every(value => Number.isFinite(value) && value >= 0)
    || input.resistance > 100 || !['PHYSICAL', 'ARTS', 'TRUE'].includes(input.originalType)
    || !['NONE', 'PHYSICAL', 'ARTS'].includes(input.fixedWeakpoint ?? 'NONE')) {
    throw new RangeError('弱点ダメージの攻撃力・防御力・術耐性・固定弱点が不正です。')
  }
  if (input.originalType === 'TRUE') return 'TRUE'
  if (input.fixedWeakpoint && input.fixedWeakpoint !== 'NONE') return input.fixedWeakpoint
  const physical = calculateDamageBreakdown(input.attack, 'PHYSICAL', input.defense, input.resistance, penetration).result
  const arts = calculateDamageBreakdown(input.attack + (input.artsDamageFlatAddition ?? 0), 'ARTS', input.defense, input.resistance, penetration).result
  // Preserve the original attribute at a tie, including numerical round-off.
  if (Math.abs(physical - arts) <= Math.max(1, physical, arts) * 1e-6) return input.originalType
  return physical > arts ? 'PHYSICAL' : 'ARTS'
}
