import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Dialog
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/operator-module-image-aspect-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false }, appType: 'custom' })
  ;({ ChartImageSaveDialog: Dialog } = await server.ssrLoadModule('/src/components/ChartImageSaveDialog.tsx'))
})
after(async () => { await server?.close() })

const auto = { preset: 'auto', width: '16', height: '9' }
const modulePresets = ['16:9', '4:3', '1:1', '2:1', '9:16']
const render = (props = {}) => renderToStaticMarkup(createElement(Dialog, {
  initialFilename: 'MOD比較.png', aspect: auto, onAspectChange: () => {},
  canChooseLocation: false, saving: false, error: false, onClose: () => {}, onSave: () => {}, ...props,
}))
const aspectOptions = markup => {
  const select = markup.match(/<select[^>]*aria-label="画像の縦横比"[^>]*>([\s\S]*?)<\/select>/)
  assert.ok(select, '画像の縦横比を選択できる')
  return [...select[1].matchAll(/<option\b[^>]*value="([^"]+)"/g)].map(match => match[1])
}
const saveButton = markup => {
  const button = markup.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]
  assert.ok(button, 'PNG保存ボタンがある')
  return button
}
const filename = markup => {
  const input = markup.match(/<input\b[^>]*aria-label="ファイル名"[^>]*>/)?.[0]
  assert.ok(input, '保存するファイル名を表示する')
  return input.match(/\bvalue="([^"]*)"/)?.[1]
}

test('共通の既定プリセットを保持し、MOD保存では既存の5種類だけに差し替えられる', () => {
  assert.deepEqual(aspectOptions(render()), ['auto', '16:9', '2:1', '21:9', '3:1', 'custom'])
  for (const preset of modulePresets) {
    const [width, height] = preset.split(':')
    const markup = render({ aspectPresets: modulePresets, aspect: { preset, width, height } })
    assert.deepEqual(aspectOptions(markup), ['auto', ...modulePresets, 'custom'])
    assert.ok(markup.includes(`<option value="${preset}" selected="">${preset}</option>`))
    assert.doesNotMatch(saveButton(markup), /\bdisabled=/)
  }
})

test('指定なしと正しいカスタム比率では保存でき、不正入力と範囲外の比率では保存を無効にする', () => {
  const automatic = render({ aspect: { ...auto, width: '', height: '0' } })
  assert.doesNotMatch(saveButton(automatic), /\bdisabled=/)
  assert.doesNotMatch(automatic, /type="number"|role="alert"/)
  for (const [width, height] of [['1', '10'], ['10', '1'], ['4', '3']]) {
    const markup = render({ aspect: { preset: 'custom', width, height } })
    assert.doesNotMatch(saveButton(markup), /\bdisabled=/)
    assert.equal((markup.match(/type="number"/g) ?? []).length, 2)
    assert.doesNotMatch(markup, /role="alert"/)
  }
  for (const [width, height] of [['', '9'], ['0', '1'], ['1.5', '1'], ['101', '1']]) {
    const markup = render({ aspect: { preset: 'custom', width, height } })
    assert.match(saveButton(markup), /\bdisabled=""/)
    assert.match(markup, /role="alert"/)
    assert.equal((markup.match(/type="number"[^>]*aria-invalid="true"/g) ?? []).length, 2)
  }
  const rangeError = '比率が1:10〜10:1になるように入力してください。'
  for (const [width, height] of [['1', '11'], ['11', '1'], ['1e1', '1']]) {
    const markup = render({ aspect: { preset: 'custom', width, height }, aspectError: rangeError })
    assert.match(saveButton(markup), /\bdisabled=""/)
    assert.ok(markup.includes(rangeError))
  }
})

test('未編集の既定ファイル名は現在の比率から更新し、不正な比率を命名処理へ渡さない', () => {
  const cases = [
    [auto, undefined, 'MOD比較_自動.png'],
    [{ preset: '4:3', width: '4', height: '3' }, 4 / 3, 'MOD比較_比率1.3333333333333333.png'],
    [{ preset: 'custom', width: '9', height: '16' }, 9 / 16, 'MOD比較_比率0.5625.png'],
    [{ preset: 'custom', width: '', height: '9' }, undefined, 'MOD比較_自動.png'],
  ]
  for (const [aspect, ratio, expected] of cases) {
    const calls = []
    const markup = render({ initialFilename: '古い既定名.png', aspect, getDefaultFilename: currentRatio => {
      calls.push(currentRatio)
      return currentRatio === undefined ? 'MOD比較_自動.png' : `MOD比較_比率${currentRatio}.png`
    } })
    assert.deepEqual(calls, [ratio])
    assert.equal(filename(markup), expected)
  }
})
