import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  buildSurtrRemnantCountEndpoints, buildSurtrRemnantCountIntervals,
  getSurtrRemnantAttackChartHeight,
  type SurtrRemnantChartKind, type SurtrRemnantChartSeries, type SurtrRemnantCountInterval,
} from '../lib/surtrRemnantChart'
import { buildSurtrRemnantCtSamples, calculateSurtrRemnantAttacks, type SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import { wrapText } from '../lib/slideComposer'
import { SurtrRemnantStepPlot } from './SurtrRemnantStepPlot'
import './SurtrRemnantAttackChart.css'

export interface SurtrRemnantAttackChartProps {
  series: readonly SurtrRemnantChartSeries[]
  assumptions: SurtrRemnantAttackAssumptions
  samples: readonly number[]
  kind: SurtrRemnantChartKind
  selectedCt?: number
  onSelectCt?: (ct: number) => void
  showValues?: boolean
  showBoundaries?: boolean
  ctLimit?: number
  width?: number
  height?: number
  image?: boolean
  title?: string
  valueAxisLabel?: string
  onOverflow?: (height: number) => void
}

const AXIS_LABEL_LINE_HEIGHT = 16
const SERIES_LABEL_LINE_HEIGHT = 14
const CHART_FONT = '"Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'
const CT_EPSILON = 1e-9
const ctFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const formatCt = (ct: number) => ctFormatter.format(ct)
const exactCtFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 12 })
const formatBoundaryCt = (ct: number) => `${Math.abs(ct - Number(ct.toFixed(3))) > Number.EPSILON * Math.max(1, Math.abs(ct)) * 2 ? '≈' : ''}${formatCt(ct)}`
const countLabel = (count: number | null) => count === null ? '—（範囲外）' : `${count} 回`
const chartLabels: Record<SurtrRemnantChartKind, string> = {
  'grouped-bar': '集合棒グラフ', step: '階段グラフ', bands: '回数の区間帯',
}

function nearestCt(values: readonly number[], value: number): number {
  return values.reduce((closest, ct) => Math.abs(ct - value) < Math.abs(closest - value) ? ct : closest, values[0] ?? 0)
}

function intervalLabel(interval: SurtrRemnantCountInterval): string {
  return `${exactCtFormatter.format(interval.from)} s${interval.includeFrom ? '以上' : 'より大きい'}・${exactCtFormatter.format(interval.to)} s${interval.includeTo ? '以下' : '未満'}：${interval.count} 回`
}

/** Filter axis labels by their displayed width, preserving both endpoints. */
function spacedTicks(values: readonly number[], x: (value: number) => number, gap = 12): number[] {
  if (values.length < 2) return [...values]
  const last = values.at(-1)!
  const lastLeft = x(last) - formatCt(last).length * 3.5
  let previousRight = -Infinity
  return values.filter((value, index) => {
    const half = formatCt(value).length * 3.5
    const position = x(value)
    if (index > 0 && index < values.length - 1 && (position - half < previousRight + gap || position + half + gap > lastLeft)) return false
    previousRight = position + half
    return true
  })
}

function axisTicks(maximum: number, width: number): number[] {
  const target = maximum / (width < 400 ? 3 : 5)
  const scale = 10 ** Math.floor(Math.log10(target))
  const step = ([1, 2, 2.5, 5, 10].find(value => value * scale >= target) ?? 10) * scale
  const values = Array.from({ length: Math.ceil(maximum / step) }, (_, index) => index * step)
    .filter(value => value < maximum - CT_EPSILON)
  return [...values, maximum]
}

interface ImageTextLayout {
  left: number
  axisLines: string[]
  seriesLines: Record<string, string[]>
}

