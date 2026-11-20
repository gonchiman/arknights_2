import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server, Dialog
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/chart-image-save-dialog-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ ChartImageSaveDialog: Dialog } = await server.ssrLoadModule('/src/components/ChartImageSaveDialog.tsx'))
})
after(async () => { await server?.close() })

const render = props => renderToStaticMarkup(createElement(Dialog, {
  initialFilename: '敵_箱ひげ図.png', canChooseLocation: false, saving: false,
  error: false, onClose() {}, onSave() {}, ...props,
}))

test('ordinary image and video saves keep their filename and destination behavior', () => {
  const image = render()
  assert.match(image, /value="敵_箱ひげ図\.png"/)
  assert.match(image, /\.png は省略できます。/)
  assert.match(image, /type="submit"[^>]*>ダウンロード<\/button>/)
  assert.match(render({ canChooseLocation: true }), /type="submit"[^>]*>保存先を選ぶ<\/button>/)
  for (const videoExtension of ['mp4', 'webm']) {
    const video = render({ initialFilename: `敵.${videoExtension}`, videoExtension, saving: true })
    assert.match(video, /動画を保存<\/h2>/)
    assert.ok(video.includes(`.${videoExtension} は省略できます。`))
    assert.match(video, /動画を保存中…/)
  }
})

test('ZIP saves identify the extension and expose an explicit batch action and progress', () => {
  const archive = render({ initialFilename: '敵_箱ひげ図.zip', archive: true, saveLabel: '8枚をZIP保存' })
  assert.match(archive, /value="敵_箱ひげ図\.zip"/)
  assert.match(archive, /\.zip は省略できます。/)
  assert.match(archive, /type="submit"[^>]*>8枚をZIP保存<\/button>/)
  assert.doesNotMatch(archive, /\.png は省略できます。/)
  const saving = render({ archive: true, saving: true, saveLabel: '8枚をZIP保存', progress: 'PNG 3/8を作成中…' })
  assert.match(saving, /role="status">PNG 3\/8を作成中…/)
  assert.match(saving, /type="submit"[^>]*disabled=""[^>]*>ZIPを保存中…<\/button>/)
  assert.match(render({ archive: true, error: true }), /ZIPを保存できませんでした。/)
})

test('filename checks reject empty stems, device names, and forbidden characters for both formats', () => {
  for (const archive of [false, true]) {
    const extension = archive ? 'zip' : 'png'
    for (const initialFilename of ['', '  ', `.${extension}`]) {
      const invalid = render({ archive, initialFilename })
      assert.match(invalid, /ファイル名を入力してください。/)
      assert.match(invalid, /type="submit"[^>]*disabled=""/)
    }
    for (const initialFilename of [`CON.${extension}`, `lpt1.${extension}`, `悪い:名前.${extension}`]) {
      assert.match(render({ archive, initialFilename }), /role="alert"/)
    }
    assert.doesNotMatch(render({ archive, initialFilename: `日本語_メインストーリー.${extension}` }), /role="alert"/)
  }
})

test('automatic filenames track the requested aspect without introducing visible help in quiet mode', () => {
  const html = render({ archive: true, helpMode: 'none',
    getDefaultFilename: ratio => `箱ひげ図_${ratio === 16 / 9 ? '16x9' : 'auto'}.zip`,
    aspect: { preset: '16:9', width: '16', height: '9' }, onAspectChange() {},
  })
  assert.match(html, /value="箱ひげ図_16x9\.zip"/)
  assert.match(html, /class="visually-hidden">\.zip は省略できます。/)
  assert.doesNotMatch(html, /次の画面で保存先フォルダを選べます。|このブラウザーでは保存先フォルダ/)
})

test('folder saves hide filename controls and ignore invalid or empty names', () => {
  for (const archive of [false, true]) {
    for (const initialFilename of ['', '  ', '.png', '.zip', 'CON.png', '比較:不正名.zip']) {
      const html = render({ initialFilename, archive, showFilename: false, helpMode: 'none',
        saveLabel: 'フォルダに8枚保存', additionalSaveAction: { label: '別の保存', onSave() {} },
      })
      assert.doesNotMatch(html, /aria-label="ファイル名"|>ファイル名<|\.png は省略|\.zip は省略/)
      assert.doesNotMatch(html, /ファイル名を入力してください。|ファイル名に使えない文字|予約名|role="alert"/)
      assert.match(html, /type="submit"[^>]*>フォルダに8枚保存<\/button>/)
      assert.doesNotMatch(html, /type="submit"[^>]*disabled=""/)
      assert.match(html, /type="button"[^>]*>別の保存<\/button>/)
    }
  }
})

test('hiding a filename preserves aspect validation, caller-disabled state, errors and progress', () => {
  const folder = { showFilename: false, initialFilename: '', saveLabel: 'フォルダに8枚保存' }
  assert.match(render({ ...folder, saveDisabled: true }), /type="submit"[^>]*disabled=""/)
  const invalidAspect = render({ ...folder,
    aspect: { preset: 'custom', width: '0', height: '9' }, onAspectChange() {},
  })
  assert.match(invalidAspect, /幅と高さを1〜100の整数で入力してください。/)
  assert.match(invalidAspect, /type="submit"[^>]*disabled=""/)
  const failed = render({ ...folder, error: '3/8枚を保存しました。' })
  assert.match(failed, /role="alert">3\/8枚を保存しました。/)
  assert.match(render({ ...folder, progress: 'PNG 3/8を保存中…' }), /role="status">PNG 3\/8を保存中…/)
})
