import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMatchingMapEnemyRoutes, hasActiveMapEnemyConditions, isMapEnemyCondition, matchesMapEnemyConditions,
  type MapEnemyCondition,
} from '../src/lib/mapEnemyFilters.ts'
import {
  getMapEnemyConditionField, MAP_ENEMY_CONDITION_FIELDS, MAP_ENEMY_IMMUNITY_FIELDS,
  MAP_ENEMY_NUMERIC_CONDITION_OPERATORS,
} from '../src/lib/mapEnemyConditionFields.ts'
import { ENEMY_NUMERIC_FILTER_FIELDS, ENEMY_NUMERIC_FILTER_OPERATORS } from '../src/lib/enemyNumericFilters.ts'
import type { MapEnemyBase, MapEnemyRoute, MapSummary } from '../src/types/map.ts'

const registry: Record<string, MapEnemyBase> = {
  enemy_a: { name: '術師', hp: 1000, attack: 250, defense: 0, resistance: 50 },
  enemy_b: { name: '兵士', hp: 5000, attack: 300, defense: 100, resistance: 0 },
  enemy_unknown: { name: '不明', hp: null, attack: null, defense: null, resistance: null },
  enemy_zero: { name: 'ゼロ', hp: 0, attack: 0, defense: 0, resistance: 0 },
}
const routes: MapEnemyRoute[] = [
  { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [10, 30], spawnKind: 'fixed' },
  { enemyId: 'enemy_a', routeIndex: 1, fixedWaits: [20], spawnKind: 'fixed' },
  { enemyId: 'enemy_b', routeIndex: 2, fixedWaits: [40], spawnKind: 'conditional' },
]
const summary: MapSummary = {
  levelId: 'obt/main/level_main_01-07', stageId: 'main_01-07', code: '1-7', name: '暴君',
  zoneId: 'main_1', zoneName: '第一章', status: 'supported', spawnCount: 3,
  enemyIds: ['enemy_a', 'enemy_b'], enemyRoutes: routes, reasons: [], detailFile: 'details-0.json',
}
const condition = (
  property: MapEnemyCondition['property'], operator: MapEnemyCondition['operator'], value: number | string | null,
): MapEnemyCondition => ({ id: `${property}-${operator}`, property, operator, value })
const matching = (conditions: readonly MapEnemyCondition[], map = summary) =>
  getMatchingMapEnemyRoutes(map, registry, conditions)

test('empty or blank conditions preserve every spawn record and keep unavailable maps visible', () => {
  const expected = routes.map(({ fixedWaits, ...route }) => ({ ...route, waitTimes: fixedWaits }))
  assert.deepEqual(matching([]), expected)
  assert.deepEqual(matching([condition('wait', 'gte', null), condition('hp', 'lte', null)]), expected)
  assert.equal(matchesMapEnemyConditions(summary, registry, []), true)
  for (const enemyRoutes of [undefined, null, []]) {
    const map = { ...summary, enemyRoutes }
    assert.deepEqual(matching([], map), [])
    assert.equal(matchesMapEnemyConditions(map, registry, []), true)
    assert.equal(matchesMapEnemyConditions(map, registry, [condition('hp', 'gte', null)]), true)
  }
  const result = matching([])
  assert.notEqual(result[0].waitTimes, routes[0].fixedWaits)
  result[0].waitTimes!.push(999)
  assert.deepEqual(routes[0].fixedWaits, [10, 30])
})

test('all conditions must be satisfied by the same enemy on the same route', () => {
  assert.deepEqual(matching([
    condition('wait', 'gte', 30), condition('hp', 'gte', 5000), condition('resistance', 'lte', 0),
  ]), [{ enemyId: 'enemy_b', routeIndex: 2, spawnKind: 'conditional', waitTimes: [40] }])
  assert.deepEqual(matching([condition('hp', 'gte', 5000), condition('resistance', 'gte', 50)]), [])
  assert.deepEqual(matching([condition('wait', 'gte', 30), condition('wait', 'lte', 20)]), [])
  assert.deepEqual(matching([condition('wait', 'gte', 20), condition('wait', 'lte', 20)]), [
    { enemyId: 'enemy_a', routeIndex: 1, spawnKind: 'fixed', waitTimes: [20] },
  ])
})

