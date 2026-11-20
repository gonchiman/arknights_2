import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import {
  buildEnemyBoxplotComparison,
  getEnemyBoxplotDisplaySeries,
} from '../src/lib/enemyBoxplotComparison.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'

const row = (id: string, defense: number | null, magicResistance: number | null) => (
  { id, stats: { defense, magicResistance } } as EnemyRecord
)
const countsFor = (enemies: EnemyHistogramCounts['enemies']): EnemyHistogramCounts => ({
  schemaVersion: 1,
  generatedAt: '',
  sourceGeneratedAt: null,
  summary: { mapCount: 10, missingMapCount: 0, spawnMapCount: 10, spawnExcludedMapCount: 0 },
  enemies,
})

test('uses Type-7 quartiles for types and integer frequencies without expanding observations', () => {
  const rows = [row('a', 0, 0), row('b', 10, 2), row('c', 30, 6), row('d', 100, 20)]
  const counts = countsFor({
    a: { mapCount: 1, spawnCount: 100 }, b: { mapCount: 2, spawnCount: 2 },
    c: { mapCount: 4, spawnCount: 4 }, d: { mapCount: 1, spawnCount: 1 },
  })
  const types = buildEnemyBoxplotComparison(rows, 'TYPES', counts).series[0]
  assert.equal(types.validCount, 4)
  assert.deepEqual(types.statistics, {
    minimum: 0, firstQuartile: 7.5, median: 20, thirdQuartile: 47.5, maximum: 100,
    lowerWhisker: 0, upperWhisker: 100, mean: 35, outliers: [], outlierCount: 0,
  })

  // This is the distribution [0, 10, 10, 30, 30, 30, 30, 100].
  const maps = buildEnemyBoxplotComparison(rows, 'MAPS', counts).series[0]
  assert.equal(maps.validCount, 8)
  assert.deepEqual(maps.statistics, {
    minimum: 0, firstQuartile: 10, median: 30, thirdQuartile: 30, maximum: 100,
    lowerWhisker: 0, upperWhisker: 30, mean: 30, outliers: [{ value: 100, count: 1 }], outlierCount: 1,
  })
  assert.equal(buildEnemyBoxplotComparison(rows, 'SPAWNS', counts).series[0].statistics!.median, 0)

  const largeCounts = countsFor({
    a: { mapCount: 1, spawnCount: 1e12 }, d: { mapCount: 1, spawnCount: 1e12 },
  })
  const large = buildEnemyBoxplotComparison([rows[0], rows[3]], 'SPAWNS', largeCounts).series[0]
  assert.equal(large.validCount, 2e12)
  assert.equal(large.statistics!.median, 50)
})

test('preserves the inverse weighted CDF midpoint rule for expected frequencies', () => {
  const rows = [row('a', 0, 0), row('b', 10, 10), row('c', 20, 20), row('d', 100, 100)]
  const counts = countsFor(Object.fromEntries(rows.map(({ id }) => [id, { mapCount: 1, spawnCount: 0.5 }])))
  const { statistics, validCount } = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts).series[0]
  assert.equal(validCount, 2)
  assert.ok(statistics)
  assert.equal(statistics.firstQuartile, 5)
  assert.equal(statistics.median, 15)
  assert.equal(statistics.thirdQuartile, 60)
  assert.equal(statistics.mean, 32.5)
})

test('matches the shared percentile’s fractional summation order before grouping equal values', () => {
  const rows = [row('a', 20, 20), row('b', 0, 0), row('c', 10, 10), row('d', 20, 20)]
  const counts = countsFor({ a: { mapCount: 1, spawnCount: 0.01 }, b: { mapCount: 1, spawnCount: 0.01 },
    c: { mapCount: 1, spawnCount: 0.1 }, d: { mapCount: 1, spawnCount: 0.1 } })
  const stats = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts).series[0].statistics!
  assert.deepEqual([stats.firstQuartile, stats.median, stats.thirdQuartile], [10, 20, 20])
})

test('retains real whisker observations when total expected frequency is below one and IQR is zero', () => {
  const rows = [row('low', 0, 0), row('middle', 10, 10), row('high', 100, 100)]
  const counts = countsFor({ low: { mapCount: 1, spawnCount: 0.0625 },
    middle: { mapCount: 1, spawnCount: 0.375 }, high: { mapCount: 1, spawnCount: 0.0625 } })
  const series = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts).series[0]
  assert.equal(series.validCount, 0.5)
  const stats = series.statistics!
  assert.deepEqual([stats.firstQuartile, stats.median, stats.thirdQuartile, stats.lowerWhisker, stats.upperWhisker],
    [10, 10, 10, 10, 10])
  assert.deepEqual(stats.outliers, [{ value: 0, count: 0.0625 }, { value: 100, count: 0.0625 }])
  assert.equal(stats.outlierCount, 0.125)
})

