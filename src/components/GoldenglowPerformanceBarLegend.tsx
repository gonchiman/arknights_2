import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { placeChartLegend } from '../lib/chartLegendPlacement'
import './GoldenglowPerformanceBarLegend.css'

type Placement = NonNullable<ReturnType<typeof placeChartLegend>>
type LegendLayout = { mode: 'measure' | 'outside' } | { mode: 'inside'; placement: Placement }

const OBSTACLE_SELECTOR = [
  '.gg-performance-bar-segment', '.gg-performance-vertical-segment',
  '.gg-performance-bar-label', '.gg-performance-vertical-label',
  '.gg-performance-bar-total', '.gg-performance-vertical-total',
  '.gg-performance-bar-parts', '.gg-performance-bar-ticks > span',
  '.gg-performance-vertical-scale > span',
  '.gg-performance-bar-zero', '.gg-performance-vertical-zero',
].join(', ')

/** Keeps the export legend out of the caption without covering any drawn values. */
export function GoldenglowPerformanceBarLegend({ vertical, parts, condition, note }: {
  vertical: boolean
  parts: readonly { key: string; label: string; color: string }[]
  condition?: string
  note?: string
}) {
  const legendRef = useRef<HTMLUListElement>(null)
  const [layout, setLayout] = useState<LegendLayout>({ mode: 'measure' })
  const measuredWidth = useRef<number | null>(null)

  useLayoutEffect(() => {
    const legend = legendRef.current
    const plotElement = legend?.parentElement
    if (!plotElement || !legend) return

    const measure = () => {
      const host = plotElement.getBoundingClientRect()
      if (host.width <= 0 || host.height <= 0) return
      if (layout.mode === 'outside') {
        // An outside legend consumes height. Do not reconsider that smaller plot
        // and oscillate between inside and outside during image layout fitting.
        if (measuredWidth.current !== null && Math.abs(host.width - measuredWidth.current) > 0.5) {
          setLayout({ mode: 'measure' })
        }
        return
      }

      measuredWidth.current = host.width
      const rectFor = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left - host.left, y: rect.top - host.top, width: rect.width, height: rect.height }
      }
      const tracks = [...plotElement.querySelectorAll('.gg-performance-bar-track')].map(rectFor)
      const guide = plotElement.querySelector('.gg-performance-vertical-guides')
      const padding = getComputedStyle(plotElement)
      const horizontalLeft = tracks.length ? Math.min(...tracks.map((track) => track.x)) : 0
      const horizontalRight = tracks.length ? Math.max(...tracks.map((track) => track.x + track.width)) : host.width
      const plot = vertical && guide ? rectFor(guide) : {
        x: horizontalLeft,
        y: parseFloat(padding.paddingTop) || 0,
        width: horizontalRight - horizontalLeft,
        height: host.height - (parseFloat(padding.paddingTop) || 0) - (parseFloat(padding.paddingBottom) || 0),
      }
      const obstacles = [...plotElement.querySelectorAll(OBSTACLE_SELECTOR)]
        .map(rectFor).filter((rect) => rect.width > 0 && rect.height > 0)
      const legendRect = legend.getBoundingClientRect()
      const placement = placeChartLegend({
        plot,
        legend: { width: legendRect.width, height: legendRect.height },
        obstacles,
        inset: 10,
        clearance: 6,
      })
      setLayout((current) => {
        if (!placement) return { mode: 'outside' }
        if (current.mode === 'inside'
          && Math.abs(current.placement.x - placement.x) < 0.1
          && Math.abs(current.placement.y - placement.y) < 0.1
          && Math.abs(current.placement.width - placement.width) < 0.1
          && Math.abs(current.placement.height - placement.height) < 0.1) return current
        return { mode: 'inside', placement }
      })
    }

    measure()
    const observer = new ResizeObserver(() => {
      // The PNG exporter waits for stable dimensions; expose observer updates
      // immediately instead of leaving a concurrent render queued for capture.
      flushSync(measure)
    })
    observer.observe(plotElement)
    observer.observe(legend)
    return () => observer.disconnect()
  }, [layout.mode, vertical])

  return <ul
    ref={legendRef}
    className={`gg-performance-bar-image-legend gg-performance-bar-image-legend-${layout.mode}`}
    aria-label={parts.length ? 'ダメージ内訳の凡例と条件' : 'グラフの条件'}
    data-legend-placement={layout.mode === 'inside' ? layout.placement.corner : layout.mode}
    style={layout.mode === 'inside' ? { left: layout.placement.x, top: layout.placement.y } : undefined}
  >
    {condition && <li className="gg-performance-bar-image-legend-condition">{condition}</li>}
    {parts.map((part) => <li key={part.key}>
      <i style={{ backgroundColor: part.color }} aria-hidden="true" />
      <span style={{ color: part.color }}>{part.label}</span>
    </li>)}
    {note && <li className="gg-performance-bar-image-legend-note">{note}</li>}
  </ul>
}
