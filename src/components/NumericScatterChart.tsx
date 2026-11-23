import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import './NumericScatterChart.css'

export interface NumericScatterPoint { id: string; x: number; y: number }

export interface NumericScatterChartProps {
  points: readonly NumericScatterPoint[]
  xLabel: string
  yLabel: string
  pointMode?: 'count' | 'overplot'
  fit?: { slope: number; intercept: number } | null
  showFit?: boolean
  imageSize?: { width: number; height: number }
  /** Compatibility presentation for the existing DPS chart and its PNG exports. */
  appearance?: 'numeric' | 'skill-dps'
}

const HEIGHT = 310
const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const count = new Intl.NumberFormat('ja-JP')
const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })
const formatTick = (value: number) => Math.abs(value) >= 10_000 ? compact.format(value) : number.format(value)

function groupPoints(points: readonly NumericScatterPoint[]) {
  const groups = new Map<number, Map<number, NumericScatterPoint & { count: number }>>()
  for (const point of points) {
    let byY = groups.get(point.x)
    if (!byY) { byY = new Map(); groups.set(point.x, byY) }
    const group = byY.get(point.y)
    if (group) group.count += 1
    else byY.set(point.y, { ...point, count: 1 })
  }
  return [...groups.values()].flatMap(byY => [...byY.values()]).sort((left, right) => right.count - left.count)
}

/** Fit whole bubbles inside the data rectangle; use this same domain in both point modes. */
function paddedAxis(values: readonly number[], pixels: number, radius: number) {
  const base = getHpChartValueAxis(values, { mode: 'auto' })
  const minimum = Math.min(...values), maximum = Math.max(...values)
  const span = maximum - minimum
  if (span === 0) {
    const half = (base.upperLimit - base.lowerLimit) / 2
    return getHpChartValueAxis([minimum - half, maximum + half], { mode: 'auto' })
  }
  const fraction = Math.min(0.25, (radius + 3) / Math.max(1, pixels))
  const padding = span * fraction / (1 - 2 * fraction)
  return getHpChartValueAxis([minimum - padding, maximum + padding], { mode: 'auto' })
}

