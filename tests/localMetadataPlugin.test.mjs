import assert from 'node:assert/strict'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { createServer as createViteServer } from 'vite'
import { createLocalMetadataMiddleware, localMetadataPlugin, LOCAL_METADATA_ROUTE, LOCAL_BINARY_ROUTE, MAX_METADATA_BYTES, MAX_BINARY_BYTES } from '../scripts/localMetadataPlugin.mjs'

const ROUTES = [LOCAL_METADATA_ROUTE, LOCAL_BINARY_ROUTE]

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'arknights-local-metadata-'))
  t.after(() => {
    const target = resolve(directory)
    assert.equal(dirname(target), resolve(tmpdir()))
    assert.ok(basename(target).startsWith('arknights-local-metadata-'))
    return rm(target, { recursive: true, force: true })
  })
  const path = join(directory, 'global-metadata.dat')
  const data = Buffer.from([0xaf, 0x1b, 0xb1, 0xfa, 29, 0, 0, 0, 0xff, 0x00])
  await writeFile(path, data)
  const binaryPath = join(directory, 'GameAssembly.dll')
  const binaryData = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x50, 0x45, 0x00, 0x00, 0xff])
  await writeFile(binaryPath, binaryData)
  return { directory, path, data, binaryPath, binaryData }
}

