import type { MapDetail, MapPosition, MapRoute, MapSummary } from '../types/map.ts'

export interface TdEnemyRoute {
  index: number
  entrance: string | null
  route: MapRoute
}

export function getTdEnemyRoutes(
  map: Pick<MapSummary, 'enemyRoutes'>,
  detail: Pick<MapDetail, 'routes'>,
  enemyId: string,
): TdEnemyRoute[] {
  const routes = new Map<number, TdEnemyRoute>()
  for (const entry of map.enemyRoutes ?? []) {
    if (entry.enemyId !== enemyId || entry.routeIndex == null || routes.has(entry.routeIndex)) continue
    const route = detail.routes?.[entry.routeIndex]
    if (route?.startPosition && route.endPosition && route.checkpoints) {
      routes.set(entry.routeIndex, { index: entry.routeIndex, entrance: entry.entrance ?? null, route })
    }
  }
  return [...routes.values()].sort((a, b) => a.index - b.index)
}

interface RouteMarker {
  position: MapPosition
  labels: string[]
  kind: 'start' | 'waypoint' | 'end'
}

interface RouteLink {
  from: MapPosition
  to: MapPosition
}

const sameTile = (a: MapPosition, b: MapPosition) => a.row === b.row && a.col === b.col

/** Links connect specified waypoints. They do not attempt to resolve in-game pathfinding. */
export function describeTdRoute({ route, entrance }: TdEnemyRoute) {
  const markers = new Map<string, RouteMarker>()
  const links: RouteLink[] = []
  const notes: string[] = []
  const checkpoints = route.checkpoints ?? []
  const start = route.startPosition
  const end = route.endPosition
  let previous = start
  let location = '出現地点'
  let visible = true
  let waypoint = 0

  function mark(position: MapPosition, label: string, kind: RouteMarker['kind']) {
    const key = `${position.row}:${position.col}`
    const marker = markers.get(key)
    if (marker) {
      marker.labels.push(label)
      if (kind === 'end' && marker.kind === 'waypoint') marker.kind = 'end'
    } else {
      markers.set(key, { position, labels: [label], kind })
    }
  }

  function connect(to: MapPosition) {
    if (previous && !sameTile(previous, to)) links.push({ from: previous, to })
    previous = to
  }

  if (start) mark(start, entrance ?? '始', 'start')
  for (const checkpoint of checkpoints) {
    const { type, time, position } = checkpoint
    if (type === 'MOVE' || type === 'APPEAR_AT_POS') {
      if (type === 'APPEAR_AT_POS') {
        previous = null
        visible = true
      }
      if (!position || !visible) {
        previous = null
        continue
      }
      connect(position)
      waypoint++
      location = `地点${waypoint}`
      mark(position, String(waypoint), 'waypoint')
      if (type === 'APPEAR_AT_POS') notes.push(`${location}で再出現`)
    } else if (type === 'DISAPPEAR') {
      notes.push(`${location}で消失`)
      previous = null
      visible = false
      location = '消失中'
    } else if (type === 'WAIT_FOR_SECONDS') {
      if (time != null && time > 0) notes.push(`${location} ${time}秒待機`)
    } else {
      // A checkpoint we cannot interpret may move the enemy. Do not bridge it.
      previous = null
      notes.push(`未対応の経由設定（${type}）`)
    }
  }
  if (!waypoint) notes.push('経由地点の記載なし')
  if (end) {
    if (waypoint && visible) connect(end)
    mark(end, '終', 'end')
    if (start && sameTile(start, end)) notes.push(`出現${entrance ? `口${entrance}` : '地点'}に戻る`)
  }
  return { markers: [...markers.values()], links, notes }
}
