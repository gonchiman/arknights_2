import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEnemyRatingBarsOnlyDraft, createEnemyRatingVideoTimingDraft, getEnemyRatingVideoBarStep, parseEnemyRatingVideoTiming,
} from '../src/lib/enemyRatingVideoTiming.ts'
import {
  formatEnemyRatingVideoShare, getAnimatedEnemyRatingShares, getEnemyRatingVideoProgress,
} from '../src/lib/enemyRatingVideoValues.ts'

const rows = [
  { share: .2, cumulativeShare: .2 },
  { share: .3, cumulativeShare: .5 },
  { share: .5, cumulativeShare: 1 },
]

function closeTo(actual: readonly (number | null)[], expected: readonly number[]) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => assert.ok(value !== null && Math.abs(value - expected[index]) < 1e-12))
}

test('同時に伸びる棒は同じ伸び率で階級割合と累積割合を更新し、分母を固定する', () => {
  closeTo(getAnimatedEnemyRatingShares(rows, [0, 0, 0], 'rank'), [0, 0, 0])
  closeTo(getAnimatedEnemyRatingShares(rows, [.5, .5, .5], 'rank'), [.1, .15, .25])
  closeTo(getAnimatedEnemyRatingShares(rows, [.5, .5, .5], 'cumulative'), [.1, .25, .5])
  assert.deepEqual(getAnimatedEnemyRatingShares(rows, [1, 1, 1], 'rank'), rows.map(row => row.share))
  assert.deepEqual(getAnimatedEnemyRatingShares(rows, [1, 1, 1], 'cumulative'), rows.map(row => row.cumulativeShare))
})

test('順に伸びる棒の累積は完成済みと現在伸びている棒を加算し、未表示の行にも反映する', () => {
  const draft = createEnemyRatingBarsOnlyDraft(createEnemyRatingVideoTimingDraft())
  assert.ok(draft)
  const parsed = parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '3', barMode: 'staggerGrow' })
  assert.ok(parsed.timing)
  const progress = rows.map((_, rank) => getEnemyRatingVideoProgress(1.5, getEnemyRatingVideoBarStep(parsed.timing, rank, rows.length)))
  assert.deepEqual(progress, [1, .5, 0])
  closeTo(getAnimatedEnemyRatingShares(rows, progress, 'rank'), [.2, .15, 0])
  closeTo(getAnimatedEnemyRatingShares(rows, progress, 'cumulative'), [.2, .35, .35])
})

test('瞬時に順に表示する棒では、その棒の出現と同じ時刻に数値を切り替える', () => {
  const draft = createEnemyRatingBarsOnlyDraft(createEnemyRatingVideoTimingDraft())
  assert.ok(draft)
  const parsed = parseEnemyRatingVideoTiming({ ...draft, finishSeconds: '3', barMode: 'stagger' })
  assert.ok(parsed.timing)
  const progressAt = (seconds: number) => rows.map((_, rank) =>
    getEnemyRatingVideoProgress(seconds, getEnemyRatingVideoBarStep(parsed.timing, rank, rows.length)))
  closeTo(getAnimatedEnemyRatingShares(rows, progressAt(1.49), 'cumulative'), [.2, .2, .2])
  closeTo(getAnimatedEnemyRatingShares(rows, progressAt(1.5), 'cumulative'), [.2, .5, .5])
  assert.deepEqual(getAnimatedEnemyRatingShares(rows, progressAt(3), 'cumulative'), [.2, .5, 1])
})

test('棒と数値には同じsmoothstepを使い、開始前・途中・終了後と0秒描画を処理する', () => {
  const step = { start: 2, duration: 4 }
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(time => getEnemyRatingVideoProgress(time, step)),
    [0, 0, .15625, .5, .84375, 1, 1])
  assert.deepEqual([1, 2, 3].map(time => getEnemyRatingVideoProgress(time, { start: 2, duration: 0 })), [0, 1, 1])
})

test('割合0と欠損は区別し、ゼロの階級でもそれ以前の累積を残す', () => {
  const zero = [{ share: .2, cumulativeShare: .2 }, { share: 0, cumulativeShare: .2 }, { share: .8, cumulativeShare: 1 }]
  closeTo(getAnimatedEnemyRatingShares(zero, [1, 0, .5], 'rank'), [.2, 0, .4])
  closeTo(getAnimatedEnemyRatingShares(zero, [1, 0, .5], 'cumulative'), [.2, .2, .6])
  const missing = [{ share: null, cumulativeShare: null }]
  assert.deepEqual(getAnimatedEnemyRatingShares(missing, [0], 'rank'), [null])
  assert.deepEqual(getAnimatedEnemyRatingShares(missing, [1], 'cumulative'), [null])
  assert.equal(formatEnemyRatingVideoShare(null), '—')
  assert.equal(formatEnemyRatingVideoShare(0), '0')
})

test('極小値の書式と完成値を維持し、浮動小数の加算でも100%を超えない', () => {
  assert.equal(formatEnemyRatingVideoShare(.00001), '<0.1')
  assert.equal(formatEnemyRatingVideoShare(.01234), '1.2')
  assert.equal(formatEnemyRatingVideoShare(1), '100')
  const values = [{ share: .1, cumulativeShare: .1 }, { share: .2, cumulativeShare: .3 }, { share: .7, cumulativeShare: 1 }]
  const completed = getAnimatedEnemyRatingShares(values, [1, 1, 1], 'cumulative')
  assert.deepEqual(completed, [.1, .3, 1])
  const almostCompleted = getAnimatedEnemyRatingShares(values, [1, 1, 1 - Number.EPSILON], 'cumulative')
  assert.ok(almostCompleted.every(value => value !== null && value <= 1))
  assert.equal(formatEnemyRatingVideoShare(almostCompleted.at(-1)!), '100')
})
