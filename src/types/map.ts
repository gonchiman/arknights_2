export type MapDataStatus = 'supported' | 'excluded' | 'missing'
export type MapCategory = 'main' | 'event' | 'supply' | 'other'
export type MapEnvironment = 'none' | 'EASY' | 'NORMAL' | 'TOUGH' | 'ALL' | 'other'

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
  zoneType?: string
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

export interface MapPosition {
  row: number
  col: number
}

export interface MapRoute {
  /** Original route tile coordinates, which may be outside the map bounds. */
  startPosition: MapPosition | null
}

/** Source settings for one action; array position is its original record order. */
export interface MapWaveAction {
  actionType: string
  key: string | null
  count: number | null
  preDelay: number | null
  interval: number | null
  routeIndex: number | null
  hiddenGroup: string | null
  randomSpawnGroupKey: string | null
  randomSpawnGroupPackKey: string | null
  randomType: string | null
  refreshType: string | null
  managedByScheduler: boolean | null
  blockFragment: boolean | null
  dontBlockWave: boolean | null
  /** Null for events that do not spawn enemies. Fixed does not assert absolute timing. */
  spawnKind: 'fixed' | 'conditional' | 'unknown' | null
  reasons: string[]
}

export interface MapWaveFragment {
  preDelay: number | null
  actions: MapWaveAction[]
}

export interface MapWave {
  preDelay: number | null
  postDelay: number | null
  /** Preserves the upstream -1 sentinel as well as nonnegative settings. */
  maxTimeWaitingForNextWave: number | null
  advancedWaveTag: string | null
  fragments: MapWaveFragment[]
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
  /** Original route indices; unavailable entries are retained as null. */
  routes?: (MapRoute | null)[] | null
  /** Undefined in legacy data, null for unavailable structure, [] for no waves. */
  waves?: MapWave[] | null
}

export interface MapDetailShard {
  schemaVersion: 1
  generatedAt: string
  maps: Record<string, MapDetail>
}

export interface MapFilters {
  query: string
  category: MapCategory | 'all'
  environment: MapEnvironment | 'all'
  zoneId: string
  status: MapDataStatus | 'all'
}
