import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnemyDefenseResistanceBands } from '../src/lib/enemyDefenseResistance.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'

const row = (id: string, defense: number | null, magicResistance: number | null) =>
  ({ id, stats: { defense, magicResistance } }) as EnemyRecord

function counts(spawns: Record<string, number>): EnemyHistogramCounts {
  return {
    schemaVersion: 1, generatedAt: '', sourceGeneratedAt: null,
    summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
    enemies: Object.fromEntries(Object.entries(spawns).map(([id, spawnCount]) => [id, { spawnCount, mapCount: 1 }])),
  }
}

test('同一の有効な敵集合を出現回数で重み付けし、同値がまたがる帯に両方表示する', () => {
  const rows = [
    row('a', 600, 50), row('b', 600, 20), row('c', 300, 20), row('d', 0, 0),
    row('a', 600, 50), row('missingDefense', null, 95), row('missingResistance', 9999, null),
    row('zeroWeight', 9999, 95), row('noCount', 9999, 95),
  ]
  const { total, bands, resistanceThresholds } = buildEnemyDefenseResistanceBands(rows,
    counts({ a: 3.5, b: 2.5, c: 2.25, d: 1.75, missingDefense: 100, missingResistance: 100, zeroWeight: 0 }))
  assert.equal(total, 10)
  assert.deepEqual(bands, [
    { from: 0, to: 10, defense: { min: 600, max: 600 }, resistance: { min: 50, max: 50 } },
    { from: 10, to: 20, defense: { min: 600, max: 600 }, resistance: { min: 50, max: 50 } },
    { from: 20, to: 30, defense: { min: 600, max: 600 }, resistance: { min: 50, max: 50 } },
    { from: 30, to: 40, defense: { min: 600, max: 600 }, resistance: { min: 20, max: 50 } },
    { from: 40, to: 50, defense: { min: 600, max: 600 }, resistance: { min: 20, max: 20 } },
    { from: 50, to: 60, defense: { min: 600, max: 600 }, resistance: { min: 20, max: 20 } },
    { from: 60, to: 70, defense: { min: 300, max: 300 }, resistance: { min: 20, max: 20 } },
    { from: 70, to: 80, defense: { min: 300, max: 300 }, resistance: { min: 20, max: 20 } },
    { from: 80, to: 90, defense: { min: 0, max: 300 }, resistance: { min: 0, max: 20 } },
    { from: 90, to: 100, defense: { min: 0, max: 0 }, resistance: { min: 0, max: 0 } },
  ])
  assert.deepEqual(resistanceThresholds, [
    { resistance: 0, percentage: 100, rankCutoff: 10, defense: 0 },
    { resistance: 10, percentage: 82.5, rankCutoff: 8.25, defense: 300 },
    { resistance: 20, percentage: 82.5, rankCutoff: 8.25, defense: 300 },
    { resistance: 30, percentage: 35, rankCutoff: 3.5, defense: 600 },
    { resistance: 40, percentage: 35, rankCutoff: 3.5, defense: 600 },
    { resistance: 50, percentage: 35, rankCutoff: 3.5, defense: 600 },
    { resistance: 60, percentage: 0, rankCutoff: 0, defense: null },
    { resistance: 70, percentage: 0, rankCutoff: 0, defense: null },
    { resistance: 80, percentage: 0, rankCutoff: 0, defense: null },
    { resistance: 90, percentage: 0, rankCutoff: 0, defense: null },
    { resistance: 100, percentage: 0, rankCutoff: 0, defense: null },
  ])
})

test('小数の重みでも境界の順位と直前の帯の最小値が一致する', () => {
  const { bands, getRank } = buildEnemyDefenseResistanceBands(
    [row('a', 200, 15), row('b', 100, 25), row('c', 0, 0)],
    counts({ a: 0.2, b: 0.1, c: 0.7 }),
  )
  assert.deepEqual(bands.slice(0, 3), [
    { from: 0, to: 10, defense: { min: 200, max: 200 }, resistance: { min: 25, max: 25 } },
    { from: 10, to: 20, defense: { min: 200, max: 200 }, resistance: { min: 15, max: 15 } },
    { from: 20, to: 30, defense: { min: 100, max: 100 }, resistance: { min: 15, max: 15 } },
  ])
  assert.deepEqual(bands[3], { from: 30, to: 40, defense: { min: 0, max: 0 }, resistance: { min: 0, max: 0 } })

  assert.deepEqual([0, 10, 10.1, 20, 20.1, 30, 30.1, 100].map(getRank), [
    { percentage: 0, defense: 200, resistance: 25 },
    { percentage: 10, defense: 200, resistance: 25 },
    { percentage: 10.1, defense: 200, resistance: 15 },
    { percentage: 20, defense: 200, resistance: 15 },
    { percentage: 20.1, defense: 100, resistance: 15 },
    { percentage: 30, defense: 100, resistance: 15 },
    { percentage: 30.1, defense: 0, resistance: 0 },
    { percentage: 100, defense: 0, resistance: 0 },
  ])
  for (const band of bands) {
    assert.deepEqual(getRank(band.to), { percentage: band.to, defense: band.defense.min, resistance: band.resistance.min })
  }
  for (const percentage of [-1, 101, Infinity, NaN]) assert.equal(getRank(percentage), null)
})

test('両方の基礎値を照合できる出現がなければ空の結果を返す', () => {
  const { total, bands, resistanceThresholds, getRank } = buildEnemyDefenseResistanceBands(
    [row('a', null, 0), row('b', 0, 0)], counts({ a: 3, b: 0 }),
  )
  assert.equal(total, 0)
  assert.deepEqual(bands, [])
  assert.deepEqual(resistanceThresholds, [])
  assert.equal(getRank(50), null)
})
