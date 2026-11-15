import type { ReactNode } from 'react'
import { recordChartVideo, type ChartVideoFormat } from '../lib/chartVideoRecorder'
import { withComparisonChartImageSurface } from './saveComparisonChartImage'

export const ENEMY_RATING_VIDEO_WIDTH = 1920
export const ENEMY_RATING_VIDEO_ASPECT = 16 / 7
export const ENEMY_RATING_VIDEO_DURATION = 5

type Box = { x: number; y: number; width: number; height: number }
type Label = { box: Box; delay: number; duration: number }
type Shape = { element: SVGElement; box: Box; color: string }

function reveal(seconds: number, delay: number, duration: number): number {
  const progress = Math.max(0, Math.min(1, (seconds - delay) / duration))
  return progress * progress * (3 - 2 * progress)
}

export async function prepareEnemyRatingComparisonVideo(
  chart: ReactNode,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const aspectRatio = ENEMY_RATING_VIDEO_ASPECT
  const scene = await withComparisonChartImageSurface({
    chart,
    width: 960,
    output: { width: ENEMY_RATING_VIDEO_WIDTH, aspectRatio },
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

    function labels(selector: string, delay: number, order?: string, stagger = 0, duration = .18): Label[] {
      return Array.from(surface.querySelectorAll(selector), element => {
        const box = getBox(element)
        // Include the antialiased edges of the rasterized glyphs.
        const x = Math.max(0, Math.floor(box.x - 2 * scaleX))
        const y = Math.max(0, Math.floor(box.y - 2 * scaleY))
        const right = Math.min(size.canvasWidth, Math.ceil(box.x + box.width + 2 * scaleX))
        const bottom = Math.min(size.canvasHeight, Math.ceil(box.y + box.height + 2 * scaleY))
        return { box: { x, y, width: right - x, height: bottom - y },
          delay: delay + (order ? Number(element.getAttribute(order)) * stagger : 0), duration }
      }).filter(({ box }) => box.width > 0 && box.height > 0)
    }

    const text = [
      ...labels('.chart-image-frame-heading > strong', .04, undefined, 0, .23),
      ...labels('.chart-image-frame-conditions', .20, undefined, 0, .22),
      ...labels('[data-rating-video-heading="series"]', .63),
      ...labels('[data-rating-video-heading="rank"]', .86),
      ...labels('[data-rating-video-tick]', .51, 'data-rating-video-tick', .30),
      ...labels('.chart-image-frame-axis-title', .85),
      ...labels('[data-rating-video-rank]', .98, 'data-rating-video-rank', .035),
      ...labels('[data-rating-video-heading="value"]', 2.22),
      ...labels('[data-rating-video-value]', 2.39, 'data-rating-video-value', .095),
    ]

    function shapes<T>(attribute: string, describe: (shape: Shape, style: CSSStyleDeclaration, order: number) => T) {
      return Array.from(surface.querySelectorAll<SVGElement>(`[${attribute}]`), element => {
        const style = getComputedStyle(element)
        const shape = { element, box: getBox(element), color: style.fill === 'currentcolor' ? style.color : style.fill }
        return describe(shape, style, Number(element.getAttribute(attribute)))
      })
    }

    const highlights = shapes('data-rating-video-highlight', (shape, style, row) => ({
      ...shape, opacity: Number(style.fillOpacity), delay: .98 + .035 * row,
    }))
    const guides = shapes('data-rating-video-guide', (shape, style, order) => {
      const width = parseFloat(style.strokeWidth) * scaleX
      return { ...shape, color: style.stroke, box: { ...shape.box, x: shape.box.x - width / 2, width },
        delay: .42 + .30 * order }
    })
    const bars = shapes('data-rating-video-bar', (shape, _style, direction) => ({ ...shape, fromRight: direction < 0 }))

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
    return { size, text, textImage, highlights, guides, bars }
  })
  const { size, text, textImage, highlights, guides, bars } = scene

  return {
    width: size.canvasWidth,
    height: size.canvasHeight,
    duration: ENEMY_RATING_VIDEO_DURATION,
    drawFrame(context: CanvasRenderingContext2D, seconds: number) {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, size.canvasWidth, size.canvasHeight)
      for (const { box, delay, color, opacity } of highlights) {
        context.globalAlpha = opacity * reveal(seconds, delay, .18)
        context.fillStyle = color
        context.fillRect(box.x, box.y, box.width, box.height)
      }
      context.globalAlpha = 1
      for (const { box, delay, color } of guides) {
        context.fillStyle = color
        context.fillRect(box.x, box.y, box.width, box.height * reveal(seconds, delay, .38))
      }
      const sizeRatio = reveal(seconds, 1.37, .88)
      for (const { box, color, fromRight } of bars) {
        const width = box.width * sizeRatio
        context.fillStyle = color
        context.fillRect(fromRight ? box.x + box.width - width : box.x, box.y, width, box.height)
      }
      for (const { box: { x, y, width, height }, delay, duration } of text) {
        const alpha = reveal(seconds, delay, duration)
        if (alpha === 0) continue
        context.globalAlpha = alpha
        context.drawImage(textImage, x, y, width, height, x, y, width, height)
      }
      context.globalAlpha = 1
    },
  }
}

export async function renderEnemyRatingComparisonVideo(
  chart: ReactNode,
  format: ChartVideoFormat,
  signal?: AbortSignal,
): Promise<Blob> {
  const animation = await prepareEnemyRatingComparisonVideo(chart, signal)
  return recordChartVideo({ ...animation, format, signal })
}
