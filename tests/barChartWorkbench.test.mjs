import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createBarChartDocument } from '../src/lib/barChartDocument.ts'
import { createBarChartFromProvider } from '../src/lib/barChartProviders.ts'
import { getBarChartPresentationLabels } from '../src/lib/barChartPresentation.ts'
import { parseHashRoute } from '../src/lib/routes.ts'
import { APP_NAV_ITEMS } from '../src/lib/navigation.ts'
import { getChartImageLayout } from '../src/lib/chartImageLayout.ts'
import { getChartImageRasterSize } from '../src/lib/chartImageRasterSize.ts'

const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const rows = [0, 20, 60, null].map((magicResistance, i) => ({ id: String(i), stats: { magicResistance, defense: i * 200 } }))
const counts = { schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(({ id }, i) => [id, { mapCount: 1, spawnCount: [5, 3, 2, 8][i] }])) }
const data = { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }
const context = { data, version, scope: 'main' }
const frequency = createBarChartFromProvider('enemy-resistance-histogram', context)
const correspondence = createBarChartFromProvider('enemy-defense-resistance', context)
const settings = { values: true, axisBand: true, percent: true, cumulative: true }
let server, Plot, Figure, ImageFrame, ImageDialog, createSnapshot, imageFrame, Page

before(async () => {
  server = await createServer({ configFile: false, plugins: [react(), {
    name: 'bar-chart-workbench-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (importer?.endsWith('/BarChartWorkbenchPage.tsx') && id === '../lib/useEnemyAggregation') return '\0bar-chart-workbench-fixture'
    },
    load(id) {
      if (id === '\0bar-chart-workbench-fixture') return `export function useEnemyAggregation() { return {
        data: ${JSON.stringify(data)}, version: ${JSON.stringify(version)}, selectedId: 'v12', loading: false, error: null,
        catalog: { currentVersionId: 'v12', versions: [${JSON.stringify(version)}] }, setSelectedId() {}, retry() {}
      } }`
    },
  }], cacheDir: 'node_modules/.vite/bar-chart-workbench-test', resolve: { preserveSymlinks: true }, logLevel: 'error',
  server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ BarChartPlot: Plot, BarChartFigure: Figure } = await server.ssrLoadModule('/src/components/BarChartPlot.tsx'))
  ;({ ChartImageFrame: ImageFrame } = await server.ssrLoadModule('/src/components/ChartImageFrame.tsx'))
  ;({ BarChartImageDialog: ImageDialog, createBarChartImageSnapshot: createSnapshot, getBarChartImageFrame: imageFrame }
    = await server.ssrLoadModule('/src/components/BarChartImageDialog.tsx'))
  ;({ BarChartWorkbenchPage: Page } = await server.ssrLoadModule('/src/components/BarChartWorkbenchPage.tsx'))
})
after(async () => { await server?.close() })

const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const groups = markup => [...markup.matchAll(/<g\b([^>]*data-bar-chart-bin[^>]*)>(.*?)<\/g>/g)]
  .map(([, tag, body]) => ({ ...attributes(tag), body }))
