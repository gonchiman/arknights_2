import {
  calculateDamageBreakdown,
  type DamageCalculationBreakdown,
  type MitigationModifiers,
} from './damageCalculator.ts'

export const MECH_ACCORD_SUB_PROFESSION_ID = 'funnel'

export const MECH_ACCORD_MODULE_VARIANTS = ['NONE', 'X', 'Y'] as const
export type MechAccordModuleVariant = typeof MECH_ACCORD_MODULE_VARIANTS[number]

export interface MechAccordVariantDamage {
  multiplierPercent: number
  rawDroneAttack: number
  droneDamage: number
  combinedDamage: number
  minimumReached: boolean
  droneBreakdown: DamageCalculationBreakdown
}

export interface MechAccordDamageRow {
  attackCount: number
  attackCountLabel: string
  variants: Record<MechAccordModuleVariant, MechAccordVariantDamage>
}

export interface MechAccordDamageRowsResult {
  mainDamage: DamageCalculationBreakdown
  rows: MechAccordDamageRow[]
}

const MECH_ACCORD_MULTIPLIERS: Record<MechAccordModuleVariant, readonly number[]> = {
  NONE: [20, 35, 50, 65, 80, 95, 110, 110],
  X: [35, 50, 65, 80, 95, 110, 110, 110],
  Y: [20, 35, 50, 65, 80, 95, 110, 120],
}

const DISPLAY_ATTACK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export function isMechAccordSubProfession(subProfessionId: string): boolean {
  return subProfessionId === MECH_ACCORD_SUB_PROFESSION_ID
}

export function getMechAccordMultiplierPercent(
  attackCount: number,
  variant: MechAccordModuleVariant,
): number {
  const normalizedAttackCount = Number.isFinite(attackCount)
    ? Math.max(1, Math.floor(attackCount))
    : 1
  const multiplierIndex = Math.min(normalizedAttackCount, DISPLAY_ATTACK_COUNTS.length) - 1
  return MECH_ACCORD_MULTIPLIERS[variant][multiplierIndex]
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

  const createVariantDamage = (
    attackCount: number,
    variant: MechAccordModuleVariant,
  ): MechAccordVariantDamage => {
    const multiplierPercent = getMechAccordMultiplierPercent(attackCount, variant)
    const rawDroneAttack = normalizedAttack * multiplierPercent / 100
    const droneBreakdown = calculateDamageBreakdown(
      rawDroneAttack,
      'ARTS',
      enemyDefense,
      enemyResistance,
      mitigationModifiers,
    )

    return {
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
    rows: DISPLAY_ATTACK_COUNTS.map((attackCount) => ({
      attackCount,
      attackCountLabel: attackCount === DISPLAY_ATTACK_COUNTS.length
        ? `${attackCount}以上`
        : String(attackCount),
      variants: {
        NONE: createVariantDamage(attackCount, 'NONE'),
        X: createVariantDamage(attackCount, 'X'),
        Y: createVariantDamage(attackCount, 'Y'),
      },
    })),
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
