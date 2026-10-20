import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHistogramCumulativeRows } from '../src/lib/histogramCumulative.ts'
import { calculateNumericStatistics } from '../src/lib/enemyStatistics.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { calculateWeightedEmpiricalCdf } from '../src/lib/enemyWeightedEcdf.ts'
import { calculateEcdfGuideReadings } from '../src/lib/enemyEcdfGuides.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'

test('累積割合は表示用に丸めた割合を足さず、生の件数から計算する', () => {
  const bins = [1, 1, 1].map(count => ({ count }))
  const rows = buildHistogramCumulativeRows(bins, 3)
  assert.deepEqual(rows.map(row => row.cumulativeCount), [1, 2, 3])
  assert.deepEqual(rows.map(row => row.proportion), [1 / 3, 1 / 3, 1 / 3])
  assert.deepEqual(rows.map(row => row.cumulativeProportion), [1 / 3, 2 / 3, 1])
  const roundedSum = rows.reduce((sum, row) => sum + Number((row.proportion! * 100).toFixed(1)), 0)
  assert.equal(Number(roundedSum.toFixed(1)), 99.9)
  assert.equal(rows.at(-1)?.cumulativeProportion, 1)
})

test('空階級も残し、度数0の階級では累積割合を維持する', () => {
  const rows = buildHistogramCumulativeRows([2, 0, 3, 0].map(count => ({ count })), 5)
  assert.deepEqual(rows.map(row => row.cumulativeCount), [2, 2, 5, 5])
  assert.deepEqual(rows.map(row => row.cumulativeProportion), [0.4, 0.4, 1, 1])
  assert.deepEqual(rows.map(row => row.proportion), [0.4, 0, 0.6, 0])
})

test('欠損を除いた有効データを分母にし、上限超過の件数も最後まで累積する', () => {
  const statistics = calculateNumericStatistics([0, 10, 20, 1_000, null, undefined, NaN], 10, 'LINEAR', 1, 10, 20)
  const before = structuredClone(statistics.bins)
  const rows = buildHistogramCumulativeRows(statistics.bins, statistics.count)
  assert.equal(statistics.count, 4)
  assert.equal(statistics.missingCount, 3)
  assert.deepEqual(rows.map(row => row.cumulativeCount), [1, 3, 4])
  assert.deepEqual(rows.map(row => row.cumulativeProportion), [0.25, 0.75, 1])
  assert.equal(rows[1].bin.includesMaximum, true)
  assert.equal(rows[2].bin.isOverflow, true)
  assert.strictEqual(rows[2].bin, statistics.bins[2])
  assert.deepEqual(statistics.bins, before)
})

test('出現回数・小数重みの集計は行数でなく有効な重みの合計を使う', () => {
  const observations = [
    { value: 0, weight: 0.25 }, { value: 10, weight: 0.5 }, { value: 1_000, weight: 0.25 },
    { value: null, weight: 84 }, { value: 0, weight: -1 }, { value: 0, weight: Infinity },
  ]
  const statistics = calculateWeightedHistogram(observations, { customLinearBinWidth: 10, customLinearUpperBound: 20 })
  const rows = buildHistogramCumulativeRows(statistics.bins, statistics.count)
  assert.equal(statistics.count, 1)
  assert.equal(statistics.missingCount, 84)
  assert.deepEqual(rows.map(row => row.cumulativeCount), [0.25, 0.75, 1])
  assert.deepEqual(rows.map(row => row.cumulativeProportion), [0.25, 0.75, 1])
})

test('通常階級の累積は30未満であり、ECDFの30以下とは境界値の分だけ異なる', () => {
  const observations = [{ value: 0, weight: 1 }, { value: 20, weight: 2 }, { value: 30, weight: 3 }]
  const statistics = calculateWeightedHistogram(observations, { customLinearBinWidth: 10, customLinearUpperBound: 100 })
  const row = buildHistogramCumulativeRows(statistics.bins, statistics.count)[2]
  assert.equal(row.bin.end, 30)
  assert.equal(row.bin.includesMaximum, false)
  assert.equal(row.cumulativeCount, 3)
  assert.equal(row.cumulativeProportion, 0.5)
  const reading = calculateEcdfGuideReadings(calculateWeightedEmpiricalCdf(observations), { x: 30, yPercent: null })
  assert.equal(reading.x?.cumulativeCount, 6)
  assert.equal(reading.x?.proportion, 1)
})

