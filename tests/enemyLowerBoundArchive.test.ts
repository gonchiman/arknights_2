import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEnemyAggregationClient } from '../src/lib/enemyAggregationData.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageCategories, getMapCoverageStatus } from '../src/lib/enemyMapCoverage.ts'

const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
const catalog = parseEnemyAggregationIndex(JSON.parse(await readFile(new URL('index.json', folder), 'utf8')))

test('shipped V4 adds positive known contributions while preserving V3 and map appearances', async () => {
  const client = createEnemyAggregationClient({ fetch: async input => {
    const filename = String(input).split('/').at(-1)!
    return new Response(await readFile(new URL(filename, folder)))
  } })
  const v3 = catalog.versions.find(entry => entry.id === 'v3')!
  const v4 = catalog.versions.find(entry => entry.id === 'v4')!
  assert.equal(v4.sourceRevision, v3.sourceRevision)
  assert.equal(v4.previousVersionId, 'v3')
  const [before, after] = await Promise.all([client.loadVersion(v3), client.loadVersion(v4)])
  assert.equal(before.counts.summary.spawnMapCount, 1454)
  assert.equal(after.counts.summary.spawnMapCount, 1735)
  assert.equal(after.counts.summary.lowerBoundMapCount, 281)
  assert.equal(v4.changes.addedMapIds.length, 281)
  assert.deepEqual(v4.changes.removedMapIds, [])
  assert.deepEqual(getMapCoverageCategories(after.maps.maps, 'SPAWNS').map(row => [row.key, row.included, row.lowerBound ?? 0]), [
    ['main', 484, 45], ['event', 1216, 236], ['supply', 35, 0], ['other', 0, 0],
  ])
  const oldMaps = new Map(before.maps.maps.map(map => [map.levelId, map]))
  let lowerCount = 0
  for (const map of after.maps.maps) {
    const previous = oldMaps.get(map.levelId)!
    const { spawnAggregation, ...raw } = map
    assert.deepEqual(raw, previous, map.levelId)
    if (spawnAggregation) {
      assert.equal(getMapCoverageStatus(previous, 'SPAWNS'), 'excluded')
      assert.equal(getMapCoverageStatus(map, 'SPAWNS'), 'included')
      assert.ok(spawnAggregation.count > 0)
      lowerCount += spawnAggregation.count
    }
  }
  let increase = 0
  for (const [id, enemy] of Object.entries(after.counts.enemies)) {
    assert.equal(enemy.mapCount, before.counts.enemies[id].mapCount, id)
    const difference = enemy.spawnCount - before.counts.enemies[id].spawnCount
    assert.ok(difference >= 0, id)
    increase += difference
  }
  assert.equal(increase, lowerCount)
  const audit = JSON.parse(await readFile(new URL('../docs/enemy-branch-audit/v3.json', import.meta.url), 'utf8'))
  const held = new Set(audit.maps.filter((map: { archiveStatus: string }) => map.archiveStatus === 'excluded')
    .map((map: { levelId: string }) => map.levelId))
  assert.equal(held.size, 279)
  assert.equal(after.maps.maps.filter(map => held.has(map.levelId) && getMapCoverageStatus(map, 'SPAWNS') === 'included').length, 262)
})
