import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateNumericStatistics } from '../src/lib/enemyStatistics.ts'
import {
  calculateWeightedHistogram,
  type WeightedHistogramObservation,
} from '../src/lib/enemyWeightedHistogram.ts'

function summary(result: ReturnType<typeof calculateWeightedHistogram>) {
  const { bins: _bins, histogram: _histogram, ...statistics } = result
  return statistics
}

test('重みがすべて1なら既存の統計量と階級をそのまま再現する', () => {
  const values = [...Array.from({ length: 50 }, () => 1), 2, 3, 4, 100, null, undefined, Number.NaN]
  for (const scale of ['LINEAR', 'LOG'] as const) {
    assert.deepEqual(
      calculateWeightedHistogram(values.map((value) => ({ value, weight: 1 })), { scale }),
      calculateNumericStatistics(values, 10, scale),
    )
  }
})

test('整数の出現数で重み付けした統計量は展開した少数の検証標本と一致する', () => {
  const source = [
    { value: 10, weight: 2 },
    { value: 50, weight: 3 },
    { value: 50, weight: 2 },
    { value: 100, weight: 1 },
    { value: null, weight: 4 },
  ]
  const expanded = source.flatMap(({ value, weight }) => Array.from({ length: weight }, () => value))
  const result = calculateWeightedHistogram(source)
  assert.deepEqual(summary(result), summary(calculateNumericStatistics(expanded)))
  assert.equal(result.count, 8)
  assert.equal(result.missingCount, 4)
  assert.equal(result.mean, 46.25)
  assert.equal(result.median, 50)
  assert.equal(result.firstQuartile, 40)
  assert.equal(result.thirdQuartile, 50)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 8)
})

test('正の重みを変えても階級の境界は移動しない', () => {
  const source = [...Array.from({ length: 20 }, () => 10), 100, 10_000]
  const equal = calculateWeightedHistogram(source.map((value) => ({ value, weight: 1 })))
  const weighted = calculateWeightedHistogram(source.map((value) => ({ value, weight: value === 10_000 ? 1_000_000 : 2 })))
  assert.deepEqual(weighted.histogram, equal.histogram)
  assert.deepEqual(
    weighted.bins.map(({ count: _count, ...bin }) => bin),
    equal.bins.map(({ count: _count, ...bin }) => bin),
  )
  assert.equal(weighted.bins.at(-1)?.count, 1_000_000)
  assert.equal(weighted.median, 10_000)
})

test('非常に大きい出現数も配列展開せずに集計する', () => {
  const weight = 1_000_000_000_000
  const result = calculateWeightedHistogram([
    { value: 0, weight },
    { value: 20, weight: weight * 3 },
  ])
  assert.equal(result.count, weight * 4)
  assert.equal(result.mean, 15)
  assert.equal(result.firstQuartile, 15)
  assert.equal(result.median, 20)
  assert.equal(result.thirdQuartile, 20)
  assert.equal(result.standardDeviation, Math.sqrt(75))
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), weight * 4)
  assert.ok(result.bins.length <= 11)
})

test('小数の期待出現数では重み付き分布と平均・母標準偏差を返す', () => {
  const source = [{ value: 0, weight: 0.25 }, { value: 10, weight: 0.75 }]
  const result = calculateWeightedHistogram(source)
  assert.equal(result.count, 1)
  assert.equal(result.mean, 7.5)
  assert.equal(result.firstQuartile, 5)
  assert.equal(result.median, 10)
  assert.equal(result.thirdQuartile, 10)
  assert.equal(result.standardDeviation, Math.sqrt(18.75))
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 1)
  assert.deepEqual(
    summary(calculateWeightedHistogram([
      { value: 0, weight: 0.125 },
      { value: 0, weight: 0.125 },
      { value: 10, weight: 0.75 },
    ])),
    summary(result),
  )
})

test('ゼロ・負・非有限の重みは除外し、欠損値の正の重みだけを欠損数へ加える', () => {
  const result = calculateWeightedHistogram([
    { value: 10, weight: 2 },
    { value: 20, weight: 0 },
    { value: 30, weight: -1 },
    { value: 40, weight: Number.NaN },
    { value: 50, weight: Number.POSITIVE_INFINITY },
    { value: null, weight: 3 },
    { value: undefined, weight: 4 },
    { value: Number.NaN, weight: 5 },
    { value: Number.NEGATIVE_INFINITY, weight: 0.5 },
    { value: null, weight: -1 },
  ])
  assert.equal(result.totalCount, 14.5)
  assert.equal(result.count, 2)
  assert.equal(result.missingCount, 12.5)
  assert.equal(result.minimum, 10)
  assert.equal(result.maximum, 10)
  assert.equal(result.mean, 10)
  assert.equal(result.standardDeviation, 0)
})