test('wait bounds apply to individual waits rather than totals or different waits', () => {
  const map: MapSummary = { ...summary, enemyRoutes: [
    { enemyId: 'enemy_a', routeIndex: 7, spawnKind: 'fixed', fixedWaits: [15, 35, 20, 40, 20] },
  ] }
  assert.deepEqual(matching([condition('wait', 'gte', 50)], map), [])
  assert.deepEqual(matching([condition('wait', 'gte', 20), condition('wait', 'lte', 35)], map), [
    { enemyId: 'enemy_a', routeIndex: 7, spawnKind: 'fixed', waitTimes: [35, 20, 20] },
  ])
  assert.deepEqual(matching([condition('wait', 'gte', 40), condition('wait', 'lte', 15)], map), [])
  assert.equal(matchesMapEnemyConditions(map, registry, [condition('wait', 'gte', 40)]), true)
  assert.equal(matchesMapEnemyConditions(map, registry, [condition('wait', 'gte', 40.1)]), false)
})

test('base HP and resistance use inclusive bounds and retain numeric zero', () => {
  const map: MapSummary = { ...summary, enemyRoutes: [
    { enemyId: 'enemy_zero', routeIndex: 0, fixedWaits: [0], spawnKind: 'fixed' },
  ] }
  for (const property of ['hp', 'resistance', 'wait'] as const) {
    assert.equal(matchesMapEnemyConditions(map, registry, [condition(property, 'gte', 0)]), true, property)
    assert.equal(matchesMapEnemyConditions(map, registry, [condition(property, 'lte', 0)]), true, property)
    assert.equal(matchesMapEnemyConditions(map, registry, [condition(property, 'gte', 0.1)]), false, property)
  }
  const bounds = [condition('hp', 'gte', 1000), condition('hp', 'lte', 1000),
    condition('resistance', 'gte', 50), condition('resistance', 'lte', 50)]
  assert.deepEqual(matching(bounds).map(route => route.enemyId), ['enemy_a', 'enemy_a'])
  assert.deepEqual(matching([...bounds, condition('hp', 'lte', 999)]), [])
})

test('unknown base values and absent registry entries never satisfy numeric conditions', () => {
  for (const enemyId of ['enemy_unknown', 'not_in_registry', 'constructor', '__proto__']) {
    const map: MapSummary = { ...summary, enemyRoutes: [
      { enemyId, routeIndex: null, fixedWaits: [20], spawnKind: 'unknown' },
    ] }
    for (const property of ['hp', 'resistance'] as const) {
      for (const operator of ['gte', 'lte'] as const) {
        assert.equal(matchesMapEnemyConditions(map, registry, [condition(property, operator, 0)]), false)
      }
    }
    assert.equal(matchesMapEnemyConditions(map, registry, [condition('wait', 'gte', 20)]), true)
  }
})

test('unavailable spawn data never falls back to the enemy reference list', () => {
  for (const enemyRoutes of [null, undefined, []]) {
    const map: MapSummary = { ...summary, enemyRoutes }
    for (const property of ['hp', 'resistance', 'wait'] as const) {
      assert.deepEqual(matching([condition(property, 'gte', 0)], map), [])
      assert.equal(matchesMapEnemyConditions(map, registry, [condition(property, 'gte', 0)]), false)
    }
  }
  const map: MapSummary = { ...summary, enemyIds: ['enemy_a', 'enemy_b'], enemyRoutes: [routes[0]] }
  assert.equal(matchesMapEnemyConditions(map, registry, [condition('hp', 'gte', 5000)]), false)
})

test('conditional and unknown spawns retain their kind and do not require fixed spawning', () => {
  const map: MapSummary = { ...summary, status: 'excluded', spawnCount: null, reasons: ['conditional-spawn'],
    enemyRoutes: [
      { enemyId: 'enemy_a', routeIndex: null, fixedWaits: null, spawnKind: 'unknown' },
      { enemyId: 'enemy_b', routeIndex: 2, fixedWaits: [25], spawnKind: 'conditional' },
    ] }
  assert.deepEqual(matching([condition('hp', 'gte', 1000)], map), [
    { enemyId: 'enemy_a', routeIndex: null, waitTimes: null, spawnKind: 'unknown' },
    { enemyId: 'enemy_b', routeIndex: 2, waitTimes: [25], spawnKind: 'conditional' },
  ])
  assert.deepEqual(matching([condition('wait', 'gte', 20)], map), [
    { enemyId: 'enemy_b', routeIndex: 2, waitTimes: [25], spawnKind: 'conditional' },
  ])
})

