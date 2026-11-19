import { buildHistogramCumulativeRows } from './histogramCumulative.ts'
import { formatHistogramPercentage } from './histogramPercentageLabels.ts'

export interface HistogramCumulativeStripLayout {
  /** Strip and the gap before reference labels/data; the title sits in the left gutter. */
  height: number
  bandHeight: number
  labelRotation: 0 | -90
  labelStride: number
  labels: readonly string[]
  visibleIndices: readonly number[]
}

export type HistogramPercentageStripLayout = HistogramCumulativeStripLayout

const fontSize = 11
const bottomGap = 4
const normalBandHeight = 24

/** Stable CSS-pixel geometry, shared by the screen, image preview, and PNG. */
export function getHistogramCumulativeStripLayout(
  bins: readonly { readonly count: number }[],
  total: number,
  plotWidth: number,
): HistogramCumulativeStripLayout | null {
  const rows = buildHistogramCumulativeRows(bins, total)
  return getProportionStripLayout(rows.map(row => row.cumulativeProportion), plotWidth)
}

/** Per-class shares use the same formatting and cell geometry as cumulative shares. */
export function getHistogramPercentageStripLayout(
  bins: readonly { readonly count: number }[],
  total: number,
  plotWidth: number,
): HistogramPercentageStripLayout | null {
  const rows = buildHistogramCumulativeRows(bins, total)
  return getProportionStripLayout(rows.map(row => row.proportion), plotWidth)
}

function getProportionStripLayout(
  proportions: readonly (number | null)[],
  plotWidth: number,
): HistogramCumulativeStripLayout | null {
  if (!Number.isFinite(plotWidth) || plotWidth <= 0 || !proportions.length
    || proportions.some(proportion => proportion === null)) return null
  const labels = proportions.map(proportion => formatHistogramPercentage(proportion!, 1)!
    .replace(/%$/, '').replace(/\.0$/, ''))
  // Conservative digit width keeps the first render safe before fonts finish loading.
  const maxLabelWidth = Math.max(...labels.map(label => label.length * fontSize * 0.65))
  const cellWidth = plotWidth / proportions.length
  const labelRotation = cellWidth >= maxLabelWidth + 6 ? 0 : -90
  const bandHeight = labelRotation ? Math.max(normalBandHeight, Math.ceil(maxLabelWidth + 10)) : normalBandHeight
  const labelStride = labelRotation ? Math.max(1, Math.ceil((fontSize + 4) / cellWidth)) : 1
  // Select backwards from the last class so its value is never omitted.
  const visibleIndices = proportions.flatMap((_, index) => (proportions.length - 1 - index) % labelStride === 0 ? [index] : [])
  return { height: bandHeight + bottomGap, bandHeight, labelRotation, labelStride, labels, visibleIndices }
}
