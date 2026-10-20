import { buildHistogramCumulativeRows } from './histogramCumulative.ts'
import { formatHistogramPercentage } from './histogramPercentageLabels.ts'

export interface HistogramCumulativeStripLayout {
  /** Title, strip, and the gap between the strip and reference labels/data. */
  height: number
  bandHeight: number
  labelRotation: 0 | -90
  labelStride: number
  labels: readonly string[]
  visibleIndices: readonly number[]
}

const fontSize = 11
const titleHeight = 18
const bottomGap = 4
const normalBandHeight = 24

/** Stable CSS-pixel geometry, shared by the screen, image preview, and PNG. */
export function getHistogramCumulativeStripLayout(
  bins: readonly { readonly count: number }[],
  total: number,
  plotWidth: number,
): HistogramCumulativeStripLayout | null {
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return null
  const rows = buildHistogramCumulativeRows(bins, total)
  if (!rows.length || rows.some(row => row.cumulativeProportion === null)) return null
  const labels = rows.map(row => formatHistogramPercentage(row.cumulativeProportion!, 1)!
    .replace(/%$/, '').replace(/\.0$/, ''))
  // Conservative digit width keeps the first render safe before fonts finish loading.
  const maxLabelWidth = Math.max(...labels.map(label => label.length * fontSize * 0.65))
  const cellWidth = plotWidth / rows.length
  const labelRotation = cellWidth >= maxLabelWidth + 6 ? 0 : -90
  const bandHeight = labelRotation ? Math.max(normalBandHeight, Math.ceil(maxLabelWidth + 10)) : normalBandHeight
  const labelStride = labelRotation ? Math.max(1, Math.ceil((fontSize + 4) / cellWidth)) : 1
  // Select backwards from the last class so the final cumulative value is never omitted.
  const visibleIndices = rows.flatMap((_, index) => (rows.length - 1 - index) % labelStride === 0 ? [index] : [])
  return { height: titleHeight + bandHeight + bottomGap, bandHeight, labelRotation, labelStride, labels, visibleIndices }
}
