import { useLayoutEffect, useMemo, useRef, type ComponentProps, type CSSProperties, type KeyboardEvent } from 'react'
import { canPlaceTdOperatorAt, TD_DIRECTIONS, type TdDirection, type TdPlacedOperator } from '../lib/tdDeployment'
import { formatTdCell } from '../lib/tdCoordinates'
import type { TdDeployOperator } from '../lib/tdDeploymentRoster'
import type { MapDetail } from '../types/map'
import { MapBoard } from './MapInformation'
import { useTdDeployment } from './TdDeploymentContext'
import './TdDeploymentBoard.css'

const markerAngle = { up: -90, right: 0, down: 90, left: 180 }
const arrowSteps: Record<string, readonly [number, number] | undefined> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
}
const keyDirections: Partial<Record<string, TdDirection>> = {
  ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
}

function markerLabel(operator: TdDeployOperator) {
  return operator.shortName ?? Array.from(operator.name).slice(0, 2).join('')
}

function navigateCells(event: KeyboardEvent<HTMLButtonElement>, row: number, col: number, detail: MapDetail) {
  const step = arrowSteps[event.key]
  if (!step) return
  event.preventDefault()
  const group = event.currentTarget.parentElement
  for (let y = row + step[0], x = col + step[1]; detail.grid[y]?.[x] != null; y += step[0], x += step[1]) {
    const next = group?.querySelector<HTMLButtonElement>(`[data-cell="${y}-${x}"]`)
    if (next) { next.focus(); return }
  }
}

function FacingPad({ placed, detail, onTurn }: {
  placed: TdPlacedOperator; detail: MapDetail; onTurn: (direction: TdDirection) => void
}) {
  const columns = detail.grid[0].length
  const rows = detail.grid.length
  const padRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const pad = padRef.current
    const board = pad?.parentElement
    if (!pad || !board) return
    const align = () => {
      const { clientWidth: w, clientHeight: h } = board
      const cell = w / columns
      const half = pad.offsetWidth / 2
      const centerGap = (pad.firstElementChild?.clientWidth ?? 0) / 2 + 2
      const x = (placed.col + .5) * cell
      const y = (placed.row + .5) * h / rows
      const nearestEdge = Math.min(x, w - x, y, h - y)
      const clipped = nearestEdge < half - Math.max(0, centerGap - cell / 2)
      // If clamping would cover the badge, keep it in an open corner of the cross.
      const shift = clipped ? centerGap + cell / 2 : 0
      pad.style.setProperty('--td-shift-x', `${x < w / 2 ? shift : -shift}px`)
      pad.style.setProperty('--td-shift-y', `${y < h / 2 ? shift : -shift}px`)
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(board)
    observer.observe(pad)
    return () => observer.disconnect()
  }, [columns, rows, placed.col, placed.row])
  const anchorStyle = {
    '--td-facing-x': `${(placed.col + .5) * 100 / columns}%`,
    '--td-facing-y': `${(placed.row + .5) * 100 / rows}%`,
  } as CSSProperties
  return <div ref={padRef} role="group" aria-label="向き" className="td-facing-pad" style={anchorStyle}
    onKeyDown={event => {
      const direction = keyDirections[event.key]
      if (direction && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        onTurn(direction)
      }
    }}>
    {(Object.keys(TD_DIRECTIONS) as TdDirection[]).map(direction =>
      <button key={direction} className="button secondary" type="button" data-direction={direction}
        aria-label={`${TD_DIRECTIONS[direction].label}向き`} aria-pressed={placed.direction === direction}
        onClick={() => onTurn(direction)}>{TD_DIRECTIONS[direction].arrow}</button>)}
  </div>
}

