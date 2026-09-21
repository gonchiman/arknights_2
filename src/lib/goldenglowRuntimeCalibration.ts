import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison.ts'
import { GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS } from './goldenglowTargetSwitch.ts'
import { validateGoldenglowTrialBenchmarkInput } from './goldenglowTrialBenchmark.ts'
import type { TrialBenchmarkMeasurement } from './goldenglowTrialBenchmarkRunner.ts'
import { emptyRuntimePredictionHistory, predictRuntime, recordRuntimeMeasurements } from './goldenglowRuntimePrediction.ts'

export interface RuntimeCalibrationRequest { input: HpComparisonInput; key: string }
export interface RuntimeCalibrationMeasurement { trials: number; elapsedMs: number; role: 'probe' | 'sample' }
export interface RuntimeCalibrationState {
  request: RuntimeCalibrationRequest | null
  status: 'idle' | 'running' | 'complete' | 'insufficient' | 'cancelled' | 'error'
  measurements: RuntimeCalibrationMeasurement[]
  /** Wall time since starting, including worker startup, computation and message delivery. */
  elapsedMs: number
  activeTrials: number | null
  error?: string
}
export const EMPTY_RUNTIME_CALIBRATION: RuntimeCalibrationState = {
  request: null, status: 'idle', measurements: [], elapsedMs: 0, activeTrials: null,
}
interface RuntimeCalibrationOptions { now?: () => number; deadlineMs?: number }
const MAX_COMPUTE_MS = 500
const MAX_MEASUREMENTS = 6
const INSUFFICIENT = '短い計測では安定した予測を作れませんでした。本計測の結果から予測できます。'
const DEADLINE = '予備計測が2秒に達したため中止しました。本計測の結果から予測できます。'

/** Every injected measurement must create a fresh worker, matching the full benchmark. */
export class RuntimeCalibrationRunner {
  private generation = 0
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private release: (() => void) | null = null
  private state: RuntimeCalibrationState = EMPTY_RUNTIME_CALIBRATION
  private startedAt = 0
  private readonly now: () => number
  private readonly deadlineMs: number
  private readonly measure: (input: HpComparisonInput, signal: AbortSignal) => Promise<TrialBenchmarkMeasurement>
  private readonly onChange: (state: RuntimeCalibrationState) => void

  constructor(
    measure: (input: HpComparisonInput, signal: AbortSignal) => Promise<TrialBenchmarkMeasurement>,
    onChange: (state: RuntimeCalibrationState) => void,
    options: RuntimeCalibrationOptions = {},
  ) {
    this.measure = measure
    this.onChange = onChange
    this.now = options.now ?? (() => performance.now())
    this.deadlineMs = Number.isFinite(options.deadlineMs) && options.deadlineMs! > 0
      ? Math.min(options.deadlineMs!, 2_000) : 2_000
  }

  private publish(state: RuntimeCalibrationState) {
    this.state = state
    this.onChange(state)
  }

  private stop() {
    this.generation += 1
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const controller = this.controller
    this.controller = null
    this.release?.()
    this.release = null
    controller?.abort()
  }

  cancel(notify = true) {
    const running = this.state.status === 'running'
    this.stop()
    if (notify && running) this.publish({ ...this.state, status: 'cancelled', activeTrials: null,
      elapsedMs: Math.max(0, this.now() - this.startedAt) })
  }

