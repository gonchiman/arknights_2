import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server, createController
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/chart-image-batch-save-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ createChartImageBatchSaveController: createController } = await server.ssrLoadModule('/src/components/useChartImageBatchSave.tsx'))
})
after(async () => { await server?.close() })

const outputs = () => [1, 2, 3].map(value => ({
  key: String(value), filename: `条件${value}.png`,
  frame: { title: `条件${value}`, naturalChartHeight: 200, children: () => null },
}))
function fixture() {
  const events = [], states = [], downloads = []
  const controller = createController({
    generate: async output => { events.push(`generate:${output.filename}`); return new Blob([output.key]) },
    onState: state => states.push(state), download: (blob, name) => downloads.push({ blob, name }),
  })
  let closed = 0
  const options = { outputs: outputs(), archive: true, folderExport: false, invalid: false, onClose: () => { closed += 1 } }
  return { controller, events, states, downloads, options, closed: () => closed }
}
function filePicker(events, writes, fail = false) {
  return async options => {
    events.push(`picker:${options.suggestedName}`)
    return { async createWritable() { return {
      async write(blob) { events.push('write'); writes.push(blob) },
      async close() { events.push('close'); if (fail) throw new DOMException('write failure', 'AbortError') },
      async abort() { events.push('abort') },
    } } }
  }
}
function directory(events, failAt = 0) {
  const entries = new Map(), names = []
  let writes = 0, fail = failAt
  const handle = { name: 'test', async getFileHandle(name, options) {
    let file = entries.get(name)
    if (!file && !options?.create) throw new DOMException('missing', 'NotFoundError')
    if (!file) {
      file = { async createWritable() {
        let blob
        return {
          async write(value) { blob = value },
          async close() {
            writes += 1
            if (writes === fail) { fail = 0; throw new DOMException('write failed', 'AbortError') }
            events.push(`write:${name}`); names.push(name); file.blob = blob
          },
          async abort() {},
        }
      } }
      entries.set(name, file)
    }
    return file
  }, async removeEntry(name) { events.push(`remove:${name}`); entries.delete(name) } }
  return { handle, entries, names }
}

test('single PNG keeps the custom name and chooses its file before rendering', async () => {
  const f = fixture(), writes = []
  await f.controller.save({ ...f.options, outputs: f.options.outputs.slice(0, 1), archive: false,
    picker: filePicker(f.events, writes) }, '手入力', true)
  assert.deepEqual(f.events, ['picker:手入力.png', 'generate:手入力', 'write', 'close'])
  assert.equal(await writes[0].text(), '1')
  assert.equal(f.closed(), 1)
  assert.equal(f.states.at(-1).saving, false)
  const fallback = fixture()
  await fallback.controller.save({ ...fallback.options, archive: false }, '個別画像', false)
  assert.equal(fallback.downloads[0].name, '個別画像.png')
})

test('ZIP writes once after every PNG is generated and preserves each entry name', async () => {
  const f = fixture(), writes = []
  await f.controller.save({ ...f.options, picker: filePicker(f.events, writes) }, '比較', true)
  assert.deepEqual(f.events, ['picker:比較.zip', 'generate:条件1.png', 'generate:条件2.png', 'generate:条件3.png', 'write', 'close'])
  assert.equal(writes.length, 1)
  const zip = Buffer.from(await writes[0].arrayBuffer())
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  for (const output of f.options.outputs) assert.ok(zip.includes(Buffer.from(output.filename)))
  assert.equal(f.closed(), 1)
  const fallback = fixture()
  await fallback.controller.save(fallback.options, '比較', false)
  assert.equal(fallback.downloads[0].name, '比較.zip')
})

test('picker cancellation never renders; generation failure never writes an incomplete ZIP', async () => {
  const cancelled = fixture()
  await cancelled.controller.save({ ...cancelled.options,
    picker: async () => { throw new DOMException('cancelled', 'AbortError') } }, '比較.zip', true)
  assert.deepEqual(cancelled.events, [])
  assert.equal(cancelled.closed(), 0)
  assert.equal(cancelled.states.at(-1).error, false)
  const events = [], states = [], writes = []
  const controller = createController({
    generate: async output => { if (output.key === '2') throw new Error('render'); return new Blob(['1']) },
    onState: state => states.push(state),
  })
  await controller.save({ ...cancelled.options, picker: filePicker(events, writes) }, '比較.zip', true)
  assert.equal(writes.length, 0)
  assert.equal(states.at(-1).error, true)
})

