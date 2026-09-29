import test from 'node:test'
import assert from 'node:assert/strict'
import type { HistogramBin } from '../src/lib/enemyStatistics.ts'
import { canFitHistogramBinRangeLabels, formatHistogramBinRangeLines } from '../src/lib/histogramBinRangeLabels.ts'

const bin = (start: number, end: number, isOverflow = false): HistogramBin => ({
  start, end, count: 1, includesMaximum: true, isOverflow,
})

test('整数の階級を棒の下の2行にし、万表記を使える境界だけ短縮する', () => {
  assert.deepEqual(formatHistogramBinRangeLines(bin(0, 10_000)), ['0〜', '1万'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(10_000, 15_000)), ['1万〜', '1.5万'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(15_000, 123_456)), ['1.5万〜', '123,456'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(-15_000, -10_000)), ['-1.5万〜', '-1万'])
})

test('小数の階級境界は整数へ丸めず、単位を追加しない', () => {
  assert.deepEqual(formatHistogramBinRangeLines(bin(0.1, 0.25)), ['0.1〜', '0.25'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(0.000_001, 0.000_002)), ['0.000001〜', '0.000002'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(9_999.5, 10_000.5)), ['9,999.5〜', '10,000.5'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(-0, 0.5)), ['0〜', '0.5'])
})

test('上限超過の階級は上限値と超だけを表示し、最大値を範囲として並べない', () => {
  assert.deepEqual(formatHistogramBinRangeLines(bin(100_000, 5_000_000, true)), ['10万超'])
  assert.deepEqual(formatHistogramBinRangeLines(bin(0.25, 0.9, true)), ['0.25超'])
})

test('同じ境界の階級は値だけを表示し、不正な境界は表示しない', () => {
  assert.deepEqual(formatHistogramBinRangeLines(bin(2.5, 2.5)), ['2.5'])
  for (const [start, end] of [[NaN, 1], [0, NaN], [-Infinity, 1], [0, Infinity], [2, 1]]) {
    assert.deepEqual(formatHistogramBinRangeLines(bin(start, end)), [])
  }
})

test('端に一致し隣の文字との間隔がちょうど確保できるラベルは表示できる', () => {
  const labels = [{ center: 20, width: 20 }, { center: 44, width: 20 }]
  assert.equal(canFitHistogramBinRangeLabels(labels, 10, 54), true)
  assert.equal(canFitHistogramBinRangeLabels(labels, 10.01, 54), false)
  assert.equal(canFitHistogramBinRangeLabels(labels, 10, 53.99), false)
  assert.equal(canFitHistogramBinRangeLabels(labels, 10, 54, 4.01), false)
})

test('棒の中心を動かさず、狭い画面や文字が長い階級では数値目盛りに戻す', () => {
  const widths = [24, 32, 40]
  const atWidth = (width: number) => widths.map((labelWidth, i) => ({ center: width / 3 * (i + 0.5), width: labelWidth }))
  assert.equal(canFitHistogramBinRangeLabels(atWidth(180), 0, 180), true)
  assert.equal(canFitHistogramBinRangeLabels(atWidth(90), 0, 90), false)
  assert.equal(canFitHistogramBinRangeLabels([{ center: 12, width: 28 }], 0, 40), false)
})

test('階級数が多くても実際の幅が確保できる場合は表示する', () => {
  const labels = Array.from({ length: 30 }, (_, i) => ({ center: 10 + i * 24, width: 20 }))
  assert.equal(canFitHistogramBinRangeLabels(labels, 0, 716), true)
  assert.equal(canFitHistogramBinRangeLabels(labels.map((label) => ({ ...label, width: 21 })), 0, 720), false)
})

test('全体の余白に空きがあっても局所的な密集や重なりがあれば範囲表示にしない', () => {
  assert.equal(canFitHistogramBinRangeLabels([{ center: 20, width: 20 }, { center: 39, width: 20 }], 0, 300), false)
  assert.equal(canFitHistogramBinRangeLabels([{ center: 50, width: 10 }, { center: 50, width: 10 }], 0, 300), false)
})

test('入力順に依存せず、元のラベル配列と位置を変更しない', () => {
  const labels = Object.freeze([Object.freeze({ center: 80, width: 20 }), Object.freeze({ center: 20, width: 20 })])
  assert.equal(canFitHistogramBinRangeLabels(labels, 0, 100), true)
  assert.deepEqual(labels, [{ center: 80, width: 20 }, { center: 20, width: 20 }])
})

test('空または未計測のラベル、不正なグラフ寸法では範囲表示に切り替えない', () => {
  assert.equal(canFitHistogramBinRangeLabels([], 0, 100), false)
  for (const width of [0, -1, NaN, Infinity]) {
    assert.equal(canFitHistogramBinRangeLabels([{ center: 50, width }], 0, 100), false)
  }
  for (const center of [NaN, Infinity, -Infinity]) {
    assert.equal(canFitHistogramBinRangeLabels([{ center, width: 20 }], 0, 100), false)
  }
  for (const [left, right, gap] of [[0, 0, 4], [100, 0, 4], [NaN, 100, 4], [0, Infinity, 4], [0, 100, -1], [0, 100, NaN]]) {
    assert.equal(canFitHistogramBinRangeLabels([{ center: 50, width: 20 }], left, right, gap), false)
  }
})