test('known routes with no waits differ from unavailable waits', () => {
  const map: MapSummary = { ...summary, enemyRoutes: [
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [], spawnKind: 'fixed' },
    { enemyId: 'enemy_a', routeIndex: 1, fixedWaits: null, spawnKind: 'fixed' },
  ] }
  assert.deepEqual(matching([], map).map(route => route.waitTimes), [[], null])
  assert.deepEqual(matching([condition('hp', 'gte', 1000)], map).map(route => route.waitTimes), [[], null])
  assert.deepEqual(matching([condition('wait', 'gte', 0)], map), [])
})

test('invalid condition values or selectors fail closed, including beside valid conditions', () => {
  const valid = condition('hp', 'gte', 0)
  assert.equal(isMapEnemyCondition(valid), true)
  assert.equal(isMapEnemyCondition(condition('hp', 'gte', null)), true)
  for (const invalid of [
    null, [], {}, { ...valid, id: 1 }, { ...valid, property: 'future' }, { ...valid, operator: 'contains' },
    { ...valid, property: ['hp'] }, { ...valid, operator: ['gte'] },
    ...[NaN, Infinity, -Infinity, -1, '1000', undefined, true, [], {}].map(value => ({ ...valid, value })),
    { ...valid, property: 'invalid', value: null }, { ...valid, operator: 'invalid', value: null },
  ]) {
    assert.equal(isMapEnemyCondition(invalid), false)
    const conditions = [invalid as MapEnemyCondition]
    assert.deepEqual(matching(conditions), [])
    assert.deepEqual(matching([...conditions, valid]), [])
    assert.equal(matchesMapEnemyConditions(summary, registry, conditions), false)
    assert.equal(matchesMapEnemyConditions(summary, registry, [...conditions, valid]), false)
  }
})

test('invalid numeric base stats and malformed waits cannot match active conditions', () => {
  const map: MapSummary = { ...summary, enemyRoutes: [
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [NaN, -1, Infinity], spawnKind: 'fixed' },
  ] }
  assert.deepEqual(matching([condition('wait', 'gte', 0)], map), [])
  for (const value of [NaN, Infinity, -1]) {
    const enemies = { enemy_a: { ...registry.enemy_a, hp: value, resistance: value } }
    for (const property of ['hp', 'resistance'] as const) {
      assert.equal(matchesMapEnemyConditions(summary, enemies, [condition(property, 'gte', 0)]), false)
    }
  }
})

const detailedRegistry: Record<string, MapEnemyBase> = {
  enemy_a: { ...registry.enemy_a, moveSpeed: 0.75, attackInterval: 2.5, weight: 1,
    levelType: 'ELITE', motion: 'WALK', attackWay: 'RANGED', damageTypes: ['MAGIC'],
    immunities: Object.fromEntries(MAP_ENEMY_IMMUNITY_FIELDS.map(({ key }) => [key, false])) },
  enemy_b: { ...registry.enemy_b, moveSpeed: 0.5, attackInterval: 4, weight: -2,
    levelType: 'BOSS', motion: 'FLY', attackWay: 'ALL', damageTypes: ['PHYSIC', 'MAGIC'],
    immunities: Object.fromEntries(MAP_ENEMY_IMMUNITY_FIELDS.map(({ key }) => [key, true])) },
  enemy_unknown: { ...registry.enemy_unknown, moveSpeed: null, attackInterval: null, weight: null,
    levelType: null, motion: null, attackWay: null, damageTypes: null, immunities: null },
  enemy_zero: { ...registry.enemy_zero, moveSpeed: 0, attackInterval: 0, weight: 0,
    levelType: 'NORMAL', motion: 'WALK', attackWay: 'NONE', damageTypes: ['NO_DAMAGE'],
    immunities: Object.fromEntries(MAP_ENEMY_IMMUNITY_FIELDS.map(({ key }) => [key, false])) },
}
const detailedRoutes: MapEnemyRoute[] = [
  { ...routes[0], spawnCount: 2, spawnIntervals: [5, 10], entrance: 'A' },
  { ...routes[1], spawnCount: 1, spawnIntervals: [2, 8], entrance: 'B' },
  { enemyId: 'enemy_a', routeIndex: 2, fixedWaits: [], spawnKind: 'conditional',
    spawnCount: 4, spawnIntervals: [], entrance: 'A' },
  { ...routes[2], routeIndex: 3, spawnCount: 5, spawnIntervals: [0], entrance: 'C' },
  { enemyId: 'enemy_unknown', routeIndex: null, fixedWaits: null, spawnKind: 'unknown',
    spawnCount: null, spawnIntervals: null, entrance: null },
]
const detailedMap: MapSummary = { ...summary, enemyIds: ['enemy_a', 'enemy_b', 'enemy_unknown'],
  enemyRoutes: detailedRoutes, enemySpawnCounts: { enemy_a: 7, enemy_b: 5, enemy_unknown: null } }
