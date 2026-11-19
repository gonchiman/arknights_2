import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEnemyRatingBarsOnlyDraft, createEnemyRatingVideoTimingDraft,
  ENEMY_RATING_VIDEO_PHASES, ENEMY_RATING_VIDEO_PHASE_TEMPOS, ENEMY_RATING_VIDEO_TEMPOS,
  getEnemyRatingVideoDefaultDuration,
  getEnemyRatingVideoBarStep, parseEnemyRatingVideoTiming, retimeEnemyRatingVideoStep, retimeEnemyRatingVideoText,
  type EnemyRatingVideoTiming,
} from '../src/lib/enemyRatingVideoTiming.ts'

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${actual} to equal ${expected}`)
}

test('動画の初期設定はタイトルから順に描画し、5秒で完成して保持せず終わる', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  const parsed = parseEnemyRatingVideoTiming(draft)
  assert.ok(parsed.timing)
  assert.deepEqual(draft.order, ENEMY_RATING_VIDEO_PHASES)
  assert.equal(parsed.timing.title.start, 0)
  for (const [index, original] of [.38, .68, .495, .88, 1.205].entries()) {
    closeTo(parsed.timing[draft.order[index]].duration, original / 3.64 * 5)
  }
  assert.equal(parsed.timing.hold, 0)
  assert.equal(parsed.timing.textMode, 'stagger')
  assert.equal(parsed.timing.barMode, 'stagger')
  assert.equal(parsed.timing.guideMode, 'stagger')
  closeTo(parsed.finish, 5)
  assert.equal(parsed.duration, parsed.finish)
})

test('累積割合を棒より上に移すと先に描画され、開始時刻は直前の描画終了と一致する', () => {
  const order = ['title', 'axes', 'ranks', 'values', 'bars'] as const
  const draft = createEnemyRatingVideoTimingDraft()
  draft.order = [...order]
  const parsed = parseEnemyRatingVideoTiming(draft)
  assert.ok(parsed.timing)
  const { timing } = parsed
  let end = 0
  for (const phase of order) {
    assert.equal(timing[phase].start, end)
    end += timing[phase].duration
  }
  assert.equal(parsed.finish, end)
  closeTo(parsed.duration, 5)
  assert.deepEqual(retimeEnemyRatingVideoStep(timing, 'bars', 1.37, .88), timing.bars)
})

test('テンポは描画時間を変更し、個別指定は順序やテンポを変更しても優先される', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  const expectedSeconds = [2.5, 3.5, 4, 5, 6, 7, 10, 12, 15, 20]
  assert.equal(ENEMY_RATING_VIDEO_TEMPOS.length, expectedSeconds.length)
  for (const [index, seconds] of expectedSeconds.entries()) {
    const tempo = ENEMY_RATING_VIDEO_TEMPOS[index]
    const parsed = parseEnemyRatingVideoTiming({ ...draft, tempo })
    assert.ok(parsed.timing)
    closeTo(parsed.finish, seconds)
    assert.equal(parsed.duration, parsed.finish)
    assert.equal(parsed.timing.hold, 0)
  }
  closeTo(getEnemyRatingVideoDefaultDuration('axes', 'short'), .68 / 3.64 * 3.5)
  draft.order = ['bars', 'title', 'axes', 'ranks', 'values']
  draft.tempo = 'slow'
  draft.overrides = { bars: '1.12694', hold: '2' }
  const parsed = parseEnemyRatingVideoTiming(draft)
  assert.ok(parsed.timing)
  assert.deepEqual(parsed.timing.bars, { start: 0, duration: 1.12694 })
  assert.equal(parsed.timing.hold, 2)
  closeTo(parsed.timing.title.duration, .38 / 3.64 * 7)
  const defaultBars = .88 / 3.64 * 7
  closeTo(parsed.duration, 7 - defaultBars + 1.12694 + 2)
  const automatic = parseEnemyRatingVideoTiming({ ...draft, overrides: { bars: '', hold: ' ' } })
  assert.ok(automatic.timing)
  closeTo(automatic.timing.bars.duration, defaultBars)
  assert.equal(automatic.timing.hold, 0)
  closeTo(automatic.duration, 7)
})

test('10秒で描画を完了し、初期設定の保持時間ではそこで終わる', () => {
  const draft = { ...createEnemyRatingVideoTimingDraft(), finishSeconds: '10' }
  const reordered = parseEnemyRatingVideoTiming({ ...draft, tempo: 'slow', order: [...draft.order].reverse() })
  const parsed = parseEnemyRatingVideoTiming(draft)
  assert.ok(parsed.timing && reordered.timing)
  assert.equal(parsed.finish, 10)
  assert.equal(parsed.timing.hold, 0)
  assert.equal(parsed.duration, parsed.finish)
  closeTo(reordered.finish, 10)
  assert.equal(reordered.timing.hold, 0)
  assert.equal(reordered.duration, reordered.finish)
  assert.equal(reordered.timing.values.start, 0)
  assert.equal(reordered.timing.bars.start, reordered.timing.values.duration)
  closeTo(parsed.timing.title.duration, .38 / 3.64 * 10)
  for (const phase of draft.order) {
    assert.equal(reordered.timing[phase].duration, parsed.timing[phase].duration)
  }
})

test('項目別の5段階は全体の描画時間を保ってその項目への配分を変える', () => {
  const draft = { ...createEnemyRatingVideoTimingDraft(), tempo: 'verySlow' as const }
  const expectedWeights = [.4, .65, 1, 1.5, 2.25]
  assert.equal(ENEMY_RATING_VIDEO_PHASE_TEMPOS.length, expectedWeights.length)
  for (const [index, tempo] of ENEMY_RATING_VIDEO_PHASE_TEMPOS.entries()) {
    const parsed = parseEnemyRatingVideoTiming({ ...draft, phaseTempos: { bars: tempo } })
    assert.ok(parsed.timing)
    const barsWeight = .88 * expectedWeights[index]
    closeTo(parsed.timing.bars.duration, 10 * barsWeight / (3.64 - .88 + barsWeight))
    closeTo(parsed.finish, 10)
    assert.equal(parsed.duration, parsed.finish)
  }
  assert.deepEqual(parseEnemyRatingVideoTiming({ ...draft, phaseTempos: { bars: 3 } }), parseEnemyRatingVideoTiming(draft))
})

test('項目別のテンポは表示順を変えても同じ項目に適用される', () => {
  const draft = { ...createEnemyRatingVideoTimingDraft(), phaseTempos: { bars: 5, values: 1 } as const }
  const original = parseEnemyRatingVideoTiming(draft)
  const reordered = parseEnemyRatingVideoTiming({ ...draft, order: ['bars', 'title', 'axes', 'ranks', 'values'] })
  assert.ok(original.timing && reordered.timing)
  for (const phase of draft.order) {
    assert.equal(reordered.timing[phase].duration, original.timing[phase].duration)
  }
  assert.equal(reordered.timing.bars.start, 0)
  assert.equal(reordered.timing.title.start, reordered.timing.bars.duration)
  closeTo(reordered.finish, original.finish)
})

test('項目別のテンポは個別の秒数と保持時間を確保して未指定項目の時間を再配分する', () => {
  const draft = {
    ...createEnemyRatingVideoTimingDraft(),
    overrides: { bars: '1.2', hold: '2' },
    phaseTempos: { bars: 5, title: 4 } as const,
  }
  const manual = parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '8' })
  const automatic = parseEnemyRatingVideoTiming(draft)
  const original = parseEnemyRatingVideoTiming({ ...draft, phaseTempos: undefined })
  assert.ok(manual.timing && automatic.timing && original.timing)
  for (const { timing } of [manual, automatic]) {
    assert.equal(timing.bars.duration, 1.2)
    assert.equal(timing.hold, 2)
    closeTo(timing.title.duration / timing.axes.duration, .38 * 1.5 / .68)
  }
  closeTo(manual.finish, 8)
  closeTo(manual.duration, 10)
  closeTo(automatic.finish, original.finish)
  closeTo(automatic.duration, original.duration)
})

test('個別指定の描画時間を確保して残りを配分し、保持時間を描画終了後に加える', () => {
  const draft = { ...createEnemyRatingVideoTimingDraft(), finishSeconds: '8', overrides: { bars: '1.2', hold: '2' } }
  const parsed = parseEnemyRatingVideoTiming(draft)
  assert.ok(parsed.timing)
  assert.equal(parsed.timing.bars.duration, 1.2)
  assert.equal(parsed.timing.hold, 2)
  closeTo(parsed.finish, 8)
  closeTo(parsed.duration, 10)
  const { title, axes, values } = parsed.timing
  closeTo(title.duration / axes.duration, .38 / .68)
  closeTo(values.duration / axes.duration, 1.205 / .68)

  const automatic = parseEnemyRatingVideoTiming({ ...draft, finishSeconds: ' ' })
  assert.ok(automatic.timing)
  closeTo(automatic.timing.title.duration, .38 / 3.64 * 5)
  closeTo(automatic.duration, 5 - .88 / 3.64 * 5 + 1.2 + 2)
})

test('描画完了までの時間を個別指定の描画時間の合計と比較する', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  for (const finishSeconds of ['0', '-1', 'Infinity', 'abc']) {
    assert.equal(parseEnemyRatingVideoTiming({ ...draft, finishSeconds }).timing, null)
  }
  const overrides = { bars: '.1', hold: '.2' }
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '.09', overrides }).timing, null)
  const equal = parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '.1', overrides })
  assert.ok(equal.timing)
  assert.equal(equal.timing.bars.duration, .1)
  assert.equal(equal.timing.hold, .2)
  assert.equal(equal.timing.title.duration, 0)
  assert.equal(equal.finish, .1)
  closeTo(equal.duration, .3)

  const allFixed = { title: '1', axes: '1', ranks: '1', bars: '1', values: '1', hold: '1' }
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '6', overrides: allFixed }).timing, null)
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '5', overrides: allFixed }).duration, 6)
})

test('描画と完成図の保持に0秒を指定できる', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  draft.overrides = { values: '0', hold: '0' }
  const parsed = parseEnemyRatingVideoTiming(draft)
  assert.ok(parsed.timing)
  closeTo(parsed.finish, 2.435 / 3.64 * 5)
  assert.equal(parsed.duration, parsed.finish)
  assert.deepEqual(retimeEnemyRatingVideoStep(parsed.timing, 'values', 3.245, .18),
    { start: parsed.finish, duration: 0 })
})

test('文字の出し方を変更しても表示順と全体尺を引き継ぐ', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  draft.overrides = { ranks: '.99' }
  const rankLabel = (timing: EnemyRatingVideoTiming) =>
    retimeEnemyRatingVideoText(timing, 'ranks', .98 + .035, .18)
  const fade = parseEnemyRatingVideoTiming({ ...draft, textMode: 'fade' })
  const instant = parseEnemyRatingVideoTiming({ ...draft, textMode: 'instant' })
  const stagger = parseEnemyRatingVideoTiming(draft)
  assert.ok(fade.timing && instant.timing && stagger.timing)
  const rankLabelStart = 1.06 / 3.64 * 5 + .07
  closeTo(rankLabel(fade.timing).start, rankLabelStart)
  closeTo(rankLabel(fade.timing).duration, .36)
  assert.deepEqual(rankLabel(instant.timing), { start: instant.timing.ranks.start, duration: 0 })
  closeTo(rankLabel(stagger.timing).start, rankLabelStart)
  assert.equal(rankLabel(stagger.timing).duration, 0)
  assert.equal(instant.duration, fade.duration)
  assert.equal(stagger.duration, fade.duration)
  assert.deepEqual(retimeEnemyRatingVideoStep(stagger.timing, 'bars', 1.37, .88), stagger.timing.bars)
})

test('棒と縦線の出し方を独立して指定でき、文字の出し方と描画時間を引き継ぐ', () => {
  const draft = { ...createEnemyRatingVideoTimingDraft(), finishSeconds: '10', textMode: 'instant' as const }
  const defaults = parseEnemyRatingVideoTiming(draft)
  assert.ok(defaults.timing)
  assert.deepEqual(parseEnemyRatingVideoTiming({ ...draft, barMode: 'staggerGrow' }),
    { ...defaults, timing: { ...defaults.timing, barMode: 'staggerGrow' } })
  assert.deepEqual(parseEnemyRatingVideoTiming({ ...draft, guideMode: 'grow' }),
    { ...defaults, timing: { ...defaults.timing, guideMode: 'grow' } })
})

test('順に伸びる棒は各ランクの描画を重ねず、左右の棒の描画時間内で伸び切る', () => {
  const parsed = parseEnemyRatingVideoTiming({ ...createEnemyRatingVideoTimingDraft(), barMode: 'staggerGrow' })
  assert.ok(parsed.timing)
  const timing = parsed.timing
  const steps = [0, 1, 2].map(rankIndex => getEnemyRatingVideoBarStep(timing, rankIndex, 3))
  assert.equal(steps[0].start, timing.bars.start)
  assert.ok(steps.every(step => step.duration > 0))
  closeTo(steps[1].start, steps[0].start + steps[0].duration)
  closeTo(steps[2].start, steps[1].start + steps[1].duration)
  closeTo(steps[2].start + steps[2].duration, timing.bars.start + timing.bars.duration)
  assert.deepEqual(getEnemyRatingVideoBarStep(timing, 0, 1), timing.bars)
  assert.deepEqual(getEnemyRatingVideoBarStep({ ...timing, bars: { start: 2, duration: 0 } }, 2, 3),
    { start: 2, duration: 0 })
})

test('不正な表示順・秒数・全体尺では書き出し条件を作らない', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, order: ['title', 'ranks', 'ranks', 'bars', 'values'] }).timing, null)
  for (const title of ['-1', 'Infinity', 'abc']) {
    assert.equal(parseEnemyRatingVideoTiming({ ...draft, overrides: { title } }).timing, null)
  }
  const zero = { title: '0', axes: '0', ranks: '0', bars: '0', values: '0', hold: '0' }
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, overrides: zero }).timing, null)
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, overrides: { title: '1e308', hold: '1e308' } }).timing, null)
})

test('棒だけ伸ばす設定は個別調整済みの描画時間と保持時間を引き継ぎ、元の設定を変更しない', () => {
  const original = {
    ...createEnemyRatingVideoTimingDraft(),
    order: ['values', 'bars', 'ranks', 'axes', 'title'] as const,
    overrides: { title: '.2', axes: '.7', ranks: '.4', bars: '1.2', values: '.5', hold: ' 1.250 ' },
    phaseTempos: { title: 4, bars: 5 } as const,
    textMode: 'fade' as const,
    barMode: 'staggerGrow' as const,
    guideMode: 'grow' as const,
  }
  const draft = { ...original, order: [...original.order] }
  const previous = structuredClone(draft)
  const parsed = parseEnemyRatingVideoTiming(draft)
  const barsOnly = createEnemyRatingBarsOnlyDraft(draft)
  assert.ok(parsed.timing && barsOnly)
  const result = parseEnemyRatingVideoTiming(barsOnly)
  assert.ok(result.timing)
  closeTo(result.finish, parsed.finish)
  closeTo(result.duration, parsed.duration)
  assert.equal(result.timing.hold, parsed.timing.hold)
  assert.equal(barsOnly.overrides.hold, ' 1.250 ')
  assert.equal(barsOnly.animatedPhase, 'bars')
  assert.equal(result.timing.textMode, 'instant')
  assert.equal(result.timing.barMode, 'grow')
  assert.deepEqual(result.timing.bars, { start: 0, duration: parsed.finish })
  for (const phase of ['title', 'axes', 'ranks', 'values'] as const) {
    assert.deepEqual(result.timing[phase], { start: 0, duration: 0 })
    assert.deepEqual(retimeEnemyRatingVideoText(result.timing, phase, 1, .2), { start: 0, duration: 0 })
  }
  assert.deepEqual(getEnemyRatingVideoBarStep(result.timing, 0, 6), result.timing.bars)
  assert.deepEqual(getEnemyRatingVideoBarStep(result.timing, 5, 6), result.timing.bars)
  assert.deepEqual(draft, previous)
  assert.notEqual(barsOnly.order, draft.order)
  assert.notEqual(barsOnly.overrides, draft.overrides)
  assert.notEqual(barsOnly.phaseTempos, draft.phaseTempos)
})

test('棒だけ伸ばす設定では全体のテンポや描画完了秒数をすべて棒の描画に使う', () => {
  const barsOnly = createEnemyRatingBarsOnlyDraft(createEnemyRatingVideoTimingDraft())
  assert.ok(barsOnly)
  for (const tempo of ['veryShort', 'standard', 'slow20'] as const) {
    const parsed = parseEnemyRatingVideoTiming({ ...barsOnly, tempo, finishSeconds: '' })
    assert.ok(parsed.timing)
    assert.equal(parsed.timing.bars.duration, { veryShort: 2.5, standard: 5, slow20: 20 }[tempo])
  }
  const explicit = parseEnemyRatingVideoTiming({ ...barsOnly, finishSeconds: '8', overrides: { hold: '2' } })
  assert.ok(explicit.timing)
  assert.deepEqual(explicit.timing.bars, { start: 0, duration: 8 })
  assert.equal(explicit.finish, 8)
  assert.equal(explicit.duration, 10)

  const manual = parseEnemyRatingVideoTiming({ ...barsOnly, finishSeconds: '', overrides: { bars: '3.5', hold: '2' } })
  assert.ok(manual.timing)
  assert.deepEqual(manual.timing.bars, { start: 0, duration: 3.5 })
  assert.equal(manual.duration, 5.5)
  assert.equal(parseEnemyRatingVideoTiming({ ...barsOnly, finishSeconds: '8', overrides: { bars: '3.5' } }).timing, null)
})

test('棒以外は表示順によらず0秒から表示し、描画時間0秒でも完成図の保持を引き継ぐ', () => {
  const barsOnly = createEnemyRatingBarsOnlyDraft(createEnemyRatingVideoTimingDraft())
  assert.ok(barsOnly)
  const reordered = parseEnemyRatingVideoTiming({ ...barsOnly, order: ['bars', 'title', 'axes', 'ranks', 'values'] })
  assert.ok(reordered.timing)
  assert.deepEqual(reordered.timing.values, { start: 0, duration: 0 })
  const instant = createEnemyRatingBarsOnlyDraft({
    ...createEnemyRatingVideoTimingDraft(),
    overrides: { title: '0', axes: '0', ranks: '0', bars: '0', values: '0', hold: '2' },
  })
  assert.ok(instant)
  const result = parseEnemyRatingVideoTiming(instant)
  assert.ok(result.timing)
  assert.equal(result.finish, 0)
  assert.equal(result.duration, 2)
  assert.deepEqual(result.timing.bars, { start: 0, duration: 0 })
})

test('棒だけ伸ばす設定へ変換する前に元の秒数と表示順を検証する', () => {
  const draft = createEnemyRatingVideoTimingDraft()
  assert.equal(createEnemyRatingBarsOnlyDraft({ ...draft, overrides: { bars: '-1' } }), null)
  assert.equal(createEnemyRatingBarsOnlyDraft({ ...draft, finishSeconds: 'abc' }), null)
  assert.equal(createEnemyRatingBarsOnlyDraft({ ...draft, order: ['bars', 'bars', 'axes', 'ranks', 'values'] }), null)
  assert.equal(parseEnemyRatingVideoTiming({ ...draft, animatedPhase: 'unknown' as 'bars' }).timing, null)
})
