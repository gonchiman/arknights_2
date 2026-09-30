import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getHpChartValueAxis, isValidHpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import { ChartImageFrame } from './ChartImageFrame'
import './SurtrDpsChart.css'

export interface SurtrDpsChartSeries {
  id: string
  label: string
  color: string
  points: { x: number; value: number | null }[]
}

export type SurtrDpsChartKind = 'bar' | 'line'
export type SurtrDpsChartMetric = 'total' | 'difference' | 'percent'
export interface SurtrDpsChartYAxis {
  mode: 'zero' | 'auto' | 'manual'
  min?: number
  max?: number
}

interface SurtrDpsChartProps {
  series: SurtrDpsChartSeries[]
  kind?: SurtrDpsChartKind
  barStep?: number
  gridStyle?: 'none' | 'dashed' | 'solid'
  precision?: number
  metric?: SurtrDpsChartMetric
  title?: string
  yAxis?: SurtrDpsChartYAxis
  selectedResistance?: number | null
  onSelectResistance?: (value: number | null) => void
}

interface SurtrDpsChartImageProps extends Omit<SurtrDpsChartProps, 'onSelectResistance'> {
  conditions: string
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

const NATURAL_CHART_HEIGHT = 334
const DASH_PATTERNS = [undefined, '7 4', '2 3', '10 3 2 3', '4 3 1 3', '12 3 4 3'] as const
const X_TICKS = Array.from({ length: 11 }, (_, index) => index * 10)

function normalizeSeries(series: SurtrDpsChartSeries[], kind: SurtrDpsChartKind, barStep: number, selectedResistance?: number | null): SurtrDpsChartSeries[] {
  const step = Number.isInteger(barStep) && barStep >= 1 && barStep <= 100 ? barStep : 20
  return series.map((item) => ({ ...item, points: item.points.filter((point) => (
    Number.isFinite(point.x) && point.x >= 0 && point.x <= 100
    && (kind !== 'bar' || point.x % step === 0 || point.x === selectedResistance)
  )).map((point) => ({ x: point.x, value: point.value !== null && Number.isFinite(point.value) ? point.value : null }))
    .sort((a, b) => a.x - b.x) }))
}

function createValueFormatter(precision = 0, metric: SurtrDpsChartMetric = 'total') {
  const digits = Number.isFinite(precision) ? Math.max(0, Math.min(20, Math.trunc(precision))) : 0
  const formatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    const rounded = Number(value.toFixed(digits))
    return `${formatter.format(rounded === 0 ? 0 : rounded)}${metric === 'percent' ? '%' : ''}`
  }
}

function getPlot(series: SurtrDpsChartSeries[], width: number, height: number, kind: SurtrDpsChartKind,
  { precision = 0, metric = 'total', yAxis }: Pick<SurtrDpsChartProps, 'precision' | 'metric' | 'yAxis'> = {}) {
  const values = series.flatMap((item) => item.points.flatMap((point) => point.value === null ? [] : [point.value]))
  const manualRange = { min: yAxis?.min ?? Number.NaN, max: yAxis?.max ?? Number.NaN }
  const mode = yAxis?.mode === 'manual' && !isValidHpChartYAxisRange(manualRange) ? 'zero' : yAxis?.mode ?? 'zero'
  const axis = getHpChartValueAxis(kind === 'bar' && mode === 'auto' ? [...values, 0] : values,
    { mode, nonNegative: metric === 'total', manualRange })
  const ticks = axis.yTicks
  const formatValue = createValueFormatter(precision, metric)
  const tickPrecision = [axis.valueStep, ...(mode === 'manual' ? [axis.lowerLimit, axis.upperLimit] : [])]
    .reduce((digits, value) => {
      const [coefficient, exponent = '0'] = String(value).split('e')
      return Math.max(digits, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent))
    }, Number.isFinite(precision) ? precision : 0)
  const formatTick = createValueFormatter(tickPrecision, metric)
  const left = Math.max(54, ...ticks.map((tick) => formatTick(tick).length * 7 + 12))
  const right = Math.max(left + 1, width - 18)
  const top = 26
  const bottom = Math.max(top + 1, height - 28)
  const xValues = [...new Set(series.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b)
  const bandWidth = (right - left) / Math.max(1, xValues.length)
  const barGap = 3
  const barWidth = Math.max(1, Math.min(32, (bandWidth * 0.74 - barGap * Math.max(0, series.length - 1)) / Math.max(1, series.length)))
  const groupWidth = series.length * barWidth + Math.max(0, series.length - 1) * barGap
  return {
    left, right, top, bottom, ticks, bandWidth, barWidth, barGap, groupWidth, formatValue, formatTick,
    minimum: axis.lowerLimit, maximum: axis.upperLimit,
    xTicks: kind === 'bar' ? xValues : X_TICKS,
    x: (value: number) => kind === 'bar'
      ? left + (xValues.indexOf(value) + 0.5) * bandWidth
      : left + value / 100 * (right - left),
    y: (value: number) => bottom - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * (bottom - top),
  }
}

