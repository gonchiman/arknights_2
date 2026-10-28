import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { OPERATOR_PCA_METRICS, type OperatorPcaPoint } from '../lib/operatorPca'
import { getOperatorPcaGroupId, OPERATOR_PCA_COLOR_BY_OPTIONS, type OperatorPcaColorBy, type OperatorPcaGroup } from '../lib/operatorPcaGrouping'

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
export function OperatorPcaScatter({ points, selectedId, neighborIds, onSelect, colorBy, groups }: {
  points: readonly OperatorPcaPoint[]; selectedId: string; neighborIds: readonly string[]; onSelect: (id: string) => void
  colorBy: OperatorPcaColorBy; groups: readonly OperatorPcaGroup[]
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
  const groupsById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups])
  const visibleGroupIds = new Set(points.map(point => getOperatorPcaGroupId(point.operator, colorBy)))
  const visibleGroups = groups.filter(group => visibleGroupIds.has(group.id))
  const colorByLabel = OPERATOR_PCA_COLOR_BY_OPTIONS.find(option => option.value === colorBy)?.label ?? '職業'
  const denseLegend = visibleGroups.length > 12
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

  const legend = <div className={`operator-pca-legend${denseLegend ? ' operator-pca-legend-dense' : ''}`} aria-label={`${colorByLabel}の凡例`}>
      {visibleGroups.map(group => <span key={group.id}>
        <i className={group.shape === 'square' ? 'square' : ''} style={{ background: group.color }} aria-hidden="true" />{group.label}
      </span>)}
    </div>

  return <div className="operator-pca-scatter">
    {!denseLegend && legend}
    <div className="operator-pca-plot" ref={ref}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} tabIndex={0} role="group"
        aria-label="オペレーターの主成分分布" aria-describedby={`${id}-description ${id}-selection`} onKeyDown={navigate}>
        <desc id={`${id}-description`}>横軸は第1主成分、縦軸は第2主成分。{colorByLabel}で色分け。点をクリックして選択。矢印キーでオペレーターを切り替えます。</desc>
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
            const group = groupsById.get(getOperatorPcaGroupId(point.operator, colorBy))
            const color = group?.color ?? 'var(--text-muted)'
            return <g className="operator-pca-point" key={point.operator.operatorId} onClick={() => onSelect(point.operator.operatorId)}>
              <circle cx={x(point.x)} cy={y(point.y)} r={8} fill="transparent" />
              {group?.shape === 'square'
                ? <rect x={x(point.x) - radius} y={y(point.y) - radius} width={radius * 2} height={radius * 2}
                  fill={color} opacity={active || near ? 1 : 0.7} />
                : <circle cx={x(point.x)} cy={y(point.y)} r={radius} fill={color} opacity={active || near ? 1 : 0.7} />}
              {(active || near) && <circle className={`operator-pca-ring${active ? ' selected' : ''}`} cx={x(point.x)} cy={y(point.y)} r={active ? 9 : 7} />}
            </g>
          })}
        </g>
        <text x={(left + right) / 2} y={height - 9} textAnchor="middle">第1主成分（無次元）</text>
        <text x={14} y={(top + bottom) / 2} transform={`rotate(-90 14 ${(top + bottom) / 2})`} textAnchor="middle">第2主成分（無次元）</text>
      </svg>
      <span className="visually-hidden" id={`${id}-selection`} aria-live="polite">{selected && `${selected.operator.name}：第1主成分 ${format.format(selected.x)}、第2主成分 ${format.format(selected.y)}`}</span>
    </div>
    {denseLegend && legend}
  </div>
}

