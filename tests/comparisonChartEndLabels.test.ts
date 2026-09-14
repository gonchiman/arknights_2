import test from 'node:test'
import assert from 'node:assert/strict'
import { placeChartEndLabels, placeChartEndLabelsInside } from '../src/lib/comparisonChartEndLabels.ts'

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

const insidePlot = { x: 0, y: 0, width: 400, height: 400 }
const insideLabel = { id: 'only', x: 400, y: 200, width: 100, height: 20 }

test('内部ラベルは右端に揃え、空いているときは端点の高さを維持する', () => {
  assert.deepEqual(placeChartEndLabelsInside({ plot: insidePlot, labels: [], lines: [] }), [])
  assert.deepEqual(placeChartEndLabelsInside({
    plot: { x: 20, y: 30, width: 400, height: 300 },
    labels: [{ ...insideLabel, y: 100, width: 80 }],
    lines: [],
  }), [{ ...insideLabel, x: 332, y: 90, width: 80 }])
})

test('枠の上下端にあるラベルも内側へ収める', () => {
  const result = placeChartEndLabelsInside({
    plot: insidePlot,
    labels: [{ ...insideLabel, id: 'bottom', y: 400 }, { ...insideLabel, id: 'top', y: 0 }],
    lines: [],
  })
  assert.deepEqual(result, [
    { ...insideLabel, id: 'top', x: 292, y: 8 },
    { ...insideLabel, id: 'bottom', x: 292, y: 372 },
  ])
})

test('同値の6系列は上下順を維持し、同じ線の両側へ分けて置ける', () => {
  const labels = Array.from({ length: 6 }, (_, index) => ({ ...insideLabel, id: `series-${index}`, height: 18 }))
  const result = placeChartEndLabelsInside({
    plot: insidePlot,
    labels,
    lines: [[{ x: 0, y: 200 }, { x: 400, y: 200 }]],
  })
  assert.ok(result)
  assert.deepEqual(result.map(({ id }) => id), labels.map(({ id }) => id))
  assert.equal(result.filter((label) => label.y + label.height < 200).length, 3)
  assert.equal(result.filter((label) => label.y > 200).length, 3)
  for (let index = 0; index < result.length; index += 1) {
    const label = result[index]
    assert.ok(label.y >= 8 && label.y + label.height <= 392)
    assert.ok(Math.abs(label.y + label.height / 2 - 200) <= 100)
    assert.ok(label.y + label.height + 6 < 200 || label.y - 6 > 200)
    if (index > 0) assert.ok(label.y >= result[index - 1].y + result[index - 1].height + 6 - 1e-9)
  }
})

test('点がラベル外でも、その間を横切る線分を避ける', () => {
  const result = placeChartEndLabelsInside({
    plot: { x: 0, y: 0, width: 300, height: 300 },
    labels: [{ ...insideLabel, x: 300, y: 240 }],
    lines: [[{ x: 0, y: 0 }, { x: 300, y: 300 }]],
  })
  assert.ok(result)
  // The line enters the expanded label band at x = y = 186.
  assert.ok(result[0].y + result[0].height + 6 < 186)
})

test('自系列と他系列の線、孤立点、障害物すべての余白を確保する', () => {
  const result = placeChartEndLabelsInside({
    plot: insidePlot,
    labels: [insideLabel],
    lines: [
      [{ x: 0, y: 200 }, { x: 400, y: 200 }],
      [{ x: 0, y: 240 }, { x: 400, y: 240 }],
      [{ x: 330, y: 180 }],
    ],
    obstacles: [{ x: 280, y: 100, width: 100, height: 60 }],
  })
  assert.ok(result)
  assert.ok(result[0].y > 206)
  assert.ok(result[0].y + result[0].height < 234)
})

