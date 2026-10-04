import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CHART_IMAGE_STACK_HEADER_HEIGHT, getChartImageStackLayout } from '../lib/chartImageStackLayout'
import { CHART_IMAGE_DEFAULT_CHROME_HEIGHT } from '../lib/chartImageLayout'
import { ChartImageHeading, ChartImageSurface, type ChartImageFrameProps, type ChartImageSurfaceMeasurement } from './ChartImageFrame'
import './ChartImageStackFrame.css'

export interface ChartImageStackPanel {
  id: string
  title: string
  legend?: ReactNode
  conditions?: string
  axisTitle?: string
  naturalChartHeight: number
  informationPlacement?: ChartImageFrameProps['informationPlacement']
  className?: string
  render: (size: { width: number; height: number; reservedOverflow: number; onOverflow: (height: number) => void }) => ReactNode
}

export interface ChartImageStackFrameProps {
  panels: ChartImageStackPanel[]
  sharedHeader?: Pick<ChartImageFrameProps, 'title' | 'legend' | 'conditions'>
  aspectRatio?: number
  gap?: number
  className?: string
  onLayout?: (size: { width: number; height: number }) => void
}

interface PanelMeasurement extends ChartImageSurfaceMeasurement { overflow: number }

/** Mount with a snapshot/aspect key so old wrap measurements never leak into another saved image. */
export function ChartImageStackFrame({ panels, sharedHeader, aspectRatio, gap, className, onLayout }: ChartImageStackFrameProps) {
  const [measurements, setMeasurements] = useState<Record<string, PanelMeasurement>>({})
  const sharedHeadingRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(CHART_IMAGE_STACK_HEADER_HEIGHT)
  const hasSharedHeader = !!sharedHeader
  const layout = getChartImageStackLayout({ panels: panels.map((panel) => ({ naturalChartHeight: panel.naturalChartHeight,
    ...measurements[panel.id] })), aspectRatio, gap, headerHeight: hasSharedHeader ? headerHeight : 0 })
  const updateMeasurement = useCallback((id: string, next: Partial<PanelMeasurement>) => {
    setMeasurements((current) => {
      const previous = current[id] ?? { chromeHeight: CHART_IMAGE_DEFAULT_CHROME_HEIGHT, minimumChartHeight: 0, overflow: 0 }
      const updated = { ...previous }
      for (const key of ['chromeHeight', 'minimumChartHeight', 'overflow'] as const) {
        if (next[key] !== undefined && Number.isFinite(next[key]) && next[key] >= 0) updated[key] = Math.max(previous[key], Math.ceil(next[key]))
      }
      return updated.chromeHeight === previous.chromeHeight && updated.minimumChartHeight === previous.minimumChartHeight
        && updated.overflow === previous.overflow ? current : { ...current, [id]: updated }
    })
  }, [])
  useLayoutEffect(() => {
    const heading = sharedHeadingRef.current
    if (!hasSharedHeader || !heading) return
    const measure = () => setHeaderHeight(current => Math.max(current, Math.ceil(heading.offsetHeight + 12)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(heading)
    return () => observer.disconnect()
  }, [hasSharedHeader])
  useLayoutEffect(() => { onLayout?.({ width: layout.width, height: layout.height }) }, [onLayout, layout.width, layout.height])

  const renderedPanels = panels.map((panel, index) => <StackPanel key={panel.id} panel={panel} width={layout.width}
    layout={layout.panels[index]} reservedOverflow={measurements[panel.id]?.overflow ?? 0} onMeasure={updateMeasurement} />)
  return <div className={`chart-image-stack-frame${hasSharedHeader ? ' has-shared-header' : ''}${className ? ` ${className}` : ''}`}
    style={{ width: layout.width, height: layout.height, gap: hasSharedHeader ? undefined : layout.gap }}>
    {sharedHeader ? <>
      <figure className="chart-image-frame chart-image-stack-header" style={{ width: layout.width, height: headerHeight }} aria-label={sharedHeader.title}>
        <ChartImageHeading {...sharedHeader} headingRef={sharedHeadingRef} />
      </figure>
      <div className="chart-image-stack-panels" style={{ gap: layout.gap }}>{renderedPanels}</div>
    </> : renderedPanels}
  </div>
}

function StackPanel({ panel, width, layout, reservedOverflow, onMeasure }: {
  panel: ChartImageStackPanel
  width: number
  layout: { height: number; chartHeight: number }
  reservedOverflow: number
  onMeasure: (id: string, next: Partial<PanelMeasurement>) => void
}) {
  const measureSurface = useCallback((next: ChartImageSurfaceMeasurement) => onMeasure(panel.id, next), [onMeasure, panel.id])
  const onOverflow = useCallback((overflow: number) => onMeasure(panel.id, { overflow }), [onMeasure, panel.id])
  return <ChartImageSurface title={panel.title} legend={panel.legend} conditions={panel.conditions} axisTitle={panel.axisTitle}
    informationPlacement={panel.informationPlacement} className={panel.className} layout={{ width, ...layout }} onMeasure={measureSurface}>
    {({ width: plotWidth, height }) => panel.render({ width: plotWidth, height, reservedOverflow, onOverflow })}
  </ChartImageSurface>
}
