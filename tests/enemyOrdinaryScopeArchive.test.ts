import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageStatus, getMapCoverageDisplayStatus, getMapCoverageReasons, getMapCoverageCategories } from '../src/lib/enemyMapCoverage.ts'
import { createEnemyMapCoverageChartSnapshot } from '../src/lib/enemyMapCoverageChartImage.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))

test('V8 removes special modes from MAPS and SPAWNS while preserving ordinary battles and all raw analysis', async () => {
  const previous = catalog.versions.find(entry => entry.id === 'v7')!
  const current = catalog.versions.find(entry => entry.id === 'v8')!
  assert.ok(previous)
  assert.ok(current)
  assert.equal(current.previousVersionId, 'v7')
  assert.equal(current.sourceRevision, previous.sourceRevision)
  assert.equal(current.ruleVersion, 'ordinary-battle-scope-v8')
  assert.deepEqual(current.changes.addedMapIds, [])
  assert.equal(current.changes.removedMapIds.length, 205)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const [before, after] = await Promise.all([client.loadVersion(previous), client.loadVersion(current)])
  assert.equal(before.counts.summary.spawnMapCount, 1767)
  assert.deepEqual(after.counts.summary, { mapCount: 1563, missingMapCount: 152, excludedMapCount: 626,
    spawnMapCount: 1562, spawnExcludedMapCount: 1, lowerBoundMapCount: 201, expectedMapCount: 0 })
  assert.deepEqual(getMapCoverageCategories(after.maps.maps, 'SPAWNS').map(row => [row.key, row.included]), [
    ['main', 484], ['event', 1043], ['supply', 35], ['other', 0],
  ])
  const oldMaps = new Map(before.maps.maps.map(map => [map.levelId, map]))
  const excludedByType: Record<string, number> = {}
  let removed = 0, missing = 0, pending = 0
  for (const map of after.maps.maps) {
    const old = oldMaps.get(map.levelId)!
    assert.ok(old)
    const { statisticsExclusion, ...analysis } = map
    assert.deepEqual(analysis, old, map.levelId)
    if (!statisticsExclusion) continue
    excludedByType[statisticsExclusion.activityType] = (excludedByType[statisticsExclusion.activityType] ?? 0) + 1
    for (const mode of ['MAPS', 'SPAWNS'] as const) {
      assert.equal(getMapCoverageStatus(map, mode), 'excluded')
      assert.equal(getMapCoverageDisplayStatus(map, mode), 'excluded')
    }
    assert.ok(getMapCoverageReasons(map, 'SPAWNS').some(reason => reason.includes('特殊モード')))
    const oldStatus = getMapCoverageStatus(old, 'SPAWNS')
    if (oldStatus === 'included') {
      removed++
      assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'excluded')
    } else if (oldStatus === 'missing') missing++
    else pending++
  }
  assert.equal(after.maps.maps.length, before.maps.maps.length)
  assert.deepEqual(excludedByType, { ENEMY_DUEL: 8, AUTOCHESS_VERIFY1: 5, BOSS_RUSH: 54,
    VEC_BREAK: 16, MULTIPLAY_V3: 53, HALFIDLE_VERIFY1: 15, AUTOCHESS_SEASON: 11,
    VEC_BREAK_V2: 64, MULTIPLAY_VERIFY2: 12, APRIL_FOOL: 1, INTERLOCK: 9, ARCADE: 12 })
  assert.deepEqual({ removed, missing, pending }, { removed: 205, missing: 45, pending: 10 })
  for (const [id, counts] of Object.entries(after.counts.enemies)) {
    assert.ok(counts.mapCount <= before.counts.enemies[id].mapCount, id)
    assert.ok(counts.spawnCount <= before.counts.enemies[id].spawnCount + 1e-7, id)
  }
  // All historical bundles stay addressable with their published checksums.
  for (const entry of catalog.versions.filter(entry => Number(entry.id.slice(1)) <= 7)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(entry.file, folder))).digest('hex'), entry.sha256)
  }
})

test('V9 chart exports place all 260 special maps in excluded without changing the archive', async () => {
  const version = catalog.versions.find(entry => entry.id === 'v9')!
  assert.ok(version)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const bundle = await client.loadVersion(version)
  const before = JSON.stringify(bundle)
  for (const mode of ['SPAWNS', 'MAPS'] as const) {
    const snapshot = createEnemyMapCoverageChartSnapshot(bundle.maps.maps, mode, version)
    const event = snapshot.categories.find(category => category.key === 'event')!
    assert.equal(event.total, 1437)
    assert.equal(event.included, 1044)
    assert.equal(event.excluded, 260)
    assert.equal(event.pending, 0)
    assert.equal(event.missing, 133)
    assert.equal(snapshot.totals.included, 1563)
    for (const category of snapshot.categories) {
      assert.equal(category.included + category.excluded + category.story + category.pending + category.missing, category.total)
    }
  }
  assert.equal(JSON.stringify(bundle), before)
  assert.equal(createHash('sha256').update(await readFile(new URL(version.file, folder))).digest('hex'), version.sha256)
})
