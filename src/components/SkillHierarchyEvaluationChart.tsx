import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { SkillHierarchyTree } from '../lib/skillHierarchical'
import './SkillHierarchyEvaluationChart.css'

interface Props {
  candidates: SkillHierarchyTree['autoCandidates']
  threshold: number
  recommendedThreshold: number
  selectedGroupCount?: number
  onSelect: (threshold: number) => void
}

const scoreFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 })
const countFormat = new Intl.NumberFormat('ja-JP')

/** Every achievable, evaluated partition is retained; pointer selection snaps to a real candidate. */
export function SkillHierarchyEvaluationChart({ candidates, threshold, recommendedThreshold, selectedGroupCount, onSelect }: Props) {
  const headingId = useId()
  const clipId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let animationFrame: number | undefined
    let measuredWidth = 0
    const measure = () => {
      const measured = Math.floor(frame.getBoundingClientRect().width)
      // Hidden tabs can report zero. Height changes must not schedule another resize.
      if (measured <= 0 || measured === measuredWidth) return
      measuredWidth = measured
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined
        setWidth(current => current === measured ? current : measured)
      })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(frame)
    if (!observer) window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    }
  }, [])

  const points = useMemo(() => [...candidates].sort((left, right) => left.groupCount - right.groupCount), [candidates])
  const selected = selectedGroupCount !== undefined
    ? points.find(point => point.groupCount === selectedGroupCount)
    : points.find(point => point.threshold <= threshold)
  const recommended = points.find(point => point.threshold === recommendedThreshold)
  const axis = useMemo(() => getHpChartValueAxis(points.map(point => point.silhouette), { mode: 'auto' }), [points])
  const tickFormat = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: Math.min(8, Math.max(0, -Math.floor(Math.log10(axis.valueStep)))),
  })
  const tickLabel = (value: number) => value !== 0 && Math.abs(value) < 0.00001 ? value.toExponential(1) : tickFormat.format(value)
  const yTicks = axis.yTicks.filter((_, index) => width >= 420 || axis.yTicks.length <= 5 || index % 2 === 0 || index === axis.yTicks.length - 1)
  const left = Math.max(56, Math.ceil(Math.max(...yTicks.map(value => tickLabel(value).length)) * 7.3 + 14))
  const right = Math.max(left + 1, width - 16)
  const height = 300
  const top = 36
  const bottom = height - 57
  const plotWidth = right - left
  const minGroups = points[0]?.groupCount ?? 0
  const maxGroups = points.at(-1)?.groupCount ?? 1
  const x = (value: number) => minGroups === maxGroups ? (left + right) / 2 : left + (value - minGroups) / (maxGroups - minGroups) * plotWidth
  const y = (value: number) => bottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * (bottom - top)
  const xTickCount = Math.max(2, Math.min(7, Math.floor(plotWidth / 70) + 1))
  const xTicks = points.length === 0 ? [] : minGroups === maxGroups ? [minGroups]
    : [...new Set(Array.from({ length: xTickCount }, (_, index) => Math.round(minGroups + index * (maxGroups - minGroups) / (xTickCount - 1))))]

  const selectFromChart = (event: MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX = (event.clientX - bounds.left) / bounds.width * width
    const pointerY = (event.clientY - bounds.top) / bounds.height * height
    if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) return
    const nearest = points.reduce((best, candidate) => Math.abs(x(candidate.groupCount) - pointerX) < Math.abs(x(best.groupCount) - pointerX) ? candidate : best)
    onSelect(nearest.threshold)
  }

  return <figure className="skill-hierarchy-evaluation-chart" aria-labelledby={headingId}>
    <figcaption>
      <strong id={headingId}>評価曲線</strong>
      <div className="skill-hierarchy-evaluation-values">
        <span className="skill-hierarchy-evaluation-value">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle className="hierarchy-evaluation-selected" cx="8" cy="8" r="4" /></svg>
          選択 <output>{selected ? `${countFormat.format(selected.groupCount)}分類 · ${scoreFormat.format(selected.silhouette)}` : '—'}</output>
        </span>
        <span className="skill-hierarchy-evaluation-value">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path className="hierarchy-evaluation-recommended" d="M8 1L15 8L8 15L1 8Z" /></svg>
          最高評価 <output>{recommended ? `${countFormat.format(recommended.groupCount)}分類 · ${scoreFormat.format(recommended.silhouette)}` : '—'}</output>
        </span>
      </div>
    </figcaption>
    <div ref={frameRef} className="skill-hierarchy-evaluation-frame">
      <svg className="skill-hierarchy-evaluation-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label={`評価曲線。横軸は分類数、縦軸はシルエット係数。${points.length}候補。${selected ? `選択は${selected.groupCount}分類、${scoreFormat.format(selected.silhouette)}。` : ''}${recommended ? `最高評価は${recommended.groupCount}分類、${scoreFormat.format(recommended.silhouette)}。` : ''}`}
        onClick={selectFromChart}>
        <defs><clipPath id={clipId}><rect x={left - 8} y={top - 8} width={plotWidth + 16} height={bottom - top + 16} /></clipPath></defs>
        <text className="hierarchy-evaluation-axis-title" x={left} y="19">シルエット係数</text>
        {yTicks.map(tick => <g key={tick}>
          <line className="hierarchy-evaluation-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="hierarchy-evaluation-tick" x={left - 8} y={y(tick) + 4} textAnchor="end">{tickLabel(tick)}</text>
        </g>)}
        <path className="hierarchy-evaluation-axis" d={`M${left},${top}V${bottom}H${right}`} />
        {xTicks.map((tick, index) => <g key={tick}>
          <line className="hierarchy-evaluation-axis" x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
          <text className="hierarchy-evaluation-tick" x={x(tick)} y={bottom + 23}
            textAnchor={xTicks.length === 1 ? 'middle' : index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}>{countFormat.format(tick)}</text>
        </g>)}
        <text className="hierarchy-evaluation-axis-title" x={(left + right) / 2} y={height - 8} textAnchor="middle">分類数</text>
        {selected && <line className="hierarchy-evaluation-guide" x1={x(selected.groupCount)} x2={x(selected.groupCount)} y1={top} y2={bottom} />}
        <g clipPath={`url(#${clipId})`}>
          <path className="hierarchy-evaluation-line" d={points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.groupCount)},${y(point.silhouette)}`).join(' ')} />
          {points.map(point => <circle key={point.threshold} className="hierarchy-evaluation-point" cx={x(point.groupCount)} cy={y(point.silhouette)} r={1.4} />)}
          {recommended && <path className="hierarchy-evaluation-recommended"
            d={`M${x(recommended.groupCount)},${y(recommended.silhouette) - 7}l7,7l-7,7l-7,-7Z`} />}
          {selected && <circle className="hierarchy-evaluation-selected" cx={x(selected.groupCount)} cy={y(selected.silhouette)} r={4} />}
        </g>
        {points.length === 0 && <text className="hierarchy-evaluation-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">評価できる候補なし</text>}
      </svg>
    </div>
  </figure>
}
