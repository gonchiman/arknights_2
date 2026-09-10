import {
  simulateGoldenglowTargetSwitchGrid,
  type GoldenglowTargetSwitchGridInput,
  type GoldenglowTargetSwitchGridMessage,
} from './goldenglowTargetSwitchGrid'

const send = (message: GoldenglowTargetSwitchGridMessage) => self.postMessage(message)

self.onmessage = (event: MessageEvent<GoldenglowTargetSwitchGridInput>) => {
  try {
    const result = simulateGoldenglowTargetSwitchGrid(event.data, (row, completedRows, totalRows) => {
      send({ type: 'row', row, completedRows, totalRows })
    })
    send({ type: 'complete', result })
  } catch (cause) {
    send({
      type: 'error',
      error: cause instanceof RangeError ? cause.message : '表の計算に失敗しました。条件を確認して再計算してください。',
    })
  }
}
