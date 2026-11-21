import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import {
  createBarChartDocument, getBarChartComparisonAxis, getBarChartComparisonBand,
  getBarChartComparisonValue, getBarChartFilename, getBarChartSelectionSummary,
} from '../src/lib/barChartDocument.ts'
import { createBarChartFromProvider } from '../src/lib/barChartProviders.ts'
import { getBarChartItemKind } from '../src/lib/barChartPresentation.ts'
import { getBarChartNaturalHeight } from '../src/lib/barChartLayout.ts'
import { buildStandardizedEnemyRankBandStatistics } from '../src/lib/enemyRankBandStatistics.ts'
import { ENEMY_RANK_BAND_STATISTIC_LABELS } from '../src/lib/enemyRankBandStatisticsDisplay.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import { getStatMetricColor } from '../src/lib/statMetricColors.ts'

const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const enemy = (id, defense, magicResistance) => ({ id, stats: { defense, magicResistance } })
const rows = [enemy('a', 600, 50), enemy('b', 600, 20), enemy('c', 300, 20), enemy('d', 0, 0),
  enemy('missingDefense', null, 90), enemy('missingResistance', 9000, null)]
const weights = [3.5, 2.5, 2.25, 1.75, 20, 30]
const counts = { schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(({ id }, index) => [id, { mapCount: 1, spawnCount: weights[index] }])) }
const context = { data: { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }, version, scope: 'main' }
const settings = { values: true, axisBand: true, percent: true, cumulative: true, cumulativeBand: true }
const documentFor = (rankBandStep = 10, extra = {}) => createBarChartFromProvider('enemy-rank-band-statistics', {
  ...context, rankBandStep, ...extra,
})
const inputOf = document => Object.fromEntries([
  'xKind', 'bins', 'layout', 'series', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source',
].map(key => [key, document[key]]))
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)

const metrics = ['min', 'max', 'width', 'mean', 'standardDeviation', 'variance']

test('順位帯の統計を提供元として、同じ表の最小・最大・幅・平均・標準偏差・分散を選ぶ', () => {
  const ids = new Set(), filenames = new Set()
  for (const rankBandMetric of metrics) for (const step of [5, 10, 20]) {
    const document = documentFor(step, { rankBandMetric })
    const expected = buildStandardizedEnemyRankBandStatistics(rows, counts, step)
    const label = ENEMY_RANK_BAND_STATISTIC_LABELS[rankBandMetric]
    assert.equal(document.source.providerId, 'enemy-rank-band-statistics')
    assert.equal(document.semantics.comparisonValue, 'value')
    assert.equal(document.title, `防御力・術耐性の順位帯別${label}`)
    assert.ok(document.xAxisTitle.startsWith(label))
    assert.ok(document.xAxisTitle.includes('標準化'))
    for (const [index, key] of ['defense', 'resistance'].entries()) {
      assert.deepEqual(document.series[index].bins.map(bin => bin.value), expected.bands.map(band => band[key]?.[rankBandMetric] ?? null))
      assert.ok(document.series[index].bins.every(bin => !('share' in bin) && !('cumulativeShare' in bin)))
    }
    assert.equal(getBarChartSelectionSummary(document, document.bins.map(bin => bin.id)), null)
    assert.equal(document.capabilities.percentages, false)
    assert.equal(document.capabilities.cumulative, false)
    const filename = getBarChartFilename(document, settings, 16 / 9)
    assert.ok(filename.includes(label))
    assert.ok(filename.includes('標準化'))
    assert.doesNotMatch(filename, /割合|累積|合計/)
    ids.add(document.id); filenames.add(filename)
  }
  assert.equal(ids.size, 18, '統計量・刻みの全組み合わせを別の固定データとして識別する')
  assert.equal(filenames.size, 18, '統計量・刻みの保存ファイル名を混同しない')
  assert.deepEqual(documentFor(), documentFor(10, { rankBandMetric: 'standardDeviation' }))
  for (const rankBandMetric of ['minimum', 'sum', '']) assert.throws(() => documentFor(10, { rankBandMetric }))
})

