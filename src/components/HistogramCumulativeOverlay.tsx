import { useState, type KeyboardEvent } from 'react'
import type { HistogramBin } from '../lib/enemyStatistics'
import type { EnemyRatingHistogramBin } from '../lib/enemyRatingHistogram'
import { buildHistogramCumulativeRows, getHistogramCumulativePoints } from '../lib/histogramCumulative'
import { formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import './HistogramCumulativeOverlay.css'

type CumulativeBin = HistogramBin | EnemyRatingHistogramBin

export interface HistogramCumulativeOverlayProps {
  bins: readonly CumulativeBin[]
  total: number
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
  /** Export the same line and points without transient interactive readouts. */
  image?: boolean
  formatBoundary?: (value: number) => string
  countUnit?: string
}

const number = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })
const formatCumulativePercentage = (proportion: number) => formatHistogramPercentage(proportion, 1)?.replace(/\.0%$/, '%') ?? '—'
const ticks = [0, 0.25, 0.5, 0.75, 1] as const

/** Display each whole-bin cumulative proportion at its equal-width bar's center. */
export function HistogramCumulativeOverlay({ bins, total, plotLeft, plotRight, plotTop, plotBottom,
  image = false, formatBoundary = value => number.format(value), countUnit = '体' }: HistogramCumulativeOverlayProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const rows = buildHistogramCumulativeRows(bins, total)
  const points = getHistogramCumulativePoints(rows, { plotLeft, plotRight, plotTop, plotBottom })
  if (!points.length || rows.some(row => row.cumulativeCount === null)) return null

  const x = (index: number) => points[index].x
  const y = (value: number) => plotBottom - value * (plotBottom - plotTop)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const boundaryLabel = (bin: CumulativeBin) => {
    if ('rating' in bin) return `評価${bin.rating}まで`
    if (bin.isOverflow) return `全階級（${formatBoundary(bin.start)}超を含む）`
    return `${formatBoundary(bin.end)}${bin.includesMaximum ? '以下' : '未満まで'}`
  }
  const description = (index: number) => {
    const row = rows[index]
    return `${boundaryLabel(row.bin)}：累積${number.format(row.cumulativeCount!)}${countUnit}（${formatCumulativePercentage(row.cumulativeProportion!)}）`
  }
  const selectedIndex = activeIndex === null ? null : Math.max(0, Math.min(rows.length - 1, activeIndex))
  const selected = selectedIndex === null ? null : rows[selectedIndex]
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    const current = selectedIndex ?? 0
    const next = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, current - 1)
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(rows.length - 1, current + 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null
    if (next !== null) {
      event.preventDefault()
      setActiveIndex(next)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setPinnedIndex(null)
      setActiveIndex(null)
    }
  }
  const tooltipLines = selected ? [boundaryLabel(selected.bin),
    `累積${number.format(selected.cumulativeCount!)}${countUnit}（${formatCumulativePercentage(selected.cumulativeProportion!)}）`] : []
  const tooltipWidth = Math.min(plotRight - plotLeft - 8,
    Math.max(...tooltipLines.map(line => [...line].reduce((width, char) => width + (/[\u0020-\u007e]/.test(char) ? 6.5 : 11), 0)), 88) + 16)
  const tooltipX = selectedIndex === null ? 0 : Math.max(plotLeft + 4, Math.min(plotRight - tooltipWidth - 4, x(selectedIndex) - tooltipWidth / 2))
  const tooltipY = selectedIndex === null ? 0 : Math.max(plotTop + 4, Math.min(plotBottom - 45, y(selected!.cumulativeProportion!) - 50))
  const axisLabelX = plotRight + 54
  const axisLabelY = (plotTop + plotBottom) / 2

  return <g className="enemy-histogram-cumulative" data-histogram-cumulative="true">
    <g className="enemy-histogram-cumulative-axis" aria-hidden="true">
      <line className="enemy-chart-axis-tick" x1={plotRight} x2={plotRight} y1={plotTop} y2={plotBottom} />
      {ticks.map(tick => <g key={tick}>
        <line className="enemy-chart-axis-tick" x1={plotRight} x2={plotRight + 5} y1={y(tick)} y2={y(tick)} />
        <text className="enemy-chart-tick" x={plotRight + 9} y={y(tick) + 4}>{Math.round(tick * 100)}%</text>
      </g>)}
      <text className="enemy-chart-axis-title enemy-histogram-cumulative-axis-title" x={axisLabelX} y={axisLabelY}
        textAnchor="middle" transform={`rotate(-90 ${axisLabelX} ${axisLabelY})`}>累積割合</text>
    </g>
    {points.length > 1 && <path className="enemy-histogram-cumulative-line" data-chart-image-ink="" d={path} aria-hidden="true" />}
    <g className="enemy-histogram-cumulative-points" tabIndex={image ? undefined : 0}
      role={image ? undefined : 'slider'} aria-label={image ? undefined : '累積割合の確認。左右キーで階級を移動'}
      aria-valuemin={image ? undefined : 1} aria-valuemax={image ? undefined : rows.length}
      aria-valuenow={image ? undefined : (selectedIndex ?? 0) + 1}
      aria-valuetext={image ? undefined : description(selectedIndex ?? 0)}
      onFocus={image ? undefined : () => { setFocused(true); setActiveIndex(index => index ?? 0) }}
      onBlur={image ? undefined : () => { setFocused(false); if (pinnedIndex === null) setActiveIndex(null) }}
      onKeyDown={image ? undefined : handleKeyDown}
      onPointerLeave={image ? undefined : () => {
        if (!focused) setActiveIndex(pinnedIndex)
      }}>
      {rows.map((row, index) => <g key={index} data-cumulative-index={index}
        data-cumulative-count={row.cumulativeCount!} data-cumulative-proportion={row.cumulativeProportion!}
        onPointerEnter={image ? undefined : () => setActiveIndex(index)}
        onClick={image ? undefined : () => {
          if (pinnedIndex === index) { setPinnedIndex(null); if (!focused) setActiveIndex(null) }
          else { setActiveIndex(index); setPinnedIndex(index) }
        }}>
        <title>{description(index)}</title>
        {!image && <circle className="enemy-histogram-cumulative-hit-area" cx={x(index)} cy={points[index].y} r={11} />}
        <circle className="enemy-histogram-cumulative-point" data-chart-image-ink="" cx={x(index)} cy={points[index].y}
          r={!image && selectedIndex === index ? 4.5 : 2.75} />
      </g>)}
    </g>
    {!image && selected && <g className="enemy-histogram-cumulative-tooltip" role="status" aria-live="polite" pointerEvents="none"
      transform={`translate(${tooltipX} ${tooltipY})`}>
      <rect width={tooltipWidth} height={43} rx={2} />
      <text x={8} y={16}>{tooltipLines[0]}<tspan x={8} dy={16}>{tooltipLines[1]}</tspan></text>
    </g>}
  </g>
}
