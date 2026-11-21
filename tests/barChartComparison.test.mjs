import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import {
  createBarChartDocument, getBarChartFilename, getBarChartComparisonAxis,
  getBarChartComparisonBand, getBarChartSelectionSummary,
} from '../src/lib/barChartDocument.ts'
import { createBarChartFromProvider } from '../src/lib/barChartProviders.ts'
import { getBarChartItemKind, getBarChartBarWidth, getBarChartPresentationLabels } from '../src/lib/barChartPresentation.ts'
import { getBarChartNaturalHeight } from '../src/lib/barChartLayout.ts'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'

const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const metrics = ['maxHp', 'attack', 'defense', 'magicResistance']
const labels = { maxHp: 'HP', attack: '攻撃力', defense: '防御力', magicResistance: '術耐性' }
const ratingOrder = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']
const rows = [
  { id: 'zero', stats: { maxHp: 0, attack: 0, defense: 0, magicResistance: 0 } },
  { id: 'standard', stats: { maxHp: 5000, attack: 200, defense: 300, magicResistance: 20 } },
  { id: 'missing-defense', stats: { maxHp: 10000, attack: 400, defense: null, magicResistance: 50 } },
  { id: 'missing-hp', stats: { maxHp: null, attack: 600, defense: 900, magicResistance: null } },
  { id: 'missing-all', stats: { maxHp: null, attack: null, defense: null, magicResistance: null } },
]
const weights = [1.75, 2.25, 3.5, 4, 2.5]
const counts = {
  schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(({ id }, index) => [id, { mapCount: 1, spawnCount: weights[index] }])),
}
const context = { data: { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }, version, scope: 'main' }
const settings = { values: true, axisBand: true, percent: false, cumulative: false }
const comparison = (leftStatKey = 'defense', rightStatKey = 'magicResistance', extra = {}) =>
  createBarChartFromProvider('enemy-stat-rating-comparison', { ...context, leftStatKey, rightStatKey, ...extra })
const inputOf = document => Object.fromEntries([
  'xKind', 'bins', 'layout', 'series', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source',
].map(key => [key, document[key]]))
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, message)

test('任意の左右2ステータスは既存の評価別度数と各自の母数を保ち、同じステータスも別系列として扱う', () => {
  const original = JSON.stringify(context)
  const expectedPopulations = { maxHp: [7.5, 6.5], attack: [11.5, 2.5], defense: [8, 6], magicResistance: [7.5, 6.5] }
  for (const left of metrics) for (const right of metrics) {
    const document = comparison(left, right)
    assert.equal(document.layout, 'mirrored')
    assert.equal(document.xKind, 'category')
    assert.equal(document.semantics.itemKind, 'interval')
    assert.equal(getBarChartItemKind(document), 'interval')
    assert.equal(document.source.population, null, '左右に共通の有効母数を捏造しない')
    assert.deepEqual(document.bins.map(bin => bin.label), ratingOrder)
    assert.deepEqual(document.series.map(series => series.id), ['left', 'right'])
    for (const [index, key] of [left, right].entries()) {
      const series = document.series[index]
      const expected = createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey: key, histogramBinning: 'rating' })
      assert.equal(series.metricKey, key)
      assert.equal(series.label, labels[key])
      assert.deepEqual(series.bins.map(bin => [bin.id, bin.label, bin.value, bin.share, bin.cumulativeShare]),
        expected.bins.map(bin => [bin.id, bin.label, bin.value, bin.share, bin.cumulativeShare]))
      assert.deepEqual(series.population, expected.source.population)
      assert.equal(series.population.total, 14)
      assert.equal(series.population.valid, expectedPopulations[key][0])
      assert.equal(series.population.missing, expectedPopulations[key][1])
      assert.ok(series.bins.every(bin => bin.value >= 0 && bin.share >= 0), '左系列も入力値を負にしない')
      close(series.bins.reduce((sum, bin) => sum + bin.share, 0), 1)
      assert.equal(series.bins.at(-1).cumulativeShare, 1)
    }
    if (left === right) assert.deepEqual(document.series[0].bins, document.series[1].bins)
    assert.ok(document.title.includes(labels[left]) && document.title.includes(labels[right]))
    assert.equal(JSON.stringify(context), original)
  }
  const defaults = createBarChartFromProvider('enemy-stat-rating-comparison', context)
  assert.deepEqual(defaults.series.map(series => series.metricKey), ['defense', 'magicResistance'])
  for (const key of ['moveSpeed', 'baseAttackTime', 'massLevel', 'unknown']) {
    assert.throws(() => comparison(key, 'defense'), /ステータス|評価/)
    assert.throws(() => comparison('defense', key), /ステータス|評価/)
  }
})

