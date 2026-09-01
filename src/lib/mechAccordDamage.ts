import {
  calculateDamageBreakdown,
  type DamageCalculationBreakdown,
  type MitigationModifiers,
} from './damageCalculator.ts'

export const MECH_ACCORD_SUB_PROFESSION_ID = 'funnel'

export interface MechAccordDamageRow {
  attackCount: number
  attackCountLabel: string
  multiplierPercent: number
  rawDroneAttack: number
  droneDamage: number
  combinedDamage: number
  minimumReached: boolean
  droneBreakdown: DamageCalculationBreakdown
}

export interface MechAccordDamageRowsResult {
  mainDamage: DamageCalculationBreakdown
  rows: MechAccordDamageRow[]
}

const MECH_ACCORD_MULTIPLIERS = [20, 35, 50, 65, 80, 95, 110, 110] as const

const DISPLAY_ATTACK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export function isMechAccordSubProfession(subProfessionId: string): boolean {
  return subProfessionId === MECH_ACCORD_SUB_PROFESSION_ID
}

export function getMechAccordMultiplierPercent(attackCount: number): number {
  const normalizedAttackCount = Number.isFinite(attackCount)
    ? Math.max(1, Math.floor(attackCount))
    : 1
  const multiplierIndex = Math.min(normalizedAttackCount, DISPLAY_ATTACK_COUNTS.length) - 1
  return MECH_ACCORD_MULTIPLIERS[multiplierIndex]
}

export function calculateMechAccordDamageRows(
  rawAttack: number,
  enemyDefense: number,
  enemyResistance: number,
  mitigationModifiers: MitigationModifiers = {},
): MechAccordDamageRowsResult {
  const normalizedAttack = Number.isFinite(rawAttack) ? Math.max(0, rawAttack) : 0
  const mainDamage = calculateDamageBreakdown(
    normalizedAttack,
    'ARTS',
    enemyDefense,
    enemyResistance,
    mitigationModifiers,
  )

  const createRow = (attackCount: number): MechAccordDamageRow => {
    const multiplierPercent = getMechAccordMultiplierPercent(attackCount)
    const rawDroneAttack = normalizedAttack * multiplierPercent / 100
    const droneBreakdown = calculateDamageBreakdown(
      rawDroneAttack,
      'ARTS',
      enemyDefense,
      enemyResistance,
      mitigationModifiers,
    )

    return {
      attackCount,
      attackCountLabel: attackCount === DISPLAY_ATTACK_COUNTS.length
        ? `${attackCount}以上`
        : String(attackCount),
      multiplierPercent,
      rawDroneAttack,
      droneDamage: droneBreakdown.result,
      combinedDamage: mainDamage.result + droneBreakdown.result,
      minimumReached: isMinimumDamageReached(droneBreakdown),
      droneBreakdown,
    }
  }

  return {
    mainDamage,
    rows: DISPLAY_ATTACK_COUNTS.map(createRow),
  }
}

function isMinimumDamageReached(breakdown: DamageCalculationBreakdown): boolean {
  const minimumDamage = breakdown.minimumDamage
  if (minimumDamage === null || minimumDamage <= 0) return false
  const tolerance = Number.EPSILON
    * Math.max(1, Math.abs(breakdown.attack), Math.abs(minimumDamage), Math.abs(breakdown.result))
    * 32
  return breakdown.result <= minimumDamage + tolerance
}
