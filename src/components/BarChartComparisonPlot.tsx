import { useId } from 'react'
import type { CSSProperties } from 'react'
import {
  getBarChartComparisonAxis, getBarChartComparisonBand, getBarChartComparisonSelection,
  getBarChartComparisonValue, getBarChartSelectionSummary,
} from '../lib/barChartDocument'
import { getBarChartBarWidth, getBarChartItemKind } from '../lib/barChartPresentation'
import {
  getBarChartNaturalHeight, BAR_CHART_MIRRORED_HEADER_HEIGHT, BAR_CHART_MIRRORED_BOTTOM_HEIGHT, BAR_CHART_MIRRORED_SELECTION_HEIGHT,
} from '../lib/barChartLayout'
import { formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import { getStatMetricColor, STAT_METRIC_BAR_OPACITY } from '../lib/statMetricColors'
import { ChartStripRowCell } from './ChartStripCell'
import { BarChartHighlightTargets } from './BarChartHighlightTargets'
import type { BarChartPlotProps } from './BarChartPlot'
import { useBarChartTextWidths } from './useBarChartTextWidths'

const INK = { 'data-chart-image-ink': 'true' }
const formatShare = (value: number | null | undefined) => value == null ? '—'
  : formatHistogramPercentage(value, 1)?.replace(/%$/, '').replace(/\.0$/, '') ?? '—'

/** A generic two-series layout; providers declare the measure and supply its values. */
export function BarChartComparisonPlot({ document: data, settings, width, height, imageMode = false, onToggleHighlight }: BarChartPlotProps) {
  const titleId = useId(), descriptionId = useId()
  const series = data.series ?? []
  const axis = getBarChartComparisonAxis(data)
  const span = axis.maximum - axis.minimum
  const band = getBarChartComparisonBand(settings, data)
  const numeric = data.semantics.comparisonValue === 'value'
  const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: data.fractionDigits })
  const smallNumber = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 3 })
  const formatValue = (value: number | null | undefined) => value == null ? '—'
    : value !== 0 && Math.abs(value) < .5 * 10 ** -data.fractionDigits ? smallNumber.format(value) : number.format(value)
  const formatBand = (bin: typeof data.bins[number]) => band === 'value' ? formatValue(bin.value)
    : formatShare(band === 'rank' ? bin.share : bin.cumulativeShare)
  const selection = getBarChartComparisonSelection(data, settings)
  const hasSelection = selection.left.size > 0 || selection.right.size > 0
  const summary = getBarChartSelectionSummary(data, settings.selectedRanks ?? [], settings.comparisonSelection)
  const selectedTotals = summary?.series.filter(item => item.selectionLabel !== null)
  const bandTitle = band === 'value' ? data.semantics.xLabel : band === 'rank' ? '階級割合' : '累積割合'
  const bandUnit = numeric ? data.semantics.xUnit : '%'
  const texts = series.flatMap(item => [item.label, ...item.bins.map(formatBand)])
  const categories = data.bins.map(bin => bin.label)
  const measure = useBarChartTextWidths([...texts, ...categories, data.yAxisTitle])
  const svgWidth = Math.max(240, Number.isFinite(width) ? width : 620)
  const svgHeight = Math.max(240, height !== undefined && Number.isFinite(height) ? height : getBarChartNaturalHeight(data, settings))
  const column = band === 'none' ? 8 : Math.max(60, ...texts.map(value => measure(value) + 12))
  const categoryWidth = Math.max(32, ...categories.map(label => measure(label) + 12), measure(data.yAxisTitle) + 8)
  const middle = svgWidth / 2, gap = categoryWidth + 8, top = BAR_CHART_MIRRORED_HEADER_HEIGHT
  const bottom = svgHeight - BAR_CHART_MIRRORED_BOTTOM_HEIGHT - (summary ? BAR_CHART_MIRRORED_SELECTION_HEIGHT : 0)
  const step = (bottom - top) / Math.max(1, data.bins.length)
  const leftOrigin = middle - gap / 2
  const sideWidth = Math.max(0, leftOrigin)
  const rightStart = svgWidth - sideWidth
  const track = Math.max(1, leftOrigin - column - (band === 'none' ? 0 : 8))
  const tickGap = Math.max(...axis.ticks.map(tick => measure(numeric ? formatValue(tick) : String(tick)))) + 14
  const ticks = track / Math.max(1, axis.ticks.length - 1) >= tickGap ? axis.ticks
    : [...new Set([axis.minimum, 0, axis.maximum])]
  const describe = series.map(item => `${item.label}：有効${item.population.valid}、値なし${item.population.missing}。`
    + item.bins.map((bin, index) => `${data.bins[index].label}：${numeric ? formatValue(bin.value) : formatShare(bin.share)}${numeric ? data.semantics.xUnit ?? '' : '%'}`).join('。')).join('。')
  return <svg className={`bar-chart-plot bar-chart-comparison${imageMode ? ' is-image' : ''}`}
    style={{ '--bar-chart-left': getStatMetricColor(series[0]?.metricKey),
      '--bar-chart-right': getStatMetricColor(series[1]?.metricKey),
      '--bar-chart-bar-opacity': STAT_METRIC_BAR_OPACITY } as CSSProperties}
    width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>{data.title}</title>
    <desc id={descriptionId}>{describe}{summary && `。選択合計（${summary.label}）：${selectedTotals?.map(item => `${item.id === 'left' ? '左' : '右'} ${item.label} ${formatShare(item.share)}${item.share == null ? '' : '%'}`).join('、')}`}</desc>
    <text {...INK} className="chart-strip-title" x={middle} y="26" textAnchor="middle">{data.yAxisTitle}</text>
    {series.map((item, side) => {
      const direction = side === 0 ? -1 : 1
      const origin = middle + direction * gap / 2
      const labelX = side === 0 ? column / 2 : svgWidth - column / 2
      const valueX = (value: number) => origin + direction * track * (value - axis.minimum) / span
      const zeroX = valueX(0)
      const sideSelection = selection[item.id]
      return <g key={item.id} data-bar-chart-side={item.id} data-bar-chart-metric={item.metricKey}
        data-bar-chart-domain-min={axis.minimum} data-bar-chart-domain-max={axis.maximum} data-bar-chart-zero-x={zeroX}>
        <text {...INK} className={`bar-chart-comparison-series-label is-${item.id}`} x={origin + direction * track / 2}
          y="17" textAnchor="middle">{item.label}</text>
        {band !== 'none' && <text {...INK} className="chart-strip-title" x={labelX} y="19" textAnchor="middle">
          <tspan x={labelX}>{bandTitle}</tspan>{bandUnit && <tspan x={labelX} dy="11">（{bandUnit}）</tspan>}
        </text>}
        {ticks.map(tick => {
          const x = valueX(tick)
          return <g key={tick} aria-hidden="true">
            <line className={`bar-chart-guide${tick === 0 ? ' is-zero' : ''}`} x1={x} x2={x} y1={top} y2={bottom} />
            <text {...INK} className="bar-chart-tick" x={x} y="46" textAnchor="middle">{numeric ? formatValue(tick) : tick}</text>
          </g>
        })}
        {item.bins.map((bin, index) => {
          const y = top + (index + .5) * step
          const value = getBarChartComparisonValue(data, bin)
          const extent = Math.abs(value ?? 0) / span * track
          const offset = direction * Math.sign(value ?? 0) * extent
          const barHeight = getBarChartBarWidth(getBarChartItemKind(data), step, data.layout)
          return <g key={bin.id} data-bar-chart-series={item.id} data-bar-chart-bin={bin.id}
            data-bar-chart-value={bin.value ?? 'missing'} data-bar-chart-share={bin.share ?? 'missing'}
            data-bar-chart-measure={value ?? 'missing'}
            data-bar-chart-dimmed={hasSelection && !sideSelection.has(bin.id) ? 'true' : undefined}>
            {value === null
              ? <text {...INK} className="bar-chart-missing" x={zeroX} y={y + 4} textAnchor="middle">—</text>
              : <rect {...INK} className={`bar-chart-comparison-bar is-${item.id}`}
                x={zeroX + Math.min(0, offset)} y={y - barHeight / 2}
                width={extent} height={barHeight} />}
          </g>
        })}
        {band !== 'none' && <g data-bar-chart-comparison-band={band} role="group" aria-label={`${item.label} ${bandTitle}${bandUnit ? `（${bandUnit}）` : ''}`}>
          {item.bins.map((bin, index) => <ChartStripRowCell key={bin.id} left={labelX - column / 2 + 2} width={column - 4}
            top={top + index * step} height={step}
            label={formatBand(bin)}
            labelClassName={`chart-strip-label${sideSelection.has(bin.id) ? ' bar-chart-selected-label' : ''}`}
            fillAttributes={{ 'data-bar-chart-comparison-value': bin.id }} />)}
        </g>}
      </g>
    })}
    {data.bins.map((bin, index) => {
      const leftSelected = selection.left.has(bin.id)
      const rightSelected = selection.right.has(bin.id)
      const selectedSide = leftSelected ? (rightSelected ? 'both' : 'left') : rightSelected ? 'right' : undefined
      return <ChartStripRowCell key={bin.id} left={middle - categoryWidth / 2} width={categoryWidth}
        top={top + index * step} height={step} label={bin.label}
        labelClassName={`chart-strip-label${selectedSide ? ' bar-chart-selected-label' : ''}`}
        fillClassName={selectedSide ? 'bar-chart-selected-cell' : undefined}
        fillAttributes={{ 'data-bar-chart-comparison-category': bin.id,
          ...(selectedSide ? { 'data-bar-chart-selected': bin.id, 'data-bar-chart-selected-side': selectedSide } : {}) }} />
    })}
    {summary && <g data-bar-chart-selection-summary="true">
      <text {...INK} className="bar-chart-value" x="4" y={bottom + 18}>選択合計（{summary.label}）</text>
      <text {...INK} className="bar-chart-value" x="4" y={bottom + 35}>
        {selectedTotals?.map(item => `${item.id === 'left' ? '左' : '右'} ${item.label} ${formatShare(item.share)}${item.share == null ? '' : '%'}`).join(' ／ ')}
      </text>
    </g>}
    {onToggleHighlight && <>
      <BarChartHighlightTargets bins={data.bins} onToggle={onToggleHighlight} target="left"
        bounds={index => ({ x: 0, y: top + index * step, width: sideWidth, height: step })} />
      <BarChartHighlightTargets bins={data.bins} onToggle={onToggleHighlight} target="both"
        bounds={index => ({ x: sideWidth, y: top + index * step, width: rightStart - sideWidth, height: step })} />
      <BarChartHighlightTargets bins={data.bins} onToggle={onToggleHighlight} target="right"
        bounds={index => ({ x: rightStart, y: top + index * step, width: sideWidth, height: step })} />
    </>}
  </svg>
}
