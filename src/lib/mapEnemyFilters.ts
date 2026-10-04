import type { MapEnemyBase, MapEnemyRoute, MapSummary } from '../types/map.ts'
import {
  getMapEnemyConditionField, MAP_ENEMY_IMMUNITY_FIELDS, MAP_ENEMY_NUMERIC_CONDITION_OPERATORS,
  type MapEnemyConditionOperator, type MapEnemyConditionProperty, type MapEnemyNumericConditionProperty,
} from './mapEnemyConditionFields.ts'

export type { MapEnemyConditionOperator, MapEnemyConditionProperty } from './mapEnemyConditionFields.ts'

export interface MapEnemyCondition {
  id: string
  property: MapEnemyConditionProperty
  operator: MapEnemyConditionOperator
  /** Null is an empty condition input, rather than a numeric zero. */
  value: number | string | null
}

export interface MatchingMapEnemyRoute {
  enemyId: string
  routeIndex: number | null
  spawnKind: MapEnemyRoute['spawnKind']
  /** Matching individual waits; null means the route's wait data is unavailable. */
  waitTimes: number[] | null
  /** Present only when an interval condition is active; preserves matching source order. */
  intervalTimes?: number[]
}

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isEmptyValue = (value: unknown): boolean => value === null || (typeof value === 'string' && value.trim() === '')
const normalizeText = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase('ja')
const numericOperators = new Set<string>(MAP_ENEMY_NUMERIC_CONDITION_OPERATORS.map(({ key }) => key))
const immunityProperties = new Set<string>(MAP_ENEMY_IMMUNITY_FIELDS.map(({ key }) => key))

export function hasActiveMapEnemyConditions(conditions: readonly MapEnemyCondition[]): boolean {
  return conditions.some(condition => !isEmptyValue(condition?.value))
}

/** Invalid input must not silently remove a constraint. */
export function isMapEnemyCondition(source: unknown): source is MapEnemyCondition {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return false
  const condition = source as Record<string, unknown>
  if (typeof condition.id !== 'string' || typeof condition.property !== 'string') return false
  const field = getMapEnemyConditionField(condition.property)
  if (!field || typeof condition.operator !== 'string') return false
  if (field.kind === 'number' ? !numericOperators.has(condition.operator) : condition.operator !== field.operator) return false
  if (isEmptyValue(condition.value)) return true
  if (field.kind === 'number') return condition.property === 'weight'
    ? isFiniteNumber(condition.value) : isNonNegativeNumber(condition.value)
  if (typeof condition.value !== 'string') return false
  const value = condition.value.trim()
  return field.kind === 'text' || (field.options
    ? field.options.some(option => option.value === value) : condition.property === 'entrance' && /^[A-Z]+$/.test(value))
}

function meetsNumberCondition(value: unknown, condition: MapEnemyCondition): boolean {
  if (!isFiniteNumber(value) || (condition.property !== 'weight' && value < 0)
    || typeof condition.value !== 'number') return false
  switch (condition.operator) {
    case 'gte': return value >= condition.value
    case 'lte': return value <= condition.value
    case 'eq': return value === condition.value
    case 'gt': return value > condition.value
    case 'lt': return value < condition.value
    default: return false
  }
}

function knownDurations(source: unknown): readonly number[] | null {
  return Array.isArray(source) && source.every(isNonNegativeNumber) ? source : null
}

function getEntranceCounts(routes: readonly MapEnemyRoute[]): Map<string, number | null> {
  const entrances = new Map<string, Set<string> | null>()
  for (const route of routes) {
    if (entrances.get(route.enemyId) === null) continue
    if (typeof route.entrance !== 'string' || !/^[A-Z]+$/.test(route.entrance)) {
      entrances.set(route.enemyId, null)
      continue
    }
    const labels = entrances.get(route.enemyId) ?? new Set<string>()
    labels.add(route.entrance)
    entrances.set(route.enemyId, labels)
  }
  return new Map([...entrances].map(([id, labels]) => [id, labels === null ? null : labels.size]))
}

function numericValue(
  property: MapEnemyNumericConditionProperty,
  map: MapSummary,
  route: MapEnemyRoute,
  enemy: MapEnemyBase | undefined,
  waits: readonly number[] | null,
  entranceCounts: ReadonlyMap<string, number | null>,
): number | null | undefined {
  switch (property) {
    case 'hp': case 'attack': case 'defense': case 'resistance':
    case 'moveSpeed': case 'attackInterval': case 'weight': return enemy?.[property]
    case 'waitCount': return waits?.length
    case 'waitTotal': return waits?.reduce((total, value) => total + value, 0)
    case 'spawnCount': return map.enemySpawnCounts && Object.hasOwn(map.enemySpawnCounts, route.enemyId)
      ? map.enemySpawnCounts[route.enemyId] : null
    case 'routeSpawnCount': return route.spawnCount
    case 'entranceCount': return entranceCounts.get(route.enemyId)
    default: return null
  }
}

