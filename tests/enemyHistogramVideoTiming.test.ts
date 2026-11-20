import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEnemyHistogramVideoTimingDraft, getEnemyHistogramVideoFrame, getEnemyHistogramVideoTimingBounds,
  parseEnemyHistogramVideoTiming, setEnemyHistogramVideoValueMode, type EnemyHistogramVideoTimingDraft,
} from '../src/lib/enemyHistogramVideoTiming.ts'

function timing(overrides: Partial<EnemyHistogramVideoTimingDraft> = {}) {
  const parsed = parseEnemyHistogramVideoTiming({ ...createEnemyHistogramVideoTimingDraft(), ...overrides })
  assert.ok(parsed.timing, parsed.error ?? '')
  return parsed.timing
}

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${actual} to equal ${expected}`)
}

test('初期設定は構造を表示済みとし、5秒を順に伸びる棒と累積の連動に使う', () => {
  const draft = createEnemyHistogramVideoTimingDraft()
  assert.equal(draft.barMode, 'staggerGrow')
  assert.equal(draft.valueMode, 'linked')
  assert.deepEqual(draft.order, ['bars', 'values'])
  const settings = timing()
  assert.deepEqual(settings.bars, { start: 0, duration: 5 })
  assert.deepEqual(settings.values, { start: 0, duration: 0 })
  assert.deepEqual(getEnemyHistogramVideoTimingBounds(settings), { finish: 5, duration: 5 })
  const frame = getEnemyHistogramVideoFrame(settings, 2.5, [20, 30, 50], 100)
  assert.equal(frame.cumulativeProgress, 1)
  closeTo(frame.counts[0], 20)
  closeTo(frame.counts[1], 15)
  closeTo(frame.counts[2], 0)
  closeTo(frame.shares[1], .15)
  closeTo(frame.cumulativeShares[1], .35)
  closeTo(frame.cumulativeShares[2], .35)
})

test('B案は10秒のうち棒6.8秒・累積線3.2秒とし、棒の完成後に確定累積を左から表示する', () => {
  const settings = timing({ valueMode: 'fixed', finishSeconds: '10', overrides: { hold: '2' } })
  closeTo(settings.bars.duration, 6.8)
  closeTo(settings.values.start, 6.8)
  closeTo(settings.values.duration, 3.2)
  assert.deepEqual(getEnemyHistogramVideoTimingBounds(settings), { finish: 10, duration: 12 })
  const counts = [20, 30, 50]
  const before = getEnemyHistogramVideoFrame(settings, 0, counts, 100)
  assert.equal(before.cumulativeProgress, 0)
  assert.deepEqual(before.cumulativeShares, [.2, .5, 1])
  const boundary = getEnemyHistogramVideoFrame(settings, settings.values.start, counts, 100)
  assert.deepEqual(boundary.counts, counts)
  assert.equal(boundary.cumulativeProgress, 0)
  const halfway = getEnemyHistogramVideoFrame(settings, 8.4, counts, 100)
  closeTo(halfway.cumulativeProgress, .5)
  assert.deepEqual(halfway.cumulativeShares, [.2, .5, 1])
  for (const seconds of [10, 11, 12]) {
    const completed = getEnemyHistogramVideoFrame(settings, seconds, counts, 100)
    assert.deepEqual(completed.counts, counts)
    assert.deepEqual(completed.visible, [true, true, true])
    assert.equal(completed.cumulativeProgress, 1)
  }
})

test('同時成長は固定分母で半分の割合になり、整数度数も小数度数も丸めない', () => {
  const settings = timing({ barMode: 'grow', finishSeconds: '10', overrides: { hold: '1' } })
  const counts = [3026, 4358, 2834, 462, 207, 95, 311, 15, 101, 0]
  const frame = getEnemyHistogramVideoFrame(settings, 5, counts, 11409)
  closeTo(frame.counts[0], 1513)
  closeTo(frame.counts[5], 47.5)
  closeTo(frame.shares.reduce((sum, share) => sum + share, 0), .5)
  closeTo(frame.cumulativeShares.at(-1)!, .5)
  const fractional = getEnemyHistogramVideoFrame(settings, 5, [1.5, .5], 2)
  assert.deepEqual(fractional.counts, [.75, .25])
  assert.deepEqual(fractional.shares, [.375, .125])
})

test('順次表示では棒の出現時刻に度数と割合が切り替わり、空階級に時間を割り当てない', () => {
  const settings = timing({ barMode: 'stagger', finishSeconds: '4' })
  const before = getEnemyHistogramVideoFrame(settings, 1.99, [20, 0, 30, 50, 0], 100)
  assert.deepEqual(before.counts, [20, 0, 0, 0, 0])
  const next = getEnemyHistogramVideoFrame(settings, 2, [20, 0, 30, 50, 0], 100)
  assert.deepEqual(next.counts, [20, 0, 30, 0, 0])
  assert.deepEqual(next.cumulativeShares, [.2, .2, .5, .5, .5])
  const sequential = timing({ finishSeconds: '3' })
  const middle = getEnemyHistogramVideoFrame(sequential, 1.5, [20, 0, 30, 50, 0], 100)
  closeTo(middle.counts[2], 15)
  assert.deepEqual(middle.visible, [true, true, true, false, true])
})

test('0秒描画と保持、空・全0・1階級でもNaNや無限大を返さない', () => {
  const instant = timing({ overrides: { bars: '0', values: '0', hold: '2' } })
  assert.deepEqual(getEnemyHistogramVideoTimingBounds(instant), { finish: 0, duration: 2 })
  const frame = getEnemyHistogramVideoFrame(instant, 0, [2, 3], 5)
  assert.deepEqual(frame.progress, [1, 1])
  assert.deepEqual(frame.counts, [2, 3])
  assert.deepEqual(frame.cumulativeShares, [.4, 1])
  const empty = getEnemyHistogramVideoFrame(timing(), 2, [], 0)
  assert.deepEqual(empty.counts, [])
  assert.deepEqual(empty.cumulativeShares, [])
  const zero = getEnemyHistogramVideoFrame(timing(), 2, [0, 0], 0)
  assert.deepEqual(zero.counts, [0, 0])
  assert.deepEqual(zero.shares, [0, 0])
  assert.deepEqual(zero.cumulativeShares, [0, 0])
  const single = getEnemyHistogramVideoFrame(timing(), 2.5, [1.5], 1.5)
  assert.deepEqual(single.counts, [.75])
  assert.deepEqual(single.cumulativeShares, [.5])
})

test('1000階級でも元の階級順と累積の単調性を保持し、完成時に100%になる', () => {
  const counts = Array.from({ length: 1000 }, () => 1)
  const settings = timing({ finishSeconds: '10' })
  const halfway = getEnemyHistogramVideoFrame(settings, 5, counts, 1000)
  assert.equal(halfway.counts.length, counts.length)
  closeTo(halfway.counts.reduce((sum, count) => sum + count, 0), 500)
  closeTo(halfway.cumulativeShares.at(-1)!, .5)
  assert.ok(halfway.cumulativeShares.every((share, index, shares) => index === 0 || share >= shares[index - 1]))
  const completed = getEnemyHistogramVideoFrame(settings, 10, counts, 1000)
  assert.deepEqual(completed.counts, counts)
  assert.equal(completed.cumulativeShares.at(-1), 1)
})

test('A/B切替は個別指定済みの描画時間と保持を維持し、競合する指定だけを再配分する', () => {
  const original = {
    ...createEnemyHistogramVideoTimingDraft(), valueMode: 'fixed' as const,
    finishSeconds: '5', overrides: { bars: '2', values: '3', hold: ' 1.50 ' },
  }
  const previous = structuredClone(original)
  const linked = setEnemyHistogramVideoValueMode(original, 'linked')
  const linkedTiming = parseEnemyHistogramVideoTiming(linked)
  assert.ok(linkedTiming.timing)
  assert.equal(linkedTiming.finish, 5)
  assert.equal(linkedTiming.duration, 6.5)
  assert.equal(linked.overrides.hold, ' 1.50 ')
  assert.equal(linked.overrides.bars, undefined)
  const fixed = setEnemyHistogramVideoValueMode(linked, 'fixed')
  const fixedTiming = parseEnemyHistogramVideoTiming(fixed)
  assert.ok(fixedTiming.timing)
  assert.equal(fixedTiming.finish, 5)
  assert.equal(fixedTiming.duration, 6.5)
  assert.equal(fixedTiming.timing.values.duration, 3)
  assert.deepEqual(original, previous)
})

test('棒0秒と完成図の保持だけの動画でもA/B切替で描画時間を復活させない', () => {
  const original = { ...createEnemyHistogramVideoTimingDraft(), overrides: { bars: '0', hold: '2' } }
  const fixed = setEnemyHistogramVideoValueMode(original, 'fixed')
  const parsed = parseEnemyHistogramVideoTiming(fixed)
  assert.ok(parsed.timing)
  assert.equal(parsed.finish, 0)
  assert.equal(parsed.duration, 2)
  assert.deepEqual(parsed.timing.values, { start: 0, duration: 0 })
  assert.equal(parseEnemyHistogramVideoTiming(setEnemyHistogramVideoValueMode(fixed, 'linked')).duration, 2)
})
