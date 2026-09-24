import { simulateGoldenglowCrossover, type CrossoverInput, type CrossoverMessage } from './goldenglowCrossover'

self.onmessage = (event: MessageEvent<CrossoverInput>) => {
  let lastProgress = 0
  const send = (message: CrossoverMessage) => {
    if (message.type === 'progress') {
      const now = performance.now()
      if (now - lastProgress < 100 && message.completed !== message.total) return
      lastProgress = now
    }
    self.postMessage(message)
  }
  try {
    const points = simulateGoldenglowCrossover(event.data, send)
    send({ type: 'complete', points })
  } catch (cause) {
    send({ type: 'error', error: cause instanceof RangeError ? cause.message : '計算に失敗しました。条件を確認して再計算してください。' })
  }
}