const detailedMatching = (conditions: readonly MapEnemyCondition[], map = detailedMap) =>
  getMatchingMapEnemyRoutes(map, detailedRegistry, conditions)
const detailedMatches = (conditions: readonly MapEnemyCondition[], map = detailedMap) =>
  matchesMapEnemyConditions(map, detailedRegistry, conditions)

test('field metadata covers all properties once, shares numeric labels and operators, and exposes fixed categorical operators', () => {
  assert.equal(MAP_ENEMY_CONDITION_FIELDS.length, 32)
  assert.equal(new Set(MAP_ENEMY_CONDITION_FIELDS.map(field => field.key)).size, 32)
  assert.equal(MAP_ENEMY_NUMERIC_CONDITION_OPERATORS, ENEMY_NUMERIC_FILTER_OPERATORS)
  const baseFields = {
    hp: 'maxHp', attack: 'attack', defense: 'defense', resistance: 'magicResistance',
    moveSpeed: 'moveSpeed', attackInterval: 'baseAttackTime', weight: 'massLevel',
  }
  for (const [key, source] of Object.entries(baseFields)) {
    const field = getMapEnemyConditionField(key)!
    const existing = ENEMY_NUMERIC_FILTER_FIELDS.find(field => field.key === source)!
    assert.equal(field.label, `基礎${existing.label}`)
    assert.equal(field.unit, existing.unit)
  }
  for (const field of MAP_ENEMY_CONDITION_FIELDS) {
    assert.equal(getMapEnemyConditionField(field.key), field)
    assert.ok(field.group)
    assert.equal(field.operator, field.kind === 'number' ? undefined : field.key === 'enemyName' ? 'contains' : 'eq')
  }
  assert.equal(getMapEnemyConditionField('entrance')!.options, undefined)
  assert.equal(getMapEnemyConditionField('constructor'), undefined)
  assert.equal(getMapEnemyConditionField('future'), undefined)
})

test('every numeric property supports inclusive, equality and strict boundaries', () => {
  const map: MapSummary = { ...detailedMap, enemyRoutes: [
    { ...detailedRoutes[0], fixedWaits: [10], spawnIntervals: [5] },
  ] }
  const values: Partial<Record<MapEnemyCondition['property'], number>> = {
    hp: 1000, attack: 250, defense: 0, resistance: 50, moveSpeed: 0.75, attackInterval: 2.5, weight: 1,
    wait: 10, waitCount: 1, waitTotal: 10, spawnCount: 7, routeSpawnCount: 2, spawnInterval: 5, entranceCount: 1,
  }
  assert.deepEqual(Object.keys(values).sort(), MAP_ENEMY_CONDITION_FIELDS.filter(field => field.kind === 'number')
    .map(field => field.key).sort())
  for (const [property, value] of Object.entries(values)) {
    const key = property as MapEnemyCondition['property']
    for (const operator of ['gte', 'lte', 'eq'] as const) {
      assert.equal(detailedMatches([condition(key, operator, value)], map), true, `${key} ${operator}`)
    }
    for (const operator of ['gt', 'lt'] as const) {
      assert.equal(detailedMatches([condition(key, operator, value)], map), false, `${key} ${operator}`)
    }
    assert.equal(detailedMatches([condition(key, 'lt', value + 0.25)], map), true, key)
    assert.equal(detailedMatches([condition(key, 'gte', value + 0.25)], map), false, key)
    assert.equal(detailedMatches([condition(key, 'eq', value + 0.25)], map), false, key)
  }
})

