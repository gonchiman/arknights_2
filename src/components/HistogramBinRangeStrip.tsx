import { useLayoutEffect, useRef, useState } from 'react'
import { getHistogramBinRangeStripLayout, getHistogramBinRangeWrappedLines, type HistogramBinRangeStripLayout } from '../lib/histogramBinRangeStrip'
import { ChartStripCell } from './ChartStripCell'

export { getHistogramBinRangeStripLayout } from '../lib/histogramBinRangeStrip'
export type { HistogramBinRangeStripLayout } from '../lib/histogramBinRangeStrip'

interface TextWidths {
  key: string
  widths: Record<string, number>
}

/** The measureRef must be attached to a hidden SVG text with the chart-strip-label class. */
export function useHistogramBinRangeStripLayout(labels: readonly (readonly string[])[], plotWidth: number, enabled: boolean) {
  const measureRef = useRef<SVGTextElement>(null)
  const labelKey = JSON.stringify(labels)
  const [measured, setMeasured] = useState<TextWidths | null>(null)

  useLayoutEffect(() => {
    const probe = measureRef.current
    if (!enabled || !probe) return
    let active = true
    const currentLabels = JSON.parse(labelKey) as string[][]
    const texts = [...new Set(currentLabels.flatMap(lines => [lines.join(''), ...lines, ...getHistogramBinRangeWrappedLines(lines)]))]
    const measure = () => {
      if (!active) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      const style = getComputedStyle(probe)
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const widths = Object.fromEntries(texts.map(text => [text, Math.ceil(context.measureText(text).width)]))
      setMeasured(current => current?.key === labelKey && JSON.stringify(current.widths) === JSON.stringify(widths)
        ? current : { key: labelKey, widths })
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure) }
  }, [enabled, labelKey])

  const layout = enabled ? getHistogramBinRangeStripLayout(labels, plotWidth,
    measured?.key === labelKey ? text => measured.widths[text] : undefined) : null
  return { measureRef, layout }
}

export interface HistogramBinRangeStripProps {
  layout: HistogramBinRangeStripLayout
  plotLeft: number
  plotRight: number
  top: number
}

/** Numeric range cells retain the same slots and pale fill as the other chart strips. */
export function HistogramBinRangeStrip({ layout, plotLeft, plotRight, top }: HistogramBinRangeStripProps) {
  const width = plotRight - plotLeft
  if (!layout.labels.length || ![plotLeft, plotRight, top, width].every(Number.isFinite) || width <= 0) return null
  const cellWidth = width / layout.labels.length
  const cellInset = Math.min(1.5, cellWidth * 0.2)

  return <g data-histogram-range-strip="bottom" role="group" aria-label="階級">
    <text className="chart-strip-title" data-chart-image-ink="true"
      x={plotLeft - 8} y={top + layout.height / 2 + 4} textAnchor="end">階級</text>
    {layout.labels.map((lines, index) => {
      const left = plotLeft + index * cellWidth
      const labelY = top + Math.floor(layout.height / 2 + 4 - (lines.length - 1) * 15 / 2)
      return <g key={index} data-bin-range-index={index}>
        <ChartStripCell left={left} width={cellWidth} top={top} height={layout.height}
          leftInset={index > 0 ? cellInset : 0} rightInset={index < layout.labels.length - 1 ? cellInset : 0}
          label={lines[0]} labelY={labelY} />
        {lines.slice(1).map((line, lineIndex) => <text key={lineIndex} className="chart-strip-label" data-chart-image-ink="true"
          x={left + cellWidth / 2} y={labelY + (lineIndex + 1) * 15} textAnchor="middle">{line}</text>)}
      </g>
    })}
  </g>
}
