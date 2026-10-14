import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { applyChartImageSeriesLabels, resolveChartImageLabels,
  type ChartImageLabelDefaults, type ChartImageLabelOverrides } from '../lib/chartImageLabels'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { placeGroupedBarValueLabels } from '../lib/groupedBarValueLabels'
import { wrapText } from '../lib/slideComposer'
import { ChartImageFrame } from './ChartImageFrame'
import './SurtrDpsChart.css'
import './SurtrTotalDamageChart.css'

export interface SurtrTotalDamageChartSeries {
  id: string
  label: string
  color: string
  dashArray?: string
  points: { x: number; value: number | null }[]
}

export interface SurtrTotalDamageChartProps {
  series: SurtrTotalDamageChartSeries[]
  kind?: 'line' | 'bar'
  precision?: number
  gridStyle?: 'none' | 'dashed' | 'solid'
  showValues?: boolean
  showLegend?: boolean
  title?: string
  selectedTime?: number | null
  onSelectTime?: (time: number | null) => void
}

export interface SurtrTotalDamageChartImageProps extends Omit<SurtrTotalDamageChartProps,
  'selectedTime' | 'onSelectTime' | 'showLegend'> {
  conditions: string
  labels?: ChartImageLabelOverrides
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

export const SURTR_TOTAL_DAMAGE_CHART_HEIGHT = 334
const DEFAULT_TITLE = 'スルト S3 総ダメージ'
const TIME_AXIS = '素質２発動までの時間（秒）'
const VALUE_AXIS = '総ダメージ'
const FONT_FAMILY = '"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'
const VALUE_FONT = `600 11px ${FONT_FAMILY}`
const TITLE_FONT = `700 12px ${FONT_FAMILY}`
const seconds = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 })
type TextWidths = Record<string, number>

export function getSurtrTotalDamageImageLabelDefaults(series: readonly { id: string; label: string }[],
  title = DEFAULT_TITLE): ChartImageLabelDefaults {
  return { title, xAxis: TIME_AXIS, yAxis: VALUE_AXIS, series }
}

function normalizeSeries(series: SurtrTotalDamageChartSeries[]) {
  return series.map(item => {
    const byTime = new Map<number, number | null>()
    for (const point of item.points) {
      if (!Number.isFinite(point.x) || point.x < 0) continue
      byTime.set(point.x, point.value !== null && Number.isFinite(point.value) && point.value >= 0 ? point.value : null)
    }
    return { ...item, points: [...byTime].map(([x, value]) => ({ x, value })).sort((a, b) => a.x - b.x) }
  })
}

function valueFormatter(precision: number) {
  const digits = Number.isFinite(precision) ? Math.max(0, Math.min(6, Math.trunc(precision))) : 0
  const format = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : format.format(value)
}

/** Font-aware measurements use the same fonts as the existing Surtr DPS plot. */
function useTextWidths(texts: string[], font: string): TextWidths {
  const key = JSON.stringify([...new Set(texts)])
  const [widths, setWidths] = useState<TextWidths>({})
  useLayoutEffect(() => {
    let active = true
    const measure = () => {
      if (!active) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      context.font = font
      const next = Object.fromEntries((JSON.parse(key) as string[]).map(text => [text, Math.ceil(context.measureText(text).width)]))
      setWidths(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure) }
  }, [key, font])
  return widths
}

function usePlotText(series: SurtrTotalDamageChartSeries[], precision: number, showValues: boolean, axisTitle: string) {
  const format = valueFormatter(precision)
  const valueWidths = useTextWidths(showValues ? series.flatMap(item => item.points.flatMap(point =>
    point.value === null ? [] : [format(point.value)])) : [], VALUE_FONT)
  const axisWidths = useTextWidths([...axisTitle], TITLE_FONT)
  return { valueWidths, axisWidths }
}

function timeDomain(times: number[]) {
  if (!times.length) return { minimum: 0, maximum: 1 }
  const minimum = times[0]
  const maximum = times[times.length - 1]
  if (minimum !== maximum) return { minimum, maximum }
  const padding = Math.max(1, minimum * 0.05)
  return { minimum: Math.max(0, minimum - padding), maximum: maximum + padding }
}

function niceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const factor = value / magnitude
  return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * magnitude
}

function getPlot(series: SurtrTotalDamageChartSeries[], width: number, height: number, kind: 'line' | 'bar',
  precision: number, showValues: boolean, axisTitle: string, { valueWidths, axisWidths }: {
    valueWidths: TextWidths; axisWidths: TextWidths
  }) {
  const values = series.flatMap(item => item.points.flatMap(point => point.value === null ? [] : [point.value]))
  const largest = values.reduce((maximum, value) => Math.max(maximum, value), 0)
  // Keep a corrupt/extreme input from overflowing the common axis's rounding arithmetic.
  const axis = largest > Number.MAX_VALUE / 10
    ? { lowerLimit: 0, upperLimit: largest, valueStep: largest / 2, yTicks: [0, largest / 2, largest] }
    : getHpChartValueAxis(values, { mode: 'zero', nonNegative: true })
  const tickPrecision = Math.max(0, Math.min(6, -Math.floor(Math.log10(axis.valueStep))))
  const formatTick = valueFormatter(tickPrecision)
  const formatValue = valueFormatter(precision)
  const left = Math.min(width / 2, Math.max(54, ...axis.yTicks.map(tick => formatTick(tick).length * 7 + 12)))
  const right = Math.max(left + 1, width - 18)
  const plotWidth = right - left
  const titleLines = wrapText({ font: TITLE_FONT,
    measureText: text => ({ width: [...text].reduce((sum, character) => sum + (axisWidths[character]
      ?? (/[\x00-\x7f]/.test(character) ? 8 : 14)), 0) }),
  }, axisTitle, Math.max(14, plotWidth))
  const titleOverflow = Math.max(0, titleLines.length - 1) * 18
  const baseTop = 28
  const plotHeight = Math.max(1, height - baseTop - 32)
  const times = [...new Set(series.flatMap(item => item.points.map(point => point.x)))].sort((a, b) => a - b)
  const domain = timeDomain(times)
  const bandWidth = plotWidth / Math.max(1, times.length)
  const x = (time: number) => kind === 'bar'
    ? left + (times.indexOf(time) + 0.5) * bandWidth
    : left + (time - domain.minimum) / (domain.maximum - domain.minimum) * plotWidth
  const relativeY = (value: number) => plotHeight * (1 - value / axis.upperLimit)
  const groupBudget = bandWidth * 0.75
  const barGap = Math.min(3, groupBudget / (Math.max(1, series.length) * 4))
  const barWidth = Math.min(34, Math.max(0.1, (groupBudget - barGap * Math.max(0, series.length - 1)) / Math.max(1, series.length)))
  const groupWidth = series.length * barWidth + Math.max(0, series.length - 1) * barGap
  const bars = kind === 'bar' ? series.flatMap((item, index) => item.points.flatMap(point => point.value === null ? [] : [{
    id: `${item.id}:${point.x}`, item, time: point.x, value: point.value, text: formatValue(point.value),
    x: x(point.x) - left - groupWidth / 2 + index * (barWidth + barGap), y: relativeY(point.value),
  }])) : []
  const placement = placeGroupedBarValueLabels({
    labels: showValues ? bars.map(bar => ({ id: bar.id, anchorX: bar.x + barWidth / 2, anchorY: bar.y,
      width: (valueWidths[bar.text] ?? bar.text.length * 7) + 2, height: 16, direction: 'above' as const })) : [],
    width: plotWidth, height: plotHeight, gap: 3,
    obstacles: bars.map(bar => ({ x: bar.x, y: bar.y - (bar.value === 0 ? 1 : 0), width: barWidth,
      height: Math.max(2, plotHeight - bar.y) })),
  })
  const extraTop = Math.ceil(placement.extraTop)
  const top = baseTop + titleOverflow + extraTop
  const bottom = top + plotHeight
  const step = niceStep((domain.maximum - domain.minimum) / 6)
  const first = Math.ceil(domain.minimum / step) * step
  const middleTicks = Array.from({ length: Math.min(20, Math.max(0, Math.floor((domain.maximum - first) / step) + 1)) },
    (_, index) => Number((first + index * step).toPrecision(12)))
    .filter(value => value > domain.minimum && value < domain.maximum)
  const candidates = kind === 'bar' || times.length === 1 ? times : [domain.minimum, ...middleTicks, domain.maximum]
  const last = candidates[candidates.length - 1]
  const lastLeft = last === undefined ? Infinity : x(last) - seconds.format(last).length * 3.5
  let previousRight = -Infinity
  const xTicks = candidates.filter((time, index) => {
    const halfWidth = seconds.format(time).length * 3.5
    const center = x(time)
    if (index !== 0 && index !== candidates.length - 1
      && (center - halfWidth < previousRight + 8 || center + halfWidth + 8 > lastLeft)) return false
    previousRight = center + halfWidth
    return true
  })
  return { left, right, top, bottom, times, domain, bandWidth, barWidth, bars, placement, extraTop,
    ticks: axis.yTicks, formatTick, formatValue, titleLines, xTicks, x,
    y: (value: number) => top + relativeY(value),
    height: height + titleOverflow + extraTop + Math.ceil(placement.extraBottom),
    hasValues: values.length > 0 }
}

