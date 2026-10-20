import type { HistogramBin } from '../lib/enemyStatistics'
import type { EnemyRatingHistogramBin } from '../lib/enemyRatingHistogram'
import { buildHistogramCumulativeRows } from '../lib/histogramCumulative'
import type { HistogramCumulativeStripLayout } from '../lib/histogramCumulativeStrip'
import { ChartStripCell } from './ChartStripCell'

export { getHistogramCumulativeStripLayout } from '../lib/histogramCumulativeStrip'
export type { HistogramCumulativeStripLayout } from '../lib/histogramCumulativeStrip'

type CumulativeBin = HistogramBin | EnemyRatingHistogramBin

export interface HistogramCumulativeStripProps {
  bins: readonly CumulativeBin[]
  total: number
  plotLeft: number
  plotRight: number
  /** Top of the complete title-and-strip region, before its reserved bottom gap. */
  top: number
  layout: HistogramCumulativeStripLayout
}

const number = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })

/** Whole-bin cumulative values aligned with the corresponding histogram bars. */
export function HistogramCumulativeStrip({ bins, total, plotLeft, plotRight, top, layout }: HistogramCumulativeStripProps) {
  const rows = buildHistogramCumulativeRows(bins, total)
  const width = plotRight - plotLeft
  if (!rows.length || rows.length !== layout.labels.length
    || ![plotLeft, plotRight, top, width].every(Number.isFinite) || width <= 0
    || rows.some(row => row.cumulativeProportion === null || row.cumulativeCount === null)) return null
  const bandTop = top + 18
  const cellWidth = width / rows.length
  const cellInset = Math.min(1.5, cellWidth * 0.2)
  const visibleIndices = new Set(layout.visibleIndices)
  const description = (bin: CumulativeBin, label: string) => {
    const boundary = 'rating' in bin ? `評価${bin.rating}まで`
      : bin.isOverflow ? `全階級（${number.format(bin.start)}超を含む）`
        : `${number.format(bin.end)}${bin.includesMaximum ? '以下' : '未満まで'}`
    return `${boundary}：累積${label}%`
  }

  return <g className="enemy-histogram-cumulative-strip" data-histogram-cumulative="strip" role="group" aria-label="累積割合（%）">
    <text className="chart-strip-title" data-chart-image-ink="true" x={plotRight} y={top + 10}
      textAnchor="end">累積割合（%）</text>
    {rows.map((row, index) => <g key={index} data-cumulative-index={index}
      data-cumulative-count={row.cumulativeCount!} data-cumulative-proportion={row.cumulativeProportion!}
      role="img" aria-label={description(row.bin, layout.labels[index])}>
      <ChartStripCell left={plotLeft + index * cellWidth} width={cellWidth} top={bandTop}
        height={layout.bandHeight} leftInset={index > 0 ? cellInset : 0}
        rightInset={index < rows.length - 1 ? cellInset : 0}
        label={layout.labels[index]} showLabel={visibleIndices.has(index)} labelRotation={layout.labelRotation}
        labelY={layout.labelRotation ? bandTop + layout.bandHeight / 2 : bandTop + 16} />
    </g>)}
  </g>
}