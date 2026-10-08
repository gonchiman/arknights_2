import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let chart
let image
let filename

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/main-enemy-trend-chart-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false },
    appType: 'custom',
  })
  chart = await server.ssrLoadModule('/src/components/MainEnemyTrendChart.tsx')
  image = await server.ssrLoadModule('/src/components/MainEnemyTrendImage.tsx')
  filename = await server.ssrLoadModule('/src/lib/mainEnemyTrendImageFilename.ts')
})

after(async () => { await server?.close() })

const decode = value => value.replace(/&(?:amp|quot|lt|gt|#39|#x27);/g, entity => ({
  '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#x27;': "'",
})[entity])

// Inspect the rendered SVG and accessible text, rather than implementation source.
function parseMarkup(markup) {
  const root = { tag: 'root', attrs: {}, children: [] }
  const stack = [root]
  for (const token of markup.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (token.startsWith('</')) { stack.pop(); continue }
    if (!token.startsWith('<')) { stack.at(-1).children.push(decode(token)); continue }
    const tag = token.match(/^<([\w-]+)/)?.[1]
    if (!tag) continue
    const attrs = Object.fromEntries([...token.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .map(([, name, value]) => [name, decode(value)]))
    const node = { tag, attrs, children: [] }
    stack.at(-1).children.push(node)
    if (!token.endsWith('/>') && !['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) stack.push(node)
  }
  return root
}
const elements = (node, predicate) => node.children.flatMap(child => typeof child === 'string'
  ? [] : [...(predicate(child) ? [child] : []), ...elements(child, predicate)])
const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join('')
const seriesElements = (node, series, tag) => elements(node,
  child => child.attrs['data-series'] === series && (!tag || child.tag === tag))
const close = (actual, expected, message) => assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-8,
  message ?? `${actual} != ${expected}`)

const point = (chapter, mean = 100, median = 60, patch = {}) => ({
  chapter, label: chapter === 0 ? '序章' : `${chapter}章`, mean, median,
  includedMaps: 4, totalMaps: 4, missingCount: 0, ...patch,
})
function renderPlot(props = {}) {
  return parseMarkup(renderToStaticMarkup(createElement(chart.MainEnemyTrendPlot, {
    points: [point(0), point(1, 200, 120)], metric: 'hp', kind: 'line',
    showMean: true, showMedian: true, width: 960, height: 334, ...props,
  })))
}
function renderLegend(props = {}) {
  return parseMarkup(renderToStaticMarkup(createElement(chart.MainEnemyTrendLegend, {
    showMean: true, showMedian: true, kind: 'line', ...props,
  })))
}

function assertFiniteGeometry(root) {
  for (const node of elements(root, () => true)) {
    for (const [name, value] of Object.entries(node.attrs)) {
      if (['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'width', 'height'].includes(name)) {
        assert.ok(Number.isFinite(Number(value)), `${node.tag}.${name} must be finite: ${value}`)
      }
      if (['d', 'viewBox', 'transform'].includes(name)) assert.doesNotMatch(value, /NaN|Infinity/)
    }
  }
}

function renderedEdges(paths) {
  const edges = []
  for (const path of paths) {
    const tokens = path.attrs.d.match(/[ML]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []
    let previous
    for (let i = 0; i < tokens.length;) {
      const command = tokens[i++]
      assert.ok(command === 'M' || command === 'L', `unexpected line command ${command}`)
      const current = [Number(tokens[i++]), Number(tokens[i++])]
      if (command === 'L') { assert.ok(previous); edges.push([previous, current]) }
      previous = current
    }
  }
  return edges
}

test('missing mean and median points split their own paths and are never plotted as zero', () => {
  const points = [point(0, 10, 6), point(1, 20, null), point(2, null, 9), point(3, 40, 12), point(4, 0, 0)]
  const rendered = renderPlot({ points })
  for (const [series, expectedChapters, expectedConnections] of [
    ['mean', [0, 1, 3, 4], [[0, 1], [3, 4]]],
    ['median', [0, 2, 3, 4], [[2, 3], [3, 4]]],
  ]) {
    const markers = seriesElements(rendered, series, 'circle')
    assert.deepEqual(markers.map(marker => Number(marker.attrs['data-chapter'])), expectedChapters)
    const byChapter = new Map(markers.map(marker => [Number(marker.attrs['data-chapter']), marker]))
    const edges = renderedEdges(seriesElements(rendered, series, 'path'))
    assert.equal(edges.length, expectedConnections.length)
    expectedConnections.forEach(([from, to], index) => {
      const start = byChapter.get(from)
      const end = byChapter.get(to)
      close(edges[index][0][0], start.attrs.cx)
      close(edges[index][0][1], start.attrs.cy)
      close(edges[index][1][0], end.attrs.cx)
      close(edges[index][1][1], end.attrs.cy)
    })
    assert.ok(byChapter.has(4), 'a real zero retains its marker')
  }
  assertFiniteGeometry(rendered)
  const omittedChapter = renderPlot({ points: points.filter(item => item.chapter !== 2), showMedian: false })
  assert.equal(renderedEdges(seriesElements(omittedChapter, 'mean', 'path')).length, 2,
    'an absent chapter also breaks the line instead of joining chapters one and three')
})

test('partial coverage is white in line markers and translucent in bars, including zero', () => {
  const points = [point(0, 10, 6), point(1, 0, 0, { includedMaps: 1, totalMaps: 3, missingCount: 2 })]
  const zeroPositions = new Map()
  for (const kind of ['line', 'bar']) {
    const rendered = renderPlot({ points, kind })
    for (const series of ['mean', 'median']) {
      const marks = seriesElements(rendered, series, kind === 'line' ? 'circle' : 'rect')
      const complete = marks.find(mark => mark.attrs['data-chapter'] === '0')
      const partial = marks.find(mark => mark.attrs['data-chapter'] === '1')
      assert.ok(complete)
      assert.ok(partial, 'partial zero is known data and must not disappear')
      assert.notEqual(complete.attrs['data-partial-coverage'], 'true')
      assert.equal(partial.attrs['data-partial-coverage'], 'true')
      if (kind === 'line') {
        assert.notEqual(complete.attrs.fill, '#fff')
        assert.equal(partial.attrs.fill, '#fff')
        assert.ok(partial.attrs.stroke, 'white marker retains its series outline')
        zeroPositions.set(series, Number(partial.attrs.cy))
      } else {
        close(partial.attrs['fill-opacity'], 0.4)
        close(Number(complete.attrs['fill-opacity'] ?? 1), 1)
        close(partial.attrs.y, zeroPositions.get(series), 'the zero bar starts at the same baseline as its zero marker')
        assert.ok(Number(partial.attrs.height) >= 0 && Number(partial.attrs.height) <= 1,
          'zero keeps at most a minimal visible mark rather than a positive-value bar')
      }
    }
    assertFiniteGeometry(rendered)
  }
})

test('a partially counted map stays visibly incomplete even when every map contributes data', () => {
  const partialPoint = point(12, 80000, 80000, { partialMaps: 1 })
  const points = [point(11, 50000, 50000), partialPoint, point(13, 60000, 60000, { partialMaps: 2 })]
  for (const kind of ['line', 'bar']) {
    const screen = renderPlot({ points, kind, onSelectChapter: () => {} })
    const exported = parseMarkup(renderToStaticMarkup(createElement(image.MainEnemyTrendImage, {
      snapshot: { id: 'partial-map-regression', points, metric: 'hp', kind,
        showMean: true, showMedian: true, conditions: 'ボスのみ・出現体数・11〜13章', filename: 'test.png' },
    })))
    for (const rendered of [screen, exported]) {
      const marks = seriesElements(rendered, 'mean', kind === 'line' ? 'circle' : 'rect')
      assert.equal(marks.length, 3, 'known fixed boss data is plotted instead of becoming a gap')
      assert.equal(marks[0].attrs['data-partial-coverage'], undefined)
      assert.equal(marks[1].attrs['data-partial-coverage'], 'true')
      assert.equal(marks[2].attrs['data-partial-coverage'], 'true')
      assert.match(text(marks[1]), /一部集計 1マップ/)
      if (kind === 'line') assert.equal(marks[1].attrs.fill, '#fff')
      else close(marks[1].attrs['fill-opacity'], 0.4)
      assertFiniteGeometry(rendered)
    }
    assert.match(text(exported), /一部集計・欠測/)
    const control = elements(screen, node => node.attrs['data-chapter-target'] === '12')[0]
    assert.match(control.attrs['aria-label'], /一部集計 1マップ/)
  }
})

test('empty, all-missing and all-zero data retain finite axes in both chart kinds', () => {
  for (const kind of ['line', 'bar']) {
    for (const points of [[], [point(0, null, null)], [point(0, 0, 0), point(1, 0, 0)]]) {
      const rendered = renderPlot({ points, kind })
      assert.equal(elements(rendered, node => node.tag === 'svg').length, 1)
      assertFiniteGeometry(rendered)
      assert.ok(elements(rendered, node => node.tag === 'text').some(node => text(node) === '0'), 'zero remains an axis tick')
      const marks = ['mean', 'median'].flatMap(series => seriesElements(rendered, series, kind === 'line' ? 'circle' : 'rect'))
      assert.equal(marks.length, points.every(item => item.mean === 0) ? points.length * 2 : 0)
    }
  }
  assert.equal(chart.MAIN_ENEMY_TREND_NATURAL_HEIGHT, 334)
})

test('metric titles and mean/median visibility agree in plots and legends', () => {
  for (const [metric, label] of [['hp', 'HP'], ['atk', '攻撃力'], ['def', '防御力'], ['res', '術耐性']]) {
    for (const kind of ['line', 'bar']) {
      for (const [showMean, showMedian] of [[true, true], [true, false], [false, true], [false, false]]) {
        const rendered = renderPlot({ metric, kind, showMean, showMedian })
        const legend = renderLegend({ kind, showMean, showMedian, showPartialCoverage: false })
        assert.ok(elements(rendered, node => node.tag === 'text').some(node => text(node) === label), `${metric}: vertical axis`)
        assert.equal(text(elements(rendered, node => node.tag === 'title')[0]), `${label}の章別推移`)
        assert.equal(seriesElements(rendered, 'mean', kind === 'line' ? 'circle' : 'rect').length, showMean ? 2 : 0)
        assert.equal(seriesElements(rendered, 'median', kind === 'line' ? 'circle' : 'rect').length, showMedian ? 2 : 0)
        assert.equal(text(legend).includes('平均'), showMean)
        assert.equal(text(legend).includes('中央値'), showMedian)
      }
    }
  }
  assert.ok(text(renderLegend({ showPartialCoverage: true })).includes('一部'))
})

test('chapters zero through sixteen have accessible selection and coverage readouts', () => {
  const points = Array.from({ length: 17 }, (_, chapter) => point(chapter, chapter * 10, chapter * 6,
    chapter === 16 ? { includedMaps: 3, totalMaps: 17, missingCount: 2 } : {}))
  const rendered = renderPlot({ points, selectedChapter: 16, onSelectChapter: () => {} })
  const controls = elements(rendered, node => node.attrs.role === 'button')
  assert.equal(controls.length, 17)
  const chapterTicks = elements(rendered, node => node.tag === 'text'
    && node.attrs.class?.split(' ').includes('main-enemy-trend-tick') && node.attrs['text-anchor'] === 'middle')
  assert.deepEqual(chapterTicks.map(text), Array.from({ length: 17 }, (_, chapter) => String(chapter)))
  assert.ok(elements(rendered, node => node.tag === 'svg' && node.attrs.role === 'group').length === 1)
  assert.equal(controls.filter(node => node.attrs['aria-pressed'] === 'true').length, 1)
  for (const chapter of [0, 16]) {
    const control = controls.find(node => node.attrs['data-chapter-target'] === String(chapter))
    assert.ok(control, `chapter ${chapter} can be selected`)
    assert.equal(control.attrs.tabindex, '0')
    assert.ok(control.attrs['aria-label']?.includes(chapter === 0 ? '序章' : '16章'))
    assert.equal(control.attrs['aria-pressed'], chapter === 16 ? 'true' : 'false')
  }
  const last = controls.find(node => node.attrs['data-chapter-target'] === '16')
  const readout = text(last) + (last.attrs['aria-label'] ?? '')
  assert.ok(readout.includes('160') && readout.includes('96'), 'selected chapter exposes both values')
  assert.match(readout, /3\s*\/\s*17/)
  assert.match(readout, /欠測[^\d]*2|不足[^\d]*2|不明[^\d]*2/)
  const staticPlot = renderPlot({ points })
  assert.equal(elements(staticPlot, node => node.attrs.role === 'button').length, 0)
})

test('frame mode suppresses the internal horizontal title while retaining metric and chapter ticks', () => {
  const plain = renderPlot()
  const framed = renderPlot({ showAxisTitle: false })
  const labels = root => elements(root, node => node.tag === 'text').map(text)
  assert.equal(labels(plain).filter(label => label === '章').length, 1)
  assert.equal(labels(framed).filter(label => label === '章').length, 0)
  assert.equal(labels(framed).filter(label => label === 'HP').length, 1)
  assert.ok(labels(framed).includes('0'))
  assert.ok(labels(framed).includes('1'))
})

test('image filenames identify effective controls but never encode result values', () => {
  const settings = { metric: 'hp', chapterRange: [0, 16], enemyKind: 'normal', weighting: 'types',
    kind: 'line', showMean: true, showMedian: true }
  const create = filename.createMainEnemyTrendImageFilename
  const original = create(settings)
  assert.match(original, /\.png$/)
  assert.ok(!/[<>:"/\\|?*]/.test(original))
  for (const patch of [{ metric: 'atk' }, { metric: 'def' }, { metric: 'res' }, { chapterRange: [1, 16] },
    { chapterRange: [0, 15] }, { enemyKind: 'boss' }, { weighting: 'spawns' }, { kind: 'bar' },
    { showMean: false }, { showMedian: false }]) {
    assert.notEqual(create({ ...settings, ...patch }), original, JSON.stringify(patch))
  }
  const changedResults = { ...settings, points: [point(0, 987654321, 123456789)], mean: 987654321,
    median: 123456789, includedMaps: 98765, totalMaps: 12345, missingCount: 54321 }
  assert.equal(create(changedResults), original)
  assert.doesNotMatch(original, /987654321|123456789|98765|12345|54321/)
  assert.equal(create({ ...settings }), original)
})
