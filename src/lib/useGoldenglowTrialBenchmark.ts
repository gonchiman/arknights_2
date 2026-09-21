import { useEffect, useRef, useState } from 'react'
import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison'
import type { GoldenglowTrialBenchmarkMessage } from './goldenglowTrialBenchmark'
import { EMPTY_TRIAL_BENCHMARK, TrialBenchmarkRunner, type TrialBenchmarkMeasurement, type TrialBenchmarkRequest } from './goldenglowTrialBenchmarkRunner'

// This ceiling protects a runaway measurement; the user-selected median target
// only classifies completed results and never stops a measurement early.
const MEASUREMENT_TIMEOUT_MS = 5 * 60 * 1000

function measure(input: HpComparisonInput, signal: AbortSignal): Promise<TrialBenchmarkMeasurement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return }
    const worker = new Worker(new URL('./goldenglowTrialBenchmark.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const cleanup = () => { clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', abort) }
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
    const timer = setTimeout(() => finish({ type: 'error', kind: 'timeout', error: '1計測が5分を超えたため中止しました。' }), MEASUREMENT_TIMEOUT_MS)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<GoldenglowTrialBenchmarkMessage>) => finish(event.data)
    worker.onerror = () => finish({ type: 'error', kind: 'error', error: '計測を実行できませんでした。ページを再読み込みしてください。' })
    worker.onmessageerror = () => finish({ type: 'error', kind: 'error', error: '計測結果を読み取れませんでした。' })
    try { worker.postMessage({ input }) } catch { finish({ type: 'error', kind: 'error', error: '計測を開始できませんでした。' }) }
  })
}

export function useGoldenglowTrialBenchmark() {
  const [state, setState] = useState(EMPTY_TRIAL_BENCHMARK)
  const runner = useRef<TrialBenchmarkRunner | null>(null)
  if (!runner.current) runner.current = new TrialBenchmarkRunner(measure, setState)
  useEffect(() => () => runner.current?.cancel(false), [])
  return { ...state, start: (request: TrialBenchmarkRequest) => { void runner.current!.start(request) }, cancel: () => runner.current!.cancel() }
}
