import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildEnemySpawnPopulation, getEnemySkillVoteDetails, summarizeEnemySpawnAdvantage, summarizeOperatorVotes } from '../src/lib/damageThreeEnemySpawnAdvantage.ts'
import { projectEnemyOperatorVoteSummaries } from '../src/lib/damageThreeEnemySpawnVotesProjection.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import type { NamedSkillRankStageSample } from '../src/lib/damageThreeSkillRankStatistics.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'

function enemy(id: string, defense: number | null, magicResistance: number | null): EnemyRecord {
  return { id, stats: { defense, magicResistance } } as EnemyRecord
}

function sample(operatorId: string, cells: NamedSkillRankStageSample['cells'], stageLabel = '通常', skillIndex = 1): NamedSkillRankStageSample {
  return { skill: { operatorId, operatorName: operatorId, skillId: 'skill-' + skillIndex, skillIndex, skillName: 'S' + skillIndex },
    stageLabel, cells }
}

test('同じ敵の2値を保ち、同一組だけをまとめて欠測・出現なしを分ける', () => {
  const rows = [enemy('A', 0, 30), enemy('B', 0, 30), enemy('C', 300, 0),
    enemy('D', 0, null), enemy('E', null, 0), enemy('F', 400, 50)]
  const counts = { enemies: Object.fromEntries([2, 3, 1.5, 1, 4, 0].map((spawnCount, i) =>
    [rows[i].id, { spawnCount, mapCount: 1 }])) } as EnemyHistogramCounts
  assert.deepEqual(buildEnemySpawnPopulation(rows, counts), {
    pairs: [{ defense: 0, resistance: 30, spawnCount: 5 }, { defense: 300, resistance: 0, spawnCount: 1.5 }],
    spawnCount: 6.5, enemyCount: 3, missingSpawnCount: 5,
  })
  assert.deepEqual(buildEnemySpawnPopulation(rows, null), {
    pairs: [], spawnCount: 0, enemyCount: 0, missingSpawnCount: 0,
  })
})

test('実敵ごとに有効段階で1票を分け、出現回数を掛けた後に全体の得票を合計する', () => {
  const pairs = [{ defense: 199, resistance: 0, spawnCount: 8 }, { defense: 1000, resistance: 20, spawnCount: 3 }]
  const physical = { physical: 2, arts: 1 }, arts = { physical: 1, arts: 2 }
  const tie = { physical: 2, arts: 2 + 1e-10 }, missing = { physical: null, arts: 1 }
  const stats = summarizeEnemySpawnAdvantage(pairs, [sample('A', [physical, arts]), sample('A', [tie, missing]),
    sample('B', [arts, physical]), sample('C', [missing, { physical: 1, arts: Infinity }])])
  assert.equal(stats.skillCount, 2)
  assert.equal(stats.stageCount, 3)
  assert.deepEqual(stats.rows.map(row => row.spawnCount), [11, 8, 0, 0, 3])
  assert.deepEqual(stats.rows[0].skill, { physicalWins: 7, ties: 4, artsWins: 11, count: 22 })
  assert.deepEqual(stats.rows[0].stage, { physicalWins: 11, ties: 8, artsWins: 11, count: 30 })
  assert.deepEqual(stats.rows[2].skill, { physicalWins: 0, ties: 0, artsWins: 0, count: 0 })
  // A: (8 × 1/2) / 11, B: 3 / 11. C has no comparable enemy.
  assert.deepEqual(stats.skillPhysicalRateBins.map(bin => bin.count), [0, 0, 1, 1, 0, 0, 0, 0, 0, 0])
  assert.equal(summarizeEnemySpawnAdvantage(pairs, []).rows[0].skill.count, 0)
})

test('物理優勢率は下限を含む10ポイント幅で数え、100%も最終階級に含める', () => {
  const win = { physical: 2, arts: 1 }, tie = { physical: 1, arts: 1 }
  const pairs = Array.from({ length: 10 }, (_, i) => ({ defense: i, resistance: 0, spawnCount: 1 }))
  const stages = Array.from({ length: 11 }, (_, wins) =>
    sample(String(wins), pairs.map((_, index) => index < wins ? win : tie)))
  const { skillPhysicalRateBins } = summarizeEnemySpawnAdvantage(pairs, stages)
  assert.deepEqual(skillPhysicalRateBins, pairs.map((_, index) => ({
    lower: index * 10, upper: (index + 1) * 10, count: index === 9 ? 2 : 1,
  })))
})