/** No point selection, tooltips, jitter, pan or zoom. Controls belong to the owning page. */
export function NumericScatterChart({
  points, xLabel, yLabel, pointMode = 'count', fit = null, showFit = false, imageSize, appearance = 'numeric',
}: NumericScatterChartProps) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(640)
  const legacy = appearance === 'skill-dps'
  const prefix = legacy ? 'skill-dps-chart' : 'numeric-scatter-chart'
  const forImage = imageSize !== undefined
  const width = legacy ? imageSize?.width ?? measuredWidth : Math.max(280, imageSize?.width ?? measuredWidth)
  const height = imageSize?.height ?? HEIGHT
  useLayoutEffect(() => {
    if (forImage) return
    const element = container.current
    if (!element) return
    let frame = 0
    const measure = () => {
      const next = Math.floor(element.clientWidth)
      if (next > 0) setMeasuredWidth(previous => previous === next ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [forImage])

  const values = useMemo(() => points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)), [points])
  const groups = useMemo(() => groupPoints(values), [values])
  const maximumCount = groups[0]?.count ?? 1
  const radiusFactor = Math.min(3.5, 20 / Math.sqrt(maximumCount))
  const maximumRadius = Math.max(4, radiusFactor * Math.sqrt(maximumCount))
  const left = width < 430 ? 54 : 66
  const right = Math.max(left + 1, width - 20)
  const top = 29
  const bottom = height - (forImage ? 28 : 53)
  const xAxis = useMemo(() => legacy || !values.length ? getHpChartValueAxis(values.map(point => point.x))
    : paddedAxis(values.map(point => point.x), right - left, maximumRadius), [values, legacy, right, left, maximumRadius])
  const yAxis = useMemo(() => legacy || !values.length ? getHpChartValueAxis(values.map(point => point.y))
    : paddedAxis(values.map(point => point.y), bottom - top, maximumRadius), [values, legacy, bottom, maximumRadius])
  const x = (value: number) => left + (value - xAxis.lowerLimit) / (xAxis.upperLimit - xAxis.lowerLimit) * (right - left)
  const y = (value: number) => bottom - (value - yAxis.lowerLimit) / (yAxis.upperLimit - yAxis.lowerLimit) * (bottom - top)
  const ticks = (axis: typeof xAxis) => width >= 430 || axis.yTicks.length <= 4
    ? axis.yTicks : axis.yTicks.filter((value, index) => index % 2 === 0 || index === axis.yTicks.length - 1 || (!legacy && value === 0))
  const fitEnds = useMemo(() => {
    if (!showFit || !fit || !values.length || !Number.isFinite(fit.slope) || !Number.isFinite(fit.intercept)) return null
    const min = Math.min(...values.map(point => point.x)), max = Math.max(...values.map(point => point.x))
    const first = fit.intercept + fit.slope * min, last = fit.intercept + fit.slope * max
    return min !== max && Number.isFinite(first) && Number.isFinite(last) ? { min, max, first, last } : null
  }, [showFit, fit, values])
  const useCounts = !legacy && pointMode === 'count'
  const uniqueCounts = [...new Set(groups.map(group => group.count))].sort((a, b) => a - b)
  const legendCounts = uniqueCounts.length <= 3 ? uniqueCounts : [uniqueCounts[0], uniqueCounts[Math.floor(uniqueCounts.length / 2)], uniqueCounts.at(-1)!]
  const plotted: readonly (NumericScatterPoint & { count?: number })[] = useCounts ? groups : values

  return <div className={`${prefix}${forImage ? ' is-image' : ''}`} ref={container} style={imageSize}>
    {values.length === 0 ? <p className={`${prefix}-empty`} role="status">分析対象は0件です。</p>
      : <>
        <svg className={`${prefix}-svg`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          style={legacy ? imageSize : { ...imageSize, width, height }}
          role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} focusable="false">
          <title id={`${id}-title`}>{`${xLabel}と${yLabel}`}</title>
          <desc id={`${id}-description`}>横軸は{xLabel}、縦軸は{yLabel}。{values.length}件のスキルを点で表示します。
            {useCounts ? `同じ座標のスキルは${groups.length}個の点にまとめ、点の面積を件数に比例させています。` : ''}
            {fitEnds ? '実線は観測範囲内の単回帰直線です。' : ''}</desc>
          <defs><clipPath id={`${id}-clip`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
          {ticks(yAxis).map(tick => <g key={`y:${tick}`}>
            <line className={`${prefix}-grid`} x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
            <text className={`${prefix}-tick`} x={left - 9} y={y(tick)} dy=".35em" textAnchor="end">{formatTick(tick)}</text>
          </g>)}
          {ticks(xAxis).map(tick => <g key={`x:${tick}`}>
            <line className={`${prefix}-axis`} x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
            <text className={`${prefix}-tick`} x={x(tick)} y={bottom + 22} textAnchor="middle">{formatTick(tick)}</text>
          </g>)}
          <line className={`${prefix}-axis`} x1={left} x2={left} y1={top} y2={bottom} />
          <line className={`${prefix}-axis`} x1={left} x2={right} y1={bottom} y2={bottom} />
          {plotted.map(point => <circle className={`${prefix}-point`} key={point.id} cx={x(point.x)} cy={y(point.y)}
            data-count={useCounts ? point.count : undefined}
            r={useCounts ? radiusFactor * Math.sqrt(point.count ?? 1) : 4} />)}
          {fitEnds && <g clipPath={`url(#${id}-clip)`}><line className={`${prefix}-fit`}
            x1={x(fitEnds.min)} x2={x(fitEnds.max)} y1={y(fitEnds.first)} y2={y(fitEnds.last)} /></g>}
          <text className={`${prefix}-label`} x={left} y={14}>{yLabel}</text>
          {!forImage && <text className={`${prefix}-label`} x={(left + right) / 2} y={height - 7} textAnchor="middle">{xLabel}</text>}
        </svg>
        {!forImage && <div className={`${prefix}-legend`} aria-label="凡例">
          {useCounts ? <>
            <span>件数</span>
            {legendCounts.map(value => {
              const radius = radiusFactor * Math.sqrt(value), size = radius * 2 + 4
              return <span key={value}><svg width={size} height={size} aria-hidden="true"><circle className={`${prefix}-point`} cx={size / 2} cy={size / 2} r={radius} /></svg>{count.format(value)}件</span>
            })}
          </> : <span><i className={`${prefix}-point-key`} aria-hidden="true" />スキル</span>}
          {fitEnds && <span><i className={`${prefix}-fit-key`} aria-hidden="true" />単回帰</span>}
        </div>}
      </>}
  </div>
}
