import { useEffect, useMemo, useState } from 'react'
import savedDefault from '../data/damageThreeEnemySpawnDefault.json'
import type { SkillRecord } from '../types/skill'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import { summarizeEnemySpawnAdvantage, summarizeOperatorVotes, type EnemyOperatorVoteSummary, type EnemySpawnPopulation } from '../lib/damageThreeEnemySpawnAdvantage'
import { getEnemySpawnSkillDataHash } from '../lib/damageThreeEnemySpawnInputs'
import type { EnemyAggregationVersion } from '../lib/enemyAggregationContract'
import { calculateStageSamples, runSkillCalculationBatches, useDamageThreeSkillStageSamples } from './useDamageThreeSkillRankStatistics'

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

function* calculateOperatorVoteSummaries(
  entries: readonly DamageThreeAttributeEntry[], pairs: EnemySpawnPopulation['pairs'], policy: SkillRankEffectPolicy,
): Generator<void, EnemyOperatorVoteSummary[]> {
  const byOperator = new Map<string, DamageThreeAttributeEntry[]>()
  for (const entry of entries) {
    const id = entry.skill.operatorId
    const group = byOperator.get(id)
    if (group) group.push(entry)
    else byOperator.set(id, [entry])
  }
  const summaries: EnemyOperatorVoteSummary[] = []
  // Drop the stage-by-enemy matrices after each operator. Only expanded details need to retain them.
  for (const group of byOperator.values()) {
    const stages = yield* calculateStageSamples(group, pairs, policy)
    const [operator] = summarizeEnemySpawnAdvantage(pairs, stages).operators
    if (operator) summaries.push(summarizeOperatorVotes(operator))
    yield
  }
  return summaries
}

export function useLiveEnemyOperatorVoteSummaries(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], population: EnemySpawnPopulation | null | undefined,
  effectPolicy: SkillRankEffectPolicy,
) {
  const pairs = population?.pairs ?? EMPTY_PAIRS
  const [result, setResult] = useState<{
    entries: typeof entries; pairs: typeof pairs; policy: SkillRankEffectPolicy; summaries: EnemyOperatorVoteSummary[]
  } | null>(null)
  const current = result?.entries === entries && result.pairs === pairs && result.policy === effectPolicy ? result.summaries : null
  useEffect(() => {
    if (!active || current) return
    return runSkillCalculationBatches(calculateOperatorVoteSummaries(entries, pairs, effectPolicy),
      summaries => setResult({ entries, pairs, policy: effectPolicy, summaries }))
  }, [active, current, entries, pairs, effectPolicy])
  return current
}
