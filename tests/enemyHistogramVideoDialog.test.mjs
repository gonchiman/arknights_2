import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server, Dialog, Editor, createDraft, parseTiming, definition
before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react(), {
      name: 'histogram-dialog-renderer-fixture',
      resolveId(source, importer) {
        if (importer?.endsWith('/EnemyHistogramVideoSaveDialog.tsx') && source === './renderEnemyHistogramVideo') {
          return '\0histogram-dialog-renderer-fixture'
        }
      },
      load(id) {
        if (id === '\0histogram-dialog-renderer-fixture') {
          return 'export function prepareEnemyHistogramVideo() { throw new Error("SSR must not prepare a video") }; export function renderEnemyHistogramVideo() { throw new Error("SSR must not encode a video") }'
        }
      },
    }],
    cacheDir: 'node_modules/.vite/enemy-histogram-video-dialog-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ EnemyHistogramVideoSaveDialog: Dialog } = await server.ssrLoadModule('/src/components/EnemyHistogramVideoSaveDialog.tsx'))
  ;({ ChartVideoTimingEditor: Editor } = await server.ssrLoadModule('/src/components/EnemyRatingVideoTimingEditor.tsx'))
  ;({ createEnemyHistogramVideoTimingDraft: createDraft, parseEnemyHistogramVideoTiming: parseTiming,
    ENEMY_HISTOGRAM_VIDEO_DEFINITION: definition } = await server.ssrLoadModule('/src/lib/enemyHistogramVideoTiming.ts'))
})
after(async () => { await server?.close() })

function renderDialog(hasCumulative) {
  return renderToStaticMarkup(createElement(Dialog, {
    renderChart: ratio => createElement('svg', { 'data-ratio': ratio }, createElement('title', null, 'fixture histogram')),
    initialFilename: '敵_集計v12_術耐性_ヒストグラム_出現回数_メインストーリー_割合表示.png',
    hasCumulative, onClose() {},
  }))
}

test('ヒストグラム動画は16:9・5秒・棒と連動・順に伸びるで初期表示し、専用設定をファイル名にも残す', () => {
  const html = renderDialog(true)
  assert.match(html, /value="敵_集計v12_術耐性_ヒストグラム_5秒_累積線連動_棒順に伸びる_幅1920px_.*_比率16x9\.mp4"/)
  assert.match(html, /aria-pressed="true"[^>]*>棒と連動<\/button>/)
  assert.match(html, /aria-pressed="false"[^>]*>棒のあと<\/button>/)
  assert.match(html, /<option value="staggerGrow" selected="">順に伸びる<\/option>/)
  assert.match(html, /data-ratio="1\.7777777777777777"/)
  assert.match(html, /棒に連動/)
  assert.doesNotMatch(html, /全体を生成|文字の出し方|縦線の出し方|を上へ|を下へ/)
})

test('累積表示なしの画像では累積線設定を作らず、割合は棒に連動する', () => {
  const html = renderDialog(false)
  assert.doesNotMatch(html, /累積線|棒と連動|棒のあと/)
  assert.match(html, /棒に連動/)
  assert.match(html, /value="[^"]*_5秒_棒順に伸びる_幅1920px_/)
})

test('共通タイミングeditorは既存効果と順序操作を保持し、明示した設定だけを非表示にできる', () => {
  const draft = createDraft()
  const props = { draft, onChange() {}, parsed: parseTiming(draft), inputError: null, onInputError() {}, activePhase: null,
    definition, phaseLabels: { bars: '棒', values: '割合' }, guideLabel: '縦線の出し方', dataEffect: 'bars', disabled: false }
  const normal = renderToStaticMarkup(createElement(Editor, props))
  assert.match(normal, /文字の出し方/)
  assert.match(normal, /縦線の出し方/)
  assert.match(normal, /棒を上へ/)
  const reduced = renderToStaticMarkup(createElement(Editor, { ...props,
    showTextEffect: false, showGuideEffect: false, showPhaseOrder: false, createDefaultDraft: createDraft }))
  assert.match(reduced, /棒の出し方/)
  assert.doesNotMatch(reduced, /文字の出し方|縦線の出し方|を上へ|を下へ/)
})
