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

function lowerBoundDocuments() {
  const data = documents()
  const partial = data['maps/index.json'].maps[1]
  partial.reasons = ['branch-spawn']
  partial.spawnAggregation = { kind: 'lower-bound', count: 2, reasons: ['branch-spawn'] }
  const histogram = data['enemy-histogram-counts.json']
  histogram.spawnAggregationMode = 'lower-bound'
  histogram.summary.spawnMapCount = 2
  histogram.summary.spawnExcludedMapCount = 0
  histogram.summary.lowerBoundMapCount = 1
  histogram.enemies.enemy_a.spawnCount = 5
  histogram.diagnostics = { lowerBoundLevels: [{ levelId: 'b', spawnCount: 2, reasons: ['branch-spawn'] }] }
  return data
}

test('V4 adds lower-bound coverage without changing any of the three historical bundles', async t => {
  const root = await workspace(t)
  const before = []
  for (const ruleVersion of ['legacy-v1', 'hidden-groups-default-off-v2', 'optional-branch-mechanisms-v3']) {
    const result = await archiveEnemyAggregation({ root, snapshot: await snapshot(root, ruleVersion), ruleVersion })
    before.push({ entry: result.version, bytes: await bundleBytes(root, result.version.id) })
  }
  const data = lowerBoundDocuments()
  const result = await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'v4-lower-bound', data) })
  assert.equal(result.version.id, 'v4')
  assert.equal(result.version.previousVersionId, 'v3')
  assert.equal(result.version.ruleVersion, 'known-spawn-lower-bound-v4')
  assert.deepEqual(result.version.summary, { includedMapCount: 2, excludedMapCount: 2, missingMapCount: 1, lowerBoundMapCount: 1 })
  assert.deepEqual(result.version.changes.addedMapIds, ['b'])
  assert.deepEqual(result.index.versions.slice(0, 3), before.map(item => item.entry))
  for (const item of before) assert.deepEqual(await bundleBytes(root, item.entry.id), item.bytes)
  const bundle = parseEnemyAggregationBundle(JSON.parse(gunzipSync(await bundleBytes(root, 'v4'))), 'v4')
  assert.equal(bundle.files['maps/index.json'].maps[1].status, 'excluded')
  assert.equal(bundle.files['maps/index.json'].maps[1].spawnAggregation.count, 2)
  assert.deepEqual(bundle.files['enemy-histogram-counts.json'], data['enemy-histogram-counts.json'])
})

test('lower-bound provenance must agree by map, count and unresolved reason across the bundle', () => {
  for (const change of [
    data => { data['enemy-histogram-counts.json'].summary.lowerBoundMapCount = 0 },
    data => { data['enemy-histogram-counts.json'].diagnostics.lowerBoundLevels[0].levelId = 'a' },
    data => { data['enemy-histogram-counts.json'].diagnostics.lowerBoundLevels[0].spawnCount = 3 },
    data => { data['enemy-histogram-counts.json'].diagnostics.lowerBoundLevels[0].reasons = ['weighted-spawn'] },
    data => { delete data['enemy-histogram-counts.json'].diagnostics },
  ]) {
    const data = lowerBoundDocuments()
    change(data)
    assert.throws(() => parseEnemyAggregationBundle({ schemaVersion: 1, versionId: 'v4', files: data }))
  }
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

test('optional-spawn evidence is preserved in the immutable bundle and older versions remain readable', async t => {
  const root = await workspace(t)
  const old = await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'old'), ruleVersion: 'hidden-groups-default-off-v2' })
  const oldBytes = await bundleBytes(root, old.version.id)
  const data = documents()
  const evidence = [{ branchId: 'optional', phaseIndex: 0, actionIndex: 0, enemyId: 'enemy_a',
    ruleId: 'verified-example', condition: '出現を回避してクリア可能', evidence: ['検証済みの出現機構'] }]
  data['maps/index.json'].maps[0].omittedBranchSpawns = evidence
  const result = await archiveEnemyAggregation({ root, snapshot: await snapshot(root, 'new', data) })
  const bundle = parseEnemyAggregationBundle(JSON.parse(gunzipSync(await bundleBytes(root, result.version.id))), result.version.id)
  assert.deepEqual(bundle.files['maps/index.json'].maps[0].omittedBranchSpawns, evidence)
  assert.deepEqual(await bundleBytes(root, old.version.id), oldBytes)
  assert.equal(parseEnemyAggregationBundle(JSON.parse(gunzipSync(oldBytes)), old.version.id).versionId, old.version.id)
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
  assert.equal(revisionUpdate.version.description, '元データ更新（下限集計）')
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
