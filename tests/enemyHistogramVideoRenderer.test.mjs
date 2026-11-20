import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

const fixtureId = '\0histogram-video-renderer-fixture'
const fixtureSource = `
  export const state = { surface: null, size: null, captures: [], abort: null }
  export async function withComparisonChartImageSurface(_source, capture) { return capture(state.surface, state.size) }
  export async function toCanvas(surface) {
    const image = { kind: state.captures.length ? 'background' : 'completed',
      visible: surface.elements.filter(element => element.style.visibility !== 'hidden').map(element => element.attributes) }
    state.captures.push(image)
    state.abort?.()
    return image
  }
  export async function recordChartVideo() { throw new Error('Encoding is outside this test') }
`
let server, fixture, prepare, originalGlobals
before(async () => {
  server = await createServer({ configFile: false, plugins: [{
    name: 'histogram-video-renderer-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (id === fixtureId || id === 'html-to-image' || importer?.endsWith('/renderEnemyHistogramVideo.ts')
        && ['./saveComparisonChartImage', '../lib/chartVideoRecorder'].includes(id)) return fixtureId
    },
    load(id) { if (id === fixtureId) return fixtureSource },
  }], cacheDir: 'node_modules/.vite/histogram-video-renderer-test', logLevel: 'error', ssr: { noExternal: ['html-to-image'] },
  server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  fixture = await server.ssrLoadModule(fixtureId)
  ;({ prepareEnemyHistogramVideo: prepare } = await server.ssrLoadModule('/src/components/renderEnemyHistogramVideo.ts'))
})
after(async () => { await server?.close() })

class Matrix {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { Object.assign(this, { a, b, c, d, e, f }) }
  inverse() { return new Matrix(1 / this.a, 0, 0, 1 / this.d, -this.e / this.a, -this.f / this.d) }
  multiply(other) {
    return new Matrix(this.a * other.a, this.b * other.a, this.c * other.d, this.d * other.d,
      this.a * other.e + this.c * other.f + this.e, this.b * other.e + this.d * other.f + this.f)
  }
}
const value = number => ({ baseVal: { value: number, getItem: () => ({ value: number }) } })
function element(attributes, extra = {}) {
  const result = { attributes, style: {}, textContent: '', getScreenCTM: () => new Matrix(),
    getAttribute(name) { return this.attributes[name] ?? null },
    setAttribute(name, value) { this.attributes[name] = value }, ...extra }
  for (const key of ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'x1', 'x2', 'y1', 'y2']) {
    result[key] = value(Number(attributes[key] ?? 0))
  }
  return result
}
function matches(element, selector) {
  if (selector.startsWith('.')) return (element.attributes.class ?? '').split(' ').includes(selector.slice(1))
  const attribute = /^\[([^=\]]+)(?:="([^"]+)")?\]$/.exec(selector)
  return attribute && attribute[1] in element.attributes
    && (attribute[2] === undefined || element.attributes[attribute[1]] === attribute[2])
}
function makeSurface({ counts = [20, 30, 50], frequencies = true, strips = true, cumulative = true, references = false } = {}) {
  const elements = []
  const make = (attributes, extra) => { const result = element(attributes, extra); elements.push(result); return result }
  const total = counts.reduce((sum, count) => sum + count, 0)
  const svg = element({ 'data-histogram-video-total': String(total), 'data-histogram-video-count-maximum': '100',
    'data-histogram-video-plot-left': '20', 'data-histogram-video-plot-right': '180',
    'data-histogram-video-plot-top': '20', 'data-histogram-video-plot-bottom': '180' }, {
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null },
    querySelectorAll(selector) { return elements.filter(element => selector.split(',').some(part => matches(element, part))) },
    append(element) { elements.push(element); element.remove = () => elements.splice(elements.indexOf(element), 1) },
  })
  make({ class: 'enemy-chart-frame' })
  make({ class: 'enemy-chart-gridline' })
  make({ class: 'chart-strip-fill' })
  let cumulativeCount = 0
  for (const [index, count] of counts.entries()) {
    const center = 20 + (index + .5) * 160 / counts.length
    make({ 'data-histogram-video-bar': String(index), 'data-histogram-video-count': String(count),
      x: String(center - 160 / counts.length / 2 + 1), y: String(180 - count / 100 * 160),
      width: String(160 / counts.length - 2), height: String(count / 100 * 160), 'data-fill': '#767676' })
    if (frequencies) make({ 'data-frequency-index': String(index),
      'data-histogram-video-label-width': '22', 'data-histogram-video-label-height': '20', x: String(center - 20), y: '0' }, {
      textContent: String(count), getScreenCTM: () => new Matrix(1, 0, 0, 1, 20, 20),
    })
    cumulativeCount += count
    if (strips) for (const [kind, y] of [['percentage', 8], ['cumulative', 16]]) {
      make({ 'data-histogram-video-value': kind, 'data-histogram-video-value-index': String(index), x: String(center), y: String(y) })
    }
    if (cumulative) make({ class: 'enemy-histogram-cumulative-point', cx: String(center),
      cy: String(180 - cumulativeCount / total * 160), r: '2.75', 'data-fill': '#cf6b1f' })
  }
  if (cumulative && counts.length > 1) make({ class: 'enemy-histogram-cumulative-line', 'data-stroke': '#cf6b1f' })
  if (references) {
    make({ class: 'enemy-chart-reference', x1: '100', x2: '100', y1: '20', y2: '180', 'data-stroke': '#217050' })
    make({ class: 'enemy-chart-reference-label', x: '100', y: '4' }, { textContent: '平均 100' })
  }
  const surface = { elements, querySelector: () => svg, getBoundingClientRect: () => ({ left: 0, top: 0 }) }
  fixture.state.surface = surface
  return { surface, svg }
}

