import {
  simulateGoldenglowResistanceComparison,
  type ResistanceComparisonInput,
  type ResistanceComparisonMessage,
} from './goldenglowResistanceComparison.ts'

const send = (message: ResistanceComparisonMessage) => self.postMessage(message)

self.onmessage = (event: MessageEvent<ResistanceComparisonInput>) => {
  try {
    // Keep every completed cell available if this worker is terminated. The UI
    // may throttle rendering, but progress delivery must never discard results.
    const series = simulateGoldenglowResistanceComparison(event.data, send)
    send({ type: 'complete', series })
  } catch (cause) {
    send({
      type: 'error',
      error: cause instanceof RangeError ? cause.message : '計算に失敗しました。条件を確認して再計算してください。',
    })
  }
}
