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

interface EndLabelPoint {
  x: number
  y: number
}

interface EndLabelRect extends EndLabelPoint {
  width: number
  height: number
}

export interface ChartEndLabelInside extends EndLabelRect {
  id: string
}

interface ChartEndLabelsInsideOptions {
  plot: EndLabelRect
  labels: readonly ChartEndLabelInside[]
  lines: readonly (readonly (EndLabelPoint | null)[])[]
  obstacles?: readonly EndLabelRect[]
  inset?: number
  clearance?: number
  gap?: number
  /** Maximum vertical distance between an endpoint and its label's center. */
  maxDisplacement?: number
}

interface VerticalInterval {
  min: number
  max: number
}

function finitePoint(point: EndLabelPoint | null): point is EndLabelPoint {
  return point !== null && Number.isFinite(point.x) && Number.isFinite(point.y)
}

function finiteRect(rect: EndLabelRect): boolean {
  return finitePoint(rect) && Number.isFinite(rect.width) && rect.width >= 0
    && Number.isFinite(rect.height) && rect.height >= 0
    && Number.isFinite(rect.x + rect.width) && Number.isFinite(rect.y + rect.height)
}

/** Find every y touched by a segment inside the label's horizontal exclusion band. */
function clippedSegmentY(
  start: EndLabelPoint,
  end: EndLabelPoint,
  left: number,
  right: number,
): VerticalInterval | null {
  if (Math.max(start.x, end.x) < left || Math.min(start.x, end.x) > right) return null
  const dx = end.x - start.x
  const dy = end.y - start.y
  // Extreme coordinates cannot be clipped reliably; reserve the complete band.
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { min: -Infinity, max: Infinity }
  const first = dx === 0 ? 0 : (left - start.x) / dx
  const last = dx === 0 ? 1 : (right - start.x) / dx
  const enter = Math.max(0, Math.min(first, last))
  const leave = Math.min(1, Math.max(first, last))
  if (enter > leave) return null
  const firstY = start.y + dy * enter
  const lastY = start.y + dy * leave
  return { min: Math.min(firstY, lastY), max: Math.max(firstY, lastY) }
}

function clearIntervals(bounds: VerticalInterval, blocked: VerticalInterval[]): VerticalInterval[] {
  const result: VerticalInterval[] = []
  let cursor = bounds.min
  // Contact with a line or obstacle is a collision, including at an interval edge.
  const separation = 0.01
  for (const interval of blocked.sort((left, right) => left.min - right.min)) {
    if (interval.max < cursor || interval.min > bounds.max) continue
    const end = Math.min(bounds.max, interval.min - separation)
    if (cursor <= end) result.push({ min: cursor, max: end })
    cursor = Math.max(cursor, interval.max + separation)
    if (cursor > bounds.max) return result
  }
  if (cursor <= bounds.max) result.push({ min: cursor, max: bounds.max })
  return result
}

/**
 * Place endpoint labels inside the right edge without covering plotted geometry.
 * Return null when the complete ordered set cannot fit near its endpoints.
 */
