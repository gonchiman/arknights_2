import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { archiveEnemyAggregation } from '../scripts/enemyAggregationArchive.mjs'
import { getLocalDataGeneratorVersion, refreshLocalGameData } from '../scripts/refreshLocalGameData.mjs'
import { LOCAL_GAME_DATA_FILES } from '../src/lib/localGameDataContract.ts'
import { CURRENT_ENEMY_AGGREGATION_RULE_VERSION, ENEMY_AGGREGATION_FILES,
  parseEnemyAggregationBundle, parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'

const generatedAt = '2026-10-22T01:00:00.000Z'
const revision = 'a'.repeat(40)
const generatorVersion = 'b'.repeat(64)
const map = (id, patch = {}) => ({ levelId: id, stageId: id, code: id, name: id,
  zoneId: 'main_10', zoneName: '第十章', zoneType: 'MAINLINE', diffGroup: 'NORMAL',
  status: 'supported', spawnCount: 3, enemyIds: ['enemy_a'], reasons: [], detailFile: 'details-a.json', ...patch })
function documents({ enabled = false, spawnCount = 3, timestamp = generatedAt, arrayDatabase = false } = {}) {
  const metadata = { schemaVersion: 1, generatedAt: timestamp, sourceGeneratedAt: timestamp }
  const database = [{ level: 0, enemyData: { attributes: { maxHp: { m_defined: true, m_value: 100 } } } }]
  return {
    'maps/index.json': { ...metadata, maps: [
      map('a', { spawnCount }), map('b', { status: enabled ? 'supported' : 'excluded',
        spawnCount: enabled ? 2 : null, reasons: enabled ? [] : ['hidden-spawn-group'] }),
      map('story', { diffGroup: 'EASY' }), map('other', { zoneType: 'CAMPAIGN' }),
      map('missing', { status: 'missing', spawnCount: null, enemyIds: [], detailFile: null }),
    ], enemies: { enemy_a: { name: '兵士', hp: 100, attack: 20, defense: 10, resistance: 0 } } },
    'enemy-histogram-counts.json': { ...metadata,
      summary: { mapCount: 2, missingMapCount: 1, excludedMapCount: 2, spawnMapCount: enabled ? 2 : 1,
        spawnExcludedMapCount: enabled ? 0 : 1 },
      enemies: { enemy_a: { mapCount: 2, spawnCount: spawnCount + (enabled ? 2 : 0) } } },
    'enemy-stage-appearances.json': { ...metadata, enemies: { enemy_a: { stageCount: 2, stageIds: ['a', 'b'] } } },
    'runtime/enemy_handbook_table.json': { enemyData: { enemy_a: { enemyId: 'enemy_a', name: '兵士' } } },
    'runtime/enemy_database.json': arrayDatabase ? { enemies: [{ Key: 'enemy_a', Value: database }] } : { enemy_a: database },
  }
}
async function workspace(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'arknights-aggregation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
async function snapshot(root, label, contents = documents(), overrides = {}) {
  const directory = resolve(root, 'snapshots', label)
  for (const [name, value] of Object.entries(contents)) {
    await mkdir(dirname(resolve(directory, name)), { recursive: true })
    await writeFile(resolve(directory, name), JSON.stringify(value))
  }
  return { directory, revision, generatorVersion, generatedAt, ...overrides }
}
const archiveRoot = root => resolve(root, 'public/data/enemy-aggregation')
const indexBytes = root => readFile(resolve(archiveRoot(root), 'index.json'))
const bundleBytes = (root, id) => readFile(resolve(archiveRoot(root), `${id}.json.gz`))

test('publishes one coherent portable dataset, preserving all five original input files', async t => {
  const root = await workspace(t), data = documents({ arrayDatabase: true })
  const result = await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'first', data) })
  assert.equal(result.status, 'created')
  assert.equal(result.version.id, 'v1')
  assert.equal(result.version.ruleVersion, CURRENT_ENEMY_AGGREGATION_RULE_VERSION)
  assert.deepEqual(result.version.summary, { includedMapCount: 1, excludedMapCount: 3, missingMapCount: 1 })
  assert.deepEqual(result.version.changes.addedMapIds, ['a'])
  const catalogue = parseEnemyAggregationIndex(JSON.parse(await indexBytes(root)))
  const payload = gunzipSync(await bundleBytes(root, 'v1'))
  assert.equal(result.version.payloadBytes, payload.length)
  assert.equal(result.version.payloadSha256, createHash('sha256').update(payload).digest('hex'))
  const bundle = parseEnemyAggregationBundle(JSON.parse(payload.toString()), 'v1')
  assert.equal(catalogue.currentVersionId, bundle.versionId)
  assert.deepEqual(Object.keys(bundle.files), ENEMY_AGGREGATION_FILES)
  assert.deepEqual(bundle.files, data)
})