test('0の観測値、度数0、全欠損、空データを区別し、有効母数0の割合を0%へ置換しない', () => {
  const only = (stats, customRows = [{ ...rows[0], stats }]) => ({ ...context.data, rows: customRows })
  const zero = comparison('maxHp', 'defense', { data: only({ maxHp: 0, defense: 0 }) })
  for (const series of zero.series) {
    assert.equal(series.population.valid, 1.75)
    assert.equal(series.bins[0].value, 1.75)
    assert.equal(series.bins[0].share, 1)
    assert.ok(series.bins.slice(1).every(bin => bin.value === 0 && bin.share === 0 && bin.cumulativeShare === 1))
  }
  const missing = comparison('maxHp', 'defense', { data: only({ maxHp: null, defense: 0 }) })
  assert.equal(missing.series[0].population.missing, 1.75)
  assert.ok(missing.series[0].bins.every(bin => bin.value === 0 && bin.share === null && bin.cumulativeShare === null))
  assert.equal(missing.series[1].bins[0].share, 1)
  const summary = getBarChartSelectionSummary(missing, ['rating-E', 'rating-C'])
  assert.equal(summary.series[0].share, null)
  assert.equal(summary.series[1].share, 1)
  const empty = comparison('maxHp', 'defense', { data: only({}, []) })
  assert.equal(empty.bins.length, 10)
  assert.ok(empty.series.every(series => series.population.valid === 0 && series.population.missing === 0
    && series.bins.every(bin => bin.value === 0 && bin.share === null)))
})

test('左右共通の目盛りと区間96%の棒幅を意味から明示し、選択合計は丸め前の各系列の度数から求める', () => {
  assert.equal(getBarChartComparisonBand(settings), 'cumulative')
  for (const band of ['cumulative', 'rank', 'none']) assert.equal(getBarChartComparisonBand({ ...settings, comparisonBand: band }), band)
  for (const left of metrics) for (const right of metrics) {
    const document = comparison(left, right)
    const axis = getBarChartComparisonAxis(document)
    const maximum = Math.max(...document.series.flatMap(series => series.bins.map(bin => bin.share * 100)))
    assert.ok(axis.maximum >= maximum)
    assert.equal(axis.ticks[0], 0)
    assert.equal(axis.ticks.at(-1), axis.maximum)
    assert.ok(axis.ticks.every(tick => tick >= 0 && tick <= axis.maximum))
    assert.equal(getBarChartSelectionSummary(document, []), null)
    const summary = getBarChartSelectionSummary(document, ['rating-C', 'rating-E', 'rating-D', 'rating-E', 'invalid'])
    assert.equal(summary.label, 'E〜C')
    for (const [index, series] of document.series.entries()) {
      const expected = series.bins.slice(0, 3).reduce((sum, bin) => sum + bin.value, 0)
      assert.equal(summary.series[index].id, series.id)
      assert.equal(summary.series[index].count, expected)
      close(summary.series[index].share, expected / series.population.valid)
    }
  }
  const kind = getBarChartItemKind(comparison())
  for (const slot of [20, 70, 300]) close(getBarChartBarWidth(kind, slot, 'mirrored'), slot * .96)
  const presentation = getBarChartPresentationLabels(kind, 'mirrored')
  assert.equal(presentation.type, '左右の横棒・区間型')
  assert.match(presentation.width, /96%/)
})

test('左右の順序、帯と強調を保存名へ含め、他の描画方式の持越設定は名前に含めない', () => {
  const left = comparison('maxHp', 'defense'), right = comparison('defense', 'maxHp')
  const a = getBarChartFilename(left, settings, 16 / 9), b = getBarChartFilename(right, settings, 16 / 9)
  assert.notEqual(a, b)
  assert.match(a, /左HP/)
  assert.match(a, /右防御力/)
  assert.match(b, /左防御力/)
  assert.match(b, /右HP/)
  assert.match(a, /集計v12/)
  assert.match(a, /メインストーリー/)
  assert.match(a, /比率16x9\.png$/)
  assert.notEqual(a, getBarChartFilename(left, { ...settings, comparisonBand: 'none' }, 16 / 9))
  assert.notEqual(a, getBarChartFilename(left, { ...settings, comparisonBand: 'rank' }, 16 / 9))
  const selected = getBarChartFilename(left, { ...settings, selectedRanks: ['rating-E', 'rating-C'] }, 16 / 9)
  assert.notEqual(a, selected)
  assert.ok(selected.includes('E') && selected.includes('C'))
  assert.equal(getBarChartFilename(left, { ...settings, selectedRanks: ['rating-C', 'rating-E', 'rating-E', 'invalid'] }, 16 / 9), selected)
  assert.equal(getBarChartFilename(left, { ...settings, values: false, axisBand: false, percent: true,
    cumulative: true, cumulativeBand: true, rankBand: true }, 16 / 9), a)
})

