import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { Agent, createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { createServer as createViteServer } from 'vite'
import { createLocalGameDataMiddleware, localGameDataPlugin } from '../scripts/localGameDataPlugin.mjs'
import { LOCAL_GAME_DATA_RUNTIME_FILES } from '../src/lib/localGameDataContract.ts'

const BASE = '/arknights_2/'
const DATA = `${BASE}data/`
const quiet = { info() {}, warn() {} }
const fixtureServers = new Map()

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'arknights-local-game-data-'))
  fixtureServers.set(root, new Set())
  t.after(async () => {
    // Vite may finish writing its dependency cache after an HTTP response.
    // Close every server sharing this fixture before removing the directory.
    for (const server of fixtureServers.get(root) ?? []) await server.close()
    fixtureServers.delete(root)
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(basename(root).startsWith('arknights-local-game-data-'))
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(join(root, 'public/data/maps'), { recursive: true })
  await writeFile(join(root, 'public/data/maps/index.json'), JSON.stringify({ generatedAt: 'shipped' }))
  await writeFile(join(root, 'public/data/maps/details-a.json'), JSON.stringify({ value: 'shipped detail' }))
  await writeFile(join(root, 'public/data/enemy-stage-appearances.json'), JSON.stringify({ value: 'shipped' }))
  await writeFile(join(root, 'public/data/other.json'), JSON.stringify({ value: 'other public data' }))
  return root
}

async function snapshot(root, id, { runtime = true } = {}) {
  const directory = join(root, 'snapshots', id)
  const files = ['enemy-stage-appearances.json', 'enemy-histogram-counts.json', 'maps/index.json', 'maps/details-a.json',
    ...(runtime ? Object.values(LOCAL_GAME_DATA_RUNTIME_FILES) : [])]
  await mkdir(join(directory, 'maps'), { recursive: true })
  if (runtime) await mkdir(join(directory, 'runtime'), { recursive: true })
  for (const file of files) await writeFile(join(directory, file), JSON.stringify({ value: id, generatedAt: id }))
  return { id, directory, files, generatedAt: id, revision: 'a'.repeat(40) }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function get(port, path, method = 'GET', agent = false) {
  return new Promise((resolve, reject) => {
    let receivedHeaders = false
    let receivedBytes = 0
    let connected = false
    // Each fixture owns an ephemeral server; do not pool its sockets in Node's
    // process-wide agent, which can reuse a connection while idle shutdown races.
    const req = request({ hostname: '127.0.0.1', port, path, method, agent, headers: { Accept: '*/*' } }, res => {
      receivedHeaders = true
      const chunks = []
      res.on('data', chunk => { receivedBytes += chunk.length; chunks.push(chunk) })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        text: Buffer.concat(chunks).toString(), reusedSocket: req.reusedSocket }))
      res.on('error', error => reject(new Error(`${error.message} (${diagnostics()})`, { cause: error })))
    })
    const diagnostics = () => `${method} http://127.0.0.1:${port}${path}; connected: ${connected}; `
      + `response headers: ${receivedHeaders}; body bytes: ${receivedBytes}; reused socket: ${req.reusedSocket}; `
      + `socket bytes read: ${req.socket?.bytesRead}; written: ${req.socket?.bytesWritten}`
    req.on('error', error => {
      reject(new Error(`${error.message} (${diagnostics()})`, { cause: error }))
    })
    req.on('socket', socket => {
      connected = !socket.connecting
      socket.once('connect', () => { connected = true })
    })
    req.setTimeout(10_000, () => req.destroy(new Error('Local data response timed out')))
    req.end()
  })
}

