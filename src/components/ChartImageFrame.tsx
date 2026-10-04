import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { CHART_IMAGE_DEFAULT_CHROME_HEIGHT, getChartImageLayout, type ChartImageLayout } from '../lib/chartImageLayout'
import { hasChartImageInkCollision } from '../lib/chartImageInkCollision'
import './ChartImageFrame.css'

export interface ChartImageFrameProps {
  title: string
  legend?: ReactNode
  conditions?: string
  axisTitle?: string
  naturalChartHeight: number
  informationPlacement?: 'header' | 'top-right-box'
  aspectRatio?: number
  className?: string
  onLayout?: (size: { width: number; height: number }) => void
  children: (size: { width: number; height: number }) => ReactNode
}

/** Shared export layout. Usage and approved examples: docs/chart-image/README.md. */
export function ChartImageFrame({
  naturalChartHeight, aspectRatio, onLayout, ...props
}: ChartImageFrameProps) {
  const [measurement, setMeasurement] = useState({ chromeHeight: CHART_IMAGE_DEFAULT_CHROME_HEIGHT, minimumChartHeight: 0 })
  const naturalHeight = Number.isFinite(naturalChartHeight) && naturalChartHeight > 0 ? naturalChartHeight : 334
  const layout = getChartImageLayout({ naturalChartHeight: Math.max(naturalHeight, measurement.minimumChartHeight),
    aspectRatio, chromeHeight: measurement.chromeHeight })
  const onMeasure = useCallback((next: ChartImageSurfaceMeasurement) => {
    // Only grow within one snapshot: wider images can wrap less and otherwise oscillate.
    setMeasurement((current) => current.chromeHeight >= next.chromeHeight && current.minimumChartHeight >= next.minimumChartHeight
      ? current : { chromeHeight: Math.max(current.chromeHeight, next.chromeHeight),
        minimumChartHeight: Math.max(current.minimumChartHeight, next.minimumChartHeight) })
  }, [])

  useLayoutEffect(() => { onLayout?.({ width: layout.width, height: layout.height }) }, [onLayout, layout.width, layout.height])
  return <ChartImageSurface {...props} layout={layout} onMeasure={onMeasure} />
}

export interface ChartImageSurfaceMeasurement {
  chromeHeight: number
  minimumChartHeight: number
}

/** One header renderer keeps single-panel and shared-stack headings identical. */
export function ChartImageHeading({ title, legend, conditions, informationPlacement = 'header', headingRef }: Pick<ChartImageFrameProps,
  'title' | 'legend' | 'conditions' | 'informationPlacement'> & { headingRef?: Ref<HTMLElement> }) {
  const boxed = informationPlacement === 'top-right-box'
  return <figcaption ref={headingRef} className={`chart-image-frame-heading${boxed ? ' is-top-right-box' : ''}`}>
    {boxed ? <>
      <strong>{title}</strong>
      {legend && <div className="chart-image-frame-legends">{legend}</div>}
      {conditions && <p className="chart-image-frame-conditions">{conditions}</p>}
    </> : <>
      <div className="chart-image-frame-legends">{legend}</div>
      <strong>{title}</strong>
      <p className="chart-image-frame-conditions">{conditions}</p>
    </>}
  </figcaption>
}

/** Shared rendering surface for single and stacked exports; dimensions are owned by their frames. */
export function ChartImageSurface({ title, legend, conditions, axisTitle, informationPlacement = 'header', className, children,
  layout, onMeasure }: Omit<ChartImageFrameProps, 'naturalChartHeight' | 'aspectRatio' | 'onLayout'> & {
  layout: ChartImageLayout
  onMeasure: (measurement: ChartImageSurfaceMeasurement) => void
}) {
  const headingRef = useRef<HTMLElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [reservedBoxHeight, setReservedBoxHeight] = useState(0)
  const boxed = informationPlacement === 'top-right-box'

  useLayoutEffect(() => {
    const heading = headingRef.current
    const footer = footerRef.current
    const plot = plotRef.current
    if (!heading || !footer || !plot) return
    const measure = () => {
      if (boxed) {
        const area = plot.querySelector<SVGElement>('[data-chart-image-plot-area]')
        const surface = plot.parentElement
        if (area && surface) {
          const bounds = area.getBoundingClientRect()
          const surfaceBounds = surface.getBoundingClientRect()
          const scale = surface.offsetWidth > 0 ? surfaceBounds.width / surface.offsetWidth : 1
          if (scale > 0 && bounds.width > 0 && bounds.height > 0) {
            // Anchor inside the data rectangle, below rank strips and axis captions.
            // Reserved padding moves the plot; the box must keep its original anchor.
            heading.style.setProperty('--chart-image-box-top', `${(bounds.top - surfaceBounds.top) / scale - reservedBoxHeight + 8}px`)
            heading.style.setProperty('--chart-image-box-right', `${(surfaceBounds.right - bounds.right) / scale + 8}px`)
          }
        }
      }
      const headingBounds = heading.getBoundingClientRect()
      const scale = heading.offsetWidth > 0 ? headingBounds.width / heading.offsetWidth : 1
      const boxClearance = scale > 0 ? Math.ceil((headingBounds.bottom - plot.getBoundingClientRect().top) / scale + 8) : heading.offsetHeight + 48
      // Keep the approved overlay when the upper-right corner is empty. Once ink overlaps,
      // reserve a strip above the plot for the rest of this snapshot, including later wraps.
      const reserve = boxed && (reservedBoxHeight > 0 || hasChartImageInkCollision(plot, heading))
        ? Math.max(reservedBoxHeight, boxClearance) : 0
      if (reserve > reservedBoxHeight) setReservedBoxHeight(reserve)
      onMeasure({ chromeHeight: (boxed ? reserve : heading.offsetHeight) + footer.offsetHeight + 24,
        minimumChartHeight: boxed && reserve === 0 ? boxClearance : 0 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(heading)
    observer.observe(footer)
    if (boxed) observer.observe(plot)
    let frame = 0
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    const mutations = new MutationObserver(scheduleMeasure)
    if (boxed) mutations.observe(plot, { childList: true, subtree: true, attributes: true, characterData: true })
    return () => { observer.disconnect(); mutations.disconnect(); window.cancelAnimationFrame(frame) }
  }, [boxed, onMeasure, reservedBoxHeight])

  return <figure className={`chart-image-frame${boxed ? ' has-top-right-box' : ''}${className ? ` ${className}` : ''}`}
    data-chart-image-information-reserved={boxed && reservedBoxHeight > 0 || undefined}
    style={{ width: layout.width, height: layout.height }} aria-label={title}>
    <ChartImageHeading title={title} legend={legend} conditions={conditions} informationPlacement={informationPlacement} headingRef={headingRef} />
    <div ref={plotRef} className="chart-image-frame-plot" style={boxed && reservedBoxHeight > 0 ? { paddingTop: reservedBoxHeight } : undefined}>
      {children({ width: layout.width - 32, height: layout.chartHeight })}
    </div>
    <div ref={footerRef} className={`chart-image-frame-footer${axisTitle ? ' has-axis-title' : ''}`}>
      {axisTitle && <p className="chart-image-frame-axis-title">{axisTitle}</p>}
    </div>
  </figure>
}
