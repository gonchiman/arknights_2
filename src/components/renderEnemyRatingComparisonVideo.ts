import type { ReactNode } from 'react'
import type { ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { recordChartVideo, type ChartVideoFormat } from '../lib/chartVideoRecorder'
import {
  getEnemyRatingVideoBarStep, getEnemyRatingVideoTimingBounds, retimeEnemyRatingVideoStep, retimeEnemyRatingVideoText,
  type EnemyRatingVideoPhase, type EnemyRatingVideoTiming,
} from '../lib/enemyRatingVideoTiming'
import { withComparisonChartImageSurface } from './saveComparisonChartImage'

export const ENEMY_RATING_VIDEO_WIDTH = 1920
type Box = { x: number; y: number; width: number; height: number }
type Step = ReturnType<typeof retimeEnemyRatingVideoStep>
type OriginalStep = Step & { phase: EnemyRatingVideoPhase }
type Label = { box: Box; step: OriginalStep }
type Shape = { element: SVGElement; box: Box; color: string }

export interface EnemyRatingVideoAnimation {
  width: number
  height: number
  duration: number
  drawFrame: (context: CanvasRenderingContext2D, seconds: number) => void
  withTiming: (timing: EnemyRatingVideoTiming) => EnemyRatingVideoAnimation
}

function reveal(seconds: number, { start, duration }: Step): number {
  if (duration === 0) return Number(seconds >= start)
  const progress = Math.max(0, Math.min(1, (seconds - start) / duration))
  return progress * progress * (3 - 2 * progress)
}

function step(phase: EnemyRatingVideoPhase, start: number, duration: number): OriginalStep {
  return { phase, start, duration }
}

function instantStep(phase: Step, fraction: number): Step {
  return { start: phase.start + fraction * phase.duration, duration: 0 }
}

export async function prepareEnemyRatingComparisonVideo(
  chart: ReactNode,
  timing: EnemyRatingVideoTiming,
  output: ChartImageRasterOutput,
  signal?: AbortSignal,
): Promise<EnemyRatingVideoAnimation> {
  signal?.throwIfAborted()
  const scene = await withComparisonChartImageSurface({
    chart,
    width: 960,
    output,
  }, async (surface, size) => {
    signal?.throwIfAborted()
    const frame = surface.querySelector<HTMLElement>('.chart-image-frame')
    if (!frame) throw new Error('動画にするグラフが見つかりませんでした。')
    const bounds = surface.getBoundingClientRect()
    const scaleX = size.canvasWidth / size.width
    const scaleY = size.canvasHeight / size.height

    function getBox(element: Element): Box {
      const rect = element.getBoundingClientRect()
      return { x: (rect.left - bounds.left) * scaleX, y: (rect.top - bounds.top) * scaleY,
        width: rect.width * scaleX, height: rect.height * scaleY }
    }

    function labels(selector: string, phase: EnemyRatingVideoPhase,
      delay: number, order?: string, stagger = 0, duration = .18): Label[] {
      return Array.from(surface.querySelectorAll(selector), element => {
        const box = getBox(element)
        // Include the antialiased edges of the rasterized glyphs.
        const x = Math.max(0, Math.floor(box.x - 2 * scaleX))
        const y = Math.max(0, Math.floor(box.y - 2 * scaleY))
        const right = Math.min(size.canvasWidth, Math.ceil(box.x + box.width + 2 * scaleX))
        const bottom = Math.min(size.canvasHeight, Math.ceil(box.y + box.height + 2 * scaleY))
        const start = delay + (order ? Number(element.getAttribute(order)) * stagger : 0)
        return { box: { x, y, width: right - x, height: bottom - y }, step: step(phase, start, duration) }
      }).filter(({ box }) => box.width > 0 && box.height > 0)
    }

    const text = [
      ...labels('.chart-image-frame-heading > strong', 'title', .04, undefined, 0, .23),
      ...labels('.chart-image-frame-conditions', 'title', .20, undefined, 0, .22),
      ...labels('[data-rating-video-heading="series"]', 'axes', .63),
      ...labels('[data-rating-video-heading="rank"]', 'axes', .86),
      ...labels('[data-rating-video-tick]', 'axes', .51, 'data-rating-video-tick', .30),
      ...labels('.chart-image-frame-axis-title', 'axes', .85),
      ...labels('[data-rating-video-rank]', 'ranks', .98, 'data-rating-video-rank', .035),
      ...labels('[data-rating-video-heading="value"]', 'values', 2.22),
      ...labels('[data-rating-video-value]', 'values', 2.39, 'data-rating-video-value', .095),
    ]

    function shapes<T>(attribute: string, describe: (shape: Shape, style: CSSStyleDeclaration, order: number) => T) {
      return Array.from(surface.querySelectorAll<SVGElement>(`[${attribute}]`), element => {
        const style = getComputedStyle(element)
        const shape = { element, box: getBox(element), color: style.fill === 'currentcolor' ? style.color : style.fill }
        return describe(shape, style, Number(element.getAttribute(attribute)))
      })
    }

    const highlights = shapes('data-rating-video-highlight', (shape, style, row) => ({
      ...shape, opacity: Number(style.fillOpacity), step: step('ranks', .98 + .035 * row, .18),
    }))
    const guides = shapes('data-rating-video-guide', (shape, style, order) => {
      const width = parseFloat(style.strokeWidth) * scaleX
      return { ...shape, color: style.stroke, box: { ...shape.box, x: shape.box.x - width / 2, width },
        order, step: step('axes', .42 + .30 * order, .38) }
    })
    const bars = shapes('data-rating-video-bar', (shape, _style, direction) => ({
      ...shape, rank: Number(shape.element.getAttribute('data-rating-video-bar-rank')), fromRight: direction < 0,
    }))

    if (!guides.length || !surface.querySelector('[data-rating-video-rank]')) {
      throw new Error('左右の横棒グラフを取得できませんでした。')
    }

    // Rasterize the existing text once. The other marks keep their SVG geometry and
    // color, so drawing a frame only composites a few rectangles and text regions.
    for (const { element } of [...highlights, ...guides, ...bars]) element.style.visibility = 'hidden'
    surface.style.backgroundColor = 'transparent'
    frame.style.backgroundColor = 'transparent'
    const { toCanvas } = await import('html-to-image')
    const textImage = await toCanvas(surface, { ...size, pixelRatio: 1, skipFonts: true })
    signal?.throwIfAborted()
    return {
      size, text, textImage,
      highlights: highlights.map(({ element: _element, ...mark }) => mark),
      guides: guides.map(({ element: _element, ...mark }) => mark),
      bars: bars.map(({ element: _element, ...mark }) => mark),
    }
  })

  const barRanks = [...new Set(scene.bars.map(({ rank }) => rank))].sort((a, b) => a - b)

  function withTiming(settings: EnemyRatingVideoTiming): EnemyRatingVideoAnimation {
    const { finish, duration } = getEnemyRatingVideoTimingBounds(settings)
    const { size, textImage } = scene
    const retime = ({ phase, start, duration }: OriginalStep) => retimeEnemyRatingVideoStep(settings, phase, start, duration)
    const highlights = scene.highlights.map(mark => ({ ...mark, step: retime(mark.step) }))
    const guides = scene.guides.map(({ order, ...mark }) => ({
      ...mark, step: settings.guideMode === 'stagger' ? instantStep(settings.axes, order) : retime(mark.step),
    }))
    const bars = scene.bars.map(({ rank, ...bar }) => ({
      ...bar, step: getEnemyRatingVideoBarStep(settings, barRanks.indexOf(rank), barRanks.length),
    }))
    const labels = scene.text.map(({ box, step: { phase, start, duration } }) => ({
      box, step: retimeEnemyRatingVideoText(settings, phase, start, duration),
    }))

    return {
      width: size.canvasWidth,
      height: size.canvasHeight,
      duration,
      withTiming,
      drawFrame(context, seconds) {
        const time = seconds >= finish ? Number.POSITIVE_INFINITY : seconds
        context.fillStyle = '#fff'
        context.fillRect(0, 0, size.canvasWidth, size.canvasHeight)
        for (const { box, step, color, opacity } of highlights) {
          context.globalAlpha = opacity * reveal(time, step)
          context.fillStyle = color
          context.fillRect(box.x, box.y, box.width, box.height)
        }
        context.globalAlpha = 1
        for (const { box, step, color } of guides) {
          context.fillStyle = color
          context.fillRect(box.x, box.y, box.width, box.height * reveal(time, step))
        }
        for (const { box, color, fromRight, step } of bars) {
          const width = box.width * reveal(time, step)
          context.fillStyle = color
          context.fillRect(fromRight ? box.x + box.width - width : box.x, box.y, width, box.height)
        }
        for (const { box: { x, y, width, height }, step } of labels) {
          const alpha = reveal(time, step)
          if (alpha === 0) continue
          context.globalAlpha = alpha
          context.drawImage(textImage, x, y, width, height, x, y, width, height)
        }
        context.globalAlpha = 1
      },
    }
  }
  return withTiming(timing)
}

export async function renderEnemyRatingComparisonVideo(
  chart: ReactNode,
  format: ChartVideoFormat,
  timing: EnemyRatingVideoTiming,
  output: ChartImageRasterOutput,
  signal?: AbortSignal,
): Promise<Blob> {
  const { width, height, duration, drawFrame } = await prepareEnemyRatingComparisonVideo(chart, timing, output, signal)
  return recordChartVideo({ width, height, duration, drawFrame, format, signal })
}
