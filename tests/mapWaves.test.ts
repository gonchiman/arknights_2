import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getMapEntrances, getMapSpawnFlow, getMapSpawnRows, getMapSpawnTimes, getMapSpecifiedSpawnCount } from '../src/lib/mapWaves.ts'
import type { MapDetail, MapWaveAction, MapWaveFragment } from '../src/types/map.ts'

const action = (patch: Partial<MapWaveAction> = {}): MapWaveAction => ({
  actionType: 'SPAWN', key: 'enemy_a', count: 3, preDelay: 2, interval: 0.5, routeIndex: 0,
  hiddenGroup: null, randomSpawnGroupKey: null, randomSpawnGroupPackKey: null,
  randomType: null, refreshType: null, managedByScheduler: false, blockFragment: false,
  dontBlockWave: false, spawnKind: 'fixed', reasons: [], ...patch,
})

test('spawn rows preserve source identities while sorting known local delays before unknown delays', () => {
  const fragment: MapWaveFragment = { preDelay: 100, actions: [
    action({ preDelay: 5 }),
    action({ actionType: 'DISPLAY_ENEMY_INFO', preDelay: 0, spawnKind: null }),
    action({ preDelay: null }),
    action({ preDelay: 1, hiddenGroup: 'ambush', spawnKind: 'conditional', reasons: ['conditional-spawn'] }),
    action({ preDelay: 1 }),
    action({ preDelay: null }),
    action({ preDelay: 0 }),
  ] }
  const original = [...fragment.actions]
  const rows = getMapSpawnRows(fragment)
  assert.deepEqual(rows.map((row) => row.actionIndex), [6, 3, 4, 0, 2, 5])
  for (const row of rows) assert.equal(row.action, original[row.actionIndex])
  assert.deepEqual(fragment.actions, original)
  assert.equal(rows[1].action.spawnKind, 'conditional')
})