test('numeric zero remains valid for all base stats, empty-wait aggregates, counts and simultaneous spawns', () => {
  const map: MapSummary = { ...detailedMap, enemySpawnCounts: { enemy_zero: 0 }, enemyRoutes: [
    { enemyId: 'enemy_zero', routeIndex: 0, fixedWaits: [], spawnKind: 'fixed',
      spawnCount: 0, spawnIntervals: [0], entrance: 'A' },
  ] }
  for (const property of [
    'hp', 'attack', 'defense', 'resistance', 'moveSpeed', 'attackInterval', 'weight',
    'waitCount', 'waitTotal', 'spawnCount', 'routeSpawnCount', 'spawnInterval',
  ] as const) {
    assert.equal(detailedMatches([condition(property, 'eq', 0)], map), true, property)
    assert.equal(detailedMatches([condition(property, 'gt', 0)], map), false, property)
  }
  assert.equal(detailedMatches([condition('wait', 'gte', 0)], map), false)
  assert.equal(detailedMatches([condition('waitPresence', 'eq', 'no')], map), true)
})

test('weight supports valid signed values while all other numeric thresholds reject negatives', () => {
  const map: MapSummary = { ...detailedMap, enemyRoutes: [detailedRoutes[3]] }
  assert.equal(detailedMatches([condition('weight', 'eq', -2)], map), true)
  assert.equal(detailedMatches([condition('weight', 'gte', -2), condition('weight', 'lte', -2)], map), true)
  assert.equal(detailedMatches([condition('weight', 'lt', 0)], map), true)
  assert.equal(detailedMatches([condition('weight', 'gt', -2)], map), false)
  assert.equal(isMapEnemyCondition(condition('weight', 'eq', -2)), true)
  for (const field of MAP_ENEMY_CONDITION_FIELDS.filter(field => field.kind === 'number' && field.key !== 'weight')) {
    assert.equal(isMapEnemyCondition(condition(field.key, 'gte', -1)), false, field.key)
  }
})

test('wait count and total use all original waits independently of matching individual waits', () => {
  const map: MapSummary = { ...detailedMap, enemyRoutes: [
    { ...detailedRoutes[0], fixedWaits: [15, 35, 20, 40, 20] },
  ] }
  const waitBounds = [condition('wait', 'gte', 20), condition('wait', 'lte', 35)]
  const matched = detailedMatching([...waitBounds, condition('waitCount', 'eq', 5), condition('waitTotal', 'eq', 130)], map)
  assert.equal(matched.length, 1)
  assert.deepEqual(matched[0].waitTimes, [35, 20, 20])
  assert.deepEqual(detailedMatching([...waitBounds, condition('waitCount', 'eq', 3)], map), [])
  assert.deepEqual(detailedMatching([...waitBounds, condition('waitTotal', 'eq', 75)], map), [])
  assert.equal(detailedMatches([condition('wait', 'gte', 50)], map), false)
})

test('interval bounds refer to the same individual interval and stay on the selected enemy route', () => {
  assert.deepEqual(detailedMatching([
    condition('enemyId', 'eq', 'enemy_a'), condition('spawnInterval', 'gte', 8), condition('spawnInterval', 'lte', 6),
  ]), [])
  assert.deepEqual(detailedMatching([
    condition('spawnInterval', 'gte', 8), condition('spawnInterval', 'lte', 8),
  ]).map(route => route.routeIndex), [1])
  assert.deepEqual(detailedMatching([condition('wait', 'gte', 30), condition('spawnInterval', 'eq', 8)]), [])
  assert.deepEqual(detailedMatching([condition('wait', 'gte', 30), condition('spawnInterval', 'eq', 10)]), [
    { enemyId: 'enemy_a', routeIndex: 0, spawnKind: 'fixed', waitTimes: [30], intervalTimes: [10] },
  ])
  assert.deepEqual(detailedMatching([condition('spawnInterval', 'eq', 0)]).map(route => route.enemyId), ['enemy_b'])
})

