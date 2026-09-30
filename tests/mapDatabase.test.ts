import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getMapCategory, getMapEnvironment, getMapDetail, loadMapDatabase, loadMapDetail, matchesMapFilters, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { getMapSpecifiedSpawnCount } from '../src/lib/mapWaves.ts'
import type { MapDetailShard, MapFilters, MapIndex, MapSummary, MapWave, MapWaveAction } from '../src/types/map.ts'

const summary: MapSummary = {
  levelId: 'obt/main/level_main_01-07', stageId: 'main_01-07', code: '1-7', name: '暴君', zoneId: 'main_1',
  zoneName: '第一章 暗黒時代・下', zoneType: 'MAINLINE', status: 'supported', spawnCount: 3, enemyIds: ['enemy_a'], reasons: [], detailFile: 'details-0.json',
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
    matchesMapFilters(summary, index.enemies, { query, zoneId, status, category: 'all', environment: 'all' })
  assert.equal(matches('１－７ 術師'), true)
  assert.equal(matches('第一章　暴君'), true)
  assert.equal(matches('MAIN_01-07'), true)
  assert.equal(matches('暴君 猟犬'), false)
  assert.equal(matches('暴君', 'main_2'), false)
  assert.equal(matches('暴君', 'main_1', 'missing'), false)
  assert.equal(matches('暴君', 'main_1', 'supported'), true)
})

test('content and environment filters combine with search, zone and data status', () => {
  const filters: MapFilters = { query: '暴君', category: 'main', environment: 'NORMAL', zoneId: 'main_1', status: 'supported' }
  const map = { ...summary, diffGroup: 'NORMAL' }
  assert.equal(matchesMapFilters(map, index.enemies, filters), true)
  for (const patch of [
    { category: 'event' }, { environment: 'TOUGH' }, { zoneId: 'main_2' },
    { status: 'missing' }, { query: '猟犬' },
  ] as Partial<MapFilters>[]) {
    assert.equal(matchesMapFilters(map, index.enemies, { ...filters, ...patch }), false)
  }
  assert.equal(matchesMapFilters(summary, index.enemies, { ...filters, environment: 'none' }), true)
  assert.equal(matchesMapFilters(map, index.enemies, { ...filters, environment: 'none' }), false)
})

test('content classification uses source type, and unknown content remains accessible', () => {
  for (const [zoneType, category] of [
    ['MAINLINE', 'main'], ['ACTIVITY', 'event'], ['MAINLINE_ACTIVITY', 'main'], ['WEEKLY', 'supply'],
    ['CAMPAIGN', 'other'], ['CLIMB_TOWER', 'other'], ['GUIDE', 'other'], ['FUTURE_TYPE', 'other'],
  ]) assert.equal(getMapCategory({ ...summary, zoneType }), category)
  assert.equal(getMapCategory({ ...summary, zoneType: undefined }), 'other')
  assert.equal(getMapCategory({ ...summary, zoneId: 'main_1', zoneType: 'ACTIVITY' }), 'event')
  for (const diffGroup of ['EASY', 'NORMAL', 'TOUGH', 'ALL']) {
    assert.equal(getMapEnvironment({ ...summary, diffGroup }), diffGroup)
  }
  assert.equal(getMapEnvironment({ ...summary, diffGroup: 'NONE' }), 'none')
  assert.equal(getMapEnvironment(summary), 'none')
  assert.equal(getMapEnvironment({ ...summary, diffGroup: 'FUTURE' }), 'other')
  assert.equal(parseMapIndex({ ...index, maps: [{ ...summary, zoneType: undefined }] }).maps[0].zoneType, 'UNKNOWN')
  assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, zoneType: 42 }] }))
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
  assert.deepEqual(['main', 'event', 'supply', 'other'].map((category) => generated.maps.filter((map) => getMapCategory(map) === category).length), [584, 1416, 35, 263])
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
      assert.notEqual(getMapDetail(detailFile, map).waves, undefined)
      assert.notEqual(getMapDetail(detailFile, map).routes, undefined)
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
  assert.ok(Array.isArray(detail.waves))
  assert.equal(getMapSpecifiedSpawnCount(detail.waves.flatMap((wave) => wave.fragments.flatMap((fragment) => fragment.actions))), 41)
  assert.equal(generated.maps.find((map) => map.stageId === 'main_10-04')!.code, '10-5')
  const nineFive = generated.maps.find((map) => map.stageId === 'main_09-04')!
  assert.equal(nineFive.code, '9-5')
  const nineFiveDetail = getMapDetail(shards.get(nineFive.detailFile!)!, nineFive)
  assert.equal(nineFiveDetail.grid.length, 8)
  assert.equal(nineFiveDetail.grid[0].length, 11)
  assert.equal(nineFiveDetail.routes?.length, 22)
  assert.deepEqual(nineFiveDetail.routes?.map((route) => route?.startPosition), [
    ...Array.from({ length: 4 }, () => ({ row: 6, col: 10 })),
    ...Array.from({ length: 3 }, () => ({ row: 2, col: 0 })),
    { row: 0, col: 0 }, ...Array.from({ length: 2 }, () => ({ row: 2, col: 0 })),
    ...Array.from({ length: 4 }, () => ({ row: 6, col: 10 })),
    ...Array.from({ length: 4 }, () => ({ row: 2, col: 0 })),
    ...Array.from({ length: 4 }, () => ({ row: 6, col: 10 })),
  ])
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