test('regeneration timestamps and unrelated generator changes do not create another aggregation version', async t => {
  const root = await workspace(t)
  await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'first') })
  const originalIndex = await indexBytes(root), originalBundle = await bundleBytes(root, 'v1')
  const timestamp = '2026-10-24T10:00:00.000Z'
  const next = await snapshot(root, 'second', documents({ timestamp }), { generatedAt: timestamp, generatorVersion: 'c'.repeat(64) })
  const result = await archiveEnemyAggregation({ root, snapshot: next })
  assert.equal(result.status, 'unchanged')
  assert.deepEqual(await indexBytes(root), originalIndex)
  assert.deepEqual(await bundleBytes(root, 'v1'), originalBundle)
})

test('source or rule changes create versions, and old archives remain byte-for-byte unchanged', async t => {
  const root = await workspace(t)
  const old = await snapshot(root, 'old')
  await archiveEnemyAggregation({ root, snapshot: old, ruleVersion: 'legacy-v1' })
  const original = await bundleBytes(root, 'v1')
  const newer = await snapshot(root, 'new', documents({ enabled: true, spawnCount: 4 }))
  const result = await archiveEnemyAggregation({ root, snapshot: newer })
  assert.equal(result.version.previousVersionId, 'v1')
  assert.deepEqual(result.version.changes, { addedMapIds: ['b'], removedMapIds: [], changedMapIds: ['a'] })
  assert.deepEqual(await bundleBytes(root, 'v1'), original)
  const revisionUpdate = await archiveEnemyAggregation({ root, snapshot: { ...newer, revision: 'd'.repeat(40) } })
  assert.equal(revisionUpdate.version.id, 'v3')
  assert.equal(revisionUpdate.version.description, '元データ更新（出現グループ初期無効）')
  assert.deepEqual(revisionUpdate.version.changes, { addedMapIds: [], removedMapIds: [], changedMapIds: [] })
  assert.deepEqual(await bundleBytes(root, 'v1'), original)
})

test('concurrent publishers serialize catalogue updates without losing a version', async t => {
  const root = await workspace(t)
  const first = await snapshot(root, 'first'), second = await snapshot(root, 'second', documents({ enabled: true }))
  const results = await Promise.all([archiveEnemyAggregation({ root, snapshot: first }), archiveEnemyAggregation({ root, snapshot: second })])
  assert.deepEqual(new Set(results.map(result => result.version.id)), new Set(['v1', 'v2']))
  const index = parseEnemyAggregationIndex(JSON.parse(await indexBytes(root)))
  assert.equal(index.versions.length, 2)
  assert.equal(index.currentVersionId, 'v2')
})

test('cancellation immediately before publishing keeps the previous version and removes only new temporary files', async t => {
  const root = await workspace(t)
  await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'first') })
  const originalIndex = await indexBytes(root), originalBundle = await bundleBytes(root, 'v1')
  const next = await snapshot(root, 'second', documents({ enabled: true }))
  const controller = new AbortController()
  let checks = 0
  t.mock.method(controller.signal, 'throwIfAborted', function () {
    if (++checks === 3) controller.abort()
    AbortSignal.prototype.throwIfAborted.call(this)
  })
  await assert.rejects(archiveEnemyAggregation({ root, snapshot: next, signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(await indexBytes(root), originalIndex)
  assert.deepEqual(await bundleBytes(root, 'v1'), originalBundle)
  assert.deepEqual((await readdir(archiveRoot(root))).sort(), ['index.json', 'v1.json.gz'])
  assert.equal((await archiveEnemyAggregation({ root, snapshot: next })).version.id, 'v2')
})

test('malformed, incomplete, mixed-source or inconsistent inputs cannot replace a published version', async t => {
  const root = await workspace(t)
  await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'first') })
  const original = await indexBytes(root)
  const variants = [
    data => { delete data['runtime/enemy_database.json'] },
    data => { data['runtime/enemy_handbook_table.json'].enemyData = {} },
    data => { data['enemy-histogram-counts.json'].summary.spawnMapCount = 0 },
    data => { data['enemy-stage-appearances.json'].enemies.enemy_a.stageCount = 1 },
    data => { data['maps/index.json'].source = { revision: 'e'.repeat(40) } },
  ]
  for (const [number, change] of variants.entries()) {
    const data = documents(); change(data)
    const source = await snapshot(root, `invalid-${number}`, data)
    await assert.rejects(archiveEnemyAggregation({ root, snapshot: source }))
    assert.deepEqual(await indexBytes(root), original)
  }
})