async function listen(t, middleware) {
  const server = createServer((req, res) => {
    // Also exercise removal of headers already set by an earlier middleware.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    middleware(req, res, () => { res.statusCode = 418; res.end('next') })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return server.address().port
}

function get(port, { path = LOCAL_METADATA_ROUTE, method = 'GET', headers = {}, headersOnly = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: {
      Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`,
      'X-Arknights-Local-Read': '1', 'Sec-Fetch-Site': 'same-origin', ...headers,
    } }, res => {
      if (headersOnly) {
        res.once('close', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.alloc(0) }))
        res.destroy()
        return
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

function noCors(response) {
  assert.deepEqual(Object.keys(response.headers).filter(name => name.startsWith('access-control-')), [])
}

test('serves the separately configured DAT and DLL bytes with uncached same-origin GETs', async t => {
  const file = await fixture(t)
  const port = await listen(t, createLocalMetadataMiddleware({ metadataPath: file.path, binaryPath: file.binaryPath }))
  for (const [path, data] of [[LOCAL_METADATA_ROUTE, file.data], [LOCAL_BINARY_ROUTE, file.binaryData]]) {
    const result = await get(port, { path })
    assert.equal(result.status, 200)
    assert.deepEqual(result.data, data)
    assert.equal(result.headers['content-type'], 'application/octet-stream')
    assert.equal(result.headers['content-length'], String(data.length))
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.equal(result.headers['x-content-type-options'], 'nosniff')
    noCors(result)
  }
  assert.equal((await get(port, { path: '/unrelated' })).status, 418)
})

test('rejects foreign hosts, origins, fetch sites, missing token, methods, and query-selected paths', async t => {
  const file = await fixture(t)
  const port = await listen(t, createLocalMetadataMiddleware({ metadataPath: file.path, binaryPath: file.binaryPath }))
  const requests = [
    [{ headers: { Host: 'outside.example' } }, 403],
    [{ headers: { Host: '127.0.0.1.outside.example' } }, 403],
    [{ headers: { Host: '127.0.0.1:99999' } }, 403],
    [{ headers: { Origin: 'http://outside.example' } }, 403],
    [{ headers: { Origin: `http://127.0.0.1:${port + 1}` } }, 403],
    [{ headers: { Origin: 'null' } }, 403],
    [{ headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    [{ headers: { 'Sec-Fetch-Site': 'same-site' } }, 403],
    [{ headers: { 'X-Arknights-Local-Read': '' } }, 403],
    [{ method: 'POST' }, 405],
    [{ method: 'OPTIONS' }, 405],
    [{ method: 'HEAD' }, 405],
    [{ suffix: '?path=other.dat' }, 400],
    [{ suffix: '?' }, 400],
  ]
  for (const route of ROUTES) {
    for (const [{ suffix = '', ...options }, expected] of requests) {
      const result = await get(port, { ...options, path: route + suffix })
      assert.equal(result.status, expected, `${route}: ${JSON.stringify(options)}`)
      assert.equal(result.data.includes(file.data), false)
      assert.equal(result.data.includes(file.binaryData), false)
      assert.equal(result.data.toString().includes(file.directory), false)
      noCors(result)
    }
  }
})

test('requires a loopback socket peer even with valid loopback request headers', async () => {
  for (const route of ROUTES) {
    for (const peer of ['192.168.1.2', '203.0.113.3', '::ffff:192.168.1.2', undefined]) {
      const headers = new Map()
      const response = {
        setHeader: (name, value) => headers.set(name, value),
        getHeaderNames: () => [...headers.keys()],
        removeHeader: name => headers.delete(name),
        end: body => { response.body = body },
      }
      await createLocalMetadataMiddleware()({
        url: route, method: 'GET', socket: { remoteAddress: peer },
        headers: { host: 'localhost:5192', origin: 'http://localhost:5192', 'x-arknights-local-read': '1' },
      }, response, () => assert.fail('endpoint must be guarded'))
      assert.equal(response.statusCode, 403)
    }
  }
})

test('missing files and directories have private errors, and each resource enforces its own size limit', async t => {
  const file = await fixture(t)
  for (const [route, limit, label] of [[LOCAL_METADATA_ROUTE, MAX_METADATA_BYTES, 'metadata'], [LOCAL_BINARY_ROUTE, MAX_BINARY_BYTES, 'binary']]) {
    const oversized = join(file.directory, `oversized-${label}`)
    const handle = await open(oversized, 'w')
    await handle.truncate(limit + 1)
    await handle.close()
    for (const [path, status] of [[join(file.directory, 'missing.dat'), 404], [file.directory, 404], [oversized, 413]]) {
      const port = await listen(t, createLocalMetadataMiddleware({ metadataPath: path, binaryPath: path }))
      const response = await get(port, { path: route })
      assert.equal(response.status, status)
      assert.equal(response.data.toString(), `Local ${label} is unavailable.`)
      noCors(response)
    }
  }
  const medium = join(file.directory, 'oversized-metadata')
  const port = await listen(t, createLocalMetadataMiddleware({ metadataPath: medium, binaryPath: medium }))
  const accepted = await get(port, { path: LOCAL_BINARY_ROUTE, headersOnly: true })
  assert.equal(accepted.status, 200)
  assert.equal(accepted.headers['content-length'], String(MAX_METADATA_BYTES + 1))
  noCors(accepted)
  assert.equal((await get(port, { path: LOCAL_METADATA_ROUTE })).status, 413)
})

test('Vite base routing works before SPA fallback and CORS cannot expose this endpoint', async t => {
  const file = await fixture(t)
  const plugin = localMetadataPlugin({ metadataPath: file.path, binaryPath: file.binaryPath })
  assert.equal(plugin.apply, 'serve')
  assert.equal(plugin.configurePreviewServer, undefined)
  assert.equal(plugin.generateBundle, undefined)
  const server = await createViteServer({
    configFile: false, root: file.directory, base: '/arknights_2/', logLevel: 'silent',
    plugins: [plugin], server: { host: '127.0.0.1', port: 0, cors: true, hmr: false, allowedHosts: true },
  })
  t.after(() => server.close())
  await server.listen()
  const port = server.httpServer.address().port
  for (const [route, data] of [[LOCAL_METADATA_ROUTE, file.data], [LOCAL_BINARY_ROUTE, file.binaryData]]) {
    const path = '/arknights_2' + route
    const valid = await get(port, { path, headers: { Accept: '*/*' } })
    assert.equal(valid.status, 200)
    assert.deepEqual(valid.data, data)
    noCors(valid)
    const foreign = await get(port, { path, headers: { Origin: 'http://outside.example' } })
    assert.equal(foreign.status, 403)
    noCors(foreign)
    const preflight = await get(port, { path, method: 'OPTIONS', headers: {
      Origin: 'http://outside.example', 'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'X-Arknights-Local-Read',
    } })
    assert.equal(preflight.status, 403)
    noCors(preflight)
    const query = await get(port, { path: `${path}?path=outside`, headers: { Accept: '*/*' } })
    assert.equal(query.status, 400)
    noCors(query)
    assert.notEqual((await get(port, { path: route })).status, 200)
  }
})
