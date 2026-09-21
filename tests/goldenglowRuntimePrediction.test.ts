import test from 'node:test'
import assert from 'node:assert/strict'
import type { HpComparisonInput } from '../src/lib/goldenglowTargetSwitchHpComparison.ts'
import {
  RUNTIME_PREDICTION_MAX_AGE_MS,
  RUNTIME_PREDICTION_MAX_CONDITIONS,
  RUNTIME_PREDICTION_MAX_SAMPLES,
  RUNTIME_PREDICTION_STORAGE_KEY,
  createRuntimePredictionKey,
  emptyRuntimePredictionHistory,
  predictRuntime,
  readRuntimePredictionHistory,
  recordRuntimeCalibration,
  recordRuntimeMeasurements,
  writeRuntimePredictionHistory,
  type RuntimePredictionHistory,
  type RuntimeMeasurementBatch,
} from '../src/lib/goldenglowRuntimePrediction.ts'

const NOW = Date.now()
const KEY = 'same-simulation'
function input(): HpComparisonInput {
  return { builds: [{
    id: 'none', label: '装備なし', moduleType: null, potential: 1,
    input: {
      model: {
        talentName: '電流暴走', talentDescription: '説明', damageType: 'ARTS',
        attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
        prdStep: 0.03222, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
        resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
        droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
        droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
      },
      skillIndex: 3, effectiveAttack: 500, attackInterval: 1.3, duration: 30,
      enemyHps: [1_000, 2_000, 3_000], enemyResistance: 0, enemyDefense: 0,
      switchDelay: 0.1, retargetRemainingDrones: true, trials: 10_000, seed: 20260920,
    },
  }] }
}
function add(history: RuntimePredictionHistory, trials: number, timesMs: readonly number[], id = String(trials), measuredAt = NOW, key = KEY) {
  return recordRuntimeMeasurements(history, key, { id, trials, timesMs, measuredAt })
}
function calibrated() {
  return add(add(emptyRuntimePredictionHistory(), 1_000, [29, 30, 31]), 3_000, [88, 90, 92])
}
function calibrationBatches(points: readonly (readonly [number, number])[]): RuntimeMeasurementBatch[] {
  return points.map(([trials, elapsedMs]) => ({ id: `calibration-${trials}`, trials, timesMs: [elapsedMs], measuredAt: NOW }))
}

test('keys ignore requested count, labels and object insertion order without changing inputs', () => {
  const original = input()
  const before = structuredClone(original)
  const relabeled = structuredClone(original)
  relabeled.builds[0].id = 'renamed'
  relabeled.builds[0].label = '別名'
  relabeled.builds[0].input.trials = 100_000
  relabeled.builds[0].input.model.talentName = '表示名だけ'
  relabeled.builds[0].input.model.talentDescription = '別の説明'
  relabeled.builds[0].input = Object.fromEntries(Object.entries(relabeled.builds[0].input).reverse()) as typeof relabeled.builds[0]['input']
  assert.equal(createRuntimePredictionKey(original), createRuntimePredictionKey(relabeled))
  assert.deepEqual(original, before)
})

test('keys change with every scalar execution condition, HP order and model parameters', () => {
  const original = input()
  const key = createRuntimePredictionKey(original)
  for (const property of ['skillIndex', 'effectiveAttack', 'attackInterval', 'duration', 'enemyResistance', 'enemyDefense', 'switchDelay', 'seed'] as const) {
    const changed = structuredClone(original)
    changed.builds[0].input[property] += 1
    assert.notEqual(createRuntimePredictionKey(changed), key, property)
  }
  const flag = structuredClone(original)
  flag.builds[0].input.retargetRemainingDrones = false
  assert.notEqual(createRuntimePredictionKey(flag), key)
  const hps = structuredClone(original)
  hps.builds[0].input.enemyHps = [...hps.builds[0].input.enemyHps].reverse()
  assert.notEqual(createRuntimePredictionKey(hps), key)
  for (const property of Object.keys(original.builds[0].input.model)) {
    const changed = structuredClone(original)
    const model = changed.builds[0].input.model as unknown as Record<string, unknown>
    if (typeof model[property] !== 'number') continue
    model[property] += 1
    assert.notEqual(createRuntimePredictionKey(changed), key, property)
  }
})

test('keys preserve build count and order, even when display IDs are arbitrary', () => {
  const one = input().builds[0]
  const two = structuredClone(one)
  two.input.effectiveAttack += 50
  assert.notEqual(createRuntimePredictionKey({ builds: [one] }), createRuntimePredictionKey({ builds: [one, two] }))
  assert.notEqual(createRuntimePredictionKey({ builds: [one, two] }), createRuntimePredictionKey({ builds: [two, one] }))
})

