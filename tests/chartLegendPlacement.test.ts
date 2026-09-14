import test from 'node:test'
import assert from 'node:assert/strict'
import { placeChartLegend } from '../src/lib/chartLegendPlacement.ts'

const plot = { x: 0, y: 0, width: 100, height: 80 }
const legend = { width: 20, height: 10 }
const corners = [
  { x: 80, y: 15 },
  { x: 20, y: 15 },
  { x: 80, y: 65 },
  { x: 20, y: 65 },
]

test('右上、左上、右下、左下の順で空いている角を安定して選ぶ', () => {
  const names = ['top-right', 'top-left', 'bottom-right', 'bottom-left']
  for (let count = 0; count < corners.length; count += 1) {
    const result = placeChartLegend({ plot, legend, lines: corners.slice(0, count).map((point) => [point]) })
    assert.equal(result?.corner, names[count])
  }
  assert.deepEqual(placeChartLegend({ plot: { ...plot, x: 35, y: 25 }, legend }), {
    x: 105, y: 35, width: 20, height: 10, corner: 'top-right',
  })
})

test('線分の両端が凡例の外にあっても、途中で横切る角を避ける', () => {
  const result = placeChartLegend({ plot, legend, lines: [[{ x: 50, y: 15 }, { x: 110, y: 15 }]] })
  assert.equal(result?.corner, 'top-left')
})

test('斜めの線分との交差を調べ、包囲矩形が重なるだけの線は避けすぎない', () => {
  assert.equal(placeChartLegend({ plot, legend, lines: [[{ x: 50, y: -20 }, { x: 110, y: 40 }]] })?.corner, 'top-left')
  assert.equal(placeChartLegend({ plot, legend, lines: [[{ x: 50, y: 0 }, { x: 100, y: 100 }]] })?.corner, 'top-right')
})

test('余白の境界に線分や単独点が接触する場合も衝突とする', () => {
  assert.equal(placeChartLegend({ plot, legend, lines: [[{ x: 96, y: 0 }, { x: 96, y: 30 }]] })?.corner, 'top-left')
  assert.equal(placeChartLegend({ plot, legend, lines: [[{ x: 64, y: 4 }]] })?.corner, 'top-left')
  assert.equal(placeChartLegend({ plot, legend, lines: [[{ x: 96.01, y: 4 }]] })?.corner, 'top-right')
})

test('長さゼロの線分も点として判定する', () => {
  assert.equal(placeChartLegend({ plot, legend, lines: [[corners[0], corners[0]]] })?.corner, 'top-left')
})

test('四隅がすべて埋まる場合はグラフ外へ戻す', () => {
  assert.equal(placeChartLegend({ plot, legend, lines: corners.map((point) => [point]) }), null)
})

test('凡例と指定の内側余白を収められない場合はグラフ外へ戻す', () => {
  assert.equal(placeChartLegend({ plot, legend: { width: 81, height: 10 } }), null)
  assert.equal(placeChartLegend({ plot, legend: { width: 20, height: 61 } }), null)
  assert.deepEqual(placeChartLegend({ plot, legend: { width: 80, height: 60 } }), {
    x: 10, y: 10, width: 80, height: 60, corner: 'top-right',
  })
})

test('nullや非有限の点をまたいで線分をつながない', () => {
  for (const gap of [null, { x: NaN, y: 15 }, { x: 80, y: Infinity }]) {
    assert.equal(placeChartLegend({ plot, legend, lines: [[{ x: 50, y: 15 }, gap, { x: 110, y: 15 }]] })?.corner, 'top-right')
  }
  assert.equal(placeChartLegend({ plot, legend, lines: [[null, corners[0], null]] })?.corner, 'top-left')
})

test('矩形の障害物にも余白を取り、境界接触と内包のどちらも避ける', () => {
  for (const obstacle of [
    { x: 96, y: 15, width: 3, height: 2 },
    { x: 80, y: 15, width: 1, height: 1 },
    { x: 60, y: 0, width: 40, height: 30 },
  ]) {
    assert.equal(placeChartLegend({ plot, legend, obstacles: [obstacle] })?.corner, 'top-left')
  }
  assert.equal(placeChartLegend({ plot, legend, obstacles: [plot] }), null)
})

test('系列と矩形障害物を同時に避ける', () => {
  assert.equal(placeChartLegend({
    plot,
    legend,
    lines: [[corners[0]]],
    obstacles: [{ x: 20, y: 15, width: 1, height: 1 }],
  })?.corner, 'bottom-right')
})

test('内側余白と線からの距離を指定できる', () => {
  assert.deepEqual(placeChartLegend({ plot, legend, inset: 0, clearance: 0 }), {
    x: 80, y: 0, width: 20, height: 10, corner: 'top-right',
  })
  assert.equal(placeChartLegend({ plot, legend, clearance: 0, lines: [[{ x: 95, y: 15 }]] })?.corner, 'top-right')
  assert.equal(placeChartLegend({ plot, legend, clearance: 6, lines: [[{ x: 95, y: 15 }]] })?.corner, 'top-left')
})

test('非有限値や不正な寸法のグラフ・凡例はグラフ外へ戻す', () => {
  for (const invalidPlot of [
    { ...plot, x: NaN }, { ...plot, y: Infinity },
    { ...plot, width: -1 }, { ...plot, height: 0 }, { ...plot, height: Infinity },
  ]) assert.equal(placeChartLegend({ plot: invalidPlot, legend }), null)
  for (const invalidLegend of [
    { width: NaN, height: 10 }, { width: 20, height: Infinity },
    { width: 0, height: 10 }, { width: 20, height: -1 },
  ]) assert.equal(placeChartLegend({ plot, legend: invalidLegend }), null)
  for (const invalidMargin of [NaN, Infinity, -1]) {
    assert.equal(placeChartLegend({ plot, legend, inset: invalidMargin }), null)
    assert.equal(placeChartLegend({ plot, legend, clearance: invalidMargin }), null)
  }
})

test('描画できない障害物や空の系列は配置を妨げない', () => {
  assert.equal(placeChartLegend({
    plot,
    legend,
    lines: [[], [null], [{ x: NaN, y: NaN }]],
    obstacles: [
      { x: NaN, y: 0, width: 100, height: 80 },
      { x: 0, y: 0, width: -1, height: 80 },
      { x: 0, y: 0, width: 100, height: Infinity },
    ],
  })?.corner, 'top-right')
})

test('元のグラフ、凡例、系列、障害物を変更しない', () => {
  const options = { plot, legend, lines: [[corners[0], null, corners[2]]], obstacles: [{ x: 20, y: 15, width: 2, height: 2 }] }
  const before = structuredClone(options)
  const result = placeChartLegend(options)
  assert.deepEqual(options, before)
  assert.equal(result?.corner, 'bottom-left')
})
