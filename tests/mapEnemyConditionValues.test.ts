import test from 'node:test'
import assert from 'node:assert/strict'
import { getMapEnemyConditionValueText } from '../src/lib/mapEnemyConditionValues.ts'
import type { MapIndex, MapSummary } from '../src/types/map.ts'
import type { MatchingMapEnemyRoute } from '../src/lib/mapEnemyFilters.ts'

const map: MapSummary = {
  levelId: 'test', stageId: 'test', code: '1', name: 'test', zoneId: '', zoneName: '',
  status: 'supported', spawnCount: 4, enemyIds: ['w'], reasons: [], detailFile: 'details-0.json',
  enemySpawnCounts: { w: 4 }, enemyRoutes: [
    { enemyId: 'w', routeIndex: 0, spawnKind: 'fixed', fixedWaits: [15, 35, 20, 40, 20],
      spawnCount: 1, spawnIntervals: [], entrance: 'A' },
    { enemyId: 'w', routeIndex: 1, spawnKind: 'conditional', fixedWaits: [],
      spawnCount: 3, spawnIntervals: [2], entrance: 'B' },
  ],
}
const index: MapIndex = { schemaVersion: 1, generatedAt: '', sourceGeneratedAt: null, maps: [map],
  enemies: { w: { name: 'W', hp: 10000, attack: 470, defense: 100, resistance: 50, weight: -2,
    motion: 'WALK', damageTypes: ['PHYSIC', 'MAGIC'], immunities: { stunImmune: true, silenceImmune: false } } } }
const match: MatchingMapEnemyRoute = { enemyId: 'w', routeIndex: 0, spawnKind: 'fixed', waitTimes: [40] }
const text = (property: Parameters<typeof getMapEnemyConditionValueText>[3], source = map) =>
  getMapEnemyConditionValueText(source, index, match, property)

test('matching single waits do not replace full-route wait totals and counts in the details', () => {
  assert.equal(text('wait'), '40秒')
  assert.equal(text('waitCount'), '5回')
  assert.equal(text('waitTotal'), '130秒')
  assert.equal(text('waitPresence'), 'あり')
})

test('enemy and route configured counts remain distinct and entrance counts cover all routes', () => {
  assert.equal(text('spawnCount'), '4体')
  assert.equal(text('routeSpawnCount'), '1体')
  assert.equal(text('entranceCount'), '2種類')
  assert.equal(text('entrance'), 'A')
  assert.equal(text('spawnInterval'), 'なし')
})

test('unknown values are not formatted as zero, no immunity, or a confirmed entrance count', () => {
  assert.equal(text('attackInterval'), '未確認')
  assert.equal(text('sleepImmune'), '未確認')
  assert.equal(text('spawnCount', { ...map, enemySpawnCounts: { w: null } }), '未確認')
  assert.equal(text('entranceCount', { ...map, enemyRoutes: [map.enemyRoutes![0],
    { ...map.enemyRoutes![1], entrance: null }] }), '未確認')
})

test('classification, immune booleans, signed weight, and mixed damage types remain readable', () => {
  assert.equal(text('motion'), '地上')
  assert.equal(text('stunImmune'), 'あり')
  assert.equal(text('silenceImmune'), 'なし')
  assert.equal(text('weight'), '-2')
  assert.equal(text('damageType'), '物理 ／ 術')
})

test('only intervals that matched the search are listed as the condition value', () => {
  const source = { ...map, enemyRoutes: [{ ...map.enemyRoutes![0], spawnIntervals: [1, 3, 5] }] }
  assert.equal(getMapEnemyConditionValueText(source, index, { ...match, intervalTimes: [3] }, 'spawnInterval'), '3秒')
})
