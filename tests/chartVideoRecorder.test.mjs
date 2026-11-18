import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createServer } from 'vite'

const fixtureModule = '\0chart-video-recorder-fixture'
const fixtureSource = `
  export const state = {}
  export function reset() {
    Object.assign(state, { events: [], frames: [], adding: false, output: null, source: null,
      onAdd: null, onFinalize: null, rejectAdd: null })
  }
  export class Quality { constructor(options) { this.options = options } }
  export class BufferTarget {}
  export class Mp4OutputFormat {}
  export class WebMOutputFormat {}
  export async function canEncodeVideo() { return true }
  export class CanvasSource {
    constructor(canvas) { this.canvas = canvas; state.source = this }
    async add(timestamp, duration) {
      if (state.adding) throw new Error('Concurrent frame encoding')
      state.adding = true
      const pixels = this.canvas.pixels
      try {
        await state.onAdd?.()
        if (this.canvas.pixels !== pixels) throw new Error('Canvas changed during encoding')
        state.frames.push({ timestamp, duration, pixels })
      } finally { state.adding = false }
    }
    close() { state.events.push('close') }
  }
  export class Output {
    constructor({ target }) { this.target = target; this.state = 'pending'; state.output = this }
    addVideoTrack(source, options) { state.trackOptions = options }
    async start() { this.state = 'started'; state.events.push('start') }
    async finalize() {
      state.events.push('finalize-start')
      await state.onFinalize?.()
      this.target.buffer = new Uint8Array([1, 2, 3]).buffer
      this.state = 'finalized'
      state.events.push('finalize-complete')
    }
    async cancel() {
      this.state = 'cancelled'
      state.events.push('cancel')
      state.rejectAdd?.(new Error('Encoding cancelled'))
    }
  }
`

let server, recordChartVideo, fixture, documentDescriptor
before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [{
      name: 'chart-video-recorder-fixture', enforce: 'pre',
      resolveId(id) { if (id === 'mediabunny' || id === fixtureModule) return fixtureModule },
      load(id) { if (id === fixtureModule) return fixtureSource },
    }],
    cacheDir: 'node_modules/.vite/chart-video-recorder-test', logLevel: 'error',
    ssr: { noExternal: ['mediabunny'] },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  fixture = await server.ssrLoadModule(fixtureModule)
  ;({ recordChartVideo } = await server.ssrLoadModule('/src/lib/chartVideoRecorder.ts'))
})
after(async () => { await server?.close() })

beforeEach(() => {
  fixture.reset()
  documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(name) {
        assert.equal(name, 'canvas')
        const canvas = { pixels: null }
        canvas.getContext = () => ({ canvas })
        return canvas
      },
    },
  })
})
afterEach(() => {
  if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor)
  else Reflect.deleteProperty(globalThis, 'document')
})

const format = { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' }
const options = { format, width: 1920, height: 840, duration: 3.5 }

test('エンコードが遅れても105フレームを描画順に待ち、完成図と最終化を含む3.5秒の動画を返す', async () => {
  fixture.state.onAdd = () => setImmediate()
  fixture.state.onFinalize = () => setImmediate()
  const draws = []
  const blob = await recordChartVideo({
    ...options,
    drawFrame({ canvas }, seconds) {
      assert.equal(fixture.state.adding, false, '前のCanvasの取り込み完了を待つ')
      canvas.pixels = seconds
      draws.push(seconds)
    },
  })
  assert.equal(draws.length, 105)
  assert.equal(draws[0], 0)
  assert.equal(draws.at(-1), 3.5)
  assert.equal(fixture.state.frames.length, 105)
  fixture.state.frames.forEach((frame, index) => {
    assert.equal(frame.timestamp, index / 30)
    assert.ok(Math.abs(frame.duration - 1 / 30) < 1e-10)
    assert.equal(frame.pixels, draws[index])
  })
  assert.deepEqual(fixture.state.trackOptions, { frameRate: 30 })
  assert.deepEqual(fixture.state.events, ['start', 'close', 'finalize-start', 'finalize-complete'])
  assert.equal(blob.type, 'video/mp4')
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3])
})

test('Canvas取り込み待ち中に中止すると出力を解放し、次のフレームや動画Blobを作らない', async () => {
  const controller = new AbortController()
  let entered
  const adding = new Promise(resolve => { entered = resolve })
  fixture.state.onAdd = () => new Promise((_resolve, reject) => {
    fixture.state.rejectAdd = reject
    entered()
  })
  let draws = 0
  const recording = recordChartVideo({ ...options, signal: controller.signal, drawFrame() { draws += 1 } })
  await adding
  controller.abort()
  await assert.rejects(recording)
  assert.equal(draws, 1)
  assert.equal(fixture.state.adding, false)
  assert.equal(fixture.state.output.state, 'cancelled')
  assert.ok(fixture.state.events.includes('cancel'))
  assert.ok(!fixture.state.events.includes('finalize-start'))
  assert.equal(fixture.state.output.target.buffer, undefined)
})

test('フレーム描画に失敗した場合もエンコーダーの出力を解放する', async () => {
  const failure = new Error('描画失敗')
  await assert.rejects(recordChartVideo({ ...options, drawFrame() { throw failure } }), error => error === failure)
  assert.deepEqual(fixture.state.events, ['start', 'cancel'])
  assert.equal(fixture.state.output.state, 'cancelled')
  assert.equal(fixture.state.frames.length, 0)
  assert.equal(fixture.state.output.target.buffer, undefined)
})
