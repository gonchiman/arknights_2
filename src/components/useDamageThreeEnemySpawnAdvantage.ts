import { useEffect, useMemo, useState } from 'react'
import savedDefault from '../data/damageThreeEnemySpawnDefault.json'
import type { SkillRecord } from '../types/skill'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import { summarizeEnemySpawnAdvantage, type EnemySpawnPopulation } from '../lib/damageThreeEnemySpawnAdvantage'
import { getEnemySpawnSkillDataHash } from '../lib/damageThreeEnemySpawnInputs'
import type { EnemyAggregationVersion } from '../lib/enemyAggregationContract'
import { useDamageThreeSkillStageSamples } from './useDamageThreeSkillRankStatistics'

const EMPTY_PAIRS: EnemySpawnPopulation['pairs'] = []
const skillDataHashes = new WeakMap<readonly SkillRecord[], Promise<string | null>>()

// A matching enemy archive can still be paired with newer operator data at runtime.
export function useEnemySpawnDefaultSummary(
  eligible: boolean, rows: readonly SkillRecord[], version: EnemyAggregationVersion | null,
) {
  const checkSkills = eligible && savedDefault.skillDataSha256 !== '' && version?.id === savedDefault.aggregationVersion
    && version.payloadSha256 === savedDefault.aggregationPayloadSha256
  const [checked, setChecked] = useState<{ rows: readonly SkillRecord[]; hash: string | null } | null>(null)
  useEffect(() => {
    if (!checkSkills || checked?.rows === rows) return
    let active = true
    let request = skillDataHashes.get(rows)
    if (!request) {
      request = getEnemySpawnSkillDataHash(rows).catch(() => null)
      skillDataHashes.set(rows, request)
    }
    void request.then(hash => { if (active) setChecked({ rows, hash }) })
    return () => { active = false }
  }, [checkSkills, rows, checked])
  if (!checkSkills) return null
  if (checked?.rows !== rows) return 'checking'
  return checked.hash === savedDefault.skillDataSha256 ? savedDefault.statistics : null
}

export function useDamageThreeEnemySpawnAdvantage(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], population: EnemySpawnPopulation | null | undefined,
  effectPolicy: SkillRankEffectPolicy,
) {
  const stages = useDamageThreeSkillStageSamples(active, entries, population?.pairs ?? EMPTY_PAIRS, effectPolicy)
  return useMemo(() => active && population && stages ? summarizeEnemySpawnAdvantage(population.pairs, stages) : null,
    [active, population, stages])
}
