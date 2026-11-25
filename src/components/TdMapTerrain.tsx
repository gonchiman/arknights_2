import { useState } from 'react'
import { formatTdCell } from '../lib/tdCoordinates'
import { describeTdRoute, getTdEnemyRoutes, type TdEnemyRoute } from '../lib/tdEnemyRoutes'
import type { MapDetail, MapPosition, MapSummary } from '../types/map'
import { TdDeploymentBoard } from './TdDeploymentBoard'
import { useTdDeployment } from './TdDeploymentContext'
import { PageOutputHeader } from './PageLayout'
import { TdMapImage } from './TdMapImage'
import './TdMapTerrain.css'

type Geometry = ReturnType<typeof describeTdRoute>

export function TdTerrainBoard({ map, detail }: { map: MapSummary; detail: MapDetail }) {
  return <TdMapImage map={map} filenameParts={['地形']} caption="地形">
    <TdDeploymentBoard detail={detail} name={`${map.code} ${map.name}`} />
  </TdMapImage>
}

function tileCenter({ row, col }: MapPosition, rows: number) {
  return { x: (col + 0.5) * 32, y: (rows - row - 0.5) * 32 }
}

function RouteOverlay({ rows, geometry }: { rows: number; geometry: Geometry }) {
  return <g className="td-route-overlay" aria-hidden="true">
    {geometry.links.map(({ from, to }, i) => {
      const a = tileCenter(from, rows)
      const b = tileCenter(to, rows)
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      return <g key={i} transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
        <line x1="11" x2={length - 11} className="td-route-link" />
        <path d="M-3 -3.5 L4 0 L-3 3.5 Z" transform={`translate(${length * 0.62} 0)`} className="td-route-arrow" />
      </g>
    })}
    {geometry.markers.map(({ position, labels, kind }) => {
      const { x, y } = tileCenter(position, rows)
      const lines = []
      for (let i = 0; i < labels.length; i += 3) lines.push(labels.slice(i, i + 3).join('·'))
      const width = kind === 'waypoint' && labels.length === 1 ? 18 : 28
      const height = Math.min(30, Math.max(18, lines.length * 9 + 2))
      return <g key={`${x}-${y}`} className={`td-route-marker td-route-marker-${kind}`} transform={`translate(${x} ${y})`}>
        <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={kind === 'waypoint' ? 8 : 3} />
        {lines.map((line, i) => <text key={i} y={(i - (lines.length - 1) / 2) * (height / lines.length)}
          textAnchor="middle" dy=".35em" textLength={line.length > 4 ? width - 3 : undefined}
          lengthAdjust="spacingAndGlyphs">{line}</text>)}
      </g>
    })}
  </g>
}

function RouteBoard({ detail, name, selection }: {
  detail: MapDetail; name: string; selection: TdEnemyRoute
}) {
  const geometry = describeTdRoute(selection)
  const end = selection.route.endPosition
  const tile = end && detail.grid[detail.grid.length - end.row - 1]?.[end.col]
  const goal = tile != null && ['tile_end', 'tile_end_cooperate'].includes(detail.tiles[tile]?.tileKey)
  const notes = goal ? [...geometry.notes, '防衛地点へ'] : geometry.notes
  const description = geometry.markers.map(({ labels, position }) =>
    `${labels.join('・')}は${formatTdCell(detail.grid[0].length, detail.grid.length - 1 - position.row, position.col)}`)
  return <>
    <TdDeploymentBoard detail={detail} name={name} markedEntrance={selection.route.startPosition ?? undefined}
      routeDescription={[...description, ...notes].join('。')}
      routeLegend={geometry.links.length > 0 && <span><i className="td-route-legend-line" aria-hidden="true" />経由地点の接続</span>}>
      <RouteOverlay rows={detail.grid.length} geometry={geometry} />
    </TdDeploymentBoard>
    {notes.length > 0 && <p className="td-route-events" aria-live="polite">{notes.join(' ／ ')}</p>}
  </>
}

interface RoutePanelProps { map: MapSummary; detail: MapDetail; enemyId: string; enemyName: string; onClear: () => void }

export function TdEnemyRoutePanel({ map, detail, enemyId, enemyName, onClear }: RoutePanelProps) {
  const [selected, setSelected] = useState(0)
  const editing = useTdDeployment()?.editing
  const routes = getTdEnemyRoutes(map, detail, enemyId)
  const position = selected < routes.length ? selected : 0
  const selection = routes[position]
  return <div className="td-map-route-panel">
    {editing ? <strong>{enemyName}{selection && `　経路 ${position + 1} / ${routes.length}`}</strong> : <PageOutputHeader segments={['地形', '経路']}>
      <strong>{enemyName}</strong>
      {routes.length > 1 ? <label className="map-wave-picker">経路
        <select value={position} onChange={event => setSelected(Number(event.currentTarget.value))}>
          {routes.map(({ index, entrance }, i) => <option key={index} value={i}>
            {i + 1} / {routes.length}{entrance && `　出現口${entrance}`}
          </option>)}
        </select>
      </label> : selection?.entrance && <span>出現口{selection.entrance}</span>}
      <button className="button secondary" type="button" onClick={onClear}>経路を消す</button>
    </PageOutputHeader>}
    {selection
      ? <TdMapImage map={map} filenameParts={['経路', enemyName, `経路${position + 1}`]}
          caption={`${enemyName}　経路${position + 1}${selection.entrance ? `　出現口${selection.entrance}` : ''}`}>
          <RouteBoard detail={detail} name={`${map.code} ${enemyName} 経路${position + 1}`} selection={selection} />
        </TdMapImage>
      : <>
        <p className="map-empty" role="status">この敵の経路データはありません。</p>
        <TdTerrainBoard map={map} detail={detail} />
      </>}
  </div>
}