test('5・10・20ポイントで既存の全体基準の標準化を使い、共通有効集合を保持する', () => {
  const captured = JSON.stringify(context)
  for (const step of [5, 10, 20]) {
    const document = documentFor(step)
    const expected = buildStandardizedEnemyRankBandStatistics(rows, counts, step)
    assert.equal(document.layout, 'mirrored')
    assert.equal(document.xKind, 'category')
    assert.equal(getBarChartItemKind(document), 'interval')
    assert.equal(document.semantics.comparisonValue, 'value')
    assert.equal(document.semantics.comparisonLabel, '順位帯別標準偏差')
    assert.equal(document.xAxisTitle, '標準偏差（標準化）')
    assert.equal(document.yAxisTitle, 'ステータス順位帯')
    assert.equal(document.bins.length, 100 / step)
    assert.deepEqual(document.bins.map(bin => bin.id), expected.bands.map(band => `rank-band-${band.from}-${band.to}`))
    assert.deepEqual(document.series.map(series => [series.id, series.metricKey]), [['left', 'defense'], ['right', 'magicResistance']])
    for (const [index, key] of ['defense', 'resistance'].entries()) {
      const series = document.series[index]
      assert.equal(series.population.valid, 10)
      assert.equal(series.population.missing, 50)
      assert.equal(series.population.total, 60)
      assert.equal(series.population.basis, 'paired-stats')
      assert.deepEqual(series.bins.map(bin => bin.value), expected.bands.map(band => band[key]?.standardDeviation ?? null))
      assert.ok(series.bins.every(bin => !('share' in bin) && !('cumulativeShare' in bin)), '標準偏差を割合へ正規化しない')
    }
    assert.equal(document.capabilities.percentages, false)
    assert.equal(document.capabilities.cumulative, false)
    assert.ok(document.conditions.includes('両方が有効'))
    assert.match(document.conditions, /出現回数 10体/)
    assert.doesNotMatch(document.conditions, /左 防御力|右 術耐性/)
    assert.equal(JSON.stringify(context), captured)
  }
  assert.deepEqual(documentFor(), createBarChartFromProvider('enemy-rank-band-statistics', context))
  for (const step of [0, 7, 50, '10', NaN]) assert.throws(() => documentFor(step))
  for (const countMode of ['TYPES', 'MAPS']) assert.throws(() => documentFor(10, { countMode }), /出現回数/)
})

test('棒と共通軸は標準偏差の実値を使い、割合設定を持ち越しても割合・累積割合・加算合計を作らない', () => {
  const document = documentFor(20)
  for (const series of document.series) for (const bin of series.bins) {
    assert.equal(getBarChartComparisonValue(document, bin), bin.value)
  }
  const maximum = Math.max(...document.series.flatMap(series => series.bins.map(bin => bin.value ?? 0)))
  const axis = getBarChartComparisonAxis(document)
  assert.ok(axis.maximum >= maximum && axis.maximum < 10, '割合の100倍軸へ変えない')
  for (const comparisonBand of [undefined, 'cumulative', 'rank', 'value']) {
    assert.equal(getBarChartComparisonBand({ ...settings, comparisonBand }, document), 'value')
  }
  assert.equal(getBarChartComparisonBand({ ...settings, comparisonBand: 'none' }, document), 'none')
  assert.equal(getBarChartSelectionSummary(document, [document.bins[0].id, document.bins[1].id]), null, '標準偏差を足して合計値にしない')
  const rating = createBarChartFromProvider('enemy-stat-rating-comparison', context)
  assert.equal(getBarChartComparisonValue(rating, rating.series[0].bins[0]), rating.series[0].bins[0].share * 100)
  assert.equal(getBarChartComparisonBand(settings, rating), 'cumulative')
})

test('定数系列の標準化不能と帯内標準偏差0を区別し、空データにも有限の描画軸を作る', () => {
  const selectedRows = [enemy('a', 5, 10), enemy('b', 5, 30), enemy('missingDefense', null, 90)]
  const document = documentFor(10, { data: { ...context.data, rows: selectedRows } })
  assert.ok(document.series[0].bins.every(bin => bin.value === null))
  assert.ok(document.series[1].bins.some(bin => bin.value === 0))
  assert.ok(document.series[1].bins.every(bin => bin.value !== null))
  assert.equal(getBarChartComparisonValue(document, document.series[0].bins[0]), null)
  assert.equal(getBarChartComparisonValue(document, document.series[1].bins.find(bin => bin.value === 0)), 0)
  const empty = documentFor(10, { data: { ...context.data, rows: [] } })
  assert.deepEqual(empty.bins, [])
  assert.ok(empty.series.every(series => series.population.valid === 0 && series.bins.length === 0))
  assert.ok(Number.isFinite(getBarChartComparisonAxis(empty).maximum))
  for (const rankBandMetric of metrics) {
    const constant = documentFor(10, { rankBandMetric, data: { ...context.data, rows: selectedRows } })
    assert.ok(constant.series[0].bins.every(bin => bin.value === null), `${rankBandMetric}: 標準化不能を0にしない`)
    assert.ok(constant.series[1].bins.every(bin => bin.value !== null), `${rankBandMetric}: 他方の有効値を残す`)
  }
})

