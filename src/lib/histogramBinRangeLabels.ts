import type { HistogramBin } from './enemyStatistics.ts'

const numberFormatter = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })

function formatBoundary(value: number): string {
  const normalized = value === 0 ? 0 : value
  return Math.abs(normalized) >= 10_000 && normalized % 1_000 === 0
    ? `${numberFormatter.format(normalized / 10_000)}万`
    : numberFormatter.format(normalized)
}

/** Keep both boundaries readable without rounding fractional classes to integers. */
export function formatHistogramBinRangeLines(bin: HistogramBin): string[] {
  if (!Number.isFinite(bin.start) || !Number.isFinite(bin.end) || bin.end < bin.start) return []
  const start = formatBoundary(bin.start)
  if (bin.isOverflow) return [`${start}超`]
  if (bin.start === bin.end) return [start]
  return [`${start}〜`, formatBoundary(bin.end)]
}

/** Range labels replace ticks only when every label fits at its own bar's center. */
export function canFitHistogramBinRangeLabels(
  labels: readonly { center: number; width: number }[],
  plotLeft: number,
  plotRight: number,
  gap = 4,
): boolean {
  if (labels.length === 0 || !Number.isFinite(plotLeft) || !Number.isFinite(plotRight)
    || plotRight <= plotLeft || !Number.isFinite(gap) || gap < 0) return false

  if (labels.some(({ center, width }) => !Number.isFinite(center) || !Number.isFinite(width) || width <= 0)) return false

  const ordered = [...labels].sort((a, b) => a.center - b.center)
  let previousRight: number | null = null
  for (const { center, width } of ordered) {
    const left = center - width / 2
    const right = center + width / 2
    if (left < plotLeft || right > plotRight || (previousRight !== null && left - previousRight < gap)) return false
    previousRight = right
  }
  return true
}
