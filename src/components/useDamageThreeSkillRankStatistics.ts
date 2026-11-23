import { useEffect, useMemo, useState } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import type { DamageCell } from '../lib/damageThreeSkillRankMatrix'
import {
  evaluateSkillRankStatisticsStage, summarizeSkillRankStatistics, type SkillRankStatistics,
} from '../lib/damageThreeSkillRankStatistics'
import type { EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'

const EMPTY_THRESHOLDS: readonly EnemyResistanceThreshold[] = []

export function useDamageThreeSkillRankStatistics(
  active: boolean, entries: readonly DamageThreeAttributeEntry[], pairs: readonly EnemyResistanceThreshold[] = EMPTY_THRESHOLDS,
) {
  // A different enemy population can match the same resistance to a different defense.
  const cache = useMemo(() => new WeakMap<DamageThreeAttributeEntry, DamageCell[] | null>(), [pairs])
  const [result, setResult] = useState<{
    entries: readonly DamageThreeAttributeEntry[]; pairs: readonly EnemyResistanceThreshold[]; rows: SkillRankStatistics[]
  } | null>(null)
  const current = result?.entries === entries && result.pairs === pairs ? result.rows : null

  useEffect(() => {
    if (!active || !entries.length || !pairs.length || current) return
    let index = 0
    const stages: DamageCell[][] = []
    // Yield between small groups so typing or changing tabs can cancel an in-flight calculation.
    function calculateBatch() {
      const deadline = performance.now() + 10
      do {
        const entry = entries[index++]
        let cells = cache.get(entry)
        if (cells === undefined) {
          cells = evaluateSkillRankStatisticsStage(entry, pairs)
          cache.set(entry, cells)
        }
        if (cells) stages.push(cells)
      } while (index < entries.length && performance.now() < deadline)
      if (index < entries.length) {
        timer = window.setTimeout(calculateBatch, 0)
      } else {
        setResult({ entries, pairs, rows: summarizeSkillRankStatistics(pairs, stages) })
      }
    }
    let timer = window.setTimeout(calculateBatch, 0)
    return () => window.clearTimeout(timer)
  }, [active, entries, pairs, cache, current])
  return current
}
