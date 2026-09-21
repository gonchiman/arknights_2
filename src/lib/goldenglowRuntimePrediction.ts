import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison.ts'
import { GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS } from './goldenglowTargetSwitch.ts'

const HISTORY_VERSION = 1
/** Bump when the simulation or the timed benchmark boundary changes. */
const ENGINE_VERSION = 'goldenglow-hp-comparison-v1'
export const RUNTIME_PREDICTION_STORAGE_KEY = 'arknights.goldenglow.runtime-prediction.v1'
export const RUNTIME_PREDICTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
export const RUNTIME_PREDICTION_MAX_CONDITIONS = 10
export const RUNTIME_PREDICTION_MAX_SAMPLES = 120
const MAX_KEY_LENGTH = 65_536
const MAX_STORAGE_LENGTH = 2_000_000

export type RuntimeMeasurementSource = 'benchmark' | 'calibration'

interface RuntimeSample {
  batchId: string
  index: number
  trials: number
  elapsedMs: number
  measuredAt: number
  /** Absent in older records; those measurements are treated as benchmarks. */
  source?: RuntimeMeasurementSource
}

export interface RuntimePredictionHistory {
  version: typeof HISTORY_VERSION
  engine: typeof ENGINE_VERSION
  conditions: { key: string; samples: RuntimeSample[] }[]
}

export interface RuntimePrediction {
  elapsedMs: number
  kind: 'measured' | 'interpolated' | 'extrapolated'
  minTrials: number
  maxTrials: number
  sampleCount: number
}

export interface RuntimeMeasurementBatch {
  id: string
  trials: number
  timesMs: readonly number[]
  measuredAt: number
  source?: RuntimeMeasurementSource
}

export function emptyRuntimePredictionHistory(): RuntimePredictionHistory {
  return { version: HISTORY_VERSION, engine: ENGINE_VERSION, conditions: [] }
}

/** Ordered HPs and builds affect work; display names and the requested count do not. */
export function createRuntimePredictionKey(input: HpComparisonInput): string {
  const conditions = input.builds.map(({ input: buildInput }) => {
    const { trials: _trials, model, ...setup } = buildInput
    const { talentName: _name, talentDescription: _description, ...parameters } = model
    return { ...setup, model: parameters }
  })
  return `${ENGINE_VERSION}:${canonicalJson(conditions)}`
}

/** Accepts completed measurements only. A growing batch can be recorded repeatedly. */
export function recordRuntimeMeasurements(
  history: RuntimePredictionHistory,
  key: string,
  batch: RuntimeMeasurementBatch,
): RuntimePredictionHistory {
  const timestamp = finitePositive(batch.measuredAt) ? batch.measuredAt : Date.now()
  const next = normalizeHistory(history, timestamp)
  if (!validKey(key) || !validTrials(batch.trials) || !validId(batch.id) || !validSource(batch.source)
    || !finitePositive(batch.measuredAt) || !Array.isArray(batch.timesMs)) return unchangedOrNew(history, next)
  const condition = next.conditions.find((entry) => entry.key === key)
    ?? { key, samples: [] }
  const known = new Set(condition.samples.map(sampleIdentity))
  // Keep the original index even when an invalid elapsed time is skipped.
  batch.timesMs.slice(0, RUNTIME_PREDICTION_MAX_SAMPLES).forEach((elapsedMs, index) => {
    const sample: RuntimeSample = { batchId: batch.id, index, trials: batch.trials, elapsedMs, measuredAt: batch.measuredAt,
      ...(batch.source !== undefined ? { source: batch.source } : {}) }
    if (finitePositive(elapsedMs) && !known.has(sampleIdentity(sample))) {
      condition.samples.push(sample)
      known.add(sampleIdentity(sample))
    }
  })
  if (!next.conditions.includes(condition) && condition.samples.length) next.conditions.push(condition)
  return unchangedOrNew(history, normalizeHistory(next, timestamp))
}

