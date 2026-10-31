import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageCategories, getMapCoverageStatus } from '../src/lib/enemyMapCoverage.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))
const levelId = 'activities/act45side/level_act45side_ex05'

test('V9 adds only SS-EX-5 and its 34 fixed spawns without changing aggregation scope', async () => {
  const previous = catalog.versions.find(entry => entry.id === 'v8')!
  const current = catalog.versions.find(entry => entry.id === 'v9')!
  assert.ok(previous)
  assert.ok(current)
  assert.equal(current.previousVersionId, previous.id)
  assert.equal(current.sourceRevision, previous.sourceRevision)
  assert.equal(current.ruleVersion, 'empty-wave-actions-v9')
  assert.deepEqual(current.changes.addedMapIds, [levelId])
  assert.deepEqual(current.changes.removedMapIds, [])

  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const [before, after] = await Promise.all([client.loadVersion(previous), client.loadVersion(current)])
  assert.deepEqual(after.counts.summary, {
    ...before.counts.summary,
    spawnMapCount: before.counts.summary.spawnMapCount + 1,
    spawnExcludedMapCount: before.counts.summary.spawnExcludedMapCount - 1,
  })
  assert.deepEqual(getMapCoverageCategories(after.maps.maps, 'SPAWNS').map(row => [row.key, row.included]), [
    ['main', 484], ['event', 1044], ['supply', 35], ['other', 0],
  ])
  const oldMaps = new Map(before.maps.maps.map(map => [map.levelId, map]))
  assert.deepEqual(after.maps.maps.map(map => map.levelId).sort(), [...oldMaps.keys()].sort())
  const actuallyAdded: string[] = []
  for (const map of after.maps.maps) {
    const old = oldMaps.get(map.levelId)!
    assert.deepEqual(map.statisticsExclusion, old.statisticsExclusion, map.levelId)
    if (getMapCoverageStatus(map, 'SPAWNS') === 'included'
      && getMapCoverageStatus(old, 'SPAWNS') !== 'included') actuallyAdded.push(map.levelId)
    if (map.levelId !== levelId && map.zoneType !== 'CLIMB_TOWER') assert.deepEqual(map, old, map.levelId)
    if (map.zoneType === 'CLIMB_TOWER') assert.equal(getMapCoverageStatus(map, 'SPAWNS'), 'excluded')
  }
  assert.deepEqual(actuallyAdded, [levelId])
  const stage = after.maps.maps.find(map => map.levelId === levelId)!
  assert.equal(stage.status, 'supported')
  assert.equal(stage.spawnCount, 34)
  assert.equal(stage.spawnAggregation, undefined)
  assert.deepEqual(stage.reasons, [])
  assert.deepEqual(stage.enemySpawnCounts, {
    enemy_10105_mjcdol_2: 9, enemy_10107_mjcdog_2: 6, enemy_10103_mjcppp_2: 19,
  })
  assert.ok(oldMaps.get(levelId)!.reasons.includes('invalid-actions'))
  assert.equal(getMapCoverageStatus(oldMaps.get(levelId)!, 'SPAWNS'), 'excluded')

  assert.deepEqual(Object.keys(after.counts.enemies).sort(), Object.keys(before.counts.enemies).sort())
  for (const [id, enemy] of Object.entries(after.counts.enemies)) {
    assert.equal(enemy.mapCount, before.counts.enemies[id].mapCount, `${id}: map counts must not change`)
    assert.equal(enemy.spawnCount - before.counts.enemies[id].spawnCount,
      stage.enemySpawnCounts![id] ?? 0, `${id}: only SS-EX-5 may contribute additional spawns`)
  }
})

test('V9 keeps the previous V7 and V8 archive bytes intact', async () => {
  for (const [id, sha256] of Object.entries({
    v7: 'b8ee3d9e9645ceb1b5faae25a66ff53fefcc31d8ee96aa7e40ecfdb398c5a96e',
    v8: '28f273424c20b60af1482d579cb2ddcfac92fceeb1afebeb2badb6f59ba1d5ae',
  })) {
    const entry = catalog.versions.find(version => version.id === id)!
    assert.ok(entry)
    assert.equal(createHash('sha256').update(await readFile(new URL(entry.file, folder))).digest('hex'), sha256, id)
    assert.equal(entry.sha256, sha256)
  }
})
