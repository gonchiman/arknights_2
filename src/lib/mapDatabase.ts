import type { MapDetail, MapDetailShard, MapEnemyBase, MapFilters, MapIndex, MapSummary, MapTile } from '../types/map.ts'

const APP_BASE = import.meta.env?.BASE_URL ?? '/'
const DATA_BASE = `${APP_BASE.endsWith('/') ? APP_BASE : `${APP_BASE}/`}data/maps/`
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
const isCountOrNull = (value: unknown): value is number | null => value === null || isCount(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)
const detailFilename = (value: unknown): value is string => typeof value === 'string' && /^details-[0-9a-f]\.json$/.test(value)

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
    if (!id || !enemy || !isText(enemy.name) || !isNumberOrNull(enemy.hp) || !isNumberOrNull(enemy.resistance)) {
      throw new Error('マップの敵情報に不正な値があります。')
    }
    registry[id] = { name: enemy.name, hp: enemy.hp, resistance: enemy.resistance }
  }
  const seen = new Set<string>()
  const maps = root.maps.map((raw): MapSummary => {
    const map = record(raw)
    if (!map || !['levelId', 'stageId', 'code', 'name', 'zoneId', 'zoneName'].every((key) => isText(map[key]))
      || !map.levelId || seen.has(map.levelId as string)
      || (map.difficulty !== undefined && !isText(map.difficulty))
      || (map.diffGroup !== undefined && !isText(map.diffGroup))
      || !['supported', 'excluded', 'missing'].includes(String(map.status))
      || !isCountOrNull(map.spawnCount) || !strings(map.enemyIds) || !strings(map.reasons)
      || new Set(map.enemyIds).size !== map.enemyIds.length
      || map.enemyIds.some((id) => !Object.hasOwn(registry, id))
      || (map.status === 'missing'
        ? map.detailFile !== null || map.spawnCount !== null || map.enemyIds.length !== 0
        : !detailFilename(map.detailFile))
      || (map.status === 'supported' ? !isCount(map.spawnCount) || map.reasons.length !== 0 : map.spawnCount !== null)) {
      throw new Error('マップ一覧に不正な値があります。')
    }
    seen.add(map.levelId as string)
    return {
      levelId: map.levelId as string, stageId: map.stageId as string, code: map.code as string,
      name: map.name as string, zoneId: map.zoneId as string, zoneName: map.zoneName as string,
      ...(isText(map.difficulty) ? { difficulty: map.difficulty } : {}),
      ...(isText(map.diffGroup) ? { diffGroup: map.diffGroup } : {}),
      status: map.status as MapSummary['status'], spawnCount: map.spawnCount,
      enemyIds: [...map.enemyIds], reasons: [...map.reasons], detailFile: map.detailFile as string | null,
    }
  })
  return { schemaVersion: 1, generatedAt: root.generatedAt, sourceGeneratedAt: root.sourceGeneratedAt, maps, enemies: registry }
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

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ja')

export function matchesMapFilters(
  map: MapSummary,
  enemies: Record<string, MapEnemyBase>,
  filters: MapFilters,
): boolean {
  if (filters.zoneId !== 'all' && filters.zoneId !== map.zoneId) return false
  if (filters.status !== 'all' && filters.status !== map.status) return false
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchable = normalize([
    map.code, map.name, map.stageId, map.levelId, map.zoneName,
    ...map.enemyIds.flatMap((id) => [id, enemies[id]?.name ?? '']),
  ].join(' '))
  return terms.every((term) => searchable.includes(term))
}
