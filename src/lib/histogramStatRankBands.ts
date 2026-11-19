import { getEnemyRatingNumericRanges, getEnemyStatRating, type EnemyRatingStat } from './enemyStatRatings.ts'
import type { HistogramBin, HistogramScale } from './enemyStatistics.ts'
import { createHistogramCategoryScale } from './histogramCategoryScale.ts'
import type { StatRankBand } from './statRankBands.ts'

/** Project rating boundaries into the histogram's equal-width class slots. */
export function getHistogramStatRankBands(
  stat: EnemyRatingStat,
  bins: readonly HistogramBin[],
  scale: HistogramScale = 'LINEAR',
): StatRankBand[] {
  if (!bins.length || bins.some((bin) => !Number.isFinite(bin.start) || !Number.isFinite(bin.end) || bin.end < bin.start)) return []
  const ranges = getEnemyRatingNumericRanges(stat)
  const positions = createHistogramCategoryScale(bins, 0, 1, scale)
  const intervals: StatRankBand[] = []
  const clamp = (position: number) => Math.max(0, Math.min(1, position))
  const append = (band: StatRankBand) => {
    const previous = intervals.at(-1)
    if (previous?.rating === band.rating && previous.end === band.start) previous.end = band.end
    else intervals.push(band)
  }

  bins.forEach((bin, binIndex) => {
    const slotStart = positions.start(binIndex)
    const slotEnd = positions.end(binIndex)
    // Overflow has no numerical distance: all values strictly above its lower
    // bound share one column, even when the observed count happens to be zero.
    if (bin.isOverflow) {
      const first = ranges.findIndex((range) => range.upperBound === null || range.upperBound > bin.start)
      if (first < 0) return
      const last = ranges.length - 1
      append({ rating: first === last ? ranges[first].rating : `${ranges[first].rating}〜${ranges[last].rating}`,
        label: `${bin.start.toLocaleString('ja-JP')} 超`, start: slotStart, end: slotEnd, index: first })
      return
    }
    if (bin.start === bin.end) {
      const index = ranges.findIndex((range) => range.rating === getEnemyStatRating(stat, bin.start))
      if (index >= 0) append({ rating: ranges[index].rating, label: ranges[index].label, start: slotStart, end: slotEnd, index })
      return
    }
    // Use explicit slot edges for shared bounds. A neighbouring constant class
    // has a centre position for the same value, but must not shorten this slot.
    const position = (value: number) => value === bin.start ? slotStart : value === bin.end ? slotEnd
      : clamp(Math.max(slotStart, Math.min(slotEnd, positions.position(value))))
    const fragments: { start: number; end: number; indices: number[] }[] = []
    const points: { position: number; index: number }[] = []
    ranges.forEach((range, index) => {
      const lower = Math.max(bin.start, range.lowerBound ?? bin.start)
      const upper = Math.min(bin.end, range.upperBound ?? bin.end)
      if (upper > lower) {
        fragments.push({ start: position(lower), end: position(upper), indices: [index] })
      } else if (upper === lower && getEnemyStatRating(stat, lower) === range.rating
        && lower >= bin.start && (lower < bin.end || bin.includesMaximum)) {
        points.push({ position: position(lower), index })
      }
    })
    // A singleton rank belongs to this class, without gaining numerical width.
    // Keep it in the neighbouring fragment's label instead of a separate row.
    for (const point of points) {
      const adjacent = fragments.find((fragment) => fragment.start === point.position || fragment.end === point.position)
      if (adjacent && !adjacent.indices.includes(point.index)) adjacent.indices.push(point.index)
    }
    for (const fragment of fragments) {
      const indices = fragment.indices.sort((left, right) => left - right)
      append({ rating: indices.map((index) => ranges[index].rating).join('・'),
        label: indices.map((index) => ranges[index].label).join('／'),
        start: fragment.start, end: fragment.end, index: indices[0] })
    }
  })
  return intervals
}
