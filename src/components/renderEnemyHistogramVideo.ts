import type { ReactNode } from 'react'
import type { ChartImageRasterOutput } from '../lib/chartImageRasterSize'
import { recordChartVideo, type ChartVideoFormat } from '../lib/chartVideoRecorder'
import {
  getEnemyHistogramVideoFrame, getEnemyHistogramVideoTimingBounds,
  type EnemyHistogramVideoTiming,
} from '../lib/enemyHistogramVideoTiming'
import { placeGroupedBarValueLabels } from '../lib/groupedBarValueLabels'
import { avoidHistogramCumulativeLine, avoidHistogramReferenceLines, formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import { withComparisonChartImageSurface } from './saveComparisonChartImage'

type Matrix = Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>
type Point = { x: number; y: number }
type Rect = Point & { width: number; height: number }
type Stroke = { color: string; width: number; opacity: number; dash: number[]; cap: CanvasLineCap; join: CanvasLineJoin }
type Text = {
  matrix: Matrix; x: number; y: number; value: string; font: string; color: string; opacity: number
  align: CanvasTextAlign; baseline: CanvasTextBaseline
}
type Value = Text & { index: number; kind: 'percentage' | 'cumulative' }
type Frequency = { index: number; width: number; height: number; text: Text }

export interface EnemyHistogramVideoAnimation {
  width: number
  height: number
  duration: number
  drawFrame(context: CanvasRenderingContext2D, seconds: number): void
  withTiming(timing: EnemyHistogramVideoTiming): EnemyHistogramVideoAnimation
}

const matrixValues = ({ a, b, c, d, e, f }: Matrix): Matrix => ({ a, b, c, d, e, f })
const color = (style: CSSStyleDeclaration, property: 'fill' | 'stroke') =>
  style[property].toLowerCase() === 'currentcolor' ? style.color : style[property]
const numericAttribute = (element: Element, name: string) => Number(element.getAttribute(name))
const formatShare = (share: number) => formatHistogramPercentage(share, 1)?.replace(/%$/, '').replace(/\.0$/, '') ?? '—'

function strokeStyle(element: SVGElement): Stroke {
  const style = getComputedStyle(element)
  return {
    color: color(style, 'stroke'), width: Number.parseFloat(style.strokeWidth),
    opacity: Number(style.strokeOpacity) * Number(style.opacity),
    dash: style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[\s,]+/).map(Number.parseFloat),
    cap: style.strokeLinecap as CanvasLineCap, join: style.strokeLinejoin as CanvasLineJoin,
  }
}

function applyStroke(context: CanvasRenderingContext2D, style: Stroke) {
  context.strokeStyle = style.color
  context.lineWidth = style.width
  context.globalAlpha = style.opacity
  context.lineCap = style.cap
  context.lineJoin = style.join
  context.setLineDash(style.dash)
}

function drawText(context: CanvasRenderingContext2D, text: Text, value = text.value, position?: Point) {
  context.save()
  const { a, b, c, d, e, f } = text.matrix
  context.transform(a, b, c, d, e, f)
  context.font = text.font
  context.fillStyle = text.color
  context.globalAlpha = text.opacity
  context.textAlign = text.align
  context.textBaseline = text.baseline
  context.fillText(value, position?.x ?? text.x, position?.y ?? text.y)
  context.restore()
}

