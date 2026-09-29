import type { HistogramBin, HistogramScale } from './enemyStatistics.ts'

/** Give every class an equal slot while keeping numeric references within their own class. */
export function createHistogramCategoryScale(
  bins: readonly HistogramBin[],
  left: number,
  right: number,
  scale: HistogramScale = 'LINEAR',
): { position(value: number): number; start(index: number): number; end(index: number): number } {
  const rangeLeft = Number.isFinite(left) ? left : 0
  const rangeRight = Number.isFinite(right) ? Math.max(rangeLeft, right) : rangeLeft
  const slotWidth = bins.length > 0 ? (rangeRight - rangeLeft) / bins.length : 0
  const boundary = (index: number) => rangeLeft + Math.max(0, Math.min(bins.length, Number.isNaN(index) ? 0 : index)) * slotWidth
  const start = (index: number) => boundary(index)
  const end = (index: number) => boundary(index + 1)
  const useLog = scale === 'LOG' && bins.every((bin) => bin.start >= 0 && bin.end >= 0)
  const transform = (value: number) => useLog ? Math.log1p(value) : value

  const position = (value: number): number => {
    if (bins.length === 0 || Number.isNaN(value)) return rangeLeft
    if (value < bins[0].start) return rangeLeft
    for (let index = 0; index < bins.length; index += 1) {
      const bin = bins[index]
      // The shared upper bound belongs to the preceding normal class. Values
      // strictly beyond it have no numeric distance inside an overflow class.
      if (bin.isOverflow) return value > bin.start ? (start(index) + end(index)) / 2 : start(index)
      if (value > bin.end) continue
      if (bin.start === bin.end) return (start(index) + end(index)) / 2
      const minimum = transform(bin.start)
      const maximum = transform(bin.end)
      const fraction = Math.max(0, Math.min(1, (transform(value) - minimum) / (maximum - minimum)))
      return start(index) + fraction * slotWidth
    }
    return rangeRight
  }

  return { position, start, end }
}
