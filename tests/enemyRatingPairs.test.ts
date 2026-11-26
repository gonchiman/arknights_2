import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import { buildEnemyRatingPairs } from '../src/lib/enemyRatingPairs.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'

function enemy(id: string, defense: number | null, magicResistance: number | null): EnemyRecord {
  return { id, stats: { defense, magicResistance } } as EnemyRecord
}

test('同一敵の実測値を判定し、A+の境界と0を含め、欠測と出現なしを区別する', () => {
  const zero = enemy('zero', 0, 0)
  const rows = [zero, zero, enemy('high-defense', 1200, 59), enemy('high-resistance', 1199, 60),
    enemy('missing', 1200, null), enemy('invalid', NaN, 60), enemy('unseen', 1200, 60)]
  const counts = { enemies: {
    zero: { spawnCount: 4, mapCount: 2 },
    'high-defense': { spawnCount: 1.5, mapCount: 1 },
    'high-resistance': { spawnCount: 3, mapCount: 2 },
    missing: { spawnCount: 5, mapCount: 1 },
    invalid: { spawnCount: 6, mapCount: 1 },
  } } as EnemyHistogramCounts
  const spawns = buildEnemyRatingPairs(rows, counts, 'SPAWNS', 'threshold')
  assert.deepEqual(spawns, { labels: ['A以下', 'A+以上'], cells: [[4, 1.5], [3, 0]],
    defenseTotals: [7, 1.5], resistanceTotals: [5.5, 3], total: 8.5, missing: 11 })
  assert.deepEqual(buildEnemyRatingPairs(rows, counts, 'MAPS', 'threshold').cells, [[2, 1], [2, 0]])
  assert.deepEqual(buildEnemyRatingPairs(rows, null, 'TYPES', 'threshold').cells, [[1, 1], [1, 1]])
  assert.equal(buildEnemyRatingPairs(rows, null, 'SPAWNS', 'rating').total, 0)
})

test('敵集計v12のメインストーリーで10×10と2×2の出現回数が一致する', async () => {
  const client = createEnemyAggregationClient({ fetch: async path =>
    new Response(await readFile(new URL('../public' + path, import.meta.url))) })
  const version = (await client.loadIndex()).versions.find(entry => entry.id === 'v12')!
  const { rows, counts } = getEnemyMainStoryScope(await client.loadVersion(version))
  const full = buildEnemyRatingPairs(rows, counts, 'SPAWNS', 'rating')
  const grouped = buildEnemyRatingPairs(rows, counts, 'SPAWNS', 'threshold')
  assert.deepEqual(full.labels, ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'])
  assert.deepEqual([full.total, full.missing, full.cells[6][6]], [11409, 201, 184])
  assert.deepEqual(grouped.cells, [[10859, 129], [123, 298]])
  assert.deepEqual(grouped.defenseTotals, [10982, 427])
  assert.deepEqual(grouped.resistanceTotals, [10988, 421])
  assert.equal(grouped.total, full.total)
  const collapsed = [[0, 0], [0, 0]]
  full.cells.forEach((values, row) => values.forEach((value, column) => {
    collapsed[Number(row >= 6)][Number(column >= 6)] += value
  }))
  assert.deepEqual(collapsed, grouped.cells)
})