test('matched intervals retain only values satisfying every bound and stay absent without interval conditions', () => {
  const sourceIntervals = [2, 5, 8, 10, 8]
  const map: MapSummary = { ...detailedMap, enemyRoutes: [
    { ...detailedRoutes[0], spawnIntervals: sourceIntervals },
  ] }
  const matched = detailedMatching([
    condition('spawnInterval', 'gte', 5), condition('spawnInterval', 'lte', 8),
  ], map)
  assert.deepEqual(matched, [{
    enemyId: 'enemy_a', routeIndex: 0, spawnKind: 'fixed', waitTimes: [10, 30], intervalTimes: [5, 8, 8],
  }])
  assert.notEqual(matched[0].intervalTimes, sourceIntervals)
  assert.deepEqual(sourceIntervals, [2, 5, 8, 10, 8])
  for (const conditions of [[], [condition('hp', 'gte', 0)], [condition('spawnInterval', 'gte', null)]]) {
    const result = detailedMatching(conditions, map)
    assert.equal(Object.hasOwn(result[0], 'intervalTimes'), false)
    assert.deepEqual(result, [{ enemyId: 'enemy_a', routeIndex: 0, spawnKind: 'fixed', waitTimes: [10, 30] }])
  }
})

test('enemy setting counts and route setting counts are independent and include known conditional records', () => {
  assert.deepEqual(detailedMatching([condition('spawnCount', 'eq', 7)]).map(route => route.routeIndex), [0, 1, 2])
  assert.deepEqual(detailedMatching([
    condition('spawnCount', 'eq', 7), condition('routeSpawnCount', 'eq', 4), condition('spawnKind', 'eq', 'conditional'),
  ]), [{ enemyId: 'enemy_a', routeIndex: 2, spawnKind: 'conditional', waitTimes: [] }])
  assert.deepEqual(detailedMatching([condition('spawnCount', 'eq', 5), condition('routeSpawnCount', 'eq', 4)]), [])
  assert.deepEqual(detailedMatching([condition('enemyId', 'eq', 'enemy_unknown'), condition('spawnCount', 'gte', 0)]), [])
  assert.deepEqual(detailedMatching([condition('enemyId', 'eq', 'enemy_unknown'), condition('routeSpawnCount', 'gte', 0)]), [])
})

test('entrance counts deduplicate all routes of the same enemy and do not count other enemies', () => {
  assert.deepEqual(detailedMatching([condition('entranceCount', 'eq', 2)]).map(route => route.enemyId),
    ['enemy_a', 'enemy_a', 'enemy_a'])
  assert.deepEqual(detailedMatching([condition('entrance', 'eq', 'A'), condition('entranceCount', 'eq', 2)])
    .map(route => route.routeIndex), [0, 2])
  assert.deepEqual(detailedMatching([condition('entrance', 'eq', 'C'), condition('entranceCount', 'eq', 1)])
    .map(route => route.enemyId), ['enemy_b'])
  assert.deepEqual(detailedMatching([condition('entrance', 'eq', 'B'), condition('wait', 'gte', 25)]), [])
  const map: MapSummary = { ...detailedMap, enemyRoutes: [
    detailedRoutes[0], { ...detailedRoutes[1], entrance: null }, detailedRoutes[3],
  ] }
  assert.deepEqual(detailedMatching([condition('entrance', 'eq', 'A'), condition('entranceCount', 'eq', 1)], map), [])
  assert.deepEqual(detailedMatching([condition('entranceCount', 'eq', 1)], map).map(route => route.enemyId), ['enemy_b'])
  const manyEntrances = { ...detailedMap, enemyRoutes: [{ ...detailedRoutes[0], entrance: 'AA' }] }
  assert.equal(detailedMatches([condition('entrance', 'eq', 'AA')], manyEntrances), true)
})

test('classification selectors match every supported value without treating unavailable values as categories', () => {
  for (const property of ['levelType', 'motion', 'attackWay', 'damageType'] as const) {
    for (const { value } of getMapEnemyConditionField(property)!.options!) {
      const enemies = { enemy_a: { ...detailedRegistry.enemy_a,
        ...(property === 'damageType' ? { damageTypes: [value] } : { [property]: value }) } }
      const map: MapSummary = { ...detailedMap, enemyRoutes: [detailedRoutes[0]] }
      assert.equal(matchesMapEnemyConditions(map, enemies, [condition(property, 'eq', value)]), true, `${property} ${value}`)
      for (const unknown of [null, undefined]) {
        const unknownEnemies = { enemy_a: { ...enemies.enemy_a,
          ...(property === 'damageType' ? { damageTypes: unknown } : { [property]: unknown }) } }
        assert.equal(matchesMapEnemyConditions(map, unknownEnemies, [condition(property, 'eq', value)]), false, property)
      }
    }
  }
  assert.deepEqual(detailedMatching([
    condition('motion', 'eq', 'FLY'), condition('levelType', 'eq', 'BOSS'),
    condition('damageType', 'eq', 'PHYSIC'), condition('damageType', 'eq', 'MAGIC'),
  ]).map(route => route.enemyId), ['enemy_b'])
  assert.deepEqual(detailedMatching([condition('levelType', 'eq', 'ELITE'), condition('motion', 'eq', 'FLY')]), [])
})

