import assert from 'node:assert/strict'
import test from 'node:test'
import { getChartVideoFrameTiming } from '../src/lib/chartVideoFrames.ts'

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${actual} to equal ${expected}`)
}

test('30fpsの書き出しでは経過した実時間に依存せず全フレームを固定間隔で描画する', () => {
  for (const [duration, frameCount] of [[3.5, 105], [5, 150], [20, 600]]) {
    const timing = getChartVideoFrameTiming(duration, 30)
    assert.equal(timing.frameCount, frameCount)
    for (let index = 0; index < frameCount; index += 1) {
      const frame = timing.frame(index)
      assert.equal(frame.timestamp, index / 30)
      closeTo(frame.duration, 1 / 30)
      assert.equal(frame.drawSeconds, index === frameCount - 1 ? duration : index / 30)
    }
  }
})

test('完成図の保持が0秒でも最終フレームは完成図になり、保持時間があれば保持中の全フレームを残す', () => {
  for (const hold of [0, 1]) {
    const finish = 5
    const timing = getChartVideoFrameTiming(finish + hold, 30)
    const frames = Array.from({ length: timing.frameCount }, (_, index) => timing.frame(index))
    assert.equal(frames[0].drawSeconds, 0)
    assert.equal(frames.at(-1)?.drawSeconds, finish + hold)
    assert.equal(frames.filter(frame => frame.drawSeconds >= finish).length, hold ? 30 : 1)
  }
})

test('端数の秒数は最後のフレームの長さで吸収し、指定した動画の尺を保つ', () => {
  const timing = getChartVideoFrameTiming(1.01, 30)
  assert.equal(timing.frameCount, 31)
  assert.equal(timing.frame(30).timestamp, 1)
  closeTo(timing.frame(30).duration, .01)
  assert.equal(timing.frame(30).drawSeconds, 1.01)
  closeTo(timing.frame(30).timestamp + timing.frame(30).duration, timing.duration)

  const single = getChartVideoFrameTiming(.01, 30)
  assert.equal(single.frameCount, 1)
  assert.deepEqual(single.frame(0), { timestamp: 0, duration: .01, drawSeconds: .01 })
  assert.equal(getChartVideoFrameTiming(.07, 100).frameCount, 7)
})

test('不正な尺・フレームレート・表現できない時刻や範囲外のフレーム番号を拒否する', () => {
  for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, .0000001, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => getChartVideoFrameTiming(duration, 30), RangeError)
  }
  for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 241]) {
    assert.throws(() => getChartVideoFrameTiming(1, rate), RangeError)
  }
  const timing = getChartVideoFrameTiming(1, 30)
  for (const index of [-1, .5, 30, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => timing.frame(index), RangeError)
  }
})
