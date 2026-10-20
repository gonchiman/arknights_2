import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateNumericStatistics } from '../src/lib/enemyStatistics.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { avoidHistogramCumulativeLine, avoidHistogramReferenceLines, formatHistogramPercentage } from '../src/lib/histogramPercentageLabels.ts'
import type { GroupedBarValueLabelPlacement } from '../src/lib/groupedBarValueLabels.ts'

test('割合は件数を添えず小数1桁とし、正の微小割合を0件と区別する', () => {
  assert.equal(formatHistogramPercentage(1, 3), '33.3%')
  assert.equal(formatHistogramPercentage(2, 3), '66.7%')
  assert.equal(formatHistogramPercentage(0, 3), '0.0%')
  assert.equal(formatHistogramPercentage(1, 1_000), '0.1%')
  assert.equal(formatHistogramPercentage(1, 1_001), '<0.1%')
  assert.equal(formatHistogramPercentage(1, 100_000), '<0.1%')
  assert.equal(formatHistogramPercentage(Number.MIN_VALUE, Number.MAX_VALUE), '<0.1%')
  assert.equal(formatHistogramPercentage(Number.MAX_VALUE, Number.MAX_VALUE), '100.0%')
})

test('分母0・不正な件数・非有限値は割合を表示しない', () => {
  for (const [count, total] of [
    [0, 0], [1, 0], [0, -1], [-1, 10], [11, 10],
    [Number.NaN, 10], [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 10], [1, Number.POSITIVE_INFINITY],
  ]) {
    assert.equal(formatHistogramPercentage(count, total), null)
  }
})

test('欠損を除いた有効データ数を分母として通常階級と0件の階級を表示する', () => {
  const statistics = calculateNumericStatistics(
    [0, 0, 10, null, undefined, Number.NaN, Number.POSITIVE_INFINITY],
    10, 'LINEAR', 1, 10, 20,
  )

  assert.equal(statistics.count, 3)
  assert.equal(statistics.missingCount, 4)
  assert.deepEqual(
    statistics.bins.map((bin) => formatHistogramPercentage(bin.count, statistics.count)),
    ['66.7%', '33.3%', '0.0%'],
  )
})

test('線形ヒストグラムの上限を超えた値も割合の分母に含める', () => {
  const statistics = calculateNumericStatistics(
    [...Array.from({ length: 19 }, () => 0), 1_000],
    10, 'LINEAR', 1, 10, 20,
  )

  assert.equal(statistics.bins.at(-1)?.isOverflow, true)
  assert.deepEqual(
    statistics.bins.map((bin) => formatHistogramPercentage(bin.count, statistics.count)),
    ['95.0%', '0.0%', '5.0%'],
  )
})

test('重み付き集計は行数でなく有効な重みの合計を分母にし、欠損の重みを除く', () => {
  const statistics = calculateWeightedHistogram([
    { value: 0, weight: 0.25 },
    { value: 10, weight: 0.5 },
    { value: 1_000, weight: 0.25 },
    { value: null, weight: 9 },
    { value: 0, weight: -1 },
  ], { customLinearBinWidth: 10, customLinearUpperBound: 20 })

  assert.equal(statistics.count, 1)
  assert.equal(statistics.missingCount, 9)
  assert.deepEqual(
    statistics.bins.map((bin) => formatHistogramPercentage(bin.count, statistics.count)),
    ['25.0%', '50.0%', '25.0%'],
  )
})

test('固定階級が残る欠損のみのデータは0.0%でなく表示なしにする', () => {
  const statistics = calculateNumericStatistics([null, undefined], 10, 'LINEAR', 1, 10, 20)

  assert.equal(statistics.bins.length, 3)
  assert.deepEqual(
    statistics.bins.map((bin) => formatHistogramPercentage(bin.count, statistics.count)),
    [null, null, null],
  )
})

const percentageLabel: GroupedBarValueLabelPlacement = {
  id: 'moving', x: 40, y: 20, width: 20, height: 12,
  anchorX: 50, anchorY: 36, shifted: false,
}

function percentageLayout(labels: GroupedBarValueLabelPlacement[] = [percentageLabel]) {
  return { labels, extraTop: Math.max(0, ...labels.map((label) => -label.y)), extraBottom: 0 }
}

