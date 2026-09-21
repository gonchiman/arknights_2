import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import { placeGroupedBarValueLabels } from '../lib/groupedBarValueLabels'
import { ChartImageFrame } from './ChartImageFrame'
import './GoldenglowPerformanceBarChart.css'
import './GoldenglowPerformanceGroupedBarChart.css'

interface GroupedBarChartProps {
  columns: readonly GoldenglowPerformanceChartColumn[]
  resistances: readonly number[]
  metricLabel: string
  valueAxisLabel?: string
  referenceY?: { value: number; label: string }
  conditionLabel?: string
  difference?: boolean
  integerTicks?: boolean
  imageOutput?: boolean
  showValues?: boolean
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
  formatValue: (value: number) => string
  minHeight?: number
}

interface ChartBar {
  id: string
  label: string
  color: string
  value: number | null
  text: string
}

interface ChartModel {
  groups: { resistance: number; bars: ChartBar[] }[]
  ticks: { value: number; text: string }[]
  axisMinimum: number
  axisSpan: number
  axisTitle: string
  reference: { value: number; label: string } | null
}

const IMAGE_CHART_HEIGHT = 334
const FONT_FAMILY = '"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'
const VALUE_HEIGHT = 16
type TextWidths = Record<string, number>

/** Compares the same builds side by side at every selected resistance. */
export function GoldenglowPerformanceGroupedBarChart({
  columns, resistances, metricLabel, valueAxisLabel, referenceY, conditionLabel,
  difference = false, integerTicks = false, imageOutput = false, showValues = false,
  aspectRatio, onLayout, formatValue, minHeight,
}: GroupedBarChartProps) {
  const groups = resistances.map((resistance, groupIndex) => ({
    resistance,
    bars: columns.map((column, columnIndex) => {
      const candidate = column.values.find((value) => value.resistance === resistance)?.expectedTotalDamage
      const value = typeof candidate === 'number' && Number.isFinite(candidate) && (difference || candidate >= 0)
        ? candidate : null
      return {
        id: `${groupIndex}:${columnIndex}:${column.id}`,
        label: column.label,
        color: column.color,
        value,
        text: value === null ? '—' : formatValue(value),
      }
    }),
  }))
  const values = groups.flatMap((group) => group.bars.flatMap((bar) => bar.value === null ? [] : [bar.value]))
  const reference = referenceY && Number.isFinite(referenceY.value) ? referenceY : null
  if (reference) values.push(reference.value)
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(0, ...values)
  const hasExtent = maximum > minimum
  const requestedStep = (hasExtent ? maximum - minimum : 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(requestedStep))
  const tickStep = Math.max(integerTicks ? 1 : 0,
    [1, 2, 5, 10].find((multiple) => multiple * magnitude >= requestedStep)! * magnitude)
  const firstTick = Math.floor(minimum / tickStep)
  const lastTick = hasExtent ? Math.ceil(maximum / tickStep) : 1
  const ticks = hasExtent
    ? Array.from({ length: lastTick - firstTick + 1 }, (_, index) => (firstTick + index) * tickStep)
    : [0]
  const model: ChartModel = {
    groups,
    ticks: ticks.map((value) => ({ value, text: formatValue(value) })),
    axisMinimum: firstTick * tickStep,
    axisSpan: (lastTick - firstTick) * tickStep,
    axisTitle: valueAxisLabel ?? (difference ? '総ダメージの差分' : '総ダメージ'),
    reference,
  }
  const widths = useTextWidths(model)
  const titleId = useId()

  if (imageOutput) return <GroupedBarImage
    model={model} widths={widths} columns={columns} metricLabel={metricLabel}
    conditionLabel={conditionLabel} showValues={showValues} aspectRatio={aspectRatio} onLayout={onLayout} />

  return <figure className="gg-performance-bar-chart gg-performance-grouped-chart" aria-labelledby={titleId}
    style={{ minHeight: minHeight ?? 420 }}>
    <figcaption className="gg-performance-bar-caption">
      <div className="gg-performance-bar-heading">
        <strong id={titleId}>{metricLabel}比較</strong>
        {conditionLabel && <span className="gg-performance-bar-condition">{conditionLabel}</span>}
      </div>
      <ul className="gg-performance-bar-legend" aria-label="比較条件の凡例">
        {columns.map((column) => <li key={column.id}>
          <i style={{ backgroundColor: column.color }} aria-hidden="true" />
          <span>{column.label}</span>
        </li>)}
      </ul>
    </figcaption>
    <ResponsiveGroupedBarPlot model={model} widths={widths} metricLabel={metricLabel}
      showValues={showValues} baseHeight={Math.max(IMAGE_CHART_HEIGHT, (minHeight ?? 420) - 86)} />
  </figure>
}