test('評価階級の情報と順序を維持し、開閉境界を数値階級へ置き換えない', () => {
  const bins = buildEnemyRatingHistogramBins([
    { value: 0, weight: 1 }, { value: 1, weight: 2 }, { value: 90, weight: 3 }, { value: 100, weight: 4 },
  ], 'magicResistance')
  const before = structuredClone(bins)
  const rows = buildHistogramCumulativeRows(bins, 10)
  assert.equal(rows.length, 10)
  assert.deepEqual(rows.map(row => row.bin.rating), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'])
  assert.equal(rows[0].bin.upperInclusive, true)
  assert.equal(rows[1].bin.lowerInclusive, false)
  assert.equal(rows.at(-1)?.cumulativeProportion, 1)
  rows.forEach((row, index) => assert.strictEqual(row.bin, bins[index]))
  assert.deepEqual(bins, before)
})

test('空データと無効な分母でNaNやInfinityを返さず、固定の空階級を保つ', () => {
  assert.deepEqual(buildHistogramCumulativeRows([], 0), [])
  assert.deepEqual(buildHistogramCumulativeRows([], 10), [])
  for (const total of [0, -1, NaN, Infinity, -Infinity]) {
    const rows = buildHistogramCumulativeRows([{ count: 0 }, { count: 0 }], total)
    assert.deepEqual(rows.map(row => [row.cumulativeCount, row.proportion, row.cumulativeProportion]), [
      [0, null, null], [0, null, null],
    ])
  }
  assert.equal(buildHistogramCumulativeRows([{ count: 5 }], 0)[0].cumulativeCount, 5)
})

test('壊れた件数や累積オーバーフローは部分的な累積線として描ける値を返さない', () => {
  for (const invalid of [-1, NaN, Infinity, -Infinity]) {
    const rows = buildHistogramCumulativeRows([{ count: 1 }, { count: invalid }, { count: 2 }], 3)
    assert.deepEqual(rows.map(row => row.cumulativeCount), [1, null, null])
    assert.ok(rows.every(row => row.proportion === null && row.cumulativeProportion === null))
  }
  const overflow = buildHistogramCumulativeRows([{ count: Number.MAX_VALUE }, { count: Number.MAX_VALUE }], Number.MAX_VALUE)
  assert.deepEqual(overflow.map(row => row.cumulativeCount), [Number.MAX_VALUE, null])
  assert.ok(overflow.every(row => row.cumulativeProportion === null))
  const tooSmallTotal = buildHistogramCumulativeRows([{ count: 2 }, { count: 3 }], 4)
  assert.ok(tooSmallTotal.every(row => row.cumulativeProportion === null))
})

test('小数重みの加算誤差だけを許容し、軸の100%を超えない', () => {
  const rows = buildHistogramCumulativeRows([{ count: 0.1 }, { count: 0.2 }], 0.3)
  assert.equal(rows[1].cumulativeCount, 0.1 + 0.2)
  assert.equal(rows[1].cumulativeProportion, 1)
  assert.ok(rows.every(row => row.proportion !== null && row.proportion >= 0 && row.proportion <= 1))
  assert.equal(buildHistogramCumulativeRows([{ count: Number.MAX_VALUE }], Number.MAX_VALUE)[0].cumulativeProportion, 1)
})

test('分母より少ない一部の階級を渡しても最後を強制的に100%へ変更しない', () => {
  const rows = buildHistogramCumulativeRows([{ count: 2 }, { count: 4 }], 10)
  assert.deepEqual(rows.map(row => row.cumulativeProportion), [0.2, 0.6])
})