const waveAction: MapWaveAction = {
  actionType: 'SPAWN', key: 'enemy_a', count: 3, preDelay: 0.1, interval: 0.2, routeIndex: 0,
  hiddenGroup: 'ambush', randomSpawnGroupKey: 'random-group', randomSpawnGroupPackKey: 'pack',
  randomType: 'ALWAYS', refreshType: 'ALWAYS', managedByScheduler: true, blockFragment: false,
  dontBlockWave: true, spawnKind: 'conditional', reasons: ['conditional-spawn'],
}
const wave: MapWave = {
  preDelay: 1, postDelay: 2, maxTimeWaitingForNextWave: -1, advancedWaveTag: 'next',
  fragments: [{ preDelay: 3, actions: [waveAction, {
    ...waveAction, actionType: 'DISPLAY_ENEMY_INFO', count: 3, spawnKind: null, reasons: [],
  }] }],
}
const parseWaves = (waves: unknown) => parseMapDetailShard({
  ...shard, maps: { [summary.levelId]: { ...shard.maps[summary.levelId], waves } },
}).maps[summary.levelId].waves

test('wave parsing distinguishes legacy details, unavailable topology, and known empty schedules', () => {
  const legacy = parseMapDetailShard(shard).maps[summary.levelId]
  assert.equal(legacy.waves, undefined)
  assert.equal(Object.hasOwn(legacy, 'waves'), false)
  assert.equal(parseWaves(null), null)
  assert.deepEqual(parseWaves([]), [])
})

test('wave parsing preserves local timing, raw action order, and conditional or non-SPAWN metadata', () => {
  const parsed = parseWaves([wave])!
  assert.deepEqual(parsed, [wave])
  assert.notEqual(parsed[0], wave)
  assert.notEqual(parsed[0].fragments, wave.fragments)
  assert.notEqual(parsed[0].fragments[0].actions, wave.fragments[0].actions)
  assert.notEqual(parsed[0].fragments[0].actions[0].reasons, waveAction.reasons)
  assert.deepEqual(parsed[0].fragments[0].actions.map((action) => action.actionType), ['SPAWN', 'DISPLAY_ENEMY_INFO'])
  assert.equal(parsed[0].maxTimeWaitingForNextWave, -1)
  const unknowns: MapWave = {
    preDelay: null, postDelay: null, maxTimeWaitingForNextWave: null, advancedWaveTag: null,
    fragments: [{ preDelay: null, actions: [{
      actionType: 'SPAWN', key: null, count: null, preDelay: null, interval: null, routeIndex: null,
      hiddenGroup: null, randomSpawnGroupKey: null, randomSpawnGroupPackKey: null,
      randomType: null, refreshType: null, managedByScheduler: null, blockFragment: null,
      dontBlockWave: null, spawnKind: 'unknown', reasons: ['invalid-spawn-count'],
    }] }],
  }
  assert.deepEqual(parseWaves([unknowns]), [unknowns])
})