function buildLinePath(points: SurtrDpsChartSeries['points'], plot: ReturnType<typeof getPlot>) {
  let hasPrevious = false
  return points.map((point) => {
    if (point.value === null) { hasPrevious = false; return '' }
    const command = hasPrevious ? 'L' : 'M'
    hasPrevious = true
    return `${command} ${plot.x(point.x)} ${plot.y(point.value)}`
  }).join(' ')
}

function SeriesSwatch({ color, index, kind, image = false }: { color: string; index: number; kind: SurtrDpsChartKind; image?: boolean }) {
  return <svg className={image ? 'chart-image-frame-legend-swatch' : 'surtr-dps-chart-swatch'}
    width="18" height="12" aria-hidden="true">
    {kind === 'bar' ? <rect x="4" y="1" width="10" height="10" fill={color} />
      : <line x1="0" x2="18" y1="6" y2="6" stroke={color} strokeWidth="2"
        strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]} />}
  </svg>
}

function SurtrDpsSvg({ series, kind = 'line', width, height, activeX, gridStyle = 'solid', precision = 0,
  metric = 'total', title = 'スルト S3 DPS', yAxis }: SurtrDpsChartProps & {
  width: number; height: number; activeX?: number | null
}) {
  const clipId = `surtr-dps-clip-${useId().replace(/:/g, '')}`
  const plot = getPlot(series, width, height, kind, { precision, metric, yAxis })
  const axisTitle = metric === 'percent' ? '増減率（%）' : metric === 'difference' ? 'DPS差分' : 'DPS'
  return <svg className="surtr-dps-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role="img" aria-label={`${title}・${kind === 'bar' ? '棒グラフ' : '折れ線グラフ'}`}>
    <defs><clipPath id={clipId}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath></defs>
    <text className="surtr-dps-chart-axis-title" x={plot.left} y="16">{axisTitle}</text>
    {kind === 'bar' && activeX !== undefined && activeX !== null && <rect className="surtr-dps-chart-active-band"
      x={plot.x(activeX) - plot.bandWidth / 2 + 2} y={plot.top}
      width={Math.max(1, plot.bandWidth - 4)} height={plot.bottom - plot.top} />}
    {plot.ticks.map((tick) => <g key={`y-${tick}`}>
      {gridStyle !== 'none' && <line className="surtr-dps-chart-grid" x1={plot.left} x2={plot.right} y1={plot.y(tick)} y2={plot.y(tick)}
        strokeDasharray={gridStyle === 'dashed' ? '4 4' : undefined} />}
      <text className="surtr-dps-chart-tick" x={plot.left - 9} y={plot.y(tick) + 4} textAnchor="end">
        {plot.formatTick(tick)}
      </text>
    </g>)}
    {plot.xTicks.map((tick) => <g key={`x-${tick}`}>
      {kind === 'line' && <line className="surtr-dps-chart-grid surtr-dps-chart-grid-vertical" x1={plot.x(tick)} x2={plot.x(tick)}
        y1={plot.top} y2={plot.bottom} />}
      <text className="surtr-dps-chart-tick" x={plot.x(tick)} y={plot.bottom + 20} textAnchor="middle">{tick}</text>
    </g>)}
    <path className="surtr-dps-chart-axis" d={`M ${plot.left} ${plot.top} V ${plot.bottom} H ${plot.right}`} />
    <g clipPath={`url(#${clipId})`}>
    {plot.minimum < 0 && plot.maximum >= 0 && <line className="surtr-dps-chart-zero"
      x1={plot.left} x2={plot.right} y1={plot.y(0)} y2={plot.y(0)} />}
    {series.map((item, index) => kind === 'bar'
      ? <g key={item.id}>{item.points.map((point) => point.value === null ? null : <rect key={point.x} className="surtr-dps-chart-bar"
        x={plot.x(point.x) - plot.groupWidth / 2 + index * (plot.barWidth + plot.barGap)} y={Math.min(plot.y(point.value), plot.y(0))}
        width={plot.barWidth} height={Math.abs(plot.y(0) - plot.y(point.value))} fill={item.color} />)}</g>
      : <path key={item.id} className="surtr-dps-chart-line"
        d={buildLinePath(item.points, plot)}
        stroke={item.color} strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]} />)}
    {kind === 'line' && activeX !== undefined && activeX !== null && <g className="surtr-dps-chart-cursor">
      <line x1={plot.x(activeX)} x2={plot.x(activeX)} y1={plot.top} y2={plot.bottom} />
      {series.map((item) => {
        const point = item.points.find((entry) => entry.x === activeX)
        return point?.value !== null && point?.value !== undefined ? <circle key={item.id} cx={plot.x(activeX)} cy={plot.y(point.value)} r="4"
          fill="#fff" stroke={item.color} strokeWidth="2" /> : null
      })}
    </g>}
    </g>
  </svg>
}