function imageTextLayout(width: number, kind: SurtrRemnantChartKind, axisLabel: string | undefined,
  series: readonly { id: string; label: string }[], context?: CanvasRenderingContext2D | null): ImageTextLayout {
  const textContext = (size: number, bold = false) => {
    if (context) {
      context.font = `${bold ? '700 ' : ''}${size}px ${CHART_FONT}`
      return context
    }
    return { font: `${bold ? '700 ' : ''}${size}px ${CHART_FONT}`,
      measureText: (text: string) => ({ width: Array.from(text).reduce((total, character) =>
      total + (/^[\x00-\x7f]$/.test(character) ? size * 0.65 : size), 0) }) }
  }
  const seriesContext = textContext(11)
  const defaultLeft = kind === 'bands' ? width < 480 ? 72 : 102 : 54
  const left = kind === 'bands' ? Math.max(defaultLeft, Math.min(252, width * 0.28,
    Math.max(0, ...series.map(item => seriesContext.measureText(item.label).width)) + 20)) : defaultLeft
  const seriesLines = Object.fromEntries(series.map(item => [item.id,
    kind === 'bands' ? wrapText(seriesContext, item.label, left - 20)
      : kind === 'step' ? wrapText(textContext(11, true), item.label, Math.max(1, width - left - 46)) : [item.label]]))
  const axisLines = axisLabel === undefined ? [] : wrapText(textContext(12, true), axisLabel, Math.max(1, width - left - 18))
  return { left, axisLines, seriesLines }
}