test('空と欠損のみでも固定した幅・上限の空階級を保持する', () => {
  for (const source of [[], [{ value: null, weight: 4 }], [{ value: 1, weight: 0 }]]) {
    const result = calculateWeightedHistogram(source, { customLinearBinWidth: 10, customLinearUpperBound: 30 })
    assert.equal(result.count, 0)
    assert.equal(result.missingCount, source[0]?.weight ?? 0)
    assert.equal(result.mean, null)
    assert.equal(result.median, null)
    assert.equal(result.standardDeviation, null)
    assert.equal(result.histogram?.normalRangeEnd, 30)
    assert.deepEqual(result.bins.map(({ count }) => count), [0, 0, 0, 0])
  }
  assert.equal(calculateWeightedHistogram([]).histogram, null)
  assert.deepEqual(calculateWeightedHistogram([]).bins, [])
})

test('通常の境界・最後の上限・超過階級を重複なく重み付けする', () => {
  const result = calculateWeightedHistogram([
    { value: 0, weight: 1 },
    { value: 10, weight: 2 },
    { value: 20, weight: 3 },
    { value: 25, weight: 4 },
    { value: 25.000001, weight: 5 },
    { value: 100, weight: 6 },
  ], { customLinearBinWidth: 10, customLinearUpperBound: 25 })
  assert.deepEqual(result.bins.map(({ count }) => count), [1, 2, 7, 11])
  assert.equal(result.bins.at(-2)?.includesMaximum, true)
  assert.equal(result.bins.at(-2)?.end, 25)
  assert.equal(result.bins.at(-1)?.isOverflow, true)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 21)
})

test('小数境界の丸めと厳密な手動上限を既存の振り分けと一致させる', () => {
  const values = [0, 0.1, 0.2, 0.3, 0.30000000000000004, 1]
  const result = calculateWeightedHistogram(values.map((value) => ({ value, weight: 2 })), {
    customLinearBinWidth: 0.1,
    customLinearUpperBound: 0.3,
  })
  assert.deepEqual(result.bins.map(({ count }) => count), [2, 2, 4, 4])

  const tiny = calculateWeightedHistogram([0, 1e-18, 5e-18, 1e-17, 1.01e-17].map((value) => ({ value, weight: 3 })), {
    customLinearBinWidth: 5e-18,
    customLinearUpperBound: 1e-17,
  })
  assert.deepEqual(tiny.bins.map(({ count }) => count), [6, 6, 3])
})

test('自動上限でも超過値の重みを専用階級にまとめる', () => {
  const result = calculateWeightedHistogram([
    ...Array.from({ length: 100 }, (_, value) => ({ value, weight: 2 })),
    { value: 10_000, weight: 7 },
  ])
  assert.equal(result.histogram?.normalRangeEnd, 100)
  assert.equal(result.bins.at(-1)?.isOverflow, true)
  assert.equal(result.bins.at(-1)?.count, 7)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 207)
})

test('対数は0を含めて集計し、負値があれば線形へ戻す', () => {
  for (const values of [[0, 10, 100, 1000], [-10, 0, 100]]) {
    const result = calculateWeightedHistogram(values.map((value) => ({ value, weight: 3 })), {
      scale: 'LOG', preferredBinCount: 3,
    })
    const reference = calculateNumericStatistics(values, 3, 'LOG')
    assert.deepEqual(result.histogram, reference.histogram)
    assert.deepEqual(result.bins, reference.bins.map((bin) => ({ ...bin, count: bin.count * 3 })))
    assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), values.length * 3)
  }
})

test('フィルター後の標本だけで再集計し、入力を変更しない', () => {
  const source: readonly WeightedHistogramObservation[] = Object.freeze([
    Object.freeze({ value: 10, weight: 3 }),
    Object.freeze({ value: 20, weight: 5 }),
    Object.freeze({ value: 100, weight: 7 }),
  ])
  const filtered = calculateWeightedHistogram(source.filter(({ value }) => value !== 100))
  const complete = calculateWeightedHistogram(source)
  assert.equal(filtered.count, 8)
  assert.equal(filtered.maximum, 20)
  assert.equal(filtered.mean, 16.25)
  assert.equal(complete.count, 15)
  assert.equal(source[0].weight, 3)
})