test('標準化した最小・最大・平均の負値を保ち、両系列で共通の符号付き軸を使う', () => {
  for (const rankBandMetric of ['min', 'max', 'mean']) {
    const document = documentFor(20, { rankBandMetric })
    const values = document.series.flatMap(series => series.bins.map(bin => bin.value).filter(value => value !== null))
    assert.ok(values.some(value => value < 0), `${rankBandMetric}: 平均を下回る値を保持する`)
    assert.ok(values.some(value => value > 0), `${rankBandMetric}: 平均を上回る値を保持する`)
    for (const series of document.series) for (const bin of series.bins) assert.equal(getBarChartComparisonValue(document, bin), bin.value)
    const axis = getBarChartComparisonAxis(document)
    assert.ok(axis.minimum <= Math.min(...values) && axis.maximum >= Math.max(...values))
    assert.ok(axis.minimum < 0 && axis.maximum > 0 && axis.ticks.includes(0))
    assert.ok(axis.ticks.some(value => value < 0), '負の目盛りを持つ')
    assert.equal(getBarChartSelectionSummary(document, document.bins.map(bin => bin.id)), null)
    const detached = inputOf(document)
    assert.doesNotThrow(() => createBarChartDocument(detached))
    for (const value of [NaN, Infinity, -Infinity]) {
      const invalid = structuredClone(detached)
      invalid.series[0].bins[0].value = value
      assert.throws(() => createBarChartDocument(invalid))
    }
  }
  const ratio = createBarChartFromProvider('enemy-stat-rating-comparison', context)
  const invalidRatio = inputOf(ratio)
  invalidRatio.series = structuredClone(invalidRatio.series)
  invalidRatio.series[0].bins[0].value = -1
  assert.throws(() => createBarChartDocument(invalidRatio), '負の値を許容するのは値の比較であり、度数には持ち込まない')
})

test('スナップショットは順位帯幅・実値方式・標準偏差を固定し、保存名は範囲と刻みと強調を区別する', () => {
  const mutable = structuredClone(context)
  const document = documentFor(10, mutable)
  const captured = JSON.stringify(document)
  mutable.data.rows[0].stats.defense = 999999
  mutable.data.counts.enemies.a.spawnCount = 99
  assert.equal(JSON.stringify(document), captured)
  assert.deepEqual(JSON.parse(captured), document)
  assert.ok(Object.isFrozen(document.series[0].bins[0]) && Object.isFrozen(document.semantics))
  const filename = getBarChartFilename(document, settings, 16 / 9)
  assert.ok(filename.includes('標準偏差') && filename.includes('標準化') && filename.includes('10'))
  assert.match(filename, /メインストーリー/)
  assert.match(filename, /比率16x9\.png$/)
  assert.doesNotMatch(filename, /割合|累積|合計/)
  assert.notEqual(filename, getBarChartFilename(documentFor(5), settings, 16 / 9))
  assert.notEqual(filename, getBarChartFilename(documentFor(20), settings, 16 / 9))
  assert.notEqual(filename, getBarChartFilename(document, { ...settings, selectedRanks: [document.bins[0].id] }, 16 / 9))
  assert.notEqual(filename, getBarChartFilename(document, { ...settings, comparisonBand: 'none' }, 16 / 9))
  assert.equal(filename, getBarChartFilename(document, { ...settings, percent: false, cumulative: false, cumulativeBand: false }, 16 / 9))
  assert.throws(() => createBarChartDocument({ ...inputOf(document), semantics: { ...document.semantics, comparisonValue: 'unknown' } }))
})

test('v12の全体と本編の6統計量を既存表へ一致させ、標準偏差の先頭は1.92と0.56へ丸まる', async () => {
  const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1), folder))) })
  const { versions } = await client.loadIndex()
  const version = versions.find(item => item.id === 'v12')
  const data = await client.loadVersion(version)
  for (const scope of ['all', 'main']) for (const step of [5, 10, 20]) for (const rankBandMetric of metrics) {
    const document = createBarChartFromProvider('enemy-rank-band-statistics', { data, version, scope, rankBandStep: step, rankBandMetric })
    const scoped = scope === 'main' ? getEnemyMainStoryScope(data) : data
    const expected = buildStandardizedEnemyRankBandStatistics(scoped.rows, scoped.counts, step)
    assert.equal(document.source.aggregationScope, scope)
    assert.equal(document.series[0].population.valid, expected.total)
    for (const [index, key] of ['defense', 'resistance'].entries()) {
      assert.deepEqual(document.series[index].bins.map(bin => bin.value), expected.bands.map(band => band[key]?.[rankBandMetric] ?? null))
    }
    if (scope === 'all' && step === 10 && rankBandMetric === 'standardDeviation') {
      assert.equal(document.series[0].bins[0].value.toFixed(2), '1.92')
      assert.equal(document.series[1].bins[0].value.toFixed(2), '0.56')
    }
  }
})

