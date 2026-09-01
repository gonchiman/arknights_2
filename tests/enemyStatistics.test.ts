import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CUSTOM_LINEAR_BIN_COUNT,
  calculateBoxPlotStatistics,
  calculateEmpiricalCdf,
  calculateNumericStatistics,
  calculateNumericStatisticsWithDispersion,
  validateCustomLinearBinWidth,
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

test('敵とオペレーターで共通のCV・IQR指標を算出する', () => {
  const result = calculateNumericStatisticsWithDispersion([1, 2, 3, 4])

  assert.ok(result.coefficientOfVariation !== null)
  assert.ok(result.normalizedInterquartileRange !== null)
  assert.ok(Math.abs(result.coefficientOfVariation - Math.sqrt(1.25) / 2.5) < 1e-12)
  assert.equal(result.interquartileRange, 1.5)
  assert.ok(Math.abs(result.normalizedInterquartileRange - 0.6) < 1e-12)
})

test('平均・中央値が0または負値を含む場合は相対分散を算出しない', () => {
  const allZero = calculateNumericStatisticsWithDispersion([0, 0])
  const zeroMedian = calculateNumericStatisticsWithDispersion([0, 0, 100])
  const includesNegative = calculateNumericStatisticsWithDispersion([-10, 30])

  assert.equal(allZero.coefficientOfVariation, null)
  assert.equal(allZero.interquartileRange, 0)
  assert.equal(allZero.normalizedInterquartileRange, null)
  assert.ok(zeroMedian.coefficientOfVariation !== null)
  assert.equal(zeroMedian.normalizedInterquartileRange, null)
  assert.equal(includesNegative.coefficientOfVariation, null)
  assert.equal(includesNegative.interquartileRange, 20)
  assert.equal(includesNegative.normalizedInterquartileRange, null)
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

test('線形目盛の指定階級幅で0から最大値を覆い、境界上の値を1回ずつ数える', () => {
  const result = calculateNumericStatistics(
    [0, 5, 10, 10.1, 20, 25],
    10,
    'LINEAR',
    1,
    10,
  )

  assert.deepEqual(result.bins, [
    { start: 0, end: 10, count: 2, includesMaximum: false },
    { start: 10, end: 20, count: 2, includesMaximum: false },
    { start: 20, end: 30, count: 2, includesMaximum: true },
  ])
  assert.deepEqual(result.histogram, {
    scale: 'LINEAR',
    binWidth: 10,
    normalRangeStart: 0,
    normalRangeEnd: 30,
    normalBinCount: 3,
    hasOverflow: false,
  })
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), result.count)
})

test('小数の指定階級幅でも最大値が境界上なら最後の階級へ含める', () => {
  const result = calculateNumericStatistics([0, 0.1, 0.2, 0.3], 10, 'LINEAR', 0.01, 0.1)
  const floatingBoundary = calculateNumericStatistics([0, 0.07], 10, 'LINEAR', 0.001, 0.01)
  const nearBoundary = calculateNumericStatistics(
    [0.99999999995, 1, 1.00000000005, 2],
    10,
    'LINEAR',
    0.01,
    1,
  )

  assert.deepEqual(result.bins.map(({ start, end, count }) => ({ start, end, count })), [
    { start: 0, end: 0.1, count: 1 },
    { start: 0.1, end: 0.2, count: 1 },
    { start: 0.2, end: 0.3, count: 2 },
  ])
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 4)
  assert.equal(floatingBoundary.histogram?.normalBinCount, 7)
  assert.equal(floatingBoundary.histogram?.normalRangeEnd, 0.07)
  assert.equal(floatingBoundary.bins.reduce((sum, bin) => sum + bin.count, 0), 2)
  assert.deepEqual(nearBoundary.bins.map(({ count }) => count), [1, 3])
})

test('指定階級幅を検証し、過剰な階級数は従来の自動幅へフォールバックする', () => {
  assert.deepEqual(validateCustomLinearBinWidth(5, 25), {
    valid: true,
    binCount: 5,
    error: null,
  })
  assert.deepEqual(validateCustomLinearBinWidth(5, 0), {
    valid: true,
    binCount: 1,
    error: null,
  })

  for (const invalidWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(validateCustomLinearBinWidth(invalidWidth, 25), {
      valid: false,
      binCount: null,
      error: 'INVALID',
    })
  }

  const excessiveMaximum = MAX_CUSTOM_LINEAR_BIN_COUNT + 1
  assert.deepEqual(validateCustomLinearBinWidth(1, excessiveMaximum), {
    valid: false,
    binCount: excessiveMaximum,
    error: 'TOO_MANY_BINS',
  })
  assert.deepEqual(validateCustomLinearBinWidth(1, MAX_CUSTOM_LINEAR_BIN_COUNT + 1e-8), {
    valid: false,
    binCount: MAX_CUSTOM_LINEAR_BIN_COUNT + 1,
    error: 'TOO_MANY_BINS',
  })

  const result = calculateNumericStatistics([0, excessiveMaximum], 10, 'LINEAR', 1, 1)
  assert.equal(result.histogram?.normalBinCount, 10)
  assert.notEqual(result.histogram?.binWidth, 1)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 2)
})

test('対数目盛では指定階級幅を無視して従来の対数階級を使う', () => {
  const result = calculateNumericStatistics([0, 10, 100], 3, 'LOG', 1, 10)

  assert.equal(result.histogram?.scale, 'LOG')
  assert.equal(result.histogram?.binWidth, null)
  assert.equal(result.bins.length, 3)
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
