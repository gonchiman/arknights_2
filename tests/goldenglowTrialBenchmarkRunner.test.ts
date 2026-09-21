import test from 'node:test'
import assert from 'node:assert/strict'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'
import type { HpComparisonInput } from '../src/lib/goldenglowTargetSwitchHpComparison.ts'
import {
  TrialBenchmarkRunner,
  type TrialBenchmarkMeasurement,
  type TrialBenchmarkRequest,
  type TrialBenchmarkState,
} from '../src/lib/goldenglowTrialBenchmarkRunner.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
  attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
  prdStep: 0.015, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
  resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}

function request(overrides: Partial<TrialBenchmarkRequest> = {}): TrialBenchmarkRequest {
  return {
    key: 'conditions-a', label: 'S3 / 3 HP / 2 MOD', trialCounts: [10_000, 20_000, 50_000], repeats: 3,
    input: { builds: ['none', 'X'].map((id) => ({
      id, label: id, moduleType: id === 'none' ? null : id, potential: 1,
      input: {
        model: { ...model }, skillIndex: 3, effectiveAttack: id === 'none' ? 703 : 801,
        attackInterval: 1.3, duration: 30, enemyHps: [1_000, 10_000, 20_000],
        enemyResistance: 30, enemyDefense: 0, switchDelay: 0.1,
        retargetRemainingDrones: true, trials: 2_000, seed: 20260920,
      },
    })) },
    ...overrides,
  }
}

interface PendingMeasurement {
  input: HpComparisonInput
  signal: AbortSignal
  resolve: (result: TrialBenchmarkMeasurement) => void
  reject: (cause: Error) => void
}

function harness() {
  const calls: PendingMeasurement[] = []
  const states: TrialBenchmarkState[] = []
  const runner = new TrialBenchmarkRunner((input, signal) => new Promise((resolve, reject) => {
    calls.push({ input, signal, resolve, reject })
  }), (state) => states.push(structuredClone(state)))
  return { runner, calls, states, latest: () => states.at(-1)! }
}

async function complete(call: PendingMeasurement, elapsedMs: number) {
  call.resolve({ type: 'complete', elapsedMs })
  await Promise.resolve()
}

test('試行回数を昇順・重複なしに揃え、各条件を指定回数ずつ独立して計測する', async () => {
  const calls: { input: HpComparisonInput; signal: AbortSignal }[] = []
  const states: TrialBenchmarkState[] = []
  const runner = new TrialBenchmarkRunner(async (input, signal) => {
    calls.push({ input, signal })
    return { type: 'complete', elapsedMs: calls.length * 10 }
  }, (state) => states.push(structuredClone(state)))
  const setup = request({ trialCounts: [100_000, 10_000, 50_000, 20_000, 10_000] })
  const before = structuredClone(setup)
  await runner.start(setup)

  assert.deepEqual(calls.map(({ input }) => input.builds.map((build) => build.input.trials)),
    [10_000, 20_000, 50_000, 100_000].flatMap((count) => Array.from({ length: 3 }, () => [count, count])))
  assert.equal(new Set(calls.map((call) => call.input)).size, 12)
  assert.equal(new Set(calls.map((call) => call.signal)).size, 12)
  for (const { input, signal } of calls) {
    assert.equal(signal.aborted, false)
    assert.deepEqual(input.builds.map((build, index) => ({ ...build, input: { ...build.input, trials: before.input.builds[index].input.trials } })), before.input.builds)
  }
  assert.deepEqual(setup, before)
  const final = states.at(-1)!
  assert.equal(final.status, 'complete')
  assert.equal(final.activeRepeat, null)
  assert.deepEqual(final.request?.trialCounts, [10_000, 20_000, 50_000, 100_000])
  assert.deepEqual(final.rows.map((row) => [row.trials, row.status, row.timesMs]), [
    [10_000, 'complete', [10, 20, 30]], [20_000, 'complete', [40, 50, 60]],
    [50_000, 'complete', [70, 80, 90]], [100_000, 'complete', [100, 110, 120]],
  ])
  assert.deepEqual(states[0].rows.map((row) => [row.status, row.timesMs]), Array.from({ length: 4 }, () => ['pending', []]))
  assert.ok(states.some((state) => state.activeRepeat === 3))
})

