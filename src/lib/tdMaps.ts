import type { MapDetail, MapIndex, MapSummary } from '../types/map.ts'
import { gameDataClient } from './gameDataClient.ts'
import { getMapDetail, loadMapDatabase, loadMapDetail, parseMapDetailShard, parseMapIndex } from './mapDatabase.ts'

/** Limit the stage codes to this event even if a different event later reuses the TD prefix. */
export function selectTdMapIndex(index: MapIndex): MapIndex {
  const maps = index.maps.filter((map) => map.zoneId.startsWith('act50side_') && map.code.startsWith('TD-'))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }) || a.levelId.localeCompare(b.levelId))
  const enemyIds = new Set(maps.flatMap((map) => map.enemyIds))
  return { schemaVersion: index.schemaVersion, generatedAt: index.generatedAt, sourceGeneratedAt: index.sourceGeneratedAt,
    maps, enemies: Object.fromEntries([...enemyIds].map((id) => [id, index.enemies[id]])) }
}

interface TdMapDatabase {
  index: MapIndex
  loadDetail: (map: MapSummary) => Promise<MapDetail>
}

async function readTdDatabase(): Promise<TdMapDatabase> {
  const base = import.meta.env?.BASE_URL ?? '/'
  const [source, response] = await Promise.all([
    gameDataClient.getSource(), fetch(`${base.endsWith('/') ? base : `${base}/`}data/maps/td-event.json`),
  ])
  if (!response.ok) throw new Error('TDマップのデータを読み込めませんでした。')
  const document = await response.json()
  const index = parseMapIndex(document.index)
  if (source.mode === 'local' && Date.parse(source.version) > Date.parse(index.generatedAt)) {
    const updated = selectTdMapIndex(await loadMapDatabase())
    if (updated.maps.length > 0) return { index: updated, loadDetail: loadMapDetail }
  }
  const details = parseMapDetailShard(document.details)
  if (index.generatedAt !== details.generatedAt) throw new Error('TDマップ一覧と詳細のデータ版が一致しません。')
  return { index, loadDetail: async (map) => getMapDetail(details, map) }
}

let request: Promise<TdMapDatabase> | null = null

function getTdDatabase() {
  request ??= readTdDatabase().catch((error) => {
    request = null
    throw error
  })
  return request
}

export async function loadTdMapDatabase(): Promise<MapIndex> {
  return (await getTdDatabase()).index
}

export async function loadTdMapDetail(map: MapSummary): Promise<MapDetail> {
  return (await getTdDatabase()).loadDetail(map)
}
