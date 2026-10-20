import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Strip, layoutFor, RankStrip
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/histogram-cumulative-strip-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ HistogramCumulativeStrip: Strip, getHistogramCumulativeStripLayout: layoutFor }
    = await server.ssrLoadModule('/src/components/HistogramCumulativeStrip.tsx'))
  ;({ StatRankStrip: RankStrip } = await server.ssrLoadModule('/src/components/StatRankStrip.tsx'))
})
after(async () => { await server?.close() })

const makeBins = counts => counts.map((count, index) => ({
  start: index * 10, end: (index + 1) * 10, count, includesMaximum: index === counts.length - 1,
}))
const render = (bins = makeBins([1, 1, 1]), width = 300) => renderToStaticMarkup(createElement('svg', null,
  createElement(Strip, { bins, total: bins.reduce((sum, bin) => sum + bin.count, 0),
    plotLeft: 50, plotRight: 50 + width, top: 12,
    layout: layoutFor(bins, bins.reduce((sum, bin) => sum + bin.count, 0), width) })))
const attributes = element => Object.fromEntries([...element.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))

test('strip aligns each cumulative cell and label with its histogram bar', () => {
  const markup = render()
  const labels = [...markup.matchAll(/<text class="chart-strip-label"[^>]*>/g)].map(match => attributes(match[0]))
  assert.deepEqual(labels.map(label => +label.x), [100, 200, 300])
  assert.deepEqual(labels.map(label => +label.y), [46, 46, 46])
  assert.match(markup, /data-histogram-cumulative="strip"/)
  assert.match(markup, /data-cumulative-count="2" data-cumulative-proportion="0.6666666666666666"/)
  assert.match(markup, />累積割合（%）<\/text>/)
  assert.match(markup, /aria-label="10未満まで：累積33.3%"/)
  assert.match(markup, /aria-label="30以下：累積100%"/)
  assert.doesNotMatch(markup, /<path|<circle|<line|<title|tooltip/)
  const fills = [...markup.matchAll(/<rect class="chart-strip-fill"[^>]*>/g)].map(match => attributes(match[0]))
  assert.deepEqual(fills.map(fill => +fill.x), [50, 151.5, 251.5])
  assert.deepEqual(fills.map(fill => +fill.width), [98.5, 97, 98.5])
  assert.ok(fills.every(fill => fill.height === '24' && fill['fill-opacity'] === '0.06'))
})

test('narrow and dense strips keep label centers, final label, and all accessible cell values', () => {
  const narrow = render(makeBins([2702, 791, 2085, 1625, 759, 2958, 894, 92, 276, 31]), 220)
  assert.equal((narrow.match(/class="chart-strip-label"/g) ?? []).length, 10)
  assert.equal((narrow.match(/transform="rotate\(-90 /g) ?? []).length, 10)
  const dense = render(makeBins(Array.from({ length: 100 }, () => 1)), 220)
  assert.equal((dense.match(/data-cumulative-index=/g) ?? []).length, 100)
  assert.ok((dense.match(/class="chart-strip-label"/g) ?? []).length < 100)
  assert.match(dense, />100<\/text><\/g><\/g><\/svg>$/)
})

test('one hundred narrow cells retain visible backgrounds and separated boundaries', () => {
  const width = 220
  const binCount = 100
  const markup = render(makeBins(Array.from({ length: binCount }, () => 1)), width)
  const fills = [...markup.matchAll(/<rect class="chart-strip-fill"[^>]*>/g)].map(match => attributes(match[0]))
  assert.equal(fills.length, binCount)
  for (const [index, fill] of fills.entries()) {
    const left = +fill.x
    const fillWidth = +fill.width
    const center = 50 + (index + 0.5) * width / binCount
    assert.ok(fillWidth > 0, `cell ${index} retains its gray background`)
    assert.ok(left < center && center < left + fillWidth, `cell ${index} background contains its bar center`)
    if (index > 0) assert.ok(+fills[index - 1].x + +fills[index - 1].width < left, `cell ${index} keeps a visible gap`)
  }
})

test('rank cells preserve the existing classes, sizes, gaps and tooltip content', () => {
  const bands = [
    { rating: 'E', label: '0〜500', start: 0, end: 0.5, index: 0 },
    { rating: 'D', label: '500〜1000', start: 0.5, end: 1, index: 1 },
  ]
  const markup = renderToStaticMarkup(createElement('svg', null,
    createElement(RankStrip, { bands, left: 50, right: 250, top: 30, titleY: 22 })))
  assert.match(markup, /<title>HPランク E：0〜500<\/title>/)
  assert.match(markup, /<rect class="stat-rank-strip-fill" data-chart-image-ink="true" x="50" y="30" width="98.5" height="24" fill-opacity="0.06"/)
  assert.match(markup, /<rect x="50" y="30" width="100" height="24" fill="transparent"/)
  assert.match(markup, /<text class="stat-rank-strip-label" data-chart-image-ink="true" x="100" y="46" text-anchor="middle">E<\/text>/)
  assert.match(markup, /x="151.5" y="30" width="98.5"/)
  assert.doesNotMatch(markup, /class="chart-strip-/)
})