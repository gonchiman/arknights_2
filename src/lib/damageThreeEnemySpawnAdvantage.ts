import type { EnemyRecord } from '../types/enemy.ts'
import { getEnemyCountWeight, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { calculateWeightedPercentile } from './enemyWeightedHistogram.ts'
import { getAdvantageOutcome, isComparableDamage, type AdvantageVotes, type NamedSkillRankStageSample } from './damageThreeSkillRankStatistics.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'
import { getProfessionLabel, PROFESSION_ORDER } from './operatorFilters.ts'

interface EnemySpawnStatPair {
  defense: number
  resistance: number
  spawnCount: number
  eliteBossSpawnCount?: number
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
  for (const { id, stats, levelType } of rows) {
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
    const pair = pairsByStats.get(key) ?? { defense, resistance, spawnCount: 0, eliteBossSpawnCount: 0 }
    pair.spawnCount += weight
    if (levelType === 'ELITE' || levelType === 'BOSS') {
      pair.eliteBossSpawnCount = (pair.eliteBossSpawnCount ?? 0) + weight
    }
    pairsByStats.set(key, pair)
  }
  return { pairs: [...pairsByStats.values()], enemyCount, spawnCount, missingSpawnCount }
}

export type WeightedVotes = AdvantageVotes & { count: number }

export interface EnemySkillVoteSummary {
  key: string
  skillIndex: number
  skillName: string
  votes: WeightedVotes
}

export interface EnemySkillVotes extends EnemySkillVoteSummary {
  stages: readonly NamedSkillRankStageSample[]
}

export interface EnemyOperatorVoteSummary {
  operatorId: string
  operatorName: string
  skills: EnemySkillVoteSummary[]
  votes: WeightedVotes
}

export interface EnemyOperatorVotes extends EnemyOperatorVoteSummary {
  skills: EnemySkillVotes[]
}

export function summarizeOperatorVotes({ operatorId, operatorName, votes, skills }: EnemyOperatorVotes): EnemyOperatorVoteSummary {
  return { operatorId, operatorName, votes, skills: skills.map(({ key, skillIndex, skillName, votes }) => ({
    key, skillIndex, skillName, votes,
  })) }
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

export type EnemyOutlierScope = 'all' | 'eliteBoss'
export interface EnemyOutlierRow extends Pick<EnemySpawnAdvantageRow, 'label' | 'spawnCount' | 'skill' | 'stage'> {
  spawnShare: number | null
}

interface EnemyOutlierStatistics extends Record<EnemyOutlierScope, EnemyOutlierRow[]> {
  defenseFence: number | null
  resistanceFence: number | null
}

export type SkillPhysicalRateBin = { lower: number; upper: number; count: number }

export interface EnemyAdvantageCategoryRow {
  key: string
  label: string
  skillCount: number
  stageCount: number
  skill: WeightedVotes
  stage: WeightedVotes
}

export interface EnemySpawnAdvantageStatistics {
  rows: EnemySpawnAdvantageRow[]
  outliers: EnemyOutlierStatistics
  professionRows: EnemyAdvantageCategoryRow[]
  rarityRows: EnemyAdvantageCategoryRow[]
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

function createCategoryRow(key: string, label: string): EnemyAdvantageCategoryRow {
  return { key, label, skillCount: 0, stageCount: 0, skill: emptyVotes(), stage: emptyVotes() }
}

function getCategoryRow(rows: Map<string, EnemyAdvantageCategoryRow>, key: string) {
  const row = rows.get(key) ?? rows.get('UNKNOWN')
  if (row) return row
  const unknown = createCategoryRow('UNKNOWN', '不明')
  rows.set(unknown.key, unknown)
  return unknown
}

function addVotes(target: WeightedVotes, source: WeightedVotes, weight = 1) {
  target.physicalWins += source.physicalWins * weight
  target.ties += source.ties * weight
  target.artsWins += source.artsWins * weight
  target.count += source.count * weight
}

export function sumEnemySkillVotes(skills: readonly EnemySkillVoteSummary[]): WeightedVotes {
  const total = emptyVotes()
  for (const skill of skills) addVotes(total, skill.votes)
  return total
}

function upperOutlierFence(pairs: readonly EnemySpawnStatPair[], field: 'defense' | 'resistance') {
  const observations = pairs.map(pair => ({ value: pair[field], weight: pair.spawnCount }))
  const q1 = calculateWeightedPercentile(observations, 25)
  const q3 = calculateWeightedPercentile(observations, 75)
  return q1 === null || q3 === null ? null : q3 + 1.5 * (q3 - q1)
}

function summarizeOutliers(
  pairs: readonly EnemySpawnStatPair[], pairVotes: readonly { skill: WeightedVotes; stage: WeightedVotes }[],
): EnemyOutlierStatistics {
  const defenseFence = upperOutlierFence(pairs, 'defense')
  const resistanceFence = upperOutlierFence(pairs, 'resistance')
  const labels = ['全体', '① 両方', '② 防御力のみ', '③ 術耐性のみ', '④ どちらも該当せず']
  const createRows = (): EnemyOutlierRow[] => labels.map(label => ({
    label, spawnCount: 0, spawnShare: null, skill: emptyVotes(), stage: emptyVotes(),
  }))
  const all = createRows(), eliteBoss = createRows()
  if (defenseFence !== null && resistanceFence !== null) {
    pairs.forEach((pair, index) => {
      const highDefense = pair.defense > defenseFence
      const highResistance = pair.resistance > resistanceFence
      const rowIndex = highDefense ? (highResistance ? 1 : 2) : (highResistance ? 3 : 4)
      const votes = pairVotes[index]
      for (const [row, weight] of [[all[rowIndex], pair.spawnCount], [eliteBoss[rowIndex], pair.eliteBossSpawnCount ?? 0]] as const) {
        row.spawnCount += weight
        addVotes(row.skill, votes.skill, weight)
        addVotes(row.stage, votes.stage, weight)
      }
    })
    for (const [total, ...groups] of [all, eliteBoss]) {
      for (const row of groups) {
        total.spawnCount += row.spawnCount
        addVotes(total.skill, row.skill)
        addVotes(total.stage, row.stage)
      }
      if (total.spawnCount > 0) {
        for (const row of [total, ...groups]) row.spawnShare = row.spawnCount / total.spawnCount
      }
    }
  }
  return { defenseFence, resistanceFence, all, eliteBoss }
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
    return { band, skillCount: 0, physicalSkillSum: 0, artsSkillSum: 0, skill: emptyVotes(), stage: emptyVotes() }
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
  const professions = new Map<string, EnemyAdvantageCategoryRow>(PROFESSION_ORDER.map(key =>
    [key, createCategoryRow(key, getProfessionLabel(key))]))
  const rarities = new Map([6, 5, 4, 3, 2, 1].map(rarity =>
    [String(rarity), createCategoryRow(String(rarity), '★' + rarity)] as const))
  for (const [key, group] of skills) {
    stageCount += group.length
    const winsByStageCount = new Map<number, number>()
    const skillVotes = emptyVotes()
    const stageVotes = emptyVotes()
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
      // Keep one spawn's votes so both enemy scopes can reuse the same stage comparisons.
      addVotes(pair.stage, votes)
      addVotes(pair.skill, votes, 1 / votes.count)
      pair.physicalSkillSum += physical / votes.count
      pair.artsSkillSum += arts / votes.count
      pair.skillCount++
      const { band } = pair
      addVotes(band.stage, votes, spawnCount)
      addVotes(stageVotes, votes, spawnCount)
      // Each skill shares one vote among the valid stages for this particular enemy.
      const stageWeight = spawnCount / votes.count
      addVotes(band.skill, votes, stageWeight)
      addVotes(skillVotes, votes, stageWeight)
      const weightedWins = spawnCount * votes.physicalWins
      winsByStageCount.set(votes.count, (winsByStageCount.get(votes.count) ?? 0) + weightedWins)
      comparableSpawns += spawnCount
    })
    if (comparableSpawns > 0) {
      const { operatorId, operatorName, skillIndex, skillName, profession, rarity } = group[0].skill
      let operator = operators.get(operatorId)
      if (!operator) {
        operator = { operatorId, operatorName, skills: [], votes: emptyVotes() }
        operators.set(operatorId, operator)
      }
      skillVotes.count = comparableSpawns
      for (const row of [getCategoryRow(professions, profession ?? 'UNKNOWN'), getCategoryRow(rarities, String(rarity))]) {
        row.skillCount++
        row.stageCount += group.length
        addVotes(row.skill, skillVotes)
        addVotes(row.stage, stageVotes)
      }
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
  return {
    rows: resultRows, outliers: summarizeOutliers(pairs, pairTotals),
    professionRows: [...professions.values()], rarityRows: [...rarities.values()],
    skillCount: skills.size, stageCount, skillPhysicalRateBins, operators: [...operators.values()],
  }
}
