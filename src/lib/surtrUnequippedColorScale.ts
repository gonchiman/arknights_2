import { getEnemyHeatmapOpacity } from './enemyHeatmapColor.ts'
import type { SurtrUnequippedMetric } from './surtrUnequippedComparison.ts'

const neutralValue = (metric: SurtrUnequippedMetric) => metric === 'ratio' ? 100 : 0

/** One scale for all visible comparison cells, excluding raw DPS and hidden rows. */
export function getSurtrUnequippedColorScaleMaximum(
  values: readonly (number | null | undefined)[],
  metric: SurtrUnequippedMetric,
): number {
  return values.reduce<number>((maximum, value) => value != null && Number.isFinite(value)
    ? Math.max(maximum, Math.abs(value - neutralValue(metric))) : maximum, 0)
}

export function getSurtrUnequippedColorScaleBackground(
  value: number | null | undefined,
  metric: SurtrUnequippedMetric,
  maximum: number,
): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  const difference = value - neutralValue(metric)
  // Match the existing heatmap's linear scale and readable 40% upper limit.
  const intensity = getEnemyHeatmapOpacity(Math.abs(difference), maximum)
  if (intensity === 0) return undefined
  return `color-mix(in srgb, ${difference > 0 ? '#245ea8' : '#ae733c'} ${intensity * 100}%, var(--surface))`
}
