import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { getProfessionColor, getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import type { OperatorPcaPoint } from '../lib/operatorPca'

function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const measure = () => {
      const next = Math.floor(container.clientWidth)
      if (next > 0) setWidth(previous => previous === next ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const square = (profession: string) => profession === 'SUPPORT' || profession === 'SPECIAL'
const color = (profession: string) => getProfessionColor(profession)?.main ?? 'var(--text-muted)'

export function OperatorPcaScatter({ points, selectedId, neighborIds, onSelect }: {
  points: readonly OperatorPcaPoint[]; selectedId: string; neighborIds: readonly string[]; onSelect: (id: string) => void
}) {
  const [ref, width] = usePlotWidth()
  const id = useId()
  const height = width < 400 ? 320 : 380
  const left = 54, right = width - 16, top = 16, bottom = height - 56
  const xAxis = useMemo(() => getHpChartValueAxis(points.map(point => point.x), { mode: 'auto' }), [points])
  const yAxis = useMemo(() => getHpChartValueAxis(points.map(point => point.y), { mode: 'auto' }), [points])
  const x = (value: number) => left + (value - xAxis.lowerLimit) / (xAxis.upperLimit - xAxis.lowerLimit) * (right - left)
  const y = (value: number) => bottom - (value - yAxis.lowerLimit) / (yAxis.upperLimit - yAxis.lowerLimit) * (bottom - top)
  const selectedIndex = points.findIndex(point => point.operator.operatorId === selectedId)
  const selected = points[selectedIndex]
  const neighbors = new Set(neighborIds)
  const presentProfessions = PROFESSION_ORDER.filter(profession => points.some(point => point.operator.profession === profession))
  const priority = (point: OperatorPcaPoint) => point.operator.operatorId === selectedId ? 2 : neighbors.has(point.operator.operatorId) ? 1 : 0
  const orderedPoints = [...points].sort((a, b) => priority(a) - priority(b))
  const xTicks = xAxis.yTicks.filter((_, index) => width >= 430 || index % 2 === 0)

  function navigate(event: KeyboardEvent<SVGSVGElement>) {
    let index: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (selectedIndex + 1) % points.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (selectedIndex - 1 + points.length) % points.length
    else if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = points.length - 1
    else return
    event.preventDefault()
    if (points[index]) onSelect(points[index].operator.operatorId)
  }

  return <div className="operator-pca-scatter">
    <div className="operator-pca-legend" aria-label="職業の凡例">
      {presentProfessions.map(profession => <span key={profession}>
        <i className={square(profession) ? 'square' : ''} style={{ background: color(profession) }} aria-hidden="true" />{getProfessionLabel(profession)}
      </span>)}
    </div>
    <div className="operator-pca-plot" ref={ref}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} tabIndex={0} role="group"
        aria-label="オペレーターの主成分分布" aria-describedby={`${id}-description ${id}-selection`} onKeyDown={navigate}>
        <desc id={`${id}-description`}>横軸は第1主成分、縦軸は第2主成分。点をクリックして選択。矢印キーでオペレーターを切り替えます。</desc>
        <defs><clipPath id={`${id}-clip`}><rect x={left} y={top} width={Math.max(1, right - left)} height={bottom - top} /></clipPath></defs>
        {xTicks.map(tick => <g key={`x-${tick}`}><line className={`operator-pca-gridline${tick === 0 ? ' zero' : ''}`} x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
          <text x={x(tick)} y={bottom + 21} textAnchor="middle">{format.format(tick)}</text></g>)}
        {yAxis.yTicks.map(tick => <g key={`y-${tick}`}><line className={`operator-pca-gridline${tick === 0 ? ' zero' : ''}`} x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end">{format.format(tick)}</text></g>)}
        <rect className="operator-pca-frame" x={left} y={top} width={Math.max(1, right - left)} height={bottom - top} />
        <g clipPath={`url(#${id}-clip)`} aria-hidden="true">
          {orderedPoints.map(point => {
            const active = point.operator.operatorId === selectedId
            const near = neighbors.has(point.operator.operatorId)
            const radius = active || near ? 5.2 : 3.3
            return <g className="operator-pca-point" key={point.operator.operatorId} onClick={() => onSelect(point.operator.operatorId)}>
              <circle cx={x(point.x)} cy={y(point.y)} r={8} fill="transparent" />
              {square(point.operator.profession)
                ? <rect x={x(point.x) - radius} y={y(point.y) - radius} width={radius * 2} height={radius * 2}
                  fill={color(point.operator.profession)} opacity={active || near ? 1 : 0.7} />
                : <circle cx={x(point.x)} cy={y(point.y)} r={radius} fill={color(point.operator.profession)} opacity={active || near ? 1 : 0.7} />}
              {(active || near) && <circle className={`operator-pca-ring${active ? ' selected' : ''}`} cx={x(point.x)} cy={y(point.y)} r={active ? 9 : 7} />}
            </g>
          })}
        </g>
        <text x={(left + right) / 2} y={height - 9} textAnchor="middle">第1主成分（無次元）</text>
        <text x={14} y={(top + bottom) / 2} transform={`rotate(-90 14 ${(top + bottom) / 2})`} textAnchor="middle">第2主成分（無次元）</text>
      </svg>
      <span className="visually-hidden" id={`${id}-selection`} aria-live="polite">{selected && `${selected.operator.name}：第1主成分 ${format.format(selected.x)}、第2主成分 ${format.format(selected.y)}`}</span>
    </div>
  </div>
}

export function OperatorPcaVariance({ values }: { values: readonly number[] }) {
  const [ref, width] = usePlotWidth()
  const id = useId()
  const height = 330, left = 40, right = width - 54, top = 20, bottom = height - 46
  const axis = getHpChartValueAxis(values.map(value => value * 100), { mode: 'zero', nonNegative: true })
  const x = (value: number) => left + value / axis.upperLimit * (right - left)
  const rowHeight = (bottom - top) / Math.max(1, values.length)
  return <div className="operator-pca-plot" ref={ref}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="各主成分の寄与率" aria-describedby={`${id}-values`}>
      {axis.yTicks.map(tick => <g key={tick}><line className="operator-pca-gridline" x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
        <text x={x(tick)} y={bottom + 21} textAnchor="middle">{format.format(tick)}</text></g>)}
      <rect className="operator-pca-frame" x={left} y={top} width={Math.max(1, right - left)} height={bottom - top} />
      {values.map((value, index) => <g key={index}>
        <text x={left - 8} y={top + rowHeight * (index + 0.5) + 4} textAnchor="end">第{index + 1}</text>
        <rect x={left} y={top + rowHeight * (index + 0.2)} width={Math.max(0, x(value * 100) - left)} height={rowHeight * 0.6}
          fill={index === 0 ? 'var(--pca-first)' : index === 1 ? 'var(--pca-second)' : 'var(--border-strong)'} />
        <text x={x(value * 100) + 5} y={top + rowHeight * (index + 0.5) + 4}>{(value * 100).toFixed(1)}%</text>
      </g>)}
      <text x={(left + right) / 2} y={height - 6} textAnchor="middle">寄与率（%）</text>
    </svg>
    <span className="visually-hidden" id={`${id}-values`}>{values.map((value, index) => `第${index + 1}主成分 ${(value * 100).toFixed(1)}%`).join('、')}</span>
  </div>
}
