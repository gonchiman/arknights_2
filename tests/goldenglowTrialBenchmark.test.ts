import test from 'node:test'
import assert from 'node:assert/strict'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_LIMITS,
  prepareGoldenglowTargetSwitchSimulation,
  simulateGoldenglowTargetSwitch,
} from '../src/lib/goldenglowTargetSwitch.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS,
  simulateGoldenglowTargetSwitchGrid,
} from '../src/lib/goldenglowTargetSwitchGrid.ts'
import { simulateGoldenglowTargetSwitchHp, type GoldenglowTargetSwitchHpInput } from '../src/lib/goldenglowTargetSwitchHp.ts'
import {
  HP_COMPARISON_LIMITS,
  simulateGoldenglowTargetSwitchHpComparison,
  validateHpComparisonInput,
  type HpComparisonBuild,
  type HpComparisonInput,
} from '../src/lib/goldenglowTargetSwitchHpComparison.ts'
import {
  GOLDENGLOW_TRIAL_BENCHMARK_PRESETS,
  isGoldenglowTrialBenchmarkCount,
  simulateGoldenglowTrialBenchmark,
  summarizeGoldenglowTrialBenchmark,
  validateGoldenglowTrialBenchmarkInput,
  type GoldenglowTrialBenchmarkMessage,
} from '../src/lib/goldenglowTrialBenchmark.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
  attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
  prdStep: 0, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 1,
  resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}

function build(id = 'none', overrides: Partial<GoldenglowTargetSwitchHpInput> = {}): HpComparisonBuild {
  return {
    id, label: id, moduleType: id === 'none' ? null : id, potential: 1,
    input: {
      model: { ...model }, skillIndex: 3, effectiveAttack: 500, attackInterval: 1, duration: 1,
      enemyHps: [50, 1_000], enemyResistance: 0, enemyDefense: 0,
      switchDelay: 0.1, retargetRemainingDrones: true, trials: 100_000, seed: 20260920,
      ...overrides,
    },
  }
}

/** A failed validation must not allocate any PRD pattern or actor-state buffers. */
function withoutSimulationBuffers(check: () => void): void {
  const original = globalThis.Uint16Array
  let allocations = 0
  globalThis.Uint16Array = new Proxy(original, {
    construct() {
      allocations += 1
      throw new Error('Simulation allocated before validation completed')
    },
  })
  try {
    check()
    assert.equal(allocations, 0)
  } finally {
    globalThis.Uint16Array = original
  }
}

test('専用ベンチマークは100,000回を実計算し、通常の全上限を変えない', () => {
  const limits = structuredClone([GOLDENGLOW_TARGET_SWITCH_LIMITS, GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS, HP_COMPARISON_LIMITS])
  assert.deepEqual(GOLDENGLOW_TRIAL_BENCHMARK_PRESETS, [10_000, 20_000, 50_000, 100_000])
  const input = { builds: [build()] }
  assert.doesNotThrow(() => validateGoldenglowTrialBenchmarkInput(input))
  const result = simulateGoldenglowTrialBenchmark(input)
  assert.deepEqual(result, [{
    id: 'none', label: 'none', moduleType: null, potential: 1,
    points: [
      { enemyHp: 50, expectedDamage: 100, damageBreakdown: { normalDamage: 100, explosionDamage: 0, bodyDamage: 0 } },
      { enemyHp: 1_000, expectedDamage: 100, damageBreakdown: { normalDamage: 100, explosionDamage: 0, bodyDamage: 0 } },
    ],
  }])
  assert.deepEqual([GOLDENGLOW_TARGET_SWITCH_LIMITS, GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS, HP_COMPARISON_LIMITS], limits)
  assert.equal(GOLDENGLOW_TARGET_SWITCH_LIMITS.maxTrials, 20_000)
})

