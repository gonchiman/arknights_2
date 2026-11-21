import { useId } from 'react'
import {
  getBarChartComparisonAxis, getBarChartComparisonBand, getBarChartSelectionSummary,
} from '../lib/barChartDocument'
import { getBarChartBarWidth, getBarChartItemKind } from '../lib/barChartPresentation'
import {
  getBarChartNaturalHeight, BAR_CHART_MIRRORED_HEADER_HEIGHT, BAR_CHART_MIRRORED_BOTTOM_HEIGHT, BAR_CHART_MIRRORED_SELECTION_HEIGHT,
} from '../lib/barChartLayout'
import { formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import { ChartStripCell } from './ChartStripCell'
import type { BarChartPlotProps } from './BarChartPlot'
import { useBarChartTextWidths } from './useBarChartTextWidths'

const INK = { 'data-chart-image-ink': 'true' }
const formatShare = (value: number | null | undefined) => value == null ? '—'
  : formatHistogramPercentage(value, 1)?.replace(/%$/, '').replace(/\.0$/, '') ?? '—'

/** A generic two-series layout; providers supply categories, labels and proportions. */
export function BarChartComparisonPlot({ document: data, settings, width, height, imageMode = false }: BarChartPlotProps) {
  const titleId = useId(), descriptionId = useId()
  const series = data.series ?? []
  const axis = getBarChartComparisonAxis(data)
  const band = getBarChartComparisonBand(settings)
  const selection = new Set(settings.selectedRanks)
  const summary = getBarChartSelectionSummary(data, settings.selectedRanks ?? [])
  const bandTitle = band === 'rank' ? '階級割合' : '累積割合'
  const texts = series.flatMap(item => [item.label, ...item.bins.map(bin => formatShare(band === 'rank' ? bin.share : bin.cumulativeShare))])
  const measure = useBarChartTextWidths(texts)
  const svgWidth = Math.max(240, Number.isFinite(width) ? width : 620)
  const svgHeight = Math.max(240, height !== undefined && Number.isFinite(height) ? height : getBarChartNaturalHeight(data, settings))
  const column = band === 'none' ? 8 : Math.max(60, ...texts.map(value => measure(value) + 12))
  const middle = svgWidth / 2, gap = 40, top = BAR_CHART_MIRRORED_HEADER_HEIGHT
  const bottom = svgHeight - BAR_CHART_MIRRORED_BOTTOM_HEIGHT - (summary ? BAR_CHART_MIRRORED_SELECTION_HEIGHT : 0)
  const step = (bottom - top) / Math.max(1, data.bins.length)
  const leftOrigin = middle - gap / 2
  const track = Math.max(1, leftOrigin - column - (band === 'none' ? 0 : 8))
  const ticks = track < 100 ? [0, axis.maximum] : axis.ticks
  const describe = series.map(item => `${item.label}：有効${item.population.valid}、値なし${item.population.missing}。`
    + item.bins.map((bin, index) => `${data.bins[index].label}：${formatShare(bin.share)}%`).join('。')).join('。')
  return <svg className={`bar-chart-plot bar-chart-comparison${imageMode ? ' is-image' : ''}`}
    width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>{data.title}</title>
    <desc id={descriptionId}>{describe}{summary && `。選択合計（${summary.label}）：${summary.series.map(item => `${item.label} ${formatShare(item.share)}${item.share == null ? '' : '%'}`).join('、')}`}</desc>
    {data.bins.map((bin, index) => selection.has(bin.id) && <rect key={bin.id} {...INK}
      className="bar-chart-comparison-highlight" data-bar-chart-selected={bin.id}
      x="0" y={top + index * step} width={svgWidth} height={step} />)}
    <text {...INK} className="chart-strip-title" x={middle} y="26" textAnchor="middle">{data.yAxisTitle}</text>
    {series.map((item, side) => {
      const direction = side === 0 ? -1 : 1
      const origin = middle + direction * gap / 2
      const labelX = side === 0 ? column / 2 : svgWidth - column / 2
      return <g key={item.id} data-bar-chart-side={item.id}>
        <text {...INK} className={`bar-chart-comparison-series-label is-${item.id}`} x={origin + direction * track / 2}
          y="17" textAnchor="middle">{item.label}</text>
        {band !== 'none' && <text {...INK} className="chart-strip-title" x={labelX} y="19" textAnchor="middle">
          <tspan x={labelX}>{bandTitle}</tspan><tspan x={labelX} dy="11">（%）</tspan>
        </text>}
        {ticks.map(tick => {
          const x = origin + direction * track * tick / axis.maximum
          return <g key={tick} aria-hidden="true">
            <line className={`bar-chart-guide${tick === 0 ? ' is-zero' : ''}`} x1={x} x2={x} y1={top} y2={bottom} />
            <text {...INK} className="bar-chart-tick" x={x} y="46" textAnchor="middle">{tick}</text>
          </g>
        })}
        {item.bins.map((bin, index) => {
          const y = top + (index + .5) * step
          const extent = (bin.share ?? 0) * 100 / axis.maximum * track
          const barHeight = getBarChartBarWidth(getBarChartItemKind(data), step, data.layout)
          return <g key={bin.id} data-bar-chart-series={item.id} data-bar-chart-bin={bin.id}
            data-bar-chart-value={bin.value ?? 'missing'} data-bar-chart-share={bin.share ?? 'missing'}>
            {bin.share == null
              ? <text {...INK} className="bar-chart-missing" x={origin + direction * 8} y={y + 4}
                textAnchor={side === 0 ? 'end' : 'start'}>—</text>
              : <rect {...INK} className={`bar-chart-comparison-bar is-${item.id}`}
                x={side === 0 ? origin - extent : origin} y={y - barHeight / 2} width={extent} height={barHeight} />}
          </g>
        })}
        {band !== 'none' && <g data-bar-chart-comparison-band={band} role="group" aria-label={`${item.label} ${bandTitle}（%）`}>
          {item.bins.map((bin, index) => <ChartStripCell key={bin.id} left={labelX - column / 2 + 2} width={column - 4}
            top={top + index * step + 1.5} height={Math.max(0, step - 3)} labelY={top + (index + .5) * step + 4}
            label={formatShare(band === 'rank' ? bin.share : bin.cumulativeShare)}
            labelClassName={`chart-strip-label${selection.has(bin.id) ? ' bar-chart-comparison-selected' : ''}`}
            fillAttributes={{ 'data-bar-chart-comparison-value': bin.id }} />)}
        </g>}
      </g>
    })}
    {data.bins.map((bin, index) => <ChartStripCell key={bin.id} left={middle - 16} width={32}
      top={top + index * step + 1.5} height={Math.max(0, step - 3)} label={bin.label}
      labelY={top + (index + .5) * step + 4}
      labelClassName={`chart-strip-label${selection.has(bin.id) ? ' bar-chart-comparison-selected' : ''}`}
      fillAttributes={{ 'data-bar-chart-comparison-category': bin.id }} />)}
    {summary && <g data-bar-chart-selection-summary="true">
      <text {...INK} className="bar-chart-value" x="4" y={bottom + 18}>選択合計（{summary.label}）</text>
      <text {...INK} className="bar-chart-value" x="4" y={bottom + 35}>
        {summary.series.map((item, index) => `${index ? ' ／ 右' : '左'} ${item.label} ${formatShare(item.share)}${item.share == null ? '' : '%'}`).join('')}
      </text>
    </g>}
  </svg>
}
