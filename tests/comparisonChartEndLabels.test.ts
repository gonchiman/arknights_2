import test from 'node:test'
import assert from 'node:assert/strict'
import { placeChartEndLabels } from '../src/lib/comparisonChartEndLabels.ts'

test('同じ下端に集まる6系列を枠内に並べ、同値の系列順を保つ', () => {
  const labels = Array.from({ length: 6 }, (_, index) => ({ id: `series-${index}`, y: 280 }))
  const result = placeChartEndLabels(labels, 40, 280, 34)
  assert.deepEqual(result, labels.map((label, index) => ({ ...label, y: 110 + index * 34 })))
})

test('上端に集まる系列を下へずらして重なりを避ける', () => {
  const result = placeChartEndLabels([
    { id: 'above', y: -20 },
    { id: 'first', y: 40 },
    { id: 'second', y: 41 },
  ], 40, 280, 34)
  assert.deepEqual(result, [
    { id: 'above', y: 40 },
    { id: 'first', y: 74 },
    { id: 'second', y: 108 },
  ])
})

test('入力が順不同でも上下関係を保ち、離れたラベルを動かさない', () => {
  const result = placeChartEndLabels([
    { id: 'bottom', y: 230 },
    { id: 'top', y: 50 },
    { id: 'middle', y: 140 },
  ], 40, 280, 34)
  assert.deepEqual(result, [
    { id: 'top', y: 50 },
    { id: 'middle', y: 140 },
    { id: 'bottom', y: 230 },
  ])
})

test('上下両端に系列が集中しても間隔と表示範囲を守る', () => {
  const result = placeChartEndLabels([
    { id: 'top-a', y: 40 },
    { id: 'top-b', y: 41 },
    { id: 'bottom-a', y: 279 },
    { id: 'bottom-b', y: 280 },
  ], 40, 280, 34)
  assert.deepEqual(result, [
    { id: 'top-a', y: 40 },
    { id: 'top-b', y: 74 },
    { id: 'bottom-a', y: 246 },
    { id: 'bottom-b', y: 280 },
  ])
})

test('高さが足りないときはラベルを枠外へ出さず間隔を縮める', () => {
  const labels = Array.from({ length: 6 }, (_, index) => ({ id: `${index}`, y: 100 }))
  assert.deepEqual(
    placeChartEndLabels(labels, 40, 100, 34),
    labels.map((label, index) => ({ ...label, y: 40 + index * 12 })),
  )
  assert.deepEqual(
    placeChartEndLabels(labels, 40, 40, 34),
    labels.map((label) => ({ ...label, y: 40 })),
  )
})

test('空配列と1系列を扱い、単独のラベルも範囲内に収める', () => {
  assert.deepEqual(placeChartEndLabels([], 40, 280, 34), [])
  assert.deepEqual(placeChartEndLabels([{ id: 'only', y: 140 }], 40, 280, 34), [{ id: 'only', y: 140 }])
  assert.deepEqual(placeChartEndLabels([{ id: 'only', y: -1 }], 40, 280, 34), [{ id: 'only', y: 40 }])
  assert.deepEqual(placeChartEndLabels([{ id: 'only', y: 300 }], 40, 280, 34), [{ id: 'only', y: 280 }])
})

test('入力配列と元のラベルを変更しない', () => {
  const labels = [{ id: 'b', y: 280 }, { id: 'a', y: 279 }]
  const before = structuredClone(labels)
  const result = placeChartEndLabels(labels, 40, 280, 34)
  assert.deepEqual(labels, before)
  assert.notEqual(result, labels)
  for (const placed of result) assert.notEqual(placed, labels.find((label) => label.id === placed.id))
})
