import { useId } from 'react'
import type { BarChartStack } from '../lib/barChartDocument'
import { BAR_CHART_BAND_GAP, BAR_CHART_PERCENT_TICKS, BAR_CHART_STACK_BOTTOM_HEIGHT, BAR_CHART_STACK_HEADER_HEIGHT, getBarChartNaturalHeight } from '../lib/barChartLayout'
import { getBarChartBarWidth, getBarChartItemKind } from '../lib/barChartPresentation'
import { BarChartHighlightTargets } from './BarChartHighlightTargets'
import { ChartStripRowCell } from './ChartStripCell'
import type { BarChartPlotProps } from './BarChartPlot'
import { useBarChartTextWidths } from './useBarChartTextWidths'

const INK = { 'data-chart-image-ink': 'true' }
const PERCENT = new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 1 })

export function BarChartStackLegend({ stack }: { stack: BarChartStack }) {
  return <>
    <strong>{stack.legendTitle}</strong>
    <ul className="chart-image-frame-legend-list" aria-label={stack.legendTitle}>
      {stack.series.map(series => <li key={series.id} className="chart-image-frame-legend-item">
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <rect x="4" y="1" width="10" height="10" fill={series.color} />
        </svg>
        {series.label}
      </li>)}
    </ul>
  </>
}

export function BarChartStackedPlot({ document: data, stack, settings, width, height, imageMode, onToggleHighlight }:
  BarChartPlotProps & { stack: BarChartStack }) {
  const titleId = useId(), descriptionId = useId()
  const measure = useBarChartTextWidths([...stack.columns, ...stack.rows.flatMap(row => row.labels), '0%', '100%'])
  let nextColumnX = 2
  const columns = stack.columns.map((label, i) => {
    const left = nextColumnX
    const width = Math.max(32, measure(label) + 12, ...stack.rows.map(row => measure(row.labels[i]) + 12))
    nextColumnX += width + BAR_CHART_BAND_GAP
    return { label, left, width }
  })
  const left = nextColumnX + Math.ceil(measure('0%') / 2) + 4
  const svgWidth = Math.max(width, left + 160)
  const right = svgWidth - Math.ceil(measure('100%') / 2) - 4
  const top = BAR_CHART_STACK_HEADER_HEIGHT
  const svgHeight = height ?? getBarChartNaturalHeight(data, settings)
  const bottom = svgHeight - BAR_CHART_STACK_BOTTOM_HEIGHT
  const slot = (bottom - top) / Math.max(1, stack.rows.length)
  const thickness = getBarChartBarWidth(getBarChartItemKind(data), slot, data.layout)
  const selection = new Set(settings.selectedRanks)
  const hasSelection = data.bins.some(bin => selection.has(bin.id))
  const descriptions = stack.rows.map(row => {
    const labels = row.labels.map((label, i) => stack.columns[i] + ' ' + label)
    const results = row.values?.map((value, i) => stack.series[i].label + ' ' + PERCENT.format(value / row.total))
    return [...labels, ...(results ?? ['対象なし'])].join('、')
  })
  return <svg className={`bar-chart-plot bar-chart-stack${imageMode ? ' is-image' : ''}`}
    width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    role={onToggleHighlight ? 'group' : 'img'} aria-labelledby={titleId} aria-describedby={descriptionId}>
    <title id={titleId}>{data.title}</title>
    <desc id={descriptionId}>{data.xAxisTitle}。{descriptions.join('。')}</desc>
    {columns.map(column => <text {...INK} key={column.label} className="chart-strip-title"
      x={column.left + column.width / 2} y={top - 10} textAnchor="middle">{column.label}</text>)}
    {BAR_CHART_PERCENT_TICKS.map(tick => {
      const x = left + (right - left) * tick / 100
      return <g key={tick} aria-hidden="true">
        <line className={`bar-chart-guide${tick === 0 ? ' is-zero' : ''}`} x1={x} x2={x} y1={top} y2={bottom} />
        <text {...INK} className="bar-chart-tick" x={x} y={top - 10} textAnchor="middle">{tick}%</text>
      </g>
    })}
    {stack.rows.map((row, index) => {
      const id = data.bins[index].id
      const selected = selection.has(id)
      const rowTop = top + index * slot
      const middle = rowTop + slot / 2
      let votes = 0
      return <g key={id} data-bar-chart-bin={id} data-bar-chart-dimmed={hasSelection && !selected || undefined}>
        {columns.map(({ label: heading, left, width }, i) => <ChartStripRowCell key={heading}
          left={left} width={width} top={rowTop} height={slot} label={row.labels[i]}
          labelClassName={`chart-strip-label${selected ? ' bar-chart-selected-label' : ''}`}
          fillClassName={selected && i === 0 ? 'bar-chart-selected-cell' : undefined}
          fillAttributes={selected && i === 0 ? { 'data-bar-chart-selected': id } : undefined} />)}
        {row.values ? row.values.map((value, i) => {
          const start = votes / row.total
          votes += value
          return value > 0 && <rect {...INK} key={stack.series[i].id} className="bar-chart-stack-bar"
            data-bar-chart-series={stack.series[i].id} data-bar-chart-votes={value}
            x={left + start * (right - left)} y={middle - thickness / 2}
            width={value / row.total * (right - left)} height={thickness} fill={stack.series[i].color} />
        }) : <text {...INK} className="bar-chart-missing" x={left + 6} y={middle + 4}>対象なし</text>}
      </g>
    })}
    {onToggleHighlight && <BarChartHighlightTargets bins={data.bins} onToggle={onToggleHighlight}
      describeButton={index => ({ label: descriptions[index], pressed: selection.has(data.bins[index].id) })}
      bounds={index => ({ x: 0, y: top + index * slot, width: right, height: slot })} />}
  </svg>
}
