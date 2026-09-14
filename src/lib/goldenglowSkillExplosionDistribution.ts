import { buildGoldenglowFirstExplosionDistribution, type GoldenglowExplosionModel } from './goldenglowExplosion.ts'
import { MAX_GOLDENGLOW_SKILL_ATTACK_ROWS } from './goldenglowSkillAttackTable.ts'
import { MAX_GOLDENGLOW_EXPLOSION_TRIALS } from './goldenglowExplosionSimulation.ts'

export interface GoldenglowSkillExplosionInput {
  model: Pick<GoldenglowExplosionModel, 'prdStep' | 'prdMaxStack'>
  attackCount: number
  droneCount: number
}

export interface GoldenglowDistributionRow {
  value: number
  theoreticalProbability: number
  observedCount: number
  observedProbability: number
}

function valid(input: GoldenglowSkillExplosionInput) {
  return Number.isInteger(input.attackCount) && input.attackCount >= 0 && input.attackCount <= MAX_GOLDENGLOW_SKILL_ATTACK_ROWS
    && Number.isInteger(input.droneCount) && input.droneCount >= 1 && input.droneCount <= 8
}

/** Renewal distribution for one drone, then convolution of independent drones. */
export function buildGoldenglowSkillExplosionDistribution(input: GoldenglowSkillExplosionInput): number[] {
  if (!valid(input)) return []
  const waiting = buildGoldenglowFirstExplosionDistribution(input.model)
  if (!waiting.length) return []
  const { attackCount, droneCount } = input
  const survival: number[] = Array.from({ length: attackCount + 1 }, (_, remaining) => remaining === 0 ? 1 : 0)
  let tail = 1
  for (let remaining = 1; remaining <= attackCount; remaining++) {
    // Product, rather than subtracting the CDF, preserves small nonnegative tail probabilities.
    tail *= 1 - (waiting[remaining - 1]?.explosionChancePercent ?? 100) / 100
    survival[remaining] = tail
  }
  let arrivals = new Float64Array(attackCount + 1)
  arrivals[0] = 1
  const oneDrone: number[] = []
  for (let count = 0; count <= attackCount; count++) {
    let probability = 0
    const next = new Float64Array(attackCount + 1)
    for (let elapsed = count; elapsed <= Math.min(attackCount, count * waiting.length); elapsed++) {
      if (arrivals[elapsed] === 0) continue
      probability += arrivals[elapsed] * survival[attackCount - elapsed]
      for (const row of waiting) {
        const nextElapsed = elapsed + row.attackNumber
        if (nextElapsed > attackCount) break
        next[nextElapsed] += arrivals[elapsed] * row.firstExplosionProbability
      }
    }
    oneDrone.push(probability)
    arrivals = next
  }
  let total = [1]
  for (let drone = 0; drone < droneCount; drone++) {
    const next = Array(total.length + oneDrone.length - 1).fill(0) as number[]
    total.forEach((left, i) => {
      if (left === 0) return
      oneDrone.forEach((right, j) => { if (right !== 0) next[i + j] += left * right })
    })
    total = next
  }
  return total
}

/** Samples the waiting time for each next explosion; this is equivalent to successive attack rolls. */
export function simulateGoldenglowSkillExplosions(
  input: GoldenglowSkillExplosionInput, trialCount: number, random: () => number = Math.random,
): GoldenglowDistributionRow[] {
  if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > MAX_GOLDENGLOW_EXPLOSION_TRIALS) return []
  const theory = buildGoldenglowSkillExplosionDistribution(input)
  if (!theory.length) return []
  const waiting = buildGoldenglowFirstExplosionDistribution(input.model)
  let cumulative = 0
  const cdf = waiting.map(row => (cumulative += row.firstExplosionProbability))
  cdf[cdf.length - 1] = 1
  const counts = theory.map(() => 0)
  for (let trial = 0; trial < trialCount; trial++) {
    let explosions = 0
    for (let drone = 0; drone < input.droneCount; drone++) {
      let elapsed = 0
      while (elapsed < input.attackCount) {
        const roll = random()
        if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('乱数は0以上1未満の有限値が必要です。')
        let low = 0, high = cdf.length - 1
        while (low < high) {
          const middle = Math.floor((low + high) / 2)
          if (roll < cdf[middle]) high = middle
          else low = middle + 1
        }
        elapsed += waiting[low].attackNumber
        if (elapsed <= input.attackCount) explosions++
      }
    }
    counts[explosions]++
  }
  return theory.map((theoreticalProbability, value) => ({
    value, theoreticalProbability, observedCount: counts[value], observedProbability: counts[value] / trialCount,
  }))
}