/** Capture the existing image once; only its measured data marks change per frame. */
export async function prepareEnemyHistogramVideo(
  chart: ReactNode,
  timing: EnemyHistogramVideoTiming,
  output: ChartImageRasterOutput,
  signal?: AbortSignal,
): Promise<EnemyHistogramVideoAnimation> {
  signal?.throwIfAborted()
  const scene = await withComparisonChartImageSurface({ chart, width: 960, output }, async (surface, size) => {
    signal?.throwIfAborted()
    const svg = surface.querySelector<SVGSVGElement>('svg[data-histogram-video-total]')
    const rootMatrix = svg?.getScreenCTM()
    if (!svg || !rootMatrix) throw new Error('動画にするヒストグラムが見つかりませんでした。')
    const bounds = surface.getBoundingClientRect()
    const scaleX = size.canvasWidth / size.width
    const scaleY = size.canvasHeight / size.height
    const transform: Matrix = {
      a: rootMatrix.a * scaleX, b: rootMatrix.b * scaleY,
      c: rootMatrix.c * scaleX, d: rootMatrix.d * scaleY,
      e: (rootMatrix.e - bounds.left) * scaleX, f: (rootMatrix.f - bounds.top) * scaleY,
    }
    const rootInverse = rootMatrix.inverse()
    function localMatrix(element: SVGGraphicsElement) {
      const matrix = element.getScreenCTM()
      if (!matrix) throw new Error('グラフの描画位置を取得できませんでした。')
      return matrixValues(rootInverse.multiply(matrix))
    }
    function textStyle(element: SVGTextElement): Text {
      const style = getComputedStyle(element)
      return {
        matrix: localMatrix(element), x: element.x.baseVal.getItem(0).value, y: element.y.baseVal.getItem(0).value,
        value: element.textContent ?? '', font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        color: color(style, 'fill'), opacity: Number(style.fillOpacity) * Number(style.opacity),
        align: style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left',
        baseline: ['central', 'middle'].includes(style.dominantBaseline) ? 'middle'
          : style.dominantBaseline === 'hanging' ? 'hanging' : 'alphabetic',
      }
    }
    const plot = {
      left: numericAttribute(svg, 'data-histogram-video-plot-left'),
      right: numericAttribute(svg, 'data-histogram-video-plot-right'),
      top: numericAttribute(svg, 'data-histogram-video-plot-top'),
      bottom: numericAttribute(svg, 'data-histogram-video-plot-bottom'),
    }
    const barElements = [...svg.querySelectorAll<SVGRectElement>('[data-histogram-video-bar]')]
      .sort((a, b) => numericAttribute(a, 'data-histogram-video-bar') - numericAttribute(b, 'data-histogram-video-bar'))
    const bars = barElements.map(element => {
      const style = getComputedStyle(element)
      return {
        x: element.x.baseVal.value, y: element.y.baseVal.value, width: element.width.baseVal.value,
        height: element.height.baseVal.value, count: numericAttribute(element, 'data-histogram-video-count'),
        color: color(style, 'fill'), opacity: Number(style.fillOpacity) * Number(style.opacity),
      }
    })
    if (!bars.length || !Object.values(plot).every(Number.isFinite)) throw new Error('ヒストグラムの階級を取得できませんでした。')
    const frequencies: Frequency[] = [...svg.querySelectorAll<SVGTextElement>('[data-frequency-index]')].map(element => ({
      index: numericAttribute(element, 'data-frequency-index'),
      width: numericAttribute(element, 'data-histogram-video-label-width'),
      height: numericAttribute(element, 'data-histogram-video-label-height'), text: textStyle(element),
    }))
    const values: Value[] = [...svg.querySelectorAll<SVGTextElement>('[data-histogram-video-value]')].map(element => ({
      ...textStyle(element), index: numericAttribute(element, 'data-histogram-video-value-index'),
      kind: element.getAttribute('data-histogram-video-value') === 'cumulative' ? 'cumulative' : 'percentage',
    }))
    const lineElement = svg.querySelector<SVGPathElement>('.enemy-histogram-cumulative-line')
    const pointElements = [...svg.querySelectorAll<SVGCircleElement>('.enemy-histogram-cumulative-point')]
    const point = pointElements[0]
    const cumulative = point ? {
      line: lineElement ? strokeStyle(lineElement) : null,
      x: pointElements.map(element => element.cx.baseVal.value), radius: point.r.baseVal.value,
      color: color(getComputedStyle(point), 'fill'), opacity: Number(getComputedStyle(point).fillOpacity),
      stroke: strokeStyle(point),
    } : null
    const referenceElements = [...svg.querySelectorAll<SVGLineElement>('.enemy-chart-reference')]
    const references = referenceElements.map(element => ({
      x1: element.x1.baseVal.value, y1: element.y1.baseVal.value,
      x2: element.x2.baseVal.value, y2: element.y2.baseVal.value, style: strokeStyle(element),
    }))
    const referenceTexts = [...svg.querySelectorAll<SVGTextElement>('.enemy-chart-reference-label')].map(textStyle)
    // Reuse the connector's CSS even when the final layout needs no connector.
    const connectorProbe = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    connectorProbe.setAttribute('class', 'enemy-histogram-value-connector')
    svg.append(connectorProbe)
    const connector = strokeStyle(connectorProbe)
    connectorProbe.remove()
    const { toCanvas } = await import('html-to-image')
    const options = { ...size, pixelRatio: 1, skipFonts: true, backgroundColor: '#fff' }
    const completed = await toCanvas(surface, options)
    signal?.throwIfAborted()
    for (const element of svg.querySelectorAll<SVGElement>([
      '[data-histogram-video-bar]', '[data-frequency-index]', '[data-histogram-video-value]',
      '.enemy-histogram-value-connector', '.enemy-histogram-cumulative-line', '.enemy-histogram-cumulative-point',
      '.enemy-chart-reference', '.enemy-chart-reference-label',
    ].join(','))) element.style.visibility = 'hidden'
    const background = await toCanvas(surface, options)
    signal?.throwIfAborted()
    return { size, transform, plot, bars, frequencies, values, cumulative, references, referenceTexts, connector,
      completed, background, total: numericAttribute(svg, 'data-histogram-video-total') }
  })

  function withTiming(settings: EnemyHistogramVideoTiming): EnemyHistogramVideoAnimation {
    const { finish, duration } = getEnemyHistogramVideoTimingBounds(settings)
    const { size, plot, bars, frequencies, values, cumulative, references, referenceTexts, connector, transform } = scene
    const plotWidth = plot.right - plot.left
    const plotHeight = plot.bottom - plot.top
    const rawCounts = bars.map(bar => bar.count)
    return {
      width: size.canvasWidth, height: size.canvasHeight, duration, withTiming,
      drawFrame(context, seconds) {
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        if (seconds >= finish) {
          context.drawImage(scene.completed, 0, 0)
          context.restore()
          return
        }
        context.drawImage(scene.background, 0, 0)
        const frame = getEnemyHistogramVideoFrame(settings, seconds, rawCounts, scene.total)
        context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
        const currentBars = bars.map((bar, index): Rect => ({
          x: bar.x - plot.left, y: plotHeight - bar.height * frame.progress[index],
          width: bar.width, height: bar.height * frame.progress[index],
        }))
        for (const [index, bar] of bars.entries()) {
          const current = currentBars[index]
          context.fillStyle = bar.color
          context.globalAlpha = bar.opacity
          context.fillRect(bar.x, plot.top + current.y, bar.width, current.height)
        }
        for (const reference of references) {
          applyStroke(context, reference.style)
          context.beginPath()
          context.moveTo(reference.x1, reference.y1)
          context.lineTo(reference.x2, reference.y2)
          context.stroke()
        }
        for (const text of referenceTexts) drawText(context, text)
        const lineVisible = cumulative && seconds >= (settings.valueMode === 'linked' ? settings.bars.start : settings.values.start)
        const cumulativePoints = lineVisible ? cumulative.x.map((x, index) => ({
          x, y: plot.bottom - frame.cumulativeShares[index] * plotHeight,
        })) : []
        const cutoff = cumulativePoints.length > 1
          ? cumulativePoints[0].x + (cumulativePoints.at(-1)!.x - cumulativePoints[0].x) * frame.cumulativeProgress
          : cumulativePoints[0]?.x ?? 0
        const visiblePoints = cumulativePoints.filter(point => point.x <= cutoff)
        const linePoints = [...visiblePoints]
        if (visiblePoints.length && visiblePoints.length < cumulativePoints.length) {
          const from = visiblePoints.at(-1)!, to = cumulativePoints[visiblePoints.length]
          linePoints.push({ x: cutoff, y: from.y + (to.y - from.y) * (cutoff - from.x) / (to.x - from.x) })
        }
        if (cumulative && lineVisible) {
          if (cumulative.line && linePoints.length > 1) {
            applyStroke(context, cumulative.line)
            context.beginPath()
            for (const [index, point] of linePoints.entries()) {
              if (index === 0) context.moveTo(point.x, point.y)
              else context.lineTo(point.x, point.y)
            }
            context.stroke()
          }
          for (const point of visiblePoints) {
            context.beginPath()
            context.arc(point.x, point.y, cumulative.radius, 0, Math.PI * 2)
            context.fillStyle = cumulative.color
            context.globalAlpha = cumulative.opacity
            context.fill()
            applyStroke(context, cumulative.stroke)
            context.stroke()
          }
        }
        for (const value of values) {
          if (value.kind === 'percentage') {
            if (frame.visible[value.index]) drawText(context, value, formatShare(frame.shares[value.index]))
          } else if (settings.valueMode === 'linked' ? seconds >= settings.bars.start
            : seconds >= settings.values.start && value.index / Math.max(1, bars.length - 1) <= frame.cumulativeProgress) {
            drawText(context, value, formatShare(frame.cumulativeShares[value.index]))
          }
        }
        if (frequencies.length) {
          const formattedCounts = frame.counts.map((count, index) => count.toLocaleString('ja-JP', {
            maximumFractionDigits: Number.isInteger(rawCounts[index]) ? 0 : 3,
          }))
          context.save()
          const widths = new Map(frequencies.map(label => {
            context.font = label.text.font
            return [label.index, Math.max(label.width, Math.ceil(context.measureText(formattedCounts[label.index]).width) + 6)]
          }))
          context.restore()
          const inputs = frequencies.filter(label => frame.visible[label.index]).map(label => ({
            id: String(label.index), anchorX: currentBars[label.index].x + currentBars[label.index].width / 2,
            anchorY: currentBars[label.index].y, width: widths.get(label.index)!, height: label.height, direction: 'above' as const,
          }))
          const placement = placeGroupedBarValueLabels({ width: plotWidth, height: plotHeight, gap: 4,
            labels: inputs, obstacles: currentBars.filter(bar => bar.height > 0) })
          const withReferences = avoidHistogramReferenceLines({ layout: placement,
            referenceXs: references.map(reference => reference.x1 - plot.left), width: plotWidth, height: plotHeight, bars: currentBars })
          const layout = avoidHistogramCumulativeLine({ layout: withReferences,
            points: linePoints.map(point => ({ x: point.x - plot.left, y: point.y - plot.top })), bars: currentBars })
          for (const label of layout.labels) {
            const frequency = frequencies.find(frequency => frequency.index === Number(label.id))!
            if (label.shifted) {
              applyStroke(context, connector)
              context.beginPath()
              context.moveTo(plot.left + label.anchorX, plot.top + label.anchorY - 2)
              context.lineTo(plot.left + label.x + label.width / 2, plot.top + label.y + label.height)
              context.stroke()
            }
            drawText(context, frequency.text, formattedCounts[frequency.index], { x: label.x + label.width / 2, y: label.y + label.height / 2 })
          }
        }
        context.restore()
      },
    }
  }
  return withTiming(timing)
}

export async function renderEnemyHistogramVideo(
  chart: ReactNode,
  format: ChartVideoFormat,
  timing: EnemyHistogramVideoTiming,
  output: ChartImageRasterOutput,
  signal?: AbortSignal,
): Promise<Blob> {
  const { width, height, duration, drawFrame } = await prepareEnemyHistogramVideo(chart, timing, output, signal)
  return recordChartVideo({ width, height, duration, drawFrame, format, signal })
}
