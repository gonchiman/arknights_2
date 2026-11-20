import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import {
  createEnemyRatingBarsOnlyDraft, createEnemyRatingVideoTimingDraft, parseEnemyRatingVideoTiming,
} from '../src/lib/enemyRatingVideoTiming.ts'

const fixtureId = '\0rating-video-band-fixture'
const fixtureSource = `
  export const state = { surface: null, size: null, captures: 0 }
  export async function withComparisonChartImageSurface(_source, capture) {
    return capture(state.surface, state.size)
  }
  export async function toCanvas(surface) {
    for (const element of surface.querySelectorAll('[data-rating-video-band]')) {
      if (element.style.visibility !== 'hidden') throw new Error('Band remains in text raster')
    }
    state.captures++
    return { textRaster: true }
  }
  export async function recordChartVideo() { throw new Error('Encoding is outside this test') }
`

let server, fixture, prepare, originalGlobals
before(async () => {
  server = await createServer({ configFile: false, plugins: [{
    name: 'rating-video-band-fixture', enforce: 'pre',
    resolveId(id, importer) {
      if (id === fixtureId || id === 'html-to-image' || importer?.endsWith('/renderEnemyRatingComparisonVideo.ts')
        && ['./saveComparisonChartImage', '../lib/chartVideoRecorder'].includes(id)) return fixtureId
    },
    load(id) { if (id === fixtureId) return fixtureSource },
  }], cacheDir: 'node_modules/.vite/rating-video-band-test', logLevel: 'error', ssr: { noExternal: ['html-to-image'] },
  server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  fixture = await server.ssrLoadModule(fixtureId)
  ;({ prepareEnemyRatingComparisonVideo: prepare }
    = await server.ssrLoadModule('/src/components/renderEnemyRatingComparisonVideo.ts'))
})
after(async () => { await server?.close() })

const rectangle = (x, y, width, height) => ({ left: x, top: y, width, height })
function element(attributes, box, extra = {}) {
  return { attributes, style: {}, ...extra,
    getAttribute(name) { return this.attributes[name] ?? null },
    hasAttribute(name) { return name in this.attributes },
    getBoundingClientRect() { return box },
  }
}

function makeSurface() {
  const svg = element({}, rectangle(0, 0, 100, 100))
  const elements = []
  const make = (attributes, box, extra) => {
    const result = element(attributes, box, extra)
    elements.push(result)
    return result
  }
  function label(attributes, x, y) {
    return make(attributes, rectangle(x - 4, y - 8, 8, 10), {
      ownerSVGElement: svg, getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1 }),
      x: { baseVal: { getItem: () => ({ value: x }) } }, y: { baseVal: { getItem: () => ({ value: y }) } },
    })
  }
  const phaseBands = []
  for (let rank = 0; rank < 2; rank++) {
    const y = 20 + rank * 20
    phaseBands.push(make({ 'data-rating-video-band': 'ranks', 'data-rating-video-band-row': String(rank) }, rectangle(44, y, 12, 18)))
    label({ 'data-rating-video-rank': String(rank) }, 50, y + 12)
    for (const [metric, x, direction] of [['defense', 10, -1], ['magicResistance', 90, 1]]) {
      phaseBands.push(make({ 'data-rating-video-band': 'values', 'data-rating-video-band-row': String(rank) }, rectangle(x - 9, y, 18, 18)))
      label({ 'data-rating-video-value': String(rank), 'data-rating-video-metric': metric,
        'data-rating-video-value-mode': 'cumulative', 'data-rating-video-share': rank === 0 ? '.2' : '.8',
        'data-rating-video-cumulative': rank === 0 ? '.2' : '1' }, x, y + 12)
      make({ 'data-rating-video-bar': String(direction), 'data-rating-video-bar-rank': String(rank),
        'data-color': metric === 'defense' ? '#387590' : '#a85b2e' }, rectangle(direction < 0 ? 30 : 60, y + 4, 10, 10))
    }
  }
  make({ 'data-rating-video-guide': '0' }, rectangle(30, 20, 0, 40))
  make({ 'data-rating-video-highlight': '0' }, rectangle(0, 20, 100, 20))
  const frame = element({}, rectangle(0, 0, 100, 100))
  const surface = element({}, rectangle(0, 0, 100, 100), {
    querySelector(selector) { return selector === '.chart-image-frame' ? frame : this.querySelectorAll(selector)[0] ?? null },
    querySelectorAll(selector) {
      const match = /^\[([^=\]]+)(?:="([^"]+)")?\]$/.exec(selector)
      return match ? elements.filter(el => el.hasAttribute(match[1]) && (match[2] === undefined || el.getAttribute(match[1]) === match[2])) : []
    },
  })
  return { surface, phaseBands }
}