test('includes fence endpoints in whiskers and aggregates repeated outlier values', () => {
  const rows = [row('a', -20, 10), row('b', -19, 10), row('c', 10, 10), row('d', 30, 10),
    row('e', 59, 10), row('f', 60, 10), row('g', 61, 10), row('h', 61, 10)]
  const counts = countsFor(Object.fromEntries(rows.map(({ id }) => [id, {
    mapCount: 1, spawnCount: ['c', 'd'].includes(id) ? 10 : 1,
  }])))
  const stats = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts).series[0].statistics!
  assert.equal(stats.firstQuartile, 10)
  assert.equal(stats.thirdQuartile, 30)
  assert.equal(stats.lowerWhisker, -20)
  assert.equal(stats.upperWhisker, 60)
  assert.deepEqual(stats.outliers, [{ value: 61, count: 2 }])
  assert.equal(stats.outlierCount, 2)

  const withoutEndpoints = buildEnemyBoxplotComparison(rows.filter(({ id }) => id !== 'a' && id !== 'f'), 'SPAWNS', counts)
    .series[0].statistics!
  assert.equal(withoutEndpoints.lowerWhisker, -19)
  assert.equal(withoutEndpoints.upperWhisker, 59)
})

test('aggregates fractional outlier weights before computing quartiles', () => {
  const rows = [row('a', 10, 10), row('b', 20, 20), row('out1', 100, 100), row('out2', 100, 100)]
  const counts = countsFor({ a: { mapCount: 1, spawnCount: 8 }, b: { mapCount: 1, spawnCount: 8 },
    out1: { mapCount: 1, spawnCount: 0.1 }, out2: { mapCount: 1, spawnCount: 0.15 } })
  const stats = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts).series[0].statistics!
  assert.deepEqual(stats.outliers, [{ value: 100, count: 0.25 }])
  assert.equal(stats.outlierCount, 0.25)
  assert.equal(stats.upperWhisker, 20)

  const split = buildEnemyBoxplotComparison([row('a1', 10, 10), row('a2', 10, 10), row('b', 20, 20)], 'SPAWNS',
    countsFor({ a1: { mapCount: 1, spawnCount: 0.5 }, a2: { mapCount: 1, spawnCount: 0.5 },
      b: { mapCount: 1, spawnCount: 1 } })).series[0].statistics!
  assert.equal(split.firstQuartile, 12.5)
  assert.equal(split.median, 15)
  assert.equal(split.thirdQuartile, 17.5)
})

test('uses only filtered rows, deduplicates ids, and tracks each metric’s missing weighted values', () => {
  const rows = [row('a', 10, null), row('b', null, 20), row('c', NaN, 30), row('d', Infinity, Infinity),
    row('zero', 999, 999), row('negative', 999, 999), row('nan', 999, 999), row('infinite', 999, 999),
    row('absent', 999, 999), row('a', 999, 999)]
  const counts = countsFor({ a: { mapCount: 1, spawnCount: 2 }, b: { mapCount: 1, spawnCount: 3 },
    c: { mapCount: 1, spawnCount: 0.5 }, d: { mapCount: 1, spawnCount: 4 },
    zero: { mapCount: 1, spawnCount: 0 }, negative: { mapCount: 1, spawnCount: -1 },
    nan: { mapCount: 1, spawnCount: NaN }, infinite: { mapCount: 1, spawnCount: Infinity },
    outsideFilter: { mapCount: 1, spawnCount: 10000 } })
  const result = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts)
  assert.equal(result.hasData, true)
  assert.deepEqual(result.series.map(({ key, validCount, missingCount }) => ({ key, validCount, missingCount })), [
    { key: 'defense', validCount: 2, missingCount: 7.5 },
    { key: 'magicResistance', validCount: 3.5, missingCount: 6 },
  ])
  assert.equal(result.series[0].statistics!.maximum, 10)
  assert.equal(result.series[1].statistics!.maximum, 30)

  const filtered = buildEnemyBoxplotComparison(rows.filter(({ id }) => id === 'a'), 'SPAWNS', counts)
  assert.equal(filtered.series[0].validCount, 2)
  assert.equal(filtered.series[1].missingCount, 2)
  assert.equal(filtered.series[1].statistics, null)
})