function SeriesSwatch({ item, kind, image = false }: {
  item: SurtrTotalDamageChartSeries; kind: 'line' | 'bar'; image?: boolean
}) {
  return <svg className={image ? 'chart-image-frame-legend-swatch' : 'surtr-dps-chart-swatch'}
    width="18" height="12" aria-hidden="true">
    {kind === 'bar' ? <rect x="4" y="1" width="10" height="10" fill={item.color} />
      : <line x1="0" x2="18" y1="6" y2="6" stroke={item.color} strokeWidth="2" strokeDasharray={item.dashArray} />}
  </svg>
}

export function SurtrTotalDamageImageLegend({ series, kind = 'line' }: Pick<SurtrTotalDamageChartProps, 'series' | 'kind'>) {
  return <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
    {series.map(item => <li className="chart-image-frame-legend-item" key={item.id}>
      <SeriesSwatch item={item} kind={kind} image /><span>{item.label}</span>
    </li>)}
  </ul>
}

function PlotSvg({ series, title, kind, gridStyle, plot, activeTime }: {
  series: SurtrTotalDamageChartSeries[]; title: string; kind: 'line' | 'bar'
  gridStyle: 'none' | 'dashed' | 'solid'; plot: ReturnType<typeof getPlot>; activeTime?: number | null
}) {
  const clipId = useId()
  const valueById = new Map(plot.bars.map(bar => [bar.id, bar]))
  return <svg className="surtr-dps-chart-svg surtr-total-damage-chart-svg" width={plot.right + 18} height={plot.height}
    viewBox={`0 0 ${plot.right + 18} ${plot.height}`} role="img" aria-label={`${title}・${kind === 'line' ? '折れ線' : '集合棒'}`}>
    <title>{title}</title>
    <desc>{`${TIME_AXIS}別の${VALUE_AXIS}。${kind === 'line' ? '計算した時刻の点を線でつないでいます。' : ''}`}</desc>
    <defs><clipPath id={clipId}><rect x={plot.left - 3} y={plot.top - 3}
      width={plot.right - plot.left + 6} height={plot.bottom - plot.top + 6} /></clipPath></defs>
    <text className="surtr-dps-chart-axis-title" x={plot.left} y="16">
      {plot.titleLines.map((line, index) => <tspan key={index} x={plot.left} y={16 + index * 18}>{line}</tspan>)}
    </text>
    {kind === 'bar' && activeTime != null && <rect className="surtr-dps-chart-active-band"
      x={plot.x(activeTime) - plot.bandWidth / 2 + 2} y={plot.top} width={Math.max(1, plot.bandWidth - 4)} height={plot.bottom - plot.top} />}
    {plot.ticks.map(tick => <g key={tick}>
      {gridStyle !== 'none' && <line className="surtr-dps-chart-grid" x1={plot.left} x2={plot.right}
        y1={plot.y(tick)} y2={plot.y(tick)} strokeDasharray={gridStyle === 'dashed' ? '4 4' : undefined} />}
      <text className="surtr-dps-chart-tick" x={plot.left - 9} y={plot.y(tick) + 4} textAnchor="end">{plot.formatTick(tick)}</text>
    </g>)}
    {plot.xTicks.map(time => <g key={time}>
      {kind === 'line' && <line className="surtr-dps-chart-grid surtr-dps-chart-grid-vertical"
        x1={plot.x(time)} x2={plot.x(time)} y1={plot.top} y2={plot.bottom} />}
      <text className="surtr-dps-chart-tick" x={plot.x(time)} y={plot.bottom + 20} textAnchor="middle">{seconds.format(time)}</text>
    </g>)}
    <path className="surtr-dps-chart-axis" data-chart-image-plot-area="" d={`M ${plot.left} ${plot.top} V ${plot.bottom} H ${plot.right}`} />
    <g clipPath={`url(#${clipId})`}>
      {kind === 'bar' ? plot.bars.map(bar => <rect key={bar.id} className="surtr-dps-chart-bar"
        data-series-id={bar.item.id} data-time={bar.time} data-value={bar.value} data-chart-image-ink=""
        x={plot.left + bar.x} y={plot.top + bar.y} width={plot.barWidth} height={plot.bottom - plot.top - bar.y} fill={bar.item.color}>
        <title>{`${bar.item.label}・${seconds.format(bar.time)}秒・${bar.text}`}</title>
      </rect>) : series.map(item => {
        let previous = false
        const path = item.points.map(point => {
          if (point.value === null) { previous = false; return '' }
          const command = previous ? 'L' : 'M'
          previous = true
          return `${command} ${plot.x(point.x)} ${plot.y(point.value)}`
        }).join(' ')
        return <g key={item.id} data-series-id={item.id}>
          <path className="surtr-dps-chart-line" d={path} stroke={item.color} strokeDasharray={item.dashArray} data-chart-image-ink="" />
          {item.points.filter(point => point.value !== null).map(point => <circle key={point.x} cx={plot.x(point.x)} cy={plot.y(point.value!)}
            r={plot.times.length <= 60 || plot.times.length === 1 ? 2.5 : 0} fill="#fff" stroke={item.color} strokeWidth="1.5" data-chart-image-ink="">
            <title>{`${item.label}・${seconds.format(point.x)}秒・${plot.formatValue(point.value)}`}</title>
          </circle>)}
        </g>
      })}
      {kind === 'line' && activeTime != null && <g className="surtr-dps-chart-cursor">
        <line x1={plot.x(activeTime)} x2={plot.x(activeTime)} y1={plot.top} y2={plot.bottom} />
        {series.map(item => {
          const point = item.points.find(point => point.x === activeTime)
          return point?.value != null ? <circle key={item.id} cx={plot.x(activeTime)} cy={plot.y(point.value)} r="4"
            fill="#fff" stroke={item.color} strokeWidth="2" /> : null
        })}
      </g>}
    </g>
    <g transform={`translate(${plot.left} ${plot.top})`} aria-hidden="true">
      {plot.placement.labels.filter(label => label.shifted).map(label => <line className="surtr-dps-chart-value-connector" key={label.id}
        x1={label.anchorX} y1={label.anchorY - 2} x2={label.x + label.width / 2} y2={label.y + label.height} data-chart-image-ink="" />)}
      {plot.placement.labels.map(label => <g key={label.id}>
        <rect className="surtr-dps-chart-value-background" x={label.x} y={label.y} width={label.width} height={label.height} />
        <text className="surtr-dps-chart-value-label" x={label.x + label.width / 2} y={label.y + 12} textAnchor="middle"
          data-chart-image-ink="">{valueById.get(label.id)!.text}</text>
      </g>)}
    </g>
    {!plot.hasValues && <text className="surtr-dps-chart-empty" x={(plot.left + plot.right) / 2} y={(plot.top + plot.bottom) / 2}
      textAnchor="middle">表示できる計算結果がありません</text>}
  </svg>
}

