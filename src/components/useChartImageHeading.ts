import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** Keeps the image title centered and moves conditions into the legend when needed. */
export function useChartImageHeading(enabled: boolean, title: string, condition?: string) {
  const headingRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)
  const [conditionInLegend, setConditionInLegend] = useState(false)

  useLayoutEffect(() => {
    if (!enabled || !condition) {
      setConditionInLegend(false)
      return
    }
    const heading = headingRef.current
    const headingTitle = titleRef.current
    if (!heading || !headingTitle) return

    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      context.font = `12px ${getComputedStyle(heading).fontFamily}`
      const width = heading.getBoundingClientRect().width
      const titleWidth = headingTitle.getBoundingClientRect().width
      setConditionInLegend(context.measureText(condition).width + 16 > (width - titleWidth) / 2)
    }
    const measureResize = () => {
      if (cancelled) return
      // Image capture must see the final heading layout after its width changes.
      flushSync(measure)
    }

    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureResize)
    observer?.observe(heading)
    observer?.observe(headingTitle)
    if (!observer) window.addEventListener('resize', measureResize)

    return () => {
      cancelled = true
      observer?.disconnect()
      window.removeEventListener('resize', measureResize)
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [enabled, title, condition])

  return { headingRef, titleRef, conditionInLegend: enabled && !!condition && conditionInLegend }
}