test('任意の整数を昇順・重複なしで実際の計測入力へ渡し、条件名と実測値を維持する', async () => {
  const h = harness()
  const counts = [1, 12_345, 30_000, 80_000]
  const setup = request({ trialCounts: [80_000, 12_345, 1, 30_000, 12_345], label: '自由指定の計測条件' })
  const before = structuredClone(setup)
  const run = h.runner.start(setup)
  for (let index = 0; index < counts.length * setup.repeats; index += 1) {
    const count = counts[Math.floor(index / setup.repeats)]
    assert.deepEqual(h.calls[index].input.builds.map((build) => build.input.trials), [count, count])
    assert.equal(h.latest().activeRepeat, index % setup.repeats + 1)
    assert.equal(h.latest().request?.label, before.label)
    assert.equal(h.latest().request?.key, before.key)
    assert.equal(h.latest().rows[Math.floor(index / setup.repeats)].totalTrials, count * 6)
    await complete(h.calls[index], 0.25 + index)
  }
  await run
  assert.deepEqual(setup, before)
  assert.equal(h.latest().status, 'complete')
  assert.deepEqual(h.latest().request, { ...before, trialCounts: counts })
  assert.deepEqual(h.latest().rows.map((row) => [row.trials, row.status, row.timesMs]), [
    [1, 'complete', [0.25, 1.25, 2.25]], [12_345, 'complete', [3.25, 4.25, 5.25]],
    [30_000, 'complete', [6.25, 7.25, 8.25]], [80_000, 'complete', [9.25, 10.25, 11.25]],
  ])
})

test('総試行数は1計測のHP数×MOD数×試行回数で、繰り返し数を掛けない', async () => {
  for (const repeats of [1, 3, 5]) {
    const h = harness()
    const run = h.runner.start(request({ repeats, trialCounts: [50_000] }))
    assert.equal(h.latest().rows[0].totalTrials, 3 * 2 * 50_000)
    for (let repeat = 0; repeat < repeats; repeat += 1) await complete(h.calls[repeat], 10 + repeat)
    await run
    assert.equal(h.calls.length, repeats)
    assert.equal(h.latest().rows[0].totalTrials, 300_000)
    assert.equal(h.latest().rows[0].timesMs.length, repeats)
  }
})

test('開始時の条件を固定し、呼び出し元と計測関数による変更を後続測定へ混ぜない', async () => {
  const h = harness()
  const setup = request({ trialCounts: [12_345] })
  const before = structuredClone(setup)
  const run = h.runner.start(setup)
  setup.label = 'changed'
  setup.key = 'different'
  setup.trialCounts.push(100_000)
  setup.repeats = 5
  setup.input.builds[0].input.model.prdStep = 1
  ;(setup.input.builds[0].input.enemyHps as number[])[0] = 1
  h.calls[0].input.builds[1].input.effectiveAttack = -1
  ;(h.calls[0].input.builds[1].input.enemyHps as number[])[0] = 2
  for (let repeat = 0; repeat < 3; repeat += 1) {
    if (repeat > 0) {
      assert.deepEqual(h.calls[repeat].input, {
        builds: before.input.builds.map((build) => ({ ...build, input: { ...build.input, trials: 12_345 } })),
      })
    }
    await complete(h.calls[repeat], repeat + 1)
  }
  await run
  assert.equal(h.calls.length, 3)
  assert.deepEqual(h.latest().request, before)
  assert.deepEqual(h.latest().rows[0].timesMs, [1, 2, 3])
})

test('中止は完了済み行と途中の実測値を保持し、遅延した結果を無視する', async () => {
  const h = harness()
  const run = h.runner.start(request())
  for (let index = 0; index < 4; index += 1) await complete(h.calls[index], index + 1)
  assert.equal(h.calls.length, 5)
  assert.equal(h.latest().activeRepeat, 2)
  h.runner.cancel()
  const cancelled = structuredClone(h.latest())
  const updates = h.states.length
  assert.equal(h.calls[4].signal.aborted, true)
  assert.ok(h.calls.slice(0, 4).every((call) => !call.signal.aborted))
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.activeRepeat, null)
  assert.deepEqual(cancelled.rows.map((row) => [row.status, row.timesMs]), [
    ['complete', [1, 2, 3]], ['cancelled', [4]], ['cancelled', []],
  ])
  await complete(h.calls[4], 999)
  await run
  assert.equal(h.calls.length, 5)
  assert.equal(h.states.length, updates)
  assert.deepEqual(h.latest(), cancelled)
  h.runner.cancel()
  assert.equal(h.states.length, updates)
})

test('中止後に測定Promiseが拒否されてもエラー表示へ変わらず、通知なし中止は更新しない', async () => {
  for (const notify of [true, false]) {
    const h = harness()
    const run = h.runner.start(request())
    const beforeUpdates = h.states.length
    h.runner.cancel(notify)
    assert.equal(h.states.length, beforeUpdates + (notify ? 1 : 0))
    const updates = h.states.length
    h.calls[0].reject(new Error('aborted'))
    await run
    assert.equal(h.calls[0].signal.aborted, true)
    assert.equal(h.states.length, updates)
    assert.equal(h.calls.length, 1)
  }
})

