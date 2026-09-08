import { calculateDamageBreakdown, type DamageCalculationBreakdown } from './damageCalculator.ts'
import type { GoldenglowExplosionModel } from './goldenglowExplosion.ts'
import {
  buildGoldenglowNormalAttackTable,
  type GoldenglowNormalAttackRow,
  type GoldenglowNormalAttackTableInput,
} from './goldenglowNormalAttackTable.ts'

export interface GoldenglowCombinedAttackTableInput extends Omit<GoldenglowNormalAttackTableInput, 'model'> {
  model: GoldenglowNormalAttackTableInput['model'] & Pick<GoldenglowExplosionModel, 'activeDroneCount'>
  skillIndex: number
  explosionDamage: number
}

export interface GoldenglowCombinedAttackRow {
  attackNumber: number
  elapsedSeconds: number
  normalAttack: GoldenglowNormalAttackRow
  bodyDamage: DamageCalculationBreakdown
  droneCount: number
  bodyAttackEnabled: boolean
  expectedBodyDamage: number
  expectedDroneNormalDamage: number
  expectedExplosionDamage: number
  expectedTotalDamage: number
  cumulativeExpectedTotalDamage: number
}

export interface GoldenglowCombinedAttackSummary {
  expectedBodyDamage: number
  expectedDroneNormalDamage: number
  expectedExplosionDamage: number
  expectedTotalDamage: number
  expectedDps: number | null
}

/** Uses the displayed attack rows and the full calculation window for DPS. */
export function summarizeGoldenglowCombinedAttackTable(
  rows: readonly GoldenglowCombinedAttackRow[],
  duration: number,
): GoldenglowCombinedAttackSummary {
  let expectedBodyDamage = 0
  let expectedDroneNormalDamage = 0
  let expectedExplosionDamage = 0
  for (const row of rows) {
    expectedBodyDamage += row.expectedBodyDamage
    expectedDroneNormalDamage += row.expectedDroneNormalDamage
    expectedExplosionDamage += row.expectedExplosionDamage
  }
  const expectedTotalDamage = rows.at(-1)?.cumulativeExpectedTotalDamage ?? 0

  return {
    expectedBodyDamage,
    expectedDroneNormalDamage,
    expectedExplosionDamage,
    expectedTotalDamage,
    expectedDps: Number.isFinite(duration) && duration > 0 ? expectedTotalDamage / duration : null,
  }
}

/** All drones share the guide's initial state, timing and single-enemy target. */
export function buildGoldenglowCombinedAttackTable(
  input: GoldenglowCombinedAttackTableInput,
): GoldenglowCombinedAttackRow[] {
  const droneCount = input.model.activeDroneCount
  if (
    ![1, 2, 3].includes(input.skillIndex)
    || !Number.isInteger(droneCount)
    || droneCount <= 0
    || !Number.isFinite(input.explosionDamage)
    || input.explosionDamage < 0
  ) return []

  const normalRows = buildGoldenglowNormalAttackTable(input)
  if (normalRows.length === 0) return []
  const bodyDamage = calculateDamageBreakdown(input.attack, 'ARTS', 0, input.resistance, {
    resistanceIgnoreFixed: input.resistanceIgnore,
  })
  const bodyAttackEnabled = input.skillIndex !== 3
  const expectedBodyDamage = bodyAttackEnabled ? bodyDamage.result : 0
  let cumulativeExpectedTotalDamage = 0

  return normalRows.map((normalAttack) => {
    const expectedDroneNormalDamage = normalAttack.expectedNormalDamage * droneCount
    const expectedExplosionDamage = input.explosionDamage * (normalAttack.explosionChancePercent / 100) * droneCount
    const expectedTotalDamage = expectedBodyDamage + expectedDroneNormalDamage + expectedExplosionDamage
    cumulativeExpectedTotalDamage += expectedTotalDamage

    return {
      attackNumber: normalAttack.attackNumber,
      elapsedSeconds: normalAttack.elapsedSeconds,
      normalAttack,
      bodyDamage,
      droneCount,
      bodyAttackEnabled,
      expectedBodyDamage,
      expectedDroneNormalDamage,
      expectedExplosionDamage,
      expectedTotalDamage,
      cumulativeExpectedTotalDamage,
    }
  })
}