test('malformed wave topology and invalid local timing are rejected instead of dropped', () => {
  for (const waves of [
    {}, 'waves', 1, [null], [{}], [{ ...wave, fragments: null }], [{ ...wave, fragments: {} }],
    [{ ...wave, fragments: [null] }], [{ ...wave, fragments: [{ preDelay: 0, actions: {} }] }],
    [{ ...wave, fragments: [{ preDelay: 0, actions: [null] }] }],
    [{ ...wave, preDelay: -1 }], [{ ...wave, preDelay: NaN }], [{ ...wave, postDelay: Infinity }],
    [{ ...wave, maxTimeWaitingForNextWave: -2 }], [{ ...wave, maxTimeWaitingForNextWave: Infinity }],
    [{ ...wave, advancedWaveTag: 42 }], [{ ...wave, fragments: [{ preDelay: -1, actions: [] }] }],
  ]) assert.throws(() => parseWaves(waves))
  assert.deepEqual(parseWaves([{ ...wave, maxTimeWaitingForNextWave: 0.5, fragments: [] }]), [
    { ...wave, maxTimeWaitingForNextWave: 0.5, fragments: [] },
  ])
})

test('wave action validation requires safe integer counts and preserves unknown values only as null', () => {
  for (const patch of [
    { actionType: null }, { key: 0 }, { count: -1 }, { count: 1.5 }, { count: Number.MAX_SAFE_INTEGER + 1 },
    { count: undefined }, { preDelay: undefined }, { preDelay: -0.5 }, { preDelay: NaN },
    { interval: Infinity }, { interval: -1 }, { routeIndex: -1 }, { routeIndex: 1.5 },
    { hiddenGroup: 1 }, { randomSpawnGroupKey: [] }, { randomSpawnGroupPackKey: false },
    { randomType: 0 }, { refreshType: [] }, { managedByScheduler: 0 }, { blockFragment: 'false' },
    { dontBlockWave: undefined }, { spawnKind: 'future' }, { spawnKind: ['fixed'] }, { spawnKind: null },
    { actionType: 'DISPLAY_ENEMY_INFO', spawnKind: 'fixed' }, { reasons: null }, { reasons: [1] },
  ]) {
    assert.throws(() => parseWaves([{ ...wave, fragments: [{ preDelay: 0, actions: [{ ...waveAction, ...patch }] }] }]))
  }
})

const parseRoutes = (routes: unknown) => parseMapDetailShard({
  ...shard, maps: { [summary.levelId]: { ...shard.maps[summary.levelId], routes } },
}).maps[summary.levelId].routes

test('route parsing preserves legacy omission, unknown entries, indices and signed tile coordinates', () => {
  const legacy = parseMapDetailShard(shard).maps[summary.levelId]
  assert.equal(legacy.routes, undefined)
  assert.equal(Object.hasOwn(legacy, 'routes'), false)
  assert.equal(parseRoutes(null), null)
  assert.deepEqual(parseRoutes([]), [])
  const routes = [
    { startPosition: { row: 0, col: 0 } }, null, { startPosition: null },
    { startPosition: { row: -1, col: 10 } },
    { startPosition: { row: Number.MAX_SAFE_INTEGER, col: Number.MIN_SAFE_INTEGER } },
  ]
  const parsed = parseRoutes(routes)!
  assert.deepEqual(parsed, routes)
  assert.notEqual(parsed, routes)
  assert.notEqual(parsed[0], routes[0])
  assert.notEqual(parsed[0]?.startPosition, routes[0]?.startPosition)
  assert.equal(parsed[1], null)
  assert.deepEqual(parsed[3]?.startPosition, { row: -1, col: 10 })
})

test('route parsing rejects malformed topology and coordinates rather than shifting route references', () => {
  for (const routes of [{}, 1, 'routes', [undefined], [false], [1], [[]], [{}]]) {
    assert.throws(() => parseRoutes(routes))
  }
  for (const startPosition of [
    undefined, {}, [], { row: 0 }, { row: 0, col: undefined }, { row: '0', col: 0 },
    { row: 0, col: false }, { row: 0.5, col: 0 }, { row: 0, col: -0.5 },
    { row: NaN, col: 0 }, { row: 0, col: Infinity },
    { row: Number.MAX_SAFE_INTEGER + 1, col: 0 }, { row: 0, col: Number.MIN_SAFE_INTEGER - 1 },
  ]) assert.throws(() => parseRoutes([null, { startPosition }]))
})