const bins = markup => groups(markup).map(tag => [tag['data-bar-chart-bin'], tag['data-bar-chart-value']])
const rectangles = markup => [...markup.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attributes(tag))
const bars = markup => rectangles(markup).filter(tag => tag.class === 'bar-chart-bar')
const markerCount = (markup, name) => [...markup.matchAll(new RegExp(`\\b${name}="`, 'g'))].length
const finite = markup => assert.doesNotMatch(markup, /(?:x|y|width|height|points|transform)="[^"]*(?:NaN|Infinity|undefined)/)
const inputOf = document => Object.fromEntries(['xKind', 'bins', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source']
  .map(key => [key, document[key]]))

test('同じ共通Plotを画面と画像に使い、タイトル・数値・階級・元データを保持する', () => {
  for (const document of [frequency, correspondence]) {
    const original = JSON.stringify(document)
    const screen = render(Plot, { document, settings, width: 928, height: 334 })
    const snapshot = createSnapshot(document, settings)
    const frame = imageFrame(snapshot)
    const imagePlot = renderToStaticMarkup(frame.children({ width: 928, height: 334 }))
    assert.deepEqual(bars(imagePlot), bars(screen))
    assert.deepEqual(bins(imagePlot), document.bins.map(bin => [bin.id, bin.value === null ? 'missing' : String(bin.value)]))
    assert.deepEqual(bins(imagePlot), bins(screen))
    assert.equal(frame.title, document.title)
    assert.equal(frame.axisTitle, document.xAxisTitle)
    assert.equal(frame.conditions, document.conditions)
    assert.equal(markerCount(screen, 'data-bar-chart-axis-band'), document.bins.length)
    const figure = render(Figure, { document, settings })
    assert.ok(figure.includes(document.title) && figure.includes(document.conditions) && figure.includes(document.xAxisTitle))
    for (const ratio of [undefined, 16 / 9]) {
      const image = render(ImageFrame, imageFrame(snapshot, ratio))
      assert.deepEqual(bins(image), bins(screen))
      assert.ok(image.includes(document.title) && image.includes(document.conditions) && image.includes(document.xAxisTitle))
      finite(image)
    }
    assert.equal(JSON.stringify(document), original)
  }
})

test('0は高さ0の観測値、欠損は—とし、数値OFFでも欠損を0へ置き換えない', () => {
  const document = createBarChartDocument({ ...inputOf(correspondence), xKind: 'category', bins: [
    { id: 'zero', label: 'ゼロ', value: 0 }, { id: 'missing', label: '未計算', value: null }, { id: 'positive', label: '有効', value: 12 },
  ] })
  for (const values of [true, false]) {
    const markup = render(Plot, { document, settings: { ...settings, values }, width: 620 })
    assert.deepEqual(bins(markup), [['zero', '0'], ['missing', 'missing'], ['positive', '12']])
    assert.equal(bars(markup).length, 2)
    assert.equal(Number(bars(markup)[0].height), 0)
    assert.ok(Number(bars(markup)[1].height) > 0)
    const missing = groups(markup).find(tag => tag['data-bar-chart-bin'] === 'missing')
    assert.match(missing.body, /bar-chart-missing[^>]*>—<\/text>/)
    assert.equal(markerCount(markup, 'data-bar-chart-value-label'), values ? 2 : 0)
    finite(markup)
  }
})

test('棒幅の型は0や欠損から推定せず、全項目の幅を使って画面とPNGへ同じ上限を適用する', () => {
  const disabled = { ...settings, percent: false, cumulative: false }
  for (const kind of ['point', 'category', 'interval']) for (const width of [320, 928]) {
    const make = values => createBarChartDocument({ ...inputOf(correspondence), xKind: kind,
      bins: values.map((value, index) => ({ id: String(index), label: String(index * 10), value,
        ...(kind === 'point' ? { point: index * 10 } : kind === 'interval' ? { interval: {
          start: index * 10, end: (index + 1) * 10, includesMinimum: true, includesMaximum: false, isOverflow: false,
        } } : {}),
      })),
    })
    const observed = make([4, 8, 12, 16])
    const sparse = make([0, null, 12, 0])
    const original = render(Plot, { document: observed, settings: disabled, width })
    const screen = render(Plot, { document: sparse, settings: disabled, width })
    const image = renderToStaticMarkup(imageFrame(createSnapshot(sparse, disabled)).children({ width, height: 334 }))
    assert.equal(markerCount(screen, 'data-bar-chart-axis-band'), 4, '欠損と0も項目幅を割り当てる')
    const slots = rectangles(screen).filter(tag => tag.fill === 'transparent')
    assert.equal(slots.length, 4)
    const slotWidth = Number(slots[0].width)
    const expected = kind === 'interval' ? slotWidth * .96 : Math.min(48, slotWidth * .6)
    assert.ok(bars(screen).every(bar => Math.abs(Number(bar.width) - expected) < 1e-9))
    assert.equal(bars(screen)[0].width, bars(original)[0].width, '値が0や欠損へ変わっても棒幅を変えない')
    assert.deepEqual(bars(image), bars(screen), 'PNGの倍率とは独立した同じ描画幅')
    if (kind !== 'interval') assert.ok(width === 320 ? expected < 48 : expected === 48)
    else assert.ok(width === 320 ? expected < 96 : expected > 48)
  }
})

test('割合と累積は度数の能力に従い、同じ設定を対応防御力へ渡しても描画しない', () => {
  const frequencyPlot = render(Plot, { document: frequency, settings, width: 928 })
  assert.equal(markerCount(frequencyPlot, 'data-bar-chart-percentage'), frequency.bins.length)
  assert.equal(markerCount(frequencyPlot, 'data-bar-chart-cumulative'), 1)
  assert.match(frequencyPlot, /100%/)
  const points = /<polyline\b[^>]*points="([^"]*)"/.exec(frequencyPlot)[1].split(' ')
  assert.equal(points.length, frequency.bins.length)
  assert.equal(Number(points.at(-1).split(',')[1]), 0, '最後の階級までの累積は100%')
  const pointPlot = render(Plot, { document: correspondence, settings, width: 928 })
  assert.equal(markerCount(pointPlot, 'data-bar-chart-percentage'), 0)
  assert.equal(markerCount(pointPlot, 'data-bar-chart-cumulative'), 0)
  assert.doesNotMatch(pointPlot, /polyline|累積割合（%）|割合（%）/)
  const disabled = render(Plot, { document: frequency, settings: { ...settings, axisBand: false, percent: false, cumulative: false }, width: 928 })
  assert.equal(markerCount(disabled, 'data-bar-chart-percentage'), 0)
  assert.equal(markerCount(disabled, 'data-bar-chart-cumulative'), 0)
  assert.equal(markerCount(disabled, 'data-bar-chart-axis-band'), 0)
  assert.deepEqual(bins(disabled), bins(frequencyPlot))
})

