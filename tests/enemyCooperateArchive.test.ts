import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageCategories, getMapCoverageDisplayStatus } from '../src/lib/enemyMapCoverage.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))
const addedCounts = new Map([
  ...Object.entries({ '01': 16, '02': 23, fortress_02: 29, 'fortress_hard-01': 24, fortress_rm01: 16, rm04: 16, tr03: 4 })
    .map(([suffix, value]) => [`activities/act1multi/level_act1multi_${suffix}`, value] as const),
  ...Object.entries({ '10': 6, 'fortress-hard-01': 21, rm01: 16, rm03: 23, tr03: 4 })
    .map(([suffix, value]) => [`activities/act2multi/level_act2multi_${suffix}`, value] as const),
  ...Object.entries({ '03': 1, fortress: 16, tr03: 4 })
    .map(([suffix, value]) => [`activities/act2vmulti/level_act2vmulti_${suffix}`, value] as const),
])
const correctedCounts = new Map([
  ['activities/act1multi/level_act1multi_fortress_01', 19],
  ['activities/act2multi/level_act2multi_fortress_01', 10],
  ['activities/act2multi/level_act2multi_fortress_02', 7],
  ['activities/act2multi/level_act2multi_fortress_rm01', 19],
])

test('V6 adds fifteen IG maps, corrects timed Fortress bounds, and leaves other modes unchanged', async () => {
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1)!, folder))) })
  const previous = catalog.versions.find(entry => entry.id === 'v5')!
  const current = catalog.versions.find(entry => entry.id === 'v6')!
  assert.equal(current.previousVersionId, previous.id)
  assert.equal(current.sourceRevision, previous.sourceRevision)
  assert.equal(current.ruleVersion, 'known-spawn-lower-bound-ig-v6')
  assert.deepEqual([...current.changes.addedMapIds].sort(), [...addedCounts.keys()].sort())
  assert.deepEqual(current.changes.removedMapIds, [])
  const [before, after] = await Promise.all([client.loadVersion(previous), client.loadVersion(current)])
  assert.equal(after.counts.summary.spawnMapCount, 1760)
  assert.equal(after.counts.summary.spawnExcludedMapCount, 18)
  assert.equal(after.counts.summary.lowerBoundMapCount, 297)
  assert.equal(after.counts.summary.missingMapCount, 197)
  assert.deepEqual(getMapCoverageCategories(after.maps.maps, 'SPAWNS').map(row => [row.key, row.included]), [
    ['main', 484], ['event', 1241], ['supply', 35], ['other', 0],
  ])
  const oldMaps = new Map(before.maps.maps.map(map => [map.levelId, map]))
  const conditions = new Map(after.counts.diagnostics?.aggregationConditions?.map(entry => [entry.levelId, entry.conditions]))
  for (const map of after.maps.maps) {
    const old = oldMaps.get(map.levelId)!
    if (!/^activities\/(?:act1multi|act2multi|act2vmulti)\//.test(map.levelId)) assert.deepEqual(map, old, map.levelId)
    if (addedCounts.has(map.levelId) || correctedCounts.has(map.levelId)) {
      assert.equal(map.spawnAggregation?.count, addedCounts.get(map.levelId) ?? correctedCounts.get(map.levelId), map.levelId)
      assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'conditional')
    }
    if (getMapCoverageDisplayStatus(map, 'SPAWNS') === 'conditional' && map.aggregationConditions?.length) {
      assert.deepEqual(conditions.get(map.levelId), map.aggregationConditions, map.levelId)
    }
  }
  for (const [id, enemy] of Object.entries(after.counts.enemies)) assert.equal(enemy.mapCount, before.counts.enemies[id].mapCount, id)
  assert.equal(Object.values(after.counts.enemies).reduce((sum, enemy) => sum + enemy.spawnCount, 0), 71665)
})
