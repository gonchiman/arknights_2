import assert from 'node:assert/strict'
import test from 'node:test'
import { getHistogramCumulativeStripLayout as layoutFor } from '../src/lib/histogramCumulativeStrip.ts'

const counts = [2702, 791, 2085, 1625, 759, 2958, 894, 92, 276, 31]
const bins = counts.map(count => ({ count }))
const total = counts.reduce((sum, count) => sum + count, 0)

test('cumulative strip uses raw counts with one shared percent unit', () => {
  const layout = layoutFor(bins, total, 900)!
  assert.deepEqual(layout.labels, ['22.1', '28.6', '45.7', '59', '65.2', '89.4', '96.7', '97.5', '99.7', '100'])
  assert.equal(layout.height, 46)
  assert.equal(layout.bandHeight, 24)
  assert.equal(layout.labelRotation, 0)
  assert.equal(layout.visibleIndices.length, 10)
})

test('ten narrow cells retain every value at readable size by rotating labels', () => {
  const layout = layoutFor(bins, total, 220)!
  assert.equal(layout.labelRotation, -90)
  assert.equal(layout.visibleIndices.length, 10)
  assert.equal(layout.labelStride, 1)
  assert.ok(layout.height > 46)
  assert.ok(layout.bandHeight >= Math.max(...layout.labels.map(label => label.length * 11 * 0.65)) + 9)
})

test('dense strips reserve enough space between labels and always include the final value', () => {
  const layout = layoutFor(Array.from({ length: 100 }, () => ({ count: 1 })), 100, 220)!
  assert.ok(layout.visibleIndices.length < 100)
  assert.equal(layout.visibleIndices.at(-1), 99)
  assert.equal(layout.labels[99], '100')
  for (let i = 1; i < layout.visibleIndices.length; i++) {
    assert.ok((layout.visibleIndices[i] - layout.visibleIndices[i - 1]) * 2.2 >= 15)
  }
})

test('tiny positive values stay distinct from zero, and decimal totals end at 100', () => {
  assert.deepEqual(layoutFor([{ count: 0 }, { count: 0.001 }, { count: 999.999 }], 1000, 300)!.labels,
    ['0', '<0.1', '100'])
  assert.deepEqual(layoutFor([{ count: 0.1 }, { count: 0.2 }], 0.3, 300)!.labels, ['33.3', '100'])
  assert.deepEqual(layoutFor([{ count: 5 }], 10, 300)!.labels, ['50'])
})

test('one class and zero-count classes have stable layout without synthetic endpoints', () => {
  const single = layoutFor([{ count: 4 }], 4, 250)!
  assert.deepEqual(single.labels, ['100'])
  assert.deepEqual(single.visibleIndices, [0])
  assert.equal(single.height, 46)
  assert.deepEqual(layoutFor([{ count: 0 }, { count: 4 }, { count: 0 }], 4, 300)!.labels, ['0', '100', '100'])
})

test('invalid data and dimensions never produce a misleading strip', () => {
  assert.equal(layoutFor([], 10, 300), null)
  for (const invalidTotal of [0, -1, NaN, Infinity]) assert.equal(layoutFor([{ count: 0 }], invalidTotal, 300), null)
  for (const invalidCount of [-1, NaN, Infinity, 11]) assert.equal(layoutFor([{ count: invalidCount }], 10, 300), null)
  for (const invalidWidth of [0, -1, NaN, Infinity]) assert.equal(layoutFor(bins, total, invalidWidth), null)
})