test('fixed wait presence distinguishes known absence from unknown route data', () => {
  assert.deepEqual(detailedMatching([condition('waitPresence', 'eq', 'no')]), [
    { enemyId: 'enemy_a', routeIndex: 2, spawnKind: 'conditional', waitTimes: [] },
  ])
  assert.deepEqual(detailedMatching([condition('waitPresence', 'eq', 'yes')]).map(route => route.routeIndex), [0, 1, 3])
  assert.deepEqual(detailedMatching([condition('waitPresence', 'eq', 'no'), condition('wait', 'gte', 0)]), [])
  for (const spawnKind of ['fixed', 'conditional', 'unknown'] as const) {
    const matched = detailedMatching([condition('spawnKind', 'eq', spawnKind)])
    assert.ok(matched.length)
    assert.ok(matched.every(route => route.spawnKind === spawnKind))
  }
})

test('all nine immunity fields match explicit booleans and never interpret unknown as no', () => {
  for (const { key } of MAP_ENEMY_IMMUNITY_FIELDS) {
    assert.deepEqual(detailedMatching([condition(key, 'eq', 'yes')]).map(route => route.enemyId), ['enemy_b'], key)
    assert.deepEqual(detailedMatching([condition(key, 'eq', 'no')]).map(route => route.enemyId),
      ['enemy_a', 'enemy_a', 'enemy_a'], key)
    const map: MapSummary = { ...detailedMap, enemyRoutes: [detailedRoutes[0]] }
    for (const immunities of [null, undefined, {}, { [key]: null }]) {
      const enemies = { enemy_a: { ...detailedRegistry.enemy_a, immunities } }
      for (const value of ['yes', 'no']) {
        assert.equal(matchesMapEnemyConditions(map, enemies, [condition(key, 'eq', value)]), false, `${key} ${value}`)
      }
    }
  }
  assert.deepEqual(detailedMatching([condition('stunImmune', 'eq', 'yes'), condition('silenceImmune', 'eq', 'no')]), [])
})

test('enemy name searches normalize text and include IDs while enemy ID matching is exact', () => {
  assert.deepEqual(detailedMatching([condition('enemyName', 'contains', '術師')]).map(route => route.enemyId),
    ['enemy_a', 'enemy_a', 'enemy_a'])
  assert.deepEqual(detailedMatching([condition('enemyName', 'contains', 'ＥＮＥＭＹ＿Ａ')]).map(route => route.enemyId),
    ['enemy_a', 'enemy_a', 'enemy_a'])
  assert.deepEqual(detailedMatching([condition('enemyId', 'eq', ' enemy_b ')]).map(route => route.enemyId), ['enemy_b'])
  assert.deepEqual(detailedMatching([condition('enemyId', 'eq', 'enemy_')]), [])
  assert.deepEqual(detailedMatching([condition('enemyId', 'eq', 'ENEMY_B')]), [])
  assert.deepEqual(detailedMatching([condition('enemyName', 'contains', '術師'), condition('enemyId', 'eq', 'enemy_b')]), [])
  const unknownMap: MapSummary = { ...detailedMap, enemyRoutes: [
    { ...detailedRoutes[0], enemyId: 'unknown_enemy' },
  ] }
  assert.equal(detailedMatches([condition('enemyName', 'contains', 'unknown_enemy')], unknownMap), true)
})

