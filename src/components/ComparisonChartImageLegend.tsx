import { useLayoutEffect, useState, type RefObject } from 'react'

export interface ImageChartLegendItem {
  id: string
  label: string
  color: string
  dashPattern?: string
  lineWidth?: number
}

interface ImageChartLegendEntry extends ImageChartLegendItem {
  lines: string[]
  y: number
}

export interface ImageChartLegendLayout {
  width: number
  height: number
  entries: ImageChartLegendEntry[]
  conditionLines: string[]
  fontSize: number
  lineHeight: number
}

const FONT_SIZE = 15
const PADDING = 10
const SWATCH_SPACE = 50

/** Measure the same font that the exported SVG uses, including after font loading. */
export function useImageChartLegend(
  enabled: boolean,
  items: ImageChartLegendItem[],
  availableWidth: number,
  frameRef: RefObject<HTMLDivElement | null>,
  condition?: string,
  fontSize = FONT_SIZE,
): ImageChartLegendLayout | null {
  const [layout, setLayout] = useState<ImageChartLegendLayout | null>(null)

  useLayoutEffect(() => {
    if (!enabled) return
    let cancelled = false
    const measure = () => {
      if (cancelled || !frameRef.current) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      const family = getComputedStyle(frameRef.current).fontFamily
      context.font = `12px ${family}`
      const conditionLines: string[] = []
      let conditionLine = ''
      for (const character of Array.from(condition ?? '')) {
        if (conditionLine && context.measureText(conditionLine + character).width > availableWidth - 2 * PADDING) {
          conditionLines.push(conditionLine)
          conditionLine = character
        } else conditionLine += character
      }
      if (conditionLine) conditionLines.push(conditionLine)
      const conditionWidth = Math.max(0, ...conditionLines.map((line) => context.measureText(line).width))
      context.font = `${fontSize}px ${family}`
      const lineHeight = fontSize * 1.6
      const textWidth = Math.max(fontSize, availableWidth - 2 * PADDING - SWATCH_SPACE)
      let y = PADDING + (conditionLines.length ? conditionLines.length * 20 + 4 : 0)
      let widestLine = 0
      const entries = items.map((item) => {
        const lines: string[] = []
        let line = ''
        for (const character of Array.from(item.label)) {
          if (line && context.measureText(line + character).width > textWidth) {
            lines.push(line)
            line = character
          } else line += character
        }
        lines.push(line)
        for (const text of lines) widestLine = Math.max(widestLine, context.measureText(text).width)
        const entry = { ...item, lines, y }
        y += lines.length * lineHeight + 4
        return entry
      })
      const next = {
        width: Math.ceil(2 * PADDING + Math.max(conditionWidth, entries.length ? widestLine + SWATCH_SPACE : 0)),
        height: y + PADDING - (entries.length ? 4 : 0),
        entries,
        conditionLines,
        fontSize,
        lineHeight,
      }
      setLayout((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [enabled, items, availableWidth, frameRef, condition, fontSize])

  return enabled ? layout : null
}

export function ComparisonChartImageLegend({ layout, x, y, placement }: {
  layout: ImageChartLegendLayout
  x: number
  y: number
  placement: string
}) {
  return <g className="build-comparison-chart-image-legend" transform={`translate(${x} ${y})`}
    data-legend-placement={placement} role="list" aria-label="比較系列の凡例">
    <rect width={layout.width} height={layout.height} fill="#fff" />
    {layout.conditionLines.map((line, index) => <text key={`condition-${index}`}
      className="build-comparison-chart-image-condition" x={PADDING} y={PADDING + 14 + index * 20}>{line}</text>)}
    {layout.entries.map((entry, index) => <g key={`${entry.id}-${index}`} role="listitem" aria-label={entry.label}>
      <line x1={PADDING} x2={PADDING + 42} y1={entry.y + layout.lineHeight / 2 - 1} y2={entry.y + layout.lineHeight / 2 - 1}
        stroke={entry.color} strokeDasharray={entry.dashPattern} strokeWidth={entry.lineWidth ?? 2} strokeLinecap="round" />
      {entry.lines.map((line, lineIndex) => <text key={lineIndex}
        style={{ fontSize: layout.fontSize, fontWeight: 400 }}
        x={PADDING + SWATCH_SPACE} y={entry.y + layout.fontSize + 2 + lineIndex * layout.lineHeight}>{line}</text>)}
    </g>)}
  </g>
}