test('2系列の契約はJSON固定スナップショットで、系列IDの重複や順序のずれたカテゴリを拒否する', () => {
  const mutable = structuredClone(context)
  const document = createBarChartFromProvider('enemy-stat-rating-comparison', { ...mutable, leftStatKey: 'maxHp', rightStatKey: 'defense' })
  const captured = JSON.stringify(document)
  mutable.data.rows[0].stats.maxHp = 999999
  mutable.data.counts.enemies.zero.spawnCount = 400
  assert.equal(JSON.stringify(document), captured)
  assert.deepEqual(JSON.parse(captured), document)
  assert.ok(Object.isFrozen(document.series) && Object.isFrozen(document.series[0]) && Object.isFrozen(document.series[0].bins[0])
    && Object.isFrozen(document.series[0].population))
  assert.equal(JSON.parse(captured).semantics.itemKind, 'interval')
  assert.ok(Object.isFrozen(document.semantics))
  const input = inputOf(document)
  assert.throws(() => createBarChartDocument({ ...input, semantics: { ...input.semantics, itemKind: 'unknown' } }))
  for (const series of [
    [input.series[0], { ...input.series[1], id: 'left' }],
    [{ ...input.series[0], bins: input.series[0].bins.slice(1) }, input.series[1]],
    [{ ...input.series[0], bins: [...input.series[0].bins].reverse() }, input.series[1]],
    [{ ...input.series[0], bins: input.series[0].bins.map((bin, index) => index ? bin : { ...bin, share: NaN }) }, input.series[1]],
  ]) assert.throws(() => createBarChartDocument({ ...input, series }))
})

test('v12メインストーリーの全16通りで有効母数と評価別度数を既存の単体ヒストグラムに一致させる', async () => {
  const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1), folder))) })
  const { versions } = await client.loadIndex()
  const version = versions.find(item => item.id === 'v12')
  assert.ok(version)
  const data = await client.loadVersion(version)
  const expected = Object.fromEntries(metrics.map(statKey => [statKey,
    createBarChartFromProvider('enemy-stat-histogram', { data, version, scope: 'main', statKey, histogramBinning: 'rating' })]))
  const populations = { maxHp: [11610, 0], attack: [11610, 0], defense: [11409, 201], magicResistance: [11409, 201] }
  for (const leftStatKey of metrics) for (const rightStatKey of metrics) {
    const document = createBarChartFromProvider('enemy-stat-rating-comparison', { data, version, scope: 'main', leftStatKey, rightStatKey })
    for (const [index, key] of [leftStatKey, rightStatKey].entries()) {
      const series = document.series[index]
      assert.equal(series.population.valid, populations[key][0])
      assert.equal(series.population.missing, populations[key][1])
      assert.equal(series.population.total, 11610)
      assert.deepEqual(series.bins.map(bin => [bin.value, bin.share, bin.cumulativeShare]),
        expected[key].bins.map(bin => [bin.value, bin.share, bin.cumulativeShare]))
    }
  }
  const document = createBarChartFromProvider('enemy-stat-rating-comparison', { data, version, scope: 'main' })
  assert.deepEqual(document.series[1].bins.map(bin => bin.value), [3549, 0, 485, 3521, 1997, 1436, 304, 3, 114, 0])
})

let server, Plot, createSnapshot, imageFrame
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/bar-chart-comparison-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ BarChartPlot: Plot } = await server.ssrLoadModule('/src/components/BarChartPlot.tsx'))
  ;({ createBarChartImageSnapshot: createSnapshot, getBarChartImageFrame: imageFrame }
    = await server.ssrLoadModule('/src/components/BarChartImageDialog.tsx'))
})
after(async () => { await server?.close() })

const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const rects = markup => [...markup.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attributes(tag))
const finite = markup => assert.doesNotMatch(markup, /(?:x|y|width|height|points|transform)="[^"]*(?:NaN|Infinity|undefined)/)
const markerCount = (markup, name) => [...markup.matchAll(new RegExp(`\\b${name}="`, 'g'))].length
const bars = markup => rects(markup).filter(tag => tag.class?.split(' ').includes('bar-chart-comparison-bar'))