test('nullと不正な点で線を途切れさせ、存在しない接続線を避けない', () => {
  for (const gapPoint of [null, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    const result = placeChartEndLabelsInside({
      plot: insidePlot,
      labels: [insideLabel],
      lines: [[{ x: 300, y: 0 }, gapPoint, { x: 300, y: 400 }]],
    })
    assert.deepEqual(result, [{ ...insideLabel, x: 292, y: 190 }])
  }
})

test('先のラベルを少しずらすことで後続のラベルも置ける配置を選ぶ', () => {
  const result = placeChartEndLabelsInside({
    plot: { x: 0, y: 0, width: 400, height: 120 },
    labels: [
      { ...insideLabel, id: 'narrow', y: 45, width: 40 },
      { ...insideLabel, id: 'wide', y: 50, width: 100 },
    ],
    lines: [],
    inset: 0,
    clearance: 0,
    gap: 5,
    obstacles: [{ x: 300, y: 61, width: 20, height: 59 }],
  })
  assert.ok(result)
  assert.ok(result[0].y < 35)
  assert.ok(result[1].y >= result[0].y + 25 - 1e-9)
  assert.ok(result[1].y + 20 < 61)
})

test('最大移動距離と隙間を守れなければ、部分配置を返さない', () => {
  assert.equal(placeChartEndLabelsInside({
    plot: insidePlot,
    labels: [insideLabel],
    lines: [[{ x: 0, y: 200 }, { x: 400, y: 200 }]],
    maxDisplacement: 16,
  }), null)
  assert.ok(placeChartEndLabelsInside({
    plot: insidePlot,
    labels: [insideLabel],
    lines: [[{ x: 0, y: 200 }, { x: 400, y: 200 }]],
    maxDisplacement: 17,
  }))
  assert.equal(placeChartEndLabelsInside({
    plot: { ...insidePlot, height: 40 },
    labels: [{ ...insideLabel, id: 'a', y: 20 }, { ...insideLabel, id: 'b', y: 20 }],
    lines: [],
    inset: 0,
    gap: 1,
  }), null)
})

test('幅や高さ不足、領域全体を遮る線・障害物は内部配置できない', () => {
  assert.equal(placeChartEndLabelsInside({ plot: { ...insidePlot, width: 110 }, labels: [insideLabel], lines: [] }), null)
  assert.equal(placeChartEndLabelsInside({ plot: { ...insidePlot, height: 30 }, labels: [insideLabel], lines: [] }), null)
  assert.equal(placeChartEndLabelsInside({
    plot: insidePlot, labels: [insideLabel], lines: [[{ x: 330, y: 0 }, { x: 330, y: 400 }]],
  }), null)
  assert.equal(placeChartEndLabelsInside({ plot: insidePlot, labels: [insideLabel], lines: [], obstacles: [insidePlot] }), null)
})

test('線・障害物との境界接触を許さず、ゼロの余白も指定できる', () => {
  const result = placeChartEndLabelsInside({
    plot: insidePlot,
    labels: [insideLabel],
    lines: [[{ x: 300, y: 180 }, { x: 300, y: 210 }]],
    inset: 0,
    clearance: 0,
    gap: 0,
  })
  assert.ok(result)
  assert.ok(result[0].y > 210 || result[0].y + 20 < 180)
  assert.equal(result[0].x, 300)
  assert.deepEqual(placeChartEndLabelsInside({
    plot: insidePlot, labels: [insideLabel], lines: [], maxDisplacement: 0,
  }), [{ ...insideLabel, x: 292, y: 190 }])
})

test('不正な配置入力は拒否し、描画されない不正障害物は無視する', () => {
  for (const value of [NaN, Infinity, -1]) {
    for (const option of ['inset', 'clearance', 'gap', 'maxDisplacement']) {
      assert.equal(placeChartEndLabelsInside({ plot: insidePlot, labels: [insideLabel], lines: [], [option]: value }), null)
    }
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.equal(placeChartEndLabelsInside({ plot: { ...insidePlot, [key]: NaN }, labels: [insideLabel], lines: [] }), null)
    assert.equal(placeChartEndLabelsInside({ plot: insidePlot, labels: [{ ...insideLabel, [key]: NaN }], lines: [] }), null)
  }
  assert.equal(placeChartEndLabelsInside({ plot: insidePlot, labels: [{ ...insideLabel, width: 0 }], lines: [] }), null)
  assert.equal(placeChartEndLabelsInside({ plot: insidePlot, labels: [insideLabel, insideLabel], lines: [] }), null)
  assert.deepEqual(placeChartEndLabelsInside({
    plot: insidePlot, labels: [insideLabel], lines: [], obstacles: [{ ...insidePlot, x: NaN }],
  }), [{ ...insideLabel, x: 292, y: 190 }])
})

test('内部配置でも元の配列、矩形、線の点を変更しない', () => {
  const options = {
    plot: { ...insidePlot },
    labels: [{ ...insideLabel, id: 'b', y: 240 }, { ...insideLabel, id: 'a', y: 80 }],
    lines: [[{ x: 0, y: 160 }, null, { x: 400, y: 160 }]],
    obstacles: [{ x: 0, y: 0, width: 30, height: 30 }],
  }
  const before = structuredClone(options)
  const result = placeChartEndLabelsInside(options)
  assert.ok(result)
  assert.deepEqual(options, before)
  assert.deepEqual(result.map(({ id }) => id), ['a', 'b'])
  for (const label of result) assert.notEqual(label, options.labels.find(({ id }) => id === label.id))
})
