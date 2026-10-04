import type { MapCategory, MapEnvironment, MapDetail, MapDetailShard, MapEnemyBase, MapEnemyRoute, MapFeatureId, MapFilters, MapIndex, MapRoute, MapSummary, MapTile, MapWave, MapWaveAction, MapWaveFragment } from '../types/map.ts'
import { MAP_FEATURE_LABELS } from './mapFeatures.ts'
import { MAP_ENEMY_IMMUNITY_KEYS } from '../types/map.ts'

const APP_BASE = import.meta.env?.BASE_URL ?? '/'
const DATA_BASE = `${APP_BASE.endsWith('/') ? APP_BASE : `${APP_BASE}/`}data/maps/`
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
const isCountOrNull = (value: unknown): value is number | null => value === null || isCount(value)
const isFiniteOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value))
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)
const featureIds = (value: unknown): value is MapFeatureId[] => strings(value)
  && value.every((id) => Object.hasOwn(MAP_FEATURE_LABELS, id)) && new Set(value).size === value.length
const detailFilename = (value: unknown): value is string => typeof value === 'string' && /^details-[0-9a-f]\.json$/.test(value)

function parseMapImmunities(source: unknown): Record<string, boolean | null> | null {
  if (source === null) return null
  const immunities = record(source)
  if (!immunities || Object.entries(immunities).some(([key, value]) =>
    !MAP_ENEMY_IMMUNITY_KEYS.some((known) => known === key) || !(value === null || typeof value === 'boolean'))) {
    throw new Error('マップの敵耐性情報に不正な値があります。')
  }
  return Object.fromEntries(MAP_ENEMY_IMMUNITY_KEYS.map((key) =>
    [key, Object.hasOwn(immunities, key) ? immunities[key] as boolean | null : null]))
}

function parseMapEnemySpawnCounts(source: unknown, enemyIds: string[]): Record<string, number | null> | null {
  if (source === undefined || source === null) return null
  const counts = record(source)
  if (!counts || Object.entries(counts).some(([id, value]) => !enemyIds.includes(id) || !isCountOrNull(value))) {
    throw new Error('マップの敵出現数に不正な値があります。')
  }
  return Object.fromEntries(Object.entries(counts)) as Record<string, number | null>
}

function parseMapEnemyRoutes(source: unknown, enemyIds: string[]): MapEnemyRoute[] | null {
  if (source === undefined || source === null) return null
  if (!Array.isArray(source)) throw new Error('マップの敵経路情報に不正な値があります。')
  const seen = new Set<string>()
  return source.map((raw): MapEnemyRoute => {
    const route = record(raw)
    if (!route || !isText(route.enemyId) || !route.enemyId.trim() || !enemyIds.includes(route.enemyId)
      || !isCountOrNull(route.routeIndex)
      || !isText(route.spawnKind) || !['fixed', 'conditional', 'unknown'].includes(route.spawnKind)
      || !(route.fixedWaits === null || (Array.isArray(route.fixedWaits)
        && route.fixedWaits.every((wait) => typeof wait === 'number' && Number.isFinite(wait) && wait > 0)))
      || (route.spawnCount !== undefined && !isCountOrNull(route.spawnCount))
      || !(route.spawnIntervals === undefined || route.spawnIntervals === null || (Array.isArray(route.spawnIntervals)
        && route.spawnIntervals.every((interval) => typeof interval === 'number' && Number.isFinite(interval) && interval >= 0)))
      || !(route.entrance === undefined || route.entrance === null || (isText(route.entrance) && /^[A-Z]+$/.test(route.entrance)))
      || (route.routeIndex === null && (route.fixedWaits !== null || (route.entrance !== undefined && route.entrance !== null)))) {
      throw new Error('マップの敵経路情報に不正な値があります。')
    }
    const key = JSON.stringify([route.enemyId, route.routeIndex, route.spawnKind])
    if (seen.has(key)) throw new Error('マップの敵経路情報が重複しています。')
    seen.add(key)
    return { enemyId: route.enemyId, routeIndex: route.routeIndex,
      fixedWaits: route.fixedWaits === null ? null : [...route.fixedWaits as number[]],
      spawnKind: route.spawnKind as MapEnemyRoute['spawnKind'],
      ...(route.spawnCount !== undefined ? { spawnCount: route.spawnCount as number | null } : {}),
      ...(route.spawnIntervals !== undefined ? {
        spawnIntervals: route.spawnIntervals === null ? null : [...route.spawnIntervals as number[]],
      } : {}),
      ...(route.entrance !== undefined ? { entrance: route.entrance as string | null } : {}),
    }
  })
}

