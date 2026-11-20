import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createBarChartDocument, DEFAULT_BAR_CHART_DISPLAY_SETTINGS } from '../src/lib/barChartDocument.ts'
import { createBarChartFromProvider } from '../src/lib/barChartProviders.ts'
import { ENEMY_STAT_METRICS } from '../src/lib/enemyStatMetrics.ts'
import { getBarChartPresentationLabels } from '../src/lib/barChartPresentation.ts'
import { parseHashRoute } from '../src/lib/routes.ts'
import { APP_NAV_ITEMS } from '../src/lib/navigation.ts'
import { getChartImageLayout } from '../src/lib/chartImageLayout.ts'
import { getChartImageRasterSize } from '../src/lib/chartImageRasterSize.ts'
import { getBarChartNaturalHeight } from '../src/lib/barChartLayout.ts'

const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const rows = [0, 20, 60, null].map((magicResistance, i) => ({ id: String(i), stats: {
  magicResistance, defense: i * 200, maxHp: i * 5000, attack: i * 200,
  moveSpeed: i * .2, baseAttackTime: i * .5, massLevel: i,
} }))
const counts = { schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(({ id }, i) => [id, { mapCount: 1, spawnCount: [5, 3, 2, 8][i] }])) }
const data = { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }
const context = { data, version, scope: 'main' }
const frequency = createBarChartFromProvider('enemy-stat-histogram', context)
const distributions = ENEMY_STAT_METRICS.map(metric => createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey: metric.key }))
const ratingDistributions = ['maxHp', 'attack', 'defense', 'magicResistance'].map(statKey =>
  createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey, histogramBinning: 'rating' }))
