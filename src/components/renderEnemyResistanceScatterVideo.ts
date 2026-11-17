import type { ReactNode } from 'react'
import type { ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { getChartVideoTimingBounds, type ChartVideoTiming } from '../lib/enemyRatingVideoTiming'
import { getEnemyResistanceScatterVideoDefinition, type EnemyResistanceScatterVideoPhase } from '../lib/enemyResistanceScatterVideoTiming'
import { withComparisonChartImageSurface } from './saveComparisonChartImage'

type Timing = ChartVideoTiming<EnemyResistanceScatterVideoPhase>
type Step = Timing['title']
type Region = { x: number; y: number; width: number; height: number }
type Line = { x1: number; y1: number; x2: number; y2: number; color: string; width: number }

export interface EnemyResistanceScatterVideoAnimation {
  width: number
  height: number
  duration: number
  drawFrame(context: CanvasRenderingContext2D, seconds: number): void
  withTiming(timing: Timing): EnemyResistanceScatterVideoAnimation
}

function schedule<T>(items: readonly T[], phase: Step, sequential: boolean, animate: boolean) {
  const interval = phase.duration / Math.max(1, items.length)
  return items.map((item, index) => ({
    item,
    start: sequential ? phase.start + (index + .2) * interval : phase.start,
    duration: animate ? (sequential ? .8 * interval : phase.duration) : 0,
  }))
}

function reveal(seconds: number, { start, duration }: Step) {
  if (duration === 0) return Number(seconds >= start)
  const progress = Math.min(1, Math.max(0, (seconds - start) / duration))
  return progress * progress * (3 - 2 * progress)
}

export async function prepareEnemyResistanceScatterVideo(
  chart: ReactNode,
  timing: Timing,
  output: ChartImageRasterOutput,
  signal?: AbortSignal,
): Promise<EnemyResistanceScatterVideoAnimation> {
  signal?.throwIfAborted()
  const scene = await withComparisonChartImageSurface({ chart, width: 960, output }, async (surface, size) => {
    signal?.throwIfAborted()
    const chartFrame = surface.querySelector<HTMLElement>('.chart-image-frame')
    const scatter = surface.querySelector<HTMLElement>('.enemy-resistance-threshold-scatter.is-image')
    const svg = scatter?.querySelector('svg')
    const border = svg?.querySelector('.enemy-chart-frame')
    if (!chartFrame || !scatter || !svg || !border) throw new Error('動画にする散布図が見つかりませんでした。')

    const title = [...chartFrame.querySelectorAll<HTMLElement>('.chart-image-frame-heading > strong, .chart-image-frame-conditions')]
    const axes = [...chartFrame.querySelectorAll<HTMLElement>('.enemy-resistance-scatter-y-title, .chart-image-frame-axis-title')]
    axes.push(...scatter.querySelectorAll<HTMLElement>('.enemy-resistance-scatter-scale > span, .enemy-resistance-scatter-x-ticks > span'))
    const points = [...scatter.querySelectorAll<HTMLElement>('[data-resistance-video-point]')]
      .sort((a, b) => Number(a.dataset.resistanceVideoPoint) - Number(b.dataset.resistanceVideoPoint))
    const notes = [...scatter.querySelectorAll<HTMLElement>('[data-resistance-video-missing]')]
    const bounds = surface.getBoundingClientRect()
    const scaleX = size.canvasWidth / size.width
    const scaleY = size.canvasHeight / size.height

    function getBox(element: Element) {
      const boundsOfElement = element.getBoundingClientRect()
      return {
        left: (boundsOfElement.left - bounds.left) * scaleX, top: (boundsOfElement.top - bounds.top) * scaleY,
        right: (boundsOfElement.right - bounds.left) * scaleX, bottom: (boundsOfElement.bottom - bounds.top) * scaleY,
      }
    }

    function regions(elements: readonly HTMLElement[], padding = 2, bottomPadding = padding): Region[] {
      return elements.map(element => {
        const { left, top, right, bottom } = getBox(element)
        const x = Math.max(0, Math.floor(left - padding * scaleX))
        const y = Math.max(0, Math.floor(top - padding * scaleY))
        const width = Math.min(size.canvasWidth, Math.ceil(right + padding * scaleX)) - x
        const height = Math.min(size.canvasHeight, Math.ceil(bottom + bottomPadding * scaleY)) - y
        return { x, y, width, height }
      }).filter(box => box.width > 0 && box.height > 0)
    }

    const { left, top, right, bottom } = getBox(border)
    const borderStyle = getComputedStyle(border)
    const borderWidth = Number.parseFloat(borderStyle.strokeWidth)
    const color = borderStyle.stroke
    const frame: Line[] = [
      { x1: left, y1: top, x2: right, y2: top, color, width: borderWidth * scaleY },
      { x1: right, y1: top, x2: right, y2: bottom, color, width: borderWidth * scaleX },
      { x1: right, y1: bottom, x2: left, y2: bottom, color, width: borderWidth * scaleY },
      { x1: left, y1: bottom, x2: left, y2: top, color, width: borderWidth * scaleX },
    ]
    const guides = [...svg.querySelectorAll('.enemy-chart-gridline')].map((element): Line => {
      const { left, top, right } = getBox(element)
      const style = getComputedStyle(element)
      return { x1: left, y1: top, x2: right, y2: top, color: style.stroke, width: Number.parseFloat(style.strokeWidth) * scaleY }
    })
    const textRegions = { title: regions(title), axes: regions(axes), notes: regions(notes) }
    // The point is the value label's pseudo-element, just below its text box.
    const pointRegions = regions(points, 5, 12)

    const { toCanvas } = await import('html-to-image')
    const options = { ...size, pixelRatio: 1, skipFonts: true }
    const completed = await toCanvas(surface, { ...options, backgroundColor: '#fff' })
    signal?.throwIfAborted()
    // The transparent rasters let phase order change without exposing unrelated pixels.
    for (const element of [surface, chartFrame, scatter]) element.style.backgroundColor = 'transparent'
    svg.style.visibility = 'hidden'
    for (const point of points) point.style.visibility = 'hidden'
    const text = await toCanvas(surface, options)
    signal?.throwIfAborted()
    let pointImage = text
    if (points.length > 0) {
      for (const element of [...title, ...axes, ...notes]) element.style.visibility = 'hidden'
      for (const point of points) point.style.visibility = ''
      pointImage = await toCanvas(surface, options)
      signal?.throwIfAborted()
    }
    return { size, completed, text, pointImage, textRegions, pointRegions, frame, guides, hasNotes: notes.length > 0 }
  })
  const definition = getEnemyResistanceScatterVideoDefinition(scene.hasNotes)

  function withTiming(settings: Timing): EnemyResistanceScatterVideoAnimation {
    const { size, completed, text, pointImage, textRegions, pointRegions, frame, guides, hasNotes } = scene
    const { finish, duration } = getChartVideoTimingBounds(settings, definition)
    const fade = settings.textMode === 'fade'
    const staggerText = settings.textMode !== 'instant'
    const growLines = settings.guideMode === 'grow'
    const labels = [
      ...schedule(textRegions.title, settings.title, staggerText, fade),
      ...schedule(textRegions.axes, settings.axes, staggerText, fade),
      ...(hasNotes ? schedule(textRegions.notes, settings.notes, false, fade) : []),
    ]
    const lines = [...schedule(guides, settings.axes, true, growLines), ...schedule(frame, settings.frame, true, growLines)]
    const points = schedule(pointRegions, settings.points, settings.barMode !== 'grow', fade)

    return {
      width: size.canvasWidth,
      height: size.canvasHeight,
      duration,
      withTiming,
      drawFrame(context, seconds) {
        if (seconds >= finish) {
          context.drawImage(completed, 0, 0)
          return
        }
        context.fillStyle = '#fff'
        context.fillRect(0, 0, size.canvasWidth, size.canvasHeight)
        context.lineCap = 'square'
        for (const line of lines) {
          const progress = reveal(seconds, line)
          if (progress === 0) continue
          const { x1, y1, x2, y2, color, width } = line.item
          context.strokeStyle = color
          context.lineWidth = width
          context.beginPath()
          context.moveTo(x1, y1)
          context.lineTo(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress)
          context.stroke()
        }
        for (const [image, marks] of [[text, labels], [pointImage, points]] as const) {
          for (const mark of marks) {
            const alpha = reveal(seconds, mark)
            if (alpha === 0) continue
            const { x, y, width, height } = mark.item
            context.globalAlpha = alpha
            context.drawImage(image, x, y, width, height, x, y, width, height)
          }
        }
        context.globalAlpha = 1
      },
    }
  }

  return withTiming(timing)
}