function assertClearsLines(label: GroupedBarValueLabelPlacement, xs: number[]) {
  for (const x of xs) {
    assert.ok(label.x >= x + 5 || label.x + label.width <= x - 5,
      `${label.id} covers the reference line at ${x}`)
  }
}

function assertSeparated(
  label: GroupedBarValueLabelPlacement,
  obstacle: { x: number; y: number; width: number; height: number },
) {
  assert.ok(label.x + label.width + 4 <= obstacle.x
    || obstacle.x + obstacle.width + 4 <= label.x
    || label.y + label.height + 4 <= obstacle.y
    || obstacle.y + obstacle.height + 4 <= label.y)
}

test('表示線がない場合と線が数字に重ならない場合は配置と余白を完全に維持する', () => {
  const layout = percentageLayout()
  const before = structuredClone(layout)
  for (const referenceXs of [[], [10, 90], [-1, 121, Number.NaN, Infinity]]) {
    const result = avoidHistogramReferenceLines({ layout, referenceXs, width: 120, height: 100, bars: [] })
    assert.strictEqual(result, layout)
  }
  assert.deepEqual(layout, before)
})

test('線に重なる数字だけを最短の左右方向へ動かし、棒の位置と高さを維持する', () => {
  const untouched = { ...percentageLabel, id: 'fixed', x: 90, anchorX: 100 }
  const layout = percentageLayout([percentageLabel, untouched])
  const before = structuredClone(layout)
  for (const [line, expectedX] of [[45, 50], [55, 30]]) {
    const result = avoidHistogramReferenceLines({ layout, referenceXs: [line], width: 120, height: 100, bars: [] })
    assert.deepEqual(result.labels[0], { ...percentageLabel, x: expectedX, shifted: true })
    assert.strictEqual(result.labels[1], untouched)
    assertClearsLines(result.labels[0], [line])
    assert.equal(result.extraTop, 0)
  }
  assert.deepEqual(layout, before)
})

test('平均と中央値の両方を避け、同じ位置の線や線の入力順で結果を変えない', () => {
  const layout = percentageLayout()
  const options = { layout, width: 120, height: 100, bars: [] }
  const twoLines = avoidHistogramReferenceLines({ ...options, referenceXs: [45, 55] })
  assert.equal(twoLines.labels[0].x, 20)
  assertClearsLines(twoLines.labels[0], [45, 55])
  assert.deepEqual(avoidHistogramReferenceLines({ ...options, referenceXs: [55, 45, 55] }), twoLines)
  assert.deepEqual(
    avoidHistogramReferenceLines({ ...options, referenceXs: [45, 45] }),
    avoidHistogramReferenceLines({ ...options, referenceXs: [45] }),
  )
})

test('左右端では文字全体を枠内に保てる方向へ移動する', () => {
  for (const [x, line, expectedX] of [[0, 5, 10], [80, 95, 70]]) {
    const label = { ...percentageLabel, x, anchorX: x + 10 }
    const result = avoidHistogramReferenceLines({ layout: percentageLayout([label]), referenceXs: [line], width: 100, height: 100, bars: [] })
    assert.equal(result.labels[0].x, expectedX)
    assert.equal(result.labels[0].y, label.y)
    assert.ok(result.labels[0].x >= 0 && result.labels[0].x + label.width <= 100)
    assertClearsLines(result.labels[0], [line])
  }
})

test('移動先の隣の数字は動かさず、空いている反対側へ回避する', () => {
  const neighbor = { ...percentageLabel, id: 'neighbor', x: 64, anchorX: 74 }
  const result = avoidHistogramReferenceLines({
    layout: percentageLayout([percentageLabel, neighbor]), referenceXs: [45], width: 120, height: 100, bars: [],
  })
  assert.equal(result.labels[0].x, 20)
  assert.equal(result.labels[0].y, percentageLabel.y)
  assert.strictEqual(result.labels[1], neighbor)
  assertSeparated(result.labels[0], neighbor)
})

test('近い側に高い棒がある場合は高さを保てる反対側を選ぶ', () => {
  const tallBar = { x: 0, y: 0, width: 30, height: 100 }
  const result = avoidHistogramReferenceLines({
    layout: percentageLayout(), referenceXs: [55], width: 120, height: 100, bars: [tallBar],
  })
  assert.equal(result.labels[0].x, 60)
  assert.equal(result.labels[0].y, percentageLabel.y)
  assertSeparated(result.labels[0], tallBar)
  assertClearsLines(result.labels[0], [55])
})

