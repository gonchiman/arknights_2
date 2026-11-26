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
  function sample(operatorId: string, cells: SkillRankStageSample['cells']): SkillRankStageSample {
    return { skill: { operatorId, skillId: operatorId + '-skill', skillIndex: 1 }, cells }
  }
  const stats = summarizeEnemySpawnAdvantage(pairs, [sample('A', [physical, arts]), sample('A', [tie, missing]),
    sample('B', [arts, physical]), sample('C', [missing, { physical: 1, arts: Infinity }])])
  assert.equal(stats.skillCount, 2)
  assert.equal(stats.stageCount, 3)
  assert.deepEqual(stats.rows.map(row => row.spawnCount), [11, 8, 0, 0, 3])
  assert.deepEqual(stats.rows[0].skill, { physicalWins: 7, ties: 4, artsWins: 11, count: 22 })
  assert.deepEqual(stats.rows[0].stage, { physicalWins: 11, ties: 8, artsWins: 11, count: 30 })
  assert.deepEqual(stats.rows[2].skill, { physicalWins: 0, ties: 0, artsWins: 0, count: 0 })
  assert.equal(summarizeEnemySpawnAdvantage(pairs, []).rows[0].skill.count, 0)
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
