import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getMapDetail, loadMapDatabase, loadMapDetail, matchesMapFilters, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import type { MapDetailShard, MapIndex, MapSummary } from '../src/types/map.ts'

const summary: MapSummary = {
  levelId: 'obt/main/level_main_01-07', stageId: 'main_01-07', code: '1-7', name: '暴君', zoneId: 'main_1',
  zoneName: '第一章 暗黒時代・下', status: 'supported', spawnCount: 3, enemyIds: ['enemy_a'], reasons: [], detailFile: 'details-0.json',
}
const index: MapIndex = {
  schemaVersion: 1, generatedAt: '2026-09-30T00:00:00Z', sourceGeneratedAt: null,
  maps: [summary], enemies: { enemy_a: { name: '術師', hp: 1000, resistance: 50 } },
}
const shard: MapDetailShard = {
  schemaVersion: 1, generatedAt: index.generatedAt, maps: {
    [summary.levelId]: {
      levelId: summary.levelId, grid: [[1, 0], [0, 1]], tiles: [
        { tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
        { tileKey: 'tile_end', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
      ], life: 3, initialCost: 10, deployLimit: 8, enemies: [{ id: 'enemy_a', count: 3 }],
    },
  },
}

test('search combines normalized stage, chapter, enemy names and all specified filters', () => {
  const matches = (query: string, zoneId = 'all', status: 'all' | 'supported' | 'missing' = 'all') =>
    matchesMapFilters(summary, index.enemies, { query, zoneId, status })
  assert.equal(matches('１－７ 術師'), true)
  assert.equal(matches('第一章　暴君'), true)
  assert.equal(matches('MAIN_01-07'), true)
  assert.equal(matches('暴君 猟犬'), false)
  assert.equal(matches('暴君', 'main_2'), false)
  assert.equal(matches('暴君', 'main_1', 'missing'), false)
  assert.equal(matches('暴君', 'main_1', 'supported'), true)
})

test('malformed and duplicate map summaries or escaping detail paths are rejected', () => {
  for (const badSummary of [
    { ...summary, detailFile: '../private.json' }, { ...summary, detailFile: 'https://other.example/details-0.json' },
    { ...summary, spawnCount: -1 }, { ...summary, status: 'excluded' }, { ...summary, enemyIds: ['unknown'] },
    { ...summary, enemyIds: ['enemy_a', 'enemy_a'] }, { ...summary, reasons: ['conditional-spawn'] },
  ]) assert.throws(() => parseMapIndex({ ...index, maps: [badSummary] }))
  assert.throws(() => parseMapIndex({ ...index, schemaVersion: 2 }))
  assert.throws(() => parseMapIndex({ ...index, maps: [summary, summary] }))
  assert.equal(parseMapIndex(index).maps[0].code, '1-7')
})

test('shard validation prevents ragged rows, invalid palette references, wrong level ids, and unknown counts', () => {
  const detail = shard.maps[summary.levelId]
  for (const invalid of [
    { ...detail, grid: [[0, 1], [1]] }, { ...detail, grid: [[0, 2]] }, { ...detail, grid: [[-1]] },
    { ...detail, levelId: 'another-map' }, { ...detail, enemies: [{ id: 'enemy_a', count: -1 }] },
  ]) assert.throws(() => parseMapDetailShard({ ...shard, maps: { [summary.levelId]: invalid } }))
  const parsed = parseMapDetailShard(shard)
  assert.deepEqual(parsed.maps[summary.levelId].grid, [[1, 0], [0, 1]])
  assert.equal(getMapDetail(parsed, summary).enemies[0].count, 3)
  assert.throws(() => getMapDetail(parsed, { ...summary, spawnCount: 4 }))
  assert.throws(() => getMapDetail(parsed, { ...summary, status: 'excluded', spawnCount: null }))
})

test('bundled map index and every lazy shard agree; missing and conditional maps never show fabricated counts', async () => {
  const source = new URL('../public/data/maps/', import.meta.url)
  const generated = parseMapIndex(JSON.parse(await readFile(new URL('index.json', source), 'utf8')))
  assert.equal(generated.maps.length, 2298)
  assert.equal(generated.maps.filter((map) => map.status === 'supported').length, 1474)
  assert.equal(generated.maps.filter((map) => map.status === 'excluded').length, 524)
  assert.equal(generated.maps.filter((map) => map.status === 'missing').length, 300)
  const shards = new Map(await Promise.all([...new Set(generated.maps.flatMap((map) => map.detailFile ? [map.detailFile] : []))]
    .map(async (file) => [file, parseMapDetailShard(JSON.parse(await readFile(new URL(file, source), 'utf8')))] as const)))
  assert.equal(shards.size, 16)
  for (const map of generated.maps) {
    if (map.detailFile) {
      const detailFile = shards.get(map.detailFile)!
      assert.equal(detailFile.generatedAt, generated.generatedAt)
      getMapDetail(detailFile, map)
    } else {
      assert.equal(map.status, 'missing')
      assert.equal(map.spawnCount, null)
    }
  }
  const oneSeven = generated.maps.find((map) => map.stageId === 'main_01-07')!
  assert.equal(oneSeven.code, '1-7')
  assert.equal(oneSeven.name, '暴君')
  assert.equal(oneSeven.spawnCount, 41)
  const detail = getMapDetail(shards.get(oneSeven.detailFile!)!, oneSeven)
  assert.equal(detail.grid.length, 7)
  assert.equal(detail.grid[0].length, 11)
  assert.equal(detail.enemies.length, 6)
  assert.equal(generated.maps.find((map) => map.stageId === 'main_10-04')!.code, '10-5')
})

test('index and detail failures can retry, concurrent readers share one request, and unknown maps do not fetch', async (context) => {
  let indexCalls = 0
  let detailCalls = 0
  context.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).endsWith('index.json')) {
      indexCalls += 1
      return indexCalls === 1 ? new Response('', { status: 500 }) : Response.json(index)
    }
    assert.match(String(url), /data\/maps\/details-0\.json\?v=/)
    detailCalls += 1
    return detailCalls === 1 ? new Response('', { status: 500 }) : Response.json(shard)
  })
  await assert.rejects(loadMapDatabase())
  const [first, second] = await Promise.all([loadMapDatabase(), loadMapDatabase()])
  assert.equal(first, second)
  assert.equal(indexCalls, 2)
  await assert.rejects(loadMapDetail({ ...summary, status: 'missing', detailFile: null, spawnCount: null }))
  assert.equal(detailCalls, 0)
  await assert.rejects(loadMapDetail(summary))
  const [a, b] = await Promise.all([loadMapDetail(summary), loadMapDetail(summary)])
  assert.equal(a, b)
  assert.equal(detailCalls, 2)
  assert.deepEqual(a.grid, [[1, 0], [0, 1]])
})
