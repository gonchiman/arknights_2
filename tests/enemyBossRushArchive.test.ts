import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageCategories, getMapCoverageDisplayStatus, getMapCoverageStatus } from '../src/lib/enemyMapCoverage.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))
// Independent corpus totals: all reviewed sequential wave SPAWNs, default-off
// relic groups, existing branch decisions. Sponsor drones stay in the total.
const expected = new Map([
  ...Object.entries({ '01': 30, '02': 96, '03': 49, '04': 74, ex01: 30, ex02: 96, ex03: 49, ex04: 74, fin04: 74 })
    .map(([suffix, value]) => [`activities/act5bossrush/level_bossrush5_${suffix}`, value] as const),
  ...Object.entries({ '01': 46, '02': 84, '03': 49, '04': 139, ex01: 46, ex02: 84, ex03: 49, ex04: 139, fin04: 145 })
    .map(([suffix, value]) => [`activities/act6bossrush/level_bossrush6_${suffix}`, value] as const),
])

test('shipped TN expansion adds ten maps and completes eight partial schedules without changing other maps', async () => {
  const client = createEnemyAggregationClient({ fetch: async input => {
    const filename = String(input).split('/').at(-1)!
    return new Response(await readFile(new URL(filename, folder)))
  } })
  const v4 = catalog.versions.find(entry => entry.id === 'v4')!
  const v5 = catalog.versions.find(entry => entry.id === 'v5')!
  assert.equal(v5.sourceRevision, v4.sourceRevision)
  assert.equal(v5.previousVersionId, 'v4')
  assert.equal(v5.ruleVersion, 'known-spawn-lower-bound-tn-v5')
  assert.equal(v5.changes.addedMapIds.length, 10)
  assert.equal(v5.changes.changedMapIds.length, 8)
  assert.deepEqual(v5.changes.removedMapIds, [])
  const [before, after] = await Promise.all([client.loadVersion(v4), client.loadVersion(v5)])
  assert.equal(before.counts.summary.spawnMapCount, 1735)
  assert.equal(after.counts.summary.spawnMapCount, 1745)
  assert.equal(after.counts.summary.spawnExcludedMapCount, 33)
  assert.equal(after.counts.summary.lowerBoundMapCount, 282)
  assert.equal(after.counts.summary.missingMapCount, 197)
  assert.deepEqual(getMapCoverageCategories(after.maps.maps, 'SPAWNS').map(row => [row.key, row.included]), [
    ['main', 484], ['event', 1226], ['supply', 35], ['other', 0],
  ])
  const oldMaps = new Map(before.maps.maps.map(map => [map.levelId, map]))
  let tnTotal = 0, tnCount = 0
  for (const map of after.maps.maps) {
    if (!expected.has(map.levelId)) {
      assert.deepEqual(map, oldMaps.get(map.levelId), map.levelId)
      continue
    }
    tnCount += 1
    assert.equal(getMapCoverageStatus(map, 'SPAWNS'), 'included')
    assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'conditional')
    assert.deepEqual(map.aggregationConditions, ['全WAVEクリア', '抑制ユニットによる追加出現なし'])
    const amount = map.spawnAggregation?.count ?? map.spawnCount
    assert.equal(amount, expected.get(map.levelId), map.levelId)
    tnTotal += amount!
    assert.ok(!map.reasons.includes('unsupported-wave-tag'), map.levelId)
  }
  assert.equal(tnCount, 18)
  assert.equal(tnTotal, 1353)
  assert.deepEqual(new Map(after.counts.diagnostics?.aggregationConditions?.map(entry => [entry.levelId, entry.conditions])),
    new Map([...expected.keys()].map(levelId => [levelId, ['全WAVEクリア', '抑制ユニットによる追加出現なし']])))
  let oldTotal = 0, newTotal = 0
  for (const [id, enemy] of Object.entries(after.counts.enemies)) {
    assert.equal(enemy.mapCount, before.counts.enemies[id].mapCount, id)
    assert.ok(enemy.spawnCount >= before.counts.enemies[id].spawnCount, id)
    oldTotal += before.counts.enemies[id].spawnCount
    newTotal += enemy.spawnCount
  }
  assert.equal(oldTotal, 70031)
  assert.equal(newTotal, 71152)
})