test('最低上限100の空階級を重み付きでも保持し、90の所属と統計量を正しく更新する', () => {
  const source = [
    { value: 0, weight: 2 },
    { value: 80, weight: 3 },
    { value: 90, weight: 5 },
    { value: null, weight: 7 },
  ]
  const original = calculateWeightedHistogram(source, { customLinearBinWidth: 10 })
  const result = calculateWeightedHistogram(source, { customLinearBinWidth: 10, minimumLinearUpperBound: 100 })
  assert.equal(original.bins.at(-1)?.count, 8)
  assert.equal(result.histogram?.normalRangeEnd, 100)
  assert.deepEqual(result.bins.map(({ count }) => count), [2, 0, 0, 0, 0, 0, 0, 0, 3, 5])
  assert.deepEqual(summary(result), summary(original))
  assert.equal(result.count, 10)
  assert.equal(result.missingCount, 7)
  assert.equal(result.mean, 69)
  assert.equal(result.maximum, 90)

  const lowValues = calculateWeightedHistogram([{ value: 20, weight: 9 }], { minimumLinearUpperBound: 100 })
  assert.equal(lowValues.histogram?.normalRangeEnd, 100)
  assert.equal(lowValues.bins.length, 10)
  assert.ok(lowValues.bins.filter(({ start }) => start >= 30).every(({ count }) => count === 0))
})

test('最低上限を指定した全階級幅で重み1の結果は通常の統計と一致する', () => {
  const values = [0, 5, 25, null]
  const observations = values.map((value) => ({ value, weight: 1 }))
  for (const width of [null, 1, 3, 5, 10, 20, 25, 7, 30, 120]) {
    assert.deepEqual(
      calculateWeightedHistogram(observations, { minimumLinearBinWidth: 1, customLinearBinWidth: width, minimumLinearUpperBound: 100 }),
      calculateNumericStatistics(values, 10, 'LINEAR', 1, width, null, 100),
    )
  }
  const result = calculateWeightedHistogram([
    { value: 97, weight: 2 }, { value: 98, weight: 3 }, { value: 100, weight: 5 },
  ], { customLinearBinWidth: 7, minimumLinearUpperBound: 100 })
  assert.equal(result.histogram?.normalRangeEnd, 100)
  assert.deepEqual(result.bins.slice(-2), [
    { start: 91, end: 98, count: 2, includesMaximum: false },
    { start: 98, end: 100, count: 8, includesMaximum: true },
  ])
})

test('最低上限100の超過階級にも出現数を全数加算し、100ちょうどは通常階級に含める', () => {
  const source = [
    ...Array.from({ length: 100 }, () => ({ value: 0, weight: 2 })),
    { value: 90, weight: 3 },
    { value: 100, weight: 5 },
    { value: 101, weight: 7 },
    { value: 150, weight: 11 },
  ]
  for (const width of [null, 7]) {
    const result = calculateWeightedHistogram(source, { customLinearBinWidth: width, minimumLinearUpperBound: 100 })
    assert.equal(result.histogram?.normalRangeEnd, 100)
    assert.equal(result.bins.at(-2)?.end, 100)
    assert.equal(result.bins.at(-2)?.count, width === null ? 8 : 5)
    assert.equal(result.bins.at(-1)?.isOverflow, true)
    assert.equal(result.bins.at(-1)?.count, 18)
    assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 226)
    assert.equal(result.count, 226)
    assert.equal(result.maximum, 150)
  }
})

test('重み付きでも手動上限が優先し、対数・負値・無効な最低上限は従来結果を保つ', () => {
  const source = [{ value: 0, weight: 2 }, { value: 50, weight: 3 }, { value: 90, weight: 5 }]
  const options = { customLinearBinWidth: 10, customLinearUpperBound: 50 }
  const manual = calculateWeightedHistogram(source, { ...options, minimumLinearUpperBound: 100 })
  assert.deepEqual(manual, calculateWeightedHistogram(source, options))
  assert.equal(manual.histogram?.normalRangeEnd, 50)
  assert.equal(manual.bins.at(-1)?.count, 5)

  assert.deepEqual(
    calculateWeightedHistogram(source, { scale: 'LOG', minimumLinearUpperBound: 100 }),
    calculateWeightedHistogram(source, { scale: 'LOG' }),
  )
  const negativeSource = [{ value: -10, weight: 2 }, ...source]
  assert.deepEqual(
    calculateWeightedHistogram(negativeSource, { minimumLinearUpperBound: 100 }),
    calculateWeightedHistogram(negativeSource),
  )
  for (const minimumUpperBound of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(
      calculateWeightedHistogram(source, { minimumLinearUpperBound: minimumUpperBound }),
      calculateWeightedHistogram(source),
    )
  }
})
