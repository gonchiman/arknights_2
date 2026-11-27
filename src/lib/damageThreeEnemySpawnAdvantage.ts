import type { EnemyRecord } from '../types/enemy.ts'
import { getEnemyCountWeight, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { getAdvantageOutcome, isComparableDamage, type AdvantageVotes, type NamedSkillRankStageSample } from './damageThreeSkillRankStatistics.ts'
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

export type WeightedVotes = AdvantageVotes & { count: number }

export interface EnemySkillVotes {
  key: string
  skillIndex: number
  skillName: string
  votes: WeightedVotes
  stages: readonly NamedSkillRankStageSample[]
}

export interface EnemyOperatorVotes {
  operatorId: string
  operatorName: string
  skills: EnemySkillVotes[]
  votes: WeightedVotes
}

export function getEnemySkillVoteDetails(skill: EnemySkillVotes, pairIndex: number, spawnCount: number) {
  const comparable = skill.stages.flatMap(({ stageLabel, cells }) => {
    const cell = cells[pairIndex]
    if (!cell || !isComparableDamage(cell)) return []
    return [{ stageLabel, physical: cell.physical, arts: cell.arts, outcome: getAdvantageOutcome(cell.physical, cell.arts) }]
  })
  return comparable.map(stage => ({
    ...stage, votesPerSpawn: 1 / comparable.length, weightedVotes: spawnCount / comparable.length,
  }))
}

export interface EnemySpawnAdvantageRow {
  label: string
  spawnCount: number
  skill: WeightedVotes
  stage: WeightedVotes
  meanDamage: { physical: number; arts: number; spawnCount: number } | null
}

export type SkillPhysicalRateBin = { lower: number; upper: number; count: number }

export interface EnemySpawnAdvantageStatistics {
  rows: EnemySpawnAdvantageRow[]
  skillCount: number
  stageCount: number
  skillPhysicalRateBins: SkillPhysicalRateBin[]
  operators: EnemyOperatorVotes[]
}

const SKILL_RATE_BIN_WIDTH = 10

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
  pairs: readonly EnemySpawnStatPair[], stages: readonly NamedSkillRankStageSample[],
): EnemySpawnAdvantageStatistics {
  const rows = ['全体', ...defenseBands.map(band => band.label)].map(label => ({
    label, spawnCount: 0, skill: emptyVotes(), stage: emptyVotes(),
    weightedDamage: { physical: 0, arts: 0, spawnCount: 0 },
  }))
  const pairTotals = pairs.map(({ defense, spawnCount }) => {
    const band = rows[1 + defenseBands.findIndex(band => defense < band.upper)]
    band.spawnCount += spawnCount
    return { band, skillCount: 0, physicalSkillSum: 0, artsSkillSum: 0 }
  })

  const skills = new Map<string, NamedSkillRankStageSample[]>()
  for (const stage of stages) {
    if (!stage.cells.some(isComparableDamage)) continue
    const key = createSkillJsonSelectionKey(stage.skill)
    const group = skills.get(key)
    if (group) group.push(stage)
    else skills.set(key, [stage])
  }
  const skillPhysicalRateBins = Array.from({ length: 100 / SKILL_RATE_BIN_WIDTH }, (_, index) => ({
    lower: index * SKILL_RATE_BIN_WIDTH, upper: (index + 1) * SKILL_RATE_BIN_WIDTH, count: 0,
  }))
  let stageCount = 0
  const operators = new Map<string, EnemyOperatorVotes>()
  for (const [key, group] of skills) {
    stageCount += group.length
    const winsByStageCount = new Map<number, number>()
    const skillVotes = emptyVotes()
    let comparableSpawns = 0
    pairs.forEach(({ spawnCount }, index) => {
      const votes = emptyVotes()
      let physical = 0, arts = 0
      for (const { cells } of group) {
        const cell = cells[index]
        if (!cell || !isComparableDamage(cell)) continue
        votes[getAdvantageOutcome(cell.physical, cell.arts)]++
        votes.count++
        physical += cell.physical
        arts += cell.arts
      }
      if (!votes.count) return
      const pair = pairTotals[index]
      pair.physicalSkillSum += physical / votes.count
      pair.artsSkillSum += arts / votes.count
      pair.skillCount++
      const { band } = pair
      addVotes(band.stage, votes, spawnCount)
      // Each skill shares one vote among the valid stages for this particular enemy.
      const stageWeight = spawnCount / votes.count
      addVotes(band.skill, votes, stageWeight)
      addVotes(skillVotes, votes, stageWeight)
      const weightedWins = spawnCount * votes.physicalWins
      winsByStageCount.set(votes.count, (winsByStageCount.get(votes.count) ?? 0) + weightedWins)
      comparableSpawns += spawnCount
    })
    if (comparableSpawns > 0) {
      const { operatorId, operatorName, skillIndex, skillName } = group[0].skill
      let operator = operators.get(operatorId)
      if (!operator) {
        operator = { operatorId, operatorName, skills: [], votes: emptyVotes() }
        operators.set(operatorId, operator)
      }
      skillVotes.count = comparableSpawns
      operator.skills.push({ key, skillIndex, skillName, votes: skillVotes, stages: group })
      addVotes(operator.votes, skillVotes)
      // Combine the stage fractions before dividing so six 1/3 votes count as exactly two.
      let numerator = 0, denominator = 1
      for (const [validStages, weightedWins] of winsByStageCount) {
        numerator = numerator * validStages + weightedWins * denominator
        denominator *= validStages
      }
      const binIndex = Math.floor(numerator * skillPhysicalRateBins.length / (denominator * comparableSpawns))
      skillPhysicalRateBins[Math.min(binIndex, skillPhysicalRateBins.length - 1)].count++
    }
  }
  const [overall, ...bands] = rows
  pairTotals.forEach(({ band, skillCount, physicalSkillSum, artsSkillSum }, index) => {
    if (!skillCount) return
    const { spawnCount } = pairs[index]
    // Average the skills for this enemy before weighting it by how often it appears.
    for (const { weightedDamage } of [overall, band]) {
      weightedDamage.physical += physicalSkillSum / skillCount * spawnCount
      weightedDamage.arts += artsSkillSum / skillCount * spawnCount
      weightedDamage.spawnCount += spawnCount
    }
  })
  for (const band of bands) {
    overall.spawnCount += band.spawnCount
    addVotes(overall.skill, band.skill)
    addVotes(overall.stage, band.stage)
  }
  const resultRows = rows.map(({ weightedDamage, ...row }) => {
    const { physical, arts, spawnCount } = weightedDamage
    return { ...row, meanDamage: spawnCount > 0 ? { physical: physical / spawnCount, arts: arts / spawnCount, spawnCount } : null }
  })
  return { rows: resultRows, skillCount: skills.size, stageCount, skillPhysicalRateBins, operators: [...operators.values()] }
}
