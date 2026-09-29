import test from 'node:test'
import assert from 'node:assert/strict'
import type { EnemyRecord } from '../src/types/enemy.ts'
import { parseEnemyHistogramCounts, buildEnemyHistogramObservations, getWeightedEnemyHistogramImageFilename,
  withHistogramDispersion } from '../src/lib/enemyHistogramCounts.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'

const source = {
  schemaVersion: 1, generatedAt: '2026-09-27T00:00:00Z', sourceGeneratedAt: '2026-08-31T00:00:00Z',
  summary: { mapCount: 2, missingMapCount: 1, spawnMapCount: 1, spawnExcludedMapCount: 1 },
  enemies: { a: { mapCount: 2, spawnCount: 13 }, b: { mapCount: 1, spawnCount: 3 }, c: { mapCount: 1, spawnCount: 4 } },
}
const row = (id: string, hp: number | null) => ({ id, stats: { maxHp: hp } }) as EnemyRecord
const rows = [row('a', 100), row('b', 100), row('c', 500)]
const value = (enemy: EnemyRecord) => enemy.stats.maxHp

test('同じ階級の敵ごとの登場マップ数を合計し、出現回数と区別する', () => {
  const counts = parseEnemyHistogramCounts(source)
  const types = calculateWeightedHistogram(buildEnemyHistogramObservations(rows, value, 'TYPES', counts))
  const maps = calculateWeightedHistogram(buildEnemyHistogramObservations(rows, value, 'MAPS', counts))
  const spawns = calculateWeightedHistogram(buildEnemyHistogramObservations(rows, value, 'SPAWNS', counts))
  assert.equal(types.count, 3)
  assert.equal(maps.count, 4)
  assert.equal(spawns.count, 20)
  assert.equal(maps.bins.find((bin) => bin.count === 3)?.count, 3)
  assert.equal(spawns.bins.find((bin) => bin.count === 16)?.count, 16)
  assert.equal(maps.mean, 200)
  assert.equal(spawns.mean, 180)
})

test('絞り込み後の敵だけを集計し、同じIDは重複加算しない', () => {
  const counts = parseEnemyHistogramCounts(source)
  const result = calculateWeightedHistogram(buildEnemyHistogramObservations([rows[0], rows[0]], value, 'SPAWNS', counts))
  assert.equal(result.count, 13)
  assert.equal(result.mean, 100)
})

test('未読込と収録マップ内の未登録敵・数値欠損を区別する', () => {
  assert.deepEqual(buildEnemyHistogramObservations(rows, value, 'MAPS', null), [])
  assert.equal(buildEnemyHistogramObservations(rows, value, 'TYPES', null).length, 3)
  const counts = parseEnemyHistogramCounts(source)
  const result = calculateWeightedHistogram(buildEnemyHistogramObservations([row('unknown', 10), row('a', null), rows[1]], value, 'SPAWNS', counts))
  assert.equal(result.count, 3)
  assert.equal(result.missingCount, 13)
})

test('不正な件数と不整合な収録範囲を正常値として扱わない', () => {
  for (const spawnCount of [-1, 1.5, NaN, Infinity, '3']) {
    assert.throws(() => parseEnemyHistogramCounts({ ...source, enemies: { a: { mapCount: 1, spawnCount } } }))
  }
  assert.throws(() => parseEnemyHistogramCounts({ ...source, summary: { ...source.summary, spawnMapCount: 3 } }))
  assert.throws(() => parseEnemyHistogramCounts({ ...source, enemies: { a: { mapCount: 3, spawnCount: 0 } } }))
  assert.throws(() => parseEnemyHistogramCounts(null))
  assert.throws(() => parseEnemyHistogramCounts({ ...source, schemaVersion: 2 }))
})

test('統計サマリーも重み付きの平均・中央値から分散指標を出す', () => {
  const statistics = calculateWeightedHistogram([{ value: 100, weight: 3 }, { value: 500, weight: 1 }])
  const summary = withHistogramDispersion(statistics)
  assert.equal(summary.mean, 200)
  assert.equal(summary.median, 100)
  assert.equal(summary.coefficientOfVariation, Math.sqrt(30000) / 200)
  assert.equal(withHistogramDispersion(calculateWeightedHistogram([])).normalizedInterquartileRange, null)
})

test('保存名は集計方法と表示対象を識別し、非表示の設定は含めない', async () => {
  const options = { mode: 'MAPS' as const, metric: 'HP', scope: '全敵', scale: 'LINEAR',
    statistics: calculateWeightedHistogram([{ value: 100, weight: 3 }, { value: 500, weight: 1 }]),
    referenceVisibility: { mean: true, median: true }, coverage: source.summary }
  const name = await getWeightedEnemyHistogramImageFilename(options)
  assert.match(name, /-[a-f0-9]{64}\.png$/)
  assert.equal(await getWeightedEnemyHistogramImageFilename({ ...options, coverage: { ...source.summary, spawnMapCount: 99 } }), name)
  assert.notEqual(await getWeightedEnemyHistogramImageFilename({ ...options, mode: 'SPAWNS' }), name)
  assert.notEqual(await getWeightedEnemyHistogramImageFilename({ ...options, scope: 'ボス' }), name)
  assert.notEqual(await getWeightedEnemyHistogramImageFilename({ ...options, coverage: { ...source.summary, mapCount: 20 } }), name)
  assert.notEqual(await getWeightedEnemyHistogramImageFilename({ ...options, customLinearUpperBound: options.statistics.histogram?.normalRangeEnd }), name)
  assert.equal(await getWeightedEnemyHistogramImageFilename({ ...options, scale: 'LOG', customLinearUpperBound: 100 }),
    await getWeightedEnemyHistogramImageFilename({ ...options, scale: 'LOG', customLinearUpperBound: null }))
  const hidden = { ...options, referenceVisibility: { mean: false, median: false } }
  assert.equal(await getWeightedEnemyHistogramImageFilename(hidden), await getWeightedEnemyHistogramImageFilename({
    ...hidden, statistics: { ...hidden.statistics, mean: 999, median: 999, standardDeviation: 999 },
  }))
})

test('割合ラベルを有効にした保存名を区別し、無効時は省略時の名前を維持する', async () => {
  const options = { metric: 'HP', scope: '全敵', scale: 'LINEAR',
    statistics: calculateWeightedHistogram([{ value: 100, weight: 3 }, { value: 500, weight: 1 }]),
    referenceVisibility: { mean: true, median: true }, coverage: source.summary }
  for (const mode of ['TYPES', 'MAPS', 'SPAWNS'] as const) {
    const withoutLabels = await getWeightedEnemyHistogramImageFilename({ ...options, mode })
    assert.equal(await getWeightedEnemyHistogramImageFilename({ ...options, mode, showPercentages: false }), withoutLabels)
    const withLabels = await getWeightedEnemyHistogramImageFilename({ ...options, mode, showPercentages: true })
    assert.notEqual(withLabels, withoutLabels)
    assert.equal(await getWeightedEnemyHistogramImageFilename({ ...options, mode, showPercentages: true }), withLabels)
  }
})
