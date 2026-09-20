import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison.ts'
import { isGoldenglowTrialBenchmarkCount } from './goldenglowTrialBenchmark.ts'

export interface TrialBenchmarkRequest {
  input: HpComparisonInput
  trialCounts: number[]
  repeats: number
  key: string
  label: string
}
export interface TrialBenchmarkRow {
  trials: number
  totalTrials: number
  timesMs: number[]
  status: 'pending' | 'running' | 'complete' | 'limit' | 'error' | 'cancelled' | 'timeout'
  error?: string
}
export interface TrialBenchmarkState {
  request: TrialBenchmarkRequest | null
  rows: TrialBenchmarkRow[]
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
  activeRepeat: number | null
}
export type TrialBenchmarkMeasurement =
  | { type: 'complete'; elapsedMs: number }
  | { type: 'error'; error: string; kind: 'limit' | 'error' | 'timeout' }
export const EMPTY_TRIAL_BENCHMARK: TrialBenchmarkState = { request: null, rows: [], status: 'idle', activeRepeat: null }

/** One condition at a time. A cancelled or superseded run cannot publish late results. */
export class TrialBenchmarkRunner {
  private generation = 0
  private controller: AbortController | null = null
  private state: TrialBenchmarkState = EMPTY_TRIAL_BENCHMARK
  private readonly measure: (input: HpComparisonInput, signal: AbortSignal) => Promise<TrialBenchmarkMeasurement>
  private readonly onChange: (state: TrialBenchmarkState) => void
  constructor(
    measure: (input: HpComparisonInput, signal: AbortSignal) => Promise<TrialBenchmarkMeasurement>,
    onChange: (state: TrialBenchmarkState) => void,
  ) {
    this.measure = measure
    this.onChange = onChange
  }

  private publish(state: TrialBenchmarkState) {
    this.state = state
    this.onChange(state)
  }

  cancel(notify = true) {
    this.generation += 1
    this.controller?.abort()
    this.controller = null
    if (notify && this.state.status === 'running') this.publish({ ...this.state, status: 'cancelled', activeRepeat: null,
      rows: this.state.rows.map((row) => row.status === 'running' || row.status === 'pending' ? { ...row, status: 'cancelled' } : row) })
  }

  async start(request: TrialBenchmarkRequest) {
    if (!request || ![1, 3, 5].includes(request.repeats)
      || !Array.isArray(request.trialCounts) || !request.trialCounts.length) {
      throw new RangeError('試行回数と計測回数を確認してください。')
    }
    // Iteration also validates sparse slots, which Array.some would skip.
    for (const count of request.trialCounts) {
      if (!isGoldenglowTrialBenchmarkCount(count)) {
        throw new RangeError('試行回数と計測回数を確認してください。')
      }
    }
    this.cancel(false)
    const generation = this.generation
    const snapshot = structuredClone(request)
    snapshot.trialCounts = [...new Set(snapshot.trialCounts)].sort((a, b) => a - b)
    const rows: TrialBenchmarkRow[] = snapshot.trialCounts.map((trials) => ({ trials,
      totalTrials: snapshot.input.builds.reduce((sum, build) => sum + build.input.enemyHps.length * trials, 0),
      timesMs: [], status: 'pending' }))
    this.publish({ request: snapshot, rows: [...rows], status: 'running', activeRepeat: null })

    for (let index = 0; index < rows.length; index += 1) {
      for (let repeat = 0; repeat < snapshot.repeats; repeat += 1) {
        if (generation !== this.generation) return
        rows[index] = { ...rows[index], status: 'running' }
        this.publish({ request: snapshot, rows: [...rows], status: 'running', activeRepeat: repeat + 1 })
        const controller = new AbortController()
        this.controller = controller
        let result: TrialBenchmarkMeasurement
        try {
          const input = structuredClone(snapshot.input)
          for (const build of input.builds) build.input.trials = rows[index].trials
          result = await this.measure(input, controller.signal)
          if (result.type === 'complete' && (!Number.isFinite(result.elapsedMs) || result.elapsedMs < 0)) {
            result = { type: 'error', kind: 'error', error: '計測時間を取得できませんでした。' }
          }
        } catch {
          result = { type: 'error', kind: 'error', error: '計測を実行できませんでした。' }
        }
        if (generation !== this.generation) return
        this.controller = null
        if (result.type === 'error') {
          rows[index] = { ...rows[index], status: result.kind, error: result.error }
          if (result.kind !== 'limit') {
            this.publish({ request: snapshot, rows: rows.map((row) => row.status === 'pending' ? { ...row, status: 'cancelled' } : row), status: 'error', activeRepeat: null })
            return
          }
          this.publish({ request: snapshot, rows: [...rows], status: 'running', activeRepeat: null })
          break
        }
        rows[index] = { ...rows[index], timesMs: [...rows[index].timesMs, result.elapsedMs],
          status: repeat + 1 === snapshot.repeats ? 'complete' : 'running' }
        this.publish({ request: snapshot, rows: [...rows], status: 'running', activeRepeat: repeat + 1 })
      }
    }
    if (generation === this.generation) this.publish({ request: snapshot, rows: [...rows], status: 'complete', activeRepeat: null })
  }
}
