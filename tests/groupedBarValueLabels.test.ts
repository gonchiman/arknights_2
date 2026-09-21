import test from 'node:test'
import assert from 'node:assert/strict'
import { placeGroupedBarValueLabels, type GroupedBarValueLabelInput } from '../src/lib/groupedBarValueLabels.ts'

const baseLabel: GroupedBarValueLabelInput = {
  id: 'value', anchorX: 50, anchorY: 60, width: 30, height: 12, direction: 'above',
}

function separated(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
  gap: number,
): boolean {
  const tolerance = 1e-9
  return left.x + left.width + gap <= right.x + tolerance
    || right.x + right.width + gap <= left.x + tolerance
    || left.y + left.height + gap <= right.y + tolerance
    || right.y + right.height + gap <= left.y + tolerance
}

test('離れた数値ラベルは棒の端の自然な位置と大きさを維持する', () => {
  const labels: GroupedBarValueLabelInput[] = [baseLabel, { ...baseLabel, id: 'negative', anchorX: 150, direction: 'below' }]
  const result = placeGroupedBarValueLabels({ labels, width: 200, height: 100 })
  assert.deepEqual(result, {
    labels: [
      { id: 'value', x: 35, y: 44, width: 30, height: 12, anchorX: 50, anchorY: 60, shifted: false },
      { id: 'negative', x: 135, y: 64, width: 30, height: 12, anchorX: 150, anchorY: 60, shifted: false },
    ],
    extraTop: 0,
    extraBottom: 0,
  })
})

test('同じ高さで重なる数値を入力順に上へずらし、棒との対応を保持する', () => {
  const labels = Array.from({ length: 3 }, (_, index) => ({ ...baseLabel, id: `${index}`, anchorX: 50 + index * 5 }))
  const result = placeGroupedBarValueLabels({ labels, width: 200, height: 100, gap: 4 })
  assert.deepEqual(result.labels.map(({ x, y, shifted }) => ({ x, y, shifted })), [
    { x: 35, y: 44, shifted: false },
    { x: 40, y: 28, shifted: true },
    { x: 45, y: 12, shifted: true },
  ])
  assert.deepEqual(result.labels.map(({ anchorX, anchorY }) => ({ anchorX, anchorY })), labels.map(({ anchorX, anchorY }) => ({ anchorX, anchorY })))
})

test('左右の端でラベルを枠内へ寄せ、数値が枠より長くても切り詰めない', () => {
  const result = placeGroupedBarValueLabels({
    labels: [{ ...baseLabel, anchorX: 0 }, { ...baseLabel, id: 'right', anchorX: 100 }], width: 100, height: 100,
  })
  assert.deepEqual(result.labels.map(({ x, shifted }) => ({ x, shifted })), [{ x: 0, shifted: true }, { x: 70, shifted: true }])
  const wide = placeGroupedBarValueLabels({ labels: [{ ...baseLabel, width: 130 }], width: 100, height: 100 })
  assert.equal(wide.labels[0].x, 0)
  assert.equal(wide.labels[0].width, 130)
})

test('上端と下端からはみ出す値を残し、必要な余白だけを返す', () => {
  const result = placeGroupedBarValueLabels({
    labels: [
      { ...baseLabel, id: 'zero', anchorY: 0 },
      { ...baseLabel, id: 'negative', anchorY: 100, direction: 'below' },
      { ...baseLabel, id: 'negative-next', anchorY: 100, direction: 'below' },
    ],
    width: 100,
    height: 100,
  })
  assert.deepEqual(result.labels.map(({ id, y }) => ({ id, y })), [
    { id: 'zero', y: -16 }, { id: 'negative', y: 104 }, { id: 'negative-next', y: 120 },
  ])
  assert.equal(result.extraTop, 16)
  assert.equal(result.extraBottom, 32)
})

