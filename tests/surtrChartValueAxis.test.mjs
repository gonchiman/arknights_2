import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let charts

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-value-axis-test',
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  charts = await server.ssrLoadModule('/src/components/SurtrDpsChart.tsx')
})
after(async () => { await server?.close() })

const series = [{
  id: 'none', label: '未装備', color: '#737982',
  points: [0, 20, 40, 60, 80, 100].map(x => ({ x, value: 10000 - x * 90 })),
}]
const render = (component, props) => renderToStaticMarkup(createElement(component, { series, ...props }))
const axisLabel = (markup) => markup.match(/<text class="surtr-dps-chart-axis-title"[^>]*>([^<]*)<\/text>/)?.[1]
const plotMarks = (markup) => [...markup.matchAll(/<(?:rect|path) class="surtr-dps-chart-(?:bar|line)"[^>]*>/g)].map(match => match[0])
const customTitle = '余燼中の総ダメージ期待値'
const customLabel = '総ダメージ期待値'

test('screen, PNG and snapshot plots preserve all existing DPS metric axis names', () => {
  const components = [
    [charts.SurtrDpsChart, {}],
    [charts.SurtrDpsChartImage, { conditions: '潜在1' }],
    [charts.SurtrDpsSnapshotPlot, { width: 928, height: 334 }],
  ]
  for (const [component, props] of components) {
    for (const kind of ['bar', 'line']) {
      for (const [metric, label] of [['total', 'DPS'], ['difference', 'DPS差分'], ['percent', '増減率（%）']]) {
        const markup = render(component, { ...props, kind, metric })
        assert.equal(axisLabel(markup), label, `${component.name}/${kind}/${metric}`)
        assert.match(markup, /<title>スルト S3 DPS<\/title>/)
        assert.ok(plotMarks(markup).length > 0)
      }
    }
  }
})

test('custom value axis and title reach screen, PNG, snapshot and save preview for both chart kinds', () => {
  const components = [
    [charts.SurtrDpsChart, {}],
    [charts.SurtrDpsChartImage, { conditions: '潜在1・非ブロック', aspectRatio: 16 / 9 }],
    [charts.SurtrDpsSnapshotPlot, { width: 960, height: 334 }],
    [charts.SurtrDpsChartImagePreview, { conditions: '潜在1・非ブロック', aspectRatio: 16 / 9 }],
  ]
  for (const [component, props] of components) {
    for (const kind of ['bar', 'line']) {
      const ordinary = render(component, { ...props, kind })
      const custom = render(component, { ...props, kind, title: customTitle, valueAxisLabel: customLabel })
      assert.equal(axisLabel(custom), customLabel, `${component.name}/${kind}`)
      assert.ok(custom.includes(`<title>${customTitle}</title>`))
      assert.ok(custom.includes(`aria-label="${customTitle}・${kind === 'bar' ? '棒グラフ' : '折れ線グラフ'}"`))
      if (component === charts.SurtrDpsChart) assert.ok(custom.includes(`aria-label="${customTitle}・敵の術耐性"`))
      assert.doesNotMatch(custom, /スルト S3 DPS|>DPS<\/text>/)
      assert.deepEqual(plotMarks(custom), plotMarks(ordinary), `${component.name}/${kind} plot geometry`)
    }
  }
})

test('custom value label can override comparison metrics without changing percent formatting', () => {
  for (const metric of ['difference', 'percent']) {
    const markup = render(charts.SurtrDpsChart, {
      metric, kind: 'bar', selectedResistance: 40, valueAxisLabel: '期待値の比較',
    })
    assert.equal(axisLabel(markup), '期待値の比較')
    if (metric === 'percent') assert.match(markup, /6,400%/)
  }
})

test('screen legend defaults to visible and can be hidden without changing plot or PNG legend', () => {
  for (const kind of ['bar', 'line']) {
    const ordinary = render(charts.SurtrDpsChart, { kind })
    const hidden = render(charts.SurtrDpsChart, { kind, showLegend: false })
    assert.match(ordinary, /<figcaption><ul class="surtr-dps-chart-legend"/)
    assert.doesNotMatch(hidden, /<figcaption>|class="surtr-dps-chart-legend"/)
    assert.deepEqual(plotMarks(hidden), plotMarks(ordinary))
    const image = render(charts.SurtrDpsChartImage, { kind, conditions: '潜在1', showLegend: false })
    assert.match(image, /class="chart-image-frame-legend-list"/)
    assert.match(image, />未装備<\/span>/)
  }
})

test('custom title also identifies empty screen and image plots', () => {
  for (const [component, props] of [
    [charts.SurtrDpsChart, {}],
    [charts.SurtrDpsChartImage, { conditions: '潜在1' }],
    [charts.SurtrDpsSnapshotPlot, { width: 960, height: 334 }],
  ]) {
    const markup = render(component, { ...props, series: [], title: customTitle, valueAxisLabel: customLabel })
    assert.ok(markup.includes(`<title>${customTitle}</title>`))
    assert.ok(markup.includes(`aria-label="${customTitle}・表示できるデータがありません"`))
    assert.doesNotMatch(markup, /スルト S3 DPS/)
  }
})