export function SurtrDpsChart({ series, kind = 'line', barStep = 20, gridStyle = 'solid', precision = 0,
  metric = 'total', title = 'スルト S3 DPS', yAxis, selectedResistance, onSelectResistance }: SurtrDpsChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  const [hoveredX, setHoveredX] = useState<number | null>(null)
  const [localSelection, setLocalSelection] = useState<number | null>(null)
  const selection = selectedResistance === undefined ? localSelection : selectedResistance
  const helpId = useId()
  const data = useMemo(() => normalizeSeries(series, kind, barStep, selection), [series, kind, barStep, selection])
  const xValues = useMemo(() => [...new Set(data.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b), [data])
  const height = availableWidth < 520 ? 290 : NATURAL_CHART_HEIGHT
  const basePlot = getPlot(data, availableWidth, height, kind, { precision, metric, yAxis })
  const minimumBarWidth = basePlot.left + 18 + xValues.length * Math.max(48, data.length * 16 + Math.max(0, data.length - 1) * 3 + 24)
  const width = kind === 'bar' ? Math.max(availableWidth, minimumBarWidth) : availableWidth
  const plot = width === availableWidth ? basePlot : getPlot(data, width, height, kind, { precision, metric, yAxis })
  const selectedX = selection !== null && xValues.includes(selection) ? selection : null
  const activeX = hoveredX !== null && xValues.includes(hoveredX) ? hoveredX : selectedX
  const selectedPoints = data.map((item, index) => ({ item, index, point: item.points.find((point) => point.x === activeX) }))
  const accessibleX = activeX ?? xValues[0] ?? 0
  const accessibleValue = data.map((item) => {
    const point = item.points.find((entry) => entry.x === accessibleX)
    return `${item.label} ${plot.formatValue(point?.value)}`
  }).join('、')

  useLayoutEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(240, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => { if (selectedX !== null) revealResistance(selectedX) }, [selectedX, kind, width, xValues])

  function pointerResistance(clientX: number, element: HTMLDivElement) {
    if (xValues.length === 0) return null
    const bounds = element.getBoundingClientRect()
    const pointerX = (clientX - bounds.left) / bounds.width * width
    return xValues.reduce((closest, value) => Math.abs(plot.x(value) - pointerX) < Math.abs(plot.x(closest) - pointerX) ? value : closest)
  }

  function selectPointer(event: PointerEvent<HTMLDivElement>) {
    setHoveredX(pointerResistance(event.clientX, event.currentTarget))
  }

  function revealResistance(value: number) {
    const scroll = scrollRef.current
    if (!scroll || kind !== 'bar') return
    const center = plot.x(value)
    if (center - plot.bandWidth / 2 < scroll.scrollLeft || center + plot.bandWidth / 2 > scroll.scrollLeft + scroll.clientWidth) {
      scroll.scrollLeft = Math.max(0, center - scroll.clientWidth / 2)
    }
  }

  function selectResistance(value: number | null) {
    if (selectedResistance === undefined) setLocalSelection(value)
    setHoveredX(null)
    onSelectResistance?.(value)
    if (value !== null) revealResistance(value)
  }

  function selectKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); selectResistance(null); return }
    if (xValues.length && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      selectResistance(selectedX === accessibleX ? null : accessibleX)
      return
    }
    if (xValues.length === 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = Math.max(0, xValues.indexOf(accessibleX))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? xValues.length - 1
      : index + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1)
    selectResistance(xValues[Math.max(0, Math.min(xValues.length - 1, next))])
  }

  return <figure className="surtr-dps-chart">
    <figcaption>
      <ul className="surtr-dps-chart-legend" aria-label="比較する系列">
        {data.map((item, index) => <li key={item.id}>
          <SeriesSwatch color={item.color} index={index} kind={kind} /><span>{item.label}</span>
        </li>)}
      </ul>
    </figcaption>
    <div ref={viewportRef} className="surtr-dps-chart-viewport">
      <div ref={scrollRef} className="surtr-dps-chart-scroll">
        <div className="surtr-dps-chart-frame" style={{ width }} role="slider" tabIndex={xValues.length ? 0 : -1}
          aria-label={`${title}・敵の術耐性`} aria-describedby={helpId} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={accessibleX} aria-valuetext={`術耐性 ${accessibleX}、${accessibleValue}`}
          onPointerMove={selectPointer} onPointerDown={selectPointer}
          onPointerLeave={() => setHoveredX(null)}
          onClick={(event) => {
            const value = pointerResistance(event.clientX, event.currentTarget)
            selectResistance(value === selectedX ? null : value)
          }}
          onFocus={() => { if (xValues.length) setHoveredX(activeX ?? xValues[0]) }}
          onBlur={() => setHoveredX(null)} onKeyDown={selectKeyboard}>
          <SurtrDpsSvg series={data} kind={kind} width={width} height={height} activeX={activeX}
            gridStyle={gridStyle} precision={precision} metric={metric} title={title} yAxis={yAxis} />
        </div>
      </div>
      {activeX !== null && <div className={`surtr-dps-chart-tooltip${activeX > 50 ? ' is-left' : ''}`} aria-hidden="true">
        <strong>術耐性 {activeX}</strong>
        <dl>{selectedPoints.map(({ item, index, point }) => <div key={item.id}>
          <dt><SeriesSwatch color={item.color} index={index} kind={kind} /><span>{item.label}</span></dt>
          <dd>{plot.formatValue(point?.value)}</dd>
        </div>)}</dl>
      </div>}
    </div>
    <p className="surtr-dps-chart-axis-caption">敵の術耐性</p>
    <span id={helpId} className="surtr-dps-chart-sr-only">左右の矢印キーで術耐性を選択、Escapeキーで選択を解除できます。</span>
  </figure>
}