/** Commit a completed three-point calibration together, preserving usable history. */
export function recordRuntimeCalibration(
  history: RuntimePredictionHistory,
  key: string,
  batches: readonly RuntimeMeasurementBatch[],
  now = Date.now(),
): { history: RuntimePredictionHistory; accepted: boolean } {
  const reject = () => ({ history, accepted: false })
  if (!validKey(key) || !finitePositive(now) || !Array.isArray(batches)
    || batches.length < 3 || batches.length > RUNTIME_PREDICTION_MAX_SAMPLES) return reject()
  const counts = new Set<number>()
  const ids = new Set<string>()
  for (const batch of batches) {
    if (!batch || !validId(batch.id) || ids.has(batch.id) || !validTrials(batch.trials) || !validSource(batch.source)
      || batch.trials > GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS
      || !finitePositive(batch.measuredAt) || batch.measuredAt < now - RUNTIME_PREDICTION_MAX_AGE_MS
      || batch.measuredAt > now + 60_000 || !Array.isArray(batch.timesMs)
      || !batch.timesMs.length || batch.timesMs.length > RUNTIME_PREDICTION_MAX_SAMPLES) return reject()
    for (const elapsedMs of batch.timesMs) if (!finitePositive(elapsedMs)) return reject()
    counts.add(batch.trials)
    ids.add(batch.id)
  }
  // The adaptive runner validates its low, high and independent middle sample.
  // Reject partial submissions even when two points alone would define a line.
  if (counts.size < 3) return reject()

  const previous = normalizeHistory(history, now)
  let candidate = previous
  let calibrationOnly = emptyRuntimePredictionHistory()
  for (const batch of batches) {
    const calibrationBatch: RuntimeMeasurementBatch = { ...batch, source: 'calibration' }
    candidate = recordRuntimeMeasurements(candidate, key, calibrationBatch)
    calibrationOnly = recordRuntimeMeasurements(calibrationOnly, key, calibrationBatch)
  }
  candidate = normalizeHistory(candidate, now)
  const anchors = new Set([
    ...previous.conditions.find((entry) => entry.key === key)?.samples.map((sample) => sample.trials) ?? [],
    ...candidate.conditions.find((entry) => entry.key === key)?.samples.map((sample) => sample.trials) ?? [],
  ].filter((trials) => trials <= GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS))
  // Include both sides of every recorded count and each remaining interval.
  // Checking only recorded counts misses model failures because exact values
  // remain available even when the regression rejects all other predictions.
  const boundaries = [...new Set([1, GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS, ...anchors])].sort((a, b) => a - b)
  const checks = new Set(boundaries)
  for (const [index, count] of boundaries.entries()) {
    if (count > 1) checks.add(count - 1)
    if (count < GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS) checks.add(count + 1)
    if (index) checks.add(Math.floor((boundaries[index - 1] + count) / 2))
  }
  let hasEstimate = false
  let hasCalibrationEstimate = false
  for (const trials of checks) {
    const before = predictRuntime(previous, key, trials, now)
    const after = predictRuntime(candidate, key, trials, now)
    if (before && !after) return reject()
    if (after && after.kind !== 'measured') hasEstimate = true
    if (!hasCalibrationEstimate) {
      const calibrationEstimate = predictRuntime(calibrationOnly, key, trials, now)
      hasCalibrationEstimate = !!calibrationEstimate && calibrationEstimate.kind !== 'measured'
    }
  }
  if (!hasEstimate || !hasCalibrationEstimate) return reject()
  return { history: unchangedOrNew(history, candidate), accepted: true }
}

