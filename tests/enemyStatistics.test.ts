import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CUSTOM_LINEAR_BIN_COUNT,
  calculateBoxPlotStatistics,
  calculateEmpiricalCdf,
  calculateNumericStatistics,
  calculateNumericStatisticsWithDispersion,
  getCustomLinearHistogramMaximum,
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

const hpWithOverflow = [
  ...Array.from({ length: 100 }, (_, index) => index * 1_000),
  100_000,
  100_001,
  1_000_000,
]

test('手動階級幅でもHPの10万超を一つの階級にまとめ、10万は通常階級に含める', () => {
  const automatic = calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1)
  const manual = calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1, 20_000)

  assert.equal(automatic.histogram?.normalRangeEnd, 100_000)
  assert.equal(manual.histogram?.normalRangeEnd, 100_000)
  assert.equal(manual.histogram?.normalBinCount, 5)
  assert.equal(manual.histogram?.binWidth, 20_000)
  assert.equal(manual.histogram?.hasOverflow, true)
  assert.deepEqual(manual.bins.map(({ count }) => count), [20, 20, 20, 20, 21, 2])
  assert.deepEqual(manual.bins.at(-2), {
    start: 80_000,
    end: 100_000,
    count: 21,
    includesMaximum: true,
  })
  assert.deepEqual(manual.bins.at(-1), {
    start: 100_000,
    end: 120_000,
    count: 2,
    includesMaximum: true,
    isOverflow: true,
  })
  assert.equal(manual.bins.reduce((sum, bin) => sum + bin.count, 0), hpWithOverflow.length)
})

test('上限を割り切れない幅は最後の通常階級を上限で切り、上限より大きい幅も受け付ける', () => {
  const uneven = calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1, 30_000)
  const wide = calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1, 200_000)

  assert.deepEqual(uneven.bins.slice(0, -1), [
    { start: 0, end: 30_000, count: 30, includesMaximum: false },
    { start: 30_000, end: 60_000, count: 30, includesMaximum: false },
    { start: 60_000, end: 90_000, count: 30, includesMaximum: false },
    { start: 90_000, end: 100_000, count: 11, includesMaximum: true },
  ])
  assert.equal(uneven.bins.at(-1)?.start, 100_000)
  assert.equal(uneven.bins.at(-1)?.count, 2)
  assert.equal(uneven.bins.at(-1)?.isOverflow, true)
  assert.equal(wide.histogram?.normalBinCount, 1)
  assert.equal(wide.histogram?.normalRangeEnd, 100_000)
  assert.deepEqual(wide.bins[0], {
    start: 0,
    end: 100_000,
    count: 101,
    includesMaximum: true,
  })
  assert.equal(wide.bins.at(-1)?.count, 2)
  assert.equal(wide.bins.at(-1)?.isOverflow, true)
  for (const result of [uneven, wide]) {
    assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), hpWithOverflow.length)
  }
})

test('小数の手動幅でも自動上限を保ち、境界の値と超過値を重複なく数える', () => {
  const source = [
    ...Array.from({ length: 100 }, (_, index) => index / 100),
    1,
    1.000001,
    100,
  ]
  const automatic = calculateNumericStatistics(source, 10, 'LINEAR', 0.01)
  const manual = calculateNumericStatistics(source, 10, 'LINEAR', 0.01, 0.3)

  assert.equal(automatic.histogram?.normalRangeEnd, 1)
  assert.equal(manual.histogram?.normalRangeEnd, 1)
  assert.deepEqual(manual.bins.map(({ count }) => count), [30, 30, 30, 11, 2])
  assert.deepEqual(manual.bins.at(-2), {
    start: 0.9,
    end: 1,
    count: 11,
    includesMaximum: true,
  })
  assert.equal(manual.bins.at(-1)?.start, 1)
  assert.equal(manual.bins.at(-1)?.isOverflow, true)
  assert.equal(manual.bins.reduce((sum, bin) => sum + bin.count, 0), source.length)
})