/** Canvas and SVG use the same font, including after a deferred font load. */
function useTextWidths(model: ChartModel): TextWidths {
  const textKey = JSON.stringify([
    ...model.ticks.map((tick) => ['tick', tick.text]),
    ...model.groups.map((group) => ['tick', String(group.resistance)]),
    ...model.groups.flatMap((group) => group.bars.map((bar) => ['value', bar.text])),
    ['reference', model.reference?.label ?? ''],
  ])
  const [widths, setWidths] = useState<TextWidths>({})
  useLayoutEffect(() => {
    let active = true
    const entries = JSON.parse(textKey) as [string, string][]
    const measure = () => {
      if (!active) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      const next: TextWidths = {}
      for (const [kind, text] of entries) {
        context.font = `${kind === 'value' ? 600 : 400} 11px ${FONT_FAMILY}`
        next[`${kind}:${text}`] = Math.ceil(context.measureText(text).width)
      }
      setWidths((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure) }
  }, [textKey])
  return widths
}

function textWidth(widths: TextWidths, kind: string, text: string): number {
  return widths[`${kind}:${text}`] ?? text.length * 7
}

function createPlotLayout(model: ChartModel, widths: TextWidths, width: number, baseHeight: number, showValues: boolean, imageOutput: boolean) {
  const margin = {
    left: Math.max(48, ...model.ticks.map((tick) => textWidth(widths, 'tick', tick.text) + 12)),
    right: 14,
    top: 34,
    bottom: imageOutput ? 26 : 46,
  }
  const plotWidth = Math.max(1, width - margin.left - margin.right)
  const plotHeight = Math.max(1, baseHeight - margin.top - margin.bottom)
  const y = (value: number) => plotHeight - (value - model.axisMinimum) / model.axisSpan * plotHeight
  const groupWidth = plotWidth / Math.max(1, model.groups.length)
  const bars = model.groups.flatMap((group, groupIndex) => {
    const clusterWidth = groupWidth * 0.8
    const barGap = Math.min(3, clusterWidth / Math.max(1, group.bars.length * 2))
    const barWidth = Math.min(48, Math.max(0, (clusterWidth - barGap * Math.max(0, group.bars.length - 1)) / Math.max(1, group.bars.length)))
    const clusterLeft = groupIndex * groupWidth + (groupWidth - (barWidth * group.bars.length + barGap * Math.max(0, group.bars.length - 1))) / 2
    return group.bars.map((bar, index) => ({
      ...bar,
      resistance: group.resistance,
      x: clusterLeft + index * (barWidth + barGap),
      y: y(bar.value ?? 0),
      width: barWidth,
    }))
  })
  const referenceWidth = model.reference ? textWidth(widths, 'reference', model.reference.label) + 8 : 0
  const referenceBox = model.reference ? {
    x: Math.max(0, plotWidth - referenceWidth), y: y(model.reference.value) - 20, width: referenceWidth, height: 16,
  } : null
  const placement = placeGroupedBarValueLabels({
    labels: showValues ? bars.flatMap((bar) => bar.value === null ? [] : [{
      id: bar.id, anchorX: bar.x + bar.width / 2, anchorY: bar.y,
      width: textWidth(widths, 'value', bar.text) + 2, height: VALUE_HEIGHT,
      direction: bar.value < 0 ? 'below' as const : 'above' as const,
    }]) : [],
    width: plotWidth,
    height: plotHeight,
    gap: 3,
    obstacles: [
      ...bars.map((bar) => ({
        x: bar.value === null ? bar.x + bar.width / 2 - 5 : bar.x,
        y: bar.value === null ? y(0) - 7 : Math.min(y(0), bar.y) - (bar.value === 0 ? 1 : 0),
        width: bar.value === null ? 10 : bar.width,
        height: bar.value === null ? 14 : Math.max(2, Math.abs(y(0) - bar.y)),
      })),
      ...(referenceBox ? [referenceBox] : []),
    ],
  })
  const extraTop = Math.ceil(placement.extraTop)
  const extraBottom = Math.ceil(placement.extraBottom)
  // Keep the end conditions identifiable in dense exports while retaining
  // every bar and numerical value at its original resistance position.
  const resistanceTicks: { resistance: number; index: number }[] = []
  const finalIndex = model.groups.length - 1
  const finalGroup = model.groups[finalIndex]
  const finalLeft = finalGroup
    ? (finalIndex + 0.5) * groupWidth - textWidth(widths, 'tick', String(finalGroup.resistance)) / 2 : 0
  let previousRight = -Infinity
  for (const [index, group] of model.groups.entries()) {
    const halfWidth = textWidth(widths, 'tick', String(group.resistance)) / 2
    const center = (index + 0.5) * groupWidth
    if (index === 0 || index === finalIndex || (center - halfWidth >= previousRight + 8 && center + halfWidth + 8 <= finalLeft)) {
      resistanceTicks.push({ resistance: group.resistance, index })
      previousRight = center + halfWidth
    }
  }
  return { margin, plotWidth, plotHeight, groupWidth, bars, y, referenceBox, placement, extraTop, extraBottom,
    resistanceTicks, height: baseHeight + extraTop + extraBottom }
}

type PlotLayout = ReturnType<typeof createPlotLayout>

function GroupedBarSvg({ model, layout, width, height = layout.height, metricLabel, imageOutput = false }: {
  model: ChartModel; layout: PlotLayout; width: number; height?: number; metricLabel: string; imageOutput?: boolean
}) {
  const titleId = useId()
  const plotTop = layout.margin.top + layout.extraTop
  const plotBottom = plotTop + layout.plotHeight
  const tickY = plotBottom + layout.extraBottom + 20
  const valueById = new Map(layout.bars.map((bar) => [bar.id, bar]))
  return <svg className={`gg-performance-grouped-svg${imageOutput ? ' gg-performance-grouped-svg-image' : ''}`}
    width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
    <title id={titleId}>{metricLabel}・敵の術耐性別の比較</title>
    <text className="gg-performance-grouped-axis-title" x={layout.margin.left} y={18}>{model.axisTitle}</text>
    <g transform={`translate(${layout.margin.left} ${plotTop})`}>
      {model.ticks.map((tick) => <g key={tick.value} aria-hidden="true">
        {tick.value !== model.reference?.value && <line className={`gg-performance-grouped-guide${tick.value === 0 ? ' gg-performance-grouped-guide-zero' : ''}`}
          x1={0} x2={layout.plotWidth} y1={layout.y(tick.value)} y2={layout.y(tick.value)} />}
        <text className="gg-performance-grouped-tick" x={-10} y={layout.y(tick.value) + 4} textAnchor="end">{tick.text}</text>
      </g>)}
      {layout.bars.map((bar) => <g key={bar.id} role="img"
        aria-label={`${bar.label}・術耐性 ${bar.resistance}・${metricLabel} ${bar.text}`}>
        <title>{`${bar.label}・術耐性 ${bar.resistance}・${metricLabel} ${bar.text}`}</title>
        {bar.value === null
          ? <text className="gg-performance-grouped-missing" x={bar.x + bar.width / 2} y={layout.y(0) + 4} textAnchor="middle">—</text>
          : <rect className="gg-performance-grouped-bar" x={bar.x} y={Math.min(layout.y(0), bar.y) - (bar.value === 0 ? 1 : 0)}
            width={bar.width} height={Math.max(2, Math.abs(layout.y(0) - bar.y))} fill={bar.color} />}
      </g>)}
      {model.reference && layout.referenceBox && <g aria-hidden="true">
        <line className="gg-performance-grouped-reference" x1={0} x2={layout.plotWidth}
          y1={layout.y(model.reference.value)} y2={layout.y(model.reference.value)} />
        <rect className="gg-performance-grouped-reference-background" {...layout.referenceBox} />
        <text className="gg-performance-grouped-reference-label" x={layout.plotWidth - 4} y={layout.referenceBox.y + 12}
          textAnchor="end">{model.reference.label}</text>
      </g>}
      {layout.placement.labels.filter((label) => label.shifted).map((label) => {
        const bar = valueById.get(label.id)!
        return <line className="gg-performance-grouped-value-connector" key={label.id} aria-hidden="true"
          x1={label.anchorX} y1={label.anchorY + (bar.value! < 0 ? 2 : -2)}
          x2={label.x + label.width / 2} y2={bar.value! < 0 ? label.y : label.y + label.height} />
      })}
      {layout.placement.labels.map((label) => {
        const bar = valueById.get(label.id)!
        const centerX = label.x + label.width / 2
        return <g className="gg-performance-grouped-value" key={label.id} aria-hidden="true" data-bar-id={label.id}>
          <rect className="gg-performance-grouped-value-background" x={label.x} y={label.y} width={label.width} height={label.height} />
          <text className="gg-performance-grouped-value-label" x={centerX} y={label.y + 12} textAnchor="middle">{bar.text}</text>
        </g>
      })}
    </g>
    {layout.resistanceTicks.map((group) => <text key={`${group.index}:${group.resistance}`} className="gg-performance-grouped-tick"
      x={layout.margin.left + (group.index + 0.5) * layout.groupWidth} y={tickY} textAnchor="middle" aria-hidden="true">{group.resistance}</text>)}
    {!imageOutput && <text className="gg-performance-grouped-axis-title" x={layout.margin.left + layout.plotWidth / 2}
      y={height - 6} textAnchor="middle">敵の術耐性</text>}
  </svg>
}

function ResponsiveGroupedBarPlot({ model, widths, metricLabel, showValues, baseHeight }: {
  model: ChartModel; widths: TextWidths; metricLabel: string; showValues: boolean; baseHeight: number
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(928)
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const nextWidth = Math.floor(frame.getBoundingClientRect().width)
      if (nextWidth > 0) setWidth(nextWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  const layout = createPlotLayout(model, widths, width, baseHeight, showValues, false)
  return <div className="gg-performance-grouped-plot"><div className="gg-performance-grouped-svg-frame" ref={frameRef}>
    <GroupedBarSvg model={model} layout={layout} width={width} metricLabel={metricLabel} />
  </div></div>
}

function GroupedBarImage({ model, widths, columns, metricLabel, conditionLabel, showValues, aspectRatio, onLayout }: {
  model: ChartModel; widths: TextWidths; columns: readonly GoldenglowPerformanceChartColumn[]
  metricLabel: string; conditionLabel?: string; showValues: boolean; aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}) {
  const request = JSON.stringify([model, widths, showValues, aspectRatio, metricLabel, conditionLabel])
  const [expansion, setExpansion] = useState({ request, overflow: 0 })
  const overflow = expansion.request === request ? expansion.overflow : 0
  const reserveOverflow = useCallback((required: number) => {
    // Keep the base plot independent of expansion. A wider frame may need less
    // label space, but shrinking during the same request would cause oscillation.
    setExpansion((current) => current.request === request && current.overflow >= required
      ? current : { request, overflow: Math.max(current.request === request ? current.overflow : 0, required) })
  }, [request])
  const legend = <ul className="chart-image-frame-legend-list" aria-label="比較条件の凡例">
    {columns.map((column) => <li key={column.id} className="chart-image-frame-legend-item">
      <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        <rect x="0" y="4" width="18" height="4" fill={column.color} />
      </svg>
      <span>{column.label}</span>
    </li>)}
  </ul>
  return <ChartImageFrame key={request} title={metricLabel} legend={legend} conditions={conditionLabel}
    axisTitle="敵の術耐性" naturalChartHeight={IMAGE_CHART_HEIGHT + overflow} aspectRatio={aspectRatio} onLayout={onLayout}
    className="gg-performance-grouped-image">
    {({ width, height }) => <ImageGroupedBarPlot model={model} widths={widths} metricLabel={metricLabel}
      showValues={showValues} width={width} height={height} reservedOverflow={overflow} onOverflow={reserveOverflow} />}
  </ChartImageFrame>
}

function ImageGroupedBarPlot({ model, widths, metricLabel, showValues, width, height, reservedOverflow, onOverflow }: {
  model: ChartModel; widths: TextWidths; metricLabel: string; showValues: boolean
  width: number; height: number; reservedOverflow: number; onOverflow: (height: number) => void
}) {
  const baseHeight = Math.max(IMAGE_CHART_HEIGHT, height - reservedOverflow)
  const layout = createPlotLayout(model, widths, width, baseHeight, showValues, true)
  const overflow = layout.extraTop + layout.extraBottom
  useLayoutEffect(() => { onOverflow(overflow) }, [onOverflow, overflow])
  return <GroupedBarSvg model={model} layout={layout} width={width} height={Math.max(height, layout.height)} metricLabel={metricLabel} imageOutput />
}