test('distinguishes no data, unavailable weights, and a valid constant-zero distribution', () => {
  assert.equal(buildEnemyBoxplotComparison([], 'TYPES', null).hasData, false)
  const noCounts = buildEnemyBoxplotComparison([row('a', 10, 20)], 'SPAWNS', null)
  assert.equal(noCounts.hasData, false)
  assert.deepEqual(noCounts.series.map(({ validCount, missingCount }) => [validCount, missingCount]), [[0, 0], [0, 0]])
  assert.ok(getEnemyBoxplotDisplaySeries(noCounts, 'MEDIAN').every(({ unavailable }) => unavailable === 'no-data'))

  const zero = buildEnemyBoxplotComparison([row('a', 0, null)], 'TYPES', null)
  assert.equal(zero.hasData, true)
  assert.deepEqual(zero.series[0].statistics, {
    minimum: 0, firstQuartile: 0, median: 0, thirdQuartile: 0, maximum: 0,
    lowerWhisker: 0, upperWhisker: 0, mean: 0, outliers: [], outlierCount: 0,
  })
  const raw = getEnemyBoxplotDisplaySeries(zero, 'RAW')
  assert.equal(raw[0].unavailable, null)
  assert.equal(raw[0].statistics!.median, 0)
  assert.equal(raw[1].unavailable, 'no-data')
  const normalized = getEnemyBoxplotDisplaySeries(zero, 'MEDIAN')
  assert.equal(normalized[0].unavailable, 'median-zero')
  assert.equal(normalized[0].statistics, null)
  assert.equal(normalized[0].validCount, 1)

  const negative = buildEnemyBoxplotComparison([row('a', -1, null)], 'TYPES', null)
  assert.equal(getEnemyBoxplotDisplaySeries(negative, 'MEDIAN')[0].unavailable, 'median-zero')
})

test('normalizes every plotted value by its own median and preserves counts and source data', () => {
  const rows = [row('a', 10, 20), row('b', 20, 40), row('out', 100, 200)]
  const counts = countsFor({ a: { mapCount: 1, spawnCount: 8 }, b: { mapCount: 1, spawnCount: 8 },
    out: { mapCount: 1, spawnCount: 1 } })
  const original = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts)
  const snapshot = structuredClone(original)
  const normalized = getEnemyBoxplotDisplaySeries(original, 'MEDIAN')
  const raw = getEnemyBoxplotDisplaySeries(original, 'RAW')
  for (let index = 0; index < original.series.length; index += 1) {
    const input = original.series[index]
    const output = normalized[index]
    assert.equal(output.unavailable, null)
    assert.equal(output.validCount, input.validCount)
    assert.equal(output.missingCount, input.missingCount)
    const divisor = input.statistics!.median
    for (const key of ['minimum', 'firstQuartile', 'median', 'thirdQuartile', 'maximum', 'lowerWhisker', 'upperWhisker', 'mean'] as const) {
      assert.equal(output.statistics![key], input.statistics![key] / divisor)
    }
    assert.deepEqual(output.statistics!.outliers, [{ value: 5, count: 1 }])
    assert.equal(output.statistics!.outlierCount, 1)
    assert.deepEqual(raw[index].statistics, input.statistics)
  }
  assert.deepEqual(original, snapshot)
  assert.deepEqual(normalized[0].statistics, normalized[1].statistics)
})

test('reproduces the v12 main-story spawn distribution independently of histogram binning', async () => {
  const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const { versions } = await client.loadIndex()
  const version = versions.find(({ id }) => id === 'v12')
  assert.ok(version)
  const { rows, counts } = getEnemyMainStoryScope(await client.loadVersion(version))
  const result = buildEnemyBoxplotComparison(rows, 'SPAWNS', counts)
  assert.deepEqual(result.series.map(({ validCount, missingCount }) => [validCount, missingCount]), [[11409, 201], [11409, 201]])
  const defense = result.series[0].statistics!
  const resistance = result.series[1].statistics!
  assert.deepEqual([defense.minimum, defense.firstQuartile, defense.median, defense.thirdQuartile, defense.maximum], [0, 85, 120, 220, 4000])
  assert.deepEqual([defense.lowerWhisker, defense.upperWhisker, defense.outlierCount], [0, 400, 1257])
  assert.deepEqual([resistance.minimum, resistance.firstQuartile, resistance.median, resistance.thirdQuartile, resistance.maximum], [0, 0, 20, 30, 90])
  assert.deepEqual([resistance.lowerWhisker, resistance.upperWhisker, resistance.outlierCount], [0, 75, 114])
  assert.deepEqual(resistance.outliers.map(({ value }) => value), [80, 85, 90])
})