test('敵ごとに段階、スキルの順で等しく平均し、比較可能な出現回数で全体と防御力帯を加重平均する', () => {
  const pairs = [
    { defense: 200, resistance: 0, spawnCount: 2 },
    { defense: 500, resistance: 20, spawnCount: 4 },
    { defense: 250, resistance: 10, spawnCount: 1 },
    { defense: 1000, resistance: 50, spawnCount: 2 },
  ]
  const noArts = { physical: 100, arts: null }, noPhysical = { physical: null, arts: 100 }
  const zero = { physical: 0, arts: 0 }
  const stages = [
    sample('A', [{ physical: 0, arts: 20 }, noArts, noArts, zero]),
    sample('A', [{ physical: 40, arts: 100 }, { physical: 30, arts: 60 }, noPhysical, noArts]),
    sample('B', [{ physical: 100, arts: 0 }, noPhysical, noPhysical, noArts]),
  ]
  const { rows } = summarizeEnemySpawnAdvantage(pairs, stages)
  assert.deepEqual(rows.map(row => row.spawnCount), [9, 0, 3, 4, 2])
  // For DEF 200, A contributes (20, 60) and B contributes (100, 0).
  // DEF 250 has no comparable stage; DEF 1000 has a valid zero for both attributes.
  assert.deepEqual(rows.map(row => row.meanDamage), [
    { physical: 30, arts: 37.5, spawnCount: 8 },
    null,
    { physical: 60, arts: 30, spawnCount: 2 },
    { physical: 30, arts: 60, spawnCount: 4 },
    { physical: 0, arts: 0, spawnCount: 2 },
  ])
  assert.ok(summarizeEnemySpawnAdvantage(pairs, []).rows.every(row => row.meanDamage === null))
})

test('オペレーター別の票と段階ごとの内訳を、同一スキルID・欠測を含む集計でも照合できる', () => {
  const pairs = [{ defense: 100, resistance: 20, spawnCount: 647 }, { defense: 0, resistance: 0, spawnCount: 901 }]
  const physical = { physical: 120, arts: 100 }, arts = { physical: 80, arts: 100 }
  const tie = { physical: 100, arts: 100.000000001 }, missing = { physical: null, arts: 0 }
  const a1 = sample('A', [physical, missing], '本人')
  const a2 = sample('A', [arts, tie], '召喚物')
  const stats = summarizeEnemySpawnAdvantage(pairs, [a1, a2, sample('A', [missing, physical], '通常', 2),
    sample('B', [physical, missing]), sample('C', [missing, missing])])
  assert.deepEqual(stats.operators.map(op => op.operatorId), ['A', 'B'])
  const [operatorA, operatorB] = stats.operators
  assert.deepEqual(operatorA.skills.map(skill => [skill.skillIndex, skill.skillName]), [[1, 'S1'], [2, 'S2']])
  assert.notEqual(operatorA.skills[0].key, operatorB.skills[0].key)
  assert.equal(operatorA.skills[0].stages[0], a1)
  assert.deepEqual(operatorA.skills[0].votes, { physicalWins: 323.5, ties: 901, artsWins: 323.5, count: 1548 })
  assert.deepEqual(operatorA.votes, { physicalWins: 1224.5, ties: 901, artsWins: 323.5, count: 2449 })
  assert.deepEqual(operatorB.votes, { physicalWins: 647, ties: 0, artsWins: 0, count: 647 })
  for (const field of ['physicalWins', 'ties', 'artsWins', 'count'] as const) {
    assert.equal(operatorA.votes[field] + operatorB.votes[field], stats.rows[0].skill[field])
  }
  assert.deepEqual(getEnemySkillVoteDetails(operatorA.skills[0], 0, 647), [
    { stageLabel: '本人', ...physical, outcome: 'physicalWins', votesPerSpawn: 0.5, weightedVotes: 323.5 },
    { stageLabel: '召喚物', ...arts, outcome: 'artsWins', votesPerSpawn: 0.5, weightedVotes: 323.5 },
  ])
  assert.deepEqual(getEnemySkillVoteDetails(operatorA.skills[0], 1, 901), [
    { stageLabel: '召喚物', ...tie, outcome: 'ties', votesPerSpawn: 1, weightedVotes: 901 },
  ])
  assert.deepEqual(getEnemySkillVoteDetails(operatorB.skills[0], 1, 901), [])
})