test('自分の棒の境界では動かず、隣の高い棒と連続する障害物を避ける', () => {
  const ownBar = { x: 45, y: 60, width: 10, height: 40 }
  const natural = placeGroupedBarValueLabels({ labels: [baseLabel], width: 100, height: 100, obstacles: [ownBar] })
  assert.equal(natural.labels[0].y, 44)
  assert.equal(natural.labels[0].shifted, false)
  const obstacles = [ownBar, { x: 60, y: 35, width: 10, height: 65 }, { x: 35, y: 15, width: 10, height: 12 }]
  const result = placeGroupedBarValueLabels({ labels: [baseLabel], width: 100, height: 100, obstacles })
  assert.equal(result.labels[0].y, -1)
  assert.equal(result.extraTop, 1)
  for (const obstacle of obstacles) assert.ok(separated(result.labels[0], obstacle, 4))
  assert.deepEqual(placeGroupedBarValueLabels({ labels: [baseLabel], width: 100, height: 100, obstacles: [...obstacles].reverse() }), result)
})

test('負の棒のラベルも障害物を下へ避ける', () => {
  const obstacles = [{ x: 45, y: 0, width: 10, height: 60 }, { x: 60, y: 70, width: 10, height: 20 }]
  const result = placeGroupedBarValueLabels({ labels: [{ ...baseLabel, direction: 'below' }], width: 100, height: 100, obstacles })
  assert.equal(result.labels[0].y, 94)
  assert.equal(result.extraBottom, 6)
  for (const obstacle of obstacles) assert.ok(separated(result.labels[0], obstacle, 4))
})

test('密集した多数の正負ラベルを省略せず、同じ入力には同じ重ならない配置を返す', () => {
  const labels: GroupedBarValueLabelInput[] = Array.from({ length: 160 }, (_, index) => ({
    id: `${index}`,
    anchorX: (index * 17) % 180,
    anchorY: 50 + (index % 5),
    width: 42 + index % 7,
    height: 12 + index % 3,
    direction: index % 2 === 0 ? 'above' : 'below',
  }))
  const options = { labels, width: 180, height: 100, gap: 3 }
  const before = structuredClone(options)
  const result = placeGroupedBarValueLabels(options)
  assert.deepEqual(result.labels.map(({ id }) => id), labels.map(({ id }) => id))
  assert.deepEqual(result, placeGroupedBarValueLabels(options))
  assert.deepEqual(options, before)
  for (let index = 0; index < result.labels.length; index += 1) {
    const label = result.labels[index]
    assert.equal(label.width, labels[index].width)
    assert.equal(label.height, labels[index].height)
    assert.ok(label.x >= 0 && label.x + label.width <= options.width)
    assert.ok(label.y >= -result.extraTop && label.y + label.height <= options.height + result.extraBottom)
    for (const other of result.labels.slice(index + 1)) assert.ok(separated(label, other, options.gap), `${label.id} overlaps ${other.id}`)
  }
})

test('小数座標と隙間ゼロでも接触を許容し、余分に退避しない', () => {
  const labels = [{ ...baseLabel, anchorY: 40.25, height: 10.5 }, { ...baseLabel, id: 'next', anchorY: 40.25, height: 10.5 }]
  const result = placeGroupedBarValueLabels({ labels, width: 100, height: 100, gap: 0 })
  assert.deepEqual(result.labels.map(({ y }) => y), [29.75, 19.25])
  assert.ok(separated(result.labels[0], result.labels[1], 0))
})

test('無効な数値の矩形は無視し、空配列やゼロの座標は有限な結果を返す', () => {
  assert.deepEqual(placeGroupedBarValueLabels({ labels: [], width: NaN, height: Infinity }), { labels: [], extraTop: 0, extraBottom: 0 })
  const valid = { ...baseLabel, anchorX: 0, anchorY: 0 }
  const result = placeGroupedBarValueLabels({
    labels: [valid, { ...baseLabel, anchorX: NaN }, { ...baseLabel, anchorY: Infinity }, { ...baseLabel, width: -1 }, { ...baseLabel, height: NaN }],
    width: NaN,
    height: -1,
    gap: Infinity,
    obstacles: [{ x: 0, y: NaN, width: 100, height: 100 }, { x: 0, y: 0, width: -1, height: 100 }],
  })
  assert.equal(result.labels.length, 1)
  assert.equal(result.labels[0].anchorY, 0)
  assert.ok(Object.values(result.labels[0]).filter((value) => typeof value === 'number').every(Number.isFinite))
  assert.equal(result.extraTop, 16)
  assert.equal(result.extraBottom, 0)
})