test('左右比較の画面と画像は同じデータ・設定・描画を共有し、画像スナップショットは選択配列を切り離す', () => {
  const document = comparison('maxHp', 'defense')
  const current = { ...settings, comparisonBand: 'rank', selectedRanks: ['rating-E', 'rating-C'] }
  const snapshot = createSnapshot(document, current)
  current.selectedRanks.push('rating-A')
  assert.deepEqual(snapshot.settings.selectedRanks, ['rating-E', 'rating-C'])
  assert.ok(Object.isFrozen(snapshot.settings.selectedRanks))
  for (const width of [600, 928]) {
    const height = getBarChartNaturalHeight(document, snapshot.settings)
    const screen = render(Plot, { document, settings: snapshot.settings, width, height })
    const frame = imageFrame(snapshot)
    const image = renderToStaticMarkup(frame.children({ width, height }))
    assert.deepEqual(rects(image), rects(screen))
    assert.equal(frame.title, document.title)
    assert.equal(frame.conditions, document.conditions)
    assert.equal(frame.naturalChartHeight, height)
    assert.ok(screen.includes('HP') && screen.includes('防御力'))
    assert.doesNotMatch(screen, /data-tooltip|tabindex|onClick|onMouse/)
    finite(screen); finite(image)
  }
})

test('全組合せの左右の棒は共通軸で同じ割合を同じ長さにし、帯3形式と複数強調を描画する', () => {
  for (const left of metrics) for (const right of metrics) for (const width of [600, 928]) {
    const document = comparison(left, right)
    for (const comparisonBand of ['cumulative', 'rank', 'none']) {
      const display = { ...settings, comparisonBand, selectedRanks: ['rating-E', 'rating-C'] }
      const height = getBarChartNaturalHeight(document, display)
      const markup = render(Plot, { document, settings: display, width, height })
      finite(markup)
      assert.equal(markerCount(markup, 'data-bar-chart-comparison-band'), comparisonBand === 'none' ? 0 : 2)
      assert.equal(markerCount(markup, 'data-bar-chart-selected'), 2)
      const values = bars(markup)
      const firstSide = values.filter(bar => bar.class.split(' ').includes('is-left'))
      const secondSide = values.filter(bar => bar.class.split(' ').includes('is-right'))
      for (const bar of values) {
        assert.ok(Number(bar.x) >= 0 && Number(bar.width) >= 0)
        assert.ok(Number(bar.x) + Number(bar.width) <= width + 1e-9)
        assert.ok(Number(bar.y) >= 0 && Number(bar.height) > 0)
        assert.ok(Number(bar.y) + Number(bar.height) <= height + 1e-9)
      }
      const scaleFor = (series, marks) => {
        const nonzero = series.bins.filter(bin => bin.share > 0)
        const positiveMarks = marks.filter(bar => Number(bar.width) > 0)
        assert.equal(positiveMarks.length, nonzero.length)
        return nonzero.map((bin, index) => Number(positiveMarks[index].width) / bin.share)
      }
      const scales = [...scaleFor(document.series[0], firstSide), ...scaleFor(document.series[1], secondSide)]
      assert.ok(scales.length > 0)
      assert.ok(scales.every(scale => Math.abs(scale - scales[0]) < 1e-8), '左右を別々の最大値で拡大しない')
      if (left === right) assert.deepEqual(firstSide.map(bar => bar.width), secondSide.map(bar => bar.width))
    }
  }
})

test('有効母数0の系列は棒も選択割合も欠損表示とし、もう一方の有効系列は残る', () => {
  const document = comparison('maxHp', 'defense', { data: { ...context.data, rows: [{ ...rows[0], stats: { maxHp: null, defense: 0 } }] } })
  const markup = render(Plot, { document, settings: { ...settings, comparisonBand: 'rank', selectedRanks: ['rating-E'] }, width: 928 })
  finite(markup)
  const values = bars(markup)
  assert.equal(values.filter(bar => bar.class.split(' ').includes('is-left')).length, 0)
  assert.ok(values.some(bar => bar.class.split(' ').includes('is-right') && Number(bar.width) > 0))
  assert.ok(markup.includes('—'))
})

test('同じ左右配置・カテゴリ名・値でも、数値区間と独立カテゴリの宣言に従って棒の間隔を変える', () => {
  const interval = comparison()
  const independent = createBarChartDocument({ ...inputOf(interval), semantics: { ...interval.semantics, itemKind: 'category' } })
  const center = bar => Number(bar.y) + Number(bar.height) / 2
  for (const height of [getBarChartNaturalHeight(interval, settings), 1000]) {
    const rendered = [interval, independent].map(document => render(Plot, { document, settings, width: 928, height }))
    const [intervalBars, independentBars] = rendered.map(bars)
    assert.equal(intervalBars.length, independentBars.length)
    assert.ok(intervalBars.length > 1)
    const rowHeight = center(intervalBars[1]) - center(intervalBars[0])
    for (const [index, bar] of intervalBars.entries()) {
      const discrete = independentBars[index]
      close(Number(bar.height), rowHeight * .96)
      close(Number(discrete.height), Math.min(48, rowHeight * .6))
      assert.equal(bar.x, discrete.x)
      assert.equal(bar.width, discrete.width, '度数・割合・共通の軸は変更しない')
      close(center(bar), center(discrete))
    }
  }
  assert.notEqual(interval.id, independent.id)
})
