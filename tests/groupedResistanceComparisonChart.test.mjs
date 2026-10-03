import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let common
let gg

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/grouped-resistance-test',
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  ;[common, gg] = await Promise.all([
    server.ssrLoadModule('/src/components/GroupedResistanceComparisonChart.tsx'),
    server.ssrLoadModule('/src/components/GoldenglowResistanceComparisonChart.tsx'),
  ])
})
after(async () => { await server?.close() })

const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const attributes = (element) => Object.fromEntries([...element.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]))
const bars = (markup) => [...markup.matchAll(/<rect\b[^>]*class="gg-resistance-chart-bar"[^>]*>/g)].map((match) => attributes(match[0]))
const near = (actual, expected) => assert.ok(Math.abs(Number(actual) - expected) < 1e-9, `${actual} != ${expected}`)

const makeGgSeries = () => [
  { id: 'y', label: 'MOD Y', moduleType: 'Y', potential: 1 },
  { id: 'none', label: '未装備', moduleType: null, potential: 1 },
  { id: 'x', label: 'MOD X', moduleType: 'X', potential: 1 },
].map((item) => ({
  ...item,
  points: [1000, 10000].flatMap((enemyHp) => [0, 30].map((enemyResistance) => ({
    enemyHp, enemyResistance, value: item.id === 'none' ? 100 : item.id === 'x' ? 80 : 90,
  }))),
}))
const ggProps = {
  enemyHps: [10000, 0, 1000, 1000], enemyResistances: [30, 0, 101],
  metric: 'total', baselineId: 'none', width: 960, height: 380,
}

