import {
  buildGoldenglowFirstExplosionDistribution,
  getGoldenglowNextExplosionChancePercent,
  type GoldenglowExplosionModel,
} from './goldenglowExplosion.ts'
import { MAX_GOLDENGLOW_SKILL_ATTACK_ROWS } from './goldenglowSkillAttackTable.ts'

export interface GoldenglowAttackProbabilityState {
  consecutiveMisses: number
  lastExplosionAttackNumber: number | null
  stateProbability: number
  explosionChancePercent: number
  contributionProbability: number
}

export interface GoldenglowAttackProbabilityDetail {
  attackNumber: number
  states: GoldenglowAttackProbabilityState[]
  explosionChancePercent: number
}

/** Groups all histories by the PRD state immediately before one selected attack. */
export function buildGoldenglowAttackProbabilityDetail(
  model: Pick<GoldenglowExplosionModel, 'prdStep' | 'prdMaxStack'>,
  attackNumber: number,
): GoldenglowAttackProbabilityDetail | null {
  if (
    !Number.isInteger(attackNumber)
    || attackNumber < 1
    || attackNumber > MAX_GOLDENGLOW_SKILL_ATTACK_ROWS
    || buildGoldenglowFirstExplosionDistribution(model).length === 0
  ) return null

  const stateCount = Math.min(model.prdMaxStack + 1, attackNumber)
  const chances = Array.from({ length: stateCount }, (_, misses) => (
    getGoldenglowNextExplosionChancePercent(misses, model) / 100
  ))
  let probabilities: number[] = Array.from({ length: stateCount }, (_, misses) => misses === 0 ? 1 : 0)

  for (let priorAttack = 1; priorAttack < attackNumber; priorAttack += 1) {
    const next = Array.from({ length: stateCount }, () => 0)
    for (let misses = 0; misses < stateCount; misses += 1) {
      const probability = probabilities[misses]
      if (probability === 0) continue
      next[0] += probability * chances[misses]
      if (misses + 1 < stateCount) {
        next[misses + 1] += probability * (1 - chances[misses])
      }
    }
    probabilities = next
  }

  const states = probabilities.flatMap((stateProbability, consecutiveMisses) => {
    if (stateProbability <= 0) return []
    const lastExplosion = attackNumber - consecutiveMisses - 1
    return [{
      consecutiveMisses,
      lastExplosionAttackNumber: lastExplosion === 0 ? null : lastExplosion,
      stateProbability,
      explosionChancePercent: chances[consecutiveMisses] * 100,
      contributionProbability: stateProbability * chances[consecutiveMisses],
    }]
  })

  return {
    attackNumber,
    states,
    explosionChancePercent: states.reduce((sum, state) => sum + state.contributionProbability, 0) * 100,
  }
}
