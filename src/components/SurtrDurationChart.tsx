import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { placeGroupedBarValueLabels } from '../lib/groupedBarValueLabels'
import { prepareSurtrDurationChartSeries, type SurtrDurationChartRange, type SurtrDurationChartViewEvent } from '../lib/surtrDurationChartView'
import { applyChartImageSeriesLabels, resolveChartImageLabels,
  type ChartImageLabelDefaults, type ChartImageLabelOverrides } from '../lib/chartImageLabels'
import { wrapText } from '../lib/slideComposer'
import { ChartImageFrame } from './ChartImageFrame'
import './SurtrDurationChart.css'

export interface SurtrDurationSeries {
  id: string
  label: string
  color: string
  remnantStart: number | null
  remnantDuration: number
  retreatTime: number | null
  endTime?: number
  points: { time: number; hpPercent: number; phase?: string }[]
  events?: readonly SurtrDurationChartViewEvent[]
}

export interface SurtrDurationChartProps {
  series: SurtrDurationSeries[]
  title?: string
  range?: SurtrDurationChartRange
  selection?: { time: number; hpPercent: number | null; seriesId?: string }
}

export interface SurtrDurationChartImageProps extends Omit<SurtrDurationChartProps, 'selection'> {
  conditions: string
  labels?: ChartImageLabelOverrides
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

const NATURAL_CHART_HEIGHT = 334
const AXIS_TITLE_FONT = '700 12px "Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'
const AXIS_TITLE_LINE_HEIGHT = 16
const seconds = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function getSurtrDurationImageLabelDefaults(
  series: readonly { id: string; label: string }[], title = 'HPの推移',
): ChartImageLabelDefaults {
  return { title, xAxis: 'S3発動からの時間（秒）', yAxis: 'HP（%）', series }
}

type DisplaySeries = SurtrDurationSeries & { displayEnd: number; triggerHp: number | null }

function SeriesSwatch({ item, image = false }: { item: SurtrDurationSeries; image?: boolean }) {
  return <svg className={image ? 'chart-image-frame-legend-swatch' : 'surtr-duration-chart-swatch'}
    width="18" height="12" aria-hidden="true">
    <line x1="0" x2="18" y1="6" y2="6" stroke={item.color} strokeWidth="2" />
  </svg>
}

function ChartLegend({ series, image = false }: { series: SurtrDurationSeries[]; image?: boolean }) {
  const listClass = image ? 'chart-image-frame-legend-list' : 'surtr-duration-chart-legend'
  const itemClass = image ? 'chart-image-frame-legend-item' : undefined
  return <ul className={listClass} aria-label="比較線">
    {series.map((item) => <li className={itemClass} key={item.id}>
      <SeriesSwatch item={item} image={image} /><span>{item.label}</span>
    </li>)}
  </ul>
}

function SurtrDurationSvg({ series, title, range, selection, width, height, image = false, valueAxisLabel = 'HP（%）', onOverflow }: {
  series: DisplaySeries[]
  title: string
  range: SurtrDurationChartRange
  selection?: SurtrDurationChartProps['selection']
  image?: boolean
  valueAxisLabel?: string
  onOverflow?: (height: number) => void
  width: number; height: number
}) {
  const titleId = useId()
  const descriptionId = useId()
  const clipId = useId()
  const [titleMeasurement, setTitleMeasurement] = useState<{ label: string; widths: Record<string, number> } | null>(null)
  const left = 54
  const right = width - 20
  const eventKeyWidth = range === 'remnant' ? 75 : 155
  const axisTitleLines = image ? wrapText({ font: AXIS_TITLE_FONT,
    measureText: text => ({ width: Array.from(text).reduce((sum, character) => sum
      + ((titleMeasurement?.label === valueAxisLabel ? titleMeasurement.widths[character] : undefined)
      ?? (/^[\x00-\x7f]$/.test(character) ? 8 : 14)), 0) }),
  }, valueAxisLabel, Math.max(14, right - left - eventKeyWidth - 16)) : [valueAxisLabel]
  const titleOverflow = image ? Math.max(0, axisTitleLines.length - 1) * AXIS_TITLE_LINE_HEIGHT : 0
  const bottom = height - 32
  const largestTime = Math.max(1, ...series.map((item) => item.displayEnd))
  const tickStep = largestTime <= 50 ? 5 : largestTime <= 100 ? 10 : Math.ceil(largestTime / 50) * 10
  const maximumTime = Math.ceil(largestTime / tickStep) * tickStep
  const ticks = Array.from({ length: Math.round(maximumTime / tickStep) + 1 }, (_, index) => index * tickStep)
  const x = (time: number) => left + time / maximumTime * (right - left)
  const triggerEvents = range === 'remnant' ? series.flatMap((item, index) => item.remnantStart !== null
    && item.triggerHp !== null && item.remnantStart <= item.displayEnd
    ? [{ id: item.id, label: item.label, time: item.remnantStart, hp: item.triggerHp, color: item.color, radius: 4 + index * 2.5 }] : []) : []
  // Coincident circles share one time label; distinct nearby times keep separate labels.
  const triggerGroups = [...new Set(triggerEvents.map(item => `${item.time}:${item.hp}`))].map(key => {
    const events = triggerEvents.filter(item => `${item.time}:${item.hp}` === key)
    const event = events[0]
    const text = `${seconds.format(event.time)}秒`
    return { ...event, text, description: events.map(item => item.label).join('・'),
      color: new Set(events.map(item => item.color)).size === 1 ? event.color : '#555',
      radius: Math.max(...events.map(item => item.radius)),
      labelWidth: Array.from(text).reduce((sum, character) => sum + (character === '秒' ? 12 : 7), 8) }
  })
  const layoutTriggerLabels = (plotTop: number) => {
    const pointY = (hp: number) => bottom - hp / 100 * (bottom - plotTop)
    return placeGroupedBarValueLabels({ width: right - left, height: bottom - plotTop,
      labels: triggerGroups.map(item => ({ id: item.id, anchorX: x(item.time) - left,
        anchorY: pointY(item.hp) - plotTop - item.radius, width: item.labelWidth, height: 18, direction: 'above' })),
      obstacles: triggerEvents.map(item => ({ x: x(item.time) - left - item.radius,
        y: pointY(item.hp) - plotTop - item.radius, width: item.radius * 2, height: item.radius * 2 })), gap: 4 })
  }
  const labelOverflow = layoutTriggerLabels(48 + titleOverflow).extraTop
  const top = 48 + titleOverflow + labelOverflow
  const triggerLabels = layoutTriggerLabels(top).labels
  const y = (hp: number) => bottom - hp / 100 * (bottom - top)
  const summary = series.map((item) => range === 'remnant'
    ? `${item.label}：${item.triggerHp === null ? '計算範囲内に余燼未発動' : `余燼発動まで ${seconds.format(item.remnantStart!)} 秒`}`
    : `${item.label}：${item.triggerHp === null ? '計算範囲内に余燼未発動' : `余燼発動まで ${seconds.format(item.remnantStart!)} 秒、余燼中 ${seconds.format(item.remnantDuration)} 秒`}、${item.retreatTime === null || item.retreatTime > item.displayEnd ? '計算範囲内に退場せず' : `退場まで ${seconds.format(item.retreatTime)} 秒`}`).join('。')
  const selectedSeries = (series.find(item => item.id === selection?.seriesId) ?? series[0])
  const selectedTime = selection && series.length > 0 && Number.isFinite(selection.time)
    && selection.time >= 0 && selection.time <= selectedSeries.displayEnd ? selection.time : null
  const selectedHp = selectedTime !== null && range === 'remnant' && selectedTime === selectedSeries.remnantStart
    ? selectedSeries.triggerHp
    : selectedTime !== null && selection?.hpPercent !== null && selection?.hpPercent !== undefined
      && Number.isFinite(selection.hpPercent) && selection.hpPercent >= 0 && selection.hpPercent <= 100 ? selection.hpPercent : null
  const selectedSummary = selectedTime === null ? ''
    : `。選択時刻 ${seconds.format(selectedTime)} 秒${selectedHp === null ? '' : `、HP ${seconds.format(selectedHp)}%`}`
  const selectionLabel = selectedTime === null ? '' : `選択 ${seconds.format(selectedTime)} 秒`
  const selectionLabelWidth = selectedTime === null ? 0 : seconds.format(selectedTime).length * 6 + 48
  const selectionLabelX = selectedTime === null ? left : Math.max(left + selectionLabelWidth / 2,
    Math.min(right - selectionLabelWidth / 2, x(selectedTime)))

  useLayoutEffect(() => {
    if (!image) return
    let active = true
    const measure = () => {
      if (!active) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      context.font = AXIS_TITLE_FONT
      const widths = Object.fromEntries([...new Set(valueAxisLabel)].map(character =>
        [character, Math.ceil(context.measureText(character).width)]))
      setTitleMeasurement(current => current?.label === valueAxisLabel && JSON.stringify(current.widths) === JSON.stringify(widths)
        ? current : { label: valueAxisLabel, widths })
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure) }
  }, [image, valueAxisLabel])

