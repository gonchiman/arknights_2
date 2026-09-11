import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import './GoldenglowPerformanceChartFrame.css'
import './GoldenglowPerformanceChartImage.css'

/** Sizes the whole figure, including its caption, without hiding dense chart data. */
export function GoldenglowPerformanceChartFrame({ minWidth, aspectRatio, imageOutput = false, children }: {
  minWidth: number
  aspectRatio?: number
  imageOutput?: boolean
  children: (minHeight?: number) => ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(1120)
  const baseWidth = Math.max(availableWidth, minWidth)
  // New content or settings must discard previous expansion so dense charts can shrink again.
  const request = useMemo(() => ({}), [baseWidth, aspectRatio, children])
  const [expansion, setExpansion] = useState<{ request: object; width: number } | null>(null)
  const chartWidth = aspectRatio === undefined
    ? undefined
    : Math.max(baseWidth, expansion?.request === request ? expansion.width : 0)
  const chartHeight = aspectRatio === undefined ? undefined : chartWidth! / aspectRatio

  useLayoutEffect(() => {
    const container = containerRef.current
    const figure = container?.querySelector('figure')
    if (!container || !figure) return

    const measure = () => {
      const nextWidth = container.getBoundingClientRect().width
      const contentHeight = figure.getBoundingClientRect().height
      // Image capture must see the fitted size, rather than a queued concurrent render.
      flushSync(() => {
        if (nextWidth > 0) setAvailableWidth(nextWidth)
        if (aspectRatio === undefined || chartWidth === undefined) return
        if (contentHeight > chartWidth / aspectRatio + 0.5) {
          const expandedWidth = Math.ceil(contentHeight * aspectRatio)
          setExpansion((current) => current?.request === request && current.width >= expandedWidth
            ? current : { request, width: expandedWidth })
        }
      })
    }

    // Wait for the child chart to account for its caption before deciding it needs more room.
    let frame = 0
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    scheduleMeasure()
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(figure)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [aspectRatio, chartWidth, request])

  return <div ref={containerRef} className="gg-performance-chart-layout">
    <div className={`gg-performance-chart-size${imageOutput ? ' gg-performance-chart-image' : ''}`} style={{ width: chartWidth, minWidth }}>
      {children(chartHeight)}
    </div>
  </div>
}
