import test from 'node:test'
import assert from 'node:assert/strict'
import { getHistogramStatRankBands } from '../src/lib/histogramStatRankBands.ts'
import type { HistogramBin } from '../src/lib/enemyStatistics.ts'

const bin = (start: number, end: number, includesMaximum = false, isOverflow = false): HistogramBin => ({
  start, end, includesMaximum, count: 0, ...(isOverflow ? { isOverflow } : {}),
})
const summary = (bands: ReturnType<typeof getHistogramStatRankBands>) => {
  assert.ok(bands.every((band) => !('pointValue' in band) && band.end > band.start), '独立した端点帯を作らない')
  return bands.map(({ rating, start, end }) => [rating, start, end])
}
const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`)

test('防御力の100刻みを維持し、連続する同じ評価をまとめる', () => {
  const bins = Array.from({ length: 10 }, (_, index) => bin(index * 100, (index + 1) * 100, index === 9))
  assert.deepEqual(summary(getHistogramStatRankBands('defense', bins)), [
    ['E', 0, .1], ['D', .1, .2], ['C', .2, .5], ['B', .5, .8], ['B+', .8, .9], ['B+・A', .9, 1],
  ])
})

test('評価境界が階級の途中なら帯だけを分け、短い最終階級にも等幅の列を保つ', () => {
  const bands = getHistogramStatRankBands('defense', [bin(0, 250), bin(250, 500), bin(500, 600, true)])
  closeTo(bands[0].end, .4 / 3)
  closeTo(bands[1].end, .8 / 3)
  closeTo(bands[2].end, 2 / 3)
  assert.deepEqual(bands.map((band) => band.rating), ['E', 'D', 'C', 'B'])
  assert.equal(bands.at(-1)?.end, 1)
})

test('対数階級内も既存のlog1p補間と同じ位置で分割する', () => {
  const bands = getHistogramStatRankBands('defense', [bin(0, 999, true)], 'LOG')
  closeTo(bands[0].end, Math.log1p(100) / Math.log1p(999))
  closeTo(bands[1].end, Math.log1p(200) / Math.log1p(999))
  assert.equal(bands.at(-1)?.end, 1)
  const negative = getHistogramStatRankBands('defense', [bin(-100, 200, true)], 'LOG')
  closeTo(negative[0].end, 2 / 3)
})

test('超過階級は観測値や描画用endから推測せず、厳密な下限を超える評価範囲を示す', () => {
  const source = [bin(900, 1000, true), bin(1000, 1100, true, true)]
  assert.deepEqual(summary(getHistogramStatRankBands('defense', source)), [
    ['B+・A', 0, .5], ['A〜SS', .5, 1],
  ])
  const overflow = getHistogramStatRankBands('defense', [bin(5000, 5100, true, true)])
  assert.deepEqual(summary(overflow), [['SS', 0, 1]])
  assert.equal(overflow[0].label, '5,000 超')
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(0, 10, true, true)])), [['D〜SS', 0, 1]])
  assert.deepEqual(getHistogramStatRankBands('defense', source.map((item) => ({ ...item, count: 100 }))),
    getHistogramStatRankBands('defense', source))
})

test('術耐性0のEは同じ階級のDに併記し、数値境界と負の範囲のEの幅は維持する', () => {
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(0, 20, true)])), [
    ['E・D', 0, .5], ['C・B', .5, 1],
  ])
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(-10, 10, false)])), [
    ['E', 0, .5], ['D', .5, 1],
  ])
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(90, 100, true)])), [
    ['S+・SS', 0, 1],
  ])
})

test('含まれる端点を同じ階級だけに併記し、含まれない上端の評価は追加しない', () => {
  assert.deepEqual(summary(getHistogramStatRankBands('defense', [bin(0, 100)])), [['E', 0, 1]])
  assert.deepEqual(summary(getHistogramStatRankBands('defense', [bin(0, 100, true), bin(100, 200, false)])), [
    ['E・D', 0, .5], ['D', .5, 1],
  ])
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(80, 90, true)])), [['S+', 0, 1]])
})

test('単一値と混在する定数階級に列全体を割り当て、隣接する通常階級を短縮しない', () => {
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(0, 0, true)])), [['E', 0, 1]])
  assert.deepEqual(summary(getHistogramStatRankBands('defense', [bin(1000, 1000, true)])), [['A', 0, 1]])
  assert.deepEqual(summary(getHistogramStatRankBands('magicResistance', [bin(0, 0, true), bin(0, 10), bin(10, 10, true)])), [
    ['E', 0, 1 / 3], ['E・D', 1 / 3, 2 / 3], ['C', 2 / 3, 1],
  ])
})

test('攻撃力・HPも既存の評価定義を使い、入力を変更せず、無効な階級を安全に扱う', () => {
  const source = Object.freeze([Object.freeze(bin(0, 300, true))])
  const attack = getHistogramStatRankBands('attack', source)
  closeTo(attack[0].end, 2 / 3)
  assert.deepEqual(attack.map((band) => band.rating), ['E', 'D・C'])
  assert.equal(getHistogramStatRankBands('maxHp', [bin(1000, 3500)]).at(-1)?.rating, 'D')
  assert.deepEqual(source, [bin(0, 300, true)])
  for (const bins of [[], [bin(NaN, 100)], [bin(0, Infinity)], [bin(200, 100)]]) {
    assert.deepEqual(getHistogramStatRankBands('defense', bins), [])
  }
  for (const band of attack) assert.ok(band.start >= 0 && band.end <= 1 && band.start <= band.end)
})

test('幅10の術耐性ではE・DとS+・SSを同じ行に表示し、他の区間は結合する', () => {
  const bins = Array.from({ length: 10 }, (_, index) => bin(index * 10, (index + 1) * 10, index === 9))
  const bands = getHistogramStatRankBands('magicResistance', bins)
  const expected = [
    ['E・D', 0, .1], ['C', .1, .2], ['B', .2, .3], ['B+', .3, .5],
    ['A', .5, .6], ['A+', .6, .7], ['S', .7, .8], ['S+', .8, .9], ['S+・SS', .9, 1],
  ] as const
  assert.deepEqual(summary(bands).map(([rating]) => rating), expected.map(([rating]) => rating))
  expected.forEach(([, start, end], index) => {
    closeTo(bands[index].start, start)
    closeTo(bands[index].end, end)
  })
  assert.equal(bands[0].index, 0)
  assert.equal(bands.at(-1)?.index, 8)
  assert.equal(bands[0].label, '0 以下／0 超 10 未満')
})
