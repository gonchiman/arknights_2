import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateBoxPlotStatistics,
  calculateEmpiricalCdf,
  calculateNumericStatistics,
} from '../src/lib/enemyStatistics.ts'

test('表示対象の有限値だけで統計量を算出する', () => {
  const result = calculateNumericStatistics([1, 2, 3, 4, null, Number.NaN], 2)

  assert.equal(result.totalCount, 6)
  assert.equal(result.count, 4)
  assert.equal(result.missingCount, 2)
  assert.equal(result.minimum, 1)
  assert.equal(result.firstQuartile, 1.75)
  assert.equal(result.median, 2.5)
  assert.equal(result.mean, 2.5)
  assert.equal(result.thirdQuartile, 3.25)
  assert.equal(result.maximum, 4)
  assert.equal(result.standardDeviation, Math.sqrt(1.25))
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 4)
  assert.equal(result.histogram?.binWidth, 0.5)
  assert.equal(result.histogram?.normalRangeEnd, 5)
})

test('すべて同じ値でも線形目盛は10個の通常階級を維持する', () => {
  const result = calculateNumericStatistics([30, 30, 30], 10)

  assert.equal(result.bins.length, 10)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 3)
  assert.equal(result.bins[6].count, 3)
  assert.equal(result.histogram?.binWidth, 5)
  assert.equal(result.histogram?.normalRangeEnd, 50)
  assert.equal(result.standardDeviation, 0)
})

test('線形目盛は95パーセンタイルから階級幅を決めて上限超過を分離する', () => {
  const source = [...Array.from({ length: 100 }, (_, index) => index), 10_000]
  const result = calculateNumericStatistics(source, 10, 'LINEAR', 1)

  assert.equal(result.histogram?.binWidth, 10)
  assert.equal(result.histogram?.normalRangeStart, 0)
  assert.equal(result.histogram?.normalRangeEnd, 100)
  assert.equal(result.histogram?.normalBinCount, 10)
  assert.equal(result.histogram?.hasOverflow, true)
  assert.equal(result.bins.length, 11)
  assert.equal(result.bins.slice(0, 10).reduce((sum, bin) => sum + bin.count, 0), 100)
  assert.deepEqual(result.bins.at(-1), {
    start: 100,
    end: 110,
    count: 1,
    includesMaximum: true,
    isOverflow: true,
  })
})

test('階級幅を1・2・2.5・5系列へ切り上げ、整数値の最小幅を守る', () => {
  const rounded = calculateNumericStatistics([21_000], 10, 'LINEAR', 1)
  const minimum = calculateNumericStatistics([0], 10, 'LINEAR', 1)

  assert.equal(rounded.histogram?.binWidth, 2_500)
  assert.equal(rounded.histogram?.normalRangeEnd, 25_000)
  assert.equal(minimum.histogram?.binWidth, 1)
})

test('対数目盛でも全データをいずれかの区間へ含める', () => {
  const result = calculateNumericStatistics([0, 10, 100, 1000, 10000], 5, 'LOG')

  assert.equal(result.bins.length, 5)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 5)
  assert.equal(result.bins[0].start, 0)
  assert.equal(result.bins.at(-1)?.end, 10000)
  assert.equal(result.histogram?.scale, 'LOG')
  assert.equal(result.histogram?.binWidth, null)
})

test('有効な数値がない場合は統計量を空として返す', () => {
  const result = calculateNumericStatistics([null, undefined, Number.POSITIVE_INFINITY])

  assert.equal(result.count, 0)
  assert.equal(result.missingCount, 3)
  assert.equal(result.mean, null)
  assert.deepEqual(result.bins, [])
  assert.equal(result.histogram, null)
})

test('累積分布は同じ値をまとめて割合を算出する', () => {
  assert.deepEqual(calculateEmpiricalCdf([1, 1, 3, 5, null]), [
    { value: 1, count: 2, cumulativeCount: 2, proportion: 0.5 },
    { value: 3, count: 1, cumulativeCount: 3, proportion: 0.75 },
    { value: 5, count: 1, cumulativeCount: 4, proportion: 1 },
  ])
})

test('箱ひげ図用のひげと外れ値を算出する', () => {
  assert.deepEqual(calculateBoxPlotStatistics([1, 2, 3, 4, 100]), {
    count: 5,
    minimum: 1,
    firstQuartile: 2,
    median: 3,
    thirdQuartile: 4,
    maximum: 100,
    lowerWhisker: 1,
    upperWhisker: 4,
    outliers: [100],
  })
})