test('狭い幅・長い階級名・全値0・空データでも不正な座標や操作要素を出さない', () => {
  const input = inputOf(frequency)
  const documents = [frequency,
    createBarChartDocument({ ...input, xKind: 'category', bins: [{ id: 'all-zero', label: '長い階級名'.repeat(4), value: 0, share: null, cumulativeShare: null }] }),
    createBarChartDocument({ ...input, bins: [] }),
  ]
  for (const document of documents) for (const width of [320, 620, 928]) {
    const markup = render(Plot, { document, settings, width })
    finite(markup)
    assert.doesNotMatch(markup, /onClick|tabindex|role="button"|data-tooltip|foreignObject/)
    assert.deepEqual(bins(markup), document.bins.map(bin => [bin.id, bin.value === null ? 'missing' : String(bin.value)]))
    assert.ok(bars(markup).every(bar => Number(bar.height) >= 0 && Number(bar.width) > 0))
  }
})

test('保存スナップショットは後続の表示変更を受けず、16:9の初期プレビューと1920px出力を使う', () => {
  const mutableSettings = { ...settings }
  const snapshot = createSnapshot(frequency, mutableSettings)
  mutableSettings.values = false
  mutableSettings.percent = false
  assert.deepEqual(snapshot.settings, settings)
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.settings))
  const frame = imageFrame(snapshot, 16 / 9)
  const size = getChartImageLayout(frame)
  assert.deepEqual(getChartImageRasterSize(size, { width: 1920, aspectRatio: 16 / 9 }), { width: 1920, height: 1080 })
  const markup = render(ImageDialog, { snapshot, onClose() {} })
  assert.match(markup, /<option value="16:9" selected="">16:9<\/option>/)
  assert.match(markup, /幅1920px/)
  assert.match(markup, /比率16x9\.png/)
  assert.doesNotMatch(markup, /help-tooltip|保存先の選択/)
})

test('共通ページはデータを選ぶ入口を持ち、X/Y入力や説明を追加せず初期の共通描画を使う', () => {
  const markup = render(Page, {})
  assert.match(markup, /棒グラフ作成/)
  assert.match(markup, /value="enemy-resistance-histogram" selected=""/)
  assert.match(markup, /value="enemy-defense-resistance"/)
  assert.match(markup, /<input\b(?=[^>]*value="main")(?=[^>]*checked="")[^>]*>/)
  assert.match(markup, /出現回数（体）/)
  assert.match(markup, /描画方式<\/dt><dd><strong>区間型<\/strong>/)
  assert.match(markup, /棒幅<\/dt><dd><strong>1項目幅の96%<\/strong>/)
  assert.doesNotMatch(markup, /上限48px/)
  assert.deepEqual(bins(markup), frequency.bins.map(bin => [bin.id, String(bin.value)]))
  assert.equal(markerCount(markup, 'data-bar-chart-percentage'), 0)
  assert.equal(markerCount(markup, 'data-bar-chart-cumulative'), 0)
  assert.doesNotMatch(markup, /<textarea|type="number"|ツールチップ|X列|Y列/)
})

test('提供元が変わると自動設定の描画方式と棒幅もデータの宣言に従う', () => {
  assert.deepEqual(getBarChartPresentationLabels(frequency.xKind), { type: '区間型', width: '1項目幅の96%', limit: null })
  assert.deepEqual(getBarChartPresentationLabels(correspondence.xKind), {
    type: '点型', width: '1項目幅の60%', limit: '上限48px（PNG拡大前）',
  })
  const before = structuredClone(correspondence)
  before.bins.forEach(bin => { bin.value = null })
  assert.deepEqual(getBarChartPresentationLabels(before.xKind), getBarChartPresentationLabels(correspondence.xKind),
    '有効な数値がなくても点型を度数の区間型へ推定し直さない')
})

test('独立した棒グラフ作成ルートをナビゲーションから開き、無関係なパスを受け付けない', () => {
  for (const hash of ['#/charts/bar', '#/charts/bar?aggregationVersion=v12']) {
    assert.deepEqual(parseHashRoute(hash), { view: 'bar-chart-workbench' })
  }
  assert.equal(APP_NAV_ITEMS.find(item => item.id === 'bar-chart-workbench')?.href, '#/charts/bar')
  assert.deepEqual(parseHashRoute('#/charts/bar/extra'), { view: 'operators' })
})
