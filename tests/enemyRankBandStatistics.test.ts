import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { buildEnemyRecords } from '../src/lib/enemyData.ts'
import { buildEnemyDefenseResistanceBands } from '../src/lib/enemyDefenseResistance.ts'
import { buildEnemyRankBandStatistics } from '../src/lib/enemyRankBandStatistics.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
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

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}

test('同値群を帯の境界で分割し、帯内重みで平均と母分散を求める', () => {
  const { total, bands } = buildEnemyRankBandStatistics([row('high', 10, 0), row('low', 0, 20)], counts({ high: 1, low: 9 }), 20)
  assert.equal(total, 10)
  assert.equal(bands.length, 5)
  assert.equal(bands[0].weight, 2)
  assert.deepEqual(bands[0].defense, { min: 0, max: 10, width: 10, mean: 5, variance: 25, standardDeviation: 5 })
  assert.deepEqual(bands[0].resistance, { min: 20, max: 20, width: 0, mean: 20, variance: 0, standardDeviation: 0 })
  assert.ok(bands.slice(1).every(band => band.defense.mean === 0 && band.defense.variance === 0))
  close(bands.reduce((sum, band) => sum + band.weight * band.defense.mean, 0) / total, 1)
})

test('小数の出現頻度でも境界の重複や隣値の微小混入を作らない', () => {
  const fractional = buildEnemyRankBandStatistics([row('high', 10, 30), row('low', 0, 0)], counts({ high: 0.15, low: 0.85 }), 20)
  close(fractional.bands[0].defense.mean, 7.5)
  close(fractional.bands[0].defense.variance, 18.75)
  close(fractional.bands[0].defense.standardDeviation, Math.sqrt(18.75))
  assert.equal(fractional.bands[1].defense.variance, 0)

  const rows = [row('a', 200, 15), row('b', 100, 25), row('c', 0, 0)]
  const weights = counts({ a: 0.2, b: 0.1, c: 0.7 })
  const result = buildEnemyRankBandStatistics(rows, weights)
  const legacy = buildEnemyDefenseResistanceBands(rows, weights)
  result.bands.forEach((band, index) => {
    assert.deepEqual({ min: band.defense.min, max: band.defense.max }, legacy.bands[index].defense)
    assert.deepEqual({ min: band.resistance.min, max: band.resistance.max }, legacy.bands[index].resistance)
  })
  assert.deepEqual(result.bands.slice(0, 3).map(band => band.defense.mean), [200, 200, 100])
  assert.ok(result.bands.every(band => band.defense.standardDeviation === 0 && band.resistance.standardDeviation === 0))
})

test('共通有効集合、重複ID、ゼロ頻度、欠損頻度を既存の集計処理にそろえる', () => {
  const rows = [row('a', 10, 20), row('a', 10, 20), row('b', 0, 0), row('missingDefense', null, 90),
    row('missingResistance', 9000, null), row('zero', 9000, 90), row('noCount', 9000, 90)]
  const result = buildEnemyRankBandStatistics(rows, counts({ a: 2, b: 3, missingDefense: 100, missingResistance: 100, zero: 0 }))
  assert.equal(result.total, 5)
  assert.equal(result.bands.length, 10)
  assert.ok(result.bands.every(band => band.weight === 0.5))
  assert.deepEqual(result.bands.slice(0, 4).map(band => band.defense.mean), [10, 10, 10, 10])
  assert.ok(result.bands.slice(4).every(band => band.defense.mean === 0 && band.resistance.mean === 0))
  assert.deepEqual(buildEnemyRankBandStatistics([row('a', null, 0)], counts({ a: 2 })), { total: 0, bands: [] })
  assert.deepEqual(buildEnemyRankBandStatistics([row('a', 10, 20)], counts({ a: 0 })), { total: 0, bands: [] })
})

test('全ての刻みで帯の重みと平均・分散を合成すると全体の統計量へ戻る', () => {
  const rows = [row('a', 600, 50), row('b', 600, 20), row('c', 300, 20), row('d', 0, 0)]
  const weights = counts({ a: 3.5, b: 2.5, c: 2.25, d: 1.75 })
  for (const step of [5, 10, 20] as const) {
    const { total, bands } = buildEnemyRankBandStatistics(rows, weights, step)
    assert.equal(bands.length, 100 / step)
    close(bands.reduce((sum, band) => sum + band.weight, 0), total)
    for (const metric of ['defense', 'resistance'] as const) {
      const whole = calculateWeightedHistogram(rows.map(enemy => ({
        value: metric === 'defense' ? enemy.stats.defense : enemy.stats.magicResistance,
        weight: weights.enemies[enemy.id].spawnCount,
      })))
      const mean = bands.reduce((sum, band) => sum + band.weight * band[metric].mean, 0) / total
      const variance = bands.reduce((sum, band) => sum
        + band.weight * (band[metric].variance + (band[metric].mean - mean) ** 2), 0) / total
      close(mean, whole.mean!)
      close(variance, whole.standardDeviation! ** 2)
      assert.ok(bands.every(band => Object.values(band[metric]).every(Number.isFinite)))
    }
  }
})

test('v12メインストーリーの順位帯を既存範囲表と一致させる', () => {
  const bundle = JSON.parse(gunzipSync(readFileSync(new URL('../public/data/enemy-aggregation/v12.json.gz', import.meta.url))).toString())
  const weights = bundle.files['enemy-histogram-counts.json'].mainStory as EnemyHistogramCounts
  const rows = buildEnemyRecords(bundle.files['runtime/enemy_handbook_table.json'],
    bundle.files['runtime/enemy_database.json'], bundle.files['enemy-stage-appearances.json'])
  const result = buildEnemyRankBandStatistics(rows, weights)
  const legacy = buildEnemyDefenseResistanceBands(rows, weights)
  assert.equal(result.total, 11409)
  result.bands.forEach((band, index) => {
    assert.deepEqual({ min: band.defense.min, max: band.defense.max }, legacy.bands[index].defense)
    assert.deepEqual({ min: band.resistance.min, max: band.resistance.max }, legacy.bands[index].resistance)
  })
  assert.equal(result.bands[0].defense.width, 3500)
  close(result.bands[0].weight, 1140.9)
  close(result.bands[0].defense.mean, 1201.7880620562712)
  close(result.bands[0].defense.variance, 751435.053338071)
  close(result.bands[0].resistance.mean, 56.508019984222976)
})
