import {
  buildGoldenglowFirstExplosionDistribution,
  type GoldenglowExplosionModel,
} from './goldenglowExplosion.ts'

export const MAX_GOLDENGLOW_SKILL_ATTACK_ROWS = 1000

export interface GoldenglowSkillAttackTableInput {
  model: Pick<GoldenglowExplosionModel, 'prdStep' | 'prdMaxStack'>
  attackInterval: number
  duration: number
  explosionDamage: number
}

export interface GoldenglowSkillAttackRow {
  attackNumber: number
  elapsedSeconds: number
  explosionChancePercent: number
  expectedExplosionCount: number
  expectedExplosionDamage: number
}

/**
 * Follows one drone from a reset, with its first attack one interval after t=0.
 * Only complete attacks within the duration are included. Each explosion starts
 * a new PRD cycle; normal attacks and other drones are not part of this table.
 */
export function buildGoldenglowSkillAttackTable(
  input: GoldenglowSkillAttackTableInput,
): GoldenglowSkillAttackRow[] {
  const { attackInterval, duration } = input
  if (
    !Number.isFinite(attackInterval)
    || attackInterval <= 0
    || !Number.isFinite(duration)
    || duration <= 0
  ) return []

  const distribution = buildGoldenglowFirstExplosionDistribution(input.model)
  if (distribution.length === 0) return []

  // Correct decimal boundary noise such as 0.3 / 0.1 = 2.9999999999999996.
  const opportunities = Math.min(MAX_GOLDENGLOW_SKILL_ATTACK_ROWS, duration / attackInterval)
  const nearestWhole = Math.round(opportunities)
  const tolerance = Number.EPSILON * Math.max(1, opportunities) * 8
  const attackCount = Math.abs(opportunities - nearestWhole) <= tolerance
    ? nearestWhole
    : Math.floor(opportunities)
  const explosionDamage = Number.isFinite(input.explosionDamage)
    ? Math.max(0, input.explosionDamage)
    : 0
  const rows: GoldenglowSkillAttackRow[] = []
  const explosionProbabilities: number[] = [0]
  let expectedExplosionCount = 0

  for (let attackNumber = 1; attackNumber <= attackCount; attackNumber += 1) {
    let explosionProbability = 0
    for (const firstExplosion of distribution) {
      if (firstExplosion.attackNumber > attackNumber) break
      const remainingAttacks = attackNumber - firstExplosion.attackNumber
      // An explosion now is either the first one or follows a previous reset.
      explosionProbability += firstExplosion.firstExplosionProbability
        * (remainingAttacks === 0 ? 1 : explosionProbabilities[remainingAttacks])
    }
    explosionProbabilities.push(explosionProbability)
    expectedExplosionCount += explosionProbability
    rows.push({
      attackNumber,
      elapsedSeconds: Math.min(duration, attackNumber * attackInterval),
      explosionChancePercent: explosionProbability * 100,
      expectedExplosionCount,
      expectedExplosionDamage: expectedExplosionCount * explosionDamage,
    })
  }

  return rows
}
