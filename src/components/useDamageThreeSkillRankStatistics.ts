import { useEffect, useMemo, useState } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { DamageCell, SkillRankEffectPolicy } from '../lib/damageThreeSkillRankMatrix'
import {
  evaluateSkillRankStatisticsStage, summarizeSkillRankStatistics, type SkillRankStageSample, type SkillRankStatistics,
} from '../lib/damageThreeSkillRankStatistics'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'

const EMPTY_THRESHOLDS: readonly EnemyResistanceThreshold[] = []

export function useDamageThreeSkillRankStatistics(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], pairs: readonly EnemyResistanceThreshold[] = EMPTY_THRESHOLDS,
  effectPolicy: SkillRankEffectPolicy,
) {
  // Cache identity ties both intermediate cells and the summary to the current combat conditions.
  const cache = useMemo(() => new WeakMap<DamageThreeAttributeEntry, DamageCell[] | null>(), [pairs, effectPolicy])
  const [result, setResult] = useState<{
    entries: readonly DamageThreeAttributeEntry[]; cache: typeof cache; rows: SkillRankStatistics[]
  } | null>(null)
  const current = result?.entries === entries && result.cache === cache ? result.rows : null

  useEffect(() => {
    if (!active || !entries.length || !pairs.length || current) return
    let index = 0
    const stages: SkillRankStageSample[] = []
    // Yield between small groups so typing or changing tabs can cancel an in-flight calculation.
    function calculateBatch() {
      const deadline = performance.now() + 10
      do {
        const entry = entries[index++]
        let cells = cache.get(entry)
        if (cells === undefined) {
          cells = evaluateSkillRankStatisticsStage(entry, pairs, effectPolicy)
          cache.set(entry, cells)
        }
        if (cells) stages.push({ skill: entry.skill, cells })
      } while (index < entries.length && performance.now() < deadline)
      if (index < entries.length) {
        timer = window.setTimeout(calculateBatch, 0)
      } else {
        setResult({ entries, cache, rows: summarizeSkillRankStatistics(pairs, stages) })
      }
    }
    let timer = window.setTimeout(calculateBatch, 0)
    return () => window.clearTimeout(timer)
  }, [active, entries, pairs, cache, current, effectPolicy])
  return current
}
