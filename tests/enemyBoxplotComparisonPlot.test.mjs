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
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/enemy-boxplot-comparison-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  charts = await server.ssrLoadModule('/src/components/EnemyBoxplotComparisonPlot.tsx')
})
after(async () => { await server?.close() })

const stats = {
  minimum: 0, firstQuartile: 85, median: 120, thirdQuartile: 220, maximum: 4000,
  lowerWhisker: 0, upperWhisker: 400, mean: 238,
  outliers: [{ value: 450, count: 0.5 }, { value: 4000, count: 2 }], outlierCount: 2.5,
}
const data = { hasData: true, series: [
  { key: 'defense', label: '防御力', validCount: 11409, missingCount: 201, statistics: stats },
  { key: 'magicResistance', label: '術耐性', validCount: 11409, missingCount: 201,
    statistics: { ...stats, firstQuartile: 0, median: 20, thirdQuartile: 30, maximum: 90,
      upperWhisker: 75, outliers: [{ value: 80, count: 3 }], outlierCount: 3 } },
] }
const render = options => renderToStaticMarkup(createElement(charts.EnemyBoxplotComparisonPlot,
  { data, scale: 'RAW', range: 'ALL', width: 960, ...options }))
const marks = markup => [...markup.matchAll(/<g class="enemy-boxplot-marks"[^>]*>(.*?)<\/g>/g)].map(match => match[1])
const medianPositions = markup => marks(markup).map(mark => Number(mark.match(/<line[^>]*x1="([^"]+)"[^>]*stroke-width="2.5"/)?.[1]))
const finite = markup => assert.doesNotMatch(markup, /NaN|Infinity|undefined/)

test('raw axes remain independent while normalized median lines share one position', () => {
  const original = structuredClone(data)
  const raw = render()
  const normalized = render({ scale: 'MEDIAN' })
  assert.equal(marks(raw).length, 2)
  assert.notEqual(...medianPositions(raw))
  assert.equal(...medianPositions(normalized))
  assert.match(normalized, /中央値に対する倍率/)
  assert.match(raw, />4,000<\/text>/)
  assert.match(normalized, />33.33<\/text>/)
  assert.match(raw, /enemy-rating-comparison-series defense/)
  assert.match(raw, /enemy-rating-comparison-series magicResistance/)
  assert.deepEqual(data, original)
})

test('whisker range hides only outlier marks, retaining maximum bands and fractional outlier counts', () => {
  const all = render()
  const whiskers = render({ range: 'WHISKERS' })
  assert.equal((all.match(/class="enemy-boxplot-outlier"/g) ?? []).length, 3)
  assert.doesNotMatch(whiskers, /class="enemy-boxplot-outlier"/)
  assert.match(whiskers, /ひげ外 2.5体 非表示/)
  assert.match(whiskers, />4,000<\/text>/)
  assert.match(whiskers, />90<\/text>/)
  assert.ok(medianPositions(whiskers)[0] > medianPositions(all)[0], 'the box grows in the narrower whisker domain')
})

test('zero median is unavailable only for normalization, independently of a missing series', () => {
  const special = structuredClone(data)
  special.series[0].statistics = Object.fromEntries(Object.keys(stats).map(key => [key, key === 'outliers' ? [] : 0]))
  special.series[1].statistics = null
  special.series[1].validCount = 0
  const raw = render({ data: special })
  const normalized = render({ data: special, scale: 'MEDIAN' })
  assert.equal(marks(raw).length, 1)
  assert.equal(marks(normalized).length, 0)
  assert.match(normalized, /換算不可（中央値0）/)
  assert.match(normalized, /データなし/)
  finite(raw)
  finite(normalized)
})

test('narrow and extended plots preserve finite geometry, bands, and read-only output', () => {
  for (const scale of ['RAW', 'MEDIAN']) {
    for (const range of ['ALL', 'WHISKERS']) {
      for (const width of [320, 960]) {
        const naturalHeight = charts.getEnemyBoxplotComparisonPlotHeight(scale)
        for (const height of [naturalHeight - 100, naturalHeight + 100]) {
          const markup = render({ scale, range, width, height, imageMode: true })
          finite(markup)
          assert.match(markup, /is-image/)
          assert.equal((markup.match(/class="chart-strip-title"/g) ?? []).length, 10)
          assert.doesNotMatch(markup, /<button|<input|<select|tabindex=|onClick|rotate\(/)
          const viewHeight = Number(markup.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)?.[1])
          assert.ok(viewHeight >= naturalHeight)
          for (const match of markup.matchAll(/\b(?:x|x1|x2|cx)="([\d.]+)"/g)) {
            assert.ok(Number(match[1]) <= width, `horizontal coordinate ${match[1]} fits ${width}`)
          }
          for (const match of markup.matchAll(/\b(?:y|y1|y2|cy)="([\d.]+)"/g)) {
            assert.ok(Number(match[1]) <= viewHeight, `vertical coordinate ${match[1]} fits ${viewHeight}`)
          }
        }
      }
    }
  }
})