test('no history or only one distinct count cannot predict an unmeasured count', () => {
  const empty = emptyRuntimePredictionHistory()
  assert.equal(predictRuntime(empty, KEY, 10_000, NOW), null)
  assert.equal(predictRuntime(add(empty, 1_000, [25, 30, 35]), KEY, 10_000, NOW), null)
  assert.equal(predictRuntime(calibrated(), 'different', 10_000, NOW), null)
})

test('exact-count history reports the recorded median even before a slope is available', () => {
  assert.deepEqual(predictRuntime(add(emptyRuntimePredictionHistory(), 1_000, [32, 28]), KEY, 1_000, NOW), {
    elapsedMs: 30, kind: 'measured', minTrials: 1_000, maxTrials: 1_000, sampleCount: 2,
  })
})

test('predicts both interpolation and small calibration to 100,000 without a ratio cap', () => {
  const history = calibrated()
  assert.deepEqual(predictRuntime(history, KEY, 2_000, NOW), {
    elapsedMs: 60, kind: 'interpolated', minTrials: 1_000, maxTrials: 3_000, sampleCount: 6,
  })
  assert.deepEqual(predictRuntime(history, KEY, 100_000, NOW), {
    elapsedMs: 3_000, kind: 'extrapolated', minTrials: 1_000, maxTrials: 3_000, sampleCount: 6,
  })
})

test('preserves fixed setup cost and interpolates adjacent medians with three anchors', () => {
  const history = add(add(add(emptyRuntimePredictionHistory(), 1_000, [150]), 3_000, [370]), 5_000, [550])
  assert.equal(predictRuntime(history, KEY, 4_000, NOW)?.elapsedMs, 460)
  const extrapolation = predictRuntime(history, KEY, 10_000, NOW)
  assert.equal(extrapolation?.kind, 'extrapolated')
  assert.ok(Math.abs(extrapolation!.elapsedMs - 1056.6666666666667) < 0.0001)
})

test('calibration commits all three validated counts atomically without mutating previous history', () => {
  const history = calibrated()
  const before = structuredClone(history)
  const batches = calibrationBatches([[500, 15], [1_500, 45], [2_500, 75]])
  const result = recordRuntimeCalibration(history, KEY, batches, NOW)
  assert.equal(result.accepted, true)
  assert.deepEqual(history, before)
  assert.equal(result.history.conditions[0].samples.length, 9)
  assert.equal(predictRuntime(result.history, KEY, 100_000, NOW)?.elapsedMs, 3_000)
  assert.equal(recordRuntimeCalibration(result.history, KEY, batches, NOW).history, result.history)
  const fresh = recordRuntimeCalibration(emptyRuntimePredictionHistory(), KEY, batches, NOW)
  assert.equal(fresh.accepted, true)
  assert.equal(fresh.history.conditions[0].samples.length, 3)
})

test('short calibration cannot destroy existing large-count predictions even when valid on its own', () => {
  const history = add(add(emptyRuntimePredictionHistory(), 10_000, [1_000, 1_000, 1_000]), 20_000, [2_000, 2_000, 2_000])
  const batches = calibrationBatches([[100, 75], [250, 125], [400, 175]])
  assert.equal(recordRuntimeCalibration(emptyRuntimePredictionHistory(), KEY, batches, NOW).accepted, true)
  let unchecked = history
  for (const batch of batches) unchecked = recordRuntimeMeasurements(unchecked, KEY, batch)
  assert.equal(predictRuntime(unchecked, KEY, 50_000, NOW), null)
  const result = recordRuntimeCalibration(history, KEY, batches, NOW)
  assert.equal(result.accepted, true)
  assert.equal(predictRuntime(result.history, KEY, 50_000, NOW)?.elapsedMs, 5_000)
  assert.equal(result.history.conditions[0].samples.filter((sample) => sample.source === 'calibration').length, 3)
})

