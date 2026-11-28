import { useEffect, useMemo, useState } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { EnemyDamageStatPair } from '../lib/damageCalculatorThreeAttributeTables'
import type { SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import {
  evaluateSkillRankStageSample, evaluateSkillRankStatisticsStage, summarizeSkillRankStatistics, type NamedSkillRankStageSample,
} from '../lib/damageThreeSkillRankStatistics'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'

const EMPTY_THRESHOLDS: readonly EnemyResistanceThreshold[] = []
const EMPTY_STAGES: readonly NamedSkillRankStageSample[] = []
const PAIRS_PER_BATCH = 12

type StageCache = WeakMap<DamageThreeAttributeEntry, NamedSkillRankStageSample | null>

export function* calculateStageSamples(
  entries: readonly DamageThreeAttributeEntry[], pairs: readonly EnemyDamageStatPair[],
  effectPolicy: SkillRankEffectPolicy, cache?: StageCache,
): Generator<void, NamedSkillRankStageSample[]> {
  const stages: NamedSkillRankStageSample[] = []
  for (const entry of entries) {
    let stage = cache?.get(entry)
    if (stage === undefined) {
      stage = evaluateSkillRankStageSample(entry, pairs.slice(0, PAIRS_PER_BATCH), effectPolicy)
      if (stage && pairs.length > PAIRS_PER_BATCH) {
        const cells = [...stage.cells]
        for (let start = PAIRS_PER_BATCH; start < pairs.length; start += PAIRS_PER_BATCH) {
          yield
          const batch = evaluateSkillRankStatisticsStage(entry, pairs.slice(start, start + PAIRS_PER_BATCH), effectPolicy)
          if (batch) cells.push(...batch)
        }
        stage = { ...stage, cells }
      }
      cache?.set(entry, stage)
    }
    if (stage) stages.push(stage)
    yield
  }
  return stages
}

export function runSkillCalculationBatches<T>(calculation: Generator<void, T>, onComplete: (result: T) => void) {
  function runBatch() {
    const deadline = performance.now() + 10
    do {
      const step = calculation.next()
      if (step.done) {
        onComplete(step.value)
        return
      }
    } while (performance.now() < deadline)
    timer = window.setTimeout(runBatch, 0)
  }
  let timer = window.setTimeout(runBatch, 0)
  return () => window.clearTimeout(timer)
}

export function useDamageThreeSkillRankStatistics(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], pairs: readonly EnemyResistanceThreshold[] = EMPTY_THRESHOLDS,
  effectPolicy: SkillRankEffectPolicy,
) {
  const stages = useDamageThreeSkillStageSamples(active, entries, pairs, effectPolicy)
  return useMemo(() => stages && entries.length && pairs.length ? summarizeSkillRankStatistics(pairs, stages) : null,
    [stages, entries, pairs])
}

export function useDamageThreeSkillStageSamples(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], pairs: readonly EnemyDamageStatPair[],
  effectPolicy: SkillRankEffectPolicy,
): readonly NamedSkillRankStageSample[] | null {
  // Cache identity ties both intermediate cells and the summary to the current combat conditions.
  const cache = useMemo((): StageCache => new WeakMap(), [pairs, effectPolicy])
  const [result, setResult] = useState<{
    entries: readonly DamageThreeAttributeEntry[]; cache: typeof cache; stages: NamedSkillRankStageSample[]
  } | null>(null)
  const current = result?.entries === entries && result.cache === cache ? result.stages : null

  useEffect(() => {
    if (!active || !entries.length || !pairs.length || current) return
    return runSkillCalculationBatches(calculateStageSamples(entries, pairs, effectPolicy, cache),
      stages => setResult({ entries, cache, stages }))
  }, [active, entries, pairs, cache, current, effectPolicy])
  return entries.length && pairs.length ? current : EMPTY_STAGES
}
