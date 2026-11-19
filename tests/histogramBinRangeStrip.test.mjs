import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { getHistogramBinRangeStripLayout } from '../src/lib/histogramBinRangeStrip.ts'

const measure = text => Array.from(text).length * 4

test('ranges use one line when every complete label fits its own slot', () => {
  const labels = [['-1.5〜', '-0.1'], ['0.1〜', '1.5'], ['1,000.25', '超']]
  const result = getHistogramBinRangeStripLayout(labels, 600, measure)
  assert.deepEqual(result, { labels: [['-1.5〜-0.1'], ['0.1〜1.5'], ['1,000.25超']], height: 24 })
  assert.deepEqual(labels, [['-1.5〜', '-0.1'], ['0.1〜', '1.5'], ['1,000.25', '超']])
  assert.notEqual(result.labels[0], labels[0])
})

test('all cells share a two-line height when the original range lines fit', () => {
  const labels = [['0〜', '9,999'], ['10,000', '超']]
  assert.deepEqual(getHistogramBinRangeStripLayout(labels, 60, measure), { labels, height: 40 })
  assert.equal(getHistogramBinRangeStripLayout(labels, 59.9, measure), null, 'six pixels are reserved inside every slot')
  const mixed = [['0〜', '9,999'], ['超過']]
  assert.deepEqual(getHistogramBinRangeStripLayout(mixed, 52, measure), { labels: mixed, height: 40 })
})

test('a single oversized cell keeps the entire strip on the existing tick fallback', () => {
  assert.equal(getHistogramBinRangeStripLayout([['0〜', '999,999'], ['超']], 60, measure), null)
  assert.equal(getHistogramBinRangeStripLayout([['0〜999,999'], ['超']], 60, measure), null)
  assert.equal(getHistogramBinRangeStripLayout(Array.from({ length: 100 }, () => ['0〜', '10']), 220), null)
})

test('empty labels, invalid geometry and invalid measurements do not create a strip', () => {
  for (const labels of [[], [[]], [['']], [[' ']], [['0'], []], [['0', '1', '2']]]) {
    assert.equal(getHistogramBinRangeStripLayout(labels, 500, measure), null)
  }
  for (const width of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(getHistogramBinRangeStripLayout([['0〜', '1']], width, measure), null)
  }
  for (const width of [-1, NaN, Infinity]) {
    assert.equal(getHistogramBinRangeStripLayout([['0〜', '1']], 100, () => width), null)
  }
})

test('the initial estimate reserves full width for range and overflow characters', () => {
  assert.deepEqual(getHistogramBinRangeStripLayout([['0〜', '10']], 46), { labels: [['0〜10']], height: 24 })
  assert.deepEqual(getHistogramBinRangeStripLayout([['0〜', '10']], 30), { labels: [['0〜', '10']], height: 40 })
  assert.equal(getHistogramBinRangeStripLayout([['10', '超']], 19), null)
})

let server, Strip, useLayout
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/histogram-bin-range-strip-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ HistogramBinRangeStrip: Strip, useHistogramBinRangeStripLayout: useLayout }
    = await server.ssrLoadModule('/src/components/HistogramBinRangeStrip.tsx'))
})
after(async () => { await server?.close() })

const attributes = element => Object.fromEntries([...element.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const tags = (markup, tag, className) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))]
  .filter(([element]) => attributes(element).class === className).map(([element]) => attributes(element))
const render = (layout, extra = {}) => renderToStaticMarkup(createElement('svg', null,
  createElement(Strip, { layout, plotLeft: 50, plotRight: 350, top: 12, ...extra })))

test('numeric strip cells stay aligned to complete histogram slots with shared pale fills', () => {
  const markup = render({ labels: [['0〜9'], ['10〜19'], ['20超']], height: 24 })
  const fills = tags(markup, 'rect', 'chart-strip-fill')
  assert.equal(fills.length, 3)
  assert.deepEqual(fills.map(fill => +fill.x), [50, 151.5, 251.5])
  assert.deepEqual(fills.map(fill => +fill.width), [98.5, 97, 98.5])
  assert.ok(fills.every(fill => fill.y === '12' && fill.height === '24' && fill['fill-opacity'] === '0.06'))
  const cells = [...markup.matchAll(/<rect\b[^>]*fill="transparent"[^>]*>/g)].map(([tag]) => attributes(tag))
  assert.deepEqual(cells.map(cell => [+cell.x, +cell.width]), [[50, 100], [150, 100], [250, 100]])
  const labels = tags(markup, 'text', 'chart-strip-label')
  assert.deepEqual(labels.map(label => [+label.x, +label.y]), [[100, 28], [200, 28], [300, 28]])
  assert.match(markup, /data-histogram-range-strip="bottom"/)
  assert.match(markup, /class="chart-strip-title"[^>]*x="42"[^>]*>階級<\/text>/)
  assert.doesNotMatch(markup, /<title|<line|<path|tabindex|role="button"|tooltip|onClick/)
})

test('two-line strips preserve decimal, negative and overflow text inside their cells', () => {
  const markup = render({ labels: [['-1.5〜', '-0.1'], ['0.1〜', '1.5'], ['1,000.25超']], height: 40 })
  const labels = tags(markup, 'text', 'chart-strip-label')
  assert.deepEqual(labels.map(label => [+label.x, +label.y]), [[100, 28], [100, 43], [200, 28], [200, 43], [300, 36]])
  assert.ok(tags(markup, 'rect', 'chart-strip-fill').every(fill => fill.height === '40'))
  for (const text of ['-1.5〜', '-0.1', '0.1〜', '1.5', '1,000.25超']) assert.ok(markup.includes(`>${text}</text>`))
})

test('invalid component bounds do not produce SVG coordinates', () => {
  const layout = { labels: [['0〜1']], height: 24 }
  for (const extra of [{ plotRight: 50 }, { plotRight: 49 }, { plotLeft: NaN }, { plotRight: Infinity }, { top: NaN }]) {
    assert.equal(render(layout, extra), '<svg></svg>')
  }
  assert.equal(render({ labels: [], height: 24 }), '<svg></svg>')
})

function HookFixture({ enabled, width }) {
  const { measureRef, layout } = useLayout([['0〜', '10']], width, enabled)
  return createElement('svg', null,
    createElement('text', { ref: measureRef, className: 'chart-strip-label', visibility: 'hidden', 'aria-hidden': true }, '0'),
    layout && createElement(Strip, { layout, plotLeft: 50, plotRight: 50 + width, top: 0 }))
}

test('SSR uses the conservative estimate and the existing enabled switch', () => {
  const renderHook = props => renderToStaticMarkup(createElement(HookFixture, props))
  assert.match(renderHook({ enabled: true, width: 80 }), /data-histogram-range-strip="bottom"/)
  assert.match(renderHook({ enabled: true, width: 30 }), /height="40"/)
  assert.doesNotMatch(renderHook({ enabled: true, width: 15 }), /data-histogram-range-strip=/)
  assert.doesNotMatch(renderHook({ enabled: false, width: 80 }), /data-histogram-range-strip=/)
})