test('calibration rejects empty, partial, invalid or unstable batches without saving an earlier valid part', () => {
  const history = calibrated()
  const valid = calibrationBatches([[500, 15], [1_500, 45], [2_500, 75]])
  const sparse = [...valid]
  delete sparse[1]
  const candidates = [
    [], valid.slice(0, 1), valid.slice(0, 2), sparse,
    [...valid.slice(0, 2), { ...valid[2], trials: 0 }],
    [...valid.slice(0, 2), { ...valid[2], trials: 100_001 }],
    [...valid.slice(0, 2), { ...valid[2], timesMs: [] }],
    [...valid.slice(0, 2), { ...valid[2], timesMs: [75, NaN] }],
    [...valid.slice(0, 2), { ...valid[2], timesMs: new Array<number>(1) }],
    [...valid.slice(0, 2), { ...valid[2], id: valid[0].id }],
    [...valid.slice(0, 2), { ...valid[2], measuredAt: NOW - RUNTIME_PREDICTION_MAX_AGE_MS - 1 }],
    [...valid.slice(0, 2), { ...valid[2], measuredAt: NOW + 60_001 }],
    calibrationBatches([[500, 75], [1_500, 75], [2_500, 75]]),
  ]
  for (const batches of candidates) {
    const result = recordRuntimeCalibration(history, KEY, batches, NOW)
    assert.equal(result.accepted, false)
    assert.equal(result.history, history)
  }
  assert.equal(recordRuntimeCalibration(history, KEY, valid, NaN).history, history)
})

test('calibration protects non-anchor interpolation, not just exact stored times', () => {
  const history = add(add(emptyRuntimePredictionHistory(), 1, [50]), 100_000, [1_050])
  const batches = calibrationBatches([[100, 75], [250, 125], [400, 175]])
  const expected = predictRuntime(history, KEY, 50_000, NOW)
  assert.ok(expected)
  const result = recordRuntimeCalibration(history, KEY, batches, NOW)
  assert.equal(result.accepted, true)
  assert.deepEqual(predictRuntime(result.history, KEY, 50_000, NOW), expected)
})

test('a calibration-only model still rolls back new samples that remove its usable predictions', () => {
  const original = recordRuntimeCalibration(emptyRuntimePredictionHistory(), KEY,
    calibrationBatches([[1_000, 30], [2_000, 60], [3_000, 90]]), NOW)
  assert.equal(original.accepted, true)
  const result = recordRuntimeCalibration(original.history, KEY,
    calibrationBatches([[100, 75], [250, 125], [400, 175]]), NOW)
  assert.equal(result.accepted, false)
  assert.equal(result.history, original.history)
  assert.equal(predictRuntime(result.history, KEY, 50_000, NOW)?.elapsedMs, 1_500)
})

test('one full benchmark retains a valid short calibration; two full counts take priority', () => {
  const initial = recordRuntimeCalibration(emptyRuntimePredictionHistory(), KEY,
    calibrationBatches([[97, 47], [289, 122], [481, 202]]), NOW)
  assert.equal(initial.accepted, true)
  const before = predictRuntime(initial.history, KEY, 20_000, NOW)
  assert.equal(before?.kind, 'extrapolated')
  const oneFull = add(initial.history, 10_000, [3_103], 'full-one')
  assert.deepEqual(predictRuntime(oneFull, KEY, 20_000, NOW), before)
  assert.equal(predictRuntime(oneFull, KEY, 10_000, NOW)?.elapsedMs, 3_103)
  const twoFull = add(oneFull, 20_000, [6_206], 'full-two')
  assert.ok(Math.abs(predictRuntime(twoFull, KEY, 50_000, NOW)!.elapsedMs - 15_515) < 0.0001)
  assert.equal(predictRuntime(twoFull, KEY, 50_000, NOW)?.sampleCount, 2)
})

test('same-count full timings take priority for both exact lookup and a mixed fit', () => {
  const initial = recordRuntimeCalibration(emptyRuntimePredictionHistory(), KEY,
    calibrationBatches([[1_000, 50], [2_000, 90], [3_000, 150]]), NOW)
  assert.equal(initial.accepted, true)
  const history = recordRuntimeMeasurements(initial.history, KEY, {
    id: 'full', trials: 2_000, timesMs: [99, 100, 101], measuredAt: NOW, source: 'benchmark',
  })
  const exact = predictRuntime(history, KEY, 2_000, NOW)
  assert.equal(exact?.elapsedMs, 100)
  assert.equal(exact?.sampleCount, 3)
  // One full count cannot fit alone. The mixed fit must replace its calibration
  // counterpart rather than average 90ms into the 100ms benchmark median.
  const mixed = predictRuntime(history, KEY, 4_000, NOW)
  assert.equal(mixed?.elapsedMs, 200)
  assert.equal(mixed?.sampleCount, 5)
})

test('source fallback retains the original quality checks for every fitted cohort', () => {
  let history = emptyRuntimePredictionHistory()
  for (const [trials, timesMs] of [[1_000, [10, 30, 100]], [3_000, [60, 90, 150]]] as const) {
    history = recordRuntimeMeasurements(history, KEY, { id: `noisy-${trials}`, trials,
      timesMs, measuredAt: NOW, source: 'calibration' })
  }
  history = add(history, 10_000, [500], 'full')
  assert.equal(predictRuntime(history, KEY, 20_000, NOW), null)
})