function matchesOtherCondition(
  condition: MapEnemyCondition,
  map: MapSummary,
  route: MapEnemyRoute,
  enemy: MapEnemyBase | undefined,
  waits: readonly number[] | null,
  entranceCounts: ReadonlyMap<string, number | null>,
): boolean {
  const field = getMapEnemyConditionField(condition.property)!
  if (field.kind === 'number') return meetsNumberCondition(numericValue(
    condition.property as MapEnemyNumericConditionProperty, map, route, enemy, waits, entranceCounts,
  ), condition)
  if (typeof condition.value !== 'string') return false
  const value = condition.value.trim()
  switch (condition.property) {
    case 'enemyName': return [enemy?.name ?? '', route.enemyId]
      .some(name => normalizeText(name).includes(normalizeText(value)))
    case 'enemyId': return route.enemyId === value
    case 'levelType': case 'motion': case 'attackWay': return enemy?.[condition.property] === value
    case 'damageType': return enemy?.damageTypes?.includes(value) ?? false
    case 'waitPresence': return waits !== null && (waits.length > 0) === (value === 'yes')
    case 'spawnKind': return route.spawnKind === value
    case 'entrance': return route.entrance === value
    default: {
      if (!immunityProperties.has(condition.property) || !enemy?.immunities
        || !Object.hasOwn(enemy.immunities, condition.property)) return false
      const immunity = enemy.immunities[condition.property]
      return typeof immunity === 'boolean' && immunity === (value === 'yes')
    }
  }
}

/**
 * Every constraint belongs to one spawned enemy on one route. Multiple wait
 * constraints must hold for the same individual wait, never its route total.
 */
export function getMatchingMapEnemyRoutes(
  map: MapSummary,
  registry: Readonly<Record<string, MapEnemyBase>>,
  conditions: readonly MapEnemyCondition[],
): MatchingMapEnemyRoute[] {
  if (!conditions.every(isMapEnemyCondition) || !map.enemyRoutes) return []
  const active = conditions.filter(condition => !isEmptyValue(condition.value))
  const waitConditions = active.filter(condition => condition.property === 'wait')
  const intervalConditions = active.filter(condition => condition.property === 'spawnInterval')
  const otherConditions = active.filter(condition => condition.property !== 'wait' && condition.property !== 'spawnInterval')
  const entranceCounts = active.some(condition => condition.property === 'entranceCount')
    ? getEntranceCounts(map.enemyRoutes) : new Map<string, number | null>()
  const matches: MatchingMapEnemyRoute[] = []

  for (const route of map.enemyRoutes) {
    const enemy = Object.hasOwn(registry, route.enemyId) ? registry[route.enemyId] : undefined
    const waits = knownDurations(route.fixedWaits)
    if (!otherConditions.every(condition => matchesOtherCondition(condition, map, route, enemy, waits, entranceCounts))) continue
    const intervalTimes = intervalConditions.length > 0
      ? knownDurations(route.spawnIntervals)
        ?.filter(interval => intervalConditions.every(condition => meetsNumberCondition(interval, condition)))
      : undefined
    if (intervalConditions.length > 0 && !intervalTimes?.length) continue

    const waitTimes = waitConditions.length > 0
      ? waits?.filter(wait => waitConditions.every(condition => meetsNumberCondition(wait, condition))) ?? null
      : waits === null ? null : [...waits]
    if (waitConditions.length > 0 && !waitTimes?.length) continue
    matches.push({
      enemyId: route.enemyId,
      routeIndex: route.routeIndex,
      spawnKind: route.spawnKind,
      waitTimes,
      ...(intervalTimes === undefined ? {} : { intervalTimes }),
    })
  }
  return matches
}

/** Empty inputs keep all maps visible, including maps without spawn data. */
export function matchesMapEnemyConditions(
  map: MapSummary,
  registry: Readonly<Record<string, MapEnemyBase>>,
  conditions: readonly MapEnemyCondition[],
): boolean {
  if (!conditions.every(isMapEnemyCondition)) return false
  return !hasActiveMapEnemyConditions(conditions)
    || getMatchingMapEnemyRoutes(map, registry, conditions).length > 0
}