test('手動幅の検証上限は超過階級があれば自動境界、なければ実測最大値を使う', () => {
  assert.equal(getCustomLinearHistogramMaximum(hpWithOverflow, 1), 100_000)
  assert.equal(getCustomLinearHistogramMaximum([...hpWithOverflow, null, Number.NaN], 1), 100_000)
  assert.equal(getCustomLinearHistogramMaximum([0, 5, 25], 1), 25)
  assert.equal(getCustomLinearHistogramMaximum([0, 0], 1), 0)
  assert.equal(getCustomLinearHistogramMaximum([null, undefined, Number.POSITIVE_INFINITY]), null)

  const smallValues = [...Array.from({ length: 100 }, (_, index) => index / 100), 5]
  assert.equal(getCustomLinearHistogramMaximum(smallValues), 1)
  assert.equal(getCustomLinearHistogramMaximum(smallValues, 1), 5)
})

test('超過値が大きくても通常階級200個までは手動幅を使用し、超過階級を別に追加する', () => {
  const maximum = getCustomLinearHistogramMaximum(hpWithOverflow, 1)
  const width = 100_000 / MAX_CUSTOM_LINEAR_BIN_COUNT

  assert.deepEqual(validateCustomLinearBinWidth(width, maximum), {
    valid: true,
    binCount: MAX_CUSTOM_LINEAR_BIN_COUNT,
    error: null,
  })
  const result = calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1, width)
  assert.equal(result.histogram?.binWidth, width)
  assert.equal(result.histogram?.normalBinCount, MAX_CUSTOM_LINEAR_BIN_COUNT)
  assert.equal(result.bins.length, MAX_CUSTOM_LINEAR_BIN_COUNT + 1)
  assert.equal(result.bins.at(-1)?.count, 2)
  assert.equal(result.bins.at(-1)?.isOverflow, true)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), hpWithOverflow.length)

  const excessiveWidth = 100_000 / (MAX_CUSTOM_LINEAR_BIN_COUNT + 1)
  assert.equal(validateCustomLinearBinWidth(excessiveWidth, maximum).error, 'TOO_MANY_BINS')
  const fallback = calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1, excessiveWidth)
  assert.deepEqual(fallback, calculateNumericStatistics(hpWithOverflow, 10, 'LINEAR', 1))
})

test('手動階級幅で超過階級をまとめても、欠損数や平均・四分位数・分散は変化しない', () => {
  const source = [...hpWithOverflow, null, undefined, Number.NaN]
  const automatic = calculateNumericStatisticsWithDispersion(source, 10, 'LINEAR', 1)
  const manual = calculateNumericStatisticsWithDispersion(source, 10, 'LINEAR', 1, 30_000)
  const { bins: automaticBins, histogram: automaticHistogram, ...automaticStatistics } = automatic
  const { bins: manualBins, histogram: manualHistogram, ...manualStatistics } = manual

  assert.notDeepEqual(manualBins, automaticBins)
  assert.notDeepEqual(manualHistogram, automaticHistogram)
  assert.deepEqual(manualStatistics, automaticStatistics)
  assert.equal(manual.count, hpWithOverflow.length)
  assert.equal(manual.missingCount, 3)
  assert.equal(manual.maximum, 1_000_000)
})

test('幅と上限を固定するとデータや超過件数が異なっても全階級の端点が一致する', () => {
  const sources = [
    [0, 5_000, 10_000, 100_000, 100_001, 1_000_000],
    [500, 15_000, 25_000],
    [0, 0],
  ]
  const results = sources.map((source) => calculateNumericStatistics(source, 10, 'LINEAR', 1, 5_000, 100_000))
  const getBinRanges = (result: typeof results[number]) => result.bins.map(({ count: _count, ...bin }) => bin)

  for (const [index, result] of results.entries()) {
    assert.deepEqual(result.histogram, {
      scale: 'LINEAR',
      binWidth: 5_000,
      normalRangeStart: 0,
      normalRangeEnd: 100_000,
      normalBinCount: 20,
      hasOverflow: true,
    })
    assert.equal(result.bins.length, 21)
    assert.deepEqual(getBinRanges(result), getBinRanges(results[0]))
    assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), sources[index].length)
  }
  assert.equal(results[0].bins.at(-2)?.count, 1)
  assert.deepEqual(results[0].bins.at(-1), {
    start: 100_000,
    end: 105_000,
    count: 2,
    includesMaximum: true,
    isOverflow: true,
  })
  assert.equal(results[1].bins.at(-1)?.count, 0)
  assert.equal(results[2].bins[0].count, 2)
  assert.equal(results[2].bins.at(-1)?.count, 0)
})

