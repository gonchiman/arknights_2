import { placeGroupedBarValueLabels, type GroupedBarValueLabelPlacement } from './groupedBarValueLabels.ts'

/** Format a bin's share of the valid observations, including weighted counts. */
export function formatHistogramPercentage(count: number, total: number): string | null {
  if (
    !Number.isFinite(count)
    || !Number.isFinite(total)
    || count < 0
    || total <= 0
    || count > total
  ) {
    return null
  }

  const percentage = (count / total) * 100
  if (count > 0 && percentage < 0.1) return '<0.1%'
  return `${percentage.toFixed(1)}%`
}

/** Move only labels crossed by a visible reference line; keep the other labels fixed. */
export function avoidHistogramReferenceLines({ layout, referenceXs, width, height, bars }: {
  layout: ReturnType<typeof placeGroupedBarValueLabels>
  referenceXs: readonly number[]
  width: number
  height: number
  bars: readonly { x: number; y: number; width: number; height: number }[]
}): ReturnType<typeof placeGroupedBarValueLabels> {
  const lines = [...new Set(referenceXs.filter((x) => Number.isFinite(x) && x >= 0 && x <= width))].sort((a, b) => a - b)
  const crossesLine = (label: GroupedBarValueLabelPlacement) => lines.some((x) => label.x < x + 1 && label.x + label.width > x - 1)
  const moving = layout.labels.filter(crossesLine)
  if (moving.length === 0) return layout

  const gap = 4
  const lineClearance = gap + 1 // Include half of the reference line's 2px stroke.
  const occupied = [...bars.filter((bar) => bar.height > 0), ...layout.labels.filter((label) => !crossesLine(label))]
  const replacements = new Map<string, GroupedBarValueLabelPlacement>()
  let extraTop = layout.extraTop

  for (const label of moving) {
    // Reference lines extend through the added headroom, so their horizontal
    // bands remain blocked at every label height, including negative y.
    const slots: { min: number; max: number }[] = []
    const maxX = width - label.width
    let minX = 0
    for (const x of lines) {
      const end = Math.min(maxX, x - lineClearance - label.width)
      if (minX <= end) slots.push({ min: minX, max: end })
      minX = Math.max(minX, x + lineClearance)
    }
    if (minX <= maxX) slots.push({ min: minX, max: maxX })

    // Slot edges and obstacle edges cover all nearest free horizontal positions.
    const edges = [label.x, ...occupied.flatMap((rect) => [rect.x - label.width - gap, rect.x + rect.width + gap])]
    const candidates = [...new Set(slots.flatMap(({ min, max }) => edges.map((x) => Math.max(min, Math.min(max, x)))))]
      .sort((a, b) => Math.abs(a - label.x) - Math.abs(b - label.x) || a - b)
    let best: GroupedBarValueLabelPlacement | undefined
    for (const x of candidates) {
      const candidate = placeGroupedBarValueLabels({
        width, height, gap, obstacles: occupied,
        labels: [{ ...label, anchorX: x + label.width / 2, anchorY: label.y + label.height + gap, direction: 'above' }],
      }).labels[0]
      if (!candidate) continue
      // Prefer keeping the original height. If no horizontal space is free,
      // use the smallest upward move, then the nearest horizontal position.
      if (!best || candidate.y > best.y) best = candidate
      if (Math.abs(candidate.y - label.y) < 1e-8) break
    }
    // An exceptionally narrow plot may have no gap wide enough for the text.
    // Keep the full label in that case rather than clipping or hiding it.
    const placed = best ? { ...label, x: best.x, y: best.y, shifted: true } : label
    replacements.set(label.id, placed)
    occupied.push(placed)
    extraTop = Math.max(extraTop, -placed.y)
  }

  return { ...layout, labels: layout.labels.map((label) => replacements.get(label.id) ?? label), extraTop }
}