export function TdDeploymentBoard({ detail, routeLegend, boardOverlay, children, ...props }: ComponentProps<typeof MapBoard>) {
  const deployment = useTdDeployment()
  // Keep static board geometry and cell buttons stable while the timeline moves its own markers.
  const layers = useMemo(() => {
    if (!deployment || !detail.grid[0]?.length) return null
    const { placements, editing, facing, targeting, selectedOperator, actions } = deployment
    if (!editing && !placements.length) return null
    const columns = detail.grid[0].length
    const markers = placements.map(({ row, col, operator, direction }) => {
      const label = markerLabel(operator)
      const length = Array.from(label).length
      const width = Math.min(24, length * 9 + 2)
      const height = 13
      const tipOffset = (direction === 'up' || direction === 'down' ? height : width) / 2
      return <g key={operator.id} className="td-ally-mark" transform={`translate(${col * 32 + 16} ${row * 32 + 16})`}>
        <title>{`${operator.name}（${formatTdCell(columns, row, col)}・${TD_DIRECTIONS[direction].label}向き）`}</title>
        {editing && (facing || targeting === 'move') && selectedOperator?.id === operator.id &&
          <rect className={facing ? 'td-facing-origin' : 'td-move-origin'} x="-15" y="-15" width="30" height="30" />}
        <rect x={-width / 2} y={-height / 2} width={width} height={height} rx="1.6" />
        <path d="M-0.3 -2.5L2.5 0L-0.3 2.5Z" transform={`rotate(${markerAngle[direction]}) translate(${tipOffset} 0)`} />
        <text textAnchor="middle" dominantBaseline="central"
          textLength={length > 2 ? width - 2 : undefined} lengthAdjust="spacingAndGlyphs">{label}</text>
      </g>
    })
    const legend = placements.map(({ operator, row, col, direction }) => {
      const content = <><b className="td-ally-key" aria-hidden="true">{markerLabel(operator)}</b>{operator.name}
        <span className="visually-hidden">{formatTdCell(columns, row, col)}、{TD_DIRECTIONS[direction].label}向き</span></>
      return actions && editing && !targeting && !facing
        ? <button key={operator.id} className="td-ally-choice" type="button"
            aria-pressed={selectedOperator?.id === operator.id} onClick={() => actions.selectOperator(operator, 'edit')}>{content}</button>
        : <span key={operator.id}>{content}</span>
    })
    const terrain = <>{children}{markers}</>
    const boardLegend = <>{routeLegend}{legend}</>
    if (facing) {
      const placed = placements.find(unit => unit.operator.id === selectedOperator?.id)
      return { terrain, legend: boardLegend, targets: actions && placed &&
        <FacingPad detail={detail} placed={placed} onTurn={actions.setDirection} /> }
    }
    const selectableCells = editing && targeting
      ? detail.grid.flatMap((tiles, row) => tiles.flatMap((_, col) =>
        selectedOperator && canPlaceTdOperatorAt(detail, placements, selectedOperator, row, col)
          ? [{ row, col, operator: selectedOperator }] : []))
      : placements
    const targets = actions && <div className="td-placement-cells" role="group" aria-label="オペレーター配置マス"
      style={{ gridTemplateColumns: `repeat(${detail.grid[0].length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${detail.grid.length}, minmax(0, 1fr))` }}>
      {selectableCells.map(({ row, col, operator }) => {
        const action = targeting === 'place' ? 'を配置' : targeting === 'move' ? 'を移動' : 'の移動先を選ぶ'
        return <button key={`${row}-${col}`} data-cell={`${row}-${col}`} type="button"
          className={targeting ? 'td-candidate-cell' : 'td-placed-cell'} data-selected={(!targeting && operator.id === selectedOperator?.id) || undefined}
          aria-label={`${formatTdCell(columns, row, col)}：${operator.name}${action}`}
          style={{ gridRow: row + 1, gridColumn: col + 1 }}
          onClick={() => targeting ? actions.selectDestination(row, col) : actions.selectOperator(operator, 'move')}
          onKeyDown={event => navigateCells(event, row, col, detail)}>
          {targeting && <span aria-hidden="true">＋</span>}
        </button>
      })}
    </div>
    return { terrain, legend: boardLegend, targets }
  }, [deployment, detail, children, routeLegend])
  const selectedPlacement = deployment?.placements.find(unit => unit.operator.id === deployment.selectedOperator?.id)
  const enemyOverlay = deployment?.editing && boardOverlay ? <div inert>{boardOverlay}</div> : boardOverlay
  return <MapBoard {...props} detail={detail} showShogiCoordinates highlightedCell={selectedPlacement ?? props.highlightedCell}
    routeLegend={layers?.legend ?? routeLegend}
    boardOverlay={layers?.targets ? <>{layers.targets}{enemyOverlay}</> : enemyOverlay}>
    {layers?.terrain ?? children}
  </MapBoard>
}
