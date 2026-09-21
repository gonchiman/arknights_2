import test from 'node:test'
import assert from 'node:assert/strict'
import type { HpComparisonInput } from '../src/lib/goldenglowTargetSwitchHpComparison.ts'
import { validateGoldenglowTrialBenchmarkInput } from '../src/lib/goldenglowTrialBenchmark.ts'
import type { TrialBenchmarkMeasurement } from '../src/lib/goldenglowTrialBenchmarkRunner.ts'
import {
  EMPTY_RUNTIME_CALIBRATION, RuntimeCalibrationRunner,
  type RuntimeCalibrationRequest, type RuntimeCalibrationState,
} from '../src/lib/goldenglowRuntimeCalibration.ts'

function request(key = 'same-conditions'): RuntimeCalibrationRequest {
  return { key, input: { builds: ['none', 'X'].map((id) => ({ id, label: id,
    input: {
      model: {
        talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
        attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
        prdStep: 0.015, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
        resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
        droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
        droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
      },
      skillIndex: 3, effectiveAttack: 700, attackInterval: 1.3, duration: 30,
      enemyHps: [1_000, 10_000, 20_000], enemyResistance: 30, enemyDefense: 0,
      switchDelay: 0.1, retargetRemainingDrones: true, trials: 20_000, seed: 20260920,
    },
  })) } }
}
interface Pending {
  input: HpComparisonInput
  signal: AbortSignal
  resolve: (value: TrialBenchmarkMeasurement) => void
  reject: (cause: Error) => void
}
function pendingHarness(options?: { now?: () => number; deadlineMs?: number }) {
  const calls: Pending[] = []
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner((input, signal) => new Promise((resolve, reject) => {
    calls.push({ input, signal, resolve, reject })
  }), (state) => states.push(state), options)
  return { runner, calls, states, latest: () => states.at(-1)! }
}
async function flush() { for (let count = 0; count < 12; count++) await Promise.resolve() }
async function resolve(call: Pending, elapsedMs: number) { call.resolve({ type: 'complete', elapsedMs }); await flush() }

test('adaptive cold samples separate a fixed cost, omit the probe, and confirm a third point', async () => {
  const calls: { input: HpComparisonInput; signal: AbortSignal }[] = []
  const states: RuntimeCalibrationState[] = []
  let clock = 10
  const runner = new RuntimeCalibrationRunner(async (input, signal) => {
    calls.push({ input, signal })
    const elapsedMs = 20 + input.builds[0].input.trials * 0.05
    clock += elapsedMs + 15 // Fresh-worker startup is excluded from measurement but included in wall time.
    return { type: 'complete', elapsedMs }
  }, (state) => states.push(state), { now: () => clock })
  const setup = request()
  const before = structuredClone(setup)
  await runner.start(setup)
  const final = states.at(-1)!
  assert.equal(final.status, 'complete')
  assert.equal(calls.length, 4)
  assert.equal(final.measurements[0].role, 'probe')
  const samples = final.measurements.filter((item) => item.role === 'sample')
  assert.equal(samples.length, 3)
  assert.equal(new Set(samples.map((item) => item.trials)).size, 3)
  assert.equal(calls[0].input.builds[0].input.trials, 32)
  assert.ok(samples[1].trials > samples[0].trials * 2)
  assert.ok(samples[2].trials > samples[0].trials && samples[2].trials < samples[1].trials)
  const computeMs = final.measurements.reduce((total, item) => total + item.elapsedMs, 0)
  assert.ok(computeMs <= 500)
  assert.ok(Math.abs(final.elapsedMs - computeMs - calls.length * 15) < 0.000001)
  assert.equal(final.activeTrials, null)
  assert.equal(new Set(calls.map((call) => call.signal)).size, calls.length)
  assert.equal(new Set(calls.map((call) => call.input)).size, calls.length)
  assert.deepEqual(setup, before)
  assert.ok(states.every((state) => state.request === final.request))
})

