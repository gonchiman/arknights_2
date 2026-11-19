import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Strip, layoutFor, PercentageStrip, percentageLayoutFor, RankStrip
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/histogram-cumulative-strip-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ HistogramCumulativeStrip: Strip, getHistogramCumulativeStripLayout: layoutFor,
    HistogramPercentageStrip: PercentageStrip, getHistogramPercentageStripLayout: percentageLayoutFor }
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
const renderPercentage = (bins = makeBins([1, 2, 1]), width = 300) => {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0)
  return renderToStaticMarkup(createElement('svg', null, createElement(PercentageStrip, {
    bins, total, plotLeft: 50, plotRight: 50 + width, top: 12,
    layout: percentageLayoutFor(bins, total, width),
  })))
}
const attributes = element => Object.fromEntries([...element.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
const titles = markup => [...markup.matchAll(/<text class="chart-strip-title"([^>]*)>([\s\S]*?)<\/text>/g)]
  .map(([, tag, content]) => ({ ...attributes(tag),
    lines: [...content.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)]
      .map(([, lineTag, text]) => ({ ...attributes(lineTag), text })),
  }))
function assertLeftTitle(title, label, plotLeft, top, bandHeight) {
  assert.equal(+title.x, plotLeft - 8)
  assert.equal(title['text-anchor'], 'end')
  assert.deepEqual(title.lines.map(line => line.text), [label, '（%）'])
  const baseline = +title.y
  assert.equal(baseline, top + bandHeight / 2 - 2)
  assert.equal(+title.lines[0].x, plotLeft - 8)
  assert.equal(+title.lines[1].x, plotLeft - 8)
  assert.equal(+title.lines[1].dy, 11)
  // The shared title style is 10px; CJK characters occupy a full em.
  assert.ok(+title.x - Math.max(...title.lines.map(line => line.text.length * 10)) >= 0,
    'the full row name stays inside the SVG left edge')
  assert.ok(baseline - 8 >= top && baseline + 11 + 2 <= top + bandHeight,
    'both title lines stay within their own band')
}

test('strip aligns each cumulative cell and label with its histogram bar', () => {
  const markup = render()
  const labels = [...markup.matchAll(/<text class="chart-strip-label"[^>]*>/g)].map(match => attributes(match[0]))
  assert.deepEqual(labels.map(label => +label.x), [100, 200, 300])
  assert.deepEqual(labels.map(label => +label.y), [28, 28, 28])
  assert.match(markup, /data-histogram-cumulative="strip"/)
  assert.match(markup, /data-cumulative-count="2" data-cumulative-proportion="0.6666666666666666"/)
  assertLeftTitle(titles(markup)[0], '累積割合', 50, 12, 24)
  assert.match(markup, /role="group" aria-label="累積割合（%）"/)
  assert.match(markup, /aria-label="10未満まで：累積33.3%"/)
  assert.match(markup, /aria-label="30以下：累積100%"/)
  assert.doesNotMatch(markup, /<path|<circle|<line|<title|tooltip/)
  const fills = [...markup.matchAll(/<rect class="chart-strip-fill"[^>]*>/g)].map(match => attributes(match[0]))
  assert.deepEqual(fills.map(fill => +fill.x), [50, 151.5, 251.5])
  assert.deepEqual(fills.map(fill => +fill.width), [98.5, 97, 98.5])
  assert.ok(fills.every(fill => +fill.y === 12), 'cells begin at the supplied row top without a header gap')
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

test('percentage cells share bar centers and a left-side row name without cumulative values or interactions', () => {
  const markup = renderPercentage()
  const labels = [...markup.matchAll(/<text class="chart-strip-label"[^>]*>([^<]*)<\/text>/g)]
  assert.deepEqual(labels.map(match => +attributes(match[0]).x), [100, 200, 300])
  assert.deepEqual(labels.map(match => +attributes(match[0]).y), [28, 28, 28])
  assert.deepEqual(labels.map(match => match[1]), ['25', '50', '25'])
  assert.match(markup, /data-histogram-percentage="strip"/)
  assert.match(markup, /data-bin-percentage-index="1" data-bin-percentage-count="2" data-bin-percentage-proportion="0.5"/)
  assertLeftTitle(titles(markup)[0], '割合', 50, 12, 24)
  assert.match(markup, /role="group" aria-label="割合（%）"/)
  assert.match(markup, /aria-label="0以上10未満：割合25%"/)
  assert.match(markup, /aria-label="20以上30以下：割合25%"/)
  assert.doesNotMatch(markup, /data-cumulative|data-percentage-index|<path|<circle|<line|<title|tooltip/)
  const fills = [...markup.matchAll(/<rect class="chart-strip-fill"[^>]*>/g)].map(match => attributes(match[0]))
  assert.deepEqual(fills.map(fill => +fill.x), [50, 151.5, 251.5])
  assert.deepEqual(fills.map(fill => +fill.width), [98.5, 97, 98.5])
})

test('stacked cumulative and percentage rows retain left-side names and non-overlapping ink', () => {
  const bins = makeBins([1, 2, 1])
  const total = 4
  const width = 60
  const cumulative = layoutFor(bins, total, width)
  const percentage = percentageLayoutFor(bins, total, width)
  const markup = renderToStaticMarkup(createElement('svg', null,
    createElement(Strip, { bins, total, plotLeft: 50, plotRight: 50 + width, top: 0, layout: cumulative }),
    createElement(PercentageStrip, { bins, total, plotLeft: 50, plotRight: 50 + width,
      top: cumulative.height, layout: percentage })))
  const rowTitles = titles(markup)
  assert.equal(rowTitles.length, 2)
  assertLeftTitle(rowTitles[0], '累積割合', 50, 0, cumulative.bandHeight)
  assertLeftTitle(rowTitles[1], '割合', 50, cumulative.height, percentage.bandHeight)
  const fills = [...markup.matchAll(/<rect class="chart-strip-fill"[^>]*>/g)].map(match => attributes(match[0]))
  assert.equal(+fills[0].y + +fills[0].height + 4, cumulative.height)
  assert.equal(+fills[0].y, 0)
  assert.equal(+fills[3].y, cumulative.height)
  const labels = [...markup.matchAll(/<text class="chart-strip-label"[^>]*>/g)].map(match => attributes(match[0]))
  assert.ok(labels.every(label => label.transform?.startsWith('rotate(-90 ')))
  for (const [index, label] of labels.entries()) {
    const layout = index < 3 ? cumulative : percentage
    const top = index < 3 ? 0 : cumulative.height
    assert.equal(+label.y, top + layout.bandHeight / 2)
    assert.equal(+label.x, 50 + (index % 3 + 0.5) * width / 3)
  }
})

test('dense percentage strips preserve accessible values for every zero and tiny-value cell', () => {
  const bins = makeBins([0, 0.001, ...Array.from({ length: 98 }, () => 1)])
  const markup = renderPercentage(bins, 220)
  assert.equal((markup.match(/data-bin-percentage-index=/g) ?? []).length, 100)
  assert.ok((markup.match(/class="chart-strip-label"/g) ?? []).length < 100)
  assert.match(markup, /aria-label="0以上10未満：割合0%"/)
  assert.match(markup, /aria-label="10以上20未満：割合&lt;0.1%"/)
  assert.doesNotMatch(markup, /data-percentage-index|data-histogram-cumulative/)
})

test('percentage strip identifies rating and overflow bins without numeric range assumptions', () => {
  const rating = renderPercentage([{ rating: 'E', count: 1 }, { rating: 'D', count: 3 }])
  assert.match(rating, /aria-label="評価E：割合25%"/)
  assert.match(rating, /aria-label="評価D：割合75%"/)
  const overflow = renderPercentage([{ start: 1000, end: Infinity, isOverflow: true, count: 1 }])
  assert.match(overflow, /aria-label="1,000超：割合100%"/)
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
