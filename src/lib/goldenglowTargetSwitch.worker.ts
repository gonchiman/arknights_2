import { simulateGoldenglowTargetSwitch, type GoldenglowTargetSwitchInput } from './goldenglowTargetSwitch'

self.onmessage = (event: MessageEvent<GoldenglowTargetSwitchInput>) => {
  try {
    self.postMessage({ result: simulateGoldenglowTargetSwitch(event.data) })
  } catch (error) {
    self.postMessage({ error: error instanceof RangeError
      ? '計算条件が上限を超えています。計測時間・試行回数を減らすか、攻撃間隔を長くしてください。'
      : '計算に失敗しました。入力条件を確認してください。' })
  }
}
