import type { DamageThreeAttributeEntry } from './damageCalculatorThreeAttributeComparison.ts'
import { evaluateDamageThreeSkillRankRow, type DamageCell } from './damageThreeSkillRankMatrix.ts'
import type { EnemyResistanceThreshold } from './enemyDefenseResistance.ts'
import { calculateBoxPlotStatistics } from './enemyStatistics.ts'

interface DamageQuartiles {
  q1: number
  median: number
  q3: number
}

export interface SkillRankStatistics {
  resistance: number
  defense: number | null
  count: number
  physical: DamageQuartiles | null
  arts: DamageQuartiles | null
  physicalWins: number
  ties: number
  artsWins: number
}

function quartiles(values: number[]): DamageQuartiles | null {
  const box = calculateBoxPlotStatistics(values)
  return box && { q1: box.firstQuartile, median: box.median, q3: box.thirdQuartile }
}

export function evaluateSkillRankStatisticsStage(
  entry: DamageThreeAttributeEntry,
  pairs: readonly EnemyResistanceThreshold[],
) {
  if (entry.kind !== 'NORMAL' || !entry.capability.supported) return null
  return evaluateDamageThreeSkillRankRow(entry, pairs, 'virtual').cells
}

export function summarizeSkillRankStatistics(
  pairs: readonly EnemyResistanceThreshold[],
  stages: Iterable<readonly DamageCell[]>,
): SkillRankStatistics[] {
  const samples = pairs.map(({ resistance, defense }) => ({
    resistance, defense, physical: [] as number[], arts: [] as number[], physicalWins: 0, ties: 0,
  }))
  for (const cells of stages) {
    cells.forEach(({ physical, arts }, index) => {
      const sample = samples[index]
      if (!sample || sample.defense === null || physical === null || arts === null
        || !Number.isFinite(physical) || !Number.isFinite(arts) || physical < 0 || arts < 0) return
      sample.physical.push(physical)
      sample.arts.push(arts)
      const tolerance = 1e-9 * Math.max(1, Math.abs(physical), Math.abs(arts))
      if (Math.abs(physical - arts) <= tolerance) sample.ties++
      else if (physical > arts) sample.physicalWins++
    })
  }
  return samples.map(({ resistance, defense, physical, arts, physicalWins, ties }) => ({
    resistance,
    defense,
    count: physical.length,
    physical: quartiles(physical),
    arts: quartiles(arts),
    physicalWins,
    ties,
    artsWins: physical.length - physicalWins - ties,
  }))
}