test('measurement sources survive storage while old records keep benchmark semantics', () => {
  const old = add(add(emptyRuntimePredictionHistory(), 10_000, [1_000]), 20_000, [2_000])
  const combined = recordRuntimeCalibration(old, KEY,
    calibrationBatches([[100, 75], [250, 125], [400, 175]]), NOW)
  assert.equal(combined.accepted, true)
  let serialized = ''
  assert.equal(writeRuntimePredictionHistory(combined.history, { setItem: (_key, value) => { serialized = value } }), true)
  const restored = readRuntimePredictionHistory({ getItem: () => serialized }, NOW)
  assert.deepEqual(restored, combined.history)
  assert.equal(restored.conditions[0].samples.filter((sample) => sample.source === undefined).length, 2)
  assert.equal(restored.conditions[0].samples.filter((sample) => sample.source === 'calibration').length, 3)
  assert.equal(predictRuntime(restored, KEY, 50_000, NOW)?.elapsedMs, 5_000)
  const invalid = recordRuntimeMeasurements(old, KEY, { id: 'bad-source', trials: 500,
    timesMs: [50], measuredAt: NOW, source: 'unknown' as never })
  assert.equal(invalid, old)
  const malformed = JSON.parse(serialized)
  malformed.conditions[0].samples[0].source = null
  malformed.conditions[0].samples[1].source = 'unknown'
  assert.equal(readRuntimePredictionHistory({ getItem: () => JSON.stringify(malformed) }, NOW).conditions[0].samples.length, 3)
})

test('repeats are deduplicated by batch identity and original index, without mutating history', () => {
  const empty = emptyRuntimePredictionHistory()
  const first = add(empty, 1_000, [30, NaN, 32], 'one-batch')
  const saved = structuredClone(first)
  Object.freeze(first.conditions[0].samples)
  Object.freeze(first.conditions[0])
  Object.freeze(first.conditions)
  Object.freeze(first)
  assert.equal(add(first, 1_000, [30, NaN, 32], 'one-batch'), first)
  const expanded = add(first, 1_000, [30, 31, 32, 33], 'one-batch')
  assert.equal(expanded.conditions[0].samples.length, 4)
  assert.deepEqual(first, saved)
  assert.deepEqual(empty, emptyRuntimePredictionHistory())
  assert.equal(predictRuntime(expanded, KEY, 1_000, NOW)?.elapsedMs, 31.5)
})

test('different batches remain independent and duplicates after serialization are ignored', () => {
  const first = add(emptyRuntimePredictionHistory(), 1_000, [30], 'a')
  const second = add(first, 1_000, [31], 'b')
  const restored = readRuntimePredictionHistory({ getItem: () => JSON.stringify(second) }, NOW)
  assert.equal(add(restored, 1_000, [30], 'a'), restored)
  assert.equal(restored.conditions[0].samples.length, 2)
})

test('invalid counts, durations and timestamps never become prediction evidence', () => {
  let history = emptyRuntimePredictionHistory()
  for (const trials of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    history = add(history, trials, [30])
    assert.equal(predictRuntime(calibrated(), KEY, trials, NOW), null)
  }
  history = add(history, 1_000, [0, -1, NaN, Infinity])
  history = add(history, 1_000, [30], 'bad-time', NaN)
  assert.deepEqual(history, emptyRuntimePredictionHistory())
})

test('tiny or noisy timings cannot be magnified into a large-run prediction', () => {
  const tiny = add(add(emptyRuntimePredictionHistory(), 1_000, [1]), 3_000, [3])
  assert.equal(predictRuntime(tiny, KEY, 100_000, NOW), null)
  assert.equal(predictRuntime(tiny, KEY, 2_000, NOW)?.elapsedMs, 2)
  const noisy = add(add(emptyRuntimePredictionHistory(), 1_000, [10, 30, 100]), 3_000, [60, 90, 150])
  assert.equal(predictRuntime(noisy, KEY, 100_000, NOW), null)
  const indistinct = add(add(emptyRuntimePredictionHistory(), 1_000, [100, 102, 104]), 3_000, [104, 106, 108])
  assert.equal(predictRuntime(indistinct, KEY, 100_000, NOW), null)
})

test('medians tolerate isolated slow samples without treating them as a larger workload', () => {
  const history = add(add(emptyRuntimePredictionHistory(), 1_000, [29, 30, 1_000]), 3_000, [89, 90, 2_000])
  assert.equal(predictRuntime(history, KEY, 100_000, NOW)?.elapsedMs, 3_000)
})