export function parseMapIndex(source: unknown): MapIndex {
  const root = record(source)
  const enemies = record(root?.enemies)
  if (root?.schemaVersion !== 1 || !isText(root.generatedAt) || !Array.isArray(root.maps) || !enemies
    || !(root.sourceGeneratedAt === null || isText(root.sourceGeneratedAt))) {
    throw new Error('マップ一覧の形式を確認できませんでした。')
  }
  const registry: Record<string, MapEnemyBase> = Object.create(null)
  for (const [id, raw] of Object.entries(enemies)) {
    const enemy = record(raw)
    if (!id || !enemy || !isText(enemy.name) || !isNumberOrNull(enemy.hp) || !isNumberOrNull(enemy.resistance)
      || (enemy.attack !== undefined && !isNumberOrNull(enemy.attack))
      || (enemy.defense !== undefined && !isNumberOrNull(enemy.defense))
      || ['moveSpeed', 'attackInterval'].some((key) => enemy[key] !== undefined && !isNumberOrNull(enemy[key]))
      || (enemy.weight !== undefined && !isFiniteOrNull(enemy.weight))
      || ['levelType', 'motion', 'attackWay'].some((key) => enemy[key] !== undefined && enemy[key] !== null
        && (!isText(enemy[key]) || !enemy[key].trim()))
      || !(enemy.damageTypes === undefined || enemy.damageTypes === null || (strings(enemy.damageTypes)
        && enemy.damageTypes.every((type) => type.trim()) && new Set(enemy.damageTypes).size === enemy.damageTypes.length))) {
      throw new Error('マップの敵情報に不正な値があります。')
    }
    registry[id] = { name: enemy.name, hp: enemy.hp, attack: (enemy.attack ?? null) as number | null,
      defense: (enemy.defense ?? null) as number | null, resistance: enemy.resistance,
      ...(enemy.moveSpeed !== undefined ? { moveSpeed: enemy.moveSpeed as number | null } : {}),
      ...(enemy.attackInterval !== undefined ? { attackInterval: enemy.attackInterval as number | null } : {}),
      ...(enemy.weight !== undefined ? { weight: enemy.weight as number | null } : {}),
      ...(enemy.levelType !== undefined ? { levelType: enemy.levelType as string | null } : {}),
      ...(enemy.motion !== undefined ? { motion: enemy.motion as string | null } : {}),
      ...(enemy.attackWay !== undefined ? { attackWay: enemy.attackWay as string | null } : {}),
      ...(enemy.damageTypes !== undefined ? { damageTypes: enemy.damageTypes === null ? null : [...enemy.damageTypes as string[]] } : {}),
      ...(enemy.immunities !== undefined ? { immunities: parseMapImmunities(enemy.immunities) } : {}),
    }
  }
  const seen = new Set<string>()
  const maps = root.maps.map((raw): MapSummary => {
    const map = record(raw)
    if (!map || !['levelId', 'stageId', 'code', 'name', 'zoneId', 'zoneName'].every((key) => isText(map[key]))
      || !map.levelId || seen.has(map.levelId as string)
      || (map.zoneType !== undefined && !isText(map.zoneType))
      || (map.difficulty !== undefined && !isText(map.difficulty))
      || (map.diffGroup !== undefined && !isText(map.diffGroup))
      || !['supported', 'excluded', 'missing'].includes(String(map.status))
      || !isCountOrNull(map.spawnCount) || !strings(map.enemyIds) || !strings(map.reasons)
      || !(map.features === undefined || map.features === null || featureIds(map.features))
      || new Set(map.enemyIds).size !== map.enemyIds.length
      || map.enemyIds.some((id) => !Object.hasOwn(registry, id))
      || (map.status === 'missing'
        ? map.detailFile !== null || map.spawnCount !== null || map.enemyIds.length !== 0 || Array.isArray(map.features)
          || !(map.enemyRoutes === undefined || map.enemyRoutes === null)
          || !(map.enemySpawnCounts === undefined || map.enemySpawnCounts === null)
        : !detailFilename(map.detailFile))
      || (map.status === 'supported' ? !isCount(map.spawnCount) || map.reasons.length !== 0 : map.spawnCount !== null)) {
      throw new Error('マップ一覧に不正な値があります。')
    }
    seen.add(map.levelId as string)
    return {
      levelId: map.levelId as string, stageId: map.stageId as string, code: map.code as string,
      name: map.name as string, zoneId: map.zoneId as string, zoneName: map.zoneName as string,
      zoneType: isText(map.zoneType) ? map.zoneType : 'UNKNOWN',
      ...(isText(map.difficulty) ? { difficulty: map.difficulty } : {}),
      ...(isText(map.diffGroup) ? { diffGroup: map.diffGroup } : {}),
      status: map.status as MapSummary['status'], spawnCount: map.spawnCount,
      features: featureIds(map.features) ? [...map.features] : null,
      enemyRoutes: parseMapEnemyRoutes(map.enemyRoutes, map.enemyIds),
      enemySpawnCounts: parseMapEnemySpawnCounts(map.enemySpawnCounts, map.enemyIds),
      enemyIds: [...map.enemyIds], reasons: [...map.reasons], detailFile: map.detailFile as string | null,
    }
  })
  return { schemaVersion: 1, generatedAt: root.generatedAt, sourceGeneratedAt: root.sourceGeneratedAt, maps, enemies: registry }
}

