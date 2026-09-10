interface ChartEndLabel {
  id: string
  y: number
}

/** Keep endpoint labels in vertical order and inside the available chart area. */
export function placeChartEndLabels(
  labels: ChartEndLabel[],
  minY: number,
  maxY: number,
  gap: number,
): ChartEndLabel[] {
  const placed = labels
    .map((label) => ({ ...label }))
    .sort((left, right) => left.y - right.y)
  if (placed.length === 0) return placed

  const spacing = placed.length === 1
    ? 0
    : Math.max(0, Math.min(gap, (maxY - minY) / (placed.length - 1)))

  for (let index = 0; index < placed.length; index += 1) {
    const targetY = Math.min(maxY, Math.max(minY, placed[index].y))
    placed[index].y = index === 0
      ? targetY
      : Math.max(targetY, placed[index - 1].y + spacing)
  }

  placed[placed.length - 1].y = Math.min(maxY, placed[placed.length - 1].y)
  for (let index = placed.length - 2; index >= 0; index -= 1) {
    placed[index].y = Math.min(placed[index].y, placed[index + 1].y - spacing)
  }
  return placed
}