/** No simulation or wall-clock timing runs here; estimates use existing samples only. */
export function predictRuntime(
  history: RuntimePredictionHistory,
  key: string,
  trials: number,
  now = Date.now(),
): RuntimePrediction | null {
  if (!validTrials(trials)) return null
  const samples = normalizeHistory(history, now).conditions.find((entry) => entry.key === key)?.samples
  if (!samples?.length) return null
  const benchmarks = samples.filter((sample) => sample.source !== 'calibration')
  const calibrations = samples.filter((sample) => sample.source === 'calibration')
  // A matching real benchmark replaces a short calibration at that count.
  if (benchmarks.some((sample) => sample.trials === trials)) return fitRuntimeSamples(benchmarks, trials)
  if (calibrations.some((sample) => sample.trials === trials)) return fitRuntimeSamples(calibrations, trials)
  const benchmarkCounts = new Set(benchmarks.map((sample) => sample.trials))
  const combined = [...benchmarks, ...calibrations.filter((sample) => !benchmarkCounts.has(sample.trials))]
  // Short runs can have a different startup/JIT cost curve. Preserve an existing
  // valid calibration until enough full measurements support their own fit.
  return fitRuntimeSamples(benchmarks, trials)
    ?? fitRuntimeSamples(combined, trials)
    ?? fitRuntimeSamples(calibrations, trials)
}

/** Every cohort uses the same noise, residual and extrapolation checks. */
function fitRuntimeSamples(samples: readonly RuntimeSample[], trials: number): RuntimePrediction | null {
  if (!samples.length) return null
  const grouped = new Map<number, number[]>()
  for (const sample of samples) {
    const group = grouped.get(sample.trials) ?? []
    group.push(sample.elapsedMs)
    grouped.set(sample.trials, group)
  }
  const anchors = [...grouped].map(([count, times]) => {
    const elapsedMs = median(times)
    return { trials: count, elapsedMs, deviation: median(times.map((time) => Math.abs(time - elapsedMs))) }
  }).sort((left, right) => left.trials - right.trials)
  const minTrials = anchors[0].trials
  const maxTrials = anchors[anchors.length - 1].trials
  const exact = anchors.find((anchor) => anchor.trials === trials)
  if (exact) return { elapsedMs: exact.elapsedMs, kind: 'measured', minTrials, maxTrials, sampleCount: grouped.get(trials)!.length }
  if (anchors.length < 2 || anchors.some((anchor) => anchor.deviation > anchor.elapsedMs * 0.25)) return null

  // Fit medians, giving each trial count equal influence regardless of repeat count.
  const meanX = anchors.reduce((sum, anchor) => sum + anchor.trials, 0) / anchors.length
  const meanY = anchors.reduce((sum, anchor) => sum + anchor.elapsedMs, 0) / anchors.length
  const variance = anchors.reduce((sum, anchor) => sum + (anchor.trials - meanX) ** 2, 0)
  const slope = anchors.reduce((sum, anchor) => sum + (anchor.trials - meanX) * (anchor.elapsedMs - meanY), 0) / variance
  const intercept = meanY - slope * meanX
  if (!finitePositive(slope) || !Number.isFinite(intercept)) return null
  // Large residuals or reversals indicate that this set does not support a linear estimate.
  if (anchors.some((anchor, index) => (
    Math.abs(intercept + slope * anchor.trials - anchor.elapsedMs) > anchor.elapsedMs * 0.25
    || (index > 0 && anchor.elapsedMs <= anchors[index - 1].elapsedMs)
  ))) return null

  const extrapolated = trials < minTrials || trials > maxTrials
  let elapsedMs: number
  if (extrapolated) {
    const first = anchors[0]
    const last = anchors[anchors.length - 1]
    // Very short timings and changes smaller than their noise cannot safely be magnified.
    if (first.elapsedMs < 10 || last.elapsedMs - first.elapsedMs < Math.max(10, 2 * (first.deviation + last.deviation))
      || intercept < -first.elapsedMs * 0.25) return null
    elapsedMs = intercept + slope * trials
  } else {
    const upperIndex = anchors.findIndex((anchor) => anchor.trials > trials)
    const lower = anchors[upperIndex - 1]
    const upper = anchors[upperIndex]
    elapsedMs = lower.elapsedMs + (upper.elapsedMs - lower.elapsedMs) * (trials - lower.trials) / (upper.trials - lower.trials)
  }
  return finitePositive(elapsedMs)
    ? { elapsedMs, kind: extrapolated ? 'extrapolated' : 'interpolated', minTrials, maxTrials, sampleCount: samples.length }
    : null
}

