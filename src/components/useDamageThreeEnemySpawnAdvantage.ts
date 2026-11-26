import { useMemo } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import { summarizeEnemySpawnAdvantage, type EnemySpawnPopulation } from '../lib/damageThreeEnemySpawnAdvantage'
import { useDamageThreeSkillStageSamples } from './useDamageThreeSkillRankStatistics'

const EMPTY_PAIRS: EnemySpawnPopulation['pairs'] = []

export function useDamageThreeEnemySpawnAdvantage(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], population: EnemySpawnPopulation | null | undefined,
  effectPolicy: SkillRankEffectPolicy,
) {
  const stages = useDamageThreeSkillStageSamples(active, entries, population?.pairs ?? EMPTY_PAIRS, effectPolicy)
  return useMemo(() => active && population && stages ? summarizeEnemySpawnAdvantage(population.pairs, stages) : null,
    [active, population, stages])
}