let server, Plot, createSnapshot, imageFrame, LegacyRankPlot
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/bar-chart-rank-statistics-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ BarChartPlot: Plot } = await server.ssrLoadModule('/src/components/BarChartPlot.tsx'))
  ;({ createBarChartImageSnapshot: createSnapshot, getBarChartImageFrame: imageFrame }
    = await server.ssrLoadModule('/src/components/BarChartImageDialog.tsx'))
  ;({ EnemyRankBandStatisticsPlot: LegacyRankPlot }
    = await server.ssrLoadModule('/src/components/EnemyRankBandStatisticsPlot.tsx'))
})
after(async () => { await server?.close() })
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const rects = markup => [...markup.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attributes(tag))
const bars = markup => rects(markup).filter(tag => tag.class?.split(' ').includes('bar-chart-comparison-bar'))
const finite = markup => assert.doesNotMatch(markup, /(?:x|y|width|height|points|transform)="[^"]*(?:NaN|Infinity|undefined)/)
const markerCount = (markup, name) => [...markup.matchAll(new RegExp(`\\b${name}="`, 'g'))].length

test('画面とPNGは同じ標準偏差・固定色・共通軸を使い、値帯に%を付けず選択行だけを強調する', () => {
  for (const step of [5, 10, 20]) for (const width of [620, 928]) {
    const document = documentFor(step)
    const display = { ...settings, selectedRanks: [document.bins[0].id, document.bins[1].id] }
    const snapshot = createSnapshot(document, display)
    display.selectedRanks.push(document.bins[2].id)
    assert.equal(snapshot.settings.selectedRanks.length, 2)
    const height = getBarChartNaturalHeight(document, snapshot.settings)
    const screen = render(Plot, { document, settings: snapshot.settings, width, height })
    const frame = imageFrame(snapshot)
    const image = renderToStaticMarkup(frame.children({ width, height }))
    assert.deepEqual(rects(image), rects(screen))
    assert.equal(markerCount(screen, 'data-bar-chart-selected'), 2)
    assert.equal(markerCount(screen, 'data-bar-chart-comparison-band'), 2)
    assert.match(screen, /data-bar-chart-comparison-band="value"/)
    assert.doesNotMatch(screen, /選択合計|data-bar-chart-selection-summary|累積割合|階級割合/)
    assert.doesNotMatch(document.xAxisTitle, /%/)
    const valueBands = [...screen.matchAll(/<g\b[^>]*data-bar-chart-comparison-band="value"[^>]*>(.*?)<\/g>/g)]
    assert.equal(valueBands.length, 2)
    assert.ok(valueBands.every(([, content]) => !content.includes('%')), '順位帯の%表記と標準偏差の実値を混同しない')
    assert.ok(screen.includes(getStatMetricColor('defense')) && screen.includes(getStatMetricColor('magicResistance')))
    finite(screen); finite(image)
    assert.ok(bars(screen).every(bar => Number(bar.x) >= 0 && Number(bar.x) + Number(bar.width) <= width + 1e-9))
    assert.equal(frame.title, document.title)
    assert.equal(frame.conditions, document.conditions)
    const hidden = render(Plot, { document, settings: { ...snapshot.settings, comparisonBand: 'none' }, width, height })
    assert.equal(markerCount(hidden, 'data-bar-chart-comparison-band'), 0)
    assert.deepEqual(bars(hidden).map(bar => Number(bar.height)), bars(screen).map(bar => Number(bar.height)))
  }
})

