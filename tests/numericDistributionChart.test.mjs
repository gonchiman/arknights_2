import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart, Svg, statistics, boxPlot
const render = (values, extra = {}, Component = Svg) => renderToStaticMarkup(createElement(Component, {
  statistics: statistics(values), boxPlot: boxPlot(values), metricLabel: '必要SP−初期SP', view: 'histogram', width: 640, ...extra,
}))
const attributes = (markup, name) => [...markup.matchAll(new RegExp(`\\s${name}="([^"]+)"`, 'g'))].map(match => Number(match[1]))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/numeric-distribution-chart-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ NumericDistributionChart: Chart, NumericDistributionSvg: Svg } = await server.ssrLoadModule('/src/components/NumericDistributionChart.tsx'))
  ;({ calculateNumericStatistics: statistics, calculateBoxPlotStatistics: boxPlot } = await server.ssrLoadModule('/src/lib/enemyStatistics.ts'))
})
after(async () => { await server?.close() })

test('histograms preserve signed bin positions, counts and accessible axis semantics without mark interactions', () => {
  const values = [-20, -10, 0, 5, 10, 15]
  const markup = render(values)
  assert.match(markup, />-20<\/text>/)
  assert.match(markup, />必要SP−初期SP<\/text>/)
  assert.match(markup, /6件。横軸は必要SP−初期SP、縦軸は件数/)
  assert.equal((markup.match(/class="numeric-distribution-bar"/g) ?? []).length, statistics(values).bins.length)
  assert.equal((markup.match(/class="numeric-distribution-value"/g) ?? []).length, statistics(values).bins.length)
  assert.equal((markup.match(/<title\b/g) ?? []).length, 1)
  assert.doesNotMatch(markup, /data-tooltip|onclick|onmouseover|NaN|Infinity/)
  for (const x of attributes(markup, 'x')) assert.ok(x >= 0 && x <= 640)
  for (const height of attributes(markup, 'height')) assert.ok(height >= 0 && height <= 310)
})

test('adaptive overflow is drawn in the final display bin rather than at its raw extreme', () => {
  const values = [...Array(100).fill(5), 1000]
  const result = statistics(values)
  assert.equal(result.histogram.hasOverflow, true)
  const markup = render(values, { metricLabel: '持続時間', unit: '秒' })
  assert.match(markup, /class="numeric-distribution-bar is-overflow"/)
  assert.ok(markup.includes(`${result.histogram.normalRangeEnd}超</text>`))
  assert.match(markup, />持続時間（秒）<\/text>/)
  assert.match(markup, /最後の階級にまとめています/)
  const bars = [...markup.matchAll(/<rect class="numeric-distribution-bar[^>]*>/g)].map(match => match[0])
  const last = bars.at(-1)
  const x = Number(last.match(/ x="([^"]+)"/)[1])
  const width = Number(last.match(/ width="([^"]+)"/)[1])
  assert.ok(x >= 56 && x + width <= 620)
  assert.doesNotMatch(markup, /NaN|Infinity/)
})

test('constant and zero observations remain visible with integer count ticks', () => {
  for (const values of [[-5, -5], [0], [10, 10]]) {
    const markup = render(values)
    assert.doesNotMatch(markup, /NaN|Infinity/)
    const bars = [...markup.matchAll(/<rect class="numeric-distribution-bar[^>]*>/g)].map(match => match[0])
    assert.ok(bars.some(bar => Number(bar.match(/ height="([^"]+)"/)[1]) > 0))
    const countLabels = [...markup.matchAll(/text-anchor="end">([^<]+)<\/text>/g)].map(match => match[1].replaceAll(',', ''))
    assert.ok(countLabels.every(label => Number.isInteger(Number(label))))
  }
})

test('box plots use supplied quartiles, Tukey whiskers and all outliers across narrow and wide surfaces', () => {
  const values = [-100, 0, 0, 0, 1, 1, 2, 100]
  for (const width of [280, 640]) {
    const markup = render(values, { view: 'boxplot', width })
    assert.match(markup, /class="numeric-distribution-box"/)
    assert.match(markup, /class="numeric-distribution-median"/)
    assert.match(markup, /ひげは1.5IQR内の観測値/)
    assert.equal((markup.match(/class="numeric-distribution-outlier"/g) ?? []).length, 2)
    assert.equal((markup.match(/<title\b/g) ?? []).length, 1)
    for (const x of attributes(markup, 'cx')) assert.ok(x >= 56 && x <= width - 20)
    for (const y of attributes(markup, 'cy')) assert.ok(y > 22 && y < 146 - 22)
    assert.doesNotMatch(markup, /data-tooltip|NaN|Infinity/)
  }
})

test('empty data uses a concise state and box legend labels stay outside the plotting surface', () => {
  const empty = render([], {}, Chart)
  assert.match(empty, /role="status">有効な値は0件です/)
  assert.doesNotMatch(empty, /<svg\b/)
  const valid = render([0, 1, 2], { view: 'boxplot' }, Chart)
  assert.match(valid, /role="region" tabindex="0" aria-label="必要SP−初期SPの分布グラフ"/)
  assert.match(valid, /aria-label="凡例"/)
  assert.match(valid, /箱 中央50%/)
  assert.match(valid, /ひげ 1.5IQR/)
  assert.match(valid, /ひげ外/)
})

const renderQq = (values, extra = {}) => render(values, { view: 'qq', values, unit: 'SP', ...extra }, Chart)

test('normal Q–Q preserves one point per observation and places tied values at different normal ranks', () => {
  const markup = renderQq([12, 0, -8, 0, 6])
  assert.match(markup, /role="img"[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/)
  assert.match(markup, />必要SP−初期SPの正規Q–Qプロット<\/title>/)
  assert.match(markup, />標準正規分布の理論分位<\/text>/)
  assert.match(markup, />必要SP−初期SP（SP）<\/text>/)
  assert.match(markup, /<line class="numeric-distribution-qq-reference"/)
  assert.match(markup, /基準線（第1・第3四分位）/)
  const xs = attributes(markup, 'cx'), ys = attributes(markup, 'cy')
  assert.equal(xs.length, 5)
  assert.ok(xs.every((x, index) => index === 0 || x > xs[index - 1]))
  assert.ok(ys[0] > ys[1] && ys[2] > ys[3] && ys[3] > ys[4])
  assert.equal(ys[1], ys[2])
  assert.doesNotMatch(markup, /data-tooltip|onclick|onmouseover|NaN|Infinity/)
})

test('normal Q–Q handles empty, single and zero-IQR samples without inventing a reference line', () => {
  const empty = renderQq([])
  assert.match(empty, /role="status">有効な値は0件です/)
  assert.doesNotMatch(empty, /<svg\b|aria-label="凡例"/)

  for (const values of [[0], [20, 20, 20], [20, 20, 20, 20, 60]]) {
    const markup = renderQq(values, { metricLabel: '持続時間', unit: '秒' })
    assert.match(markup, />持続時間（秒）<\/text>/)
    assert.match(markup, /基準線なし/)
    assert.equal(attributes(markup, 'cx').length, values.length)
    assert.equal(new Set(attributes(markup, 'cy')).size, new Set(values).size)
    assert.doesNotMatch(markup, /<line class="numeric-distribution-qq-reference"|NaN|Infinity/)
  }
})
