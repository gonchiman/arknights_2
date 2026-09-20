import {
  simulateGoldenglowTargetSwitchHp,
  type GoldenglowTargetSwitchHpInput,
  type GoldenglowTargetSwitchHpMessage,
} from './goldenglowTargetSwitchHp'

const send = (message: GoldenglowTargetSwitchHpMessage) => self.postMessage(message)

self.onmessage = (event: MessageEvent<GoldenglowTargetSwitchHpInput>) => {
  try {
    const result = simulateGoldenglowTargetSwitchHp(event.data, (point, completedPoints, totalPoints) => {
      send({ type: 'point', point, completedPoints, totalPoints })
    })
    send({ type: 'complete', result })
  } catch (cause) {
    send({
      type: 'error',
      error: cause instanceof RangeError ? cause.message : '計算に失敗しました。条件を確認して再計算してください。',
    })
  }
}