/** CT-specific SVG; the surrounding page owns the legend, conditions and detail dialog. */
export function SurtrRemnantAttackChart({ series, assumptions, samples, kind, selectedCt, onSelectCt,
  showValues = true, showBoundaries = false, ctLimit, width: suppliedWidth, height, image = false,
  title = '余燼中の命中回数', valueAxisLabel, onOverflow,
}: SurtrRemnantAttackChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  const [hoveredCt, setHoveredCt] = useState<number | null>(null)
  const [localSelection, setLocalSelection] = useState<number | null>(null)
  const [textMeasurement, setTextMeasurement] = useState<{ request: string; layout: ImageTextLayout } | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const helpId = useId()
  const uniqueId = useId().replace(/:/g, '')
  const hatchId = `surtr-remnant-hatch-${uniqueId}`
  const data = useMemo(() => series.map(item => ({ item,
    intervals: buildSurtrRemnantCountIntervals(item.model, assumptions),
    endpoints: buildSurtrRemnantCountEndpoints(item.model, assumptions),
  })).filter(entry => entry.intervals.length > 0), [series, assumptions])
  const maximumCt = Number.isFinite(ctLimit) && ctLimit! > 0 ? ctLimit!
    : Math.max(0, ...data.map(({ item }) => item.model.attackIntervalBefore), ...samples.filter(ct => Number.isFinite(ct) && ct >= 0))
  const ctDomain = maximumCt || 1
  const values = useMemo(() => [...new Set(samples.filter(ct => Number.isFinite(ct) && ct >= 0 && ct <= ctDomain + CT_EPSILON))]
    .sort((a, b) => a - b), [samples, ctDomain])
  const navigationValues = useMemo(() => kind === 'grouped-bar' ? values : buildSurtrRemnantCtSamples(ctDomain, 0.01), [kind, values, ctDomain])
  const viewportWidth = Number.isFinite(suppliedWidth) && suppliedWidth! > 0 ? suppliedWidth! : availableWidth
  const barGroupMinimum = Math.max(48, data.length * 16 + Math.max(0, data.length - 1) * 3 + 14)
  const width = !image && kind === 'grouped-bar' ? Math.max(viewportWidth, 72 + values.length * barGroupMinimum) : viewportWidth
  const naturalChartHeight = getSurtrRemnantAttackChartHeight(kind, data.length)
  const compact = width < 480
  const axisLabel = valueAxisLabel ?? (kind === 'bands' ? undefined : '命中回数（回）')
  const textRequest = JSON.stringify([image, width, kind, axisLabel, data.map(({ item }) => [item.id, item.label])])
  const estimatedTextLayout = useMemo(() => image || kind === 'bands'
    ? imageTextLayout(width, kind, axisLabel, data.map(({ item }) => item)) : null, [textRequest])
  const textLayout = textMeasurement?.request === textRequest ? textMeasurement.layout : estimatedTextLayout
  const axisLines = textLayout?.axisLines ?? (axisLabel === undefined ? [] : [axisLabel])
  const axisOverflow = image ? Math.max(0, axisLines.length - 1) * AXIS_LABEL_LINE_HEIGHT : 0
  const left = textLayout?.left ?? (kind === 'bands' ? compact ? 72 : 102 : 54)
  const right = Math.max(left + 1, width - 18)
  const baseTop = kind === 'bands' ? 42 : 32
  const top = baseTop + axisOverflow
  const seriesLineCount = Math.max(1, ...Object.values(textLayout?.seriesLines ?? {}).map(lines => lines.length))
  const bandOverflow = kind === 'bands'
    ? Math.max(0, (seriesLineCount * SERIES_LABEL_LINE_HEIGHT + 16) * data.length - (naturalChartHeight - baseTop - 32)) : 0
  const stepOverflow = image && kind === 'step'
    ? Object.values(textLayout?.seriesLines ?? {}).reduce((sum, lines) => sum + Math.max(0, lines.length - 1) * SERIES_LABEL_LINE_HEIGHT, 0) : 0
  const requiredOverflow = axisOverflow + bandOverflow + stepOverflow
  const chartHeight = Math.max(naturalChartHeight + requiredOverflow, height ?? 0)
  const bottom = chartHeight - 32
  const plotWidth = right - left
  const bandWidth = plotWidth / Math.max(1, values.length)
  const barGap = Math.min(3, bandWidth / Math.max(1, data.length) / 6)
  const barWidth = Math.max(0.5, Math.min(22, (bandWidth * 0.82 - barGap * Math.max(0, data.length - 1)) / Math.max(1, data.length)))
  const groupWidth = data.length * barWidth + Math.max(0, data.length - 1) * barGap
  const maximumCount = Math.max(0, ...data.flatMap(({ intervals, endpoints }) => [...intervals.map(interval => interval.count), ...endpoints.map(endpoint => endpoint.count)]))
  const maximumY = Math.max(2, Math.ceil((maximumCount + 1) / 2) * 2)
  const x = (ct: number) => kind === 'grouped-bar'
    ? left + (values.indexOf(ct) + 0.5) * bandWidth : left + ct / ctDomain * plotWidth
  const y = (count: number) => bottom - count / maximumY * (bottom - top)
  const rawSelection = selectedCt === undefined ? localSelection : selectedCt
  // A CT between sampled bars has no corresponding group. Do not highlight a different result.
  const selection = rawSelection !== null && rawSelection !== undefined && Number.isFinite(rawSelection)
    && rawSelection >= 0 && rawSelection <= ctDomain + CT_EPSILON
    ? kind === 'grouped-bar' ? values.find(ct => Math.abs(ct - rawSelection) <= CT_EPSILON) ?? null : Math.min(rawSelection, ctDomain) : null
  const validHover = hoveredCt !== null && hoveredCt >= 0 && hoveredCt <= ctDomain + CT_EPSILON
    && (kind !== 'grouped-bar' || values.some(ct => Math.abs(ct - hoveredCt) <= CT_EPSILON)) ? hoveredCt : null
  const activeCt = image ? null : validHover ?? selection
  const accessibleCt = activeCt ?? navigationValues[0] ?? 0
  const countsAt = (ct: number) => data.map(({ item }) => ({ item, result: calculateSurtrRemnantAttacks(item.model, ct, assumptions) }))
  const selectedResults = countsAt(accessibleCt)
  const accessibleValues = selectedResults.map(({ item, result }) => `${item.label} ${countLabel(result?.hitCount ?? null)}`).join('、')
  const hasData = data.length > 0 && (kind !== 'grouped-bar' || values.length > 0)

  useLayoutEffect(() => {
    if (!image) return
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return
    let cancelled = false
    const measure = () => {
      if (!cancelled) setTextMeasurement({ request: textRequest,
        layout: imageTextLayout(width, kind, axisLabel, data.map(({ item }) => item), context) })
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { cancelled = true; document.fonts.removeEventListener('loadingdone', measure) }
  }, [textRequest])

  useLayoutEffect(() => { if (image) onOverflow?.(requiredOverflow) }, [image, onOverflow, requiredOverflow])

  useLayoutEffect(() => {
    if (image || suppliedWidth !== undefined) return
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setAvailableWidth(Math.max(1, viewport.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [image, suppliedWidth])

  function revealCt(ct: number) {
    const scroll = scrollRef.current
    if (!scroll || kind !== 'grouped-bar') return
    const position = x(ct)
    if (position - bandWidth / 2 < scroll.scrollLeft || position + bandWidth / 2 > scroll.scrollLeft + scroll.clientWidth) {
      scroll.scrollLeft = Math.max(0, position - scroll.clientWidth / 2)
    }
  }

  useLayoutEffect(() => {
    if (selection !== null && !image) revealCt(selection)
  }, [selection, image, kind, width])

  function pointerCt(event: PointerEvent<HTMLDivElement>): number | null {
    if (!hasData) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = (event.clientX - bounds.left) / bounds.width * width
    if (kind === 'grouped-bar') {
      const index = Math.max(0, Math.min(values.length - 1, Math.floor((point - left) / bandWidth)))
      return values[index]
    }
    return Math.min(ctDomain, Math.round(Math.max(0, Math.min(ctDomain, (point - left) / plotWidth * ctDomain)) * 100) / 100)
  }

  function selectCt(ct: number) {
    if (selectedCt === undefined) setLocalSelection(ct)
    onSelectCt?.(ct)
    revealCt(ct)
  }

  function selectKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!navigationValues.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Enter' || event.key === ' ') { selectCt(accessibleCt); return }
    const closest = nearestCt(navigationValues, accessibleCt)
    const index = navigationValues.indexOf(closest)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? navigationValues.length - 1
      : index + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1)
    const ct = navigationValues[Math.max(0, Math.min(navigationValues.length - 1, next))]
    setHoveredCt(ct)
    selectCt(ct)
  }

  const xTicks = spacedTicks(kind === 'grouped-bar' ? values : axisTicks(ctDomain, plotWidth), x)
  const description = `${chartLabels[kind]}。命中まで ${formatCt(assumptions.windup)} 秒、残りCTは${assumptions.ctCarry === 'time' ? '時間を維持' : '割合を維持'}、退場と同時の命中は${assumptions.includeRetreatHit ? '含む' : '含まない'}。`
    + (image ? data.map(({ item, intervals }) => `${item.label}：${intervals.map(intervalLabel).join('、')}`).join('。')
      : `残りCT ${formatCt(accessibleCt)} 秒：${accessibleValues}。`)
  const svg = <svg className={`surtr-remnant-attack-chart-svg${image ? ' is-image' : ''}`} width={width} height={chartHeight}
    viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>{`${title}・${chartLabels[kind]}`}</title><desc id={descriptionId}>{description}</desc>
    {!hasData ? <text className="surtr-remnant-attack-chart-empty" x={width / 2} y={chartHeight / 2} textAnchor="middle">表示できるデータがありません</text> : <>
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6">
          <path className="surtr-remnant-attack-chart-hatch" d="M-1 1 L1 -1 M0 6 L6 0 M5 7 L7 5" />
        </pattern>
      </defs>
      {axisLines.length > 0 && <text className="surtr-remnant-attack-chart-axis-title" x={left} y="17">
        {axisLines.length === 1 ? axisLines[0] : axisLines.map((line, index) =>
          <tspan key={index} x={left} dy={index === 0 ? 0 : AXIS_LABEL_LINE_HEIGHT}>{line}</tspan>)}
      </text>}
      {kind === 'step' ? <SurtrRemnantStepPlot data={data} assumptions={assumptions} height={chartHeight}
        left={left} right={right} ctDomain={ctDomain} xTicks={xTicks} hatchId={hatchId}
        axisOverflow={axisOverflow} seriesLines={textLayout?.seriesLines}
        activeCt={activeCt} showBoundaries={showBoundaries} /> : <>
      {kind !== 'bands' && <>
        {Array.from({ length: maximumY / 2 + 1 }, (_, index) => index * 2).map(count => <g key={count}>
          <line className="surtr-remnant-attack-chart-grid" x1={left} x2={right} y1={y(count)} y2={y(count)} />
          <text className="surtr-remnant-attack-chart-tick" x={left - 10} y={y(count) + 4} textAnchor="end">{count}</text>
        </g>)}
      </>}
      {kind === 'grouped-bar' && <>
        {activeCt !== null && <rect className="surtr-remnant-attack-chart-active-band" x={x(activeCt) - bandWidth / 2} y={top} width={bandWidth} height={bottom - top} />}
        {values.map(ct => <g key={ct}>{data.map(({ item }, index) => {
          const result = calculateSurtrRemnantAttacks(item.model, ct, assumptions)
          const center = x(ct) - groupWidth / 2 + index * (barWidth + barGap) + barWidth / 2
          if (!result) return barWidth >= 11 ? <text key={item.id} className="surtr-remnant-attack-chart-empty" x={center} y={bottom - 7} textAnchor="middle">—</text> : null
          const textWidth = String(result.hitCount).length * 6 + 3
          return <g key={item.id}>
            <rect x={center - barWidth / 2} y={y(result.hitCount)} width={barWidth} height={bottom - y(result.hitCount)} fill={item.color} data-chart-image-ink="true">
              <title>{`${item.label}・残りCT ${formatCt(ct)} s・${result.hitCount} 回`}</title>
            </rect>
            {showValues && barWidth >= textWidth && <text className="surtr-remnant-attack-chart-value" x={center} y={y(result.hitCount) - 8} textAnchor="middle" data-chart-image-ink="true">{result.hitCount}</text>}
          </g>
        })}</g>)}
      </>}
      {kind === 'bands' && <>
        {xTicks.map(ct => <line key={ct} className="surtr-remnant-attack-chart-grid" x1={x(ct)} x2={x(ct)} y1={top} y2={bottom} />)}
        {data.map(({ item, intervals, endpoints }, index) => {
          const row = top + (index + 0.5) * (bottom - top) / data.length
          const rowHeight = Math.min(44, (bottom - top) / data.length * 0.55)
          const rowTop = row - rowHeight / 2
          const rowBottom = row + rowHeight / 2
          const labelLines = textLayout?.seriesLines[item.id] ?? [item.label]
          const boundaryLabels = spacedTicks(intervals.slice(1).map(interval => interval.from), x, 30)
          return <g key={item.id} data-band-series={item.id}>
            <text className="surtr-remnant-attack-chart-tick" x={left - 10}
              y={row + 4 - (labelLines.length - 1) * SERIES_LABEL_LINE_HEIGHT / 2} textAnchor="end">
              {labelLines.length === 1 ? labelLines[0] : labelLines.map((line, lineIndex) =>
                <tspan key={lineIndex} x={left - 10} dy={lineIndex === 0 ? 0 : SERIES_LABEL_LINE_HEIGHT}>{line}</tspan>)}
            </text>
            {intervals.map((interval, intervalIndex) => {
              const intervalWidth = x(interval.to) - x(interval.from)
              const textWidth = String(interval.count).length * 7 + 15
              return <g key={interval.from}>
                <rect x={x(interval.from)} y={rowTop} width={intervalWidth} height={rowHeight} fill={item.color} fillOpacity={intervalIndex % 2 === 0 ? 0.28 : 0.14} data-chart-image-ink="true">
                  <title>{`${item.label}・${intervalLabel(interval)}`}</title>
                </rect>
                {intervalIndex > 0 && <line className="surtr-remnant-attack-chart-separator" x1={x(interval.from)} x2={x(interval.from)} y1={rowTop} y2={rowBottom} />}
                {showValues && intervalWidth > textWidth && <text className="surtr-remnant-attack-chart-value" x={(x(interval.from) + x(interval.to)) / 2} y={row + 4} textAnchor="middle" data-chart-image-ink="true">{interval.count}回</text>}
                {showBoundaries && intervalIndex > 0 && boundaryLabels.includes(interval.from) && <text className="surtr-remnant-attack-chart-tick" x={Math.max(left + 21, Math.min(right - 24, x(interval.from)))} y={rowBottom + 17} textAnchor="middle" data-chart-image-ink="true">{formatBoundaryCt(interval.from)}</text>}
              </g>
            })}
            {endpoints.map(({ ct, count }) => {
              const adjacent = ct === 0 ? intervals[0].count : intervals.at(-1)!.count
              if (count === adjacent) return null
              const anchor = ct === 0 ? 'start' : 'end'
              return <g key={ct}>
                <circle cx={x(ct)} cy={rowTop} r="3" fill={item.color} data-chart-image-ink="true"><title>{`${item.label}・CT ${formatCt(ct)} sちょうど・${count} 回`}</title></circle>
                <text className="surtr-remnant-attack-chart-tick" x={x(ct) + (ct === 0 ? 4 : -4)} y={rowTop - 9} textAnchor={anchor} data-chart-image-ink="true">{formatCt(ct)} s：{count}回</text>
              </g>
            })}
            {item.model.attackIntervalBefore < ctDomain && <g>
              <rect x={x(item.model.attackIntervalBefore)} y={rowTop} width={right - x(item.model.attackIntervalBefore)} height={rowHeight} fill={`url(#${hatchId})`} />
              <text className="surtr-remnant-attack-chart-empty" x={(right + x(item.model.attackIntervalBefore)) / 2} y={row + 4} textAnchor="middle">{right - x(item.model.attackIntervalBefore) > 45 ? '範囲外' : '—'}</text>
            </g>}
          </g>
        })}
      </>}
      <path className="surtr-remnant-attack-chart-axis" d={kind === 'bands' ? `M${left} ${bottom} H${right}` : `M${left} ${top} V${bottom} H${right}`} />
      {xTicks.map((ct, index) => <text key={ct} className="surtr-remnant-attack-chart-tick" x={x(ct)} y={bottom + 21}
        textAnchor={kind !== 'grouped-bar' && index === xTicks.length - 1 ? 'end' : 'middle'}>{formatCt(ct)}</text>)}
      {kind !== 'grouped-bar' && activeCt !== null && <g aria-hidden="true">
        <line className="surtr-remnant-attack-chart-guide" x1={x(activeCt)} x2={x(activeCt)} y1={top} y2={bottom} />
      </g>}
      </>}
    </>}
  </svg>

  if (image) return svg
  return <div className="surtr-remnant-attack-chart">
    <div className="surtr-remnant-attack-chart-viewport" ref={viewportRef}>
      <div className="surtr-remnant-attack-chart-scroll" ref={scrollRef}>
        <div className="surtr-remnant-attack-chart-frame" style={{ width }} role="slider" tabIndex={hasData ? 0 : -1}
          aria-label={`余燼中の命中回数・${chartLabels[kind]}・発動直前の残りCT`} aria-describedby={helpId}
          aria-valuemin={0} aria-valuemax={kind === 'grouped-bar' ? values.at(-1) ?? 0 : ctDomain}
          aria-valuenow={accessibleCt} aria-valuetext={`残りCT ${formatCt(accessibleCt)} 秒、${accessibleValues}`}
          aria-disabled={!hasData || undefined}
          onPointerMove={event => setHoveredCt(pointerCt(event))}
          onPointerDown={event => { const ct = pointerCt(event); if (ct !== null) { setHoveredCt(ct); selectCt(ct) } }}
          onPointerLeave={() => setHoveredCt(null)} onFocus={() => setHoveredCt(selection ?? navigationValues[0] ?? null)}
          onBlur={() => setHoveredCt(null)} onKeyDown={selectKeyboard}>
          {svg}
        </div>
      </div>
      {validHover !== null && hasData && <div className={`surtr-remnant-attack-chart-tooltip${validHover > ctDomain / 2 ? ' is-left' : ''}`} aria-hidden="true">
        <strong>残りCT {formatCt(validHover)} s</strong>
        <dl>{countsAt(validHover).map(({ item, result }) => <div key={item.id}>
          <dt><i style={{ backgroundColor: item.color }} /><span>{item.label}</span></dt><dd>{countLabel(result?.hitCount ?? null)}</dd>
        </div>)}</dl>
      </div>}
    </div>
    <p className="surtr-remnant-attack-chart-axis-caption">発動直前の残りCT（s）</p>
    <span id={helpId} className="surtr-remnant-attack-chart-sr-only">左右の矢印キーで残りCTを選択できます。Homeキーで最初、Endキーで最後のCTを選択します。</span>
  </div>
}