export function SurtrTotalDamageChart({ series, kind = 'line', precision = 0, gridStyle = 'dashed', showValues = false,
  showLegend = true, title = DEFAULT_TITLE, selectedTime, onSelectTime }: SurtrTotalDamageChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  const [localSelection, setLocalSelection] = useState<number | null>(null)
  const helpId = useId()
  const data = useMemo(() => normalizeSeries(series), [series])
  const metrics = usePlotText(data, precision, kind === 'bar' && showValues, VALUE_AXIS)
  const times = useMemo(() => [...new Set(data.flatMap(item => item.points.map(point => point.x)))].sort((a, b) => a - b), [data])
  const width = kind === 'bar' ? Math.max(availableWidth, 80 + times.length * Math.max(48, data.length * 17 + 18)) : availableWidth
  const plot = getPlot(data, width, SURTR_TOTAL_DAMAGE_CHART_HEIGHT, kind, precision, showValues, VALUE_AXIS, metrics)
  const selection = selectedTime === undefined ? localSelection : selectedTime
  const selected = selection != null && times.includes(selection) ? selection : null
  const activeTime = hover != null && times.includes(hover) ? hover : selected
  const accessibleTime = activeTime ?? times[0] ?? 0

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setAvailableWidth(Math.max(240, viewport.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || selected == null || kind !== 'bar') return
    const center = plot.x(selected)
    if (center - plot.bandWidth / 2 < scroll.scrollLeft || center + plot.bandWidth / 2 > scroll.scrollLeft + scroll.clientWidth) {
      scroll.scrollLeft = Math.max(0, center - scroll.clientWidth / 2)
    }
  }, [selected, kind, width, plot.bandWidth, plot.x])

  function pointerTime(clientX: number, element: HTMLDivElement) {
    if (!times.length) return null
    const bounds = element.getBoundingClientRect()
    const pointerX = (clientX - bounds.left) / Math.max(1, bounds.width) * width
    return times.reduce((closest, time) => Math.abs(plot.x(time) - pointerX) < Math.abs(plot.x(closest) - pointerX) ? time : closest)
  }

  function selectTime(time: number | null) {
    if (selectedTime === undefined) setLocalSelection(time)
    setHover(null)
    onSelectTime?.(time)
  }

  function selectKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); selectTime(null); return }
    if (!times.length) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); selectTime(selected === accessibleTime ? null : accessibleTime); return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = Math.max(0, times.indexOf(accessibleTime))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? times.length - 1
      : index + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1)
    selectTime(times[Math.max(0, Math.min(times.length - 1, next))])
  }

  return <figure className="surtr-dps-chart surtr-total-damage-chart">
    {showLegend && <figcaption><ul className="surtr-dps-chart-legend" aria-label="比較する系列">
      {data.map(item => <li key={item.id}><SeriesSwatch item={item} kind={kind} /><span>{item.label}</span></li>)}
    </ul></figcaption>}
    <div className="surtr-dps-chart-viewport" ref={viewportRef}>
      <div className="surtr-dps-chart-scroll" ref={scrollRef}>
        <div className="surtr-dps-chart-frame" style={{ width }} role="slider" tabIndex={times.length ? 0 : -1}
          aria-label={TIME_AXIS} aria-describedby={helpId} aria-disabled={!times.length || undefined}
          aria-valuemin={times[0] ?? 0} aria-valuemax={times.at(-1) ?? 0} aria-valuenow={accessibleTime}
          aria-valuetext={`${seconds.format(accessibleTime)}秒、${data.map(item =>
            `${item.label} ${plot.formatValue(item.points.find(point => point.x === accessibleTime)?.value)}`).join('、')}`}
          onPointerMove={event => setHover(pointerTime(event.clientX, event.currentTarget))}
          onPointerLeave={() => setHover(null)} onClick={event => {
            const time = pointerTime(event.clientX, event.currentTarget)
            selectTime(time === selected ? null : time)
          }} onFocus={() => { if (times.length) setHover(selected ?? times[0]) }} onBlur={() => setHover(null)} onKeyDown={selectKeyboard}>
          <PlotSvg series={data} title={title} kind={kind} gridStyle={gridStyle} plot={plot} activeTime={activeTime} />
        </div>
      </div>
      {activeTime != null && <div className={`surtr-dps-chart-tooltip${activeTime > (times[0] + times[times.length - 1]) / 2 ? ' is-left' : ''}`} aria-hidden="true">
        <strong>素質２発動まで {seconds.format(activeTime)} 秒</strong>
        <dl>{data.map(item => <div key={item.id}><dt><SeriesSwatch item={item} kind={kind} /><span>{item.label}</span></dt>
          <dd>{plot.formatValue(item.points.find(point => point.x === activeTime)?.value)}</dd></div>)}</dl>
      </div>}
    </div>
    <p className="surtr-dps-chart-axis-caption">{TIME_AXIS}</p>
    <span className="surtr-dps-chart-sr-only" id={helpId}>左右の矢印キーで時刻を選択、Escapeキーで選択を解除できます。</span>
  </figure>
}