test('標準化した最小・最大・平均を画面とPNGで同じ符号のまま描き、負の棒幅を生成しない', () => {
  for (const rankBandMetric of ['min', 'max', 'mean']) for (const width of [620, 928]) {
    const document = documentFor(10, { rankBandMetric })
    const snapshot = createSnapshot(document, settings)
    const height = getBarChartNaturalHeight(document, settings)
    const screen = render(Plot, { document, settings, width, height })
    const frame = imageFrame(snapshot)
    const image = renderToStaticMarkup(frame.children({ width, height }))
    finite(screen); finite(image)
    assert.deepEqual(rects(image), rects(screen))
    assert.doesNotMatch(screen, /選択合計|data-bar-chart-selection-summary|累積割合|階級割合/)
    assert.ok(bars(screen).every(bar => Number(bar.width) >= 0 && Number(bar.height) >= 0))
    assert.ok(bars(screen).every(bar => Number(bar.x) >= 0 && Number(bar.x) + Number(bar.width) <= width + 1e-9))
    const zeroLines = [...screen.matchAll(/<line\b[^>]*>/g)].map(([tag]) => attributes(tag))
      .filter(line => line.class?.split(' ').includes('is-zero'))
    assert.equal(zeroLines.length, 2, '各系列に0の基準線がある')
    const groups = [...screen.matchAll(/<g\b(?=[^>]*data-bar-chart-series=)[^>]*>.*?<\/g>/g)]
      .map(([tag]) => ({ group: attributes(tag.slice(0, tag.indexOf('>') + 1)), bar: rects(tag)[0] }))
    for (const [index, series] of document.series.entries()) {
      const seriesGroups = groups.filter(({ group }) => group['data-bar-chart-series'] === series.id)
      assert.equal(seriesGroups.length, document.bins.length)
      const zeroX = Number(zeroLines[index].x1)
      const direction = series.id === 'left' ? -1 : 1
      for (const [binIndex, { group, bar }] of seriesGroups.entries()) {
        const expected = series.bins[binIndex].value
        assert.equal(Number(group['data-bar-chart-measure']), expected, '負値も元の値のまま受け渡す')
        assert.ok(bar, '有限の負値を欠損扱いにして棒を省略しない')
        const start = Number(bar.x), end = start + Number(bar.width)
        close(Math.min(Math.abs(start - zeroX), Math.abs(end - zeroX)), 0)
        if (expected !== 0) {
          const endpoint = Math.abs(start - zeroX) > Math.abs(end - zeroX) ? start : end
          assert.equal(Math.sign(endpoint - zeroX), Math.sign(expected) * direction)
        }
      }
    }
    const valueBands = [...screen.matchAll(/<g\b[^>]*data-bar-chart-comparison-band="value"[^>]*>(.*?)<\/g>/g)]
    assert.ok(valueBands.every(([, content]) => !content.includes('%')))
    assert.ok(valueBands.some(([, content]) => content.includes('-')), '数値帯も負号を保持する')
  }
})

test('標準化不能はダッシュ、帯内標準偏差0は幅0で区別し、空データでも割合へ戻さない', () => {
  const data = { ...context.data, rows: [enemy('a', 5, 10), enemy('b', 5, 30)] }
  const document = documentFor(10, { data })
  const markup = render(Plot, { document, settings, width: 928 })
  const marks = bars(markup)
  assert.equal(marks.filter(mark => mark.class.split(' ').includes('is-left')).length, 0)
  assert.ok(marks.some(mark => mark.class.split(' ').includes('is-right') && Number(mark.width) === 0))
  assert.ok(markup.includes('—'))
  finite(markup)
  const empty = documentFor(10, { data: { ...data, rows: [] } })
  const emptyMarkup = render(Plot, { document: empty, settings, width: 620 })
  finite(emptyMarkup)
  assert.equal(bars(emptyMarkup).length, 0)
  assert.doesNotMatch(emptyMarkup, /%|選択合計/)
})

test('既存の順位帯統計グラフも共有CSSの固定色に依存せず、防御力と術耐性の色・値を画面と画像で保つ', () => {
  const { bands } = buildStandardizedEnemyRankBandStatistics(rows, counts)
  for (const imageMode of [false, true]) {
    const markup = render(LegacyRankPlot, { bands, metric: 'standardDeviation', width: 928, imageMode })
    const groups = [...markup.matchAll(/<g\b[^>]*>/g)].map(([tag]) => attributes(tag))
      .filter(tag => tag.class?.split(' ').includes('enemy-rating-comparison-series'))
    assert.equal(groups.length, 2)
    for (const [index, metric] of ['defense', 'magicResistance'].entries()) {
      assert.ok(groups[index].class.split(' ').includes(metric))
      assert.equal(groups[index].style, `color:${getStatMetricColor(metric)}`)
    }
    const marks = rects(markup).filter(tag => tag.class === 'enemy-rank-band-statistics-bar')
    for (const metric of ['defense', 'resistance']) {
      assert.deepEqual(marks.filter(tag => tag['data-rank-band-series'] === metric).map(tag => Number(tag['data-rank-band-statistic'])),
        bands.map(band => band[metric].standardDeviation))
    }
    assert.ok(marks.every(tag => tag['fill-opacity'] === '1'))
    finite(markup)
  }
})
