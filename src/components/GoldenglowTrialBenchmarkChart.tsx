import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import './GoldenglowTrialBenchmarkChart.css'

export type BenchmarkChartPoint = {
  trials: number
  medianMs: number
  minMs: number
  maxMs: number
}

interface GoldenglowTrialBenchmarkChartProps {
  points: readonly BenchmarkChartPoint[]
  trialCounts: readonly number[]
  thresholdSeconds: number
  selectedTrials: number | null
  onSelectTrials: (trials: number) => void
}

const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const secondsFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const compactFormat = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const factor = value / power
  return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * power
}

export function GoldenglowTrialBenchmarkChart({
  points, trialCounts, thresholdSeconds, selectedTrials, onSelectTrials,
}: GoldenglowTrialBenchmarkChartProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const titleId = useId()
  const descriptionId = useId()
  const clipId = useId()

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const nextWidth = Math.round(frame.getBoundingClientRect().width)
      if (nextWidth > 0) setWidth(nextWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const chartPoints = useMemo(() => [...new Map(points.filter((point) => (
    Number.isFinite(point.trials) && point.trials > 0
    && Number.isFinite(point.minMs) && point.minMs >= 0
    && Number.isFinite(point.medianMs) && point.medianMs >= point.minMs
    && Number.isFinite(point.maxMs) && point.maxMs >= point.medianMs
  )).map((point) => [point.trials, point])).values()]
    .sort((left, right) => left.trials - right.trials), [points])
  const threshold = Number.isFinite(thresholdSeconds) && thresholdSeconds >= 0 ? thresholdSeconds : null
  const xLimit = Math.max(1, ...trialCounts.filter((trials) => Number.isFinite(trials) && trials > 0), ...chartPoints.map((point) => point.trials))
  const maximumSeconds = Math.max(threshold ?? 0, ...chartPoints.map((point) => point.maxMs / 1000))
  const yStep = niceStep(maximumSeconds * 1.08 / 4)
  const yLimit = Math.max(yStep, Math.ceil(maximumSeconds * 1.08 / yStep) * yStep)
  const yTicks = Array.from({ length: Math.round(yLimit / yStep) + 1 }, (_, index) => index * yStep)
  const tickFormat = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: Math.min(8, Math.max(0, -Math.floor(Math.log10(yStep)))),
  })
  const height = 320
  const margin = {
    left: Math.max(40, Math.ceil(Math.max(...yTicks.map((tick) => tickFormat.format(tick).length)) * 6.8 + 12)),
    right: 16,
    top: 36,
    bottom: 50,
  }
  const plotRight = Math.max(margin.left + 1, width - margin.right)
  const plotBottom = height - margin.bottom
  const plotWidth = plotRight - margin.left
  const plotHeight = plotBottom - margin.top
  const x = (trials: number) => margin.left + trials / xLimit * plotWidth
  const y = (seconds: number) => plotBottom - seconds / yLimit * plotHeight
  const compactTicks = integerFormat.format(xLimit).length * 6.8 > plotWidth / 3
  const formatTrialsTick = (trials: number) => compactTicks ? compactFormat.format(trials) : integerFormat.format(trials)
  const labelWidth = Math.max(formatTrialsTick(xLimit).length * 6.8, 30)
  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / Math.max(70, labelWidth * 1.5 + 12)) + 1))
  const xTicks = [...new Set(Array.from({ length: xTickCount }, (_, index) => (
    index === xTickCount - 1 ? xLimit : Math.round(index * xLimit / (xTickCount - 1))
  )))].sort((left, right) => left - right)
  const selection = chartPoints.find((point) => point.trials === selectedTrials)
  const path = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.trials)},${y(point.medianMs / 1000)}`).join(' ')

  const selectFromChart = (event: MouseEvent<SVGSVGElement>) => {
    if (!chartPoints.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX = (event.clientX - bounds.left) / bounds.width * width
    const pointerY = (event.clientY - bounds.top) / bounds.height * height
    if (pointerX < margin.left || pointerX > plotRight || pointerY < margin.top || pointerY > plotBottom) return
    const nearest = chartPoints.reduce((best, point) => (
      Math.abs(x(point.trials) - pointerX) < Math.abs(x(best.trials) - pointerX) ? point : best
    ))
    onSelectTrials(nearest.trials)
  }

  return (
    <figure className="gg-trial-benchmark-chart">
      <ul className="gg-trial-benchmark-chart-legend" aria-label="計算時間の凡例">
        <li>
          <svg width="24" height="14" aria-hidden="true">
            <line className="gg-trial-benchmark-chart-line" x1="0" x2="24" y1="7" y2="7" />
            <circle className="gg-trial-benchmark-chart-point" cx="12" cy="7" r="3" />
          </svg>
          <span>中央値</span>
        </li>
        <li>
          <svg width="24" height="14" aria-hidden="true">
            <path className="gg-trial-benchmark-chart-range" d="M7,2H17M12,2V12M7,12H17" />
          </svg>
          <span>最短〜最長</span>
        </li>
        {threshold !== null && <li>
          <svg width="24" height="14" aria-hidden="true">
            <line className="gg-trial-benchmark-chart-threshold" x1="0" x2="24" y1="7" y2="7" />
          </svg>
          <span>目安 {secondsFormat.format(threshold)} 秒</span>
        </li>}
      </ul>
      <div ref={frameRef} className="gg-trial-benchmark-chart-frame">
        <svg
          className={`gg-trial-benchmark-chart-svg${chartPoints.length ? ' gg-trial-benchmark-chart-svg--selectable' : ''}`}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          onClick={selectFromChart}
        >
          <title id={titleId}>試行回数と計算時間</title>
          <desc id={descriptionId}>
            横軸は1点・1装備あたりの試行回数、縦軸は計算時間（秒）。線は中央値、縦のひげは最短時間と最長時間です。
            {threshold !== null && `破線は目安の${secondsFormat.format(threshold)}秒です。`}
            {chartPoints.length ? `${chartPoints.length}件の計測結果があります。下の表から各試行回数を選択できます。` : 'まだ計測結果はありません。'}
          </desc>
          <defs>
            <clipPath id={clipId}>
              <rect x={margin.left - 6} y={margin.top - 6} width={plotWidth + 12} height={plotHeight + 12} />
            </clipPath>
          </defs>
          <text className="gg-trial-benchmark-chart-axis-title" x={margin.left} y="18">計算時間（秒）</text>
          {yTicks.map((tick, index) => <g key={index}>
            <line className="gg-trial-benchmark-chart-grid" x1={margin.left} x2={plotRight} y1={y(tick)} y2={y(tick)} />
            <text className="gg-trial-benchmark-chart-tick" x={margin.left - 8} y={y(tick) + 4} textAnchor="end">{tickFormat.format(tick)}</text>
          </g>)}
          <path className="gg-trial-benchmark-chart-axis" d={`M${margin.left},${margin.top}V${plotBottom}H${plotRight}`} />
          {xTicks.map((tick, index) => <g key={tick}>
            <line className="gg-trial-benchmark-chart-axis" x1={x(tick)} x2={x(tick)} y1={plotBottom} y2={plotBottom + 5} />
            <text className="gg-trial-benchmark-chart-tick" x={x(tick)} y={plotBottom + 21}
              textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}>
              {formatTrialsTick(tick)}
            </text>
          </g>)}
          <text className="gg-trial-benchmark-chart-axis-title" x={(margin.left + plotRight) / 2} y={height - 6} textAnchor="middle">試行回数 / 点・装備</text>
          {threshold !== null && <line className="gg-trial-benchmark-chart-threshold" x1={margin.left} x2={plotRight} y1={y(threshold)} y2={y(threshold)} />}
          {selection && <line className="gg-trial-benchmark-chart-guide" x1={x(selection.trials)} x2={x(selection.trials)} y1={margin.top} y2={plotBottom} />}
          <g clipPath={`url(#${clipId})`}>
            {chartPoints.map((point) => <path key={point.trials} className="gg-trial-benchmark-chart-range"
              d={`M${x(point.trials) - 5},${y(point.minMs / 1000)}H${x(point.trials) + 5}M${x(point.trials)},${y(point.minMs / 1000)}V${y(point.maxMs / 1000)}M${x(point.trials) - 5},${y(point.maxMs / 1000)}H${x(point.trials) + 5}`} />)}
            {path && <path className="gg-trial-benchmark-chart-line" d={path} />}
            {chartPoints.map((point) => <circle
              key={point.trials}
              className={`gg-trial-benchmark-chart-point${point.trials === selection?.trials ? ' gg-trial-benchmark-chart-point--selected' : ''}`}
              cx={x(point.trials)} cy={y(point.medianMs / 1000)} r={point.trials === selection?.trials ? 4.5 : 3}
            >
              <title>{`${integerFormat.format(point.trials)}回 / 点・装備：中央値 ${secondsFormat.format(point.medianMs / 1000)} 秒、最短 ${secondsFormat.format(point.minMs / 1000)} 秒、最長 ${secondsFormat.format(point.maxMs / 1000)} 秒`}</title>
            </circle>)}
          </g>
          {!chartPoints.length && <text className="gg-trial-benchmark-chart-empty" x={(margin.left + plotRight) / 2} y={(margin.top + plotBottom) / 2} textAnchor="middle">未計測</text>}
        </svg>
      </div>
    </figure>
  )
}
