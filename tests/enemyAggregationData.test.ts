import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createEnemyAggregationClient, getEnemyAggregationFilename } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { createEnemyMapCoverageChartSnapshot } from '../src/lib/enemyMapCoverageChartImage.ts'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))
const entries = catalog.versions.slice(0, 2)
const files = new Map(await Promise.all(entries.map(async entry => [entry.file, await readFile(new URL(entry.file, folder))] as const)))
const prefix = '/arknights_2/data/enemy-aggregation/'

test('shipped old and new datasets reproduce the same-revision 75 map increase without live data', async () => {
  const calls: string[] = []
  const client = createEnemyAggregationClient({ base: '/arknights_2/', fetch: async input => {
    const url = String(input); calls.push(url)
    assert.ok(url.startsWith(prefix))
    if (url.endsWith('/index.json')) return Response.json(catalog)
    const bytes = files.get(url.slice(prefix.length))
    return bytes ? new Response(bytes) : new Response('', { status: 404 })
  } })
  const loaded = await client.loadIndex()
  const [oldData, newData] = await Promise.all(entries.map(entry => client.loadVersion(entry)))
  assert.equal(entries[0].sourceRevision, entries[1].sourceRevision)
  assert.equal(oldData.counts.summary.spawnMapCount, 1309)
  assert.equal(newData.counts.summary.spawnMapCount, 1384)
  assert.equal(entries[1].changes.addedMapIds.length, 75)
  assert.equal(entries[1].changes.removedMapIds.length, 0)
  assert.deepEqual(oldData.rows.map(row => [row.id, row.stats]), newData.rows.map(row => [row.id, row.stats]))
  const standard = 'obt/main/level_main_10-04'
  const tough = 'obt/main/level_tough_10-04'
  assert.equal(oldData.maps.maps.find(map => map.levelId === standard)?.status, 'excluded')
  assert.equal(newData.maps.maps.find(map => map.levelId === standard)?.status, 'supported')
  assert.equal(newData.maps.maps.find(map => map.levelId === standard)?.spawnCount, 48)
  assert.equal(newData.maps.maps.find(map => map.levelId === tough)?.spawnCount, 50)
  assert.equal(await client.loadVersion(entries[0]), oldData)
  assert.equal(calls.length, 3)
  assert.equal(loaded.currentVersionId, catalog.currentVersionId)
})

test('failed or corrupt fixed datasets never fall back; failures can be retried', async () => {
  let fail = true
  const calls: string[] = []
  const client = createEnemyAggregationClient({ base: '/arknights_2', fetch: async input => {
    calls.push(String(input))
    if (fail) return new Response('unavailable', { status: 404 })
    return new Response(files.get(entries[0].file))
  } })
  await assert.rejects(client.loadVersion(entries[0]), /取得/)
  fail = false
  assert.equal((await client.loadVersion(entries[0])).counts.summary.spawnMapCount, 1309)
  assert.deepEqual(calls, [prefix + entries[0].file, prefix + entries[0].file])
  await assert.rejects(client.loadVersion({ ...entries[0], sha256: '0'.repeat(64) }), /一致/)
})

test('a valid gzip/hash with the wrong version or mixed map counts is rejected', async () => {
  const original = JSON.parse(gunzipSync(files.get(entries[0].file)!).toString('utf8'))
  for (const mutate of [
    (value: typeof original) => { value.versionId = 'v999' },
    (value: typeof original) => { value.files['enemy-histogram-counts.json'].summary.spawnMapCount += 1 },
  ]) {
    const bundle = structuredClone(original); mutate(bundle)
    const payload = Buffer.from(JSON.stringify(bundle))
    const bytes = gzipSync(payload)
    const entry = { ...entries[0], bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      payloadBytes: payload.length, payloadSha256: createHash('sha256').update(payload).digest('hex') }
    const client = createEnemyAggregationClient({ fetch: async () => new Response(bytes) })
    await assert.rejects(client.loadVersion(entry))
  }
})

test('transparent HTTP gzip decoding verifies the same immutable payload as opaque file delivery', async () => {
  const payload = gunzipSync(files.get(entries[1].file)!)
  const client = createEnemyAggregationClient({ fetch: async () => new Response(payload, { headers: { 'Content-Encoding': 'gzip' } }) })
  assert.equal((await client.loadVersion(entries[1])).counts.summary.spawnMapCount, 1384)
  const corrupt = createEnemyAggregationClient({ fetch: async () => new Response(Buffer.concat([payload, Buffer.from(' ')])) })
  await assert.rejects(corrupt.loadVersion(entries[1]), /一致/)
})

test('export freezes the version and filename retains it within shared naming limits', async () => {
  const maps = JSON.parse(gunzipSync(files.get(entries[1].file)!).toString('utf8')).files['maps/index.json'].maps
  const version = { ...entries[1] }
  const snapshot = createEnemyMapCoverageChartSnapshot(maps, 'SPAWNS', version)
  version.label = 'changed'
  assert.equal(snapshot.aggregationVersion?.label, entries[1].label)
  assert.match(snapshot.filename, /集計v2/)
  assert.equal(snapshot.totals.included, 1384)
  const name = withChartImageAspect(getEnemyAggregationFilename(`敵_術耐性_${'条件_'.repeat(90)}.png`, 'v2'), 16 / 9)
  assert.match(name, /集計v2/)
  assert.match(name, /_比率16x9\.png$/)
  assert.ok(new TextEncoder().encode(name).length <= 240)
  assert.equal(getEnemyAggregationFilename('旧画像.png'), '旧画像.png')
})
