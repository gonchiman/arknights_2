import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { getModuleComparisonColors } from '../src/lib/moduleColors.ts'

let server
let charts
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-total-damage-chart-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  charts = await server.ssrLoadModule('/src/components/SurtrTotalDamageChart.tsx')
})
after(async () => { await server?.close() })

const stages = [
  { id: 'none', label: '未装備', moduleType: null },
  { id: 'X1', label: 'MOD X Lv.1', moduleType: 'X', moduleLevel: 1, dashArray: '7 4' },
  { id: 'X3', label: 'MOD X Lv.3', moduleType: 'X', moduleLevel: 3, dashArray: '2 3' },
  { id: 'Y3', label: 'MOD Y Lv.3', moduleType: 'Y', moduleLevel: 3 },
]
const colors = getModuleComparisonColors(stages, { shadeBy: 'moduleLevel' })
const series = stages.map((stage, index) => ({ ...stage, color: colors[index],
  points: [10, 12, 30].map((x, pointIndex) => ({ x, value: 10000 + index * 157 + pointIndex * 2300 })),
}))
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(match => match[0])
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const bars = markup => tags(markup, 'rect').filter(tag => attr(tag, 'class') === 'surtr-dps-chart-bar')
const paths = markup => tags(markup, 'path').filter(tag => attr(tag, 'class') === 'surtr-dps-chart-line')
const marks = markup => tags(markup, 'circle').filter(tag => attr(tag, 'data-chart-image-ink') !== undefined)
const axis = markup => {
  const tag = tags(markup, 'path').find(tag => attr(tag, 'data-chart-image-plot-area') !== undefined)
  const [left, top, bottom, right] = attr(tag, 'd').match(/[-\d.]+/g).map(Number)
  return { left, top, bottom, right }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)
const noInvalidGeometry = markup => assert.doesNotMatch(markup, /NaN|Infinity|undefined/)

test('screen and image retain every bar value, stage color and comparison order', () => {
  const captured = structuredClone(series)
  const expected = series.flatMap(item => item.points.map(point => ({ id: item.id, time: point.x, value: point.value, color: item.color })))
  for (const component of [charts.SurtrTotalDamageChart, charts.SurtrTotalDamageChartImage, charts.SurtrTotalDamageChartImagePreview]) {
    for (const aspectRatio of [undefined, 16 / 9]) {
      const markup = render(component, { series, kind: 'bar', conditions: '特化3・術耐性60', aspectRatio, precision: 1, showValues: true })
      assert.deepEqual(bars(markup).map(tag => ({ id: attr(tag, 'data-series-id'), time: Number(attr(tag, 'data-time')),
        value: Number(attr(tag, 'data-value')), color: attr(tag, 'fill') })), expected)
      for (const item of series) assert.ok(markup.includes(item.label))
      assert.match(markup, /素質２発動までの時間（秒）/)
      assert.doesNotMatch(markup, /術耐性ランク|data-resistance-ranks/)
      noInvalidGeometry(markup)
    }
  }
  assert.deepEqual(series, captured)
  assert.notEqual(colors[1], colors[2], 'MOD X levels use separate shared shades')
})

test('line time positions are numeric while grouped bars use equal category spacing', () => {
  const one = [series[0]]
  for (const component of [charts.SurtrTotalDamageChart, charts.SurtrTotalDamageChartImage]) {
    const lineMarkup = render(component, { series: one, kind: 'line', conditions: '' })
    const lineAxis = axis(lineMarkup)
    const linePoints = marks(lineMarkup).map(tag => Number(attr(tag, 'cx')))
    near(linePoints[0], lineAxis.left)
    near(linePoints[1], lineAxis.left + (lineAxis.right - lineAxis.left) * 0.1)
    near(linePoints[2], lineAxis.right)
    const barMarkup = render(component, { series: one, kind: 'bar', conditions: '' })
    const barCenters = bars(barMarkup).map(tag => Number(attr(tag, 'x')) + Number(attr(tag, 'width')) / 2)
    near(barCenters[1] - barCenters[0], barCenters[2] - barCenters[1])
  }
})