test('上部余白の負Y位置でも基準線を避け、既存の余白を維持する', () => {
  const label = { ...percentageLabel, y: -20, anchorY: -4, shifted: true }
  const result = avoidHistogramReferenceLines({
    layout: percentageLayout([label]), referenceXs: [45], width: 120, height: 100, bars: [],
  })
  assert.deepEqual(result.labels[0], { ...label, x: 50 })
  assert.equal(result.extraTop, 20)
  assertClearsLines(result.labels[0], [45])
})

test('同じ高さに空きがないときは線と左右の棒を避ける最小限の上方余白を確保する', () => {
  const bars = [{ x: 0, y: 10, width: 35, height: 90 }, { x: 65, y: 10, width: 55, height: 90 }]
  const result = avoidHistogramReferenceLines({
    layout: percentageLayout(), referenceXs: [50], width: 120, height: 100, bars,
  })
  assert.deepEqual(result.labels[0], { ...percentageLabel, x: 25, y: -6, shifted: true })
  assert.equal(result.extraTop, 6)
  assert.equal(result.extraBottom, 0)
  assertClearsLines(result.labels[0], [50])
  for (const bar of bars) assertSeparated(result.labels[0], bar)
})

test('極端に狭く線を避けられない枠でも数字を隠したり切り詰めたりしない', () => {
  const label = { ...percentageLabel, x: 5, anchorX: 15 }
  const result = avoidHistogramReferenceLines({
    layout: percentageLayout([label]), referenceXs: [15], width: 30, height: 100, bars: [],
  })
  assert.deepEqual(result.labels, [label])
  assert.equal(result.extraTop, 0)
})

test('割合文字に交差する累積斜線を保ち、文字だけを必要な高さまで上に移す', () => {
  const layout = percentageLayout()
  const points = [{ x: 40, y: 22 }, { x: 60, y: 28 }]
  const before = structuredClone({ layout, points })
  const result = avoidHistogramCumulativeLine({ layout, points, bars: [] })
  const moved = result.labels[0]
  assert.ok(Math.abs(moved.y - 5.99) < 1e-10)
  assert.equal(moved.x, percentageLabel.x)
  assert.equal(moved.width, percentageLabel.width)
  assert.equal(moved.height, percentageLabel.height)
  assert.equal(moved.anchorX, percentageLabel.anchorX)
  assert.equal(moved.anchorY, percentageLabel.anchorY)
  assert.equal(moved.shifted, true)
  assert.ok(moved.y + moved.height + 4 < 22)
  assert.equal(result.extraTop, 0)
  assert.deepEqual({ layout, points }, before)
})

test('累積の水平区間も左右の入力順によらず避け、線の4px上へ文字を配置する', () => {
  const layout = percentageLayout()
  const points = [{ x: 0, y: 26 }, { x: 100, y: 26 }]
  const result = avoidHistogramCumulativeLine({ layout, points, bars: [] })
  assert.ok(Math.abs(result.labels[0].y - 9.99) < 1e-10)
  assert.ok(result.labels[0].y + result.labels[0].height + 4 < 26)
  assert.deepEqual(avoidHistogramCumulativeLine({ layout, points: [...points].reverse(), bars: [] }), result)
  assert.equal(result.extraTop, 0)
  assert.equal(result.extraBottom, 0)
})

test('交差しない線と不完全な累積線は元の配置オブジェクトをそのまま返す', () => {
  const layout = percentageLayout()
  const before = structuredClone(layout)
  const cases = [
    [], [{ x: 50, y: 26 }],
    [{ x: 0, y: 80 }, { x: 100, y: 80 }],
    [{ x: 80, y: 26 }, { x: 100, y: 26 }],
    [{ x: 0, y: Number.NaN }, { x: 100, y: 26 }],
    [{ x: Number.POSITIVE_INFINITY, y: 26 }, { x: 100, y: 26 }],
  ]
  for (const points of cases) assert.strictEqual(avoidHistogramCumulativeLine({ layout, points, bars: [] }), layout)
  // A diagonal's overall bounding box overlaps this label, but the actual
  // segment near its x position passes far below it.
  const highLabel = { ...percentageLabel, x: 20, y: 0 }
  const local = percentageLayout([highLabel])
  assert.strictEqual(avoidHistogramCumulativeLine({ layout: local,
    points: [{ x: 0, y: 100 }, { x: 100, y: 0 }], bars: [] }), local)
  assert.deepEqual(layout, before)
})

