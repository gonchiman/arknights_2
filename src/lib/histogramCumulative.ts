/** Numeric and rating bins share counts while retaining their own boundary metadata. */
export interface HistogramCumulativeRow<T> {
  bin: T
  cumulativeCount: number | null
  proportion: number | null
  cumulativeProportion: number | null
}

/**
 * Accumulate the same raw bin counts for the frequency table and its overlaid line.
 * `total` is the valid observation weight, excluding missing values. Each point
 * represents the supplied bin's upper boundary, including its open/closed rule;
 * this is not an ECDF reading of all values <= a numeric tick.
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
