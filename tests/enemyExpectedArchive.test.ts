import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageCategories, getMapCoverageDisplayStatus, getMapCoverageStatus } from '../src/lib/enemyMapCoverage.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))
const addedMapIds = [
  ...['06', 'rm01', 'rm06', 'rm07'].map(suffix => `activities/act1multi/level_act1multi_${suffix}`),
  ...['01', '06', 'hard-02'].map(suffix => `activities/act2multi/level_act2multi_${suffix}`),
].sort()

test('V7 adds seven IG random-spawn maps while preserving non-IG coverage and enemy map counts', async () => {
  const previous = catalog.versions.find(entry => entry.id === 'v6')
  const current = catalog.versions.find(entry => entry.id === 'v7')
  assert.ok(previous, 'V6 must remain available')
  assert.ok(current, 'V7 must be archived before running this real-data regression')
  assert.equal(current.previousVersionId, previous.id)
  assert.equal(current.sourceRevision, previous.sourceRevision)
  assert.equal(current.ruleVersion, 'known-spawn-expected-ig-v7')
  assert.deepEqual([...current.changes.addedMapIds].sort(), addedMapIds)
  assert.deepEqual(current.changes.removedMapIds, [])

  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const [before, after] = await Promise.all([client.loadVersion(previous), client.loadVersion(current)])
  assert.equal(after.counts.spawnAggregationMode, 'expected-lower-bound')
  assert.equal(after.counts.summary.spawnMapCount, 1767)
  assert.equal(after.counts.summary.spawnExcludedMapCount, 11)
  assert.equal(after.counts.summary.lowerBoundMapCount, 265)
  assert.equal(after.counts.summary.expectedMapCount, 39)
  assert.equal(after.counts.summary.missingMapCount, before.counts.summary.missingMapCount)
  assert.equal(current.summary.lowerBoundMapCount, 265)
  assert.equal(current.summary.expectedMapCount, 39)
  assert.deepEqual(getMapCoverageCategories(after.maps.maps, 'SPAWNS').map(row => [row.key, row.included]), [
    ['main', 484], ['event', 1248], ['supply', 35], ['other', 0],
  ])

  const oldMaps = new Map(before.maps.maps.map(map => [map.levelId, map]))
  assert.deepEqual(after.maps.maps.map(map => map.levelId).sort(), [...oldMaps.keys()].sort())
  const actuallyAdded: string[] = []
  for (const map of after.maps.maps) {
    const old = oldMaps.get(map.levelId)!
    if (!/^activities\/(?:act1multi|act2multi|act2vmulti)\//.test(map.levelId)) {
      assert.deepEqual(map, old, `${map.levelId}: non-IG data must not change`)
    }
    if (getMapCoverageStatus(map, 'SPAWNS') === 'included'
      && getMapCoverageStatus(old, 'SPAWNS') !== 'included') actuallyAdded.push(map.levelId)
    if (addedMapIds.includes(map.levelId)) {
      assert.equal(map.spawnAggregation?.kind, 'expected-lower-bound', map.levelId)
      assert.ok((map.spawnAggregation?.count ?? 0) > 0, map.levelId)
      assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'conditional', map.levelId)
    }
  }
  assert.deepEqual(actuallyAdded.sort(), addedMapIds)
  assert.deepEqual(Object.keys(after.counts.enemies).sort(), Object.keys(before.counts.enemies).sort())
  for (const [id, enemy] of Object.entries(after.counts.enemies)) {
    assert.equal(enemy.mapCount, before.counts.enemies[id].mapCount, `${id}: MAPS counts are independent of spawn estimates`)
  }

  // Fractional expected contributions must survive the generator, archive,
  // client parser and provenance checks without becoming exact integer counts.
  const expectedMaps = after.maps.maps.filter(map => map.spawnAggregation?.kind === 'expected-lower-bound'
    && getMapCoverageStatus(map, 'SPAWNS') === 'included')
  const expectedLevels = new Map(after.counts.diagnostics?.expectedLevels?.map(entry => [entry.levelId, entry]))
  const conditions = new Map(after.counts.diagnostics?.aggregationConditions?.map(entry => [entry.levelId, entry.conditions]))
  assert.equal(expectedMaps.length, 39)
  assert.deepEqual([...expectedLevels.keys()].sort(), expectedMaps.map(map => map.levelId).sort())
  for (const map of expectedMaps) {
    const diagnostic = expectedLevels.get(map.levelId)!
    assert.equal(diagnostic.spawnCount, map.spawnAggregation!.count, map.levelId)
    assert.deepEqual([...diagnostic.reasons].sort(), [...map.spawnAggregation!.reasons].sort(), map.levelId)
    assert.ok(map.aggregationConditions?.length, `${map.levelId}: expected counts need explicit assumptions`)
    assert.deepEqual(conditions.get(map.levelId), map.aggregationConditions, map.levelId)
    assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'conditional', map.levelId)
  }
  assert.ok(Object.values(after.counts.enemies).some(enemy => !Number.isInteger(enemy.spawnCount)),
    'the real-data expected distribution must retain fractional enemy counts')
})

test('V7 preserves the immutable V1 through V6 archive bytes', async () => {
  const historicalHashes = {
    v1: 'f2ee404e59d0052bd0be04e224c8bda6f59874502bcaae182a87ed3279f1c939',
    v2: '7e026fa92318b509b04d13757747ebc10a361a0eb4f98de38e273bf4f17d01c8',
    v3: '0ee97d420a1ebc82bb37a565b325ea3e53ef11e3b4f96e53ca61e0dcea9498f6',
    v4: '463c986930e1091da3f1101fc2b7434f9a21afbf43242bc11561b525dcc4c623',
    v5: '8684ea48832f01032d6c98127e9f732e77039fd6db52addb6647f11ebfb66c78',
    v6: '8e727f11d71361d4b11447c21924a5b2161acf80db8f117bd22dd3d47b74de54',
  }
  for (const [id, sha256] of Object.entries(historicalHashes)) {
    const entry = catalog.versions.find(version => version.id === id)
    assert.ok(entry, `${id}: historical version must remain in the catalog`)
    const bytes = await readFile(new URL(entry.file, folder))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, id)
    assert.equal(entry.sha256, sha256, `${id}: catalog hash must still describe the original bundle`)
  }
})
