export type EnemyThresholdPieLabelLayout = 'BELOW' | 'HYBRID' | 'OUTSIDE' | 'RIGHT'

export const ENEMY_THRESHOLD_PIE_LABEL_LAYOUTS: ReadonlyArray<{ key: EnemyThresholdPieLabelLayout; label: string }> = [
  { key: 'BELOW', label: '下に内訳' },
  { key: 'HYBRID', label: '内側＋引出線' },
  { key: 'OUTSIDE', label: 'すべて外側' },
  { key: 'RIGHT', label: '右側に整列' },
]

interface Point { x: number; y: number }
export interface EnemyThresholdPieLabelBox { x: number; y: number; width: number; height: number }
export interface EnemyThresholdPieLabelGeometry {
  key: 'BELOW' | 'EQUAL' | 'ABOVE'
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  placement: 'inside' | 'outside' | 'right'
  bounds: EnemyThresholdPieLabelBox
  leader: Point[]
  labelSize: number
  percentageSize: number
  countSize: number
  labelLines: string[]
  labelLineHeight: number
  percentageOffset: number
  countOffset: number
  swatch: boolean
}
export interface EnemyThresholdPieGeometry {
  cx: number
  cy: number
  radius: number
  labels: EnemyThresholdPieLabelGeometry[]
}
interface Bucket {
  key: EnemyThresholdPieLabelGeometry['key']
  label: string
  count: number
  proportion: number
}
interface Sector extends Bucket { start: number; span: number; mid: number; labelWidth: number; labelLines: string[] }
const TAU = Math.PI * 2
const SINGLE_LINE_GROUP_HEIGHT = 64
const GAP = 10
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const point = (cx: number, cy: number, radius: number, angle: number): Point => ({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
const measureText = (value: string, size: number) => [...value].reduce((sum, character) => sum + (/^[\d\s.,%+-]$/.test(character) ? 0.61 : 1), 0) * size
export function wrapEnemyThresholdPieLabel(value: string, size: number, width: number) {
  const lines: string[] = []
  let line = ''
  for (const character of value) {
    if (line && measureText(line + character, size) > width) {
      lines.push(line)
      line = character
    } else line += character
  }
  if (line) lines.push(line)
  return lines
}
const overlaps = (a: EnemyThresholdPieLabelBox, b: EnemyThresholdPieLabelBox) => a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y

function segmentAvoidsCircle(a: Point, b: Point, cx: number, cy: number, radius: number) {
  const dx = b.x - a.x, dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const progress = lengthSquared === 0 ? 0 : clamp(((cx - a.x) * dx + (cy - a.y) * dy) / lengthSquared, 0, 1)
  return Math.hypot(a.x + dx * progress - cx, a.y + dy * progress - cy) >= radius + 2
}

function rayIntersectsBox(cx: number, cy: number, angle: number, radius: number, bounds: EnemyThresholdPieLabelBox) {
  let near = 0, far = radius
  for (const [origin, direction, minimum, maximum] of [
    [cx, Math.cos(angle), bounds.x, bounds.x + bounds.width],
    [cy, Math.sin(angle), bounds.y, bounds.y + bounds.height],
  ]) {
    if (Math.abs(direction) < 1e-8) {
      if (origin < minimum || origin > maximum) return false
    } else {
      const a = (minimum - origin) / direction, b = (maximum - origin) / direction
      near = Math.max(near, Math.min(a, b))
      far = Math.min(far, Math.max(a, b))
      if (near > far) return false
    }
  }
  return near <= far
}

/** Check the entire label, rather than just its anchor, against the circle and wedge. */
function fitsSector(bounds: EnemyThresholdPieLabelBox, sector: Sector, cx: number, cy: number, radius: number) {
  if (sector.span <= 0) return false
  for (const x of [bounds.x, bounds.x + bounds.width]) {
    for (const y of [bounds.y, bounds.y + bounds.height]) {
      const dx = x - cx, dy = y - cy
      if (Math.hypot(dx, dy) > radius - 6) return false
      const relativeAngle = ((Math.atan2(dy, dx) - sector.start) % TAU + TAU) % TAU
      if (sector.span < TAU - 1e-8 && relativeAngle > sector.span - 0.04) return false
    }
  }
  if (sector.span > Math.PI && sector.span < TAU - 1e-8) {
    // A reflex wedge is not convex: valid corners can still straddle its gap.
    if (rayIntersectsBox(cx, cy, sector.start + 0.04, radius, bounds)
      || rayIntersectsBox(cx, cy, sector.start + sector.span - 0.04, radius, bounds)) return false
  }
  return true
}

/** Geometry for the three near-pie label options, shared by screen and export. */
export function getEnemyThresholdPieGeometry({ buckets, width, height, labelLayout, unit = '体' }: {
  buckets: readonly Bucket[]
  width: number
  height: number
  labelLayout: Exclude<EnemyThresholdPieLabelLayout, 'BELOW'>
  unit?: string
}): EnemyThresholdPieGeometry {
  const narrow = width < 560
  const labelSize = narrow ? 11 : 12
  const percentageSize = narrow ? 22 : 25
  const countSize = 11
  const labelLineHeight = 14
  const availableLabelWidth = narrow
    ? labelLayout === 'RIGHT' ? Math.max(84, Math.min(130, width * 0.42)) : Math.max(84, (width - 48) / 2)
    : Math.max(120, Math.min(180, (width - 72) / 3))
  const total = buckets.reduce((sum, bucket) => sum + Math.max(0, bucket.count), 0)
  let cumulative = 0
  const sectors: Sector[] = buckets.map((bucket) => {
    const proportion = total > 0 ? bucket.count / total : 0
    const start = cumulative * TAU - Math.PI / 2
    const span = proportion * TAU
    cumulative += proportion
    const labelLines = wrapEnemyThresholdPieLabel(bucket.label, labelSize, availableLabelWidth - 16)
    const labelWidth = Math.max(
      ...labelLines.map((line) => measureText(line, labelSize) + 16),
      measureText(`${(proportion * 100).toFixed(1)}%`, percentageSize),
      measureText(`${bucket.count.toLocaleString('ja-JP')}${unit}`, countSize),
    )
    return { ...bucket, proportion, start, span, mid: start + span / 2, labelWidth, labelLines }
  })
  const extraLabelHeight = (Math.max(1, ...sectors.map((sector) => sector.labelLines.length)) - 1) * labelLineHeight
  const groupHeight = SINGLE_LINE_GROUP_HEIGHT + extraLabelHeight
  const maximumLabelWidth = Math.max(80, ...sectors.map((sector) => sector.labelWidth))
  const rightLabelWidth = Math.max(100, maximumLabelWidth)
  const radius = labelLayout === 'RIGHT'
    ? Math.max(1, Math.min(150, (height - 36) / 2, (width - rightLabelWidth - 56) / 2))
    : narrow
      ? Math.max(1, Math.min(120, (height - groupHeight * 2 - 70) / 2, (width - 32) / 2))
      : Math.max(1, Math.min(150, (height - 36) / 2, (width - maximumLabelWidth * 2 - 72) / 2))
  const cx = labelLayout === 'RIGHT' ? (width - (radius * 2 + 32 + rightLabelWidth)) / 2 + radius : width / 2
  const cy = height / 2
  const labels: EnemyThresholdPieLabelGeometry[] = []
  const makeLabel = (sector: Sector, x: number, top: number, anchor: EnemyThresholdPieLabelGeometry['anchor'], placement: EnemyThresholdPieLabelGeometry['placement'], leader: Point[] = []): EnemyThresholdPieLabelGeometry => ({
    key: sector.key, x, y: top + 12, anchor, placement, leader,
    bounds: { x: anchor === 'start' ? x : anchor === 'end' ? x - sector.labelWidth : x - sector.labelWidth / 2, y: top, width: sector.labelWidth, height: groupHeight },
    labelSize, percentageSize, countSize,
    labelLines: sector.labelLines, labelLineHeight,
    percentageOffset: 29 + extraLabelHeight, countOffset: 49 + extraLabelHeight,
    swatch: placement === 'right' || sector.count === 0,
  })
  if (labelLayout === 'RIGHT') {
    const groupGap = clamp((height - groupHeight * sectors.length - 24) / Math.max(1, sectors.length - 1), 12, 28)
    const top = (height - groupHeight * sectors.length - groupGap * (sectors.length - 1)) / 2
    sectors.forEach((sector, index) => labels.push(makeLabel(sector, cx + radius + 32, top + index * (groupHeight + groupGap), 'start', 'right')))
    return { cx, cy, radius, labels }
  }

  const outside: Sector[] = []
  for (const sector of sectors) {
    if (labelLayout === 'HYBRID' && sector.proportion >= 0.2) {
      const distance = sector.proportion === 1 ? 0 : sector.proportion >= 0.7 ? radius * 0.3 : radius * 0.55
      const anchor = point(cx, cy, distance, sector.mid)
      const candidate = makeLabel(sector, anchor.x, anchor.y - groupHeight / 2, 'middle', 'inside')
      if (fitsSector(candidate.bounds, sector, cx, cy, radius) && !labels.some((label) => overlaps(label.bounds, candidate.bounds))) {
        labels.push(candidate)
        continue
      }
    }
    outside.push(sector)
  }

  if (narrow) {
    // Top/bottom callouts retain a useful circle size on narrow screens. Route
    // leaders around the tangent, so they never pass through the solid pie.
    const activeOutside = outside.filter((sector) => sector.count > 0)
    const lowerSector = activeOutside.length > 0
      ? [...activeOutside].sort((a, b) => (Math.sin(b.mid) - Math.sin(a.mid)) || b.proportion - a.proportion)[0]
      : outside[0]
    const bottom = outside.length >= 3 || (lowerSector && Math.sin(lowerSector.mid) > 0.15) ? lowerSector : undefined
    const top = outside.filter((sector) => sector !== bottom).sort((a, b) => Math.cos(a.mid) - Math.cos(b.mid))
    const placeCallout = (sector: Sector, x: number, topY: number, anchor: EnemyThresholdPieLabelGeometry['anchor'], isTop: boolean) => {
      const label = makeLabel(sector, x, topY, anchor, 'outside')
      if (sector.count > 0) {
        const at = point(cx, cy, radius, sector.mid)
        const out = point(cx, cy, radius + 8, sector.mid)
        const side = Math.cos(sector.mid) >= 0 ? 1 : -1
        const routeX = cx + side * (radius + 10)
        const safeY = cy + (isTop ? -1 : 1) * (radius + 12)
        const endX = label.bounds.x + label.bounds.width / 2
        const endY = isTop ? label.bounds.y + label.bounds.height + 6 : label.bounds.y - 6
        label.leader = segmentAvoidsCircle(out, { x: out.x, y: safeY }, cx, cy, radius)
          ? [at, out, { x: out.x, y: safeY }, { x: endX, y: endY }]
          : segmentAvoidsCircle(out, { x: endX, y: endY }, cx, cy, radius)
            ? [at, out, { x: endX, y: endY }]
            : [at, out, { x: routeX, y: out.y }, { x: routeX, y: safeY }, { x: endX, y: endY }]
      }
      labels.push(label)
    }
    top.forEach((sector, index) => {
      if (top.length === 1) placeCallout(sector, width / 2, 8, 'middle', true)
      else placeCallout(sector, index === 0 ? 12 : width - 12, 8, index === 0 ? 'start' : 'end', true)
    })
    if (bottom) placeCallout(bottom, width / 2, height - groupHeight - 8, 'middle', false)
  } else {
    // Adjacent small sectors near 12 o'clock fan out to opposite sides.
    // Their ordinary cosine signs can both point left/right; stacking both
    // there makes the radial stem of one intersect the other's leader.
    const topCluster = outside.filter((sector) => sector.count > 0 && Math.sin(sector.mid) < -0.7)
      .sort((a, b) => Math.cos(a.mid) - Math.cos(b.mid))
    const clusterSides = new Map<Sector['key'], number>()
    if (topCluster.length >= 2) {
      clusterSides.set(topCluster[0].key, -1)
      clusterSides.set(topCluster[topCluster.length - 1].key, 1)
    }
    for (const side of [-1, 1]) {
      const entries = outside.filter((sector, index) => sector.count > 0 ? (clusterSides.get(sector.key) ?? (Math.cos(sector.mid) >= 0 ? 1 : -1)) === side : (index % 2 === 0 ? -1 : 1) === side)
        .sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid))
      const maximumTop = height - groupHeight - 10
      const tops = entries.map((sector) => clamp(cy + Math.sin(sector.mid) * radius - groupHeight / 2, 10, maximumTop))
      for (let index = 1; index < tops.length; index++) tops[index] = Math.max(tops[index], tops[index - 1] + groupHeight + GAP)
      if (tops.length && tops[tops.length - 1] > maximumTop) {
        tops[tops.length - 1] = maximumTop
        for (let index = tops.length - 2; index >= 0; index--) tops[index] = Math.min(tops[index], tops[index + 1] - groupHeight - GAP)
      }
      entries.forEach((sector, index) => {
        const x = cx + side * (radius + 30)
        const label = makeLabel(sector, x, tops[index], side < 0 ? 'end' : 'start', 'outside')
        if (sector.count > 0) {
          const at = point(cx, cy, radius, sector.mid)
          const out = point(cx, cy, radius + 8, sector.mid)
          const routeX = cx + side * (radius + 12 + index * 5)
          const endX = side < 0 ? label.bounds.x + label.bounds.width + 6 : label.bounds.x - 6
          const endY = label.bounds.y + label.bounds.height / 2
          label.leader = segmentAvoidsCircle(out, { x: endX, y: endY }, cx, cy, radius)
            ? [at, out, { x: endX, y: endY }]
            : (Math.cos(sector.mid) >= 0 ? 1 : -1) !== side
              ? [at, out, { x: out.x, y: cy - radius - 12 }, { x: routeX, y: cy - radius - 12 }, { x: routeX, y: endY }, { x: endX, y: endY }]
              : [at, out, { x: routeX, y: out.y }, { x: routeX, y: endY }, { x: endX, y: endY }]
        }
        labels.push(label)
      })
    }
  }
  return { cx, cy, radius, labels: labels.sort((a, b) => buckets.findIndex((bucket) => bucket.key === a.key) - buckets.findIndex((bucket) => bucket.key === b.key)) }
}