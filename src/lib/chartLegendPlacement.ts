export interface ChartLegendPoint {
  x: number
  y: number
}

export interface ChartLegendRect extends ChartLegendPoint {
  width: number
  height: number
}

export type ChartLegendPlacement = ChartLegendRect & {
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

interface ChartLegendPlacementOptions {
  plot: ChartLegendRect
  legend: { width: number; height: number }
  lines?: readonly (readonly (ChartLegendPoint | null)[])[]
  obstacles?: readonly ChartLegendRect[]
  inset?: number
  clearance?: number
}

function isFinitePoint(point: ChartLegendPoint | null): point is ChartLegendPoint {
  return point !== null && Number.isFinite(point.x) && Number.isFinite(point.y)
}

function isFiniteRect(rect: ChartLegendRect): boolean {
  return isFinitePoint(rect)
    && Number.isFinite(rect.width) && rect.width >= 0
    && Number.isFinite(rect.height) && rect.height >= 0
    && Number.isFinite(rect.x + rect.width)
    && Number.isFinite(rect.y + rect.height)
}

function containsPoint(rect: ChartLegendRect, point: ChartLegendPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height
}

/** Clip the entire segment against both axes, including contact with the boundary. */
function intersectsSegment(rect: ChartLegendRect, start: ChartLegendPoint, end: ChartLegendPoint): boolean {
  let enter = 0
  let leave = 1
  for (const axis of ['x', 'y'] as const) {
    const minimum = rect[axis]
    const maximum = minimum + (axis === 'x' ? rect.width : rect.height)
    if (Math.max(start[axis], end[axis]) < minimum || Math.min(start[axis], end[axis]) > maximum) return false
    const delta = end[axis] - start[axis]
    if (delta === 0) continue
    // An overflowing segment cannot be safely excluded; prefer the outside fallback.
    if (!Number.isFinite(delta)) continue
    const first = (minimum - start[axis]) / delta
    const last = (maximum - start[axis]) / delta
    enter = Math.max(enter, Math.min(first, last))
    leave = Math.min(leave, Math.max(first, last))
    if (enter > leave) return false
  }
  return true
}

function intersectsLine(rect: ChartLegendRect, line: readonly (ChartLegendPoint | null)[]): boolean {
  let previous: ChartLegendPoint | null = null
  for (const point of line) {
    if (!isFinitePoint(point)) {
      previous = null
      continue
    }
    if (containsPoint(rect, point) || (previous && intersectsSegment(rect, previous, point))) return true
    previous = point
  }
  return false
}

function intersectsRect(left: ChartLegendRect, right: ChartLegendRect): boolean {
  return left.x <= right.x + right.width && left.x + left.width >= right.x
    && left.y <= right.y + right.height && left.y + left.height >= right.y
}

/** Choose a clear plot corner, or leave the legend outside when none can contain it. */
export function placeChartLegend({
  plot,
  legend,
  lines = [],
  obstacles = [],
  inset = 10,
  clearance = 6,
}: ChartLegendPlacementOptions): ChartLegendPlacement | null {
  if (!isFiniteRect(plot) || plot.width <= 0 || plot.height <= 0
    || !Number.isFinite(legend.width) || legend.width <= 0
    || !Number.isFinite(legend.height) || legend.height <= 0
    || !Number.isFinite(inset) || inset < 0
    || !Number.isFinite(clearance) || clearance < 0
    || legend.width > plot.width - 2 * inset
    || legend.height > plot.height - 2 * inset) return null

  const left = plot.x + inset
  const right = plot.x + plot.width - inset - legend.width
  const top = plot.y + inset
  const bottom = plot.y + plot.height - inset - legend.height
  const candidates: ChartLegendPlacement[] = [
    { x: right, y: top, ...legend, corner: 'top-right' },
    { x: left, y: top, ...legend, corner: 'top-left' },
    { x: right, y: bottom, ...legend, corner: 'bottom-right' },
    { x: left, y: bottom, ...legend, corner: 'bottom-left' },
  ]
  const finiteObstacles = obstacles.filter(isFiniteRect)
  for (const candidate of candidates) {
    const exclusion = {
      x: candidate.x - clearance,
      y: candidate.y - clearance,
      width: candidate.width + 2 * clearance,
      height: candidate.height + 2 * clearance,
    }
    if (!isFiniteRect(candidate) || !isFiniteRect(exclusion)) return null
    if (finiteObstacles.some((obstacle) => intersectsRect(exclusion, obstacle))) continue
    if (lines.some((line) => intersectsLine(exclusion, line))) continue
    return candidate
  }
  return null
}