test('null and blank values are inactive for every kind while invalid nonblank values remain active', () => {
  for (const field of MAP_ENEMY_CONDITION_FIELDS) {
    const operator = field.kind === 'number' ? 'gte' : field.operator!
    for (const value of [null, '', '   ', '\t\n']) {
      const blank = condition(field.key, operator, value)
      assert.equal(isMapEnemyCondition(blank), true, field.key)
      assert.equal(hasActiveMapEnemyConditions([blank]), false, field.key)
      assert.equal(detailedMatches([blank]), true, field.key)
      assert.deepEqual(detailedMatching([blank]), detailedMatching([]), field.key)
    }
  }
  assert.equal(hasActiveMapEnemyConditions([]), false)
  assert.equal(hasActiveMapEnemyConditions([condition('hp', 'gte', 0)]), true)
  assert.equal(hasActiveMapEnemyConditions([condition('hp', 'gte', NaN)]), true)
  assert.equal(hasActiveMapEnemyConditions([condition('enemyName', 'contains', '術')]), true)
})

test('validation enforces each property kind, operator and categorical option before matching', () => {
  const invalid: MapEnemyCondition[] = [
    condition('hp', 'gte', '1000'), condition('hp', 'contains', 1000),
    condition('enemyName', 'eq', '術師'), condition('enemyId', 'contains', 'enemy'),
    condition('enemyId', 'eq', 0), condition('enemyName', 'contains', 0),
    condition('levelType', 'gte', 'NORMAL'), condition('levelType', 'eq', 'normal'),
    condition('motion', 'eq', 'UNKNOWN'), condition('attackWay', 'eq', 'unknown'),
    condition('damageType', 'eq', 'PURE'), condition('waitPresence', 'eq', 'maybe'),
    condition('spawnKind', 'eq', 'UNKNOWN'), condition('entrance', 'eq', 'A1'),
    condition('entrance', 'eq', 'a'), condition('entrance', 'eq', 1),
    condition('stunImmune', 'eq', 'false'), condition('stunImmune', 'gte', 'no'),
    condition('weight', 'eq', Infinity), condition('weight', 'eq', NaN),
  ]
  for (const entry of invalid) {
    assert.equal(isMapEnemyCondition(entry), false, JSON.stringify(entry))
    assert.deepEqual(detailedMatching([entry]), [])
    assert.deepEqual(detailedMatching([entry, condition('hp', 'gte', 0)]), [])
    assert.equal(detailedMatches([entry]), false)
  }
  assert.equal(isMapEnemyCondition(condition('entrance', 'eq', ' AA ')), true)
  assert.equal(isMapEnemyCondition(condition('levelType', 'eq', ' NORMAL ')), true)
})

test('extended numeric properties reject absent, unknown or invalid values without changing legacy base searches', () => {
  const unknownMap: MapSummary = { ...detailedMap, enemyRoutes: [detailedRoutes[4]] }
  for (const field of MAP_ENEMY_CONDITION_FIELDS.filter(field => field.kind === 'number')) {
    assert.equal(detailedMatches([condition(field.key, 'gte', 0)], unknownMap), false, field.key)
  }
  for (const property of ['moveSpeed', 'attackInterval', 'weight', 'spawnCount', 'routeSpawnCount', 'spawnInterval', 'entranceCount'] as const) {
    assert.deepEqual(matching([condition(property, 'gte', 0)]), [], property)
  }
  assert.equal(matchesMapEnemyConditions(summary, registry, [condition('hp', 'gte', 5000)]), true)
  for (const source of [null, undefined, {}, { enemy_a: null }, { enemy_a: NaN }, { enemy_a: -1 }]) {
    const map = { ...detailedMap, enemySpawnCounts: source as MapSummary['enemySpawnCounts'], enemyRoutes: [detailedRoutes[0]] }
    assert.equal(detailedMatches([condition('spawnCount', 'gte', 0)], map), false)
  }
  for (const spawnIntervals of [null, undefined, [], [NaN], [-1], [Infinity], [5, NaN]]) {
    const map = { ...detailedMap, enemyRoutes: [{ ...detailedRoutes[0], spawnIntervals }] }
    assert.equal(detailedMatches([condition('spawnInterval', 'gte', 0)], map), false)
  }
  for (const fixedWaits of [null, [NaN], [-1], [Infinity], [10, NaN]]) {
    const map = { ...detailedMap, enemyRoutes: [{ ...detailedRoutes[0], fixedWaits }] }
    for (const property of ['wait', 'waitCount', 'waitTotal'] as const) {
      assert.equal(detailedMatches([condition(property, 'gte', 0)], map), false, property)
    }
    assert.equal(detailedMatches([condition('waitPresence', 'eq', 'no')], map), false)
  }
})