test('一覧の絞り込みではスキル全体の得票を加算し、段階の一部だけを選んだら再集計する', () => {
  const pairs = [{ defense: 0, resistance: 10, spawnCount: 3 }]
  const win = { physical: 2, arts: 1 }, tie = { physical: 1, arts: 1 }
  const a1 = sample('A', [win]), a2 = sample('A', [tie], '召喚物')
  const aOther = sample('A', [tie], '通常', 2), b = sample('B', [win])
  const stages = [a1, a2, aOther, b]
  const summary = (samples: typeof stages) => summarizeEnemySpawnAdvantage(pairs, samples).operators.map(summarizeOperatorVotes)
  const saved = summary(stages)
  const entries = stages.map(({ skill }) => ({ skill, capability: { supported: true } }))
  const unsupported = { skill: a1.skill, capability: { supported: false } }
  const all = [...entries, unsupported]
  assert.deepEqual(projectEnemyOperatorVoteSummaries(saved, all, entries), saved)
  assert.deepEqual(projectEnemyOperatorVoteSummaries(saved, all, entries.slice(0, 2)), summary([a1, a2]))
  assert.deepEqual(projectEnemyOperatorVoteSummaries(saved, all, [entries[2], entries[3]]), summary([aOther, b]))
  assert.equal(projectEnemyOperatorVoteSummaries(saved, all, [entries[0], entries[3]]), null)
  assert.deepEqual(projectEnemyOperatorVoteSummaries(saved, all, [unsupported]), [])
  assert.deepEqual(projectEnemyOperatorVoteSummaries(saved, all, []), [])
})

test('丸め前の率を用い、スキルごとに比較不能な敵を分母から除く', () => {
  const win = { physical: 2, arts: 1 }, tie = { physical: 1, arts: 1 }, missing = { physical: null, arts: 0 }
  const pairs = [{ defense: 0, resistance: 10, spawnCount: 9.999 }, { defense: 10, resistance: 0, spawnCount: 90.001 }]
  const stages = [sample('9.999%', [win, tie]), sample('100%', [win, missing]), sample('対象なし', [missing, missing])]
  const stats = summarizeEnemySpawnAdvantage(pairs, stages)
  assert.deepEqual(stats.skillPhysicalRateBins.map(bin => bin.count), [1, 0, 0, 0, 0, 0, 0, 0, 0, 1])
  assert.equal(stats.skillCount, 2)
  const empty = summarizeEnemySpawnAdvantage(pairs, [sample('対象なし', [missing, missing])])
  assert.ok(empty.skillPhysicalRateBins.every(bin => bin.count === 0))
})

test('端数の段階票を合計してちょうど10%になるスキルは10%以上に数える', () => {
  const win = { physical: 2, arts: 1 }, tie = { physical: 1, arts: 1 }, missing = { physical: null, arts: 1 }
  const pairs = [1, 1, 1, 1, 1, 1, 14].map((spawnCount, defense) => ({ defense, resistance: 0, spawnCount }))
  const thirds = Array.from({ length: 3 }, (_, stage) =>
    sample('six-thirds', pairs.map((_, pair) => stage === 0 && pair < 6 ? win : tie)))
  // The first four pairs contribute 1/2 + 1/3 + 1/6 + 1 = 2 physical wins over 20 spawns.
  const validStages = [2, 3, 6, 1, 1, 1, 1]
  const mixed = Array.from({ length: 6 }, (_, stage) =>
    sample('mixed', validStages.map((count, pair) => {
      if (stage >= count) return missing
      return stage === 0 && pair < 4 ? win : tie
    })))
  const stats = summarizeEnemySpawnAdvantage(pairs, [...thirds, ...mixed])
  assert.deepEqual(stats.skillPhysicalRateBins.map(bin => bin.count), [0, 2, 0, 0, 0, 0, 0, 0, 0, 0])
})

test('敵データv12のメインストーリーで対象数・組数・防御帯別の出現数を再現する', async () => {
  const client = createEnemyAggregationClient({ fetch: async path => {
    const file = String(path).replace(/^\//, '')
    return new Response(await readFile(new URL('../public/' + file, import.meta.url)))
  } })
  const version = (await client.loadIndex()).versions.find(item => item.id === 'v12')!
  const data = getEnemyMainStoryScope(await client.loadVersion(version))
  const population = buildEnemySpawnPopulation(data.rows, data.counts)
  assert.deepEqual([population.enemyCount, population.spawnCount, population.missingSpawnCount, population.pairs.length],
    [272, 11409, 201, 136])
  assert.deepEqual(summarizeEnemySpawnAdvantage(population.pairs, []).rows.map(row => row.spawnCount),
    [11409, 7384, 2834, 669, 522])
})
