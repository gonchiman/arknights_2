import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/skill-kmeans-learning-chart-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ SkillKMeansLearningChart: Chart } = await server.ssrLoadModule('/src/components/SkillKMeansLearningChart.tsx'))
})
after(async () => { await server?.close() })

const point = (iteration, meanSquaredDistance, changes = iteration === 0 ? null : 0) => ({ iteration, meanSquaredDistance, changes })
const result = (history, overrides = {}) => ({
  config: { k: 3, seed: 2, maxIterations: 30 }, iteration: history.at(-1)?.iteration ?? 0,
  converged: false, stopReason: null, assignments: [], counts: [], representativeTerms: [], representativeIndices: [],
  history, ...overrides,
})
const render = (history, overrides = {}, props = {}) => renderToStaticMarkup(createElement(Chart, { result: result(history, overrides), ...props }))
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const tags = (markup, tag) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(match => match[0])
const byClass = (markup, tag, name) => tags(markup, tag).filter(value => (attr(value, 'class') ?? '').split(' ').includes(name))
const metric = (markup, name) => markup.match(new RegExp(`<dt>${name}</dt><dd>([^<]*)</dd>`))?.[1]
function assertValidPoints(markup, count) {
  assert.doesNotMatch(markup, /NaN|Infinity|undefined/)
  const axis = byClass(markup, 'path', 'skill-kmeans-learning-axis')[0]
  const [, left, top, bottom, right] = attr(axis, 'd').match(/^M([^,]+),([^V]+)V([^H]+)H(.+)$/).map(Number)
  const points = byClass(markup, 'circle', 'skill-kmeans-learning-point')
  assert.equal(points.length, count)
  for (const point of points) {
    const x = Number(attr(point, 'cx')), y = Number(attr(point, 'cy'))
    assert.ok(x >= left && x <= right, `point x=${x} remains in its plot`)
    assert.ok(y >= top - 1e-8 && y <= bottom + 1e-8, `point y=${y} remains in its plot`)
  }
  return points
}

test('empty history has no line or samples and disables iteration selection', () => {
  const markup = render([])
  assertValidPoints(markup, 0)
  assert.equal(byClass(markup, 'path', 'skill-kmeans-learning-line').length, 0)
  assert.match(markup, /未学習/)
  assert.match(tags(markup, 'select')[0], / disabled=""/)
  for (const name of ['反復回数', '平均二乗距離', '所属変更']) assert.equal(metric(markup, name), '—')
})

test('initialization is a selectable single point, including a zero objective', () => {
  for (const value of [0, 0.45]) {
    const markup = render([point(0, value)])
    assertValidPoints(markup, 1)
    assert.equal(metric(markup, '反復回数'), '0回')
    assert.equal(metric(markup, '所属変更'), '初期化')
    assert.equal(metric(markup, '平均二乗距離'), String(value))
    assert.equal(byClass(markup, 'circle', 'selected').length, 1)
    assert.match(markup, /<option value="0">0回（初期化）<\/option>/)
    assert.doesNotMatch(tags(markup, 'select')[0], /disabled/)
  }
})

test('constant, zero and very small objectives remain finite and are not displayed as zero', () => {
  for (const value of [0, 0.002, 2, 0.0000002]) {
    const markup = render([point(0, value), point(1, value), point(2, value)])
    const points = assertValidPoints(markup, 3)
    assert.equal(new Set(points.map(point => attr(point, 'cy'))).size, 1)
    assert.equal(metric(markup, '反復回数'), '2回')
    assert.equal(metric(markup, '平均二乗距離'), value === 0.0000002 ? '2.00e-7' : String(value))
  }
})

test('one history selects its latest recorded values without A/B labels or a comparison table', () => {
  const markup = render([point(0, 1), point(1, 0.78, 70), point(2, 0.65, 12)])
  const points = assertValidPoints(markup, 3)
  assert.ok(Number(attr(points[0], 'cy')) < Number(attr(points[2], 'cy')))
  const selected = byClass(markup, 'circle', 'selected')
  assert.equal(selected.length, 1)
  assert.equal(attr(selected[0], 'cx'), attr(points[2], 'cx'))
  assert.equal(metric(markup, '反復回数'), '2回')
  assert.equal(metric(markup, '平均二乗距離'), '0.65')
  assert.equal(metric(markup, '所属変更'), '12件')
  assert.match(markup, /<option value="latest" selected="">最新<\/option>/)
  assert.doesNotMatch(markup, /実験 ?[AB]|各実験|<table\b|legend/)
})

test('only finite, nonnegative, recorded iterations receive points or selection options', () => {
  const markup = render([point(4, 0.5, 3), point(0, 1), point(2, 0.8, 20), point(2, 0.7, 15),
    point(1, NaN), point(3, -0.1), point(-1, 0.1), point(1.5, 0.9)])
  const points = assertValidPoints(markup, 3)
  assert.ok(Number(attr(points[0], 'cx')) < Number(attr(points[1], 'cx')))
  assert.ok(Number(attr(points[1], 'cx')) < Number(attr(points[2], 'cx')))
  assert.deepEqual(tags(markup, 'option').map(option => attr(option, 'value')), ['latest', '0', '2', '4'])
  assert.equal(metric(markup, '平均二乗距離'), '0.5')
})

test('convergence and iteration limits remain distinguishable, and supplied run status is preserved', () => {
  const history = [point(0, 1), point(1, 0.8)]
  for (const stopReason of ['stable-assignments', 'tolerance']) {
    const markup = render(history, { stopReason, converged: true })
    assert.match(markup, /収束/)
    assert.doesNotMatch(markup, /反復上限/)
  }
  const limited = render(history, { stopReason: 'max-iterations' })
  assert.match(limited, /反復上限/)
  assert.doesNotMatch(limited, /収束/)
  const paused = render(history, {}, { status: createElement('span', { role: 'status' }, '一時停止') })
  assert.match(paused, /<span role="status">一時停止<\/span>/)
  assert.doesNotMatch(paused, /反復上限|収束/)
  for (const stopReason of ['stable-assignments', 'max-iterations']) {
    const hiddenStatus = render(history, { stopReason }, { status: null })
    assert.doesNotMatch(hiddenStatus, /反復上限|収束|skill-kmeans-stop-state/)
  }
})
