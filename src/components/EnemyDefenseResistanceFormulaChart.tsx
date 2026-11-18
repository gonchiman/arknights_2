import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { CorrespondenceModel, CorrespondencePoint } from '../lib/enemyDefenseResistanceFormula'
import './EnemyDefenseResistanceFormulaChart.css'

interface Props {
  points: readonly CorrespondencePoint[]
  model: CorrespondenceModel | null
  probe: number | null
}

interface CurvePoint {
  x: number
  y: number
}

const HEIGHT = 290
const numberFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const compactFormatter = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })

function formatTick(value: number): string {
  return Math.abs(value) >= 10_000 ? compactFormatter.format(value) : numberFormatter.format(value)
}

function curvePath(points: readonly CurvePoint[], x: (value: number) => number, y: (value: number) => number): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.x)} ${y(point.y)}`).join(' ')
}

function stepPath(points: readonly CurvePoint[], x: (value: number) => number, y: (value: number) => number): string {
  if (points.length === 0) return ''
  return `M ${x(points[0].x)} ${y(points[0].y)}` + points.slice(1)
    .map(point => ` H ${x(point.x)} V ${y(point.y)}`).join('')
}

function sampleModel(model: CorrespondenceModel | null): CurvePoint[] {
  if (!model) return []
  const [minimum, maximum] = model.domain
  const coordinates = model.method === 'piecewise'
    ? [...new Set(model.segments.flatMap(segment => [segment.from, segment.to]))]
    : maximum === minimum ? [minimum]
      : Array.from({ length: 361 }, (_, index) => minimum + (maximum - minimum) * index / 360)
  return coordinates.flatMap(x => {
    const value = model.predict(x)
    return value === null || !Number.isFinite(value) ? [] : [{ x, y: value }]
  })
}

export function EnemyDefenseResistanceFormulaChart({ points, model, probe }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const measuredWidth = Math.floor(container.clientWidth)
      if (measuredWidth > 0) setWidth(previous => previous === measuredWidth ? previous : measuredWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const finitePoints = useMemo(() => points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)), [points])
  const samples = useMemo(() => sampleModel(model), [model])
  const probeValue = probe === null ? null : model?.predict(probe) ?? null
  const yAxis = useMemo(() => getHpChartValueAxis([
    ...finitePoints.map(point => point.y),
    ...samples.map(point => point.y),
    ...(probeValue !== null && Number.isFinite(probeValue) ? [probeValue] : []),
  ]), [finitePoints, samples, probeValue])
  const minimumX = finitePoints[0]?.x ?? 0
  const maximumX = finitePoints.at(-1)?.x ?? 1
  const constantX = minimumX === maximumX
  const xStart = constantX ? minimumX - 1 : minimumX
  const xEnd = constantX ? maximumX + 1 : maximumX
  const left = width < 430 ? 58 : 68
  const right = Math.max(left + 1, width - 20)
  const top = 28
  const bottom = HEIGHT - 50
  const x = (value: number) => left + (value - xStart) / (xEnd - xStart) * (right - left)
  const y = (value: number) => bottom - (value - yAxis.lowerLimit) / (yAxis.upperLimit - yAxis.lowerLimit) * (bottom - top)
  const xTickCount = width < 430 ? 3 : 6
  const xTicks = constantX ? [minimumX] : Array.from({ length: xTickCount + 1 }, (_, index) => minimumX + (maximumX - minimumX) * index / xTickCount)
  const referencePath = stepPath(finitePoints, x, y)
  const modelPath = model?.method === 'exact' ? referencePath : curvePath(samples, x, y)
  const activeProbe = probe !== null && Number.isFinite(probe) && probe >= minimumX && probe <= maximumX
  const hasProbeValue = probeValue !== null && Number.isFinite(probeValue)

  return <div className="enemy-defense-resistance-formula-chart" ref={containerRef}>
    {finitePoints.length === 0 ? <p className="enemy-formula-chart-empty" role="status">対応する数値データがありません。</p> : <svg className="enemy-formula-chart-svg" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img" aria-labelledby={titleId} aria-describedby={descriptionId} focusable="false">
      <title id={titleId}>術耐性と対応する防御力</title>
      <desc id={descriptionId}>横軸は術耐性、縦軸は対応する防御力。灰色の階段線は累積割合による対応、青色の線は選択した方法の式です。</desc>
      {yAxis.yTicks.map(tick => <g key={`y:${tick}`}>
        <line className={tick === 0 ? 'enemy-formula-chart-zero' : 'enemy-formula-chart-grid'}
          x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text className="enemy-formula-chart-tick" x={left - 8} y={y(tick)} dy=".35em" textAnchor="end">{formatTick(tick)}</text>
      </g>)}
      {xTicks.map(tick => <g key={`x:${tick}`}>
        <line className="enemy-formula-chart-tick-line" x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
        <text className="enemy-formula-chart-tick" x={x(tick)} y={bottom + 22} textAnchor="middle">{formatTick(tick)}</text>
      </g>)}
      <line className="enemy-formula-chart-zero" x1={left} x2={left} y1={top} y2={bottom} />
      <path className="enemy-formula-chart-reference" d={referencePath} fill="none" />
      {finitePoints.length === 1 && <circle className="enemy-formula-chart-reference-point" cx={x(minimumX)} cy={y(finitePoints[0].y)} r={3} />}
      {model && <path className="enemy-formula-chart-model" d={modelPath} fill="none" />}
      {samples.length === 1 && model && <circle className="enemy-formula-chart-model-point" cx={x(samples[0].x)} cy={y(samples[0].y)} r={3.5} />}
      {activeProbe && <line className="enemy-formula-chart-probe" x1={x(probe)} x2={x(probe)} y1={top} y2={bottom} />}
      {activeProbe && hasProbeValue && <circle className="enemy-formula-chart-model-point" cx={x(probe)} cy={y(probeValue)} r={4} />}
      <text className="enemy-formula-chart-axis-title" x={left} y={13}>対応する防御力 Y</text>
      <text className="enemy-formula-chart-axis-title" x={(left + right) / 2} y={HEIGHT - 8} textAnchor="middle">術耐性 X</text>
    </svg>}
  </div>
}