test('folder retry uses the retained blobs and handle, and cancelled reselection keeps that session', async () => {
  const f = fixture(), folder = directory(f.events, 2)
  let pickers = 0
  const options = { ...f.options, folderExport: true, archive: false, directoryPicker: async () => {
    pickers += 1; f.events.push('directory')
    if (pickers === 2) throw new DOMException('cancelled', 'AbortError')
    return folder.handle
  } }
  await f.controller.save(options, '', true)
  assert.deepEqual(f.states.at(-1).folderProgress, { completed: 1, total: 3 })
  assert.equal(f.states.at(-1).error, 'フォルダへの保存に失敗しました（1/3枚保存済み）。')
  assert.equal(folder.entries.size, 1)
  assert.deepEqual(f.events.slice(0, 5), ['directory', 'generate:条件1.png', 'generate:条件2.png', 'generate:条件3.png', 'write:条件1.png'])
  await f.controller.save(options, '', true, true)
  assert.deepEqual(f.states.at(-1).folderProgress, { completed: 1, total: 3 })
  await f.controller.save(options, '', true)
  assert.equal(pickers, 2)
  assert.equal(f.events.filter(event => event.startsWith('generate:')).length, 3)
  assert.deepEqual(folder.names, ['条件1.png', '条件2.png', '条件3.png'])
  assert.equal(f.closed(), 1)
  assert.equal(f.states.at(-1).folderProgress, null)
})

test('reset drops an unfinished folder transaction; later exports avoid existing names', async () => {
  const f = fixture(), folder = directory(f.events, 2)
  let pickers = 0
  const options = { ...f.options, folderExport: true, archive: false,
    directoryPicker: async () => { pickers += 1; return folder.handle } }
  await f.controller.save(options, '', true)
  f.controller.reset()
  assert.equal(f.states.at(-1).folderProgress, null)
  assert.equal(f.states.at(-1).error, false)
  await f.controller.save(options, '', true)
  assert.equal(pickers, 2)
  assert.deepEqual(folder.names, ['条件1.png', '条件1 (2).png', '条件2.png', '条件3.png'])
  assert.equal(f.events.filter(event => event.startsWith('generate:')).length, 6)
})

test('empty, invalid and unsupported folder requests do nothing; in-flight saves cannot run twice', async () => {
  const f = fixture()
  for (const extra of [{ invalid: true }, { outputs: [] }, { folderExport: true }]) {
    await f.controller.save({ ...f.options, ...extra }, '比較.zip', true)
  }
  assert.deepEqual(f.states, [])
  assert.deepEqual(f.events, [])
  let finish, started, generations = 0
  const generationStarted = new Promise(resolve => { started = resolve })
  const states = [], downloads = []
  const controller = createController({
    generate: async () => { generations += 1; started(); return await new Promise(resolve => { finish = resolve }) },
    onState: state => states.push(state), download: (...args) => downloads.push(args),
  })
  const options = { ...f.options, archive: false, outputs: f.options.outputs.slice(0, 1) }
  const first = controller.save(options, '1.png', false)
  await generationStarted
  await controller.save(options, '2.png', false)
  assert.equal(generations, 1)
  finish(new Blob(['png']))
  await first
  assert.equal(downloads.length, 1)
})

test('folder generation failure writes no PNG; a native write AbortError remains an error', async () => {
  const folderEvents = [], states = []
  const folder = directory(folderEvents)
  let closed = 0
  const controller = createController({
    generate: async output => { if (output.key === '2') throw new Error('render'); return new Blob(['1']) },
    onState: state => states.push(state),
  })
  const options = { outputs: outputs(), archive: false, folderExport: true, invalid: false,
    onClose: () => { closed += 1 }, directoryPicker: async () => folder.handle }
  await controller.save(options, '', true)
  assert.equal(folder.entries.size, 0)
  assert.equal(states.at(-1).error, 'フォルダへの保存に失敗しました（0/3枚保存済み）。')
  assert.equal(closed, 0)
  const f = fixture(), writes = []
  await f.controller.save({ ...f.options, picker: filePicker(f.events, writes, true) }, '比較.zip', true)
  assert.equal(f.states.at(-1).error, true)
  assert.equal(f.closed(), 0)
  assert.equal(f.events.at(-1), 'abort')
})
