import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { BarChartDisplaySettings, BarChartDocument } from '../lib/barChartDocument'
import { getBarChartBarWidth, getBarChartItemKind } from '../lib/barChartPresentation'
import { BAR_CHART_BAND_HEIGHT, BAR_CHART_BAND_GAP, getBarChartNaturalHeight } from '../lib/barChartLayout'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { placeGroupedBarValueLabels } from '../lib/groupedBarValueLabels'
import { avoidHistogramCumulativeLine, formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import { ChartStripCell } from './ChartStripCell'
import { StatRankStrip } from './StatRankStrip'
import { BarChartComparisonPlot } from './BarChartComparisonPlot'
import { estimatedBarChartTextWidth as estimatedWidth, useBarChartTextWidths as useTextWidths } from './useBarChartTextWidths'
import './BarChartPlot.css'

export interface BarChartPlotProps {
  document: BarChartDocument
  settings: BarChartDisplaySettings
  width: number
  height?: number
  imageMode?: boolean
}

const INK = { 'data-chart-image-ink': 'true' }
const MINIMUM_WIDTH = 620
const VALUE_HEIGHT = 16

function wrapLabel(label: string, available: number, measure: (text: string) => number): string[] {
  if (measure(label) <= available) return [label]
  const lines: string[] = []
  let line = ''
  for (const character of Array.from(label)) {
    if (line && measure(line + character) > available) { lines.push(line); line = '' }
    line += character
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function percentage(share: number | null | undefined): string {
  return share == null ? '—' : formatHistogramPercentage(share, 1)?.replace(/%$/, '').replace(/\.0$/, '') ?? '—'
}

/** One read-only drawing is shared by the page and PNG output. */
export function BarChartPlot({ document: data, settings, width, height, imageMode = false }: BarChartPlotProps) {
  return data.layout === 'mirrored'
    ? <BarChartComparisonPlot document={data} settings={settings} width={width} height={height} imageMode={imageMode} />
    : <VerticalBarChartPlot document={data} settings={settings} width={width} height={height} imageMode={imageMode} />
}

function VerticalBarChartPlot({ document: data, settings, width, height, imageMode = false }: BarChartPlotProps) {
  const titleId = useId(), descriptionId = useId()
  const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: data.fractionDigits })
  const format = (value: number) => number.format(value)
  const bins = data.bins.map(bin => ({ ...bin,
    value: bin.value !== null && Number.isFinite(bin.value) && bin.value >= 0 ? bin.value : null,
  }))
  const texts = bins.map(bin => bin.value === null ? '—' : format(bin.value))
  const maximum = Math.max(0, ...bins.flatMap(bin => bin.value === null ? [] : [bin.value]))
  const axis = createZeroBasedValueAxis(maximum * 1.12, 10 ** -data.fractionDigits)
  const showPercent = settings.percent && data.capabilities.percentages
  const showCumulative = settings.cumulative && data.capabilities.cumulative
  const showCumulativeBand = Boolean(settings.cumulativeBand && data.capabilities.cumulative)
  const rankBands = settings.rankBand && data.capabilities.rankBands ? data.rankBands ?? [] : []
  const proportionBands = [
    ...(showCumulativeBand ? [{ key: 'cumulative' as const, title: '累積割合', labels: bins.map(bin => percentage(bin.cumulativeShare)) }] : []),
    ...(showPercent ? [{ key: 'percentage' as const, title: '割合', labels: bins.map(bin => percentage(bin.share)) }] : []),
  ]
  const measure = useTextWidths([...texts, ...bins.map(bin => bin.label), ...axis.ticks.map(format),
    ...proportionBands.flatMap(band => band.labels), ...(data.secondaryAxisBand?.labels.flat() ?? [])])
  const svgWidth = Math.max(240, Number.isFinite(width) ? width : MINIMUM_WIDTH)
  const svgHeight = Math.max(240, height !== undefined && Number.isFinite(height) ? height : getBarChartNaturalHeight(data, settings))
  const left = Math.max(62, ...axis.ticks.map(tick => measure(format(tick)) + 34))
  const right = Math.max(left + 1, svgWidth - (showCumulative ? 70 : 14))
  const plotWidth = right - left
  const slot = plotWidth / Math.max(1, bins.length)
  const axisLines = bins.map(bin => wrapLabel(bin.label, Math.max(11, slot - 8), measure))
  const axisHeight = Math.max(24, Math.max(1, ...axisLines.map(lines => lines.length)) * 14 + 10)
  const secondaryBand = settings.axisBand ? data.secondaryAxisBand : undefined
  const secondaryLines = secondaryBand?.labels.map(lines => lines.flatMap(line => wrapLabel(line, Math.max(11, slot - 8), measure)))
  const secondaryAxisHeight = secondaryLines ? Math.max(24, Math.max(1, ...secondaryLines.map(lines => lines.length)) * 14 + 10) : 0
  const secondaryHeight = secondaryBand ? secondaryAxisHeight + BAR_CHART_BAND_GAP : 0
  const bandHeight = BAR_CHART_BAND_HEIGHT + BAR_CHART_BAND_GAP
  const top = 20 + proportionBands.length * bandHeight
  const rankHeight = rankBands.length ? bandHeight : 0
  const bottom = Math.max(top + 80, svgHeight - axisHeight - 12 - rankHeight - secondaryHeight)
  const secondaryTop = bottom + 8 + axisHeight + BAR_CHART_BAND_GAP
  const rankTop = secondaryTop + secondaryHeight
  const plotHeight = bottom - top
  const y = (value: number) => plotHeight * (1 - value / axis.maximum)
  const centerX = (index: number) => (index + .5) * slot
  const barWidth = getBarChartBarWidth(getBarChartItemKind(data), slot, data.layout)
  const bars = bins.map((bin, index) => ({ ...bin, text: texts[index], x: centerX(index) - barWidth / 2,
    y: y(bin.value ?? 0), width: barWidth, height: bin.value === null ? 0 : plotHeight - y(bin.value),
  }))
  const cumulativePoints = bins.flatMap((bin, index) => bin.cumulativeShare == null ? [] : [{
    x: centerX(index), y: plotHeight * (1 - bin.cumulativeShare),
  }])
  const obstacles = bars.map(bar => bar.value === null
    ? { x: bar.x + bar.width / 2 - 5, y: plotHeight - 6, width: 10, height: 12 }
    : { x: bar.x, y: bar.y, width: bar.width, height: bar.height })
  let placement = placeGroupedBarValueLabels({ width: plotWidth, height: plotHeight, gap: 3, obstacles,
    labels: settings.values ? bars.flatMap(bar => bar.value === null ? [] : [{ id: bar.id,
      anchorX: bar.x + bar.width / 2, anchorY: bar.y, width: measure(bar.text) + 2,
      height: VALUE_HEIGHT, direction: 'above' as const,
    }]) : [],
  })
  if (showCumulative) placement = avoidHistogramCumulativeLine({ layout: placement, points: cumulativePoints, bars: obstacles })
  const byId = new Map(bars.map(bar => [bar.id, bar]))
  const describeRange = (bin: typeof bins[number]) => {
    const interval = bin.interval
    if (!interval || !data.secondaryAxisBand) return ''
    return `${interval.start === null ? '' : `${format(interval.start)}${interval.includesMinimum ? '以上' : '超'}`}${interval.end === null ? '' : `${format(interval.end)}${interval.includesMaximum ? '以下' : '未満'}`}`
  }
  return <svg className={`bar-chart-plot${imageMode ? ' is-image' : ''}`} width={svgWidth} height={svgHeight}
    viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>{data.title}</title>
    <desc id={descriptionId}>{`${data.xAxisTitle}、${data.yAxisTitle}。${bins.map((bin, index) => `${bin.label}：${texts[index]}${describeRange(bin) ? `（${describeRange(bin)}）` : ''}`).join('。')}${showCumulativeBand ? '。累積割合帯は各階級全体を含む割合です。' : ''}`}</desc>
    <g transform={`translate(${left} ${top})`}>
      {axis.ticks.map(tick => <g key={tick} aria-hidden="true">
        <line className={`bar-chart-guide${tick === 0 ? ' is-zero' : ''}`} x1="0" x2={plotWidth} y1={y(tick)} y2={y(tick)} />
        <text {...INK} className="bar-chart-tick" x="-9" y={y(tick) + 4} textAnchor="end">{format(tick)}</text>
      </g>)}
      <line className="bar-chart-guide is-zero" x1="0" x2="0" y1="0" y2={plotHeight} />
      {bars.map(bar => <g key={bar.id} data-bar-chart-bin={bar.id} data-bar-chart-value={bar.value ?? 'missing'}>
        {bar.value === null
          ? <text {...INK} className="bar-chart-missing" x={bar.x + bar.width / 2} y={plotHeight - 4} textAnchor="middle">—</text>
          : <rect {...INK} className="bar-chart-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} />}
      </g>)}
      {showCumulative && <g data-bar-chart-cumulative="true">
        <polyline {...INK} className="bar-chart-cumulative" points={cumulativePoints.map(point => `${point.x},${point.y}`).join(' ')} />
        {cumulativePoints.map((point, index) => <circle {...INK} className="bar-chart-cumulative-point" key={index} cx={point.x} cy={point.y} r="2.6" />)}
        <line className="bar-chart-guide is-zero" x1={plotWidth} x2={plotWidth} y1="0" y2={plotHeight} />
        {[0, 25, 50, 75, 100].map(value => <text {...INK} className="bar-chart-tick" key={value}
          x={plotWidth + 8} y={plotHeight * (1 - value / 100) + 4}>{value}%</text>)}
      </g>}
      {placement.labels.filter(label => label.shifted).map(label => <line {...INK} className="bar-chart-value-connector"
        key={label.id} x1={label.anchorX} y1={label.anchorY - 2} x2={label.x + label.width / 2} y2={label.y + label.height} />)}
      {placement.labels.map(label => <text {...INK} className="bar-chart-value" data-bar-chart-value-label={label.id}
        key={label.id} x={label.x + label.width / 2} y={label.y + 12} textAnchor="middle">{byId.get(label.id)!.text}</text>)}
    </g>
    <text {...INK} className="bar-chart-axis-title" x="14" y={(top + bottom) / 2} textAnchor="middle"
      transform={`rotate(-90 14 ${(top + bottom) / 2})`}>{data.yAxisTitle}</text>
    {showCumulative && <text {...INK} className="bar-chart-axis-title is-cumulative" x={svgWidth - 12} y={(top + bottom) / 2}
      textAnchor="middle" transform={`rotate(-90 ${svgWidth - 12} ${(top + bottom) / 2})`}>累積割合（%）</text>}
    {proportionBands.map((band, row) => {
      const bandTop = 12 + row * bandHeight
      const labelStride = Math.max(1, Math.ceil(Math.max(...band.labels.map(measure)) / Math.max(1, slot - 6)))
      return <g key={band.key} data-bar-chart-percentage-band={band.key === 'percentage' ? 'true' : undefined}
        data-bar-chart-cumulative-band={band.key === 'cumulative' ? 'true' : undefined} role="group" aria-label={`${band.title}（%）`}>
        <text {...INK} className="chart-strip-title" x={left - 8} y={bandTop + 10} textAnchor="end">
          <tspan x={left - 8}>{band.title}</tspan><tspan x={left - 8} dy="11">（%）</tspan>
        </text>
        {bins.map((bin, index) => <g key={bin.id} data-bar-chart-percentage={band.key === 'percentage' ? bin.id : undefined}
          data-bar-chart-cumulative-percentage={band.key === 'cumulative' ? bin.id : undefined} role="img"
          aria-label={`${bin.label}：${band.title}${band.labels[index]}%`}>
          <ChartStripCell left={left + index * slot} width={slot} top={bandTop} leftInset={1.5} rightInset={1.5}
            label={band.labels[index]} showLabel={false} />
          {(bins.length - 1 - index) % labelStride === 0 && <text {...INK} className="chart-strip-label"
            x={left + centerX(index)} y={bandTop + 16} textAnchor="middle">{band.labels[index]}</text>}
        </g>)}
      </g>
    })}
    {bins.map((bin, index) => <g key={bin.id} data-bar-chart-axis-band={settings.axisBand ? bin.id : undefined}>
      {settings.axisBand && <ChartStripCell left={left + index * slot} width={slot} top={bottom + 8}
        leftInset={1.5} rightInset={1.5} height={axisHeight} label={bin.label} showLabel={false} />}
      <text {...INK} className={settings.axisBand ? 'chart-strip-label' : 'bar-chart-tick'} textAnchor="middle"
        x={left + centerX(index)} y={bottom + 8 + (axisHeight - axisLines[index].length * 14) / 2 + 11}>
        {axisLines[index].map((line, row) => <tspan key={row} x={left + centerX(index)} dy={row ? 14 : 0}>{line}</tspan>)}
      </text>
    </g>)}
    {settings.axisBand && <text {...INK} className="chart-strip-title" x={left - 8} y={bottom + 8 + axisHeight / 2 + 4} textAnchor="end">{data.semantics.xBandTitle ?? '階級'}</text>}
    {secondaryBand && secondaryLines && <g data-bar-chart-secondary-axis-band="true" role="group" aria-label={secondaryBand.title}>
      <text {...INK} className="chart-strip-title" x={left - 8} y={secondaryTop + secondaryAxisHeight / 2 + 4} textAnchor="end">{secondaryBand.title}</text>
      {secondaryLines.map((lines, index) => <g key={bins[index].id} role="img" aria-label={`${bins[index].label}：${describeRange(bins[index])}`}>
        <ChartStripCell left={left + index * slot} width={slot} top={secondaryTop} height={secondaryAxisHeight}
          leftInset={1.5} rightInset={1.5} label={secondaryBand.labels[index].join('')} showLabel={false} />
        <text {...INK} className="chart-strip-label" x={left + centerX(index)} textAnchor="middle"
          y={secondaryTop + (secondaryAxisHeight - lines.length * 14) / 2 + 11}>
          {lines.map((line, row) => <tspan key={row} x={left + centerX(index)} dy={row ? 14 : 0}>{line}</tspan>)}
        </text>
      </g>)}
    </g>}
    {rankBands.length > 0 && <g data-bar-chart-rank-band="true" role="group" aria-label="評価">
      <text {...INK} className="chart-strip-title" x={left - 8} y={rankTop + 16} textAnchor="end">評価</text>
      <StatRankStrip bands={rankBands} left={left} right={right} top={rankTop} title="評価" showTooltips={false} />
    </g>}
  </svg>
}

export function BarChartFigure({ document: data, settings }: Pick<BarChartPlotProps, 'document' | 'settings'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(928)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const measure = () => {
      // Reserve one CSS pixel for fractional Windows display scaling.
      const next = Math.max(1, Math.floor(host.getBoundingClientRect().width) - 1)
      if (next > 0) setWidth(current => current === next ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])
  const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: data.fractionDigits })
  const secondaryLabels = settings.axisBand ? data.secondaryAxisBand?.labels.flat() ?? [] : []
  const measure = useTextWidths(secondaryLabels)
  const secondarySlot = Math.max(0, ...secondaryLabels.map(label => measure(label) + 8))
  const slot = Math.max(40, secondarySlot, ...data.bins.map(bin => bin.value === null || !settings.values ? 0 : estimatedWidth(number.format(bin.value)) + 10))
  const maximum = Math.max(0, ...data.bins.map(bin => bin.value ?? 0))
  const axis = createZeroBasedValueAxis(maximum * 1.12, 10 ** -data.fractionDigits)
  // Keep supplied range lines horizontal instead of shrinking the natural data area.
  const sidePadding = secondaryLabels.length ? Math.max(62, ...axis.ticks.map(tick => estimatedWidth(number.format(tick)) + 34))
    + (settings.cumulative && data.capabilities.cumulative ? 70 : 14) : 90
  const plotWidth = Math.max(MINIMUM_WIDTH, width, sidePadding + data.bins.length * slot)
  return <figure className={`bar-chart-figure${data.layout === 'mirrored' ? ' is-comparison' : ''}`} aria-label={data.title}>
    <figcaption className="bar-chart-heading"><span aria-hidden="true" /><strong>{data.title}</strong><span className="bar-chart-conditions">{data.conditions}</span></figcaption>
    <div className="bar-chart-scroll" ref={ref}>
      <BarChartPlot document={data} settings={settings} width={plotWidth} height={getBarChartNaturalHeight(data, settings)} />
    </div>
    <div className="bar-chart-x-title">{data.xAxisTitle}</div>
  </figure>
}