async function vite(t, root, options = {}) {
  const plugin = localGameDataPlugin({ env: {}, logger: quiet, ...options })
  const server = await createViteServer({
    configFile: false, root, base: BASE, logLevel: 'silent', plugins: [plugin],
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  })
  fixtureServers.get(root)?.add(server)
  t.after(() => server.close())
  const reloads = []
  server.ws.send = event => reloads.push(event)
  await server.listen()
  return { server, port: server.httpServer.address().port, reloads, plugin }
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

test('remote refresh does not block startup; cached JSON wins over public and unrelated data passes through', async t => {
  const root = await fixture(t)
  const cached = await snapshot(root, 'cached')
  const update = deferred()
  let refreshOptions
  const { server, port, plugin } = await vite(t, root, {
    readSnapshot: async path => { assert.equal(resolve(path), resolve(root)); return cached },
    refresh: options => { refreshOptions = options; return update.promise },
  })
  assert.equal(plugin.apply, 'serve')
  assert.equal(plugin.configurePreviewServer, undefined)
  assert.equal(plugin.generateBundle, undefined)
  assert.equal(resolve(refreshOptions.root), resolve(root))
  assert.equal(refreshOptions.signal.aborted, false)
  const response = await get(port, `${DATA}enemy-stage-appearances.json`)
  assert.equal(response.status, 200)
  assert.equal(JSON.parse(response.text).value, 'cached')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  const head = await get(port, `${DATA}enemy-stage-appearances.json`, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.text, '')
  assert.equal(head.headers['content-length'], response.headers['content-length'])
  assert.equal(JSON.parse((await get(port, `${DATA}other.json`)).text).value, 'other public data')
  assert.notEqual((await get(port, '/data/enemy-stage-appearances.json')).status, 200)
  await server.close()
  assert.equal(refreshOptions.signal.aborted, true)
  update.resolve({ status: 'updated', snapshot: cached })
})

test('successful update swaps the complete snapshot, reloads once, and keeps old map versions readable', async t => {
  const root = await fixture(t)
  const cached = await snapshot(root, 'cached')
  const newer = await snapshot(root, 'newer')
  const update = deferred()
  const { port, reloads } = await vite(t, root, {
    readSnapshot: async () => cached, refresh: () => update.promise,
  })
  update.resolve({ status: 'updated', snapshot: newer })
  await settle()
  assert.deepEqual(reloads, [{ type: 'full-reload', path: '*' }])
  for (const file of ['enemy-stage-appearances.json', 'enemy-histogram-counts.json', 'maps/index.json']) {
    assert.equal(JSON.parse((await get(port, DATA + file)).text).value, 'newer')
  }
  for (const [version, expected] of [['newer', 'newer'], ['cached', 'cached'], ['shipped', 'shipped detail']]) {
    assert.equal(JSON.parse((await get(port, `${DATA}maps/details-a.json?v=${version}`)).text).value, expected)
  }
  for (const file of [...Object.values(LOCAL_GAME_DATA_RUNTIME_FILES), 'enemy-stage-appearances.json']) {
    assert.equal(JSON.parse((await get(port, DATA + file + '?v=cached')).text).value, 'cached')
    assert.equal(JSON.parse((await get(port, DATA + file + '?v=newer')).text).value, 'newer')
    assert.equal((await get(port, DATA + file + '?v=unknown')).status, 404)
  }
  assert.equal((await get(port, `${DATA}maps/details-a.json?v=unknown`)).status, 404)
  assert.equal((await get(port, `${DATA}maps/details-a.json?v=cached&v=newer`)).status, 400)
  assert.equal((await get(port, `${DATA}maps/details-b.json`)).status, 404)
})

test('runtime manifest pins the complete cached tables; missing or legacy snapshots explicitly allow initial remote access', async t => {
  const root = await fixture(t)
  const cached = await snapshot(root, 'cached')
  const update = deferred()
  const { port } = await vite(t, root, { readSnapshot: async () => cached, refresh: () => update.promise })
  const manifest = await get(port, DATA + 'runtime/manifest.json')
  assert.equal(manifest.status, 200)
  assert.equal(manifest.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(manifest.text), { schemaVersion: 1, available: true,
    revision: 'a'.repeat(40), version: 'cached' })
  assert.equal((await get(port, DATA + 'runtime/manifest.json', 'HEAD')).text, '')
  assert.equal((await get(port, DATA + 'runtime/manifest.json', 'POST')).status, 405)
  const missingPath = join(cached.directory, 'runtime/battle_equip_table.json')
  await rm(missingPath)
  assert.equal((await get(port, DATA + 'runtime/battle_equip_table.json?v=cached')).status, 404)
  assert.equal((await get(port, DATA + 'runtime/secret.json')).status, 404)
  update.resolve({ status: 'failed', snapshot: cached })

  for (const initial of [null, await snapshot(root, 'legacy', { runtime: false })]) {
    const fallback = await vite(t, root, {
      readSnapshot: async () => initial, refresh: async () => ({ status: 'failed', snapshot: initial }),
    })
    assert.deepEqual(JSON.parse((await get(fallback.port, DATA + 'runtime/manifest.json')).text),
      { schemaVersion: 1, available: false })
    assert.equal((await get(fallback.port, DATA + 'runtime/character_table.json')).status, 404)
  }
})

test('first update can serve a shard for the shipped index already held by a client', async t => {
  const root = await fixture(t)
  const newer = await snapshot(root, 'newer')
  const update = deferred()
  const { port } = await vite(t, root, { readSnapshot: async () => null, refresh: () => update.promise })
  assert.equal(JSON.parse((await get(port, `${DATA}maps/index.json`)).text).generatedAt, 'shipped')
  update.resolve({ status: 'updated', snapshot: newer })
  await settle()
  assert.equal(JSON.parse((await get(port, `${DATA}maps/details-a.json?v=shipped`)).text).value, 'shipped detail')
  assert.equal(JSON.parse((await get(port, `${DATA}maps/details-a.json?v=newer`)).text).value, 'newer')
})

test('offline and busy updates preserve cached data without reload, and no cache preserves public fallback', async t => {
  for (const [id, outcome] of [['cached', 'failed'], ['cached', 'reject'], ['cached', 'busy'], [null, 'reject']]) {
    await t.test(`${id || 'public'} / ${outcome}`, async t => {
      const root = await fixture(t)
      const cached = id ? await snapshot(root, id) : null
      const update = deferred()
      const warnings = []
      const { port, reloads } = await vite(t, root, {
        logger: { info() {}, warn: text => warnings.push(text) },
        readSnapshot: async () => cached, refresh: () => update.promise,
      })
      if (outcome === 'reject') update.reject(new Error('offline'))
      else update.resolve({ status: outcome, snapshot: cached })
      await settle()
      assert.equal(JSON.parse((await get(port, `${DATA}enemy-stage-appearances.json`)).text).value, id || 'shipped')
      assert.deepEqual(reloads, [])
      assert.equal(warnings.length, outcome === 'reject' ? 1 : 0)
    })
  }
})

test('disable environment skips refresh but still serves the validated local snapshot', async t => {
  const root = await fixture(t)
  const cached = await snapshot(root, 'cached')
  let calls = 0
  const { port, reloads } = await vite(t, root, {
    env: { ARKNIGHTS_AUTO_UPDATE: '0' }, readSnapshot: async () => cached,
    refresh: async () => { calls++; throw new Error('must not run') },
  })
  await settle()
  assert.equal(calls, 0)
  assert.equal(JSON.parse((await get(port, `${DATA}enemy-stage-appearances.json`)).text).value, 'cached')
  assert.deepEqual(reloads, [])
})

test('unchanged snapshot does not reload and server close prevents late activation', async t => {
  const root = await fixture(t)
  const cached = await snapshot(root, 'cached')
  const { reloads } = await vite(t, root, {
    readSnapshot: async () => cached, refresh: async () => ({ status: 'unchanged', snapshot: cached }),
  })
  await settle()
  assert.deepEqual(reloads, [])
  const late = deferred()
  let signal
  const pending = await vite(t, root, {
    readSnapshot: async () => cached,
    refresh: options => { signal = options.signal; return late.promise },
  })
  await pending.server.close()
  assert.equal(signal.aborted, true)
  late.resolve({ status: 'updated', snapshot: await snapshot(root, 'late') })
  await settle()
  assert.deepEqual(pending.reloads, [])
})

test('large snapshot streams finish on reused sockets and a cancelled download does not break subsequent reads', async t => {
  const root = await fixture(t)
  const cached = await snapshot(root, 'cached')
  const payload = JSON.stringify({ data: 'x'.repeat(4 * 1024 * 1024), tail: 'complete' })
  await writeFile(join(cached.directory, LOCAL_GAME_DATA_RUNTIME_FILES.character), payload)
  const { port } = await vite(t, root, {
    env: { ARKNIGHTS_AUTO_UPDATE: '0' }, readSnapshot: async () => cached,
    refresh: async () => assert.fail('disabled refresh must not run'),
  })
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  t.after(() => agent.destroy())
  const path = DATA + LOCAL_GAME_DATA_RUNTIME_FILES.character + '?v=cached'
  for (let index = 0; index < 3; index++) {
    const result = await get(port, path, 'GET', agent)
    assert.equal(result.status, 200)
    assert.equal(result.headers['content-length'], String(Buffer.byteLength(payload)))
    assert.equal(result.text, payload)
    if (index > 0) assert.equal(result.reusedSocket, true)
    await settle()
  }
  await new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, agent }, res => {
      res.once('data', () => res.destroy())
      res.once('close', resolve)
      res.once('error', error => { if (error.code !== 'ECONNRESET') reject(error) })
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('Cancelled-stream fixture timed out')))
    req.end()
  })
  const head = await get(port, path, 'HEAD', agent)
  assert.equal(head.status, 200)
  assert.equal(head.headers['content-length'], String(Buffer.byteLength(payload)))
  assert.equal(head.text, '')
  assert.equal((await get(port, path, 'GET', agent)).text, payload)
})