test('sub-resolution adaptation timings stay probes and are increased before acceptance', async () => {
  const states: RuntimeCalibrationState[] = []
  let index = 0
  const runner = new RuntimeCalibrationRunner(async (input) => {
    const count = input.builds[0].input.trials
    return { type: 'complete', elapsedMs: index++ === 0 ? 100 : count * 0.1 }
  }, (state) => states.push(state))
  await runner.start(request())
  const final = states.at(-1)!
  assert.equal(final.status, 'complete')
  assert.ok(final.measurements.filter((item) => item.role === 'probe').length >= 2)
  assert.ok(final.measurements.filter((item) => item.role === 'sample').every((item) => item.elapsedMs >= 10))
  assert.ok(final.measurements.length <= 6)
})

test('tiny, reversed, indistinct and unstable timings never yield accepted samples', async () => {
  const cases = [
    (_count: number, _index: number) => 0.1,
    (_count: number, index: number) => [5, 100, 50, 80][index] ?? 80,
    (_count: number, index: number) => [5, 100, 105, 100][index] ?? 100,
    (count: number, index: number) => count * 0.05 * (index === 3 ? 1.8 : 1),
  ]
  for (const time of cases) {
    const states: RuntimeCalibrationState[] = []
    let index = 0
    const runner = new RuntimeCalibrationRunner(async (input) => ({ type: 'complete', elapsedMs: time(input.builds[0].input.trials, index++) }),
      (state) => states.push(state))
    await runner.start(request())
    assert.equal(states.at(-1)!.status, 'insufficient')
    assert.ok(!states.some((state) => state.status === 'complete'))
    assert.ok(index <= 6)
  }
})

test('nonlinear fixed-cost model is rejected even when timing rises monotonically', async () => {
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner(async (input) => {
    const count = input.builds[0].input.trials
    return { type: 'complete', elapsedMs: count * count * 0.0001 }
  }, (state) => states.push(state))
  await runner.start(request())
  assert.equal(states.at(-1)!.status, 'insufficient')
})

test('500ms computation target stops further work after an unexpectedly heavy probe', async () => {
  let calls = 0
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner(async () => { calls++; return { type: 'complete', elapsedMs: 501 } },
    (state) => states.push(state))
  await runner.start(request())
  assert.equal(calls, 1)
  assert.equal(states.at(-1)!.status, 'insufficient')
})

test('one wall deadline aborts the active worker even if its Promise ignores cancellation', async () => {
  const h = pendingHarness({ deadlineMs: 15 })
  const run = h.runner.start(request())
  await flush()
  assert.equal(h.calls.length, 1)
  await run
  assert.equal(h.calls[0].signal.aborted, true)
  assert.equal(h.latest().status, 'insufficient')
  assert.match(h.latest().error!, /中止/)
  const updates = h.states.length
  await resolve(h.calls[0], 100)
  assert.equal(h.states.length, updates)
})

test('the global deadline also covers gaps and startup between separate measurements', async () => {
  let now = 0
  const h = pendingHarness({ now: () => now })
  const run = h.runner.start(request())
  await flush()
  now = 1_900
  await resolve(h.calls[0], 5)
  assert.equal(h.calls.length, 2)
  now = 2_001
  await resolve(h.calls[1], 75)
  await run
  assert.equal(h.latest().status, 'insufficient')
  assert.equal(h.latest().elapsedMs, 2_001)
  assert.equal(h.calls.length, 2)
})

test('cancel aborts and settles immediately, preserves completed work and ignores late completion', async () => {
  let now = 0
  const h = pendingHarness({ now: () => now })
  const run = h.runner.start(request())
  await flush()
  await resolve(h.calls[0], 10)
  now = 123
  h.runner.cancel()
  await run
  assert.equal(h.calls[1].signal.aborted, true)
  assert.equal(h.latest().status, 'cancelled')
  assert.equal(h.latest().elapsedMs, 123)
  assert.equal(h.latest().measurements.length, 1)
  const updates = h.states.length
  await resolve(h.calls[1], 75)
  assert.equal(h.states.length, updates)
  h.runner.cancel()
  assert.equal(h.states.length, updates)
})

test('silent unmount cancellation never publishes after cancellation, even on rejection', async () => {
  const h = pendingHarness()
  const run = h.runner.start(request())
  await flush()
  const updates = h.states.length
  h.runner.cancel(false)
  await run
  h.calls[0].reject(new Error('late rejection'))
  await flush()
  assert.equal(h.calls[0].signal.aborted, true)
  assert.equal(h.states.length, updates)
})