test('configured totals include conditional SPAWN counts and exclude non-SPAWN event counts', () => {
  const actions = [action({ count: 2 }), action({ count: 4, spawnKind: 'conditional', hiddenGroup: 'ambush' }),
    action({ actionType: 'DISPLAY_ENEMY_INFO', count: 30, spawnKind: null }),
    action({ actionType: 'ACTIVATE_PREDEFINED', count: null, spawnKind: null })]
  assert.equal(getMapSpecifiedSpawnCount(actions), 6)
  assert.equal(getMapSpecifiedSpawnCount([]), 0)
  assert.equal(getMapSpecifiedSpawnCount([action({ count: 0 })]), 0)
  for (const count of [null, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(getMapSpecifiedSpawnCount([action({ count })]), null)
  }
  assert.equal(getMapSpecifiedSpawnCount([action({ count: Number.MAX_SAFE_INTEGER }), action({ count: 1 })]), null)
})

test('spawn previews use local action time, clean float tails, and preserve conditional candidate times', () => {
  assert.deepEqual(getMapSpawnTimes(action({ preDelay: 0.1, interval: 0.1, count: 4 })), {
    times: [0.1, 0.2, 0.3, 0.4], remaining: 0,
  })
  assert.deepEqual(getMapSpawnTimes(action({ preDelay: 1.33, interval: 0.14, count: 4 }), 3), {
    times: [1.33, 1.47, 1.61], remaining: 1,
  })
  assert.deepEqual(getMapSpawnTimes(action({ preDelay: 2, interval: 0, count: 3, spawnKind: 'conditional' })), {
    times: [2, 2, 2], remaining: 0,
  })
  assert.deepEqual(getMapSpawnTimes(action({ count: 1, interval: null })), { times: [2], remaining: 0 })
  assert.deepEqual(getMapSpawnTimes(action({ count: 0, interval: null })), { times: [], remaining: 0 })
  assert.deepEqual(getMapSpawnTimes(action(), 0), { times: [], remaining: 3 })
})

test('unknown or unsafe timing and count values cannot become a fabricated schedule', () => {
  for (const patch of [
    { actionType: 'DISPLAY_ENEMY_INFO', spawnKind: null },
    { count: null }, { count: -1 }, { count: 1.5 }, { count: Infinity }, { count: NaN },
    { count: Number.MAX_SAFE_INTEGER + 1 },
    { preDelay: null }, { preDelay: -1 }, { preDelay: Infinity }, { preDelay: NaN },
    { interval: null }, { interval: -0.5 }, { interval: Infinity }, { interval: NaN },
    { preDelay: Number.MAX_VALUE, interval: Number.MAX_VALUE },
  ] as Partial<MapWaveAction>[]) assert.equal(getMapSpawnTimes(action(patch)), null)
  for (const limit of [-1, 0.5, Infinity, NaN]) assert.equal(getMapSpawnTimes(action(), limit), null)
})

test('large counts and caller limits have bounded previews and accurate remaining counts', () => {
  const result = getMapSpawnTimes(action({ count: Number.MAX_SAFE_INTEGER, preDelay: 0, interval: 1 }))!
  assert.deepEqual(result.times, Array.from({ length: 12 }, (_, i) => i))
  assert.equal(result.remaining, Number.MAX_SAFE_INTEGER - 12)
  const bounded = getMapSpawnTimes(action({ count: 1_000_000, preDelay: 0, interval: 1 }), 1_000_000)!
  assert.equal(bounded.times.length, 1000)
  assert.equal(bounded.remaining, 999_000)
})

const fragment = (...actions: MapWaveAction[]): MapWaveFragment => ({ preDelay: 100, actions })
const detail = (...fragments: MapWaveFragment[]): MapDetail => ({
  levelId: 'fixture', grid: [[1, 0, 0], [0, 0, 0], [0, 0, 1]],
  tiles: ['tile_road', 'tile_start'].map((tileKey) => ({ tileKey, heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' })),
  life: 3, initialCost: 10, deployLimit: 8, enemies: [],
  routes: [{ startPosition: { row: 2, col: 0 } }, { startPosition: { row: 0, col: 2 } }, { startPosition: { row: 2, col: 0 } }],
  waves: [{ preDelay: 200, postDelay: 0, maxTimeWaitingForNextWave: -1, advancedWaveTag: null, fragments }],
})

test('entrance labels cover source tile kinds and referenced in-bounds routes in map reading order', () => {
  const current = fragment(...[0, 1, 2, 3, 4, 5].map((routeIndex) => action({ routeIndex })),
    action({ actionType: 'DISPLAY_ENEMY_INFO', routeIndex: 6 }))
  const map = detail(current)
  map.tiles = ['tile_road', 'tile_start', 'tile_flystart', 'tile_ftstart', 'tile_mpprts_enemy_born']
    .map((tileKey) => ({ tileKey, heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' }))
  map.grid = [[1, 0, 2], [0, 0, 0], [3, 0, 4]]
  map.routes = [
    { startPosition: { row: 1, col: 1 } }, { startPosition: { row: 2, col: 0 } },
    { startPosition: { row: 3, col: 0 } }, { startPosition: { row: 0, col: 3 } },
    null, { startPosition: null }, { startPosition: { row: 1, col: 0 } },
    { startPosition: { row: 1, col: 2 } },
  ]
  assert.deepEqual(getMapEntrances(map), [
    { id: '2:0', label: 'A', row: 2, col: 0 },
    { id: '2:2', label: 'B', row: 2, col: 2 },
    { id: '1:1', label: 'C', row: 1, col: 1 },
    { id: '0:0', label: 'D', row: 0, col: 0 },
    { id: '0:2', label: 'E', row: 0, col: 2 },
  ])
  const many = detail()
  many.grid = [Array.from({ length: 28 }, () => 1)]
  assert.deepEqual(getMapEntrances(many).slice(25).map((entrance) => entrance.label), ['Z', 'AA', 'AB'])
})

test('entrance labels remain stable across waves and fragments, including route-only starts', () => {
  const first = fragment(action({ routeIndex: 1, count: 1 }))
  const second = fragment(action({ routeIndex: 3, count: 1 }))
  const map = detail(first)
  map.routes!.push({ startPosition: { row: 1, col: 1 } })
  map.waves!.push({ preDelay: 0, postDelay: 0, maxTimeWaitingForNextWave: -1, advancedWaveTag: null, fragments: [second] })
  assert.equal(getMapSpawnFlow(map, first).rows[0].entrance?.label, 'C')
  assert.equal(getMapSpawnFlow(map, second).rows[0].entrance?.label, 'B')
  assert.deepEqual(getMapEntrances(map).map(({ row, col }) => [map.grid.length - 1 - row, col]), [[0, 0], [1, 1], [2, 2]])
})

test('expanded times are local and fixed repeats merge by entrance even when route indices differ', () => {
  const current = fragment(
    action({ count: 2, preDelay: 0.1, interval: 0.2, routeIndex: 0 }),
    action({ count: 1, preDelay: 0.3, routeIndex: 2 }),
    action({ count: 1, preDelay: 0.3, routeIndex: 1 }),
  )
  const original = structuredClone(current)
  const flow = getMapSpawnFlow(detail(current), current)
  assert.deepEqual(flow.rows.map(({ time, entrance, count }) => [time, entrance?.label, count]), [
    [0.1, 'A', 1], [0.3, 'A', 2], [0.3, 'B', 1],
  ])
  assert.deepEqual(flow.rows[1].enemies, [{ key: 'enemy_a', count: 2 }])
  assert.deepEqual(flow.rows[1].actionIndices, [0, 1])
  assert.equal(flow.rows[1].actions[0], current.actions[0])
  assert.equal(flow.rows[1].actions[1], current.actions[1])
  assert.equal(flow.omittedCount, 0)
  assert.equal(flow.unknownCount, 0)
  assert.deepEqual(current, original)
})

test('different enemies at the same time and entrance share a row with a count breakdown', () => {
  const current = fragment(action({ count: 1 }), action({ key: 'enemy_b', count: 1, routeIndex: 2 }))
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.rows.length, 1)
  assert.equal(flow.rows[0].count, 2)
  assert.deepEqual(flow.rows[0].enemies, [{ key: 'enemy_a', count: 1 }, { key: 'enemy_b', count: 1 }])
})

test('conditional and unknown candidates keep separate action identities at matching times and entrances', () => {
  const current = fragment(
    action({ count: 1 }),
    action({ count: 2, interval: 0, spawnKind: 'conditional', randomSpawnGroupKey: 'one-choice' }),
    action({ key: 'enemy_b', count: 1, spawnKind: 'conditional', randomSpawnGroupKey: 'one-choice' }),
    action({ count: 1, spawnKind: 'unknown' }),
    action({ count: 1, routeIndex: 9 }),
    action({ count: 1, routeIndex: 9 }),
    action({ count: 1, routeIndex: null }),
  )
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.rows.length, 7)
  assert.equal(new Set(flow.rows.map((row) => row.id)).size, 7)
  assert.deepEqual(flow.rows.map((row) => row.actionIndices), [[0], [1], [2], [3], [4], [5], [6]])
  assert.equal(flow.rows[1].count, 2)
  assert.equal(flow.rows[4].entrance, null)
  assert.equal(flow.unknownCount, 0)
})

test('unknown required timings or counts produce separate fallback rows and count source actions', () => {
  const current = fragment(
    action({ count: 4, preDelay: null }),
    action({ count: 5, interval: null }),
    action({ count: null }),
    action({ count: 1, interval: null }),
    action({ actionType: 'DISPLAY_ENEMY_INFO', count: null, spawnKind: null }),
  )
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.unknownCount, 3)
  assert.equal(flow.omittedCount, 0)
  assert.deepEqual(flow.rows.map(({ time, count }) => [time, count]), [[2, 1], [null, 4], [null, 5], [null, null]])
  assert.deepEqual(flow.rows.slice(1).map((row) => row.actionIndices), [[0], [1], [2]])
  assert.equal(flow.rows[1].actions[0], current.actions[0])
  for (const patch of [
    { count: -1 }, { count: 1.5 }, { count: Infinity }, { count: NaN }, { count: Number.MAX_SAFE_INTEGER + 1 },
    { preDelay: -1 }, { preDelay: Infinity }, { preDelay: NaN },
    { interval: -1 }, { interval: Infinity }, { interval: NaN },
    { preDelay: Number.MAX_VALUE, interval: Number.MAX_VALUE },
  ]) {
    const invalid = fragment(action(patch))
    const result = getMapSpawnFlow(detail(invalid), invalid)
    assert.equal(result.unknownCount, 1)
    assert.equal(result.rows[0].time, null)
  }
})

test('zero-count actions emit nothing and huge simultaneous counts are aggregated without expansion', () => {
  const zero = fragment(action({ count: 0, preDelay: null, interval: null, routeIndex: null }))
  assert.deepEqual(getMapSpawnFlow(detail(zero), zero), { rows: [], omittedCount: 0, unknownCount: 0 })
  const huge = fragment(action({ count: Number.MAX_SAFE_INTEGER, interval: 0 }))
  const flow = getMapSpawnFlow(detail(huge), huge)
  assert.equal(flow.rows.length, 1)
  assert.equal(flow.rows[0].count, Number.MAX_SAFE_INTEGER)
  assert.equal(flow.omittedCount, 0)
  const overflow = fragment(...huge.actions, action({ count: 1 }))
  const overflowingRow = getMapSpawnFlow(detail(overflow), overflow).rows[0]
  assert.equal(overflowingRow.count, null)
  assert.equal(overflowingRow.enemies[0].count, null)
  assert.deepEqual(overflowingRow.actionIndices, [0, 1])
})

test('expansion limit retains earliest events globally and reports omitted enemies exactly', () => {
  const current = fragment(
    action({ count: Number.MAX_SAFE_INTEGER, preDelay: 0, interval: 1 }),
    action({ key: 'enemy_b', count: 2, preDelay: 0.5, interval: 0.1, routeIndex: 1 }),
  )
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.rows.length, 10_000)
  assert.deepEqual(flow.rows.slice(0, 4).map(({ time, enemies }) => [time, enemies[0].key]), [
    [0, 'enemy_a'], [0.5, 'enemy_b'], [0.6, 'enemy_b'], [1, 'enemy_a'],
  ])
  assert.equal(flow.rows.at(-1)?.time, 9997)
  assert.equal(flow.omittedCount, Number.MAX_SAFE_INTEGER - 9998)
  assert.equal(flow.unknownCount, 0)
  const overflow = fragment(
    action({ count: Number.MAX_SAFE_INTEGER, preDelay: 0, interval: 1 }),
    action({ count: Number.MAX_SAFE_INTEGER, preDelay: 0, interval: 1 }),
  )
  const overflowFlow = getMapSpawnFlow(detail(overflow), overflow)
  assert.equal(overflowFlow.omittedCount, (2n * BigInt(Number.MAX_SAFE_INTEGER) - 10_000n).toString())
  assert.equal(overflowFlow.rows.length, 5000)
  assert.ok(overflowFlow.rows.every((row) => row.count === 2))
})

test('singletons and simultaneous batches obey the chronological cap and cannot create a partial future row', () => {
  for (const count of [1, 4]) {
    const current = fragment(
      action({ count: 10_001, preDelay: 0, interval: 1 }),
      action({ key: 'enemy_b', count, preDelay: 10_000, interval: 0 }),
    )
    const flow = getMapSpawnFlow(detail(current), current)
    assert.equal(flow.rows.length, 10_000)
    assert.equal(flow.rows.at(-1)?.time, 9999)
    assert.equal(flow.omittedCount, count + 1)
    assert.ok(flow.rows.every((row) => row.enemies.length === 1 && row.enemies[0].key === 'enemy_a'))
  }
})

test('an incomplete final time is omitted across entrances and candidate actions', () => {
  const current = fragment(
    action({ count: 10_000, preDelay: 0, interval: 1 }),
    action({ key: 'enemy_b', count: 1, preDelay: 9998, interval: null, routeIndex: 1, spawnKind: 'conditional' }),
    action({ count: 1, preDelay: 9998, interval: null, spawnKind: 'unknown' }),
  )
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.rows.length, 9998)
  assert.equal(flow.rows.at(-1)?.time, 9997)
  assert.equal(flow.omittedCount, 4)
  assert.ok(flow.rows.every((row) => row.count === 1))
})

test('discarding an incomplete time preserves exact omitted counts even when its displayed total overflowed', () => {
  const current = fragment(
    action({ count: 10_000, preDelay: 0, interval: 1 }),
    action({ count: Number.MAX_SAFE_INTEGER, preDelay: 9998, interval: 0 }),
    action({ count: 1, preDelay: 9998, interval: null }),
  )
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.rows.length, 9998)
  assert.equal(flow.rows.at(-1)?.time, 9997)
  assert.equal(flow.omittedCount, (BigInt(Number.MAX_SAFE_INTEGER) + 3n).toString())
})

test('many rounded times in one bucket remain bounded while unknown-time fallbacks are retained', () => {
  const current = fragment(
    action({ count: Number.MAX_SAFE_INTEGER, preDelay: 1e100, interval: 1 }),
    action({ count: 4, preDelay: null }),
  )
  const flow = getMapSpawnFlow(detail(current), current)
  assert.equal(flow.rows.length, 1)
  assert.equal(flow.rows[0].time, null)
  assert.equal(flow.rows[0].count, 4)
  assert.equal(flow.omittedCount, Number.MAX_SAFE_INTEGER)
  assert.equal(flow.unknownCount, 1)
})

test('9-5 keeps the dog and soldier at 28 seconds on their distinct entrances', async () => {
  const shard = JSON.parse(await readFile(new URL('../public/data/maps/details-5.json', import.meta.url), 'utf8'))
  const map: MapDetail = shard.maps['obt/main/level_main_09-04']
  const current = map.waves![0].fragments[0]
  const flow = getMapSpawnFlow(map, current)
  assert.deepEqual(getMapEntrances(map), [
    { id: '6:10', label: 'A', row: 6, col: 10 }, { id: '2:0', label: 'B', row: 2, col: 0 },
  ])
  assert.deepEqual(flow.rows.filter((row) => row.time === 28).map(({ entrance, enemies, count }) => ({ entrance: entrance?.label, enemies, count })), [
    { entrance: 'A', enemies: [{ key: 'enemy_1165_duhond', count: 1 }], count: 1 },
    { entrance: 'B', enemies: [{ key: 'enemy_1166_dusbr', count: 1 }], count: 1 },
  ])
  assert.deepEqual(flow.rows.map((row) => row.time), [3, 14, 19, 20, 27, 28, 28, 35, 36, 41, 47])
  assert.equal(flow.omittedCount, 0)
  assert.equal(flow.unknownCount, 0)
})
