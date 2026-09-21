interface ValueLabelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GroupedBarValueLabelInput {
  id: string
  anchorX: number
  anchorY: number
  width: number
  height: number
  direction: 'above' | 'below'
}

export interface GroupedBarValueLabelPlacement extends ValueLabelRect {
  id: string
  anchorX: number
  anchorY: number
  shifted: boolean
}

interface GroupedBarValueLabelsOptions {
  labels: readonly GroupedBarValueLabelInput[]
  width: number
  height: number
  obstacles?: readonly ValueLabelRect[]
  gap?: number
}

function finiteRect(rect: ValueLabelRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite)
    && rect.width >= 0 && rect.height >= 0
}

/**
 * Keep every drawable value at its measured size, moving collisions away from
 * the bar end. Coordinates remain relative to the original plot; the caller
 * reserves extraTop/extraBottom around it. Input order breaks placement ties.
 * Invalid geometry is ignored. Labels wider than the plot retain their width
 * at x = 0 so callers can enlarge the container without truncating the value.
 */
export function placeGroupedBarValueLabels({
  labels,
  width,
  height,
  obstacles = [],
  gap = 4,
}: GroupedBarValueLabelsOptions): {
  labels: GroupedBarValueLabelPlacement[]
  extraTop: number
  extraBottom: number
} {
  const plotWidth = Number.isFinite(width) ? Math.max(0, width) : 0
  const plotHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  const clearance = Number.isFinite(gap) ? Math.max(0, gap) : 4
  const occupied = obstacles.filter(finiteRect)
  const placed: GroupedBarValueLabelPlacement[] = []
  let extraTop = 0
  let extraBottom = 0

  for (const label of labels) {
    if (![label.anchorX, label.anchorY, label.width, label.height].every(Number.isFinite)
      || label.width < 0 || label.height < 0) continue
    const preferredX = label.anchorX - label.width / 2
    const x = Math.max(0, Math.min(Math.max(0, plotWidth - label.width), preferredX))
    const preferredY = label.direction === 'above'
      ? label.anchorY - label.height - clearance
      : label.anchorY + clearance
    if (!Number.isFinite(preferredY) || !Number.isFinite(preferredY + label.height)) continue

    // Each interval contains top-edge positions that would cover an occupied
    // rectangle. Only rectangles in the label's horizontal band matter.
    const blocked = occupied
      .filter((rect) => x < rect.x + rect.width + clearance && x + label.width + clearance > rect.x)
      .map((rect) => ({ min: rect.y - label.height - clearance, max: rect.y + rect.height + clearance }))
      .filter((interval) => Number.isFinite(interval.min) && Number.isFinite(interval.max))
      .sort(label.direction === 'above'
        ? (left, right) => right.min - left.min
        : (left, right) => left.max - right.max)
    let y = preferredY
    // Moving past one boundary cannot re-enter an earlier interval in this
    // order, so one finite pass handles arbitrarily dense, chained collisions.
    for (const interval of blocked) {
      if (y > interval.min && y < interval.max) {
        y = label.direction === 'above' ? interval.min : interval.max
      }
    }
    const placement: GroupedBarValueLabelPlacement = {
      id: label.id,
      x,
      y,
      width: label.width,
      height: label.height,
      anchorX: label.anchorX,
      anchorY: label.anchorY,
      shifted: x !== preferredX || y !== preferredY,
    }
    placed.push(placement)
    occupied.push(placement)
    extraTop = Math.max(extraTop, -y)
    extraBottom = Math.max(extraBottom, y + label.height - plotHeight)
  }

  return { labels: placed, extraTop, extraBottom }
}