export function SurtrDpsChartImage({ series, kind = 'line', barStep = 20, gridStyle = 'solid', precision = 0,
  metric = 'total', title = 'スルト S3 DPS', yAxis, selectedResistance, conditions, aspectRatio, onLayout }: SurtrDpsChartImageProps) {
  const data = useMemo(() => normalizeSeries(series, kind, barStep, selectedResistance), [series, kind, barStep, selectedResistance])
  return <ChartImageFrame className="surtr-dps-chart-image" title={title} conditions={conditions}
    axisTitle="敵の術耐性" naturalChartHeight={NATURAL_CHART_HEIGHT} aspectRatio={aspectRatio} onLayout={onLayout}
    legend={<ul className="chart-image-frame-legend-list" aria-label="比較する系列">
      {data.map((item, index) => <li className="chart-image-frame-legend-item" key={item.id}>
        <SeriesSwatch color={item.color} index={index} kind={kind} image /><span>{item.label}</span>
      </li>)}
    </ul>}>
    {({ width, height }) => <SurtrDpsSvg series={data} kind={kind} width={width} height={height}
      gridStyle={gridStyle} precision={precision} metric={metric} title={title} yAxis={yAxis} />}
  </ChartImageFrame>
}

export function SurtrDpsChartImagePreview(props: Omit<SurtrDpsChartImageProps, 'onLayout'>) {
  const { aspectRatio } = props
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getChartImageLayout({ naturalChartHeight: NATURAL_CHART_HEIGHT, aspectRatio }))
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
  const snapshotKey = JSON.stringify(props)
  return <div className="surtr-dps-chart-preview">
    <div className="surtr-dps-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-dps-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-dps-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrDpsChartImage key={snapshotKey} {...props} onLayout={setSize} />
      </div>
    </div>
    <span className="surtr-dps-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}
