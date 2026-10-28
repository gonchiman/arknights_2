import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/skill-kmeans-search-chart-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ SkillKMeansSearchChart: Chart } = await server.ssrLoadModule('/src/components/SkillKMeansSearchChart.tsx'))
})
after(async () => { await server?.close() })

const candidate = (k, silhouette, meanSquaredDistance = 1 / k) => ({
  k, seed: k + 10, silhouette, meanSquaredDistance, iterations: 4, stopReason: 'stable', actualK: k, eligible: true,
})
const render = props => renderToStaticMarkup(createElement(Chart, {
  candidates: [], metric: 'silhouette', selectedK: null, candidateK: null, onSelect: () => {}, ...props,
}))
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const tags = (markup, tag) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(match => match[0])
const byClass = (markup, tag, name) => tags(markup, tag).filter(value => (attr(value, 'class') ?? '').split(' ').includes(name))
const selectedLabel = markup => markup.match(/<text\b[^>]*class="skill-kmeans-search-selected-value"[^>]*>([^<]*)<\/text>/)
const plotBounds = markup => {
  const rect = byClass(markup, 'rect', 'skill-kmeans-search-axis')[0]
  assert.ok(rect, 'the plot has a rectangular frame')
  const left = Number(attr(rect, 'x')), top = Number(attr(rect, 'y'))
  return { left, top, right: left + Number(attr(rect, 'width')), bottom: top + Number(attr(rect, 'height')) }
}
function assertPointsInside(markup, count) {
  assert.doesNotMatch(markup, /NaN|Infinity|undefined/)
  const bounds = plotBounds(markup)
  const points = byClass(markup, 'circle', 'skill-kmeans-search-point')
  assert.equal(points.length, count)
  for (const point of points) {
    const x = Number(attr(point, 'cx')), y = Number(attr(point, 'cy'))
    assert.ok(x >= bounds.left && x <= bounds.right, `point x=${x} remains in its plot`)
    assert.ok(y >= bounds.top - 1e-8 && y <= bounds.bottom + 1e-8, `point y=${y} remains in its plot`)
  }
  return points
}

test('negative and constant silhouettes remain finite and inside their plot, including limits', () => {
  for (const values of [[-0.6, -0.2, 0.3], [-1, 0, 1], [-0.3, -0.3, -0.3], [0, 0, 0], [1, 1, 1], [-1, -1, -1]]) {
    const markup = render({ candidates: values.map((value, index) => candidate(index + 2, value)), selectedK: 3 })
    const points = assertPointsInside(markup, values.length)
    if (values.every(value => value === values[0])) assert.equal(new Set(points.map(point => attr(point, 'cy'))).size, 1)
    else assert.ok(Number(attr(points[0], 'cy')) > Number(attr(points.at(-1), 'cy')), 'larger scores appear higher')
    assert.equal(selectedLabel(markup)?.[1], new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 }).format(values[1]))
  }
})

test('constant and zero distance series remain finite without fabricating a knee candidate', () => {
  for (const value of [0, 0.002, 2]) {
    const markup = render({ candidates: [2, 3, 4].map(k => candidate(k, null, value)), metric: 'meanSquaredDistance', selectedK: 3 })
    const points = assertPointsInside(markup, 3)
    assert.equal(new Set(points.map(point => attr(point, 'cy'))).size, 1)
    assert.match(markup, /判定なし/)
    assert.equal(byClass(markup, 'button', 'skill-kmeans-search-candidate').length, 0)
    assert.match(markup, /平均二乗距離/)
  }
})

test('a missing silhouette splits the line instead of joining its neighbors', () => {
  const markup = render({ candidates: [candidate(2, 0.1), candidate(3, 0.2), candidate(4, null), candidate(5, 0.4), candidate(6, 0.5)], selectedK: 4 })
  assertPointsInside(markup, 4)
  const path = byClass(markup, 'path', 'skill-kmeans-search-line')[0]
  assert.deepEqual(attr(path, 'd').match(/[ML]/g), ['M', 'L', 'M', 'L'])
  assert.equal(selectedLabel(markup), null, 'a missing value must not receive a numeric annotation')
  assert.equal(byClass(markup, 'circle', 'selected').length, 0)
})

test('recommendation and selected K remain distinct, and annotations follow the selection', () => {
  const candidates = [candidate(2, 0.6), candidate(3, -0.2), candidate(4, 0.1)]
  const markup = render({ candidates, candidateK: 2, selectedK: 3 })
  assert.match(markup, /シルエットスコアの候補 K = 2を選択/)
  assert.match(markup, /候補 K = 2<\/button>/)
  assert.equal(selectedLabel(markup)?.[1], '-0.2')
  assert.match(selectedLabel(markup)?.[0] ?? '', /選択 K = 3、シルエットスコア -0.2/)
  const selected = byClass(markup, 'circle', 'selected')
  assert.equal(selected.length, 1)
  const points = byClass(markup, 'circle', 'skill-kmeans-search-point')
  assert.equal(attr(selected[0], 'cx'), attr(points[1], 'cx'))
  const changed = render({ candidates, candidateK: 2, selectedK: 4 })
  assert.equal(selectedLabel(changed)?.[1], '0.1')
  assert.doesNotMatch(changed, /<dl\b/, 'the figure does not duplicate the parent selection readout')
})

test('endpoint labels anchor inward and choose the available side of the plot vertically', () => {
  const candidates = [candidate(2, 1), candidate(3, 0), candidate(4, -1)]
  for (const [k, anchor, below] of [[2, 'start', true], [4, 'end', false]]) {
    const markup = render({ candidates, selectedK: k })
    const bounds = plotBounds(markup)
    const label = selectedLabel(markup)?.[0]
    assert.ok(label)
    assert.equal(attr(label, 'text-anchor'), anchor)
    const labelX = Number(attr(label, 'x')), labelY = Number(attr(label, 'y'))
    assert.ok(labelX > bounds.left && labelX < bounds.right)
    assert.ok(labelY > bounds.top && labelY < bounds.bottom)
    const point = byClass(markup, 'circle', 'selected')[0]
    assert.equal(labelY > Number(attr(point, 'cy')), below)
  }
})

test('no candidates and all missing silhouettes show states without invalid paths or labels', () => {
  const empty = render({ selectedK: 2, candidateK: 2 })
  assert.match(empty, /未探索/)
  assert.match(empty, /判定なし/)
  assertPointsInside(empty, 0)
  const missing = render({ candidates: [candidate(2, null), candidate(3, null)], selectedK: 2, candidateK: 2 })
  assert.match(missing, /算出不可/)
  assert.match(missing, /判定なし/)
  assertPointsInside(missing, 0)
  assert.equal(selectedLabel(missing), null)
  assert.equal(byClass(missing, 'button', 'skill-kmeans-search-candidate').length, 0)
})
