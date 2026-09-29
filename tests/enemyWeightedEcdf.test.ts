import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateEcdfGuideReadings } from '../src/lib/enemyEcdfGuides.ts'
import { calculateEmpiricalCdf } from '../src/lib/enemyStatistics.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { calculateWeightedEmpiricalCdf, getWeightedEnemyEcdfImageFilename } from '../src/lib/enemyWeightedEcdf.ts'

test('整数の出現回数は実際に展開したデータの累積分布と一致する', () => {
  const source = [{ value: 300, weight: 2 }, { value: 100, weight: 3 }, { value: 100, weight: 1 }, { value: 200, weight: 4 }]
  const original = structuredClone(source)
  assert.deepEqual(calculateWeightedEmpiricalCdf(source), calculateEmpiricalCdf(source.flatMap(({ value, weight }) => Array(weight).fill(value))))
  assert.deepEqual(source, original)
})

test('全ての重みが1なら元の種類数の累積分布を維持する', () => {
  const values = [30, 10, 10, 0, -5, 20, null, undefined, NaN, Infinity]
  assert.deepEqual(calculateWeightedEmpiricalCdf(values.map((value) => ({ value, weight: 1 }))), calculateEmpiricalCdf(values))
})

test('欠損値・非有限値・0以下または非有限の重みは累積分布から除く', () => {
  const invalid = [null, undefined, NaN, Infinity, -Infinity].map((value) => ({ value, weight: 5 }))
  invalid.push(...[0, -1, NaN, Infinity, -Infinity].map((weight) => ({ value: 100, weight })))
  assert.deepEqual(calculateWeightedEmpiricalCdf(invalid), [])
  assert.deepEqual(calculateWeightedEmpiricalCdf([...invalid, { value: 0, weight: 3 }]), [
    { value: 0, count: 3, cumulativeCount: 3, proportion: 1 },
  ])
})

test('巨大な重みでも個数分の配列を作らず、同値と小数の重みを集約する', () => {
  assert.deepEqual(calculateWeightedEmpiricalCdf([{ value: 10, weight: 1e12 }, { value: 20, weight: 1e12 }]), [
    { value: 10, count: 1e12, cumulativeCount: 1e12, proportion: 0.5 },
    { value: 20, count: 1e12, cumulativeCount: 2e12, proportion: 1 },
  ])
  const points = calculateWeightedEmpiricalCdf([{ value: 20, weight: 0.1 }, { value: 10, weight: 0.2 }, { value: 20, weight: 0.3 }])
  assert.equal(points.length, 2)
  assert.equal(points[1].count, 0.4)
  assert.equal(points[1].proportion, 1)
  assert.ok(Math.abs(points[0].proportion - (1 / 3)) < 1e-14)
})

test('補助線は敵の種類数でなく重み付き累積件数と割合から読み取る', () => {
  const points = calculateWeightedEmpiricalCdf([{ value: 100, weight: 8 }, { value: 200, weight: 1 }, { value: 300, weight: 1 }])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 100, yPercent: 50 }), {
    x: { value: 100, cumulativeCount: 8, proportion: 0.8, inRange: true },
    y: { percentage: 50, value: 100, cumulativeCount: 8, proportion: 0.8 },
  })
  assert.equal(calculateEcdfGuideReadings(points, { x: 199, yPercent: 81 }).y?.value, 200)
  assert.equal(calculateEcdfGuideReadings(points, { x: 99, yPercent: 100 }).x?.cumulativeCount, 0)
  assert.equal(calculateEcdfGuideReadings(points, { x: 500, yPercent: 100 }).y?.cumulativeCount, 10)
})

const observations = [{ value: 100, weight: 3 }, { value: 500, weight: 1 }]
const imageOptions = {
  mode: 'MAPS' as const, metric: 'HP', scope: '全敵', scale: 'LINEAR',
  points: calculateWeightedEmpiricalCdf(observations), statistics: calculateWeightedHistogram(observations),
  referenceVisibility: { mean: true, median: true },
  coverage: { mapCount: 20, missingMapCount: 3, spawnMapCount: 15, spawnExcludedMapCount: 5 },
  guides: { x: null, yPercent: null },
}

test('画像名は集計方法・対象・尺度・基準線・補助線を読める形にする', async () => {
  const filename = await getWeightedEnemyEcdfImageFilename(imageOptions)
  assert.equal(filename, '敵_HP_累積分布_登場マップ数_全敵_線形_平均-中央値.png')
  for (const changed of [
    { ...imageOptions, mode: 'SPAWNS' as const },
    { ...imageOptions, metric: '術耐性' },
    { ...imageOptions, scope: 'ボス' },
    { ...imageOptions, scale: 'LOG' },
    { ...imageOptions, referenceVisibility: { mean: false, median: true } },
    { ...imageOptions, guides: { x: 100, yPercent: null } },
    { ...imageOptions, guides: { x: null, yPercent: 50 } },
  ]) assert.notEqual(await getWeightedEnemyEcdfImageFilename(changed), filename)
  assert.equal(await getWeightedEnemyEcdfImageFilename(imageOptions), filename)
  assert.equal(await getWeightedEnemyEcdfImageFilename({ ...imageOptions, guides: { x: 0, yPercent: 50 } }),
    '敵_HP_累積分布_登場マップ数_全敵_線形_平均-中央値_縦線0_横線50%.png')
  for (const changed of [
    { ...imageOptions, points: calculateWeightedEmpiricalCdf([{ value: 100, weight: 2 }, { value: 500, weight: 2 }]) },
    { ...imageOptions, statistics: { ...imageOptions.statistics, missingCount: 10, mean: 101 } },
    { ...imageOptions, coverage: { ...imageOptions.coverage, mapCount: 99 } },
  ]) assert.equal(await getWeightedEnemyEcdfImageFilename(changed), filename)
})

test('ヒストグラムの階級設定や非表示の統計値は累積分布の画像名を変えない', async () => {
  const options = { ...imageOptions, referenceVisibility: { mean: false, median: false } }
  const filename = await getWeightedEnemyEcdfImageFilename(options)
  assert.equal(await getWeightedEnemyEcdfImageFilename({
    ...options, statistics: { ...options.statistics, bins: [], histogram: null, mean: 999, median: 888,
      standardDeviation: 777, firstQuartile: 111, thirdQuartile: 333 },
    coverage: { ...options.coverage, spawnMapCount: 999, missingMapCount: 555, spawnExcludedMapCount: 888 },
  }), filename)
  assert.equal(await getWeightedEnemyEcdfImageFilename({ ...options, guides: { x: NaN, yPercent: 101 } }), filename)
})

test('収録マップ数の更新は有効設定の名前を変えない', async () => {
  const spawns = { ...imageOptions, mode: 'SPAWNS' as const }
  assert.equal(await getWeightedEnemyEcdfImageFilename(spawns), await getWeightedEnemyEcdfImageFilename({
    ...spawns, coverage: { ...spawns.coverage, mapCount: 999 },
  }))
  assert.equal(await getWeightedEnemyEcdfImageFilename(spawns), await getWeightedEnemyEcdfImageFilename({
    ...spawns, coverage: { ...spawns.coverage, spawnMapCount: 999 },
  }))
  const types = { ...imageOptions, mode: 'TYPES' as const }
  assert.equal(await getWeightedEnemyEcdfImageFilename(types), await getWeightedEnemyEcdfImageFilename({ ...types, coverage: null }))
})
