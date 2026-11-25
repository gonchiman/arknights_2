import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { canDeployAt, canPlaceTdOperatorAt, placeTdOperator, type TdPlacedOperator } from '../src/lib/tdDeployment.ts'
import type { MapDetail } from '../src/types/map.ts'

const event = JSON.parse(await readFile(new URL('../public/data/maps/td-event.json', import.meta.url), 'utf8'))
const detail: MapDetail = event.details.maps[event.index.maps.find((map: { code: string }) => map.code === 'TD-8').levelId]
const melee = { id: 'char_208_melan', name: 'メランサ', position: 'MELEE' } as const
const ranged = { id: 'char_124_kroos', name: 'クルース', position: 'RANGED' } as const

test('deployment reads the tile buildability at the displayed row and column', () => {
  assert.equal(detail.tiles[detail.grid[1][8]].tileKey, 'tile_fence_bound')
  assert.ok(canDeployAt(detail, melee, 1, 8))
  assert.ok(!canDeployAt(detail, ranged, 1, 8))
  assert.ok(canDeployAt(detail, ranged, 1, 9))
  assert.ok(!canDeployAt(detail, melee, 1, 9))
  const both = { ...melee, position: 'ALL' } as const
  assert.ok(canDeployAt(detail, both, 1, 8) && canDeployAt(detail, both, 1, 9))
  assert.ok(!canDeployAt(detail, both, 0, 0))
  assert.ok(!canDeployAt(detail, both, detail.grid.length, 0))
})

test('moving and turning preserve other allies and cannot overwrite an occupied tile', () => {
  const guard: TdPlacedOperator = { operator: melee, row: 1, col: 8, direction: 'right' }
  const sniper: TdPlacedOperator = { operator: ranged, row: 1, col: 9, direction: 'left' }
  const initial = placeTdOperator(detail, [guard], sniper)
  assert.equal(initial.length, 2)
  const moved = { ...guard, row: 2, col: 3, direction: 'up' } as const
  assert.deepEqual(placeTdOperator(detail, initial, moved), [moved, sniper])
  assert.deepEqual(initial, [guard, sniper])
  assert.equal(placeTdOperator(detail, initial, { ...guard, row: 0, col: 0 }), initial)
  const other = { ...melee, id: 'other-guard' }
  assert.equal(placeTdOperator(detail, initial, { ...guard, operator: other }), initial)
})

test('a placement destination must be compatible and empty even for the selected operator', () => {
  const guard: TdPlacedOperator = { operator: melee, row: 1, col: 8, direction: 'left' }
  assert.equal(canPlaceTdOperatorAt(detail, [guard], melee, 1, 8), false)
  assert.equal(canPlaceTdOperatorAt(detail, [guard], { ...melee, id: 'another' }, 1, 8), false)
  assert.equal(canPlaceTdOperatorAt(detail, [guard], melee, 1, 9), false)
  assert.equal(canPlaceTdOperatorAt(detail, [guard], ranged, 1, 9), true)
  assert.equal(canPlaceTdOperatorAt(detail, [guard], melee, 2, 3), true)
})