export function placeChartEndLabelsInside({
  plot,
  labels,
  lines,
  obstacles = [],
  inset = 8,
  clearance = 6,
  gap = 6,
  maxDisplacement = 100,
}: ChartEndLabelsInsideOptions): ChartEndLabelInside[] | null {
  if (labels.length === 0) return []
  if (!finiteRect(plot) || plot.width <= 0 || plot.height <= 0
    || [inset, clearance, gap, maxDisplacement].some((value) => !Number.isFinite(value) || value < 0)
    || labels.some((label) => !finiteRect(label) || label.width <= 0 || label.height <= 0)
    || new Set(labels.map((label) => label.id)).size !== labels.length) return null

  const ordered = [...labels].sort((left, right) => left.y - right.y)
  const segments: [EndLabelPoint, EndLabelPoint][] = []
  for (const line of lines) {
    let previous: EndLabelPoint | null = null
    for (const point of line) {
      if (!finitePoint(point)) {
        previous = null
        continue
      }
      segments.push([previous ?? point, point])
      previous = point
    }
  }
  const validObstacles = obstacles.filter(finiteRect)
  let offset = 0
  const placements: {
    label: ChartEndLabelInside
    x: number
    offset: number
    ideal: number
    intervals: VerticalInterval[]
  }[] = []
  for (const label of ordered) {
    if (label.width > plot.width - 2 * inset || label.height > plot.height - 2 * inset) return null
    const x = plot.x + plot.width - inset - label.width
    const left = x - clearance
    const right = x + label.width + clearance
    const ideal = label.y - label.height / 2
    const bounds = {
      min: Math.max(plot.y + inset, ideal - maxDisplacement),
      max: Math.min(plot.y + plot.height - inset - label.height, ideal + maxDisplacement),
    }
    if (![x, left, right, ideal, bounds.min, bounds.max, offset].every(Number.isFinite)
      || bounds.min > bounds.max) return null
    const blocked: VerticalInterval[] = []
    for (const [start, end] of segments) {
      const occupied = clippedSegmentY(start, end, left, right)
      if (occupied) blocked.push({ min: occupied.min - label.height - clearance, max: occupied.max + clearance })
    }
    for (const obstacle of validObstacles) {
      if (obstacle.x > right || obstacle.x + obstacle.width < left) continue
      blocked.push({ min: obstacle.y - label.height - clearance, max: obstacle.y + obstacle.height + clearance })
    }
    const intervals = clearIntervals(bounds, blocked)
      .map((interval) => ({ min: interval.min - offset, max: interval.max - offset }))
    if (intervals.length === 0 || intervals.some((interval) => !Number.isFinite(interval.min) || !Number.isFinite(interval.max))) return null
    placements.push({ label, x, offset, ideal: ideal - offset, intervals })
    offset += label.height + gap
  }

  // Subtract preceding label heights and gaps: non-overlap becomes z[i] >= z[i-1].
  // In an optimal ordered block, z is either an interval edge or the mean of its
  // preferred positions. Include both, so a greedy first choice cannot block a
  // later label and even narrow valid spaces remain available.
  const candidateValues = placements.flatMap(({ intervals }) => intervals.flatMap(({ min, max }) => [min, max]))
  for (let first = 0; first < placements.length; first += 1) {
    let mean = 0
    for (let last = first; last < placements.length; last += 1) {
      const count = last - first + 1
      mean = mean * ((count - 1) / count) + placements[last].ideal / count
      candidateValues.push(mean)
    }
  }
  const candidates = [...new Set(candidateValues)].filter(Number.isFinite).sort((left, right) => left - right)
  let previousCosts = candidates.map(() => 0)
  const predecessors: number[][] = []
  for (let labelIndex = 0; labelIndex < placements.length; labelIndex += 1) {
    const placement = placements[labelIndex]
    const costs = candidates.map(() => Infinity)
    const previous = candidates.map(() => -1)
    let bestIndex = -1
    let bestCost = Infinity
    let intervalIndex = 0
    for (let index = 0; index < candidates.length; index += 1) {
      if (previousCosts[index] < bestCost) {
        bestCost = previousCosts[index]
        bestIndex = index
      }
      const candidate = candidates[index]
      while (intervalIndex < placement.intervals.length && placement.intervals[intervalIndex].max < candidate) intervalIndex += 1
      const interval = placement.intervals[intervalIndex]
      if (!interval || candidate < interval.min || bestIndex === -1) continue
      const distance = candidate - placement.ideal
      costs[index] = bestCost + distance * distance
      previous[index] = labelIndex === 0 ? -1 : bestIndex
    }
    if (!costs.some(Number.isFinite)) return null
    predecessors.push(previous)
    previousCosts = costs
  }
  let selected = previousCosts.reduce((best, cost, index) => cost < previousCosts[best] ? index : best, 0)
  const result: ChartEndLabelInside[] = []
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const { label, x, offset: placementOffset } = placements[index]
    result.push({ id: label.id, x, y: candidates[selected] + placementOffset, width: label.width, height: label.height })
    selected = predecessors[index][selected]
  }
  return result.reverse()
}
