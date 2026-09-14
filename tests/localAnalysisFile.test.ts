import assert from 'node:assert/strict'
import test from 'node:test'
import { readLocalAnalysisFile } from '../src/lib/localAnalysisFile.ts'

test('local DAT and DLL responses become named files using the cancellable same-origin request', async t => {
  for (const [kind, name] of [['metadata', 'global-metadata.dat'], ['binary', 'GameAssembly.dll']] as const) {
    const controller = new AbortController()
    const bytes = new Uint8Array([0, 255, 29, 7])
    const fetch = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, `/arknights_2/__local-analysis/${kind}`)
      assert.equal(init.signal, controller.signal)
      assert.equal(init.mode, 'same-origin')
      assert.equal(init.redirect, 'error')
      assert.equal(init.cache, 'no-store')
      assert.equal(new Headers(init.headers).get('X-Arknights-Local-Read'), '1')
      return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '4' } })
    })
    const file = await readLocalAnalysisFile(kind, '/arknights_2/', controller.signal)
    assert.equal(file.name, name)
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes)
    fetch.mock.restore()
  }
})

test('unavailable, HTML fallback, missing length, and oversized responses are rejected before reading', async t => {
  for (const kind of ['metadata', 'binary'] as const) {
    const limit = (kind === 'metadata' ? 128 : 256) * 1024 * 1024
    for (const [status, type, size] of [[404, 'application/octet-stream', '1'], [200, 'text/html', '1'], [200, 'application/octet-stream', ''], [200, 'application/octet-stream', String(limit + 1)]] as const) {
      const response = new Response(new Uint8Array([1]), { status, headers: { 'Content-Type': type, 'Content-Length': size } })
      const read = t.mock.method(response, 'arrayBuffer', () => { throw new Error('should not consume response') })
      const fetch = t.mock.method(globalThis, 'fetch', async () => response)
      await assert.rejects(readLocalAnalysisFile(kind, '/', new AbortController().signal), /unavailable/)
      assert.equal(read.mock.callCount(), 0)
      assert.equal(response.bodyUsed, true)
      fetch.mock.restore()
    }
  }
})

test('a truncated body cannot be passed to analysis', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '2' } }))
  await assert.rejects(readLocalAnalysisFile('binary', '/', new AbortController().signal), /Incomplete/)
})

test('cancellation during the response read cannot create an accepted file', async t => {
  const controller = new AbortController()
  const response = new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '1' } })
  t.mock.method(response, 'arrayBuffer', async () => { controller.abort(); return new Uint8Array([1]).buffer })
  t.mock.method(globalThis, 'fetch', async () => response)
  await assert.rejects(readLocalAnalysisFile('binary', '/', controller.signal), { name: 'AbortError' })
})
