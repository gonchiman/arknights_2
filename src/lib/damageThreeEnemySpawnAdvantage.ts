import type { EnemyRecord } from '../types/enemy.ts'
import { getEnemyCountWeight, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { getAdvantageOutcome, isComparableDamage, type AdvantageVotes, type SkillRankStageSample } from './damageThreeSkillRankStatistics.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'

interface EnemySpawnStatPair {
  defense: number
  resistance: number
  spawnCount: number
}

export interface EnemySpawnPopulation {
  pairs: EnemySpawnStatPair[]
  enemyCount: number
  spawnCount: number
  missingSpawnCount: number
}

export function buildEnemySpawnPopulation(rows: readonly EnemyRecord[], counts: EnemyHistogramCounts | null): EnemySpawnPopulation {
  const pairsByStats = new Map<string, EnemySpawnStatPair>()
  let enemyCount = 0, spawnCount = 0, missingSpawnCount = 0
  for (const { id, stats } of rows) {
    const weight = getEnemyCountWeight(id, 'SPAWNS', counts)
    if (weight <= 0) continue
    const { defense, magicResistance: resistance } = stats
    if (defense === null || resistance === null || !Number.isFinite(defense) || !Number.isFinite(resistance)) {
      missingSpawnCount += weight
      continue
    }
    enemyCount++
    spawnCount += weight
    const key = JSON.stringify([defense, resistance])
    const pair = pairsByStats.get(key)
    if (pair) pair.spawnCount += weight
    else pairsByStats.set(key, { defense, resistance, spawnCount: weight })
  }
  return { pairs: [...pairsByStats.values()], enemyCount, spawnCount, missingSpawnCount }
}

type WeightedVotes = AdvantageVotes & { count: number }

export interface EnemySpawnAdvantageRow {
  label: string
  spawnCount: number
  skill: WeightedVotes
  stage: WeightedVotes
}

export interface EnemySpawnAdvantageStatistics {
  rows: EnemySpawnAdvantageRow[]
  skillCount: number
  stageCount: number
}

const defenseBands = [
  { label: '200未満', upper: 200 }, { label: '200〜499', upper: 500 },
  { label: '500〜999', upper: 1000 }, { label: '1,000以上', upper: Infinity },
] as const

function emptyVotes(): WeightedVotes {
  return { physicalWins: 0, ties: 0, artsWins: 0, count: 0 }
}

function addVotes(target: WeightedVotes, source: WeightedVotes, weight = 1) {
  target.physicalWins += source.physicalWins * weight
  target.ties += source.ties * weight
  target.artsWins += source.artsWins * weight
  target.count += source.count * weight
}

export function summarizeEnemySpawnAdvantage(
  pairs: readonly EnemySpawnStatPair[], stages: readonly SkillRankStageSample[],
): EnemySpawnAdvantageStatistics {
  const rows = ['全体', ...defenseBands.map(band => band.label)].map(label => ({
    label, spawnCount: 0, skill: emptyVotes(), stage: emptyVotes(),
  }))
  const bandRows = pairs.map(({ defense, spawnCount }) => {
    const row = rows[1 + defenseBands.findIndex(band => defense < band.upper)]
    row.spawnCount += spawnCount
    return row
  })

  const skills = new Map<string, SkillRankStageSample[]>()
  for (const stage of stages) {
    if (!stage.cells.some(isComparableDamage)) continue
    const key = createSkillJsonSelectionKey(stage.skill)
    const group = skills.get(key)
    if (group) group.push(stage)
    else skills.set(key, [stage])
  }
  let stageCount = 0
  for (const group of skills.values()) {
    stageCount += group.length
    pairs.forEach(({ spawnCount }, index) => {
      const votes = emptyVotes()
      for (const { cells } of group) {
        const cell = cells[index]
        if (!cell || !isComparableDamage(cell)) continue
        votes[getAdvantageOutcome(cell.physical, cell.arts)]++
        votes.count++
      }
      if (!votes.count) return
      const band = bandRows[index]
      addVotes(band.stage, votes, spawnCount)
      // Each skill shares one vote among the valid stages for this particular enemy.
      addVotes(band.skill, votes, spawnCount / votes.count)
    })
  }
  const [overall, ...bands] = rows
  for (const band of bands) {
    overall.spawnCount += band.spawnCount
    addVotes(overall.skill, band.skill)
    addVotes(overall.stage, band.stage)
  }
  return { rows, skillCount: skills.size, stageCount }
}
