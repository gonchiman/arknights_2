import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildEnemySpawnPopulation, summarizeEnemySpawnAdvantage } from '../src/lib/damageThreeEnemySpawnAdvantage.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import type { SkillRankStageSample } from '../src/lib/damageThreeSkillRankStatistics.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'

function enemy(id: string, defense: number | null, magicResistance: number | null): EnemyRecord {
  return { id, stats: { defense, magicResistance } } as EnemyRecord
}

function sample(operatorId: string, cells: SkillRankStageSample['cells']): SkillRankStageSample {
  return { skill: { operatorId, skillId: operatorId + '-skill', skillIndex: 1 }, cells }
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
