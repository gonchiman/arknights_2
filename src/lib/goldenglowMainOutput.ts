import type { DamageSensitivityMetric } from './damageSensitivity.ts'
import {
  calculateGoldenglowExplosionDamage,
  calculateGoldenglowExpectedDpsFromModel,
  type GoldenglowExpectedDpsMode,
  type GoldenglowExplosionModel,
  type GoldenglowResistanceDamageRowsInput,
} from './goldenglowExplosion.ts'

export interface GoldenglowMainOutputRow {
  resistance: number
  mainDamage: number | null
  droneDamage: number | null
  explosionDamage: number | null
  combinedDamage: number | null
  minimumReached: boolean
}

export interface GoldenglowMainOutputTable {
  mode: GoldenglowExpectedDpsMode
  metric: DamageSensitivityMetric
  droneCount: number
  mainAttackEnabled: boolean
  duration: number | null
  rows: GoldenglowMainOutputRow[]
}

export interface GoldenglowMainOutputInput extends GoldenglowResistanceDamageRowsInput {
  metric: DamageSensitivityMetric
}

/** Project the existing explosion model into average-per-attack, DPS, or total columns. */
export function buildGoldenglowMainOutputTable(
  input: GoldenglowMainOutputInput,
): GoldenglowMainOutputTable | null {
  if (
    !hasUsableModel(input.model)
    || ![1, 2, 3].includes(input.skillIndex)
    || !Number.isFinite(input.effectiveAttack) || input.effectiveAttack < 0
    || !Number.isFinite(input.attackInterval) || input.attackInterval <= 0
    || (input.skillIndex !== 2 && (!Number.isFinite(input.duration) || input.duration <= 0))
    || input.enemyResistances.length === 0
    || input.enemyResistances.some((resistance) => !Number.isFinite(resistance) || resistance < 0)
  ) return null

  let table: GoldenglowMainOutputTable | null = null
  for (const resistance of input.enemyResistances) {
    const expectation = calculateGoldenglowExpectedDpsFromModel({
      model: input.model,
      skillIndex: input.skillIndex,
      effectiveAttack: input.effectiveAttack,
      attackInterval: input.attackInterval,
      duration: input.duration,
      enemyResistance: resistance,
    })
    if (!expectation) return null

    table ??= {
      mode: expectation.mode,
      metric: input.metric,
      droneCount: expectation.model.activeDroneCount,
      mainAttackEnabled: expectation.body.active,
      duration: expectation.duration,
      rows: [],
    }

    // S3 retains a nonzero body.damagePerAttack, so project the active body's DPS instead.
    const factor = input.metric === 'DAMAGE' ? expectation.attackInterval : 1
    const total = input.metric === 'TOTAL'
    const combinedDamage = total
      ? expectation.combinedExpectedTotalDamage
      : expectation.expectedDps * factor
    const explosion = calculateGoldenglowExplosionDamage(
      input.effectiveAttack, 0, resistance, input.model,
    )
    const minimumDamage = explosion.breakdown.minimumDamage
    const tolerance = minimumDamage === null
      ? 0
      : Number.EPSILON * Math.max(1, explosion.rawExplosionDamage, minimumDamage) * 32

    table.rows.push({
      resistance,
      mainDamage: total ? expectation.body.expectedTotalDamage : expectation.body.dps * factor,
      droneDamage: total
        ? expectation.allDrones.expectedNormalDamage
        : expectation.allDrones.normalDps * factor,
      explosionDamage: total
        ? expectation.allDrones.expectedExplosionDamage
        : expectation.allDrones.explosionDps * factor,
      combinedDamage,
      minimumReached: combinedDamage !== null
        && minimumDamage !== null && minimumDamage > 0
        && explosion.damageAfterMitigation <= minimumDamage + tolerance,
    })
  }
  return table
}

function hasUsableModel(model: GoldenglowExplosionModel): boolean {
  return Boolean(model)
    && [model.attackScale, model.prdStep].every((value) => Number.isFinite(value) && value > 0)
    && [model.activeDroneCount, model.prdMaxStack].every((value) => Number.isInteger(value) && value > 0)
    && [model.droneInitialAttackScale, model.droneAttackScaleStep, model.droneMaxAttackScale,
      model.resistanceIgnoreFixed].every((value) => Number.isFinite(value) && value >= 0)
    && model.droneMaxAttackScale >= model.droneInitialAttackScale
    && Number.isInteger(model.droneMaxStack) && model.droneMaxStack >= 0
}
