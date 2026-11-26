import { useEffect, useMemo, useState } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { EnemyDamageStatPair } from '../lib/damageCalculatorThreeAttributeTables'
import type { DamageCell, SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import {
  evaluateSkillRankStatisticsStage, summarizeSkillRankStatistics, type SkillRankStageSample,
} from '../lib/damageThreeSkillRankStatistics'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'

const EMPTY_THRESHOLDS: readonly EnemyResistanceThreshold[] = []
const EMPTY_STAGES: readonly SkillRankStageSample[] = []
const PAIRS_PER_BATCH = 12

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
): readonly SkillRankStageSample[] | null {
  // Cache identity ties both intermediate cells and the summary to the current combat conditions.
  const cache = useMemo(() => new WeakMap<DamageThreeAttributeEntry, DamageCell[] | null>(), [pairs, effectPolicy])
  const [result, setResult] = useState<{
    entries: readonly DamageThreeAttributeEntry[]; cache: typeof cache; stages: SkillRankStageSample[]
  } | null>(null)
  const current = result?.entries === entries && result.cache === cache ? result.stages : null

  useEffect(() => {
    if (!active || !entries.length || !pairs.length || current) return
    let index = 0
    let partialCells: DamageCell[] = []
    const stages: SkillRankStageSample[] = []
    // Actual enemy populations can have hundreds of pairs even for a single stage.
    function calculateBatch() {
      const deadline = performance.now() + 10
      do {
        const entry = entries[index]
        let cells = cache.get(entry)
        if (cells === undefined) {
          const start = partialCells.length
          const chunk = pairs.length <= PAIRS_PER_BATCH ? pairs : pairs.slice(start, start + PAIRS_PER_BATCH)
          cells = evaluateSkillRankStatisticsStage(entry, chunk, effectPolicy)
          if (cells && chunk !== pairs) {
            partialCells.push(...cells)
            if (partialCells.length < pairs.length) continue
            cells = partialCells
          }
          cache.set(entry, cells)
        }
        if (cells) stages.push({ skill: entry.skill, cells })
        partialCells = []
        index++
      } while (index < entries.length && performance.now() < deadline)
      if (index < entries.length) {
        timer = window.setTimeout(calculateBatch, 0)
      } else {
        setResult({ entries, cache, stages })
      }
    }
    let timer = window.setTimeout(calculateBatch, 0)
    return () => window.clearTimeout(timer)
  }, [active, entries, pairs, cache, current, effectPolicy])
  return entries.length && pairs.length ? current : EMPTY_STAGES
}