test('手動上限は端数を丸めず保持し、最終通常階級のみをその上限で切る', () => {
  const upperBound = 100_000.123456789
  const result = calculateNumericStatistics([0, 90_000, upperBound, upperBound + 0.000001], 10, 'LINEAR', 1, 30_000, upperBound)

  assert.equal(result.histogram?.normalRangeEnd, upperBound)
  assert.equal(result.histogram?.normalBinCount, 4)
  assert.deepEqual(result.bins.at(-2), {
    start: 90_000,
    end: upperBound,
    count: 2,
    includesMaximum: true,
  })
  assert.equal(result.bins.at(-1)?.start, upperBound)
  assert.equal(result.bins.at(-1)?.count, 1)

  const wide = calculateNumericStatistics([1, 100, 101], 10, 'LINEAR', 1, 200, 100)
  assert.equal(wide.histogram?.normalBinCount, 1)
  assert.deepEqual(wide.bins.map(({ start, end, count }) => ({ start, end, count })), [
    { start: 0, end: 100, count: 2 },
    { start: 100, end: 300, count: 1 },
  ])
})

test('小数の手動上限ちょうどを通常階級に入れ、わずかでも超える値を超過階級に入れる', () => {
  const result = calculateNumericStatistics([0, 0.1, 0.2, 0.3, 0.30000000000000004, 1], 10, 'LINEAR', 0.01, 0.1, 0.3)

  assert.equal(result.histogram?.normalBinCount, 3)
  assert.equal(result.histogram?.normalRangeEnd, 0.3)
  assert.deepEqual(result.bins.map(({ start, end, count }) => ({ start, end, count })), [
    { start: 0, end: 0.1, count: 1 },
    { start: 0.1, end: 0.2, count: 1 },
    { start: 0.2, end: 0.3, count: 2 },
    { start: 0.3, end: 0.4, count: 2 },
  ])
})

test('上限だけを指定すると既存の自動幅で分割し、超過階級は0件でも残す', () => {
  const source = [0, 1_000, 21_000]
  const automatic = calculateNumericStatistics(source, 10, 'LINEAR', 1)
  const result = calculateNumericStatistics(source, 10, 'LINEAR', 1, null, 31_000)

  assert.equal(result.histogram?.binWidth, automatic.histogram?.binWidth)
  assert.equal(result.histogram?.binWidth, 2_000)
  assert.equal(result.histogram?.normalBinCount, 16)
  assert.equal(result.histogram?.normalRangeEnd, 31_000)
  assert.deepEqual(result.bins.at(-2), { start: 30_000, end: 31_000, count: 0, includesMaximum: true })
  assert.equal(result.histogram?.hasOverflow, true)
  assert.equal(result.bins.at(-1)?.count, 0)
  assert.equal(result.bins.at(-1)?.isOverflow, true)
})

test('微小な手動上限・幅でも各通常階級と超過階級を分けて数える', () => {
  const result = calculateNumericStatistics([0, 1e-18, 5e-18, 1e-17, 1.01e-17], 10, 'LINEAR', 0, 5e-18, 1e-17)

  assert.equal(result.histogram?.normalRangeEnd, 1e-17)
  assert.equal(result.histogram?.normalBinCount, 2)
  assert.deepEqual(result.bins.map(({ count }) => count), [2, 2, 1])
})