test('line and image legends preserve supplied color and dash patterns for each stage', () => {
  for (const component of [charts.SurtrTotalDamageChart, charts.SurtrTotalDamageChartImage, charts.SurtrTotalDamageChartImagePreview]) {
    const markup = render(component, { series, kind: 'line', conditions: '術耐性60' })
    assert.deepEqual(paths(markup).map(tag => ({ color: attr(tag, 'stroke'), dashArray: attr(tag, 'stroke-dasharray') })),
      series.map(item => ({ color: item.color, dashArray: item.dashArray })))
    for (const item of series) {
      const swatch = tags(markup, 'line').find(tag => attr(tag, 'stroke') === item.color
        && attr(tag, 'x1') === '0' && attr(tag, 'x2') === '18')
      assert.ok(swatch, `${item.label} legend`)
      assert.equal(attr(swatch, 'stroke-dasharray'), item.dashArray)
      for (const point of item.points) {
        const formatted = new Intl.NumberFormat('ja-JP').format(point.value)
        assert.ok(markup.includes(`${item.label}・${point.x}秒・${formatted}`), `${item.label} exact point tooltip`)
      }
    }
    noInvalidGeometry(markup)
  }
})

test('a single time has a visible centered marker and its actual time instead of a resistance domain', () => {
  const singleton = [{ ...series[0], points: [{ x: 25, value: 14500 }] }]
  for (const component of [charts.SurtrTotalDamageChart, charts.SurtrTotalDamageChartImage]) {
    const markup = render(component, { series: singleton, conditions: '', kind: 'line' })
    const bounds = axis(markup)
    const [marker] = marks(markup)
    assert.ok(Number(attr(marker, 'r')) > 0)
    near(Number(attr(marker, 'cx')), (bounds.left + bounds.right) / 2)
    assert.match(markup, />25<\/text>/)
    assert.match(markup, /25秒・14,500/)
    assert.doesNotMatch(markup, /術耐性ランク/)
    noInvalidGeometry(markup)
  }
})

test('dense grouped snapshots contain every requested bar even when time tick labels are thinned', () => {
  const dense = series.map((item, index) => ({ ...item,
    points: Array.from({ length: 201 }, (_, time) => ({ x: time / 10, value: 20000 + time * 10 + index })),
  }))
  for (const component of [charts.SurtrTotalDamageChart, charts.SurtrTotalDamageChartImage]) {
    const markup = render(component, { series: dense, conditions: '', kind: 'bar' })
    assert.equal(bars(markup).length, 804)
    assert.deepEqual([...new Set(bars(markup).map(tag => Number(attr(tag, 'data-time'))))], dense[0].points.map(point => point.x))
    assert.doesNotMatch(markup, /術耐性ランク|data-resistance-ranks/)
    noInvalidGeometry(markup)
  }
})

test('invalid points remain missing and duplicate times do not create duplicate bars or mutate the snapshot', () => {
  const bad = [{ ...series[0], points: [{ x: Number.NaN, value: 100 }, { x: -2, value: 200 },
    { x: 25, value: 10 }, { x: 25, value: 20 }, { x: 30, value: Number.POSITIVE_INFINITY }, { x: 35, value: -2 }] }]
  const markup = render(charts.SurtrTotalDamageChartImage, { series: bad, conditions: '', kind: 'bar' })
  assert.equal(bars(markup).length, 1)
  assert.equal(Number(attr(bars(markup)[0], 'data-time')), 25)
  assert.equal(Number(attr(bars(markup)[0], 'data-value')), 20)
  assert.equal(bad[0].points.length, 6)
  noInvalidGeometry(markup)
  const empty = render(charts.SurtrTotalDamageChartImage, { series: [], conditions: '', kind: 'line' })
  assert.match(empty, /表示できる計算結果がありません/)
  noInvalidGeometry(empty)
})

test('edited image text reaches frame, axes, legend and preview without changing comparison data', () => {
  const labels = { title: 'S3の総ダメージ比較', xAxis: '余燼が発動する時刻', yAxis: '累計ダメージ', series: { X1: 'X 第１段階' } }
  const captured = structuredClone(series)
  for (const component of [charts.SurtrTotalDamageChartImage, charts.SurtrTotalDamageChartImagePreview]) {
    for (const kind of ['line', 'bar']) {
      const original = render(component, { series, conditions: '特化3・未ブロック', kind })
      const edited = render(component, { series, conditions: '特化3・未ブロック', kind, labels })
      for (const text of [labels.title, labels.xAxis, labels.yAxis, labels.series.X1, '特化3・未ブロック']) {
        assert.ok(edited.includes(text), `${component.name}: ${text}`)
      }
      assert.ok(edited.includes(`<title>${labels.title}</title>`))
      assert.doesNotMatch(edited, /MOD X Lv\.1/)
      assert.deepEqual(kind === 'bar' ? bars(edited) : paths(edited), kind === 'bar' ? bars(original) : paths(original))
      const reset = render(component, { series, conditions: '特化3・未ブロック', kind,
        labels: { title: ' ', xAxis: '', yAxis: '\n', series: { X1: '' } } })
      assert.equal(reset, original)
    }
  }
  assert.deepEqual(series, captured)
})
