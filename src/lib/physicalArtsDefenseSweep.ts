import { calculateDamage } from './damageCalculator.ts'

export type PhysicalArtsMetric = 'damage' | 'reduction'
export type PhysicalArtsDefenseStat = 'defense' | 'resistance'

export interface PhysicalArtsDefenseRange {
  min: number
  max: number
  step: number
}

export interface PhysicalArtsDefensePoint {
  stat: number
  damage: number
}

export const MAX_DEFENSE_SWEEP_ROWS = 500

export function toDamageReductionPercent(attack: number, damage: number): number {
  return (attack - damage) / attack * 100
}

export function getPhysicalArtsDefenseRowCount({ min, max, step }: PhysicalArtsDefenseRange): number {
  if (![min, max, step].every(Number.isSafeInteger) || min < 0 || max < min || step < 1) return 0
  return Math.ceil((max - min) / step) + 1
}

export function getPhysicalArtsDefenseRows(
  attack: number, stat: PhysicalArtsDefenseStat, range: PhysicalArtsDefenseRange,
): PhysicalArtsDefensePoint[] {
  const count = getPhysicalArtsDefenseRowCount(range)
  if (count > MAX_DEFENSE_SWEEP_ROWS) return []
  return Array.from({ length: count }, (_, index) => {
    const value = Math.min(range.min + index * range.step, range.max)
    const damage = stat === 'defense'
      ? calculateDamage(attack, 'PHYSICAL', value, 0)
      : calculateDamage(attack, 'ARTS', 0, value)
    return { stat: value, damage }
  })
}
