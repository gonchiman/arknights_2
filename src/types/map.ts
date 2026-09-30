export type MapDataStatus = 'supported' | 'excluded' | 'missing'

export interface MapEnemyBase {
  name: string
  hp: number | null
  resistance: number | null
}

export interface MapSummary {
  levelId: string
  stageId: string
  code: string
  name: string
  zoneId: string
  zoneName: string
  difficulty?: string
  diffGroup?: string
  status: MapDataStatus
  spawnCount: number | null
  enemyIds: string[]
  reasons: string[]
  detailFile: string | null
}

export interface MapIndex {
  schemaVersion: 1
  generatedAt: string
  sourceGeneratedAt: string | null
  maps: MapSummary[]
  enemies: Record<string, MapEnemyBase>
}

export interface MapTile {
  tileKey: string
  heightType: string
  buildableType: string
  passableMask: string
}

export interface MapDetail {
  levelId: string
  /** Original mapData.map row and column order, with palette indices remapped. */
  grid: number[][]
  tiles: MapTile[]
  life: number | null
  initialCost: number | null
  deployLimit: number | null
  enemies: { id: string; count: number | null }[]
}

export interface MapDetailShard {
  schemaVersion: 1
  generatedAt: string
  maps: Record<string, MapDetail>
}

export interface MapFilters {
  query: string
  zoneId: string
  status: MapDataStatus | 'all'
}
