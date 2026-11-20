import type { HistogramBin } from '../lib/enemyStatistics'
import type { EnemyRatingHistogramBin } from '../lib/enemyRatingHistogram'
import { buildHistogramCumulativeRows } from '../lib/histogramCumulative'
import type { HistogramCumulativeStripLayout } from '../lib/histogramCumulativeStrip'
import { ChartStripCell } from './ChartStripCell'

export { getHistogramCumulativeStripLayout, getHistogramPercentageStripLayout } from '../lib/histogramCumulativeStrip'
export type { HistogramCumulativeStripLayout, HistogramPercentageStripLayout } from '../lib/histogramCumulativeStrip'

type CumulativeBin = HistogramBin | EnemyRatingHistogramBin

export interface HistogramCumulativeStripProps {
  bins: readonly CumulativeBin[]
  total: number
  plotLeft: number
  plotRight: number
  /** Top of the strip, before its reserved bottom gap. */
  top: number
  layout: HistogramCumulativeStripLayout
}

export type HistogramPercentageStripProps = HistogramCumulativeStripProps

const number = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })

/** Whole-bin cumulative values aligned with the corresponding histogram bars. */
export function HistogramCumulativeStrip(props: HistogramCumulativeStripProps) {
  return <HistogramProportionStrip {...props} kind="cumulative" />
}

/** Per-bin percentages aligned with the corresponding frequency bars. */
export function HistogramPercentageStrip(props: HistogramPercentageStripProps) {
  return <HistogramProportionStrip {...props} kind="percentage" />
}

function HistogramProportionStrip({ bins, total, plotLeft, plotRight, top, layout, kind }:
  HistogramCumulativeStripProps & { kind: 'cumulative' | 'percentage' }) {
  const rows = buildHistogramCumulativeRows(bins, total)
  const width = plotRight - plotLeft
  if (!rows.length || rows.length !== layout.labels.length
    || ![plotLeft, plotRight, top, width].every(Number.isFinite) || width <= 0
    || rows.some(row => row.cumulativeProportion === null || row.cumulativeCount === null)) return null
  const bandTop = top
  const cellWidth = width / rows.length
  const cellInset = Math.min(1.5, cellWidth * 0.2)
  const visibleIndices = new Set(layout.visibleIndices)
  const title = kind === 'cumulative' ? '累積割合（%）' : '割合（%）'
  const description = (bin: CumulativeBin, label: string) => {
    if (kind === 'percentage') {
      const range = 'rating' in bin ? `評価${bin.rating}`
        : bin.isOverflow ? `${number.format(bin.start)}超`
          : `${number.format(bin.start)}以上${number.format(bin.end)}${bin.includesMaximum ? '以下' : '未満'}`
      return `${range}：割合${label}%`
    }
    const boundary = 'rating' in bin ? `評価${bin.rating}まで`
      : bin.isOverflow ? `全階級（${number.format(bin.start)}超を含む）`
        : `${number.format(bin.end)}${bin.includesMaximum ? '以下' : '未満まで'}`
    return `${boundary}：累積${label}%`
  }

  return <g className={`enemy-histogram-${kind}-strip`}
    data-histogram-cumulative={kind === 'cumulative' ? 'strip' : undefined}
    data-histogram-percentage={kind === 'percentage' ? 'strip' : undefined} role="group" aria-label={title}>
    <text className="chart-strip-title" data-chart-image-ink="true" x={plotLeft - 8} y={top + layout.bandHeight / 2 - 2}
      textAnchor="end">
      <tspan x={plotLeft - 8}>{kind === 'cumulative' ? '累積割合' : '割合'}</tspan>
      <tspan x={plotLeft - 8} dy={11}>（%）</tspan>
    </text>
    {rows.map((row, index) => <g key={index}
      data-cumulative-index={kind === 'cumulative' ? index : undefined}
      data-cumulative-count={kind === 'cumulative' ? row.cumulativeCount! : undefined}
      data-cumulative-proportion={kind === 'cumulative' ? row.cumulativeProportion! : undefined}
      data-bin-percentage-index={kind === 'percentage' ? index : undefined}
      data-bin-percentage-count={kind === 'percentage' ? row.bin.count : undefined}
      data-bin-percentage-proportion={kind === 'percentage' ? row.proportion! : undefined}
      role="img" aria-label={description(row.bin, layout.labels[index])}>
      <ChartStripCell left={plotLeft + index * cellWidth} width={cellWidth} top={bandTop}
        height={layout.bandHeight} leftInset={index > 0 ? cellInset : 0}
        rightInset={index < rows.length - 1 ? cellInset : 0}
        label={layout.labels[index]} showLabel={visibleIndices.has(index)} labelRotation={layout.labelRotation}
        labelAttributes={{ 'data-histogram-video-value': kind, 'data-histogram-video-value-index': index }}
        labelY={layout.labelRotation ? bandTop + layout.bandHeight / 2 : bandTop + 16} />
    </g>)}
  </g>
}
