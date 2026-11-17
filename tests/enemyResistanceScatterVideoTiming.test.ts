import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createChartVideoTimingDraft, getChartVideoTimingBounds, parseChartVideoTiming,
} from '../src/lib/enemyRatingVideoTiming.ts'
import { getEnemyResistanceScatterVideoDefinition } from '../src/lib/enemyResistanceScatterVideoTiming.ts'

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${actual} to equal ${expected}`)
}

test('散布図動画の初期設定はタイトル・枠・軸から始まり、点と注記を描いて5秒で終わる', () => {
  const definition = getEnemyResistanceScatterVideoDefinition(true)
  const draft = createChartVideoTimingDraft(definition)
  assert.deepEqual(draft.order, ['title', 'frame', 'axes', 'points', 'notes'])

  const parsed = parseChartVideoTiming(draft, definition)
  assert.ok(parsed.timing)
  const { timing } = parsed
  let end = 0
  for (const phase of draft.order) {
    assert.equal(timing[phase].start, end)
    assert.ok(timing[phase].duration > 0)
    end += timing[phase].duration
  }
  assert.ok(timing.points.start > 1 && timing.points.start < 2)
  assert.ok(timing.notes.start > 4)
  closeTo(parsed.finish, 5)
  assert.equal(parsed.duration, parsed.finish)
  assert.deepEqual(getChartVideoTimingBounds(timing, definition), { finish: parsed.finish, duration: parsed.duration })
})

test('欠損注記のない散布図では注記の設定を作らず、変更後の描画時間を残りの4項目に配分する', () => {
  const definition = getEnemyResistanceScatterVideoDefinition(false)
  const draft = createChartVideoTimingDraft(definition)
  assert.deepEqual(draft.order, ['title', 'frame', 'axes', 'points'])
  const parsed = parseChartVideoTiming({ ...draft, tempo: 'verySlow' }, definition)
  assert.ok(parsed.timing)
  assert.ok(!Object.hasOwn(parsed.timing, 'notes'))
  closeTo(parsed.duration, 10)
  closeTo(parsed.timing.points.start + parsed.timing.points.duration, 10)
})

test('散布図でも表示順と個別の秒数、描画完了までの時間、完成図の保持を設定できる', () => {
  const definition = getEnemyResistanceScatterVideoDefinition(true)
  const draft = createChartVideoTimingDraft(definition)
  const parsed = parseChartVideoTiming({
    ...draft,
    order: ['title', 'frame', 'axes', 'notes', 'points'],
    finishSeconds: '9',
    overrides: { title: '1', notes: '.5', hold: '2' },
    phaseTempos: { frame: 5, axes: 1 },
    textMode: 'fade',
    barMode: 'staggerGrow',
    guideMode: 'grow',
  }, definition)
  assert.ok(parsed.timing)
  const { timing } = parsed
  assert.equal(timing.title.duration, 1)
  assert.equal(timing.notes.duration, .5)
  assert.equal(timing.points.start, timing.notes.start + .5)
  assert.ok(timing.frame.duration > timing.axes.duration)
  closeTo(parsed.finish, 9)
  closeTo(parsed.duration, 11)
  assert.equal(timing.textMode, 'fade')
  assert.equal(timing.barMode, 'staggerGrow')
  assert.equal(timing.guideMode, 'grow')
})
