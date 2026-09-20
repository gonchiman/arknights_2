import {
  simulateGoldenglowTargetSwitchHpComparison,
  type HpComparisonInput,
  type HpComparisonMessage,
} from './goldenglowTargetSwitchHpComparison'

const send = (message: HpComparisonMessage) => self.postMessage(message)

self.onmessage = (event: MessageEvent<HpComparisonInput>) => {
  try {
    const series = simulateGoldenglowTargetSwitchHpComparison(event.data, send)
    send({ type: 'complete', series })
  } catch (cause) {
    send({
      type: 'error',
      error: cause instanceof RangeError ? cause.message : '計算に失敗しました。条件を確認して再計算してください。',
    })
  }
}
