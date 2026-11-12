import { calculateDamage, calculateDamageBreakdown } from './damageCalculator.ts'

export interface PhysicalArtsAttackSweepInput {
  defense: number
  resistance: number
  minAttack: number
  maxAttack: number
  attackStep: number
}

export interface PhysicalArtsAttackSweepPoint {
  attack: number
  physical: number
  arts: number
}

export const MAX_ATTACK_SWEEP_ROWS = 500
const MAX_ATTACK = 1_000_000
const MAX_DEFENSE = 1_000_000
const MAX_RESISTANCE = 100
const minimumDamageRatio = calculateDamageBreakdown(1, 'PHYSICAL', 0, 0).minimumDamage ?? 0

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function isValidRange({ defense, resistance, minAttack, maxAttack }: PhysicalArtsAttackSweepInput): boolean {
  return integerInRange(defense, 0, MAX_DEFENSE)
    && integerInRange(resistance, 0, MAX_RESISTANCE)
    && integerInRange(minAttack, 1, MAX_ATTACK)
    && integerInRange(maxAttack, 1, MAX_ATTACK)
    && minAttack < maxAttack
}

function evaluateAttack(attack: number, { defense, resistance }: PhysicalArtsAttackSweepInput): PhysicalArtsAttackSweepPoint {
  return {
    attack,
    physical: calculateDamage(attack, 'PHYSICAL', defense, resistance),
    arts: calculateDamage(attack, 'ARTS', defense, resistance),
  }
}

export function getPhysicalArtsAttackSweepRowCount(input: PhysicalArtsAttackSweepInput): number {
  const { minAttack, maxAttack, attackStep } = input
  if (!isValidRange(input) || !integerInRange(attackStep, 1, MAX_ATTACK)) return 0
  return Math.floor((maxAttack - minAttack) / attackStep) + 1
}

export function getPhysicalArtsAttackSweepRows(input: PhysicalArtsAttackSweepInput): PhysicalArtsAttackSweepPoint[] {
  const count = getPhysicalArtsAttackSweepRowCount(input)
  if (count > MAX_ATTACK_SWEEP_ROWS) return []
  return Array.from({ length: count }, (_, index) => evaluateAttack(input.minAttack + index * input.attackStep, input))
}

export function getPhysicalArtsAttackSweepChartPoints(input: PhysicalArtsAttackSweepInput): PhysicalArtsAttackSweepPoint[] {
  if (!isValidRange(input)) return []
  const { defense, minAttack, maxAttack } = input
  // At this attack, subtracting defense gives exactly the same damage as the physical floor.
  const breakpoint = defense / (1 - minimumDamageRatio)
  const attacks = minAttack < breakpoint && breakpoint < maxAttack
    ? [minAttack, breakpoint, maxAttack]
    : [minAttack, maxAttack]
  return attacks.map(attack => evaluateAttack(attack, input))
}
