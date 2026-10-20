import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { SkillKMeansResult } from '../lib/skillKMeans'
import './SkillKMeansLearningChart.css'

interface Props {
  results: readonly [SkillKMeansResult, SkillKMeansResult]
  status?: ReactNode
}

const SERIES = ['A', 'B'] as const
const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 })

function formatDistance(value: number): string {
  return value > 0 && value < 0.0001 ? value.toExponential(2) : numberFormat.format(value)
}

/** Compare recorded iterations only: an ended experiment has no later samples. */
export function SkillKMeansLearningChart({ results, status }: Props) {
  const headingId = useId()
  const clipId = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [iteration, setIteration] = useState<number | 'latest'>('latest')
  const [visible, setVisible] = useState<readonly [boolean, boolean]>([true, true])

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

  const histories = useMemo(() => results.map(result => [...new Map(result.history
    .filter(point => Number.isSafeInteger(point.iteration) && point.iteration >= 0
      && Number.isFinite(point.meanSquaredDistance) && point.meanSquaredDistance >= 0)
    .map(point => [point.iteration, point])).values()]
    .sort((left, right) => left.iteration - right.iteration)), [results])
  const iterations = useMemo(() => [...new Set(histories.flatMap(history => history.map(point => point.iteration)))].sort((a, b) => a - b), [histories])
  const selectedIteration = iteration === 'latest' || iterations.includes(iteration) ? iteration : 'latest'
  useEffect(() => {
    if (iteration !== selectedIteration) setIteration(selectedIteration)
  }, [iteration, selectedIteration])

  const axis = useMemo(() => getHpChartValueAxis(histories.flatMap(history => history.map(point => point.meanSquaredDistance)), {
    mode: 'auto', nonNegative: true,
  }), [histories])
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
  const anyVisible = visible.some(Boolean)
  const shownIterations = iterations.filter(value => histories.some((history, index) => visible[index] && history.some(point => point.iteration === value)))
  const samples = histories.map(history => selectedIteration === 'latest' ? history.at(-1) : history.find(point => point.iteration === selectedIteration))
  const comparisonRows: readonly { label: string; value: (index: number) => ReactNode }[] = [
    { label: 'クラスタ数 K', value: index => results[index].config.k },
    { label: '乱数 seed', value: index => results[index].config.seed },
    { label: '反復回数', value: index => {
      if (!visible[index]) return '非表示'
      const point = samples[index]
      if (point) return `${point.iteration}回`
      const last = histories[index].at(-1)
      return last && selectedIteration !== 'latest' && selectedIteration > last.iteration
        ? `${last.iteration}回${results[index].stopReason ? 'で終了' : 'まで'}`
        : '—'
    } },
    { label: '平均二乗距離', value: index => !visible[index] ? '非表示' : samples[index] ? formatDistance(samples[index].meanSquaredDistance) : '—' },
    { label: '所属変更', value: index => !visible[index] ? '非表示' : !samples[index] ? '—' : samples[index].changes === null ? '初期化' : `${samples[index].changes}件` },
  ]

  const selectFromChart = (event: MouseEvent<SVGSVGElement>) => {
    if (!shownIterations.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX = (event.clientX - bounds.left) / bounds.width * width
    const pointerY = (event.clientY - bounds.top) / bounds.height * height
    if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) return
    setIteration(shownIterations.reduce((nearest, candidate) => Math.abs(x(candidate) - pointerX) < Math.abs(x(nearest) - pointerX) ? candidate : nearest))
  }

  return <figure className="skill-kmeans-learning-chart" aria-labelledby={headingId}>
    <figcaption>
      <strong id={headingId}>学習曲線</strong>
      <div className="skill-kmeans-learning-legend" aria-label="グラフに表示する実験">
        {SERIES.map((series, index) => <button key={series} type="button" aria-pressed={visible[index]}
          className={`skill-kmeans-learning-legend-button series-${series.toLowerCase()}`}
          onClick={() => setVisible(current => index === 0 ? [!current[0], current[1]] : [current[0], !current[1]])}>
          <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
            <line className="skill-kmeans-learning-line" x1="1" x2="25" y1="7" y2="7" />
            {index === 0 ? <circle className="skill-kmeans-learning-point" cx="13" cy="7" r="3" />
              : <rect className="skill-kmeans-learning-point" x="10" y="4" width="6" height="6" />}
          </svg>
          実験 {series}
        </button>)}
      </div>
    </figcaption>
    <div ref={frameRef} className="skill-kmeans-learning-chart-frame">
      <svg className="skill-kmeans-learning-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        role="img" aria-label="学習曲線。横軸は反復回数（回）、縦軸は平均二乗距離。実験Aは実線と丸、実験Bは破線と四角。"
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
        {selectedIteration !== 'latest' && anyVisible && <line className="skill-kmeans-learning-guide"
          x1={x(selectedIteration)} x2={x(selectedIteration)} y1={top} y2={bottom} />}
        <g clipPath={`url(#${clipId})`}>
          {histories.map((history, index) => visible[index] && <g key={SERIES[index]} className={`series-${SERIES[index].toLowerCase()}`}>
            <path className="skill-kmeans-learning-line" d={history.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${x(point.iteration)},${y(point.meanSquaredDistance)}`).join(' ')} />
            {history.map(point => {
              const selected = point.iteration === (selectedIteration === 'latest' ? history.at(-1)?.iteration : selectedIteration)
              const className = `skill-kmeans-learning-point${selected ? ' selected' : ''}`
              const radius = selected ? 4 : 2.6
              return index === 0 ? <circle key={point.iteration} className={className} cx={x(point.iteration)} cy={y(point.meanSquaredDistance)} r={radius} />
                : <rect key={point.iteration} className={className} x={x(point.iteration) - radius} y={y(point.meanSquaredDistance) - radius} width={radius * 2} height={radius * 2} />
            })}
          </g>)}
        </g>
        {(!iterations.length || !anyVisible) && <text className="skill-kmeans-learning-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">
          {!iterations.length ? '未学習' : '非表示'}
        </text>}
      </svg>
    </div>
    <div className="skill-kmeans-learning-controls">
      <label><span>反復</span><select aria-label="数値を確認する反復" value={selectedIteration}
        onChange={event => setIteration(event.target.value === 'latest' ? 'latest' : Number(event.target.value))}>
        <option value="latest">各実験の最新</option>
        {iterations.map(value => <option key={value} value={value}>{value === 0 ? '0回（初期化）' : `${value}回`}</option>)}
      </select></label>
      {status}
    </div>
    <table className="skill-kmeans-table skill-kmeans-comparison-table" aria-label="学習曲線の数値" aria-live="polite" aria-atomic="true">
      <thead><tr><th scope="col">項目</th>{SERIES.map(series => <th scope="col" key={series}>実験 {series}</th>)}</tr></thead>
      <tbody>{comparisonRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>
        {SERIES.map((series, index) => <td key={series}>{row.value(index)}</td>)}
      </tr>)}</tbody>
    </table>
  </figure>
}
