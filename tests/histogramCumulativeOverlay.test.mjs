import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Overlay
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/histogram-cumulative-overlay-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ HistogramCumulativeOverlay: Overlay } = await server.ssrLoadModule('/src/components/HistogramCumulativeOverlay.tsx'))
})
after(async () => { await server?.close() })

const bins = [
  { start: 0, end: 10, count: 1, includesMaximum: false },
  { start: 10, end: 20, count: 2, includesMaximum: false },
  { start: 20, end: 30, count: 1, includesMaximum: true },
]
const props = { bins, total: 4, plotLeft: 50, plotRight: 350, plotTop: 20, plotBottom: 220 }
const render = (overrides = {}) => renderToStaticMarkup(createElement('svg', null, createElement(Overlay, { ...props, ...overrides })))
const numericCircles = source => [...source.matchAll(/<circle\b([^>]*)class="enemy-histogram-cumulative-point"([^>]*)>/g)]

test('line joins bar-center cumulative points without extending to zero or the right axis', () => {
  const markup = render()
  assert.match(markup, /d="M 100 170 L 200 70 L 300 20"/)
  assert.doesNotMatch(markup, /d="M 50 220|L 350 20/)
  assert.equal(numericCircles(markup).length, 3)
  for (const [index, x] of [100, 200, 300].entries()) {
    const circle = numericCircles(markup)[index].join(' ')
    assert.match(circle, new RegExp(`cx="${x}"`))
  }
  assert.match(markup, /data-cumulative-count="1" data-cumulative-proportion="0.25"/)
  assert.match(markup, /data-cumulative-count="3" data-cumulative-proportion="0.75"/)
  assert.match(markup, /data-cumulative-count="4" data-cumulative-proportion="1"/)
  for (const tick of ['0%', '25%', '50%', '75%', '100%']) assert.ok(markup.includes(`>${tick}</text>`))
  assert.match(markup, />累積割合<\/text>/)
  assert.equal((markup.match(/data-chart-image-ink=""/g) ?? []).length, 4)
})

test('one class shows a centered point at its cumulative value without an artificial line', () => {
  const markup = render({ bins: [{ ...bins[0], count: 4 }] })
  assert.equal(numericCircles(markup).length, 1)
  assert.match(numericCircles(markup)[0].join(' '), /cx="200" cy="20"/)
  assert.doesNotMatch(markup, /class="enemy-histogram-cumulative-line"/)
  assert.match(markup, /10未満まで：累積4体（100%）/)
  assert.match(markup, /aria-valuemin="1" aria-valuemax="1" aria-valuenow="1"/)
})

test('point descriptions use exclusive and closed numeric boundaries, not bar-center values', () => {
  const markup = render({ formatBoundary: value => `境界${value}`, countUnit: '件' })
  assert.match(markup, /境界10未満まで：累積1件（25%）/)
  assert.match(markup, /境界20未満まで：累積3件（75%）/)
  assert.match(markup, /境界30以下：累積4件（100%）/)
  assert.doesNotMatch(markup, /境界30未満/)
})

test('overflow endpoint includes all classes and rating endpoint names the exact category', () => {
  const overflow = render({ bins: [bins[0], { start: 10, end: 100, count: 3, includesMaximum: true, isOverflow: true }] })
  assert.match(overflow, /全階級（10超を含む）：累積4体（100%）/)
  assert.doesNotMatch(overflow, /100以下/)
  const rating = render({ bins: [{ rating: 'B+', label: 'B+', lowerBound: 30, lowerInclusive: true,
    upperBound: 50, upperInclusive: false, count: 4 }] })
  assert.match(rating, /評価B\+まで：累積4体（100%）/)
})

test('empty or invalid cumulative data never renders an axis or misleading line', () => {
  assert.equal(render({ bins: [] }), '<svg></svg>')
  assert.equal(render({ total: 0 }), '<svg></svg>')
  assert.equal(render({ total: Number.NaN }), '<svg></svg>')
  assert.equal(render({ bins: [{ ...bins[0], count: -1 }] }), '<svg></svg>')
  assert.equal(render({ plotRight: 50 }), '<svg></svg>')
  assert.equal(render({ plotTop: Number.NaN }), '<svg></svg>')
})

test('screen interaction has a single keyboard stop and touch targets; exported points stay visible without controls', () => {
  const screen = render()
  assert.equal((screen.match(/tabindex="0"/g) ?? []).length, 1)
  assert.match(screen, /role="slider"/)
  assert.match(screen, /aria-valuemin="1" aria-valuemax="3" aria-valuenow="1"/)
  assert.equal((screen.match(/class="enemy-histogram-cumulative-hit-area"/g) ?? []).length, 3)
  assert.doesNotMatch(screen, /class="enemy-histogram-cumulative-tooltip"/)
  const image = render({ image: true })
  assert.equal(numericCircles(image).length, 3)
  assert.doesNotMatch(image, /tabindex=|role="slider"|class="enemy-histogram-cumulative-hit-area"|class="enemy-histogram-cumulative-tooltip"/)
  assert.match(image, /累積4体（100%）/)
})

test('small nonzero cumulative proportions are not described as zero', () => {
  const markup = render({ bins: [{ ...bins[0], count: 1 }, { ...bins[1], count: 999_999_999 }], total: 1_000_000_000 })
  assert.match(markup, /累積1体（&lt;0\.1%）/)
  assert.doesNotMatch(markup, /累積1体（0(?:\.0)?%）/)
})

test('ordinary cumulative descriptions use one fractional digit and keep zero and full totals concise', () => {
  const markup = render({ bins: bins.map((bin, index) => ({ ...bin, count: [0, 894, 106][index] })), total: 1000 })
  assert.match(markup, /累積0体（0%）/)
  assert.match(markup, /累積894体（89\.4%）/)
  assert.match(markup, /累積1,000体（100%）/)
  assert.doesNotMatch(markup, /（0\.0%）|（100\.0%）/)
})
