import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import './SkillDpsAnalysisChart.css'

export interface SkillDpsChartPoint { id: string; x: number; y: number }

interface Props {
  points: readonly SkillDpsChartPoint[]
  xLabel: string
  yLabel: string
  fit: { slope: number; intercept: number } | null
  showFit: boolean
  imageSize?: { width: number; height: number }
}

const HEIGHT = 310
const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })
const formatTick = (value: number) => Math.abs(value) >= 10_000 ? compact.format(value) : number.format(value)

/** The graph deliberately has no point selection, tooltip, pan or zoom. */
export function SkillDpsAnalysisChart({ points, xLabel, yLabel, fit, showFit, imageSize }: Props) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(640)
  const forImage = imageSize !== undefined
  const width = imageSize?.width ?? measuredWidth
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
  const xAxis = useMemo(() => getHpChartValueAxis(values.map(point => point.x)), [values])
  const yAxis = useMemo(() => getHpChartValueAxis(values.map(point => point.y)), [values])
  const left = width < 430 ? 54 : 66
  const right = Math.max(left + 1, width - 20)
  const top = 29
  const bottom = height - (forImage ? 28 : 53)
  const x = (value: number) => left + (value - xAxis.lowerLimit) / (xAxis.upperLimit - xAxis.lowerLimit) * (right - left)
  const y = (value: number) => bottom - (value - yAxis.lowerLimit) / (yAxis.upperLimit - yAxis.lowerLimit) * (bottom - top)
  const ticks = (axis: typeof xAxis) => width >= 430 || axis.yTicks.length <= 4
    ? axis.yTicks : axis.yTicks.filter((_, index) => index % 2 === 0 || index === axis.yTicks.length - 1)
  const fitEnds = useMemo(() => {
    if (!showFit || !fit || !values.length || !Number.isFinite(fit.slope) || !Number.isFinite(fit.intercept)) return null
    const min = Math.min(...values.map(point => point.x)), max = Math.max(...values.map(point => point.x))
    const first = fit.intercept + fit.slope * min, last = fit.intercept + fit.slope * max
    return min !== max && Number.isFinite(first) && Number.isFinite(last) ? { min, max, first, last } : null
  }, [showFit, fit, values])

  return <div className={`skill-dps-chart${forImage ? ' is-image' : ''}`} ref={container} style={imageSize}>
    {values.length === 0 ? <p className="skill-dps-chart-empty" role="status">分析対象は0件です。</p>
      : <>
        <svg className="skill-dps-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={imageSize}
          role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} focusable="false">
          <title id={`${id}-title`}>{`${xLabel}と${yLabel}`}</title>
          <desc id={`${id}-description`}>横軸は{xLabel}、縦軸は{yLabel}。{values.length}件のスキルを点で表示します。
            {fitEnds ? '実線は観測範囲内の単回帰直線です。' : ''}</desc>
          <defs><clipPath id={`${id}-clip`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
          {ticks(yAxis).map(tick => <g key={`y:${tick}`}>
            <line className="skill-dps-chart-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
            <text className="skill-dps-chart-tick" x={left - 9} y={y(tick)} dy=".35em" textAnchor="end">{formatTick(tick)}</text>
          </g>)}
          {ticks(xAxis).map(tick => <g key={`x:${tick}`}>
            <line className="skill-dps-chart-axis" x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
            <text className="skill-dps-chart-tick" x={x(tick)} y={bottom + 22} textAnchor="middle">{formatTick(tick)}</text>
          </g>)}
          <line className="skill-dps-chart-axis" x1={left} x2={left} y1={top} y2={bottom} />
          <line className="skill-dps-chart-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
          {values.map(point => <circle className="skill-dps-chart-point" key={point.id} cx={x(point.x)} cy={y(point.y)} r={4} />)}
          {fitEnds && <g clipPath={`url(#${id}-clip)`}><line className="skill-dps-chart-fit"
            x1={x(fitEnds.min)} x2={x(fitEnds.max)} y1={y(fitEnds.first)} y2={y(fitEnds.last)} /></g>}
          <text className="skill-dps-chart-label" x={left} y={14}>{yLabel}</text>
          {!forImage && <text className="skill-dps-chart-label" x={(left + right) / 2} y={height - 7} textAnchor="middle">{xLabel}</text>}
        </svg>
        {!forImage && <div className="skill-dps-chart-legend" aria-label="凡例">
          <span><i className="skill-dps-chart-point-key" aria-hidden="true" />スキル</span>
          {fitEnds && <span><i className="skill-dps-chart-fit-key" aria-hidden="true" />単回帰</span>}
        </div>}
      </>}
  </div>
}