const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value)
const isBooleanOrNull = (value: unknown): value is boolean | null => value === null || typeof value === 'boolean'

function parseMapRoutes(source: unknown): (MapRoute | null)[] | null {
  if (source === null) return null
  if (!Array.isArray(source)) throw new Error('マップの入口情報を確認できませんでした。')
  return source.map((raw): MapRoute | null => {
    if (raw === null) return null
    const route = record(raw)
    const start = record(route?.startPosition)
    if (!route || (route.startPosition !== null
      && (!start || !Number.isSafeInteger(start.row) || !Number.isSafeInteger(start.col)))) {
      throw new Error('マップの入口情報に不正な値があります。')
    }
    return { startPosition: start ? { row: start.row as number, col: start.col as number } : null }
  })
}

function parseMapWaves(source: unknown): MapWave[] | null {
  if (source === null) return null
  if (!Array.isArray(source)) throw new Error('マップのウェーブ情報を確認できませんでした。')
  return source.map((rawWave): MapWave => {
    const wave = record(rawWave)
    if (!wave || !isNumberOrNull(wave.preDelay) || !isNumberOrNull(wave.postDelay)
      || !(wave.maxTimeWaitingForNextWave === -1 || isNumberOrNull(wave.maxTimeWaitingForNextWave))
      || !isTextOrNull(wave.advancedWaveTag) || !Array.isArray(wave.fragments)) {
      throw new Error('マップのウェーブ情報に不正な値があります。')
    }
    const fragments = wave.fragments.map((rawFragment): MapWaveFragment => {
      const fragment = record(rawFragment)
      if (!fragment || !isNumberOrNull(fragment.preDelay) || !Array.isArray(fragment.actions)) {
        throw new Error('マップのフラグメント情報に不正な値があります。')
      }
      const actions = fragment.actions.map((rawAction): MapWaveAction => {
        const action = record(rawAction)
        if (!action || !isText(action.actionType) || !isCountOrNull(action.count) || !isCountOrNull(action.routeIndex)
          || !isNumberOrNull(action.preDelay) || !isNumberOrNull(action.interval)
          || !['key', 'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType']
            .every((key) => isTextOrNull(action[key]))
          || !['managedByScheduler', 'blockFragment', 'dontBlockWave'].every((key) => isBooleanOrNull(action[key]))
          || !strings(action.reasons)
          || (action.actionType === 'SPAWN'
            ? !isText(action.spawnKind) || !['fixed', 'conditional', 'unknown'].includes(action.spawnKind)
            : action.spawnKind !== null)) {
          throw new Error('マップの出現設定に不正な値があります。')
        }
        return {
          actionType: action.actionType, key: action.key as string | null, count: action.count,
          preDelay: action.preDelay, interval: action.interval, routeIndex: action.routeIndex,
          hiddenGroup: action.hiddenGroup as string | null,
          randomSpawnGroupKey: action.randomSpawnGroupKey as string | null,
          randomSpawnGroupPackKey: action.randomSpawnGroupPackKey as string | null,
          randomType: action.randomType as string | null, refreshType: action.refreshType as string | null,
          managedByScheduler: action.managedByScheduler as boolean | null,
          blockFragment: action.blockFragment as boolean | null, dontBlockWave: action.dontBlockWave as boolean | null,
          spawnKind: action.spawnKind as MapWaveAction['spawnKind'], reasons: [...action.reasons],
        }
      })
      return { preDelay: fragment.preDelay, actions }
    })
    return {
      preDelay: wave.preDelay, postDelay: wave.postDelay, maxTimeWaitingForNextWave: wave.maxTimeWaitingForNextWave,
      advancedWaveTag: wave.advancedWaveTag, fragments,
    }
  })
}

