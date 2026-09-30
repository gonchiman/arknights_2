import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { ChartImageFrame } from './ChartImageFrame'
import './SurtrDurationChart.css'

export interface SurtrDurationSeries {
  id: string
  label: string
  color: string
  remnantStart: number
  remnantDuration: number
  retreatTime: number
  points: { time: number; hpPercent: number }[]
}

export interface SurtrDurationChartProps {
  series: SurtrDurationSeries[]
  title?: string
  selection?: { time: number; hpPercent: number | null }
}

export interface SurtrDurationChartImageProps extends Omit<SurtrDurationChartProps, 'selection'> {
  conditions: string
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

const NATURAL_CHART_HEIGHT = 334
const DASH_PATTERNS = [undefined, '8 5', '2 5', '10 4 2 4'] as const
const seconds = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

function normalizeSeries(series: SurtrDurationSeries[]) {
  return series.filter((item) => Number.isFinite(item.remnantStart) && item.remnantStart >= 0
    && Number.isFinite(item.remnantDuration) && item.remnantDuration >= 0
    && Number.isFinite(item.retreatTime) && item.retreatTime >= item.remnantStart)
    .map((item) => ({ ...item, points: item.points.filter((point) => Number.isFinite(point.time)
      && Number.isFinite(point.hpPercent) && point.time >= 0 && point.time <= item.retreatTime)
      .map((point) => ({ time: point.time, hpPercent: Math.max(0, Math.min(100, point.hpPercent)) }))
      .sort((a, b) => a.time - b.time) }))
}

function SeriesSwatch({ item, index, image = false }: { item: SurtrDurationSeries; index: number; image?: boolean }) {
  return <svg className={image ? 'chart-image-frame-legend-swatch' : 'surtr-duration-chart-swatch'}
    width="18" height="12" aria-hidden="true">
    <line x1="0" x2="18" y1="6" y2="6" stroke={item.color} strokeWidth="2"
      strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]} />
  </svg>
}

function ChartLegend({ series, image = false }: { series: SurtrDurationSeries[]; image?: boolean }) {
  const listClass = image ? 'chart-image-frame-legend-list' : 'surtr-duration-chart-legend'
  const itemClass = image ? 'chart-image-frame-legend-item' : undefined
  return <ul className={listClass} aria-label="装備">
    {series.map((item, index) => <li className={itemClass} key={item.id}>
      <SeriesSwatch item={item} index={index} image={image} /><span>{item.label}</span>
    </li>)}
  </ul>
}