test('GG wrapper preserves positive HP groups, MOD colors, depth, 42% offset and HP ranks', () => {
  const series = makeGgSeries()
  const markup = render(gg.GoldenglowResistanceComparisonChartSvg, { ...ggProps, series })
  assert.deepEqual([...markup.matchAll(/data-enemy-hp="([^"]+)"/g)].map((match) => Number(match[1])), [1000, 10000])
  const rectangles = bars(markup)
  assert.equal(rectangles.length, 12)
  assert.deepEqual(rectangles.slice(0, 3).map((rect) => rect['data-series-id']), ['none', 'x', 'y'])
  assert.deepEqual(rectangles.slice(0, 3).map((rect) => rect.fill), ['#737982', '#3f7699', '#b4763e'])
  near(rectangles[0].x, 165.19)
  near(rectangles[0].width, 22)
  near(Number(rectangles[1].x) - Number(rectangles[0].x), 22 * 0.42)
  near(rectangles[0].y, 61)
  near(rectangles[0].height, 271)
  assert.match(markup, /class="stat-rank-strip"/)
  assert.match(markup, />HPランク<\/text>/)
  assert.doesNotMatch(markup, /gg-resistance-chart-hit|<select|<figcaption|<ul/)
  assert.match(markup, /<title[^>]*>敵HP・術耐性別の総ダメージ/)

  const noRanks = render(gg.GoldenglowResistanceComparisonChartSvg, { ...ggProps, series, showHpRanks: false })
  assert.doesNotMatch(noRanks, /class="stat-rank-strip"/)
  near(bars(noRanks)[0].y, 32)
  const hidden = gg.getResistanceChartSeries(series, true, 'none')
  assert.deepEqual(hidden.map((item) => item.id), ['x', 'y'])
  assert.deepEqual(hidden.map((item) => item.style.color), ['#3f7699', '#b4763e'])
})

test('GG selected readout retains total, signed difference, percent and baseline options', () => {
  for (const [metric, displayed] of [['total', '30'], ['difference', '+30'], ['percent', '+30%']]) {
    const series = makeGgSeries().map((item) => ({
      ...item, points: item.points.map((point) => ({ ...point, value: item.id === 'x' ? -20 : 30 })),
    }))
    const markup = render(gg.GoldenglowResistanceComparisonChart, {
      ...ggProps, series, metric, selectedHp: 1000, selectedResistance: 30,
      onSelectPoint: () => {}, stale: true, gridStyle: 'dashed',
    })
    assert.match(markup, /gg-resistance-chart--stale/)
    assert.match(markup, /ggs-hp-chart-grid--dashed/)
    assert.match(markup, /aria-label="HP・術耐性比較グラフ"/)
    assert.match(markup, /aria-pressed="true"/)
    assert.ok(markup.includes(`>${displayed}</strong>`))
    assert.equal(bars(markup).filter((rect) => rect['data-series-id'] === 'x').length, metric === 'total' ? 0 : 4)
    if (metric !== 'total') assert.match(markup, /未装備（基準）/)
    const hidden = render(gg.GoldenglowResistanceComparisonChartSvg, { ...ggProps, series, metric, hideBaseline: true })
    assert.ok(bars(hidden).every((rect) => rect['data-series-id'] !== 'none'))
  }
})

test('CT 0 and exact decimals retain group/resistance coordinates; null is distinct from zero', () => {
  const endpoint = 1.1574074074074074
  const series = [{ id: 'x', label: 'MOD X', moduleType: 'X', color: '#123456', points: [
    { groupValue: 0, resistance: 0, value: 0 },
    { groupValue: 0, resistance: 30, value: 100 },
    { groupValue: 0.1, resistance: 0, value: 50 },
    { groupValue: 0.1, resistance: 30, value: 60 },
    { groupValue: endpoint, resistance: 0, value: 10 },
    { groupValue: endpoint, resistance: 30, value: null },
  ] }]
  const props = {
    series, groupValues: [endpoint, 0.1, 0, 0.1, -1, NaN], resistanceValues: [30, 0, 101, -1],
    groupAxis: { label: '残りCT', formatValue: (ct) => ct.toFixed(2), dataAttribute: 'data-ct' },
    metric: 'total', baselineId: '', selectedGroup: 0, selectedResistance: 0, onSelectPoint: () => {},
    showMissingValues: true, missingValueLabel: '—（範囲外）',
  }
  const markup = render(common.GroupedResistanceComparisonChart, props)
  assert.deepEqual([...markup.matchAll(/data-group-value="([^"]+)"/g)].map((match) => Number(match[1])), [0, 0.1, endpoint])
  const rectangles = bars(markup)
  assert.equal(rectangles.length, 5)
  assert.ok(rectangles.every((rect) => rect.fill === '#123456'))
  assert.equal(rectangles[0]['data-value'], '0')
  assert.equal(rectangles[0].height, '0')
  assert.equal((markup.match(/data-missing="true"/g) ?? []).length, 1)
  assert.match(markup, /残りCT 0\.00・術耐性 0・MOD X 0/)
  assert.match(markup, /残りCT 1\.16・術耐性 30・MOD X —（範囲外）/)
  assert.match(markup, /value="0" selected=""/)
  assert.match(markup, /value="0\.1">0\.10<\/option>/)
  assert.match(markup, /value="1\.1574074074074074">1\.16<\/option>/)
  assert.match(markup, /aria-pressed="true"/)
  assert.doesNotMatch(markup, /stat-rank-strip/)

  const withoutMarkers = render(common.GroupedResistanceComparisonChart, { ...props, showMissingValues: false })
  assert.doesNotMatch(withoutMarkers, /data-missing="true"/)
  const externalReadout = render(common.GroupedResistanceComparisonChart, { ...props, showLegend: false, showReadout: false })
  assert.doesNotMatch(externalReadout, /<ul|<figcaption|<select/)
  assert.match(externalReadout, /gg-resistance-chart-hit/)
  const image = render(common.GroupedResistanceComparisonChartSvg, { ...props, width: 960, height: 380 })
  assert.doesNotMatch(image, /gg-resistance-chart-hit|<ul|<figcaption|<select|棒の下の数字/)
  assert.equal((image.match(/data-missing="true"/g) ?? []).length, 1)
  assert.equal(bars(image).length, 5)
})

test('shared order helper preserves provided colors and stable order within the same MOD', () => {
  const series = [
    { id: 'y', moduleType: 'Y', color: 'y' },
    { id: 'x2', moduleType: 'X', color: 'x2' },
    { id: 'none', moduleType: null, color: 'none' },
    { id: 'x1', moduleType: 'X', color: 'x1' },
  ]
  const ordered = common.getGroupedResistanceChartSeries(series)
  assert.deepEqual(ordered.map((item) => item.id), ['none', 'x2', 'x1', 'y'])
  assert.deepEqual(ordered.map((item) => item.color), ['none', 'x2', 'x1', 'y'])
  assert.deepEqual(common.getGroupedResistanceChartSeries(series, true, 'x2').map((item) => item.id), ['none', 'x1', 'y'])
  assert.deepEqual(series.map((item) => item.id), ['y', 'x2', 'none', 'x1'])
})
