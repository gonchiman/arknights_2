import type { HpComparisonInput } from './goldenglowTargetSwitchHpComparison.ts'
import {
  simulateGoldenglowTrialBenchmark,
  type GoldenglowTrialBenchmarkMessage,
} from './goldenglowTrialBenchmark.ts'

const send = (message: GoldenglowTrialBenchmarkMessage) => self.postMessage(message)

self.onmessage = (event: MessageEvent<{ input: HpComparisonInput }>) => {
  // Each repeat owns a fresh worker. Ignore any second request to this worker.
  self.onmessage = null
  try {
    const started = performance.now()
    simulateGoldenglowTrialBenchmark(event.data.input)
    const elapsedMs = performance.now() - started
    send({ type: 'complete', elapsedMs })
  } catch (cause) {
    send({
      type: 'error',
      error: cause instanceof RangeError ? cause.message : '計測に失敗しました。条件を確認して再計測してください。',
      kind: cause instanceof RangeError ? 'limit' : 'error',
    })
  }
}
