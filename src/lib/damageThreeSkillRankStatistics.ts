import type { DamageThreeAttributeEntry } from './damageCalculatorThreeAttributeComparison.ts'
import { evaluateDamageThreeSkillRankRow, type DamageCell, type SkillRankEffectPolicy } from './damageThreeSkillRankMatrix.ts'
import type { EnemyResistanceThreshold } from './enemyDefenseResistance.ts'
import { calculateBoxPlotStatistics } from './enemyStatistics.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'

interface DamageQuartiles {
  q1: number
  median: number
  q3: number
}

export type AdvantageUnit = 'skill' | 'stage'

interface AdvantageVotes {
  physicalWins: number
  ties: number
  artsWins: number
}

export interface SkillRankStatistics extends AdvantageVotes {
  resistance: number
  defense: number | null
  count: number
  physical: DamageQuartiles | null
  arts: DamageQuartiles | null
  bySkill: AdvantageVotes & { count: number }
}

export interface SkillRankStageSample {
  skill: Pick<DamageThreeAttributeEntry['skill'], 'operatorId' | 'skillId' | 'skillIndex'>
  cells: readonly DamageCell[]
}

function outcome(physical: number, arts: number): keyof AdvantageVotes {
  const tolerance = 1e-9 * Math.max(1, Math.abs(physical), Math.abs(arts))
  if (Math.abs(physical - arts) <= tolerance) return 'ties'
  return physical > arts ? 'physicalWins' : 'artsWins'
}

function quartiles(values: number[]): DamageQuartiles | null {
  const box = calculateBoxPlotStatistics(values)
  return box && { q1: box.firstQuartile, median: box.median, q3: box.thirdQuartile }
}

export function evaluateSkillRankStatisticsStage(
  entry: DamageThreeAttributeEntry,
  pairs: readonly EnemyResistanceThreshold[],
  effectPolicy: SkillRankEffectPolicy | boolean = 'apply',
) {
  if (entry.kind !== 'NORMAL' || !entry.capability.supported) return null
  return evaluateDamageThreeSkillRankRow(entry, pairs, 'virtual', effectPolicy).cells
}

export function summarizeSkillRankStatistics(
  pairs: readonly EnemyResistanceThreshold[],
  stages: Iterable<SkillRankStageSample>,
): SkillRankStatistics[] {
  const samples = pairs.map(({ resistance, defense }) => ({
    resistance, defense, physical: [] as number[], arts: [] as number[],
    stageVotes: { physicalWins: 0, ties: 0, artsWins: 0 },
    skills: new Map<string, AdvantageVotes>(),
  }))
  for (const { skill, cells } of stages) {
    const skillKey = createSkillJsonSelectionKey(skill)
    cells.forEach(({ physical, arts }, index) => {
      const sample = samples[index]
      if (!sample || sample.defense === null || physical === null || arts === null
        || !Number.isFinite(physical) || !Number.isFinite(arts) || physical < 0 || arts < 0) return
      sample.physical.push(physical)
      sample.arts.push(arts)
      let votes = sample.skills.get(skillKey)
      if (!votes) {
        votes = { physicalWins: 0, ties: 0, artsWins: 0 }
        sample.skills.set(skillKey, votes)
      }
      const result = outcome(physical, arts)
      votes[result]++
      sample.stageVotes[result]++
    })
  }
  return samples.map(({ resistance, defense, physical, arts, stageVotes, skills }) => {
    const bySkill = { count: skills.size, physicalWins: 0, ties: 0, artsWins: 0 }
    for (const votes of skills.values()) {
      const validStages = votes.physicalWins + votes.ties + votes.artsWins
      bySkill.physicalWins += votes.physicalWins / validStages
      bySkill.ties += votes.ties / validStages
      bySkill.artsWins += votes.artsWins / validStages
    }
    return { resistance, defense, count: physical.length, physical: quartiles(physical),
      arts: quartiles(arts), ...stageVotes, bySkill }
  })
}
