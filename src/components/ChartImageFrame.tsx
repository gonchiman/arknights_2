import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CHART_IMAGE_DEFAULT_CHROME_HEIGHT, getChartImageLayout } from '../lib/chartImageLayout'
import './ChartImageFrame.css'

export interface ChartImageFrameProps {
  title: string
  legend?: ReactNode
  conditions?: string
  axisTitle?: string
  naturalChartHeight: number
  aspectRatio?: number
  className?: string
  onLayout?: (size: { width: number; height: number }) => void
  children: (size: { width: number; height: number }) => ReactNode
}

/** Shared export layout. Usage and approved examples: docs/chart-image/README.md. */
export function ChartImageFrame({
  title, legend, conditions, axisTitle, naturalChartHeight, aspectRatio, className, onLayout, children,
}: ChartImageFrameProps) {
  const headingRef = useRef<HTMLElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [chromeHeight, setChromeHeight] = useState(CHART_IMAGE_DEFAULT_CHROME_HEIGHT)
  const layout = getChartImageLayout({ naturalChartHeight, aspectRatio, chromeHeight })

  useLayoutEffect(() => {
    const heading = headingRef.current
    const footer = footerRef.current
    if (!heading || !footer) return
    const measure = () => {
      const measured = heading.offsetHeight + footer.offsetHeight + 24
      // A wider image can wrap less. Only grow during this snapshot to avoid
      // alternating between a narrow/tall header and a wide/short header.
      setChromeHeight((current) => Math.max(current, measured))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(heading)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => { onLayout?.({ width: layout.width, height: layout.height }) }, [onLayout, layout.width, layout.height])

  return <figure className={`chart-image-frame${className ? ` ${className}` : ''}`}
    style={{ width: layout.width, height: layout.height }} aria-label={title}>
    <figcaption ref={headingRef} className="chart-image-frame-heading">
      <div className="chart-image-frame-legends">{legend}</div>
      <strong>{title}</strong>
      <p className="chart-image-frame-conditions">{conditions}</p>
    </figcaption>
    <div className="chart-image-frame-plot">
      {children({ width: layout.width - 32, height: layout.chartHeight })}
    </div>
    <div ref={footerRef} className={`chart-image-frame-footer${axisTitle ? ' has-axis-title' : ''}`}>
      {axisTitle && <p className="chart-image-frame-axis-title">{axisTitle}</p>}
    </div>
  </figure>
}