export function parseMapDetailShard(source: unknown): MapDetailShard {
  const root = record(source)
  const records = record(root?.maps)
  if (root?.schemaVersion !== 1 || !isText(root.generatedAt) || !records) {
    throw new Error('マップ詳細の形式を確認できませんでした。')
  }
  const maps: Record<string, MapDetail> = Object.create(null)
  for (const [levelId, raw] of Object.entries(records)) {
    const detail = record(raw)
    if (!detail || detail.levelId !== levelId || !levelId || !Array.isArray(detail.grid) || detail.grid.length === 0
      || !Array.isArray(detail.grid[0]) || detail.grid[0].length === 0 || !Array.isArray(detail.tiles) || detail.tiles.length === 0
      || !Array.isArray(detail.enemies) || ![detail.life, detail.initialCost, detail.deployLimit].every(isNumberOrNull)) {
      throw new Error('マップ詳細に不正な値があります。')
    }
    const width = detail.grid[0].length
    const paletteSize = detail.tiles.length
    if (detail.grid.some((row) => !Array.isArray(row) || row.length !== width
      || row.some((index) => !isCount(index) || index >= paletteSize))) {
      throw new Error('マップのマス配置を確認できませんでした。')
    }
    const tiles = detail.tiles.map((rawTile): MapTile => {
      const tile = record(rawTile)
      if (!tile || !['tileKey', 'heightType', 'buildableType', 'passableMask'].every((key) => isText(tile[key])) || !tile.tileKey) {
        throw new Error('マップのマス情報を確認できませんでした。')
      }
      return { tileKey: tile.tileKey as string, heightType: tile.heightType as string,
        buildableType: tile.buildableType as string, passableMask: tile.passableMask as string }
    })
    const seen = new Set<string>()
    const enemies = detail.enemies.map((rawEnemy) => {
      const enemy = record(rawEnemy)
      if (!enemy || !isText(enemy.id) || !enemy.id || seen.has(enemy.id) || !isCountOrNull(enemy.count)) {
        throw new Error('マップの出現数を確認できませんでした。')
      }
      seen.add(enemy.id)
      return { id: enemy.id, count: enemy.count }
    })
    maps[levelId] = {
      levelId, grid: detail.grid.map((row: number[]) => [...row]), tiles,
      life: detail.life as number | null, initialCost: detail.initialCost as number | null,
      deployLimit: detail.deployLimit as number | null, enemies,
      ...(detail.routes !== undefined ? { routes: parseMapRoutes(detail.routes) } : {}),
      ...(detail.waves !== undefined ? { waves: parseMapWaves(detail.waves) } : {}),
    }
  }
  return { schemaVersion: 1, generatedAt: root.generatedAt, maps }
}