test('再開始は旧計測を中止し、旧世代の完了が新しい条件と結果を上書きしない', async () => {
  const h = harness()
  const first = h.runner.start(request({ key: 'old' }))
  const second = h.runner.start(request({ key: 'new', trialCounts: [50_000], repeats: 1 }))
  assert.equal(h.calls[0].signal.aborted, true)
  assert.equal(h.calls[1].signal.aborted, false)
  assert.equal(h.latest().request?.key, 'new')
  const updates = h.states.length
  await complete(h.calls[0], 999)
  await first
  assert.equal(h.states.length, updates)
  assert.equal(h.calls.length, 2)
  await complete(h.calls[1], 42)
  await second
  assert.equal(h.latest().request?.key, 'new')
  assert.equal(h.latest().status, 'complete')
  assert.deepEqual(h.latest().rows.map((row) => [row.trials, row.timesMs]), [[50_000, [42]]])
})

test('上限エラーはその条件の残り反復だけを打ち切り、次の試行回数へ進む', async () => {
  const h = harness()
  const run = h.runner.start(request({ trialCounts: [10_000, 20_000] }))
  await complete(h.calls[0], 10)
  h.calls[1].resolve({ type: 'error', kind: 'limit', error: '計算量の上限' })
  await Promise.resolve()
  assert.equal(h.calls.length, 3)
  assert.equal(h.calls[2].input.builds[0].input.trials, 20_000)
  assert.deepEqual(h.latest().rows[0], {
    trials: 10_000, totalTrials: 60_000, timesMs: [10], status: 'limit', error: '計算量の上限',
  })
  for (let index = 2; index < 5; index += 1) await complete(h.calls[index], 20 + index)
  await run
  assert.equal(h.calls.length, 5)
  assert.equal(h.latest().status, 'complete')
  assert.deepEqual(h.latest().rows.map((row) => [row.status, row.timesMs]), [['limit', [10]], ['complete', [22, 23, 24]]])
})

test('実行エラー・タイムアウトは取得済み測定を保持し、後続条件を中止する', async () => {
  for (const kind of ['error', 'timeout'] as const) {
    const h = harness()
    const run = h.runner.start(request())
    for (let index = 0; index < 4; index += 1) await complete(h.calls[index], index + 1)
    h.calls[4].resolve({ type: 'error', kind, error: `test ${kind}` })
    await run
    assert.equal(h.calls.length, 5)
    assert.equal(h.latest().status, 'error')
    assert.equal(h.latest().activeRepeat, null)
    assert.deepEqual(h.latest().rows.map((row) => [row.status, row.timesMs]), [
      ['complete', [1, 2, 3]], [kind, [4]], ['cancelled', []],
    ])
    assert.equal(h.latest().rows[1].error, `test ${kind}`)
  }
})

test('不正な実測値と測定例外はサンプルにせず、後続条件を中止する', async () => {
  for (const elapsedMs of [-1, NaN, Infinity]) {
    const h = harness()
    const run = h.runner.start(request())
    await complete(h.calls[0], elapsedMs)
    await run
    assert.equal(h.calls.length, 1)
    assert.equal(h.latest().status, 'error')
    assert.deepEqual(h.latest().rows.map((row) => [row.status, row.timesMs]), [['error', []], ['cancelled', []], ['cancelled', []]])
  }
  const h = harness()
  const run = h.runner.start(request())
  h.calls[0].reject(new Error('Worker construction failed'))
  await run
  assert.equal(h.latest().status, 'error')
  assert.equal(h.latest().rows[0].status, 'error')
  assert.deepEqual(h.latest().rows[0].timesMs, [])
  assert.equal(h.calls.length, 1)
})

test('不正な試行回数と計測回数は開始せず、実行中の正しい測定を中止しない', async () => {
  const h = harness()
  const run = h.runner.start(request({ repeats: 1, trialCounts: [10_000] }))
  const updates = h.states.length
  const sparseCounts = [12_345, 30_000]
  delete sparseCounts[0]
  for (const override of [
    { repeats: 0 }, { repeats: 2 }, { repeats: 6 }, { repeats: NaN },
    { trialCounts: [] }, { trialCounts: [0] }, { trialCounts: [-1] }, { trialCounts: [1.5] },
    { trialCounts: [12_345.5] }, { trialCounts: [100_001] }, { trialCounts: [10_000, NaN] },
    { trialCounts: [Infinity] }, { trialCounts: [-Infinity] },
    { trialCounts: new Array<number>(2) }, { trialCounts: sparseCounts },
    { trialCounts: null as unknown as number[] }, { trialCounts: undefined as unknown as number[] },
  ]) await assert.rejects(h.runner.start(request(override)), RangeError)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].signal.aborted, false)
  assert.equal(h.states.length, updates)
  await complete(h.calls[0], 0)
  await run
  assert.deepEqual(h.latest().rows[0].timesMs, [0])
  assert.equal(h.latest().status, 'complete')
})
