import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import { buildEnemyRatingComparison } from '../src/lib/enemyRatingComparison.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'

const row = (id: string, defense: number | null, magicResistance: number | null) => (
  { id, stats: { defense, magicResistance } } as EnemyRecord
)

test('uses each metric’s valid count, rating boundaries and requested weight', () => {
  const rows = [row('a', 1199, 59), row('b', 1200, 60), row('c', null, 90),
    row('d', 5000, NaN), row('e', 5001, 90.1), row('a', 0, 0)]
  const counts: EnemyHistogramCounts = {
    schemaVersion: 1,
    generatedAt: '2026-11-10T00:00:00Z',
    sourceGeneratedAt: null,
    summary: { mapCount: 7, missingMapCount: 0, spawnMapCount: 7, spawnExcludedMapCount: 0 },
    enemies: {
      a: { mapCount: 2, spawnCount: 13 },
      b: { mapCount: 3, spawnCount: 3 },
      c: { mapCount: 1, spawnCount: 4 },
      d: { mapCount: 1, spawnCount: 5 },
      e: { mapCount: 1, spawnCount: 2 },
    },
  }
  const result = buildEnemyRatingComparison(rows, 'SPAWNS', counts)
  assert.equal(result.hasData, true)
  assert.deepEqual(result.totals, {
    defense: { valid: 23, missing: 4 },
    magicResistance: { valid: 22, missing: 5 },
  })
  const a = result.rows.find(({ rank }) => rank === 'A')!.stats
  assert.deepEqual(a.defense, { count: 13, share: 13 / 23, cumulativeCount: 13, cumulativeShare: 13 / 23,
    range: '1,000以上 1,200未満', cumulativeRange: '1,200未満' })
  assert.deepEqual(a.magicResistance, { count: 13, share: 13 / 22, cumulativeCount: 13, cumulativeShare: 13 / 22,
    range: '50以上 60未満', cumulativeRange: '60未満' })
  const plus = result.rows.find(({ rank }) => rank === 'S+')!.stats
  assert.equal(plus.defense.count, 5)
  assert.equal(plus.magicResistance.count, 4)
  assert.equal(plus.defense.cumulativeRange, '5,000以下')
  assert.equal(plus.magicResistance.cumulativeRange, '90以下')
  assert.equal(result.rows[0].stats.defense.cumulativeShare, 0)
  assert.equal(result.rows.at(-1)!.stats.magicResistance.cumulativeShare, 1)

  const maps = buildEnemyRatingComparison(rows.slice(0, 2), 'MAPS', counts)
  assert.equal(maps.rows.find(({ rank }) => rank === 'A')!.stats.defense.share, 2 / 5)
  const types = buildEnemyRatingComparison(rows.slice(0, 2), 'TYPES', null)
  assert.equal(types.rows.find(({ rank }) => rank === 'A')!.stats.defense.share, 1 / 2)
})

test('preserves empty ranks and distinguishes an unavailable series from a zero share', () => {
  const rows = [row('one', null, 0)]
  const result = buildEnemyRatingComparison(rows, 'TYPES', null)
  assert.equal(result.hasData, true)
  assert.equal(result.rows.length, 10)
  assert.equal(result.rows[0].stats.magicResistance.share, 1)
  assert.equal(result.rows[1].stats.magicResistance.share, 0)
  assert.equal(result.rows[1].stats.defense.share, null)
  assert.equal(result.rows[1].stats.defense.cumulativeCount, null)
  assert.equal(buildEnemyRatingComparison(rows, 'SPAWNS', null).hasData, false)
})

test('reproduces the unequal rank-A cumulative counts behind the rounded v11 main-story percentages', async () => {
  const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const { versions } = await client.loadIndex()
  const v11 = versions.find(({ id }) => id === 'v11')
  assert.ok(v11)
  const { rows, counts } = getEnemyMainStoryScope(await client.loadVersion(v11))
  const result = buildEnemyRatingComparison(rows, 'SPAWNS', counts)
  assert.equal(result.totals.defense.valid, 11_409)
  assert.equal(result.totals.magicResistance.valid, 11_409)
  const a = result.rows.find(({ rank }) => rank === 'A')!.stats
  assert.equal(a.defense.cumulativeCount, 10_982)
  assert.equal(a.magicResistance.cumulativeCount, 10_988)
})
