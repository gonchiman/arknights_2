import {
  buildGoldenglowFirstExplosionDistribution,
  type GoldenglowExplosionModel,
  type GoldenglowFirstExplosionRow,
} from './goldenglowExplosion.ts'

export interface GoldenglowExplosionSimulationRow extends GoldenglowFirstExplosionRow {
  observedCount: number
  observedProbability: number
}

export const MAX_GOLDENGLOW_EXPLOSION_TRIALS = 100_000

/** Each trial starts with a fresh drone and ends at its first explosion, without a skill time limit. */
export function simulateGoldenglowFirstExplosion(
  model: Pick<GoldenglowExplosionModel, 'prdStep' | 'prdMaxStack'>,
  trialCount: number,
  random: () => number = Math.random,
): GoldenglowExplosionSimulationRow[] {
  if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > MAX_GOLDENGLOW_EXPLOSION_TRIALS) return []
  const distribution = buildGoldenglowFirstExplosionDistribution(model)
  if (distribution.length === 0) return []
  const counts = distribution.map(() => 0)
  for (let trial = 0; trial < trialCount; trial++) {
    for (let index = 0; index < distribution.length; index++) {
      const roll = random()
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
        throw new RangeError('乱数は0以上1未満の有限値が必要です。')
      }
      // These are conditional chances, not the unconditional first-explosion probabilities.
      if (roll < distribution[index].explosionChancePercent / 100) {
        counts[index]++
        break
      }
    }
  }
  return distribution.map((row, index) => ({
    ...row,
    observedCount: counts[index],
    observedProbability: counts[index] / trialCount,
  }))
}