test('プリセット以外も1〜100,000の整数なら許可し、同じHP計算経路で実計算する', () => {
  for (const trials of [1, 12_345, 30_000, 80_000, 100_000]) {
    assert.equal(isGoldenglowTrialBenchmarkCount(trials), true)
    const input = { builds: [build('none', { trials })] }
    assert.doesNotThrow(() => validateGoldenglowTrialBenchmarkInput(input))
    assert.deepEqual(simulateGoldenglowTrialBenchmark(input)[0].points, [
      { enemyHp: 50, expectedDamage: 100, damageBreakdown: { normalDamage: 100, explosionDamage: 0, bodyDamage: 0 } },
      { enemyHp: 1_000, expectedDamage: 100, damageBreakdown: { normalDamage: 100, explosionDamage: 0, bodyDamage: 0 } },
    ])
    if (trials <= 20_000) {
      assert.deepEqual(simulateGoldenglowTrialBenchmark(input), simulateGoldenglowTargetSwitchHpComparison(input))
    } else {
      assert.throws(() => validateHpComparisonInput(input), /20000/)
    }
  }
  for (const invalid of [0, -1, 0.5, 12_345.5, NaN, Infinity, -Infinity, 100_001, Number.MAX_SAFE_INTEGER]) {
    assert.equal(isGoldenglowTrialBenchmarkCount(invalid), false)
  }
})

test('通常の単条件・表・HP・比較APIは20,000回を保ち入力内の上限指定を無視する', () => {
  const item = build('none', { trials: 20_001 })
  const comparison = { builds: [item], trialLimit: 'benchmark' }
  const hpInput = { ...item.input, trialLimit: 'benchmark' }
  const singleInput = { ...hpInput, enemyHp: 50 }
  withoutSimulationBuffers(() => {
    for (const call of [
      () => prepareGoldenglowTargetSwitchSimulation(singleInput),
      () => simulateGoldenglowTargetSwitch(singleInput),
      () => simulateGoldenglowTargetSwitchGrid({ ...hpInput, enemyResistances: [0] }),
      () => simulateGoldenglowTargetSwitchHp(hpInput),
      () => validateHpComparisonInput(comparison),
      () => simulateGoldenglowTargetSwitchHpComparison(comparison),
    ]) assert.throws(call, /20000/)
  })
  assert.doesNotThrow(() => validateHpComparisonInput({ builds: [build('none', { trials: 20_000 })] }))
})

test('ベンチマークと通常計算はS1/S2/S3・抽選・HP重複・切替方式で完全一致する', () => {
  for (const skillIndex of [1, 2, 3]) {
    for (const retargetRemainingDrones of [false, true]) {
      const common = {
        skillIndex, retargetRemainingDrones, trials: 31, duration: 4.3, attackInterval: 0.3,
        enemyHps: [50, 4_000, 50, 500], enemyResistance: 25,
        model: { ...model, activeDroneCount: 3, prdStep: 0.015 },
      }
      const input = { builds: [build('none', common), build('X', {
        ...common, effectiveAttack: 600, attackInterval: 0.25,
        model: { ...common.model, prdStep: 0.025, resistanceIgnoreFixed: 30 },
      })] }
      const before = structuredClone(input)
      assert.deepEqual(simulateGoldenglowTrialBenchmark(input), simulateGoldenglowTargetSwitchHpComparison(input))
      assert.deepEqual(input, before)
    }
  }
})

test('不正な試行回数・後続MOD条件は抽選バッファ割当前に拒否する', () => {
  withoutSimulationBuffers(() => {
    for (const trials of [0, -1, 0.5, 100_001, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => simulateGoldenglowTrialBenchmark({ builds: [build('none', { trials })] }), RangeError)
    }
    for (const override of [
      { enemyHps: [] }, { enemyHps: [0] }, { enemyHps: [1.5] },
      { enemyHps: Array.from({ length: 101 }, (_, index) => index + 1) },
      { effectiveAttack: NaN }, { model: null as unknown as GoldenglowExplosionModel },
      { trials: 50_000 }, { seed: 123 },
    ]) {
      assert.throws(() => simulateGoldenglowTrialBenchmark({ builds: [build(), build('X', override)] }), RangeError)
    }
    assert.throws(() => simulateGoldenglowTrialBenchmark({ builds: Array.from({ length: 9 }, (_, index) => build(String(index))) }), RangeError)
    assert.throws(() => simulateGoldenglowTrialBenchmark(null as unknown as HpComparisonInput), RangeError)
  })
})

