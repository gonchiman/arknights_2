import type { HistogramScale } from './enemyStatistics.ts'

/** Shared scales from the enemy and operator distribution charts. */
export function createValueScale(minimum: number, maximum: number, rangeStart: number, rangeEnd: number, requestedScale: HistogramScale) {
  const effectiveScale: HistogramScale = requestedScale === 'LOG' && minimum >= 0 ? 'LOG' : 'LINEAR'
  const transform = (value: number) => effectiveScale === 'LOG' ? Math.log1p(value) : value
  const transformedMinimum = transform(minimum)
  const transformedMaximum = transform(maximum)
  const span = transformedMaximum - transformedMinimum
  const position = (value: number) => span === 0
    ? rangeStart + ((rangeEnd - rangeStart) / 2)
    : rangeStart + (((transform(value) - transformedMinimum) / span) * (rangeEnd - rangeStart))
  return { effectiveScale, position }
}

export function createScaleTicks(minimum: number, maximum: number, count: number, scale: HistogramScale): number[] {
  if (minimum === maximum) return [minimum]
  if (scale === 'LOG' && minimum >= 0) {
    const transformedMinimum = Math.log1p(minimum)
    const transformedMaximum = Math.log1p(maximum)
    return Array.from({ length: count }, (_, index) => Math.expm1(transformedMinimum + (((transformedMaximum - transformedMinimum) * index) / (count - 1))))
  }
  return Array.from({ length: count }, (_, index) => minimum + (((maximum - minimum) * index) / (count - 1)))
}

export function createAdaptiveLinearTicks(minimum: number, maximum: number, divisions: number): number[] {
  return Array.from({ length: divisions + 1 }, (_, index) => minimum + (((maximum - minimum) * index) / divisions))
}