function ImagePlot({ series, title, kind, precision, gridStyle, showValues, axisTitle, width, height, reservedOverflow, onOverflow }: {
  series: SurtrTotalDamageChartSeries[]; title: string; kind: 'line' | 'bar'; precision: number
  gridStyle: 'none' | 'dashed' | 'solid'; showValues: boolean; axisTitle: string; width: number; height: number
  reservedOverflow: number; onOverflow: (height: number) => void
}) {
  const metrics = usePlotText(series, precision, kind === 'bar' && showValues, axisTitle)
  const baseHeight = Math.max(SURTR_TOTAL_DAMAGE_CHART_HEIGHT, height - reservedOverflow)
  const plot = getPlot(series, width, baseHeight, kind, precision, showValues, axisTitle, metrics)
  const overflow = plot.height - baseHeight
  useLayoutEffect(() => { onOverflow(overflow) }, [onOverflow, overflow])
  return <PlotSvg series={series} title={title} kind={kind} gridStyle={gridStyle} plot={plot} />
}

export function SurtrTotalDamageChartImage({ series, kind = 'line', precision = 0, gridStyle = 'dashed', showValues = false,
  title = DEFAULT_TITLE, conditions, labels, aspectRatio, onLayout }: SurtrTotalDamageChartImageProps) {
  const data = useMemo(() => normalizeSeries(series), [series])
  const display = resolveChartImageLabels(getSurtrTotalDamageImageLabelDefaults(data, title), labels)
  const displaySeries = applyChartImageSeriesLabels(data, labels)
  const request = JSON.stringify([data, kind, precision, gridStyle, showValues, title, conditions, labels, aspectRatio])
  const [expansion, setExpansion] = useState({ request, overflow: 0 })
  const overflow = expansion.request === request ? expansion.overflow : 0
  const reserveOverflow = useCallback((required: number) => {
    setExpansion(current => current.request === request && current.overflow >= required ? current
      : { request, overflow: Math.max(current.request === request ? current.overflow : 0, required) })
  }, [request])
  return <ChartImageFrame key={request} className="surtr-dps-chart-image surtr-total-damage-chart-image" title={display.title}
    conditions={conditions} legend={<SurtrTotalDamageImageLegend series={displaySeries} kind={kind} />} axisTitle={display.xAxis}
    naturalChartHeight={SURTR_TOTAL_DAMAGE_CHART_HEIGHT + overflow} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <ImagePlot series={displaySeries} title={display.title} kind={kind} precision={precision}
      gridStyle={gridStyle} showValues={showValues} axisTitle={display.yAxis} width={width} height={height}
      reservedOverflow={overflow} onOverflow={reserveOverflow} />}
  </ChartImageFrame>
}

function ImagePreview(props: Omit<SurtrTotalDamageChartImageProps, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(() => getChartImageLayout({ naturalChartHeight: SURTR_TOTAL_DAMAGE_CHART_HEIGHT, aspectRatio: props.aspectRatio }))
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height, Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="surtr-dps-chart-preview">
    <div className="surtr-dps-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-dps-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-dps-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrTotalDamageChartImage {...props} onLayout={layout => setSize(current =>
          current.width === layout.width && current.height === layout.height ? current : { ...current, ...layout })} />
      </div>
    </div>
    <span className="surtr-dps-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}

export function SurtrTotalDamageChartImagePreview(props: Omit<SurtrTotalDamageChartImageProps, 'onLayout'>) {
  return <ImagePreview key={JSON.stringify(props)} {...props} />
}