export function readRuntimePredictionHistory(
  storage?: Pick<Storage, 'getItem'>,
  now = Date.now(),
): RuntimePredictionHistory {
  try {
    const source = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    const raw = source?.getItem(RUNTIME_PREDICTION_STORAGE_KEY)
    if (!raw || raw.length > MAX_STORAGE_LENGTH) return emptyRuntimePredictionHistory()
    return normalizeHistory(JSON.parse(raw), now)
  } catch {
    return emptyRuntimePredictionHistory()
  }
}

export function writeRuntimePredictionHistory(
  history: RuntimePredictionHistory,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    if (!target) return false
    const serialized = JSON.stringify(normalizeHistory(history, Date.now()))
    if (serialized.length > MAX_STORAGE_LENGTH) return false
    target.setItem(RUNTIME_PREDICTION_STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function normalizeHistory(value: unknown, now: number): RuntimePredictionHistory {
  const result = emptyRuntimePredictionHistory()
  if (!isRecord(value) || value.version !== HISTORY_VERSION || value.engine !== ENGINE_VERSION
    || !Array.isArray(value.conditions) || !finitePositive(now)) return result
  const byKey = new Map<string, RuntimeSample[]>()
  for (const entry of value.conditions.slice(0, RUNTIME_PREDICTION_MAX_CONDITIONS * 10)) {
    if (!isRecord(entry) || !validKey(entry.key) || !Array.isArray(entry.samples)) continue
    const samples = byKey.get(entry.key) ?? []
    const known = new Set(samples.map(sampleIdentity))
    for (const sample of entry.samples.slice(-RUNTIME_PREDICTION_MAX_SAMPLES * 10)) {
      if (!isRecord(sample) || !validId(sample.batchId) || !Number.isSafeInteger(sample.index)
        || (sample.index as number) < 0 || !validTrials(sample.trials) || !finitePositive(sample.elapsedMs)
        || !validSource(sample.source) || !finitePositive(sample.measuredAt) || sample.measuredAt < now - RUNTIME_PREDICTION_MAX_AGE_MS
        || sample.measuredAt > now + 60_000) continue
      const copied: RuntimeSample = {
        batchId: sample.batchId, index: sample.index as number, trials: sample.trials,
        elapsedMs: sample.elapsedMs, measuredAt: sample.measuredAt,
        ...(sample.source !== undefined ? { source: sample.source } : {}),
      }
      if (!known.has(sampleIdentity(copied))) {
        samples.push(copied)
        known.add(sampleIdentity(copied))
      }
    }
    if (samples.length) byKey.set(entry.key, samples)
  }
  result.conditions = [...byKey].map(([key, samples]) => ({
    key,
    samples: samples.sort((left, right) => left.measuredAt - right.measuredAt).slice(-RUNTIME_PREDICTION_MAX_SAMPLES),
  })).sort((left, right) => right.samples[right.samples.length - 1].measuredAt - left.samples[left.samples.length - 1].measuredAt)
    .slice(0, RUNTIME_PREDICTION_MAX_CONDITIONS)
  return result
}

function sampleIdentity(sample: RuntimeSample): string { return JSON.stringify([sample.batchId, sample.index]) }
function unchangedOrNew(previous: RuntimePredictionHistory, next: RuntimePredictionHistory): RuntimePredictionHistory {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
}
function finitePositive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0 }
function validTrials(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0 }
function validKey(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH }
function validId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 256 }
function validSource(value: unknown): value is RuntimeMeasurementSource | undefined { return value === undefined || value === 'benchmark' || value === 'calibration' }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2
}
