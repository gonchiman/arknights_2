/** Numeric and rating bins share counts while retaining their own boundary metadata. */
export interface HistogramCumulativeRow<T> {
  bin: T
  cumulativeCount: number | null
  proportion: number | null
  cumulativeProportion: number | null
}

/**
 * Accumulate the same raw bin counts for the frequency table and its overlaid line.
 * `total` is the valid observation weight, excluding missing values. A row's
 * cumulative value includes its entire bin, respecting its open/closed upper
 * boundary, even when its point is displayed at the bar's center. This is not
 * an ECDF reading of all values <= that numeric center.
 *
 * Invalid totals/counts have no proportions. Invalid counts also make that and
 * subsequent cumulative counts unavailable instead of fabricating a partial sum.
 */
export function buildHistogramCumulativeRows<T extends { readonly count: number }>(
  bins: readonly T[],
  total: number,
): HistogramCumulativeRow<T>[] {
  let cumulativeCount: number | null = 0
  const rows = bins.map(bin => {
    if (cumulativeCount !== null) {
      const next: number = cumulativeCount + bin.count
      cumulativeCount = Number.isFinite(bin.count) && bin.count >= 0 && Number.isFinite(next) ? next : null
    }
    return { bin, cumulativeCount }
  })
  const sum = rows.at(-1)?.cumulativeCount ?? (rows.length ? null : 0)
  // Grouped decimal frequencies may differ from the source's sum by a few ULPs.
  const tolerance = sum === null ? 0 : Number.EPSILON * Math.max(Math.abs(total), sum) * 8
  const valid = Number.isFinite(total) && total > 0 && sum !== null && sum <= total + tolerance
  const proportion = (count: number) => Math.min(1, count / total)
  return rows.map(row => ({ ...row,
    proportion: valid ? proportion(row.bin.count) : null,
    cumulativeProportion: valid && row.cumulativeCount !== null ? proportion(row.cumulativeCount) : null,
  }))
}

/** Place one cumulative value at each bar's center, without synthetic endpoints. */
export function getHistogramCumulativePoints(
  rows: readonly { readonly cumulativeProportion: number | null }[],
  { plotLeft, plotRight, plotTop, plotBottom }: {
    plotLeft: number
    plotRight: number
    plotTop: number
    plotBottom: number
  },
): { x: number; y: number }[] {
  const width = plotRight - plotLeft
  const height = plotBottom - plotTop
  if (rows.length === 0 || ![plotLeft, plotRight, plotTop, plotBottom, width, height].every(Number.isFinite)
    || width <= 0 || height <= 0
    || rows.some(({ cumulativeProportion }) => cumulativeProportion === null
      || !Number.isFinite(cumulativeProportion) || cumulativeProportion < 0 || cumulativeProportion > 1)) return []

  return rows.map(({ cumulativeProportion }, index) => ({
    x: plotLeft + (index + 0.5) / rows.length * width,
    y: plotBottom - cumulativeProportion! * height,
  }))
}
