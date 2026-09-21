export interface EnemyComparisonPoint {
  x: number
  y: number
}

/** Interpolate screen-space bin centers without changing their values or adding extrema.
 * Steffen's monotone cubic interpolation, also used by d3.curveMonotoneX:
 * https://d3js.org/d3-shape/curve#curveMonotoneX
 */
export function buildEnemyComparisonCurvePath(points: readonly EnemyComparisonPoint[]): string {
  if (!points.length || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return ''
  const straight = () => points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')
  if (points.length < 3) return straight()

  const widths = points.slice(1).map((point, index) => point.x - points[index].x)
  // Coincident screen positions cannot define a derivative with respect to x.
  if (widths.some((width) => width <= 0)) return straight()
  const slopes = widths.map((width, index) => (points[index + 1].y - points[index].y) / width)
  if (slopes.some((slope) => !Number.isFinite(slope))) return straight()
  const tangents = Array<number>(points.length).fill(0)
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = slopes[index - 1], after = slopes[index]
    if (Math.sign(before) !== Math.sign(after)) continue
    const average = (before * widths[index] + after * widths[index - 1]) / (widths[index - 1] + widths[index])
    tangents[index] = Math.sign(before) * Math.min(2 * Math.abs(before), 2 * Math.abs(after), Math.abs(average))
  }
  tangents[0] = (3 * slopes[0] - tangents[1]) / 2
  tangents[points.length - 1] = (3 * slopes[slopes.length - 1] - tangents[points.length - 2]) / 2

  const commands = [`M ${points[0].x} ${points[0].y}`]
  for (let index = 0; index < widths.length; index += 1) {
    const start = points[index], end = points[index + 1], third = widths[index] / 3
    commands.push(`C ${start.x + third} ${start.y + third * tangents[index]} ${end.x - third} ${end.y - third * tangents[index + 1]} ${end.x} ${end.y}`)
  }
  return commands.join(' ')
}
