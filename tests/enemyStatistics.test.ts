import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateNumericStatistics } from '../src/lib/enemyStatistics.ts'

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
})

test('すべて同じ値の場合は1区間の分布にする', () => {
  const result = calculateNumericStatistics([30, 30, 30], 10)

  assert.deepEqual(result.bins, [
    { start: 30, end: 30, count: 3, includesMaximum: true },
  ])
  assert.equal(result.standardDeviation, 0)
})

test('対数目盛でも全データをいずれかの区間へ含める', () => {
  const result = calculateNumericStatistics([0, 10, 100, 1000, 10000], 5, 'LOG')

  assert.equal(result.bins.length, 5)
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), 5)
  assert.equal(result.bins[0].start, 0)
  assert.equal(result.bins.at(-1)?.end, 10000)
})

test('有効な数値がない場合は統計量を空として返す', () => {
  const result = calculateNumericStatistics([null, undefined, Number.POSITIVE_INFINITY])

  assert.equal(result.count, 0)
  assert.equal(result.missingCount, 3)
  assert.equal(result.mean, null)
  assert.deepEqual(result.bins, [])
})