export function OperatorPcaVariance({ values }: { values: readonly number[] }) {
  const [ref, width] = usePlotWidth()
  const id = useId()
  const height = 426, left = 64, right = Math.max(left + 1, width - 56), top = 28, bottom = 380
  const axis = useMemo(() => getHpChartValueAxis(values.map(value => value * 100), { mode: 'zero', nonNegative: true }), [values])
  const x = (value: number) => left + value / axis.upperLimit * (right - left)
  const ticks = width < 400 ? [0, axis.upperLimit / 2, axis.upperLimit] : axis.yTicks
  const rowHeight = (bottom - top) / Math.max(1, values.length)
  const barHeight = Math.min(20, rowHeight * 0.6)

  return <div className="operator-pca-plot operator-pca-variance-plot" ref={ref}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="各主成分の寄与率" aria-describedby={`${id}-values`}>
      {ticks.map(tick => <g key={tick}><line className="operator-pca-gridline" x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
        <text x={x(tick)} y={bottom + 21} textAnchor="middle">{format.format(tick)}</text></g>)}
      <rect className="operator-pca-frame" x={left} y={top} width={Math.max(1, right - left)} height={bottom - top} />
      {values.map((value, component) => <g key={component}>
        <text x={left - 8} y={top + rowHeight * (component + 0.5) + 4} textAnchor="end">第{component + 1}</text>
        <rect x={left} y={top + rowHeight * (component + 0.5) - barHeight / 2}
          width={Math.max(0, x(value * 100) - left)} height={barHeight} fill="var(--pca-first)" />
        <text x={width - 2} y={top + rowHeight * (component + 0.5) + 4} textAnchor="end">{(value * 100).toFixed(1)}%</text>
      </g>)}
      <text x={0} y={12}>主成分</text>
      <text x={(left + right) / 2} y={height - 6} textAnchor="middle">寄与率（%）</text>
    </svg>
    <span className="visually-hidden" id={`${id}-values`}>{values.map((value, component) => `第${component + 1}主成分 ${(value * 100).toFixed(1)}%`).join('、')}</span>
  </div>
}

export function OperatorPcaCoefficients({ coefficients, allCoefficients, component }: {
  coefficients: readonly number[]; allCoefficients: readonly (readonly number[])[]; component: number
}) {
  const [ref, width] = usePlotWidth()
  const id = useId()
  const height = 354, left = 92, right = Math.max(left + 1, width - 58), top = 28, bottom = height - 46
  const axis = useMemo(() => {
    const maximum = Math.max(...allCoefficients.flatMap(values => values.map(Math.abs)), 0)
    const extent = maximum > 0 ? maximum * 1.12 : 1
    // Use the same symmetric scale for every selected component.
    return getHpChartValueAxis([-extent, extent], { mode: 'zero' })
  }, [allCoefficients])
  const bound = Math.max(Math.abs(axis.lowerLimit), Math.abs(axis.upperLimit))
  const x = (value: number) => left + (value + bound) / (bound * 2) * (right - left)
  const ticks = width < 400 ? [-bound, 0, bound] : axis.yTicks
  const rowHeight = (bottom - top) / OPERATOR_PCA_METRICS.length
  const signed = (value: number) => Math.abs(value) < 0.0005 ? '0.000' : `${value > 0 ? '+' : ''}${value.toFixed(3)}`

  return <div className="operator-pca-plot operator-pca-coefficient-plot" ref={ref}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`第${component + 1}主成分のステータス係数`} aria-describedby={`${id}-values`}>
      {ticks.map(tick => <g key={tick}><line className={`operator-pca-gridline${tick === 0 ? ' zero' : ''}`} x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
        <text x={x(tick)} y={bottom + 21} textAnchor="middle">{format.format(tick)}</text></g>)}
      <rect className="operator-pca-frame" x={left} y={top} width={Math.max(1, right - left)} height={bottom - top} />
      {OPERATOR_PCA_METRICS.map((metric, index) => {
        const value = coefficients[index] ?? 0
        return <g key={metric.key}>
          <text x={left - 8} y={top + rowHeight * (index + 0.5) + 4} textAnchor="end">{metric.label}</text>
          <rect x={Math.min(x(0), x(value))} y={top + rowHeight * (index + 0.2)} width={Math.abs(x(value) - x(0))} height={rowHeight * 0.6}
            fill={value >= 0 ? 'var(--pca-first)' : 'var(--pca-second)'} />
          <text x={width - 2} y={top + rowHeight * (index + 0.5) + 4} textAnchor="end">{signed(value)}</text>
        </g>
      })}
      <text x={0} y={12}>ステータス</text>
      <text x={(left + right) / 2} y={height - 6} textAnchor="middle">係数（無次元）</text>
    </svg>
    <span className="visually-hidden" id={`${id}-values`}>{OPERATOR_PCA_METRICS.map((metric, index) => `${metric.label} ${signed(coefficients[index] ?? 0)}`).join('、')}</span>
  </div>
}