const ratingFrequency = ratingDistributions.at(-1)
const correspondence = createBarChartFromProvider('enemy-defense-resistance', context)
const settings = { values: true, axisBand: true, percent: true, cumulative: true }
const allBands = { ...settings, cumulativeBand: true, rankBand: true }
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
function group(markup, marker) {
  const opening = [...markup.matchAll(/<g\b[^>]*>/g)].find(([tag]) => tag.includes(marker))
  if (!opening) return null
  const content = markup.slice(opening.index)
  let depth = 0
  for (const tag of content.matchAll(/<\/?g\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (depth === 0) return content.slice(0, tag.index + tag[0].length)
  }
  assert.fail(`Unclosed group ${marker}`)
}
const inputOf = document => Object.fromEntries(['xKind', 'bins', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source']
  .map(key => [key, document[key]]))

test('7ステータスと対応値が同じ共通Plotを画面と画像に使い、タイトル・数値・階級・元データを保持する', () => {
  for (const document of [...distributions, ...ratingDistributions, correspondence]) {
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

test('累積割合線・累積割合帯は独立して切り替えられ、旧設定と新項目の初期OFFを維持する', () => {
  assert.equal(DEFAULT_BAR_CHART_DISPLAY_SETTINGS.cumulativeBand, false)
  assert.equal(DEFAULT_BAR_CHART_DISPLAY_SETTINGS.rankBand, false)
  const legacy = render(Plot, { document: frequency, settings, width: 928 })
  const explicitOff = render(Plot, { document: frequency, settings: { ...settings, cumulativeBand: false, rankBand: false }, width: 928 })
  assert.deepEqual(bars(legacy), bars(explicitOff))
  assert.equal(markerCount(legacy, 'data-bar-chart-cumulative-band'), 0)
  assert.equal(markerCount(legacy, 'data-bar-chart-rank-band'), 0)
  for (const cumulative of [false, true]) for (const cumulativeBand of [false, true]) {
    const markup = render(Plot, { document: frequency, settings: { ...settings, cumulative, cumulativeBand }, width: 928 })
    assert.equal(markerCount(markup, 'data-bar-chart-cumulative'), cumulative ? 1 : 0)
    assert.equal(markerCount(markup, 'data-bar-chart-cumulative-band'), cumulativeBand ? 1 : 0)
    assert.equal(markerCount(markup, 'data-bar-chart-percentage'), frequency.bins.length)
    assert.deepEqual(bins(markup), bins(legacy))
    if (cumulativeBand) {
      const band = group(markup, 'data-bar-chart-cumulative-band="true"')
      assert.match(band, /累積割合（%）/)
      assert.match(band, />50<\/text>/)
      assert.match(band, />80<\/text>/)
      assert.match(band, />100<\/text>/)
    }
    finite(markup)
  }
})

test('上は累積割合帯→割合帯、下は階級帯→評価帯の順で、評価の端点を同じ帯に収める', () => {
  for (const width of [620, 928]) {
    const markup = render(Plot, { document: frequency, settings: allBands, width })
    const baseline = render(Plot, { document: frequency, settings, width })
    assert.deepEqual(bars(markup), bars(baseline), '帯の行数に合わせて高さを増やし、元の棒を縦につぶさない')
    const cumulative = group(markup, 'data-bar-chart-cumulative-band="true"')
    const percentage = group(markup, 'data-bar-chart-percentage-band="true"')
    const ranks = group(markup, 'data-bar-chart-rank-band="true"')
    assert.ok(cumulative && percentage && ranks)
    const cumFills = rectangles(cumulative).filter(tag => tag.class === 'chart-strip-fill')
    const pctFills = rectangles(percentage).filter(tag => tag.class === 'chart-strip-fill')
    const rankFills = rectangles(ranks).filter(tag => tag.class === 'stat-rank-strip-fill')
    const axes = [...markup.matchAll(/<g\b[^>]*data-bar-chart-axis-band="[^"]*"[^>]*>(.*?)<\/g>/g)]
      .flatMap(([, content]) => rectangles(content).filter(tag => tag.class === 'chart-strip-fill'))
    assert.equal(cumFills.length, frequency.bins.length)
    assert.equal(pctFills.length, frequency.bins.length)
    assert.ok(rankFills.length > 0 && axes.length > 0)
    assert.ok(Math.max(...cumFills.map(tag => Number(tag.y) + Number(tag.height))) < Math.min(...pctFills.map(tag => Number(tag.y))))
    assert.ok(Math.max(...axes.map(tag => Number(tag.y) + Number(tag.height))) < Math.min(...rankFills.map(tag => Number(tag.y))))
    assert.match(ranks, /data-rank="E・D"/)
    assert.match(ranks, /data-rank="S\+・SS"/)
    assert.doesNotMatch(ranks, /<title|data-rank-point|stat-rank-strip-point|tooltip|tabindex|role="button"|onClick/)
    const svg = attributes(markup.match(/<svg\b[^>]*>/)[0])
    assert.ok(rankFills.every(tag => Number(tag.y) + Number(tag.height) <= Number(svg.height)))
    finite(markup)
  }
})

test('帯の自然高を画面と画像で共有し、非対応の評価帯・対応値の割合帯は設定持越でも出さない', () => {
  const off = { ...settings, cumulativeBand: false, rankBand: false }
  assert.equal(getBarChartNaturalHeight(frequency, off), 334)
  assert.equal(getBarChartNaturalHeight(frequency, { ...off, cumulativeBand: true }), 362)
  assert.equal(getBarChartNaturalHeight(frequency, { ...off, rankBand: true }), 362)
  assert.equal(getBarChartNaturalHeight(frequency, allBands), 390)
  for (const document of [...distributions, correspondence]) {
    const natural = getBarChartNaturalHeight(document, allBands)
    const screen = render(Plot, { document, settings: allBands, width: 928 })
    const snapshot = createSnapshot(document, allBands)
    const frame = imageFrame(snapshot)
    const image = renderToStaticMarkup(frame.children({ width: 928, height: natural }))
    assert.equal(frame.naturalChartHeight, natural)
    assert.deepEqual(bars(image), bars(screen))
    assert.deepEqual(bins(image), bins(screen))
    for (const marker of ['data-bar-chart-cumulative-band="true"', 'data-bar-chart-percentage-band="true"', 'data-bar-chart-rank-band="true"']) {
      assert.equal(group(image, marker), group(screen, marker), '帯の位置・内容も画面と画像で一致する')
    }
    assert.equal(markerCount(screen, 'data-bar-chart-rank-band'), document.capabilities.rankBands ? 1 : 0)
    assert.equal(markerCount(screen, 'data-bar-chart-cumulative-band'), document.capabilities.cumulative ? 1 : 0)
    if (!document.capabilities.rankBands) assert.doesNotMatch(screen, /stat-rank-strip/)
    if (!document.capabilities.cumulative) assert.equal(natural, 334)
    const svg = attributes(screen.match(/<svg\b[^>]*>/)[0])
    assert.equal(Number(svg.height), natural)
    assert.doesNotMatch(screen, /onClick|tabindex|role="button"|data-tooltip|foreignObject/)
    finite(screen)
  }
  const mutable = { ...allBands }
  const snapshot = createSnapshot(frequency, mutable)
  mutable.cumulativeBand = false
  mutable.rankBand = false
  assert.equal(snapshot.settings.cumulativeBand, true)
  assert.equal(snapshot.settings.rankBand, true)
  assert.equal(imageFrame(snapshot).naturalChartHeight, 390)
})

test('評価区切りは評価を主軸に、下段に範囲を描き、軸帯OFFでは補助帯も出さない', () => {
  for (const document of ratingDistributions) for (const width of [320, 620, 928]) {
    const markup = render(Plot, { document, settings: allBands, width })
    const secondary = group(markup, 'data-bar-chart-secondary-axis-band="true"')
    assert.ok(secondary)
    assert.match(secondary, /範囲/)
    assert.match(markup, />評価<\/text>/)
    assert.doesNotMatch(markup, />階級<\/text>/)
    assert.equal(markerCount(markup, 'data-bar-chart-axis-band'), 10)
    assert.equal(markerCount(markup, 'data-bar-chart-rank-band'), 0, '評価主軸に追加の評価注釈帯を重ねない')
    const secondaryFills = rectangles(secondary).filter(tag => tag.class === 'chart-strip-fill')
    assert.equal(secondaryFills.length, 10)
    const primaryFills = [...markup.matchAll(/<g\b[^>]*data-bar-chart-axis-band="[^"]*"[^>]*>(.*?)<\/g>/g)]
      .flatMap(([, content]) => rectangles(content).filter(tag => tag.class === 'chart-strip-fill'))
    assert.equal(primaryFills.length, 10)
    assert.ok(Math.max(...primaryFills.map(tag => Number(tag.y) + Number(tag.height)))
      < Math.min(...secondaryFills.map(tag => Number(tag.y))))
    const svg = attributes(markup.match(/<svg\b[^>]*>/)[0])
    assert.ok(secondaryFills.every(tag => Number(tag.y) + Number(tag.height) <= Number(svg.height)))
    assert.doesNotMatch(secondary, /<title|tooltip|tabindex|onClick|rotate\(/)
    assert.doesNotMatch(markup, /onClick|tabindex|role="button"|data-tooltip|foreignObject/)
    const off = render(Plot, { document, settings: { ...allBands, axisBand: false }, width })
    assert.equal(markerCount(off, 'data-bar-chart-secondary-axis-band'), 0)
    assert.equal(markerCount(off, 'data-bar-chart-axis-band'), 0)
    assert.equal(markerCount(off, 'data-bar-chart-rank-band'), 0)
    assert.deepEqual(bins(off), bins(markup))
    finite(markup)
    finite(off)
  }
})

test('評価の範囲情報と自然高は保存スナップショットにも残り、画面とPNGで同じ2段の軸を描く', () => {
  const off = { ...settings, cumulativeBand: false, rankBand: false }
  assert.equal(getBarChartNaturalHeight(ratingFrequency, off), 376)
  assert.equal(getBarChartNaturalHeight(ratingFrequency, { ...off, axisBand: false }), 334)
  assert.equal(getBarChartNaturalHeight(ratingFrequency, { ...off, rankBand: true }), 376)
  const natural = getBarChartNaturalHeight(ratingFrequency, allBands)
  assert.equal(natural, 404)
  const mutable = { ...allBands }
  const snapshot = createSnapshot(ratingFrequency, mutable)
  const captured = JSON.stringify(snapshot)
  mutable.axisBand = false
  mutable.rankBand = false
  createBarChartFromProvider('enemy-stat-histogram', { ...context, histogramBinning: 'numeric' })
  assert.equal(JSON.stringify(snapshot), captured)
  const frame = imageFrame(snapshot)
  assert.equal(frame.naturalChartHeight, natural)
  const screen = render(Plot, { document: ratingFrequency, settings: allBands, width: 928 })
  const image = renderToStaticMarkup(frame.children({ width: 928, height: natural }))
  assert.deepEqual(bins(image), bins(screen))
  assert.deepEqual(bars(image), bars(screen))
  assert.equal(group(image, 'data-bar-chart-secondary-axis-band="true"'), group(screen, 'data-bar-chart-secondary-axis-band="true"'))
  assert.ok(snapshot.document.secondaryAxisBand.labels.some(lines => lines.join('').includes('0以下')))
  assert.ok(snapshot.document.secondaryAxisBand.labels.some(lines => lines.join('').includes('90超')))
  assert.deepEqual(getBarChartPresentationLabels(ratingFrequency.xKind), getBarChartPresentationLabels(frequency.xKind), '評価も同じ区間型の棒幅を使う')
})

test('長い範囲の供給行はFigureの幅を広げて水平に保ち、棒の領域を縦に縮めない', () => {
  const labels = ratingFrequency.bins.map((_, index) => [`${index},100,000,000,000,000〜`, `${index},200,000,000,000,000`])
  const document = createBarChartDocument({ ...inputOf(ratingFrequency), secondaryAxisBand: { title: '範囲', labels } })
  for (const cumulative of [false, true]) {
    const display = { ...settings, cumulative }
    const markup = render(Figure, { document, settings: display })
    const rangeBand = group(markup, 'data-bar-chart-secondary-axis-band="true"')
    const svg = attributes(markup.match(/<svg\b[^>]*>/)[0])
    assert.ok(Number(svg.width) > 928, '長い行のために横スクロールできる描画幅を確保する')
    const rows = [...rangeBand.matchAll(/<text\b[^>]*class="chart-strip-label"[^>]*>(.*?)<\/text>/g)]
      .map(([, content]) => [...content.matchAll(/<tspan\b[^>]*>(.*?)<\/tspan>/g)].map(([, line]) => line))
    assert.deepEqual(rows, labels, '行を省略・追加折り返し・回転せず、提供された2行をそのまま表示する')
    const fills = rectangles(rangeBand).filter(tag => tag.class === 'chart-strip-fill')
    assert.ok(fills.every(tag => Number(tag.height) === 38), '通常の2行分の高さを保つ')
    const withoutSecondary = createBarChartDocument(inputOf(ratingFrequency))
    const baseline = render(Figure, { document: withoutSecondary, settings: display })
    assert.deepEqual(bars(markup).map(bar => [bar.y, bar.height]), bars(baseline).map(bar => [bar.y, bar.height]),
      '範囲の文字数はデータ領域の高さや棒の縦方向の形を変えない')
    const hidden = render(Figure, { document, settings: { ...display, axisBand: false } })
    assert.equal(Number(attributes(hidden.match(/<svg\b[^>]*>/)[0]).width), 928, '帯OFFなら長い補助ラベルの幅を持ち越さない')
    finite(markup)
  }
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
  assert.match(markup, /value="enemy-stat-histogram" selected=""/)
  assert.match(markup, /value="enemy-defense-resistance"/)
  assert.match(markup, /敵のステータス分布/)
  const statSelect = /<select\b[^>]*aria-label="ステータス"[^>]*>(.*?)<\/select>/.exec(markup)?.[1]
  assert.ok(statSelect, '分布の提供元とは別にステータスを選べる')
  for (const metric of ENEMY_STAT_METRICS) {
    assert.ok(statSelect.includes(`value="${metric.key}"`), metric.label)
    assert.ok(statSelect.includes(`>${metric.label}</option>`), metric.label)
  }
  assert.match(statSelect, /value="magicResistance" selected=""/)
  assert.doesNotMatch(statSelect, /stageAppearanceCount/)
  assert.match(markup, /<input\b(?=[^>]*value="main")(?=[^>]*checked="")[^>]*>/)
  assert.match(markup, /出現回数（体）/)
  assert.match(markup, /描画方式<\/dt><dd><strong>区間型<\/strong>/)
  assert.match(markup, /棒幅<\/dt><dd><strong>1項目幅の96%<\/strong>/)
  assert.match(markup, /階級幅<\/dt><dd><strong>10<\/strong>/)
  assert.match(markup, /上限<\/dt><dd><strong>自動 100<\/strong>/)
  assert.match(markup, /階級/)
  assert.match(markup, /<input\b(?=[^>]*type="radio")(?=[^>]*value="numeric")(?=[^>]*checked="")[^>]*>/)
  const ratingRadio = /<input\b(?=[^>]*type="radio")(?=[^>]*value="rating")[^>]*>/.exec(markup)?.[0]
  assert.ok(ratingRadio)
  assert.doesNotMatch(ratingRadio, /checked=""/)
  assert.match(markup, /ゲーム内評価/)
  assert.equal(markerCount(markup, 'data-bar-chart-secondary-axis-band'), 0)
  assert.doesNotMatch(markup, /上限48px/)
  assert.deepEqual(bins(markup), frequency.bins.map(bin => [bin.id, String(bin.value)]))
  assert.equal(markerCount(markup, 'data-bar-chart-percentage'), 0)
  assert.equal(markerCount(markup, 'data-bar-chart-cumulative'), 0)
  assert.equal(markerCount(markup, 'data-bar-chart-cumulative-band'), 0)
  assert.equal(markerCount(markup, 'data-bar-chart-rank-band'), 0)
  for (const label of ['累積割合線', '累積割合帯', '評価帯']) {
    const inputLabel = new RegExp(`<label><input[^>]*type="checkbox"[^>]*\\/>${label}<\\/label>`).exec(markup)?.[0]
    assert.ok(inputLabel, label)
    assert.doesNotMatch(inputLabel, /checked=""/, '新しい帯と累積線は初期OFF')
  }
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
