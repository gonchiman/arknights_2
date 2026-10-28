import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { SkillKMeansSearchCandidate } from '../lib/skillKMeansSearch'
import './SkillKMeansSearchChart.css'

interface Props {
  candidates: SkillKMeansSearchCandidate[]
  metric: 'silhouette' | 'meanSquaredDistance'
  selectedK: number | null
  candidateK: number | null
  onSelect: (k: number) => void
}

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 })

function formatValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value !== 0 && Math.abs(value) < 0.0001 ? value.toExponential(2) : numberFormat.format(value)
}

export function SkillKMeansSearchChart({ candidates, metric, selectedK, candidateK, onSelect }: Props) {
  const headingId = useId()
  const clipId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(480)
  const [hoveredPoint, setHoveredPoint] = useState<{ k: number; value: number | null } | null>(null)
  const silhouette = metric === 'silhouette'
  const heading = silhouette ? 'シルエットスコア' : 'エルボー法'
  const valueLabel = silhouette ? 'シルエットスコア' : '平均二乗距離'

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let animationFrame: number | undefined
    let measuredWidth = 0
    const measure = () => {
      const measured = Math.floor(frame.getBoundingClientRect().width)
      // Hidden panels report zero. Width-only updates avoid observer height feedback.
      if (measured <= 0 || measured === measuredWidth) return
      measuredWidth = measured
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined
        setWidth(current => current === measured ? current : measured)
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => {
        window.removeEventListener('resize', measure)
        if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => {
      observer.disconnect()
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    }
  }, [])

  const points = useMemo(() => [...new Map(candidates
    .filter(candidate => Number.isSafeInteger(candidate.k) && candidate.k >= 2)
    .map(candidate => [candidate.k, candidate])).values()]
    .sort((left, right) => left.k - right.k)
    .map(candidate => {
      const value = candidate[metric]
      return {
        k: candidate.k,
        value: value !== null && Number.isFinite(value)
          && (silhouette ? value >= -1 && value <= 1 : value >= 0) ? value : null,
      }
    }), [candidates, metric, silhouette])
  const axis = useMemo(() => {
    const values = points.flatMap(point => point.value === null ? [] : [point.value])
    const fitted = getHpChartValueAxis(values, { mode: 'auto', nonNegative: !silhouette })
    if (!silhouette || fitted.lowerLimit >= -1 && fitted.upperLimit <= 1) return fitted
    return getHpChartValueAxis(values, {
      mode: 'manual',
      manualRange: { min: Math.max(-1, fitted.lowerLimit), max: Math.min(1, fitted.upperLimit) },
    })
  }, [points, silhouette])
  const tickFormat = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: Math.min(8, Math.max(0, -Math.floor(Math.log10(axis.valueStep)))),
  })
  const tickLabel = (value: number) => value !== 0 && Math.abs(value) < 0.00001 ? value.toExponential(1) : tickFormat.format(value)
  const yTicks = axis.yTicks.filter((_, index) => width >= 420 || axis.yTicks.length <= 5 || index % 2 === 0 || index === axis.yTicks.length - 1)
  const left = Math.max(58, Math.ceil(Math.max(...yTicks.map(value => tickLabel(value).length)) * 7.2 + 16))
  const right = Math.max(left + 1, width - 18)
  const height = 280
  const top = 34
  const bottom = height - 52
  const plotWidth = right - left
  const minK = points[0]?.k ?? 2
  const maxK = points.at(-1)?.k ?? 12
  const x = (k: number) => minK === maxK ? (left + right) / 2 : left + (k - minK) / (maxK - minK) * plotWidth
  const y = (value: number) => bottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * (bottom - top)
  const xTickCount = Math.max(2, Math.min(7, Math.floor(plotWidth / 38) + 1))
  const xTicks = minK === maxK ? [minK] : [...new Set(Array.from({ length: xTickCount }, (_, index) => Math.round(minK + index * (maxK - minK) / (xTickCount - 1))))]
  const selected = points.find(point => point.k === selectedK)
  const recommendation = points.find(point => point.k === candidateK && point.value !== null)
  const selectedLabel = selected?.value == null ? null : formatValue(selected.value)
  const selectedX = selected ? x(selected.k) : 0
  const selectedY = selected?.value == null ? 0 : y(selected.value)
  const labelHalfWidth = (selectedLabel?.length ?? 0) * 3.8 + 4
  const labelAnchor = selectedX - left < labelHalfWidth ? 'start' : right - selectedX < labelHalfWidth ? 'end' : 'middle'
  const labelX = labelAnchor === 'start' ? Math.max(left + 6, selectedX) : labelAnchor === 'end' ? Math.min(right - 6, selectedX) : selectedX
  const labelY = Math.max(top + 14, Math.min(bottom - 5, selectedY < top + 24 ? selectedY + 22 : selectedY - 12))
  let previousK: number | null = null
  const line = points.map(point => {
    if (point.value === null) {
      previousK = null
      return ''
    }
    const command = previousK !== null && point.k === previousK + 1 ? 'L' : 'M'
    previousK = point.k
    return `${command}${x(point.k)},${y(point.value)}`
  }).join(' ')

  const pointFromChart = (event: MouseEvent<SVGSVGElement>) => {
    if (!points.length) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    const pointerX = (event.clientX - bounds.left) / bounds.width * width
    const pointerY = (event.clientY - bounds.top) / bounds.height * height
    if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) return null
    return points.reduce((nearest, point) => Math.abs(x(point.k) - pointerX) < Math.abs(x(nearest.k) - pointerX) ? point : nearest)
  }
  const selectFromChart = (event: MouseEvent<SVGSVGElement>) => {
    const point = pointFromChart(event)
    if (point) onSelect(point.k)
  }

  return <figure className={`skill-kmeans-search-chart metric-${metric}`} aria-labelledby={headingId}>
    <figcaption>
      <h3 id={headingId}>{heading}</h3>
      {recommendation ? <button type="button" className="button secondary skill-kmeans-search-candidate"
        onClick={() => onSelect(recommendation.k)} aria-label={`${heading}の候補 K = ${recommendation.k}を選択`}>
        候補 K = {recommendation.k}
      </button> : <span className="skill-kmeans-search-no-candidate">判定なし</span>}
    </figcaption>
    <div ref={frameRef} className="skill-kmeans-search-chart-frame">
      <svg className="skill-kmeans-search-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label={`${heading}。横軸はクラスタ数 K、縦軸は${valueLabel}。`}
        onClick={selectFromChart}
        onPointerMove={event => setHoveredPoint(event.pointerType === 'touch' ? null : pointFromChart(event))}
        onPointerLeave={() => setHoveredPoint(null)} onPointerCancel={() => setHoveredPoint(null)}>
        <defs><clipPath id={clipId}><rect x={left - 5} y={top - 5} width={plotWidth + 10} height={bottom - top + 10} /></clipPath></defs>
        <text className="skill-kmeans-search-axis-title" x={left} y="18">{valueLabel}</text>
        {yTicks.map(tick => <g key={tick}>
          <line className="skill-kmeans-search-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="skill-kmeans-search-tick" x={left - 8} y={y(tick) + 4} textAnchor="end">{tickLabel(tick)}</text>
        </g>)}
        <rect className="skill-kmeans-search-axis" x={left} y={top} width={plotWidth} height={bottom - top} />
        {xTicks.map((tick, index) => <g key={tick}>
          <line className="skill-kmeans-search-axis" x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
          <text className="skill-kmeans-search-tick" x={x(tick)} y={bottom + 22}
            textAnchor={xTicks.length === 1 ? 'middle' : index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}>{tick}</text>
        </g>)}
        <text className="skill-kmeans-search-axis-title" x={(left + right) / 2} y={height - 7} textAnchor="middle">クラスタ数 K</text>
        {selected && <line className="skill-kmeans-search-guide" x1={x(selected.k)} x2={x(selected.k)} y1={top} y2={bottom} />}
        <g clipPath={`url(#${clipId})`}>
          <path className="skill-kmeans-search-line" d={line} />
          {points.map((point, index) => {
            if (point.value === null) return null
            const active = point.k === selectedK || point === hoveredPoint
            // An isolated value has no line segment, so retain a tiny dot for it.
            const isolated = !(points[index - 1]?.value != null && points[index - 1].k === point.k - 1)
              && !(points[index + 1]?.value != null && points[index + 1].k === point.k + 1)
            return <circle key={point.k}
              className={`skill-kmeans-search-point${point.k === selectedK ? ' selected' : ''}${point === hoveredPoint ? ' hovered' : ''}${isolated ? ' isolated' : ''}`}
              cx={x(point.k)} cy={y(point.value)} r={point.k === selectedK ? 3.5 : active ? 3 : 1.5} />
          })}
        </g>
        {selectedLabel !== null && <text className="skill-kmeans-search-selected-value" x={labelX} y={labelY} textAnchor={labelAnchor}
          aria-label={`選択 K = ${selectedK}、${valueLabel} ${selectedLabel}`}>{selectedLabel}</text>}
        {!points.some(point => point.value !== null) && <text className="skill-kmeans-search-empty"
          x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">{points.length ? '算出不可' : '未探索'}</text>}
      </svg>
    </div>
  </figure>
}
