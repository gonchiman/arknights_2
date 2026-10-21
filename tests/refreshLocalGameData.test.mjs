import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { refreshLocalGameData, readActiveLocalDataSnapshot } from '../scripts/refreshLocalGameData.mjs'
import { LOCAL_GAME_DATA_FILES, LOCAL_GAME_DATA_GENERATED_FILES } from '../src/lib/localGameDataContract.ts'

const revision = '1'.repeat(40)
const generatorVersion = 'a'.repeat(64)
const logger = { info() {}, warn() {} }
const files = LOCAL_GAME_DATA_FILES
const documents = value => new Map(files.map(name => [name, { value }]))
async function workspace(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'arknights-local-data-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(resolve(root, 'public/data'), { recursive: true })
  await writeFile(resolve(root, 'public/data/enemy-stage-appearances.json'), 'checked-in')
  return root
}
function options(root, overrides = {}) {
  return { root, logger, generatorVersion, getRevision: async () => revision,
    loadSource: async () => ({ revision }), generate: async () => documents('first'), ...overrides }
}

test('publishes all files as one snapshot and never modifies checked-in data', async t => {
  const root = await workspace(t)
  const result = await refreshLocalGameData(options(root))
  assert.equal(result.status, 'updated')
  const snapshot = await readActiveLocalDataSnapshot(root)
  assert.deepEqual(snapshot, result.snapshot)
  for (const file of files) assert.deepEqual(JSON.parse(await readFile(resolve(snapshot.directory, file))), { value: 'first' })
  assert.equal(await readFile(resolve(root, 'public/data/enemy-stage-appearances.json'), 'utf8'), 'checked-in')
})

test('same revision skips fetching and generating; changed revision or generator regenerates', async t => {
  const root = await workspace(t)
  await refreshLocalGameData(options(root))
  let loads = 0
  const changes = { loadSource: async () => { loads++; return {} } }
  assert.equal((await refreshLocalGameData(options(root, changes))).status, 'unchanged')
  assert.equal(loads, 0)
  assert.equal((await refreshLocalGameData(options(root, { ...changes, getRevision: async () => '2'.repeat(40) }))).status, 'updated')
  assert.equal((await refreshLocalGameData(options(root, { ...changes, getRevision: async () => '2'.repeat(40), generatorVersion: 'b'.repeat(64) }))).status, 'updated')
  assert.equal(loads, 2)
})

test('offline or generation failure keeps the last complete snapshot', async t => {
  const root = await workspace(t)
  const initial = await refreshLocalGameData(options(root))
  for (const changes of [
    { getRevision: async () => { throw new Error('offline') } },
    { getRevision: async () => '2'.repeat(40), generate: async () => { throw new Error('invalid source') } },
    { getRevision: async () => '2'.repeat(40), generate: async () => new Map([['maps/index.json', {}]]) },
  ]) {
    const result = await refreshLocalGameData(options(root, changes))
    assert.equal(result.status, 'failed')
    assert.equal(result.snapshot.id, initial.snapshot.id)
    assert.equal((await readActiveLocalDataSnapshot(root)).id, initial.snapshot.id)
  }
})

test('failure on first start leaves the bundled data available', async t => {
  const root = await workspace(t)
  const result = await refreshLocalGameData(options(root, { getRevision: async () => { throw new Error('offline') } }))
  assert.equal(result.status, 'failed')
  assert.equal(result.snapshot, null)
  assert.equal(await readFile(resolve(root, 'public/data/enemy-stage-appearances.json'), 'utf8'), 'checked-in')
})

test('aborted update does not switch the active snapshot and releases the lock', async t => {
  const root = await workspace(t)
  const initial = await refreshLocalGameData(options(root))
  const controller = new AbortController()
  const result = await refreshLocalGameData(options(root, {
    signal: controller.signal, getRevision: async () => '2'.repeat(40),
    generate: async () => { controller.abort(); return documents('second') },
  }))
  assert.equal(result.status, 'failed')
  assert.equal((await readActiveLocalDataSnapshot(root)).id, initial.snapshot.id)
  assert.equal((await refreshLocalGameData(options(root))).status, 'unchanged')
})

