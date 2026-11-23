import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadTdMapDatabase, loadTdMapDetail, selectTdMapIndex } from '../src/lib/tdMaps.ts'

test('the shipped TD event opens offline with matching enemy, terrain, and wave data for each stage', async (t) => {
  const bytes = await readFile(new URL('../public/data/maps/td-event.json', import.meta.url), 'utf8')
  const fetch = t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/data/maps/td-event.json')
    return new Response(bytes)
  })
  const index = await loadTdMapDatabase()
  const codes = index.maps.map(map => map.code)
  for (const code of ['TD-1', 'TD-2', 'TD-3', 'TD-4', 'TD-5', 'TD-6', 'TD-7', 'TD-8', 'TD-P-1', 'TD-TR-1']) {
    assert.ok(codes.includes(code), code)
  }
  assert.deepEqual(selectTdMapIndex(index).maps, index.maps)
  for (const map of index.maps) {
    const detail = await loadTdMapDetail(map)
    assert.ok(detail.grid.length && detail.tiles.length && detail.waves?.length, map.code)
    assert.ok(detail.enemies.every(enemy => index.enemies[enemy.id]?.name), map.code)
  }
  const bossMap = index.maps.find(map => map.code === 'TD-8')!
  assert.equal(bossMap.spawnCount, 59)
  assert.deepEqual((await loadTdMapDetail(bossMap)).enemies.find(enemy => enemy.id === 'enemy_1573_pyczog'),
    { id: 'enemy_1573_pyczog', count: 1 })
  assert.equal(fetch.mock.callCount(), 1)

  const otherEvent = { ...bossMap, zoneId: 'other_zone1', code: 'TD-5', enemyIds: ['other-enemy'] }
  const otherCode = { ...bossMap, code: 'WD-8' }
  const subset = selectTdMapIndex({ ...index, maps: [otherEvent, bossMap, otherCode],
    enemies: { ...index.enemies, 'other-enemy': { ...index.enemies[bossMap.enemyIds[0]] } } })
  assert.deepEqual(subset.maps, [bossMap])
  assert.deepEqual(Object.keys(subset.enemies).sort(), [...bossMap.enemyIds].sort())
})