test('a superseding request cancels the previous generation without accepting its samples', async () => {
  const h = pendingHarness()
  const first = h.runner.start(request('first'))
  await flush()
  const second = h.runner.start(request('second'))
  await flush()
  assert.equal(h.calls[0].signal.aborted, true)
  const updates = h.states.length
  await resolve(h.calls[0], 999)
  await first
  assert.equal(h.states.length, updates)
  assert.equal(h.latest().request?.key, 'second')
  h.runner.cancel()
  await second
})

test('request and each worker input are isolated from caller and measurement mutations', async () => {
  const h = pendingHarness()
  const setup = request()
  const before = structuredClone(setup)
  const run = h.runner.start(setup)
  await flush()
  setup.key = 'mutated'
  setup.input.builds[0].input.model.prdStep = 1
  h.calls[0].input.builds[1].input.effectiveAttack = -1
  await resolve(h.calls[0], 10)
  const secondInput = h.calls[1].input
  assert.equal(secondInput.builds[1].input.effectiveAttack, before.input.builds[1].input.effectiveAttack)
  assert.equal(secondInput.builds[0].input.model.prdStep, before.input.builds[0].input.model.prdStep)
  assert.equal(h.latest().request?.key, before.key)
  h.runner.cancel()
  await run
})

test('invalid conditions fail before any worker and keep their request for matching error UI', async () => {
  const invalid = request()
  invalid.input.builds[0].input.duration = 0
  const h = pendingHarness()
  await h.runner.start(invalid)
  assert.equal(h.calls.length, 0)
  assert.equal(h.latest().status, 'error')
  assert.equal(h.latest().request?.key, invalid.key)
  assert.ok(h.latest().error)
})

test('workload and allocation limits constrain adaptive counts before measurement', async () => {
  const setup = request()
  for (const build of setup.input.builds) { build.input.duration = 300; build.input.attackInterval = 0.05 }
  const counts: number[] = []
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner(async (input) => {
    assert.doesNotThrow(() => validateGoldenglowTrialBenchmarkInput(input))
    const count = input.builds[0].input.trials
    counts.push(count)
    return { type: 'complete', elapsedMs: count * 0.2 }
  }, (state) => states.push(state))
  await runner.start(setup)
  assert.equal(states.at(-1)!.status, 'complete')
  assert.ok(Math.max(...counts) <= 699) // 8 MiB / (6,000 volleys × 2 bytes)
  assert.ok(Math.max(...counts) > 32)
})

test('100,000 trial execution boundary can complete calibration without running 100,001', async () => {
  const counts: number[] = []
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner(async (input) => {
    const count = input.builds[0].input.trials
    counts.push(count)
    return { type: 'complete', elapsedMs: count * 0.0015 }
  }, (state) => states.push(state))
  await runner.start(request())
  assert.equal(states.at(-1)!.status, 'complete')
  assert.equal(Math.max(...counts), 100_000)
})

test('invalid elapsed values and explicit worker errors do not become calibration evidence', async () => {
  for (const elapsedMs of [-1, NaN, Infinity]) {
    const states: RuntimeCalibrationState[] = []
    const runner = new RuntimeCalibrationRunner(async () => ({ type: 'complete', elapsedMs }), (state) => states.push(state))
    await runner.start(request())
    assert.equal(states.at(-1)!.status, 'error')
    assert.deepEqual(states.at(-1)!.measurements, [])
  }
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner(async () => ({ type: 'error', kind: 'limit', error: 'resource limit' }), (state) => states.push(state))
  await runner.start(request())
  assert.equal(states.at(-1)!.status, 'error')
  assert.equal(states.at(-1)!.error, 'resource limit')
})

test('initial cancellation from a state observer starts no worker and does not leave a timer', async () => {
  let calls = 0
  const states: RuntimeCalibrationState[] = []
  const runner = new RuntimeCalibrationRunner(async () => { calls++; return { type: 'complete', elapsedMs: 10 } }, (state) => {
    states.push(state)
    if (state.status === 'running') runner.cancel()
  })
  await runner.start(request())
  assert.equal(calls, 0)
  assert.equal(states.at(-1)!.status, 'cancelled')
  assert.equal(EMPTY_RUNTIME_CALIBRATION.status, 'idle')
})
