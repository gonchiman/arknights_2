import { calculateDamageBreakdown, type DamageCalculationBreakdown } from './damageCalculator.ts'
import { getGoldenglowDroneAttackScalePercent, type GoldenglowExplosionModel } from './goldenglowExplosion.ts'
import { buildGoldenglowSkillAttackTable } from './goldenglowSkillAttackTable.ts'

export interface GoldenglowNormalAttackTableInput {
  model: Pick<GoldenglowExplosionModel,
    | 'prdStep'
    | 'prdMaxStack'
    | 'droneInitialAttackScale'
    | 'droneAttackScaleStep'
    | 'droneMaxAttackScale'
    | 'droneMaxStack'
  >
  attack: number
  attackInterval: number
  duration: number
  resistance: number
  resistanceIgnore: number
}

export interface GoldenglowNormalAttackRow {
  attackNumber: number
  elapsedSeconds: number
  attackScalePercent: number
  explosionChancePercent: number
  normalChancePercent: number
  damage: DamageCalculationBreakdown
  expectedNormalDamage: number
  cumulativeExpectedNormalDamage: number
}

/**
 * One newly attacking drone stays on the same enemy for the whole window.
 * An explosion replaces that attack and resets PRD, but the trait's attack
 * scale continues to advance with attack opportunities rather than PRD misses.
 */
export function buildGoldenglowNormalAttackTable(
  input: GoldenglowNormalAttackTableInput,
): GoldenglowNormalAttackRow[] {
  const { model, attack, resistance, resistanceIgnore } = input
  if (
    ![attack, resistance, resistanceIgnore, model.droneInitialAttackScale,
      model.droneAttackScaleStep, model.droneMaxAttackScale].every(isNonNegativeFinite)
    || !Number.isInteger(model.droneMaxStack)
    || model.droneMaxStack < 0
    || model.droneInitialAttackScale > model.droneMaxAttackScale
    || !Number.isFinite(model.droneMaxAttackScale * 100)
    || !Number.isFinite(attack * model.droneMaxAttackScale)
  ) return []

  const explosionRows = buildGoldenglowSkillAttackTable({
    model,
    attackInterval: input.attackInterval,
    duration: input.duration,
    explosionDamage: 0,
  })
  let cumulativeExpectedNormalDamage = 0

  return explosionRows.map((row) => {
    const attackScalePercent = getGoldenglowDroneAttackScalePercent(row.attackNumber, model)
    const normalProbability = Math.min(1, Math.max(0, 1 - row.explosionChancePercent / 100))
    const damage = calculateDamageBreakdown(attack * (attackScalePercent / 100), 'ARTS', 0, resistance, {
      resistanceIgnoreFixed: resistanceIgnore,
    })
    const expectedNormalDamage = damage.result * normalProbability
    cumulativeExpectedNormalDamage += expectedNormalDamage

    return {
      attackNumber: row.attackNumber,
      elapsedSeconds: row.elapsedSeconds,
      attackScalePercent,
      explosionChancePercent: row.explosionChancePercent,
      normalChancePercent: normalProbability * 100,
      damage,
      expectedNormalDamage,
      cumulativeExpectedNormalDamage,
    }
  })
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}