function SurtrDurationSvg({ series, title, selection, width, height }: Required<Omit<SurtrDurationChartProps, 'selection'>> & {
  selection?: SurtrDurationChartProps['selection']
  width: number; height: number
}) {
  const titleId = useId()
  const descriptionId = useId()
  const clipId = useId()
  const left = 54
  const right = width - 20
  const top = 48
  const bottom = height - 32
  const largestTime = Math.max(1, ...series.map((item) => item.retreatTime))
  const tickStep = largestTime <= 50 ? 5 : largestTime <= 100 ? 10 : Math.ceil(largestTime / 50) * 10
  const maximumTime = Math.ceil(largestTime / tickStep) * tickStep
  const ticks = Array.from({ length: Math.round(maximumTime / tickStep) + 1 }, (_, index) => index * tickStep)
  const x = (time: number) => left + time / maximumTime * (right - left)
  const y = (hp: number) => bottom - hp / 100 * (bottom - top)
  const summary = series.map((item) => `${item.label}：余燼発動まで ${seconds.format(item.remnantStart)} 秒、余燼中 ${seconds.format(item.remnantDuration)} 秒、退場まで ${seconds.format(item.retreatTime)} 秒`).join('。')
  const selectedTime = selection && series.length > 0 && Number.isFinite(selection.time)
    && selection.time >= 0 && selection.time <= maximumTime ? selection.time : null
  const selectedHp = selectedTime !== null && selection?.hpPercent !== null && selection?.hpPercent !== undefined
    && Number.isFinite(selection.hpPercent) && selection.hpPercent >= 0 && selection.hpPercent <= 100 ? selection.hpPercent : null
  const selectedSummary = selectedTime === null ? ''
    : `。選択時刻 ${seconds.format(selectedTime)} 秒${selectedHp === null ? '' : `、HP ${seconds.format(selectedHp)}%`}`
  const selectionLabel = selectedTime === null ? '' : `選択 ${seconds.format(selectedTime)} 秒`
  const selectionLabelWidth = selectedTime === null ? 0 : seconds.format(selectedTime).length * 6 + 48
  const selectionLabelX = selectedTime === null ? left : Math.max(left + selectionLabelWidth / 2,
    Math.min(right - selectionLabelWidth / 2, x(selectedTime)))

  return <svg className="surtr-duration-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>{title}</title><desc id={descriptionId}>{summary ? summary + selectedSummary : '装備を選択してください。'}</desc>
    {series.length === 0 ? <text className="surtr-duration-chart-empty" x={width / 2} y={height / 2} textAnchor="middle">
      装備を選択してください
    </text> : <>
      <defs><clipPath id={clipId}><rect x={left - 2} y={top - 3} width={right - left + 4} height={bottom - top + 6} /></clipPath></defs>
      {ticks.map((tick) => <g key={tick}>
        <line className="surtr-duration-chart-grid" x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
        <text className="surtr-duration-chart-tick" x={x(tick)} y={bottom + 21} textAnchor="middle">{tick}</text>
      </g>)}
      <text className="surtr-duration-chart-axis-title" x={left} y="18">HP（%）</text>
      <g className="surtr-duration-chart-event-key" transform={`translate(${right - 155} 15)`} aria-hidden="true">
        <circle cx="4" cy="0" r="3.5" fill="#fff" stroke="#666" strokeWidth="1.5" />
        <text x="14" y="4">余燼発動</text>
        <path d="M 91 -4 l 8 8 M 99 -4 l -8 8" fill="none" stroke="#666" strokeWidth="1.5" />
        <text x="106" y="4">退場</text>
      </g>
      {[0, 20, 40, 60, 80, 100].map((tick) => <g key={`hp-${tick}`}>
        <line className="surtr-duration-chart-grid surtr-duration-chart-grid-horizontal" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
        <text className="surtr-duration-chart-tick" x={left - 9} y={y(tick) + 4} textAnchor="end">{tick}</text>
      </g>)}
      <path className="surtr-duration-chart-axis" d={`M ${left} ${top} V ${bottom} H ${right}`} />
      {selectedTime !== null && <g className="surtr-duration-chart-selection" aria-hidden="true">
        <line className="surtr-duration-chart-selection-guide" x1={x(selectedTime)} x2={x(selectedTime)} y1={top - 5} y2={bottom} />
        <rect className="surtr-duration-chart-selection-label-background" x={selectionLabelX - selectionLabelWidth / 2}
          y="24" width={selectionLabelWidth} height="18" rx="3" />
        <text className="surtr-duration-chart-selection-label" x={selectionLabelX} y="37" textAnchor="middle">{selectionLabel}</text>
      </g>}
      <g clipPath={`url(#${clipId})`}>{series.map((item, index) => <path key={item.id} className="surtr-duration-chart-line"
        d={item.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${x(point.time)} ${y(point.hpPercent)}`).join(' ')}
        stroke={item.color} strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]} />)}</g>
      {series.map((item, index) => {
        // Concentric markers preserve the true coordinates when several builds have the same event time.
        const radius = 4 + index * 2.5
        const lastPointBeforeTrigger = item.points.filter((point) => point.time <= item.remnantStart).at(-1)
        const triggerHp = lastPointBeforeTrigger?.hpPercent ?? 0
        const retreatHp = item.points.at(-1)?.hpPercent ?? 0
        return <g key={item.id} className="surtr-duration-chart-events" fill="none" stroke={item.color} strokeWidth="1.75">
          <circle cx={x(item.remnantStart)} cy={y(triggerHp)} r={radius}>
            <title>{`${item.label}・余燼発動 ${seconds.format(item.remnantStart)} 秒`}</title>
          </circle>
          <path d={`M ${x(item.retreatTime) - radius} ${y(retreatHp) - radius} l ${radius * 2} ${radius * 2} M ${x(item.retreatTime) + radius} ${y(retreatHp) - radius} l ${-radius * 2} ${radius * 2}`}>
            <title>{`${item.label}・退場 ${seconds.format(item.retreatTime)} 秒`}</title>
          </path>
        </g>
      })}
      {selectedTime !== null && selectedHp !== null && <circle className="surtr-duration-chart-selection-point"
        cx={x(selectedTime)} cy={y(selectedHp)} r="4.5" fill={series[0].color} stroke="#fff" strokeWidth="2">
        <title>{`${seconds.format(selectedTime)} 秒・HP ${seconds.format(selectedHp)}%`}</title>
      </circle>}
    </>}
  </svg>
}

export function SurtrDurationChart({ series, title = 'HPの推移', selection }: SurtrDurationChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  const data = useMemo(() => normalizeSeries(series), [series])
  useLayoutEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const width = Math.max(520, availableWidth)
  return <figure className="surtr-duration-chart">
    <figcaption><ChartLegend series={data} /></figcaption>
    <div ref={viewportRef} className="surtr-duration-chart-viewport">
      <div className="surtr-duration-chart-scroll" tabIndex={availableWidth < width ? 0 : undefined}
        role="region" aria-label={`${title}のグラフ`}>
        <SurtrDurationSvg series={data} title={title} selection={selection} width={width} height={NATURAL_CHART_HEIGHT} />
      </div>
    </div>
    <p className="surtr-duration-chart-axis-caption">S3発動からの時間（秒）</p>
  </figure>
}

export function SurtrDurationChartImage({ series, title = 'HPの推移', conditions,
  aspectRatio, onLayout }: SurtrDurationChartImageProps) {
  const data = useMemo(() => normalizeSeries(series), [series])
  const snapshotKey = JSON.stringify([data, title, conditions, aspectRatio])
  return <ChartImageFrame key={snapshotKey} className="surtr-duration-chart-image" title={title} conditions={conditions}
    legend={<ChartLegend series={data} image />} axisTitle="S3発動からの時間（秒）"
    naturalChartHeight={NATURAL_CHART_HEIGHT} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <SurtrDurationSvg series={data} title={title} width={width} height={height} />}
  </ChartImageFrame>
}

export function SurtrDurationChartImagePreview(props: Omit<SurtrDurationChartImageProps, 'onLayout'>) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState(() => getChartImageLayout({ naturalChartHeight: NATURAL_CHART_HEIGHT, aspectRatio: props.aspectRatio }))
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
  return <div className="surtr-duration-chart-preview">
    <div className="surtr-duration-chart-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="surtr-duration-chart-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="surtr-duration-chart-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <SurtrDurationChartImage key={snapshotKey} {...props} onLayout={(layout) => setSize((current) =>
          current.width === layout.width && current.height === layout.height ? current : { ...current, ...layout })} />
      </div>
    </div>
    <span className="surtr-duration-chart-preview-size" aria-live="polite">
      {Math.floor(size.width * pixelRatio).toLocaleString('ja-JP')} × {Math.floor(size.height * pixelRatio).toLocaleString('ja-JP')} px
    </span>
  </div>
}
