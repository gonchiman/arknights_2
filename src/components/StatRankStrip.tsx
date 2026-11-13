import type { StatRankBand } from '../lib/statRankBands'
import { ChartStripCell, CHART_STRIP_CELL_HEIGHT } from './ChartStripCell'
import './StatRankStrip.css'

export const STAT_RANK_STRIP_HEIGHT = CHART_STRIP_CELL_HEIGHT

export interface StatRankStripProps {
  bands: readonly StatRankBand[]
  left: number
  right: number
  /** Callers reserve an extra row above the strip for endpoint labels. */
  top: number
  height?: number
  title?: string
  /** When omitted, the title is available in band tooltips only. */
  titleY?: number
  /** Preserve the label fitting used by existing chart consumers. */
  labelFit?: 'fill' | 'band'
}

export function StatRankStrip({
  bands, left, right, top, height = STAT_RANK_STRIP_HEIGHT, title = 'HPランク', titleY, labelFit = 'fill',
}: StatRankStripProps) {
  if (!bands.length) return null
  const width = Math.max(0, right - left)
  const intervals = bands.filter((band) => band.pointValue === undefined)
  const endpoints = bands.filter((band) => band.pointValue !== undefined)

  return <g className="stat-rank-strip">
    {titleY !== undefined && <text className="stat-rank-strip-title" data-chart-image-ink="true"
      x={right} y={titleY} textAnchor="end">{title}</text>}
    {intervals.map((band, index) => {
      const bandLeft = left + band.start * width
      const bandWidth = (band.end - band.start) * width
      const leftInset = index > 0 ? 1.5 : 0
      const rightInset = index < intervals.length - 1 ? 1.5 : 0
      const fillWidth = Math.max(0, bandWidth - leftInset - rightInset)
      const labelThreshold = band.rating.length * 7 + 6
      const showLabel = labelFit === 'band' ? bandWidth > labelThreshold : fillWidth >= labelThreshold
      return <g key={`${band.rating}-${band.start}`} className="stat-rank-strip-band" data-rank={band.rating}>
        <title>{`${title} ${band.rating}：${band.label}`}</title>
        <ChartStripCell left={bandLeft} width={bandWidth} top={top} label={band.rating}
          leftInset={leftInset} rightInset={rightInset} height={height} labelY={top + height / 2 + 4} showLabel={showLabel}
          fillClassName="stat-rank-strip-fill" labelClassName="stat-rank-strip-label" />
      </g>
    })}
    {endpoints.map((band) => {
      const x = left + band.start * width
      return <g key={`${band.rating}-${band.start}`} className="stat-rank-strip-point" data-rank={band.rating}
        data-rank-point={band.pointValue}>
        <title>{`${title} ${band.rating}：${band.label}`}</title>
        <line className="stat-rank-strip-point-line" data-chart-image-ink="true"
          x1={x} x2={x} y1={top - 2} y2={top + height} />
        <text className="stat-rank-strip-label" data-chart-image-ink="true"
          x={x + 3} y={top - 5} textAnchor="start">{`${band.rating}·${band.pointValue}`}</text>
      </g>
    })}
  </g>
}
