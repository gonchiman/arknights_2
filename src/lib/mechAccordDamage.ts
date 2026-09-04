import {
  calculateDamageBreakdown,
  type DamageCalculationBreakdown,
  type MitigationModifiers,
} from './damageCalculator.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'

export const MECH_ACCORD_SUB_PROFESSION_ID = 'funnel'

export const MECH_ACCORD_ATTACK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type MechAccordAttackCount = typeof MECH_ACCORD_ATTACK_COUNTS[number]

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

export interface MechAccordResistanceDamageRow {
  resistance: number
  mainDamage: number
  droneDamage: number
  combinedDamage: number
  mainMinimumReached: boolean
  droneMinimumReached: boolean
  combinedMinimumReached: boolean
  mainBreakdown: DamageCalculationBreakdown
  droneBreakdown: DamageCalculationBreakdown
}

export interface MechAccordResistanceTableResult {
  attackCount: MechAccordAttackCount
  attackCountLabel: string
  multiplierPercent: number
  rows: MechAccordResistanceDamageRow[]
}

const MECH_ACCORD_MULTIPLIERS = [20, 35, 50, 65, 80, 95, 110, 110] as const

export function isMechAccordSubProfession(subProfessionId: string): boolean {
  return subProfessionId === MECH_ACCORD_SUB_PROFESSION_ID
}

export function getMechAccordMultiplierPercent(attackCount: number): number {
  const normalizedAttackCount = normalizeMechAccordAttackCount(attackCount)
  const multiplierIndex = normalizedAttackCount - 1
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
      attackCountLabel: attackCount === MECH_ACCORD_ATTACK_COUNTS.length
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
    rows: MECH_ACCORD_ATTACK_COUNTS.map(createRow),
  }
}

export function calculateMechAccordResistanceTable(
  rawAttack: number,
  enemyDefense: number,
  attackCount: number,
  mitigationModifiers: MitigationModifiers = {},
): MechAccordResistanceTableResult {
  const normalizedAttackCount = normalizeMechAccordAttackCount(attackCount)
  const multiplierPercent = getMechAccordMultiplierPercent(normalizedAttackCount)
  const rows = getDamageSensitivityTablePoints('ARTS').map((resistance): MechAccordResistanceDamageRow => {
    const damage = calculateMechAccordDamageRows(
      rawAttack,
      enemyDefense,
      resistance,
      mitigationModifiers,
    )
    const selectedDamage = damage.rows[normalizedAttackCount - 1]
    const mainMinimumReached = isMinimumDamageReached(damage.mainDamage)
    const droneMinimumReached = selectedDamage.minimumReached

    return {
      resistance,
      mainDamage: damage.mainDamage.result,
      droneDamage: selectedDamage.droneDamage,
      combinedDamage: selectedDamage.combinedDamage,
      mainMinimumReached,
      droneMinimumReached,
      combinedMinimumReached: mainMinimumReached || droneMinimumReached,
      mainBreakdown: damage.mainDamage,
      droneBreakdown: selectedDamage.droneBreakdown,
    }
  })

  return {
    attackCount: normalizedAttackCount,
    attackCountLabel: normalizedAttackCount === MECH_ACCORD_ATTACK_COUNTS.length
      ? `${normalizedAttackCount}回目以降`
      : `${normalizedAttackCount}回目`,
    multiplierPercent,
    rows,
  }
}

function normalizeMechAccordAttackCount(attackCount: number): MechAccordAttackCount {
  const normalizedAttackCount = Number.isFinite(attackCount)
    ? Math.max(1, Math.floor(attackCount))
    : 1
  return Math.min(normalizedAttackCount, MECH_ACCORD_ATTACK_COUNTS.length) as MechAccordAttackCount
}

function isMinimumDamageReached(breakdown: DamageCalculationBreakdown): boolean {
  const minimumDamage = breakdown.minimumDamage
  if (minimumDamage === null || minimumDamage <= 0) return false
  const tolerance = Number.EPSILON
    * Math.max(1, Math.abs(breakdown.attack), Math.abs(minimumDamage), Math.abs(breakdown.result))
    * 32
  return breakdown.result <= minimumDamage + tolerance
}
