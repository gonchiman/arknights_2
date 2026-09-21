import { useEffect, useRef, useState } from 'react'
import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison'
import type { GoldenglowTrialBenchmarkMessage } from './goldenglowTrialBenchmark'
import { EMPTY_TRIAL_BENCHMARK, TrialBenchmarkRunner, type TrialBenchmarkMeasurement, type TrialBenchmarkRequest } from './goldenglowTrialBenchmarkRunner'

// This ceiling protects a runaway measurement; the user-selected median target
// only classifies completed results and never stops a measurement early.
const MEASUREMENT_TIMEOUT_MS = 5 * 60 * 1000

interface TrialBenchmarkOptions {
  measurementTimeoutMs?: number
  timeoutMessage?: string
}

/** Each measurement keeps a fresh worker and the worker's existing timing boundary. */
export function measureGoldenglowTrialBenchmark(
  input: HpComparisonInput,
  signal: AbortSignal,
  options: TrialBenchmarkOptions = {},
): Promise<TrialBenchmarkMeasurement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return }
    const worker = new Worker(new URL('./goldenglowTrialBenchmark.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      signal.removeEventListener('abort', abort)
    }
    const finish = (result: TrialBenchmarkMeasurement) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const abort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('cancelled'))
    }
    const timeout = options.measurementTimeoutMs ?? MEASUREMENT_TIMEOUT_MS
    const timer = setTimeout(() => finish({ type: 'error', kind: 'timeout',
      error: options.timeoutMessage ?? '1計測が5分を超えたため中止しました。' }), timeout)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<GoldenglowTrialBenchmarkMessage>) => finish(event.data)
    worker.onerror = () => finish({ type: 'error', kind: 'error', error: '計測を実行できませんでした。ページを再読み込みしてください。' })
    worker.onmessageerror = () => finish({ type: 'error', kind: 'error', error: '計測結果を読み取れませんでした。' })
    if (signal.aborted) { abort(); return }
    try { worker.postMessage({ input }) } catch { finish({ type: 'error', kind: 'error', error: '計測を開始できませんでした。' }) }
  })
}

export function useGoldenglowTrialBenchmark(options: TrialBenchmarkOptions = {}) {
  const [state, setState] = useState(EMPTY_TRIAL_BENCHMARK)
  const runner = useRef<TrialBenchmarkRunner | null>(null)
  if (!runner.current) runner.current = new TrialBenchmarkRunner((input, signal) => measureGoldenglowTrialBenchmark(input, signal, options), setState)
  useEffect(() => () => runner.current?.cancel(false), [])
  return { ...state, start: (request: TrialBenchmarkRequest) => { void runner.current!.start(request) }, cancel: () => runner.current!.cancel() }
}