  useLayoutEffect(() => { if (image) onOverflow?.(titleOverflow + labelOverflow) }, [image, onOverflow, titleOverflow, labelOverflow])

  return <svg className="surtr-duration-chart-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`} data-duration-range={range}>
    <title id={titleId}>{title}</title><desc id={descriptionId}>{summary ? summary + selectedSummary : '比較線を追加してください。'}</desc>
    {series.length === 0 ? <text className="surtr-duration-chart-empty" x={width / 2} y={height / 2} textAnchor="middle">
      比較線を追加してください
    </text> : <>
      <defs><clipPath id={clipId}><rect x={left - 2} y={top - 3} width={right - left + 4} height={bottom - top + 6} /></clipPath></defs>
      {ticks.map((tick) => <g key={tick}>
        <line className="surtr-duration-chart-grid" x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
        <text className="surtr-duration-chart-tick" x={x(tick)} y={bottom + 21} textAnchor="middle">{tick}</text>
      </g>)}
      <text className="surtr-duration-chart-axis-title" x={left} y="18">{axisTitleLines.length === 1 ? axisTitleLines[0]
        : axisTitleLines.map((line, index) => <tspan key={index} x={left} y={18 + index * AXIS_TITLE_LINE_HEIGHT}>{line}</tspan>)}</text>
      <g className="surtr-duration-chart-event-key" transform={`translate(${right - eventKeyWidth} 15)`} aria-hidden="true">
        <circle cx="4" cy="0" r="3.5" fill="#fff" stroke="#666" strokeWidth="1.5" />
        <text x="14" y="4">余燼発動</text>
        {range === 'retreat' && <><path d="M 91 -4 l 8 8 M 99 -4 l -8 8" fill="none" stroke="#666" strokeWidth="1.5" />
          <text x="106" y="4">退場</text></>}
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
      <g clipPath={`url(#${clipId})`}>{series.map((item) => <path key={item.id} className="surtr-duration-chart-line"
        d={item.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${x(point.time)} ${y(point.hpPercent)}`).join(' ')}
        stroke={item.color} />)}</g>
      {series.map((item, index) => {
        // Concentric markers preserve the true coordinates when several builds have the same event time.
        const radius = 4 + index * 2.5
        const triggerHp = item.triggerHp ?? 0
        const retreatHp = item.points.at(-1)?.hpPercent ?? 0
        return <g key={item.id} className="surtr-duration-chart-events" fill="none" stroke={item.color} strokeWidth="1.75">
          {item.remnantStart !== null && item.triggerHp !== null && item.remnantStart <= item.displayEnd && <circle cx={x(item.remnantStart)} cy={y(triggerHp)} r={radius}>
            <title>{`${item.label}・余燼発動 ${seconds.format(item.remnantStart)} 秒`}</title>
          </circle>}
          {range === 'retreat' && item.retreatTime !== null && item.retreatTime <= item.displayEnd && <path d={`M ${x(item.retreatTime) - radius} ${y(retreatHp) - radius} l ${radius * 2} ${radius * 2} M ${x(item.retreatTime) + radius} ${y(retreatHp) - radius} l ${-radius * 2} ${radius * 2}`}>
            <title>{`${item.label}・退場 ${seconds.format(item.retreatTime)} 秒`}</title>
          </path>}
        </g>
      })}
      {triggerLabels.map(label => {
        const event = triggerGroups.find(item => item.id === label.id)!
        const labelX = left + label.x + label.width / 2
        const labelY = top + label.y
        return <g key={label.id} className="surtr-duration-chart-trigger-label" data-series-id={label.id}>
          <path className="surtr-duration-chart-trigger-leader" fill="none" stroke={event.color}
            d={`M ${x(event.time)} ${y(event.hp) - event.radius} L ${labelX} ${labelY + label.height}`} />
          <text x={labelX} y={labelY + 13} textAnchor="middle" fill={event.color} paintOrder="stroke">
            <title>{`${event.description}・余燼発動 ${seconds.format(event.time)} 秒`}</title>{event.text}
          </text>
        </g>
      })}
      {selectedTime !== null && selectedHp !== null && <circle className="surtr-duration-chart-selection-point"
        cx={x(selectedTime)} cy={y(selectedHp)} r="4.5" fill={(series.find(item => item.id === selection?.seriesId) ?? series[0]).color} stroke="#fff" strokeWidth="2">
        <title>{`${seconds.format(selectedTime)} 秒・HP ${seconds.format(selectedHp)}%`}</title>
      </circle>}
    </>}
  </svg>
}

export function SurtrDurationChart({ series, title = 'HPの推移', selection, range = 'retreat' }: SurtrDurationChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  const data = useMemo(() => prepareSurtrDurationChartSeries(series, range), [series, range])
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
        <SurtrDurationSvg series={data} title={title} range={range} selection={selection} width={width} height={NATURAL_CHART_HEIGHT} />
      </div>
    </div>
    <p className="surtr-duration-chart-axis-caption">S3発動からの時間（秒）</p>
  </figure>
}

export function SurtrDurationChartImage({ series, title = 'HPの推移', range = 'retreat', conditions, labels,
  aspectRatio, onLayout }: SurtrDurationChartImageProps) {
  const data = useMemo(() => prepareSurtrDurationChartSeries(series, range), [series, range])
  const snapshotKey = JSON.stringify([data, title, range, conditions, labels, aspectRatio])
  const display = resolveChartImageLabels(getSurtrDurationImageLabelDefaults(data, title), labels)
  const displaySeries = applyChartImageSeriesLabels(data, labels)
  const [expansion, setExpansion] = useState({ snapshotKey, overflow: 0 })
  const overflow = expansion.snapshotKey === snapshotKey ? expansion.overflow : 0
  const reserveOverflow = useCallback((required: number) => {
    setExpansion(current => current.snapshotKey === snapshotKey && current.overflow >= required
      ? current : { snapshotKey, overflow: Math.max(current.snapshotKey === snapshotKey ? current.overflow : 0, required) })
  }, [snapshotKey])
  return <ChartImageFrame key={snapshotKey} className="surtr-duration-chart-image" title={display.title} conditions={conditions}
    legend={<ChartLegend series={displaySeries} image />} axisTitle={display.xAxis}
    naturalChartHeight={NATURAL_CHART_HEIGHT + overflow} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <SurtrDurationSvg series={displaySeries} title={display.title} range={range} width={width} height={height}
      valueAxisLabel={display.yAxis} onOverflow={reserveOverflow} image />}
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
