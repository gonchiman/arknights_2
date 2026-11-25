import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gameDataClient } from '../src/lib/gameDataClient.ts'
import { formatTdCell } from '../src/lib/tdCoordinates.ts'
import { loadTdMapDatabase, loadTdMapDetail, selectTdMapIndex } from '../src/lib/tdMaps.ts'

test('TD files start at the right edge of each stage and ranks start at the top', () => {
  assert.equal(formatTdCell(11, 0, 10), '1筋一段')
  assert.equal(formatTdCell(11, 3, 4), '7筋四段')
  assert.equal(formatTdCell(13, 8, 0), '13筋九段')
})

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
    assert.equal(map.hasRouteGeometry, true, map.code)
    for (const enemy of detail.enemies) {
      const assigned = map.enemyRoutes?.filter(entry => entry.enemyId === enemy.id)
      assert.ok(assigned?.length, map.code)
      for (const { routeIndex } of assigned) {
        assert.notEqual(routeIndex, null, map.code)
        const route = detail.routes?.[routeIndex!]
        assert.ok(route?.startPosition && route.endPosition && Array.isArray(route.checkpoints), map.code)
      }
    }
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

test('a newer start-only snapshot falls back to the complete packaged TD event', async (t) => {
  const bytes = await readFile(new URL('../public/data/maps/td-event.json', import.meta.url), 'utf8')
  const bundled = JSON.parse(bytes)
  const version = new Date(Date.parse(bundled.index.generatedAt) + 1000).toISOString()
  const legacy = { ...bundled.index, generatedAt: version,
    maps: bundled.index.maps.map(({ hasRouteGeometry: _omitted, ...map }: { hasRouteGeometry: true }) => map) }
  t.mock.method(gameDataClient, 'getSource', async () => ({ mode: 'local', version, revision: bundled.source.revision }))
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/data/maps/td-event.json') return new Response(bytes)
    assert.equal(url, '/data/maps/index.json')
    return Response.json(legacy)
  })
  // Each page selects and caches its source on first load.
  const page = await import(new URL('../src/lib/tdMaps.ts?legacy-source', import.meta.url).href)
  const index = await page.loadTdMapDatabase()
  assert.equal(index.generatedAt, bundled.index.generatedAt)
  const detail = await page.loadTdMapDetail(index.maps[0])
  assert.ok(detail.routes[0].endPosition)
})