test('concurrent starts do not run two updates in the same workspace', async t => {
  const root = await workspace(t)
  let finish
  let started
  const pending = new Promise(resolve => { finish = resolve })
  const entered = new Promise(resolve => { started = resolve })
  const first = refreshLocalGameData(options(root, { loadSource: async () => { started(); await pending; return {} } }))
  await entered
  const second = await refreshLocalGameData(options(root))
  assert.equal(second.status, 'busy')
  finish()
  assert.equal((await first).status, 'updated')
})

test('corrupted cached output is never served and is regenerated', async t => {
  const root = await workspace(t)
  const initial = await refreshLocalGameData(options(root))
  await writeFile(resolve(initial.snapshot.directory, 'maps/index.json'), '{}')
  assert.equal(await readActiveLocalDataSnapshot(root), null)
  const repaired = await refreshLocalGameData(options(root))
  assert.equal(repaired.status, 'updated')
  assert.notEqual(repaired.snapshot.id, initial.snapshot.id)
  assert.ok(await readActiveLocalDataSnapshot(root))
})

test('untrusted output paths and source revisions cannot escape the cache', async t => {
  const root = await workspace(t)
  const unsafe = documents('bad')
  unsafe.set('../outside.json', {})
  const result = await refreshLocalGameData(options(root, { generate: async () => unsafe }))
  assert.equal(result.status, 'failed')
  assert.equal(await readActiveLocalDataSnapshot(root), null)
  assert.equal((await refreshLocalGameData(options(root, { getRevision: async () => '../outside' }))).status, 'failed')
})

test('a lock from a dead server can be recovered', async t => {
  const root = await workspace(t)
  const cache = resolve(root, '.cache/local-game-data')
  await mkdir(cache, { recursive: true })
  await writeFile(resolve(cache, 'update.lock'), JSON.stringify({ pid: 2147483647, token: 'old' }))
  assert.equal((await refreshLocalGameData(options(root))).status, 'updated')
})

test('two stale-lock recoveries cannot displace the winning live writer', async t => {
  const root = await workspace(t)
  const cache = resolve(root, '.cache/local-game-data')
  await mkdir(cache, { recursive: true })
  await writeFile(resolve(cache, 'update.lock'), JSON.stringify({ pid: 2147483647, token: 'old' }))
  let loads = 0
  const results = await Promise.all([1, 2].map(() => refreshLocalGameData(options(root, {
    loadSource: async () => { loads++; await new Promise(resolve => setTimeout(resolve, 30)); return {} },
  }))))
  assert.equal(loads, 1)
  assert.deepEqual(results.map(result => result.status).sort(), ['busy', 'updated'])
})

test('a snapshot missing a required map detail shard is not activated', async t => {
  const root = await workspace(t)
  const incomplete = documents('incomplete')
  incomplete.delete('maps/details-f.json')
  assert.equal((await refreshLocalGameData(options(root, { generate: async () => incomplete }))).status, 'failed')
  assert.equal(await readActiveLocalDataSnapshot(root), null)
})

test('all runtime tables are required before switching operator data and aggregates together', async t => {
  const root = await workspace(t)
  const initial = await refreshLocalGameData(options(root))
  const incomplete = documents('new')
  incomplete.delete('runtime/battle_equip_table.json')
  const result = await refreshLocalGameData(options(root, {
    getRevision: async () => '2'.repeat(40), generate: async () => incomplete,
  }))
  assert.equal(result.status, 'failed')
  assert.equal((await readActiveLocalDataSnapshot(root)).id, initial.snapshot.id)
})

test('legacy generated-only cache remains usable offline and upgrades even at the same revision', async t => {
  const root = await workspace(t)
  const initial = await refreshLocalGameData(options(root))
  const manifestPath = resolve(initial.snapshot.directory, '../manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.schemaVersion = 1
  manifest.files = manifest.files.filter(file => LOCAL_GAME_DATA_GENERATED_FILES.includes(file.path))
  await writeFile(manifestPath, JSON.stringify(manifest))
  const legacy = await readActiveLocalDataSnapshot(root)
  assert.equal(legacy.files.length, 20)
  const offline = await refreshLocalGameData(options(root, { getRevision: async () => { throw new Error('offline') } }))
  assert.equal(offline.status, 'failed')
  assert.equal(offline.snapshot.id, legacy.id)
  const updated = await refreshLocalGameData(options(root))
  assert.equal(updated.status, 'updated')
  assert.equal(updated.snapshot.files.length, 27)
  assert.notEqual(updated.snapshot.id, legacy.id)
})