test('空や欠損だけのデータでも指定幅・上限を保持し、統計量を空のままにする', () => {
  for (const source of [[], [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]]) {
    const result = calculateNumericStatisticsWithDispersion(source, 10, 'LINEAR', 1, 5_000, 100_000)

    assert.equal(result.totalCount, source.length)
    assert.equal(result.missingCount, source.length)
    assert.equal(result.count, 0)
    assert.equal(result.minimum, null)
    assert.equal(result.firstQuartile, null)
    assert.equal(result.median, null)
    assert.equal(result.mean, null)
    assert.equal(result.thirdQuartile, null)
    assert.equal(result.maximum, null)
    assert.equal(result.standardDeviation, null)
    assert.equal(result.coefficientOfVariation, null)
    assert.equal(result.interquartileRange, null)
    assert.equal(result.normalizedInterquartileRange, null)
    assert.equal(result.histogram?.normalRangeEnd, 100_000)
    assert.equal(result.histogram?.normalBinCount, 20)
    assert.equal(result.histogram?.hasOverflow, true)
    assert.equal(result.bins.length, 21)
    assert.ok(result.bins.every((bin) => bin.count === 0))
  }

  const automaticWidth = calculateNumericStatistics([], 10, 'LINEAR', 0.3, null, 1)
  assert.equal(automaticWidth.histogram?.binWidth, 0.3)
  assert.equal(automaticWidth.histogram?.normalBinCount, 4)
  for (const minimumWidth of [0, -1, Number.NaN]) {
    assert.equal(calculateNumericStatistics([], 10, 'LINEAR', minimumWidth, null, 2).histogram?.binWidth, 1)
  }
})

test('手動上限と幅で通常200階級を許容し、200超や不正値は自動設定へ戻す', () => {
  const source = [0, 100, 300]
  const automatic = calculateNumericStatistics(source, 10, 'LINEAR', 1)
  const maximum = calculateNumericStatistics(source, 10, 'LINEAR', 1, 1, MAX_CUSTOM_LINEAR_BIN_COUNT)

  assert.equal(maximum.histogram?.normalBinCount, MAX_CUSTOM_LINEAR_BIN_COUNT)
  assert.equal(maximum.bins.length, MAX_CUSTOM_LINEAR_BIN_COUNT + 1)
  assert.equal(maximum.bins.at(-1)?.count, 1)
  for (const upperBound of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_CUSTOM_LINEAR_BIN_COUNT + 1]) {
    assert.deepEqual(calculateNumericStatistics(source, 10, 'LINEAR', 1, 1, upperBound), automatic)
  }
  for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.001]) {
    assert.deepEqual(calculateNumericStatistics(source, 10, 'LINEAR', 1, width, 100), automatic)
  }
  assert.equal(calculateNumericStatistics([], 10, 'LINEAR', 1, 1, 201).histogram, null)
  assert.deepEqual(
    calculateNumericStatistics([0], 10, 'LINEAR', 1, null, 201),
    calculateNumericStatistics([0], 10, 'LINEAR', 1),
  )
})

test('手動上限でも平均・四分位数・分散は超過値を含む全数値から算出する', () => {
  const source = [...hpWithOverflow, null, undefined, Number.NaN]
  const { bins: _automaticBins, histogram: _automaticHistogram, ...automatic } = calculateNumericStatisticsWithDispersion(source)
  const { bins, histogram, ...manual } = calculateNumericStatisticsWithDispersion(source, 10, 'LINEAR', 1, 5_000, 20_000)

  assert.deepEqual(manual, automatic)
  assert.equal(histogram?.normalRangeEnd, 20_000)
  assert.equal(bins.at(-1)?.count, 82)
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), hpWithOverflow.length)
})

test('手動上限と幅の合計が非有限になる設定は通常データ・空データとも自動へ戻す', () => {
  for (const source of [[0, 10, 100], []]) {
    const automatic = calculateNumericStatistics(source, 10, 'LINEAR', 1)
    const result = calculateNumericStatistics(source, 10, 'LINEAR', 1, 1e308, 1e308)

    assert.deepEqual(result, automatic)
    assert.ok(result.bins.every((bin) => Number.isFinite(bin.start) && Number.isFinite(bin.end)))
  }
})

test('対数目盛と負値を含む分布は手動上限・幅を無視し、既存の階級を維持する', () => {
  for (const source of [[0, 10, 100], [-10, 0, 100]]) {
    for (const scale of ['LOG', 'LINEAR'] as const) {
      if (scale === 'LINEAR' && source[0] >= 0) continue
      assert.deepEqual(
        calculateNumericStatistics(source, 3, scale, 1, 5, 10),
        calculateNumericStatistics(source, 3, scale, 1),
      )
    }
  }
  assert.equal(calculateNumericStatistics([], 10, 'LOG', 1, 5, 100).histogram, null)
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

  const result = calculateNumericStatistics([excessiveMaximum, excessiveMaximum], 10, 'LINEAR', 1, 1)
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
