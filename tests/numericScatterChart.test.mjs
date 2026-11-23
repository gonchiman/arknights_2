import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/numeric-scatter-chart-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ NumericScatterChart: Chart } = await server.ssrLoadModule('/src/components/NumericScatterChart.tsx'))
})
after(async () => { await server?.close() })

const render = (points, extra = {}) => renderToStaticMarkup(createElement(Chart, {
  points, xLabel: '必要SP−初期SP', yLabel: '持続時間（秒）', ...extra,
}))
const graph = markup => markup.slice(markup.indexOf('<svg class="numeric-scatter-chart-svg"'), markup.indexOf('</svg>') + 6)
const attribute = (markup, name) => {
  const match = markup.match(new RegExp(`\\s${name}="([^"]+)"`))
  return match ? Number(match[1]) : null
}
const circles = markup => [...graph(markup).matchAll(/<circle\b[^>]*>/g)].map(match => ({
  cx: attribute(match[0], 'cx'), cy: attribute(match[0], 'cy'), radius: attribute(match[0], 'r'), count: attribute(match[0], 'data-count'),
}))
const fixture = [
  ...Array.from({ length: 9 }, (_, index) => ({ id: `low-${index}`, x: -10, y: -20 })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `high-${index}`, x: 10, y: 20 })),
  { id: 'zero', x: 0, y: 0 },
]

test('count mode groups exact coordinate duplicates and scales circle area by the real count', () => {
  const markup = render(fixture)
  const marks = circles(markup)
  assert.equal(marks.length, 3)
  assert.deepEqual(marks.map(point => point.count), [9, 4, 1])
  const ratios = marks.map(point => point.radius ** 2 / point.count)
  assert.ok(ratios.every(ratio => Math.abs(ratio - ratios[0]) < 1e-10))
  assert.match(markup, /14件のスキル/)
  assert.match(markup, /点の面積を件数に比例/)
  for (const value of [1, 4, 9]) assert.ok(markup.includes(`</svg>${value}件`))
  assert.equal((graph(markup).match(/<title\b/g) ?? []).length, 1)
  assert.doesNotMatch(markup, /data-tooltip|onmouseover|onclick|NaN|Infinity/)
})

test('raw mode preserves every observation at its original shared position and leaves domains unchanged', () => {
  const counted = render(fixture, { pointMode: 'count' })
  const raw = render(fixture, { pointMode: 'overplot' })
  const countedPoints = circles(counted), rawPoints = circles(raw)
  assert.equal(rawPoints.length, fixture.length)
  assert.ok(rawPoints.every(point => point.radius === 4 && point.count === null))
  for (const point of rawPoints) assert.ok(countedPoints.some(group => group.cx === point.cx && group.cy === point.cy))
  const axesOnly = markup => graph(markup).replace(/<desc\b[\s\S]*?<\/desc>/, '').replace(/<circle\b[^>]*><\/circle>|<circle\b[^>]*\/>|<circle\b[^>]*>/g, '')
  assert.equal(axesOnly(raw), axesOnly(counted))
  assert.match(raw, />スキル<\/span>/)
  assert.doesNotMatch(raw, />件数<\/span>/)
})

test('one cap factor keeps all area ratios while large coincident cohorts and constants remain inside plot bounds', () => {
  const source = [
    ...Array.from({ length: 4000 }, (_, index) => ({ id: `many-${index}`, x: 0, y: 0 })),
    { id: 'low', x: -30, y: -50 },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `high-${index}`, x: 100, y: 120 })),
  ]
  for (const points of [source, source.slice(0, 4000), [{ id: 'constant', x: -5, y: -5 }]]) {
    for (const width of [280, 640]) {
      const markup = render(points, { imageSize: { width, height: 310 } })
      const clip = graph(markup).match(/<clipPath[^>]*><rect[^>]*>/)[0]
      const left = attribute(clip, 'x'), top = attribute(clip, 'y')
      const right = left + attribute(clip, 'width'), bottom = top + attribute(clip, 'height')
      const marks = circles(markup)
      assert.ok(marks.every(point => point.radius <= 20))
      for (const point of marks) {
        assert.ok(point.cx - point.radius >= left, `${point.cx} - ${point.radius} >= ${left}`)
        assert.ok(point.cx + point.radius <= right)
        assert.ok(point.cy - point.radius >= top)
        assert.ok(point.cy + point.radius <= bottom)
      }
      const factor = marks[0].radius ** 2 / marks[0].count
      assert.ok(marks.every(point => Math.abs(point.radius ** 2 / point.count - factor) < 1e-10))
      assert.doesNotMatch(markup, /NaN|Infinity/)
    }
  }
})

test('grouping does not round nearby values, mutate frozen records, or turn missing coordinates into zeros', () => {
  const points = Object.freeze([
    Object.freeze({ id: 'a', x: .3, y: 1 }),
    Object.freeze({ id: 'b', x: .1 + .2, y: 1 }),
    Object.freeze({ id: 'invalid', x: Number.NaN, y: 1 }),
    Object.freeze({ id: 'infinite', x: 0, y: Number.POSITIVE_INFINITY }),
  ])
  const markup = render(points)
  assert.equal(circles(markup).length, 2)
  assert.match(markup, /2件のスキル/)
  assert.doesNotMatch(markup, /NaN|Infinity/)
  const empty = render([points[2], points[3]])
  assert.match(empty, /role="status">分析対象は0件です/)
  assert.doesNotMatch(empty, /<svg\b/)
})