beforeEach(() => {
  originalGlobals = Object.fromEntries(['getComputedStyle', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: element => ({
    fill: element.getAttribute('data-fill') ?? '#222', fillOpacity: element.getAttribute('data-histogram-video-bar') !== null ? '.72' : '1',
    stroke: element.getAttribute('data-stroke') ?? '#ccc', strokeWidth: '1', strokeOpacity: '1', opacity: '1',
    strokeDasharray: 'none', strokeLinecap: 'round', strokeLinejoin: 'round',
    fontSize: '12px', fontStyle: 'normal', fontWeight: '400', fontFamily: 'sans-serif', textAnchor: 'middle', dominantBaseline: 'central',
  }) })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: () => element({}) } })
  fixture.state.size = { width: 200, height: 200, canvasWidth: 400, canvasHeight: 400 }
  fixture.state.captures = []
  fixture.state.abort = null
  makeSurface()
})
afterEach(() => {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

const timing = { bars: { start: 1, duration: 2 }, values: { start: 3, duration: 2 }, hold: 0,
  textMode: 'stagger', barMode: 'grow', guideMode: 'stagger', valueMode: 'fixed' }
function draw(animation, seconds) {
  const operations = [], stack = []
  const context = {
    globalAlpha: 1, fillStyle: '#fff', matrix: new Matrix(),
    save() { stack.push({ matrix: this.matrix, globalAlpha: this.globalAlpha }) },
    restore() { Object.assign(this, stack.pop()) },
    setTransform(...args) { this.matrix = new Matrix(...args) },
    transform(...args) { this.matrix = this.matrix.multiply(new Matrix(...args)) },
    setLineDash() {}, beginPath() {}, moveTo() {},
    lineTo(x, y) { operations.push({ kind: 'line', x, y }) }, stroke() { operations.push({ kind: 'stroke', color: this.strokeStyle }) },
    arc(x, y, radius) { operations.push({ kind: 'point', x, y, radius }) }, fill() {},
    measureText(text) { return { width: text.length * 8 } },
    fillRect(x, y, width, height) { operations.push({ kind: 'bar', x, y, width, height, color: this.fillStyle, opacity: this.globalAlpha }) },
    fillText(text, x, y) { operations.push({ kind: 'text', text, x, y }) },
    drawImage(image) { operations.push({ kind: 'image', image }) },
  }
  animation.drawFrame(context, seconds)
  return operations
}

test('骨組みと帯背景は初めから残し、最終フレームは元の画像と一致する', async () => {
  const animation = await prepare(null, timing, { width: 400 })
  assert.equal(fixture.state.captures.length, 2)
  const background = fixture.state.captures[1]
  assert.ok(background.visible.some(attributes => attributes.class === 'enemy-chart-frame'))
  assert.ok(background.visible.some(attributes => attributes.class === 'chart-strip-fill'))
  assert.ok(background.visible.every(attributes => !('data-histogram-video-bar' in attributes)
    && !('data-histogram-video-value' in attributes) && !('data-frequency-index' in attributes)
    && !String(attributes.class).startsWith('enemy-histogram-cumulative')))
  const initial = draw(animation, 0)
  assert.equal(initial[0].image, background)
  assert.equal(initial.filter(op => op.kind === 'text' || op.kind === 'point').length, 0)
  assert.ok(initial.filter(op => op.kind === 'bar').every(op => op.height === 0))
  const final = draw(animation, 5)
  assert.deepEqual(final, [{ kind: 'image', image: fixture.state.captures[0] }])
  assert.equal(animation.withTiming({ ...timing, hold: 3 }).duration, 8)
  assert.equal(fixture.state.captures.length, 2, 'タイミング変更では再撮影しない')
})

test('Aは固定した総数を分母に棒・度数・割合・累積線を連動させる', async () => {
  const linked = { ...timing, bars: { start: 0, duration: 2 }, values: { start: 0, duration: 0 }, valueMode: 'linked' }
  const animation = await prepare(null, linked, { width: 400 })
  const midway = draw(animation, 1)
  assert.deepEqual(midway.filter(op => op.kind === 'bar').map(op => op.height), [16, 24, 40])
  assert.ok(midway.filter(op => op.kind === 'bar').every(op => op.color === '#767676' && op.opacity === .72))
  assert.deepEqual(midway.filter(op => op.kind === 'text' && op.y === 8).map(op => op.text), ['10', '15', '25'])
  assert.deepEqual(midway.filter(op => op.kind === 'text' && op.y === 16).map(op => op.text), ['10', '25', '50'])
  assert.deepEqual(midway.filter(op => op.kind === 'point').map(op => op.y), [164, 140, 100])
  assert.equal(midway.filter(op => op.kind === 'text' && op.y !== 8 && op.y !== 16).length, 3, '度数も全て更新する')
})

test('Bは棒の後に累積線と累積帯を左から同時に表示する', async () => {
  const animation = await prepare(null, timing, { width: 400 })
  const barsOnly = draw(animation, 2.9)
  assert.equal(barsOnly.filter(op => op.kind === 'point').length, 0)
  assert.equal(barsOnly.filter(op => op.kind === 'text' && op.y === 16).length, 0)
  const cumulativeStart = draw(animation, 3)
  assert.equal(cumulativeStart.filter(op => op.kind === 'point').length, 1)
  assert.deepEqual(cumulativeStart.filter(op => op.kind === 'text' && op.y === 16).map(op => op.text), ['20'])
  const cumulativeMiddle = draw(animation, 4)
  assert.equal(cumulativeMiddle.filter(op => op.kind === 'point').length, 2)
  assert.deepEqual(cumulativeMiddle.filter(op => op.kind === 'text' && op.y === 16).map(op => op.text), ['20', '50'])
})

test('1階級と多階級・空階級・帯や累積なしでも描画でき、基準線を棒の前面に保つ', async () => {
  for (const counts of [[100], Array.from({ length: 40 }, (_, index) => index % 3 === 0 ? 0 : 1)]) {
    makeSurface({ counts, frequencies: false, strips: false, cumulative: false, references: true })
    const animation = await prepare(null, { ...timing, barMode: 'staggerGrow' }, { width: 400 })
    const operations = draw(animation, 2)
    assert.equal(operations.filter(op => op.kind === 'bar').length, counts.length)
    assert.equal(operations.filter(op => op.kind === 'point').length, 0)
    assert.ok(operations.findIndex(op => op.kind === 'stroke' && op.color === '#217050')
      > operations.findLastIndex(op => op.kind === 'bar'), '基準線が成長する棒に隠れない')
    assert.ok(operations.some(op => op.kind === 'text' && op.text === '平均 100'))
    fixture.state.captures = []
  }
})

test('途中で長くなる小数度数を実測し、隣の度数と重ならないよう移動する', async () => {
  makeSurface({ counts: Array(5).fill(1.0001), strips: false, cumulative: false })
  const animation = await prepare(null, timing, { width: 400 })
  const operations = draw(animation, 2)
  const labels = operations.filter(op => op.kind === 'text')
  assert.equal(labels.length, 5)
  assert.ok(labels.every(op => op.text === '0.5'))
  assert.ok(new Set(labels.map(op => op.y)).size > 1, '完成時の幅で収まっても、途中の長い数値は別の行に移す')
  assert.ok(operations.some(op => op.kind === 'stroke'), '移動した値には引き出し線を残す')
})

test('開始前と画像生成中の中止を尊重する', async () => {
  const before = new AbortController()
  before.abort()
  await assert.rejects(prepare(null, timing, { width: 400 }, before.signal), { name: 'AbortError' })
  assert.equal(fixture.state.captures.length, 0)
  const during = new AbortController()
  fixture.state.abort = () => during.abort()
  await assert.rejects(prepare(null, timing, { width: 400 }, during.signal), { name: 'AbortError' })
  assert.equal(fixture.state.captures.length, 1)
})
