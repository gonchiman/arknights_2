import type { EnemyRatingHistogramBin } from '../lib/enemyRatingHistogram'
import { ChartStripCell, CHART_STRIP_CELL_HEIGHT } from './ChartStripCell'
import { HistogramBinRangeStrip, type HistogramBinRangeStripLayout } from './HistogramBinRangeStrip'

export const HISTOGRAM_RATING_STRIP_HEIGHT = CHART_STRIP_CELL_HEIGHT
export const HISTOGRAM_RATING_RANGE_GAP = 4

export interface HistogramRatingStripsProps {
  bins: readonly EnemyRatingHistogramBin[]
  rangeLayout: HistogramBinRangeStripLayout | null
  plotLeft: number
  plotRight: number
  top: number
}

/** Every game rating has a full slot; its optional compact range occupies the band below it. */
export function HistogramRatingStrips({ bins, rangeLayout, plotLeft, plotRight, top }: HistogramRatingStripsProps) {
  const width = plotRight - plotLeft
  if (!bins.length || ![plotLeft, plotRight, top, width].every(Number.isFinite) || width <= 0) return null
  const cellWidth = width / bins.length
  const inset = Math.min(1.5, cellWidth * 0.2)

  return <g data-histogram-rating-strips="bottom">
    <g data-histogram-evaluation-strip="bottom" role="group" aria-label="評価">
      <text className="chart-strip-title" data-chart-image-ink="true"
        x={plotLeft - 8} y={top + HISTOGRAM_RATING_STRIP_HEIGHT / 2 + 4} textAnchor="end">評価</text>
      {bins.map((bin, index) => <g key={bin.rating} data-rating-index={index} data-rating={bin.rating}
        role="img" aria-label={`${bin.rating}：${bin.label}`}>
        <ChartStripCell left={plotLeft + index * cellWidth} width={cellWidth} top={top}
          height={HISTOGRAM_RATING_STRIP_HEIGHT}
          leftInset={index > 0 ? inset : 0} rightInset={index < bins.length - 1 ? inset : 0}
          label={bin.rating} />
      </g>)}
    </g>
    {rangeLayout && rangeLayout.labels.length === bins.length && <HistogramBinRangeStrip
      layout={rangeLayout} plotLeft={plotLeft} plotRight={plotRight}
      top={top + HISTOGRAM_RATING_STRIP_HEIGHT + HISTOGRAM_RATING_RANGE_GAP} title="範囲" />}
  </g>
}