test('上方の棒と隣ラベルを避け、交差しない隣ラベルや棒は動かさない', () => {
  const neighbor = { ...percentageLabel, id: 'neighbor', y: -24, height: 8, anchorY: -12, shifted: true }
  const bar = { x: 40, y: 0, width: 20, height: 15 }
  const layout = percentageLayout([percentageLabel, neighbor])
  const before = structuredClone({ layout, bar })
  const result = avoidHistogramCumulativeLine({ layout, points: [{ x: 0, y: 26 }, { x: 100, y: 26 }], bars: [bar] })
  assert.ok(Math.abs(result.labels[0].y - -40.01) < 1e-10)
  assert.strictEqual(result.labels[1], neighbor)
  assertSeparated(result.labels[0], bar)
  assertSeparated(result.labels[0], neighbor)
  assert.equal(result.labels[0].x, percentageLabel.x)
  assert.equal(result.extraTop, -result.labels[0].y)
  assert.deepEqual({ layout, bar }, before)
  const zeroHeight = avoidHistogramCumulativeLine({ layout: percentageLayout(),
    points: [{ x: 0, y: 26 }, { x: 100, y: 26 }], bars: [{ ...bar, height: 0 }] })
  assert.ok(Math.abs(zeroHeight.labels[0].y - 9.99) < 1e-10)
})

test('平均・中央値を先に回避した横位置を保持し、累積線は縦方向だけで回避する', () => {
  const vertical = avoidHistogramReferenceLines({ layout: percentageLayout(), referenceXs: [45], width: 120, height: 100, bars: [] })
  assert.equal(vertical.labels[0].x, 50)
  const before = structuredClone(vertical)
  const result = avoidHistogramCumulativeLine({ layout: vertical,
    points: [{ x: 0, y: 26 }, { x: 120, y: 26 }], bars: [] })
  assert.ok(Math.abs(result.labels[0].y - 9.99) < 1e-10)
  assert.equal(result.labels[0].x, vertical.labels[0].x)
  assertClearsLines(result.labels[0], [45])
  assert.deepEqual(vertical, before)
})

test('複数の文字が同じ累積区間に交差しても移動後の文字同士を重ねない', () => {
  const second = { ...percentageLabel, id: 'second', x: 45, y: 40, anchorX: 55, anchorY: 56 }
  const layout = percentageLayout([percentageLabel, second])
  const points = [{ x: 50, y: 15 }, { x: 50, y: 50 }]
  const result = avoidHistogramCumulativeLine({ layout, points, bars: [] })
  assert.ok(result.labels.every(label => label.shifted && label.y < -1))
  assertSeparated(result.labels[0], result.labels[1])
  assert.equal(result.labels[0].x, percentageLabel.x)
  assert.equal(result.labels[1].x, second.x)
  assert.equal(result.extraTop, -Math.min(...result.labels.map(label => label.y)))
})

test('累積回避の負Y位置をextraTopへ反映し、確保済みの余白と下余白は縮めない', () => {
  const label = { ...percentageLabel, y: -10, anchorY: 6, shifted: true }
  const layout = { ...percentageLayout([label]), extraBottom: 7 }
  const options = { layout, points: [{ x: 0, y: -5 }, { x: 100, y: -5 }], bars: [] }
  const result = avoidHistogramCumulativeLine(options)
  assert.ok(Math.abs(result.labels[0].y - -21.01) < 1e-10)
  assert.equal(result.extraTop, -result.labels[0].y)
  assert.equal(result.extraBottom, 7)
  const roomy = avoidHistogramCumulativeLine({ ...options, layout: { ...layout, extraTop: 50 } })
  assert.deepEqual(roomy.labels, result.labels)
  assert.equal(roomy.extraTop, 50)
  assert.equal(roomy.extraBottom, 7)
})