test('flat, reversed, markedly nonlinear, and negative extrapolated trends are rejected', () => {
  for (const [first, last] of [[30, 30], [90, 30]]) {
    const history = add(add(emptyRuntimePredictionHistory(), 1_000, [first]), 3_000, [last])
    assert.equal(predictRuntime(history, KEY, 2_000, NOW), null)
  }
  const nonlinear = add(add(add(emptyRuntimePredictionHistory(), 1_000, [30]), 2_000, [35]), 3_000, [300])
  assert.equal(predictRuntime(nonlinear, KEY, 100_000, NOW), null)
  const negative = add(add(emptyRuntimePredictionHistory(), 1_000, [30]), 3_000, [95])
  assert.equal(predictRuntime(negative, KEY, 1, NOW), null)
})

test('expires old samples on read and prediction, and does not use far-future records', () => {
  const history = calibrated()
  assert.equal(predictRuntime(history, KEY, 1_000, NOW + RUNTIME_PREDICTION_MAX_AGE_MS + 1), null)
  assert.deepEqual(readRuntimePredictionHistory({ getItem: () => JSON.stringify(history) }, NOW + RUNTIME_PREDICTION_MAX_AGE_MS + 1), emptyRuntimePredictionHistory())
  const future = add(emptyRuntimePredictionHistory(), 1_000, [30], 'future', NOW + 60_001)
  assert.equal(predictRuntime(future, KEY, 1_000, NOW), null)
})

test('bounds saved conditions and samples, retaining the most recent completed measurements', () => {
  let history = emptyRuntimePredictionHistory()
  for (let index = 0; index < RUNTIME_PREDICTION_MAX_SAMPLES + 5; index++) {
    history = add(history, 1_000, [30], String(index), NOW + index)
  }
  assert.equal(history.conditions[0].samples.length, RUNTIME_PREDICTION_MAX_SAMPLES)
  assert.equal(history.conditions[0].samples[0].batchId, '5')
  for (let index = 0; index < RUNTIME_PREDICTION_MAX_CONDITIONS; index++) {
    history = add(history, 1_000, [30], 'batch', NOW + 1_000 + index, `condition-${index}`)
  }
  assert.equal(history.conditions.length, RUNTIME_PREDICTION_MAX_CONDITIONS)
  assert.equal(history.conditions[0].key, 'condition-9')
  assert.ok(!history.conditions.some((entry) => entry.key === KEY))
})

test('read tolerates malformed, unavailable, old-version and wrong-engine browser storage', () => {
  for (const raw of ['', '{broken', 'null', '[]', '{}', JSON.stringify({ ...calibrated(), version: 999 }), JSON.stringify({ ...calibrated(), engine: 'old' }), JSON.stringify({ ...calibrated(), engine: 'goldenglow-hp-comparison-v1' }), 'x'.repeat(2_000_001)]) {
    assert.deepEqual(readRuntimePredictionHistory({ getItem: () => raw }, NOW), emptyRuntimePredictionHistory())
  }
  assert.deepEqual(readRuntimePredictionHistory({ getItem: () => { throw new Error('blocked') } }), emptyRuntimePredictionHistory())
  assert.deepEqual(readRuntimePredictionHistory(), emptyRuntimePredictionHistory())
})

test('write uses the versioned key, round-trips without mutation and tolerates quota errors', () => {
  const history = calibrated()
  const before = structuredClone(history)
  let stored = ''
  assert.equal(writeRuntimePredictionHistory(history, { setItem: (key, value) => {
    assert.equal(key, RUNTIME_PREDICTION_STORAGE_KEY)
    stored = value
  } }), true)
  assert.deepEqual(readRuntimePredictionHistory({ getItem: () => stored }, NOW), history)
  assert.deepEqual(history, before)
  assert.equal(writeRuntimePredictionHistory(history, { setItem: () => { throw new Error('quota exceeded') } }), false)
  assert.equal(writeRuntimePredictionHistory(history), false)
})

test('malformed sample fields in otherwise valid storage are filtered and copied', () => {
  const history = calibrated()
  const altered = structuredClone(history)
  altered.conditions[0].samples.push({ ...altered.conditions[0].samples[0], batchId: 'bad', elapsedMs: -1 })
  const read = readRuntimePredictionHistory({ getItem: () => JSON.stringify(altered) }, NOW)
  assert.deepEqual(read, history)
  read.conditions[0].samples[0].elapsedMs = 999
  assert.equal(history.conditions[0].samples[0].elapsedMs, 29)
})