test('narrow numeric plots retain zero ticks on both signed axes when reducing other ticks', () => {
  const points = [{ id: 'zero', x: 0, y: 0 }, { id: 'high', x: 100, y: 80 }]
  for (const pointMode of ['count', 'overplot']) {
    const markup = render(points, { pointMode, imageSize: { width: 320, height: 310 } })
    const plot = graph(markup)
    assert.match(plot, /class="numeric-scatter-chart-tick"[^>]*>-20<\/text>/)
    const zeros = [...plot.matchAll(/<text class="numeric-scatter-chart-tick"[^>]*>0<\/text>/g)].map(match => match[0])
    assert.equal(zeros.length, 2)
    assert.equal(zeros.filter(label => label.includes('text-anchor="end"')).length, 1)
    assert.equal(zeros.filter(label => label.includes('text-anchor="middle"')).length, 1)
  }
})

test('negative regression uses the same observed endpoints in count and raw modes without changing point positions', () => {
  const points = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `left-${index}`, x: -10, y: 25 })),
    { id: 'center', x: 0, y: 5 },
    ...Array.from({ length: 2 }, (_, index) => ({ id: `right-${index}`, x: 10, y: -15 })),
  ]
  const fit = { slope: -2, intercept: 5 }
  let previousLine
  for (const pointMode of ['count', 'overplot']) {
    const markup = render(points, { pointMode, fit, showFit: true })
    const marks = circles(markup)
    const line = graph(markup).match(/<line class="numeric-scatter-chart-fit"[^>]*>/)?.[0]
    assert.ok(line)
    const left = marks.find(mark => mark.cx === Math.min(...marks.map(point => point.cx)))
    const right = marks.find(mark => mark.cx === Math.max(...marks.map(point => point.cx)))
    assert.equal(attribute(line, 'x1'), left.cx)
    assert.equal(attribute(line, 'y1'), left.cy)
    assert.equal(attribute(line, 'x2'), right.cx)
    assert.equal(attribute(line, 'y2'), right.cy)
    assert.match(markup, /実線は観測範囲内の単回帰直線/)
    assert.match(markup, /numeric-scatter-chart-fit-key/)
    if (previousLine) assert.equal(line, previousLine)
    previousLine = line
    const originalMarks = circles(render(points, { pointMode }))
    assert.deepEqual(marks, originalMarks)
  }
})

test('a zero-slope fit stays horizontal and visible for a constant response', () => {
  const points = [{ id: 'a', x: -10, y: 8 }, { id: 'b', x: 0, y: 8 }, { id: 'c', x: 10, y: 8 }]
  for (const pointMode of ['count', 'overplot']) {
    const markup = render(points, { pointMode, fit: { slope: 0, intercept: 8 }, showFit: true })
    const line = graph(markup).match(/<line class="numeric-scatter-chart-fit"[^>]*>/)?.[0]
    assert.ok(line)
    assert.equal(attribute(line, 'y1'), attribute(line, 'y2'))
    assert.equal(attribute(line, 'y1'), circles(markup)[0].cy)
    assert.ok(attribute(line, 'x1') < attribute(line, 'x2'))
    assert.doesNotMatch(markup, /NaN|Infinity/)
  }
})

test('predictions beyond the Y range are clipped to the plot and never extrapolated past observed X', () => {
  const points = [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }]
  for (const pointMode of ['count', 'overplot']) {
    const markup = render(points, { pointMode, fit: { slope: 100, intercept: -1500 }, showFit: true })
    const plot = graph(markup)
    const clippedLine = plot.match(/<g clip-path="url\(#([^)]+)\)"><line class="numeric-scatter-chart-fit"[^>]*>/)
    assert.ok(clippedLine)
    const clipPath = plot.match(/<clipPath id="([^"]+)"><rect[^>]*>/)
    assert.ok(clipPath)
    assert.equal(clippedLine[1], clipPath[1])
    const left = attribute(clipPath[0], 'x'), top = attribute(clipPath[0], 'y')
    const right = left + attribute(clipPath[0], 'width'), bottom = top + attribute(clipPath[0], 'height')
    const line = clippedLine[0]
    const marks = circles(markup)
    assert.equal(attribute(line, 'x1'), Math.min(...marks.map(point => point.cx)))
    assert.equal(attribute(line, 'x2'), Math.max(...marks.map(point => point.cx)))
    assert.ok(attribute(line, 'x1') > left && attribute(line, 'x2') < right)
    assert.ok(attribute(line, 'y1') > bottom && attribute(line, 'y2') < top)
    assert.doesNotMatch(markup, /onclick|onmouseover|data-tooltip|NaN|Infinity/)
  }
})
