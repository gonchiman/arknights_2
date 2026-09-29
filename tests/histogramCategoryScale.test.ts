import test from 'node:test'
import assert from 'node:assert/strict'
import type { HistogramBin } from '../src/lib/enemyStatistics.ts'
import { createHistogramCategoryScale } from '../src/lib/histogramCategoryScale.ts'

const bin = (start: number, end: number, isOverflow = false): HistogramBin => ({
  start, end, count: 0, includesMaximum: false, ...(isOverflow ? { isOverflow } : {}),
})
const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`)

test('幅7の最後の98–100にも同じ表示幅を割り当て、数値の境界と補間位置を保つ', () => {
  const bins = Array.from({ length: 15 }, (_, index) => bin(index * 7, Math.min(100, (index + 1) * 7)))
  const scale = createHistogramCategoryScale(bins, 20, 320)
  for (let index = 0; index < bins.length; index += 1) {
    assert.equal(scale.start(index), 20 + index * 20)
    assert.equal(scale.end(index) - scale.start(index), 20)
    assert.equal(scale.position(bins[index].start), scale.start(index))
    assert.equal(scale.position(bins[index].end), scale.end(index))
  }
  assert.equal(scale.position(98), 300)
  assert.equal(scale.position(99), 310)
  assert.equal(scale.position(100), 320)
  assert.equal(scale.position(-1), 20)
  assert.equal(scale.position(101), 320)
})

test('超過階級も等幅にし、境界は通常階級の末尾、超えた値は超過列の中央に置く', () => {
  const scale = createHistogramCategoryScale([bin(0, 7), bin(7, 10), bin(10, 17, true)], 10, 310)
  assert.deepEqual([0, 1, 2].map((index) => scale.end(index) - scale.start(index)), [100, 100, 100])
  assert.equal(scale.position(7), 110)
  assert.equal(scale.position(8.5), 160)
  assert.equal(scale.position(10), 210)
  for (const value of [10.001, 17, 1_000_000, Infinity]) assert.equal(scale.position(value), 260)
  assert.equal(scale.position(-Infinity), 10)
})

test('対数では各階級内をlog1pで補間し、負の境界があれば線形に戻す', () => {
  const bins = [bin(0, 9), bin(9, 99)]
  const scale = createHistogramCategoryScale(bins, 0, 200, 'LOG')
  closeTo(scale.position(Math.sqrt(10) - 1), 50)
  assert.equal(scale.position(9), 100)
  closeTo(scale.position(Math.sqrt(1_000) - 1), 150)
  assert.equal(scale.position(99), 200)
  const negative = createHistogramCategoryScale([bin(-10, 0), bin(0, 90)], 0, 200, 'LOG')
  assert.equal(negative.position(-5), 50)
  assert.equal(negative.position(45), 150)
})

test('空・同値だけの階級を安全に扱い、入力の順序や境界を変更しない', () => {
  const empty = createHistogramCategoryScale([], 20, 320)
  assert.equal(empty.position(100), 20)
  assert.equal(empty.start(0), 20)
  assert.equal(empty.end(0), 20)
  const bins = Object.freeze([Object.freeze(bin(42, 42))])
  const single = createHistogramCategoryScale(bins, 20, 320)
  assert.equal(single.position(42), 170)
  assert.equal(single.start(0), 20)
  assert.equal(single.end(0), 320)
  assert.equal(single.position(41), 20)
  assert.equal(single.position(43), 320)
  assert.equal(single.position(NaN), 20)
  assert.deepEqual(bins, [bin(42, 42)])
})