  async start(request: RuntimeCalibrationRequest): Promise<void> {
    const startedAt = this.now()
    let snapshot: RuntimeCalibrationRequest | null = null
    let maxTrials: number
    try {
      if (!request || typeof request.key !== 'string' || !request.key) throw new RangeError('計測条件を確認してください。')
      snapshot = structuredClone(request)
      maxTrials = maximumValidTrials(snapshot.input)
    } catch (cause) {
      this.cancel(false)
      this.publish({ ...EMPTY_RUNTIME_CALIBRATION, request: snapshot, status: 'error', elapsedMs: Math.max(0, this.now() - startedAt),
        error: cause instanceof RangeError ? cause.message : '計測条件を確認してください。' })
      return
    }
    this.cancel(false)
    this.startedAt = startedAt
    const generation = this.generation
    const measurements: RuntimeCalibrationMeasurement[] = []
    let computeElapsedMs = 0
    const wallElapsedMs = () => Math.max(0, this.now() - startedAt)
    const stopped = new Promise<null>((resolve) => { this.release = () => resolve(null) })
    const active = () => generation === this.generation
    const finish = (status: 'complete' | 'insufficient' | 'error', error?: string) => {
      if (!active()) return
      this.stop()
      this.publish({ request: snapshot, status, measurements: [...measurements], elapsedMs: wallElapsedMs(), activeTrials: null, ...(error ? { error } : {}) })
    }
    this.publish({ request: snapshot, status: 'running', measurements: [], elapsedMs: 0, activeTrials: null })
    if (!active()) return
    const remainingWall = this.deadlineMs - (this.now() - startedAt)
    if (remainingWall <= 0) { finish('insufficient', DEADLINE); return }
    this.timer = setTimeout(() => finish('insufficient', DEADLINE), remainingWall)

    const take = async (trials: number, role: 'probe' | 'sample'): Promise<RuntimeCalibrationMeasurement | null> => {
      if (!active()) return null
      if (this.now() - startedAt >= this.deadlineMs) { finish('insufficient', DEADLINE); return null }
      if (computeElapsedMs >= MAX_COMPUTE_MS || measurements.length >= MAX_MEASUREMENTS) { finish('insufficient', INSUFFICIENT); return null }
      const input = withTrials(snapshot!.input, trials)
      try { validateGoldenglowTrialBenchmarkInput(input) } catch (cause) {
        finish('error', cause instanceof Error ? cause.message : '計算量の上限を確認してください。')
        return null
      }
      const controller = new AbortController()
      this.controller = controller
      this.publish({ request: snapshot, status: 'running', measurements: [...measurements], elapsedMs: wallElapsedMs(), activeTrials: trials })
      if (!active()) return null
      const outcome = await Promise.race([
        Promise.resolve().then(() => active() ? this.measure(input, controller.signal) : null)
          .catch((): TrialBenchmarkMeasurement => ({ type: 'error', kind: 'error', error: '予備計測を実行できませんでした。' })),
        stopped,
      ])
      if (!active() || !outcome) return null
      this.controller = null
      if (this.now() - startedAt >= this.deadlineMs) { finish('insufficient', DEADLINE); return null }
      if (outcome.type === 'error') {
        finish(outcome.kind === 'timeout' ? 'insufficient' : 'error', outcome.error)
        return null
      }
      if (!Number.isFinite(outcome.elapsedMs) || outcome.elapsedMs < 0) {
        finish('error', '計測時間を取得できませんでした。')
        return null
      }
      const measurement: RuntimeCalibrationMeasurement = { trials, elapsedMs: outcome.elapsedMs,
        role: role === 'sample' && outcome.elapsedMs < 10 ? 'probe' : role }
      measurements.push(measurement)
      computeElapsedMs += outcome.elapsedMs
      this.publish({ request: snapshot, status: 'running', measurements: [...measurements], elapsedMs: wallElapsedMs(), activeTrials: null })
      if (computeElapsedMs > MAX_COMPUTE_MS) { finish('insufficient', INSUFFICIENT); return null }
      return measurement
    }

    if (maxTrials < 3) { finish('insufficient', INSUFFICIENT); return }
    const probe = await take(Math.min(32, maxTrials), 'probe')
    if (!probe || !active()) return
    const firstLimit = Math.max(1, Math.floor(maxTrials / 3))
    let count = Math.min(firstLimit, Math.max(1, Math.ceil(probe.trials * 75 / Math.max(probe.elapsedMs, 0.5))))
    let first = await take(count, 'sample')
    while (first && first.role === 'probe' && count < firstLimit && active()) {
      count = Math.min(firstLimit, Math.max(count + 1, Math.ceil(count * Math.min(8, 75 / Math.max(first.elapsedMs, 0.5)))))
      first = await take(count, 'sample')
    }
    if (!first || !active()) return
    if (first.role !== 'sample') { finish('insufficient', INSUFFICIENT); return }

    // The pilot only helps select a count. It is never accepted as prediction evidence.
    const slope = (first.elapsedMs - probe.elapsedMs) / (first.trials - probe.trials)
    const intercept = first.elapsedMs - slope * first.trials
    const proposed = Number.isFinite(slope) && slope > 0 && intercept >= 0 && intercept < 180
      ? (180 - intercept) / slope : first.trials * 180 / Math.max(first.elapsedMs, 0.5)
    const secondCount = Math.min(maxTrials, Math.max(first.trials + 2, first.trials * 2, Math.ceil(Math.min(proposed, first.trials * 16))))
    const estimatedSecond = Math.max(first.elapsedMs, Math.min(250, first.elapsedMs * secondCount / first.trials))
    if (computeElapsedMs + estimatedSecond > MAX_COMPUTE_MS) { finish('insufficient', INSUFFICIENT); return }
    const second = await take(secondCount, 'sample')
    if (!second || !active()) return
    if (second.role !== 'sample' || second.elapsedMs - first.elapsedMs < Math.max(10, first.elapsedMs * 0.1)) {
      finish('insufficient', INSUFFICIENT)
      return
    }

    // A third fresh measurement checks the fitted slope instead of trusting two arbitrary timings.
    const checkCount = Math.floor((first.trials + second.trials) / 2)
    const expectedCheck = first.elapsedMs + (second.elapsedMs - first.elapsedMs)
      * (checkCount - first.trials) / (second.trials - first.trials)
    if (computeElapsedMs + expectedCheck > MAX_COMPUTE_MS) { finish('insufficient', INSUFFICIENT); return }
    const check = await take(checkCount, 'sample')
    if (!check || !active()) return
    if (check.role !== 'sample' || Math.abs(check.elapsedMs - expectedCheck) > Math.max(10, expectedCheck * 0.2)) {
      finish('insufficient', INSUFFICIENT)
      return
    }
    let history = emptyRuntimePredictionHistory()
    const measuredAt = Date.now()
    for (const [index, measurement] of measurements.entries()) {
      if (measurement.role !== 'sample') continue
      history = recordRuntimeMeasurements(history, snapshot.key, {
        id: String(index), trials: measurement.trials, timesMs: [measurement.elapsedMs], measuredAt,
      })
    }
    // This hypothetical point checks extrapolation quality only; it never starts
    // a simulation and can exceed the execution ceiling by one at the boundary.
    const prediction = predictRuntime(history, snapshot.key, second.trials + 1, measuredAt)
    finish(prediction?.kind === 'extrapolated' ? 'complete' : 'insufficient', prediction ? undefined : INSUFFICIENT)
  }
}

function withTrials(input: HpComparisonInput, trials: number): HpComparisonInput {
  const clone = structuredClone(input)
  for (const build of clone.builds) build.input.trials = trials
  return clone
}

/** Workload and allocation limits are monotonic in count; reject bad conditions before any worker. */
function maximumValidTrials(input: HpComparisonInput): number {
  validateGoldenglowTrialBenchmarkInput(withTrials(input, 1))
  let low = 1
  let high = GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    try { validateGoldenglowTrialBenchmarkInput(withTrials(input, middle)); low = middle }
    catch { high = middle - 1 }
  }
  return low
}