test('snapshot middleware rejects traversal, methods, and missing managed shards without exposing arbitrary files', async t => {
  const root = await fixture(t)
  const raw = await snapshot(root, 'cached')
  const active = { ...raw, files: new Set([...raw.files, '../secret.json']) }
  await writeFile(join(root, 'snapshots/secret.json'), JSON.stringify({ secret: true }))
  const middleware = createLocalGameDataMiddleware({ getActive: () => active })
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 418; res.end('next') }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const port = server.address().port
  for (const path of ['/data/../secret.json', '/data/%2e%2e/secret.json', '/data/maps/%2e%2e/index.json',
    '/data/maps%5c..%5csecret.json', '/data/maps/%00.json', '/data/%zz']) {
    assert.equal((await get(port, path)).status, 400, path)
  }
  assert.equal((await get(port, '/data/enemy-stage-appearances.json', 'POST')).status, 405)
  assert.equal((await get(port, '/data/maps/details-a.json', 'HEAD')).status, 200)
  assert.equal((await get(port, '/data/maps/details-b.json')).status, 404)
  assert.equal((await get(port, '/data/maps/details-x.json')).status, 404)
  assert.equal((await get(port, '/data/secret.json')).status, 418)
  assert.equal((await get(port, '/other')).status, 418)
})