test('100,000回でも単条件・抽選メモリ・HP全体・MOD比較全体の予算を割当前に守る', () => {
  const hundredHps = Array.from({ length: 100 }, (_, index) => (index + 1) * 100)
  const threeDrones = { ...model, activeDroneCount: 3 }
  const aggregate = { duration: 20, enemyHps: hundredHps, model: threeDrones }
  const cases: [HpComparisonInput, RegExp][] = [
    [{ builds: [build('none', { duration: 101 })] }, /計算量の上限/],
    [{ builds: [build('none', { duration: 42 })] }, /抽選データ/],
    [{ builds: [build('none', { duration: 30, enemyHps: hundredHps, model: threeDrones })] }, /HP全体/],
    [{ builds: [build('none', aggregate), build('X', aggregate)] }, /MOD比較全体/],
  ]
  withoutSimulationBuffers(() => {
    assert.doesNotThrow(() => validateGoldenglowTrialBenchmarkInput({ builds: [build('none', aggregate)] }))
    for (const [input, message] of cases) {
      assert.throws(() => validateGoldenglowTrialBenchmarkInput(input), message)
      assert.throws(() => simulateGoldenglowTrialBenchmark(input), message)
    }
  })
})

test('計測集計は実測値の中央値・最小・最大・件数を返し、元の順序を変更しない', () => {
  const measurements = Object.freeze([80, 20, 30, 10, 40])
  assert.deepEqual(summarizeGoldenglowTrialBenchmark(measurements), { samples: 5, medianMs: 30, minMs: 10, maxMs: 80 })
  assert.deepEqual(measurements, [80, 20, 30, 10, 40])
  assert.deepEqual(summarizeGoldenglowTrialBenchmark([10, 2, 8, 4]), { samples: 4, medianMs: 6, minMs: 2, maxMs: 10 })
  assert.deepEqual(summarizeGoldenglowTrialBenchmark([0]), { samples: 1, medianMs: 0, minMs: 0, maxMs: 0 })
  assert.equal(summarizeGoldenglowTrialBenchmark([Number.MAX_VALUE, Number.MAX_VALUE]).medianMs, Number.MAX_VALUE)
  for (const invalid of [[], [-1], [NaN], [Infinity], [1, -Infinity], new Array(2), null, undefined]) {
    assert.throws(() => summarizeGoldenglowTrialBenchmark(invalid as number[]), RangeError)
  }
})

test('Workerは実計算を1回だけ実行し、進捗やグラフではなく実測時間を返す', async () => {
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const originalArray = globalThis.Uint16Array
  const messages: GoldenglowTrialBenchmarkMessage[] = []
  const scope = {
    onmessage: null as ((event: { data: { input: HpComparisonInput } }) => void) | null,
    postMessage(message: GoldenglowTrialBenchmarkMessage) { messages.push(message) },
  }
  const patternLengths: number[] = []
  globalThis.Uint16Array = new Proxy(originalArray, {
    construct(target, args) {
      if (args[0] > model.activeDroneCount) patternLengths.push(args[0])
      return Reflect.construct(target, args)
    },
  })
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope })
  try {
    await import('../src/lib/goldenglowTrialBenchmark.worker.ts')
    const run = scope.onmessage!
    const before = performance.now()
    run({ data: { input: { builds: [build('none', { trials: 10_000 })] } } })
    const wallElapsed = performance.now() - before
    assert.equal(scope.onmessage, null)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].type, 'complete')
    if (messages[0].type !== 'complete') assert.fail(messages[0].error)
    assert.ok(Number.isFinite(messages[0].elapsedMs) && messages[0].elapsedMs >= 0)
    assert.ok(messages[0].elapsedMs <= wallElapsed)
    assert.deepEqual(patternLengths, [10_000])

    messages.length = 0
    run({ data: { input: { builds: [build('none', { trials: 100_001 })] } } })
    assert.equal(messages.length, 1)
    assert.equal(messages[0].type, 'error')
    assert.equal((messages[0] as Extract<GoldenglowTrialBenchmarkMessage, { type: 'error' }>).kind, 'limit')
    assert.deepEqual(patternLengths, [10_000])

    messages.length = 0
    run({ data: null as unknown as { input: HpComparisonInput } })
    assert.deepEqual(messages, [{ type: 'error', kind: 'error', error: '計測に失敗しました。条件を確認して再計測してください。' }])
  } finally {
    globalThis.Uint16Array = originalArray
    if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf)
    else Reflect.deleteProperty(globalThis, 'self')
  }
})