export function getMapDetail(shard: MapDetailShard, summary: MapSummary): MapDetail {
  const detail = shard.maps[summary.levelId]
  if (!detail || detail.enemies.length !== summary.enemyIds.length
    || detail.enemies.some((enemy) => !summary.enemyIds.includes(enemy.id))) {
    throw new Error('選択したマップの詳細が見つかりませんでした。')
  }
  if (summary.status === 'supported'
    ? detail.enemies.some((enemy) => enemy.count === null)
      || detail.enemies.reduce((sum, enemy) => sum + (enemy.count ?? 0), 0) !== summary.spawnCount
    : detail.enemies.some((enemy) => enemy.count !== null)) {
    throw new Error('マップ一覧と詳細の出現数が一致しませんでした。')
  }
  return detail
}

let indexRequest: Promise<MapIndex> | null = null
const shardRequests = new Map<string, Promise<MapDetailShard>>()

export function loadMapDatabase(): Promise<MapIndex> {
  if (!indexRequest) {
    indexRequest = fetch(`${DATA_BASE}index.json`).then(async (response) => {
      if (!response.ok) throw new Error('マップ一覧を読み込めませんでした。')
      return parseMapIndex(await response.json())
    }).catch((cause) => {
      indexRequest = null
      throw cause
    })
  }
  return indexRequest
}

export async function loadMapDetail(summary: MapSummary): Promise<MapDetail> {
  if (summary.status === 'missing' || !detailFilename(summary.detailFile)) {
    throw new Error('このマップの詳細データは未取得です。')
  }
  const index = await loadMapDatabase()
  const file = summary.detailFile
  const cacheKey = `${file}?v=${encodeURIComponent(index.generatedAt)}`
  let request = shardRequests.get(cacheKey)
  if (!request) {
    request = fetch(`${DATA_BASE}${cacheKey}`).then(async (response) => {
      if (!response.ok) throw new Error('マップ詳細を読み込めませんでした。')
      const shard = parseMapDetailShard(await response.json())
      if (shard.generatedAt !== index.generatedAt) throw new Error('マップデータの更新日時が一致しません。ページを再読み込みしてください。')
      return shard
    }).catch((cause) => {
      shardRequests.delete(cacheKey)
      throw cause
    })
    shardRequests.set(cacheKey, request)
  }
  return getMapDetail(await request, summary)
}

export function getMapCategory(map: MapSummary): MapCategory {
  switch (map.zoneType) {
    case 'MAINLINE':
    case 'MAINLINE_ACTIVITY': return 'main'
    case 'ACTIVITY': return 'event'
    case 'WEEKLY': return 'supply'
    default: return 'other'
  }
}

export function getMapEnvironment(map: MapSummary): MapEnvironment {
  switch (map.diffGroup) {
    case 'EASY': case 'NORMAL': case 'TOUGH': case 'ALL': return map.diffGroup
    case undefined: case '': case 'NONE': return 'none'
    default: return 'other'
  }
}

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ja')

export function matchesMapFilters(
  map: MapSummary,
  enemies: Record<string, MapEnemyBase>,
  filters: MapFilters,
): boolean {
  if (filters.category !== 'all' && filters.category !== getMapCategory(map)) return false
  if (filters.environment !== 'all' && filters.environment !== getMapEnvironment(map)) return false
  if (filters.zoneId !== 'all' && filters.zoneId !== map.zoneId) return false
  if (filters.status !== 'all' && filters.status !== map.status) return false
  if (filters.features?.length) {
    const features = map.features
    if (!features) return false
    const hasFeature = (feature: MapFeatureId) => features.includes(feature)
    if (filters.featureMatch === 'all' ? !filters.features.every(hasFeature) : !filters.features.some(hasFeature)) return false
  }
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchable = normalize([
    map.code, map.name, map.stageId, map.levelId, map.zoneName,
    ...map.enemyIds.flatMap((id) => [id, enemies[id]?.name ?? '']),
  ].join(' '))
  return terms.every((term) => searchable.includes(term))
}
