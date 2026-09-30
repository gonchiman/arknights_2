export interface ChartImageInkBox { left: number; right: number; top: number; bottom: number }
interface Point { x: number; y: number }

export function chartImageBoxesIntersect(a: ChartImageInkBox, b: ChartImageInkBox) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

/** Liang–Barsky clipping, including horizontal and vertical segments. */
export function chartImageSegmentIntersectsBox(start: Point, end: Point, box: ChartImageInkBox) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const p = [-dx, dx, -dy, dy]
  const q = [start.x - box.left, box.right - start.x, start.y - box.top, box.bottom - start.y]
  let first = 0
  let last = 1
  for (let index = 0; index < 4; index += 1) {
    if (p[index] === 0) { if (q[index] < 0) return false; continue }
    const ratio = q[index] / p[index]
    if (p[index] < 0) first = Math.max(first, ratio)
    else last = Math.min(last, ratio)
    if (first > last) return false
  }
  return true
}

function expanded(box: ChartImageInkBox, padding: number): ChartImageInkBox {
  return { left: box.left - padding, right: box.right + padding, top: box.top - padding, bottom: box.bottom + padding }
}

function pathIntersects(element: SVGGeometryElement, box: ChartImageInkBox, displayScale: number) {
  const matrix = element.getScreenCTM()
  if (!matrix) return false
  const totalLength = element.getTotalLength()
  if (!Number.isFinite(totalLength) || totalLength <= 0) return false
  const scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d), 0.001)
  const steps = Math.min(50_000, Math.max(1, Math.ceil(totalLength * scale / (2 * displayScale))))
  const transform = (point: Point) => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f })
  let previous = transform(element.getPointAtLength(0))
  if (chartImageSegmentIntersectsBox(previous, previous, box)) return true
  const longestStep = totalLength / steps * scale * 1.5 + 0.01
  for (let index = 1; index <= steps; index += 1) {
    const point = transform(element.getPointAtLength(totalLength * index / steps))
    // A move command has no ink between its subpaths. Do not mistake the jump for a line.
    const continuous = Math.hypot(point.x - previous.x, point.y - previous.y) <= longestStep
    if (chartImageSegmentIntersectsBox(point, point, box)
      || continuous && chartImageSegmentIntersectsBox(previous, point, box)) return true
    previous = point
  }
  return false
}

/** Only explicitly marked data/labels participate; grids, axes and chart backgrounds do not. */
export function hasChartImageInkCollision(plot: HTMLElement, information: HTMLElement) {
  const informationBounds = information.getBoundingClientRect()
  // Preview transforms must not change collision decisions relative to the full-size PNG.
  const displayScale = information.offsetWidth > 0 ? Math.max(0.001, informationBounds.width / information.offsetWidth) : 1
  const informationBox = expanded(informationBounds, 2 * displayScale)
  for (const element of plot.querySelectorAll<SVGElement>('[data-chart-image-ink]')) {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    const bounds = element.getBoundingClientRect()
    const geometry = element.tagName.toLowerCase()
    if (geometry === 'rect' && (bounds.width <= 0 || bounds.height <= 0)) continue
    if (!chartImageBoxesIntersect(expanded(bounds, displayScale), informationBox)) continue
    if ((geometry === 'path' || geometry === 'line' || geometry === 'polyline') && element instanceof SVGGeometryElement) {
      if (pathIntersects(element, informationBox, displayScale)) return true
    } else if (bounds.width > 0 || bounds.height > 0) return true
  }
  return false
}
