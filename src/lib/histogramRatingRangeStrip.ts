import type { EnemyRatingNumericRange } from './enemyStatRatings.ts'
import { formatHistogramBinRangeLines } from './histogramBinRangeLabels.ts'

/** Compact strip labels share numeric-class formatting; the rating lookup keeps its exact bounds. */
export function formatHistogramRatingRangeLines(bin: EnemyRatingNumericRange): string[] {
  if (bin.lowerBound === null && bin.upperBound === null) return []
  const start = bin.lowerBound ?? 0
  const lines = formatHistogramBinRangeLines({
    start,
    end: bin.upperBound ?? start,
    count: 0,
    includesMaximum: bin.upperInclusive,
    isOverflow: bin.upperBound === null,
  })
  // Resistance E is the zero endpoint, rather than a range beginning at zero.
  return bin.lowerBound === null && bin.upperBound === 0 && bin.upperInclusive && lines.length
    ? [`${lines[0]}以下`] : lines
}
