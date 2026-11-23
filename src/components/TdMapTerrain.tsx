import { useState } from 'react'
import { MapBoard } from './MapInformation'
import type { MapDetail, MapPosition, MapSummary } from '../types/map'
import './TdMapTerrain.css'

// MOVE checkpoints and endPosition from routes[7]. The wait follows the first MOVE.
// https://github.com/ArknightsAssets/ArknightsGamedata/blob/270115d3ef5dc0e97530bedc168eb3ddb3d14bc6/jp/gamedata/levels/activities/act50side/level_act50side_08.json
const TD8_LEVEL = 'activities/act50side/level_act50side_08'
const CHECKPOINTS: MapPosition[] = [
  { row: 6, col: 2 }, { row: 6, col: 7 }, { row: 1, col: 7 },
  { row: 1, col: 2 }, { row: 4, col: 2 },
]
const END: MapPosition = { row: 4, col: 10 }

function TdBossPath({ rows, start, wait }: { rows: number; start: MapPosition; wait: number }) {
  // The level's rows run upwards; SVG coordinates run downwards from the top left.
  const points = [start, ...CHECKPOINTS, END].map(({ col, row }) => ({
    x: (col + 0.5) * 32, y: (rows - row - 0.5) * 32,
  }))
  return <g className="td-boss-path" aria-hidden="true">
    {points.slice(1).map((point, i) => {
      const prev = points[i]
      const dx = point.x - prev.x
      const dy = point.y - prev.y
      const length = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      return <g key={i} transform={`translate(${prev.x} ${prev.y}) rotate(${angle})`}>
        <line x1="11" x2={length - 12} className="td-boss-link" />
        <path d="M-3 -3.5 L4 0 L-3 3.5 Z" transform={`translate(${length / 2} 0)`} className="td-boss-arrow" />
      </g>
    })}
    {points.slice(1, -1).map((point, i) => <g key={i} transform={`translate(${point.x} ${point.y})`}>
      <circle className="td-boss-waypoint" r="8.5" />
      <text className="td-boss-step" textAnchor="middle" dy=".35em">{i + 1}</text>
    </g>)}
    <g transform={`translate(${points[1].x} ${points[1].y - 22})`}>
      <rect className="td-boss-wait-badge" x="-21" y="-8" width="42" height="16" rx="3" />
      <text className="td-boss-wait" textAnchor="middle" dy=".35em">{wait}秒待機</text>
    </g>
  </g>
}

export function TdMapTerrain({ map, detail }: { map: MapSummary; detail: MapDetail }) {
  const [showRoute, setShowRoute] = useState(true)
  const name = `${map.code} ${map.name}`
  const route = map.levelId === TD8_LEVEL && detail.levelId === TD8_LEVEL
    ? map.enemyRoutes?.find((entry) => entry.enemyId === 'enemy_1573_pyczog' && entry.routeIndex === 7)
    : undefined
  const start = route && detail.routes?.[7]?.startPosition
  const wait = route?.fixedWaits?.[0]
  if (!start || wait == null) return <MapBoard detail={detail} name={name} />
  return <div className="td-map-terrain">
    <label className="td-boss-route-switch">
      <input type="checkbox" checked={showRoute} onChange={(event) => setShowRoute(event.currentTarget.checked)} />
      雷の主の全経路
    </label>
    <MapBoard detail={detail} name={name} markedEntrance={showRoute ? start : undefined}
      routeDescription={showRoute ? `雷の主は出現口${route?.entrance ?? ''}から順に5地点を経由して防衛地点へ向かいます。地点1で${wait}秒待機します` : undefined}
      routeLegend={showRoute && <span><i className="td-boss-legend-line" aria-hidden="true" />経由地点の接続</span>}>
      {showRoute && <TdBossPath rows={detail.grid.length} start={start} wait={wait} />}
    </MapBoard>
  </div>
}
