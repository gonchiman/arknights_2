import {
  calculateDamageBreakdown,
  type DamageCalculationBreakdown,
  type MitigationModifiers,
} from './damageCalculator.ts'
import { getDamageSensitivityTablePoints } from './damageSensitivity.ts'

export const MECH_ACCORD_SUB_PROFESSION_ID = 'funnel'

export const MECH_ACCORD_ATTACK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type MechAccordAttackCount = typeof MECH_ACCORD_ATTACK_COUNTS[number]

export interface MechAccordAttackOptions {
  droneCount?: number
  mainAttackEnabled?: boolean
}

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
  droneCount: number
  mainAttackEnabled: boolean
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
  droneCount: number
  mainAttackEnabled: boolean
  attackCount: MechAccordAttackCount
  attackCountLabel: string
  multiplierPercent: number
  rows: MechAccordResistanceDamageRow[]
}

const BASE_MECH_ACCORD_RAMP: MechAccordRampProfile = { initialScale: 0.2, increment: 0.15, maximumScale: 1.1, baseMaximumStacks: 6 }

export interface MechAccordRampProfile {
  initialScale: number
  increment: number
  maximumScale: number
  baseMaximumStacks: number
}

/** One drone's current hit; no attack cadence, retargeting, or reset is inferred. */
export function calculateMechAccordCurrentScale(profile: MechAccordRampProfile, attackCount: number,
  maximumMultiplier = 1, atMaximum = false): number {
  const { initialScale, increment, maximumScale, baseMaximumStacks } = profile
  if (![initialScale, increment, maximumScale, maximumMultiplier].every(value => Number.isFinite(value) && value > 0)
    || initialScale > maximumScale || !Number.isSafeInteger(baseMaximumStacks) || baseMaximumStacks < 1
    || Math.abs(initialScale + increment * baseMaximumStacks - maximumScale) > 1e-9
    || !Number.isSafeInteger(attackCount) || attackCount < 1 || attackCount > 10000
    || maximumMultiplier < 1 || !Number.isFinite(maximumScale * maximumMultiplier))
    throw new RangeError('浮遊ユニットの確認済み倍率・攻撃段階を取得できません。')
  // A changed cap alone does not establish the rate at which the new cap is reached.
  if (maximumMultiplier !== 1 && attackCount !== 1 && !atMaximum)
    throw new RangeError('上限変更中の途中段階は未確認です。初撃または上限到達状態を指定してください。')
  return atMaximum ? maximumScale * maximumMultiplier
    : Math.min(maximumScale, initialScale + increment * Math.min(attackCount - 1, baseMaximumStacks))
}

export function isMechAccordSubProfession(subProfessionId: string): boolean {
  return subProfessionId === MECH_ACCORD_SUB_PROFESSION_ID
}

export function getMechAccordMultiplierPercent(attackCount: number): number {
  const normalizedAttackCount = normalizeMechAccordAttackCount(attackCount)
  return Math.round(calculateMechAccordCurrentScale(BASE_MECH_ACCORD_RAMP, normalizedAttackCount) * 100_000) / 1000
}

export function calculateMechAccordDamageRows(
  rawAttack: number,
  enemyDefense: number,
  enemyResistance: number,
  mitigationModifiers: MitigationModifiers = {},
  options: MechAccordAttackOptions = {},
): MechAccordDamageRowsResult {
  const normalizedAttack = Number.isFinite(rawAttack) ? Math.max(0, rawAttack) : 0
  const droneCount = normalizeDroneCount(options.droneCount)
  const mainAttackEnabled = options.mainAttackEnabled ?? true
  const mainDamage = calculateDamageBreakdown(
    mainAttackEnabled ? normalizedAttack : 0,
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

    const droneDamage = droneBreakdown.result * droneCount
    return {
      attackCount,
      attackCountLabel: attackCount === MECH_ACCORD_ATTACK_COUNTS.length
        ? `${attackCount}以上`
        : String(attackCount),
      multiplierPercent,
      rawDroneAttack,
      droneDamage,
      combinedDamage: mainDamage.result + droneDamage,
      minimumReached: isMinimumDamageReached(droneBreakdown),
      droneBreakdown,
    }
  }

  return {
    droneCount,
    mainAttackEnabled,
    mainDamage,
    rows: MECH_ACCORD_ATTACK_COUNTS.map(createRow),
  }
}

export function calculateMechAccordResistanceTable(
  rawAttack: number,
  enemyDefense: number,
  attackCount: number,
  mitigationModifiers: MitigationModifiers = {},
  options: MechAccordAttackOptions = {},
): MechAccordResistanceTableResult {
  const droneCount = normalizeDroneCount(options.droneCount)
  const mainAttackEnabled = options.mainAttackEnabled ?? true
  const normalizedAttackCount = normalizeMechAccordAttackCount(attackCount)
  const multiplierPercent = getMechAccordMultiplierPercent(normalizedAttackCount)
  const rows = getDamageSensitivityTablePoints('ARTS').map((resistance): MechAccordResistanceDamageRow => {
    const damage = calculateMechAccordDamageRows(
      rawAttack,
      enemyDefense,
      resistance,
      mitigationModifiers,
      { droneCount, mainAttackEnabled },
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
    droneCount,
    mainAttackEnabled,
    attackCount: normalizedAttackCount,
    attackCountLabel: normalizedAttackCount === MECH_ACCORD_ATTACK_COUNTS.length
      ? `${normalizedAttackCount}回目以降`
      : `${normalizedAttackCount}回目`,
    multiplierPercent,
    rows,
  }
}

function normalizeDroneCount(droneCount: number | undefined): number {
  return typeof droneCount === 'number' && Number.isFinite(droneCount)
    ? Math.max(1, Math.round(droneCount))
    : 1
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