beforeEach(() => {
  originalGlobals = Object.fromEntries(['getComputedStyle', 'DOMPoint'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: element => ({
    fill: element.getAttribute('data-color') ?? '#666', fillOpacity: element.hasAttribute('data-rating-video-band') ? '.06'
      : element.hasAttribute('data-rating-video-highlight') ? '.07' : '1',
    stroke: '#ccc', strokeWidth: '1', fontSize: '11px', fontStyle: 'normal', fontWeight: '600',
    fontFamily: 'sans-serif', textAnchor: 'middle',
  }) })
  Object.defineProperty(globalThis, 'DOMPoint', { configurable: true, value: class {
    constructor(x, y) { this.x = x; this.y = y }
    matrixTransform() { return this }
  } })
  const { surface, phaseBands } = makeSurface()
  fixture.state.surface = surface
  fixture.state.bands = phaseBands
  fixture.state.size = { width: 100, height: 100, canvasWidth: 200, canvasHeight: 200 }
  fixture.state.captures = 0
})
afterEach(() => {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

const timing = {
  title: { start: 0, duration: 1 }, axes: { start: 1, duration: 1 },
  ranks: { start: 2, duration: 1 }, bars: { start: 3, duration: 1 }, values: { start: 4, duration: 1 },
  hold: 0, textMode: 'stagger', barMode: 'stagger', guideMode: 'stagger', valueMode: 'fixed',
}
function draw(animation, seconds) {
  const operations = []
  const context = {
    globalAlpha: 1, fillStyle: '#fff',
    fillRect(x, y, width, height) { operations.push({ kind: 'rect', x, y, width, height, alpha: this.globalAlpha, color: this.fillStyle }) },
    drawImage(image, ...coordinates) { operations.push({ kind: 'text', image, coordinates, alpha: this.globalAlpha }) },
    save() {}, restore() {}, fillText(value, x, y) { operations.push({ kind: 'dynamic', value, x, y }) },
  }
  animation.drawFrame(context, seconds)
  return operations
}
const visibleBands = operations => operations.filter(op => op.kind === 'rect' && Math.abs(op.alpha - .06) < 1e-9)

test('帯背景は文字のラスタ画像から除き、階級・割合と同じ順序で現れる', async () => {
  const animation = await prepare(null, timing, { width: 200 })
  assert.equal(fixture.state.captures, 1)
  assert.ok(fixture.state.bands.every(band => band.style.visibility === 'hidden'))
  assert.equal(visibleBands(draw(animation, 1.9)).length, 0)
  assert.equal(visibleBands(draw(animation, 2)).length, 1, '最初の評価の背景が評価文字と同時に出る')
  assert.equal(visibleBands(draw(animation, 2.2)).length, 2)
  assert.equal(visibleBands(draw(animation, 4.15)).length, 4, '評価2セルに加え、最初の左右割合だけを表示する')
  const finished = draw(animation, 5)
  const bands = visibleBands(finished)
  assert.equal(bands.length, 6)
  assert.equal(bands.filter(op => op.width === 36 && op.height === 36).length, 4,
    '文字の外接矩形だけでなく割合セル全体を描く')
  assert.equal(bands.filter(op => op.width === 24 && op.height === 36).length, 2)
  assert.ok(finished.findIndex(op => op.alpha === .07) < finished.findIndex(op => op.alpha === .06), '強調行の上に帯を重ねる')
  assert.ok(finished.findIndex(op => op.kind === 'text') > finished.findLastIndex(op => op.alpha === .06), '帯を文字より先に描く')
})

test('割合連動では割合の帯を棒の開始時に表示し、評価帯は独立して順に出す', async () => {
  const animation = await prepare(null, { ...timing, barMode: 'grow', valueMode: 'linked' }, { width: 200 })
  assert.equal(visibleBands(draw(animation, 2.9)).length, 2)
  const start = draw(animation, 3)
  assert.equal(visibleBands(start).length, 6)
  assert.equal(start.filter(op => op.kind === 'dynamic').length, 4)
  assert.equal(visibleBands(draw(animation, 5)).length, 6)
})

test('棒だけを動かす場合は全ての帯を最初から表示し、再タイミングでも背景を残す', async () => {
  const draft = createEnemyRatingBarsOnlyDraft(createEnemyRatingVideoTimingDraft())
  assert.ok(draft)
  const parsed = parseEnemyRatingVideoTiming({ ...draft, valueMode: 'linked' })
  assert.ok(parsed.timing)
  const animation = await prepare(null, parsed.timing, { width: 200 })
  assert.equal(visibleBands(draw(animation, 0)).length, 6)
  const retimed = animation.withTiming(timing)
  assert.equal(fixture.state.captures, 1, '文字のラスタ画像は再利用する')
  assert.equal(visibleBands(draw(retimed, 1)).length, 0)
  assert.equal(visibleBands(draw(retimed, 5)).length, 6)
})
