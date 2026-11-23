import assert from 'node:assert/strict'
import test from 'node:test'
import { describeTdRoute, getTdEnemyRoutes, type TdEnemyRoute } from '../src/lib/tdEnemyRoutes.ts'
import type { MapEnemyRoute, MapRouteCheckpoint } from '../src/types/map.ts'

const start = { row: 1, col: 0 }
const first = { row: 1, col: 2 }
const second = { row: 3, col: 5 }
const end = { row: 3, col: 8 }

function selection(checkpoints: MapRouteCheckpoint[], endPosition = end): TdEnemyRoute {
  return { index: 0, entrance: 'A', route: { startPosition: start, checkpoints, endPosition } }
}

test('enemy route options use distinct original indices and require recorded geometry', () => {
  const spawn = (enemyId: string, routeIndex: number, spawnKind: MapEnemyRoute['spawnKind'] = 'fixed'): MapEnemyRoute =>
    ({ enemyId, routeIndex, spawnKind, fixedWaits: [], entrance: 'A' })
  const map = { enemyRoutes: [spawn('one', 1), spawn('two', 3), spawn('one', 0), spawn('one', 1, 'conditional'), spawn('one', 2)] }
  const { route } = selection([])
  const detail = { routes: [route, route, { startPosition: start }, route] }
  assert.deepEqual(getTdEnemyRoutes(map, detail, 'one').map(option => option.index), [0, 1])
  assert.deepEqual(getTdEnemyRoutes(map, detail, 'two').map(option => option.index), [3])
})

test('disappearance interrupts the visible path through the following wait and reappearance', () => {
  const geometry = describeTdRoute(selection([
    { type: 'MOVE', position: first, time: null },
    { type: 'DISAPPEAR', position: null, time: null },
    { type: 'WAIT_FOR_SECONDS', position: null, time: 3 },
    { type: 'APPEAR_AT_POS', position: second, time: null },
  ]))
  assert.deepEqual(geometry.links, [{ from: start, to: first }, { from: second, to: end }])
  assert.deepEqual(geometry.notes, ['地点1で消失', '消失中 3秒待機', '地点2で再出現'])
})

test('routes with no move checkpoints display endpoints without predicting a path', () => {
  for (const checkpoints of [[], [{ type: 'WAIT_FOR_SECONDS', time: 4, position: null }]]) {
    const geometry = describeTdRoute(selection(checkpoints))
    assert.deepEqual(geometry.links, [])
    assert.deepEqual(geometry.markers.map(m => m.position), [start, end])
    assert.ok(geometry.notes.includes('経由地点の記載なし'))
  }
})

test('a return trip retains both directions, the wait and the shared start/endpoint', () => {
  const geometry = describeTdRoute(selection([
    { type: 'MOVE', position: first, time: null },
    { type: 'WAIT_FOR_SECONDS', position: null, time: 10 },
  ], start))
  assert.deepEqual(geometry.links, [{ from: start, to: first }, { from: first, to: start }])
  assert.deepEqual(geometry.markers[0].labels, ['A', '終'])
  assert.deepEqual(geometry.notes, ['地点1 10秒待機', '出現口Aに戻る'])
})