test('catalogue paths and bundle identities are validated, and corrupt existing bundles are never overwritten', async t => {
  const root = await workspace(t), source = await snapshot(root, 'first')
  const { index } = await archiveEnemyAggregation({ root, snapshot: source })
  assert.throws(() => parseEnemyAggregationIndex({ ...index, versions: [{ ...index.versions[0], file: '../v1.json.gz' }] }))
  assert.throws(() => parseEnemyAggregationIndex({ ...index, versions: [{ ...index.versions[0], payloadSha256: undefined }] }))
  assert.throws(() => parseEnemyAggregationIndex({ ...index, versions: [{ ...index.versions[0], payloadBytes: 0 }] }))
  assert.throws(() => parseEnemyAggregationIndex({ ...index, currentVersionId: 'v99' }))
  assert.throws(() => parseEnemyAggregationBundle({ schemaVersion: 1, versionId: 'v1', files: documents() }, 'v2'))
  await writeFile(resolve(archiveRoot(root), 'v1.json.gz'), 'corrupted')
  await assert.rejects(archiveEnemyAggregation({ root, snapshot: source }), /Corrupt aggregation archive/)
  assert.equal((await bundleBytes(root, 'v1')).toString(), 'corrupted')
})

test('normal refresh archives new sources but an old generator snapshot is never relabelled as current rules', async t => {
  const root = await workspace(t), logger = { info() {}, warn() {} }
  const build = () => new Map(LOCAL_GAME_DATA_FILES.map(name => [name, documents()[name] ?? {}]))
  const settings = { root, logger, getRevision: async () => revision, loadSource: async () => ({}), generate: build }
  await refreshLocalGameData({ ...settings, generatorVersion })
  await assert.rejects(indexBytes(root), { code: 'ENOENT' })
  const actualGenerator = await getLocalDataGeneratorVersion()
  const refreshed = await refreshLocalGameData({ ...settings, generatorVersion: actualGenerator })
  assert.equal(refreshed.status, 'updated')
  const first = parseEnemyAggregationIndex(JSON.parse(await indexBytes(root)))
  assert.equal(first.versions[0].ruleVersion, CURRENT_ENEMY_AGGREGATION_RULE_VERSION)
  assert.equal((await refreshLocalGameData({ ...settings, generatorVersion: actualGenerator })).status, 'unchanged')
  assert.deepEqual(parseEnemyAggregationIndex(JSON.parse(await indexBytes(root))), first)
  const changed = await refreshLocalGameData({ ...settings, generatorVersion: actualGenerator, getRevision: async () => 'e'.repeat(40) })
  assert.equal(changed.status, 'updated')
  assert.equal(parseEnemyAggregationIndex(JSON.parse(await indexBytes(root))).versions.length, 2)
})

test('archive validation failure after refresh retains the previous published aggregation dataset', async t => {
  const root = await workspace(t), warnings = []
  const logger = { info() {}, warn(message) { warnings.push(message) } }
  const actualGenerator = await getLocalDataGeneratorVersion()
  const valid = () => new Map(LOCAL_GAME_DATA_FILES.map(name => [name, documents()[name] ?? {}]))
  const settings = { root, logger, generatorVersion: actualGenerator, getRevision: async () => revision,
    loadSource: async () => ({}), generate: valid }
  await refreshLocalGameData(settings)
  const original = await indexBytes(root)
  const result = await refreshLocalGameData({ ...settings, getRevision: async () => 'e'.repeat(40), generate: () => {
    const files = valid(); files.set('enemy-histogram-counts.json', {}); return files
  } })
  assert.equal(result.status, 'updated')
  assert.deepEqual(await indexBytes(root), original)
  assert.ok(warnings.some(message => message.includes('[集計版]')))
})
