import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { SkillKMeansResult } from '../lib/skillKMeans'
import './SkillKMeansLearningChart.css'

interface Props {
  result: SkillKMeansResult
  status?: ReactNode
}

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 })

function formatDistance(value: number): string {
  return value > 0 && value < 0.0001 ? value.toExponential(2) : numberFormat.format(value)
}

/** Only recorded iterations are selectable, including the initial assignment. */
export function SkillKMeansLearningChart({ result, status }: Props) {
  const headingId = useId()
  const clipId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [iteration, setIteration] = useState<number | 'latest'>('latest')

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let animationFrame: number | undefined
    let measuredWidth = 0
    const measure = () => {
      const measured = Math.floor(frame.getBoundingClientRect().width)
      // A hidden tab reports zero; keep its last layout until it is shown again.
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

  const history = useMemo(() => [...new Map(result.history
    .filter(point => Number.isSafeInteger(point.iteration) && point.iteration >= 0
      && Number.isFinite(point.meanSquaredDistance) && point.meanSquaredDistance >= 0)
    .map(point => [point.iteration, point])).values()]
    .sort((left, right) => left.iteration - right.iteration), [result.history])
  const iterations = useMemo(() => history.map(point => point.iteration), [history])
  const selectedIteration = iteration === 'latest' || iterations.includes(iteration) ? iteration : 'latest'
  useEffect(() => {
    if (iteration !== selectedIteration) setIteration(selectedIteration)
  }, [iteration, selectedIteration])

  const axis = useMemo(() => getHpChartValueAxis(history.map(point => point.meanSquaredDistance), {
    mode: 'auto', nonNegative: true,
  }), [history])
  const tickFormat = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: Math.min(8, Math.max(0, -Math.floor(Math.log10(axis.valueStep)))),
  })
  const yTicks = axis.yTicks.filter((_, index) => width >= 420 || axis.yTicks.length <= 5 || index % 2 === 0 || index === axis.yTicks.length - 1)
  const tickLabel = (value: number) => value > 0 && value < 0.00001 ? value.toExponential(1) : tickFormat.format(value)
  const left = Math.max(64, Math.ceil(Math.max(...yTicks.map(value => tickLabel(value).length)) * 6.6 + 16))
  const right = Math.max(left + 1, width - 20)
  const top = 35
  const height = 280
  const bottom = height - 54
  const plotWidth = right - left
  const maxIteration = Math.max(1, ...iterations)
  const x = (value: number) => left + value / maxIteration * plotWidth
  const y = (value: number) => bottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * (bottom - top)
  const xTickCount = Math.max(2, Math.min(7, Math.floor(plotWidth / 65) + 1))
  const xTicks = [...new Set(Array.from({ length: xTickCount }, (_, index) => Math.round(index * maxIteration / (xTickCount - 1))))]
  const sample = selectedIteration === 'latest' ? history.at(-1) : history.find(point => point.iteration === selectedIteration)
  const endStatus = result.stopReason === 'max-iterations' ? '反復上限'
    : result.stopReason ? '収束' : null

  const selectFromChart = (event: MouseEvent<SVGSVGElement>) => {
    if (!iterations.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX = (event.clientX - bounds.left) / bounds.width * width
    const pointerY = (event.clientY - bounds.top) / bounds.height * height
    if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) return
    setIteration(iterations.reduce((nearest, candidate) => Math.abs(x(candidate) - pointerX) < Math.abs(x(nearest) - pointerX) ? candidate : nearest))
  }

  return <figure className="skill-kmeans-learning-chart" aria-labelledby={headingId}>
    <figcaption>
      <strong id={headingId}>学習曲線</strong>
    </figcaption>
    <div ref={frameRef} className="skill-kmeans-learning-chart-frame">
      <svg className="skill-kmeans-learning-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label="学習曲線。横軸は反復回数（回）、縦軸は平均二乗距離。"
        onClick={selectFromChart}>
        <defs><clipPath id={clipId}><rect x={left - 5} y={top - 5} width={plotWidth + 10} height={bottom - top + 10} /></clipPath></defs>
        <text className="skill-kmeans-learning-axis-title" x={left} y="19">平均二乗距離</text>
        {yTicks.map(tick => <g key={tick}>
          <line className="skill-kmeans-learning-grid" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="skill-kmeans-learning-tick" x={left - 8} y={y(tick) + 4} textAnchor="end">{tickLabel(tick)}</text>
        </g>)}
        <path className="skill-kmeans-learning-axis" d={`M${left},${top}V${bottom}H${right}`} />
        {xTicks.map((tick, index) => <g key={tick}>
          <line className="skill-kmeans-learning-axis" x1={x(tick)} x2={x(tick)} y1={bottom} y2={bottom + 5} />
          <text className="skill-kmeans-learning-tick" x={x(tick)} y={bottom + 22}
            textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}>{tick}</text>
        </g>)}
        <text className="skill-kmeans-learning-axis-title" x={(left + right) / 2} y={height - 9} textAnchor="middle">反復回数（回）</text>
        {selectedIteration !== 'latest' && <line className="skill-kmeans-learning-guide"
          x1={x(selectedIteration)} x2={x(selectedIteration)} y1={top} y2={bottom} />}
        <g clipPath={`url(#${clipId})`}>
          {history.length > 0 && <g>
            <path className="skill-kmeans-learning-line" d={history.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${x(point.iteration)},${y(point.meanSquaredDistance)}`).join(' ')} />
            {history.map(point => {
              const selected = point.iteration === (selectedIteration === 'latest' ? history.at(-1)?.iteration : selectedIteration)
              const className = `skill-kmeans-learning-point${selected ? ' selected' : ''}`
              const radius = selected ? 4 : 2.6
              return <circle key={point.iteration} className={className} cx={x(point.iteration)} cy={y(point.meanSquaredDistance)} r={radius} />
            })}
          </g>}
        </g>
        {!iterations.length && <text className="skill-kmeans-learning-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">
          未学習
        </text>}
      </svg>
    </div>
    <div className="skill-kmeans-learning-controls">
      <label><span>反復</span><select aria-label="数値を確認する反復" value={selectedIteration} disabled={!iterations.length}
        onChange={event => setIteration(event.target.value === 'latest' ? 'latest' : Number(event.target.value))}>
        <option value="latest">最新</option>
        {iterations.map(value => <option key={value} value={value}>{value === 0 ? '0回（初期化）' : `${value}回`}</option>)}
      </select></label>
      {status === undefined ? endStatus && <span className="skill-kmeans-stop-state">{endStatus}</span> : status}
    </div>
    <dl className="skill-kmeans-learning-metrics" aria-label="選択した反復の数値" aria-live="polite" aria-atomic="true">
      <div><dt>反復回数</dt><dd>{sample ? `${sample.iteration}回` : '—'}</dd></div>
      <div><dt>平均二乗距離</dt><dd>{sample ? formatDistance(sample.meanSquaredDistance) : '—'}</dd></div>
      <div><dt>所属変更</dt><dd>{!sample ? '—' : sample.changes === null ? '初期化' : `${sample.changes}件`}</dd></div>
    </dl>
  </figure>
}
