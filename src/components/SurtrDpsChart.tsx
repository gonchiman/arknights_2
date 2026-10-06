import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { applyChartImageSeriesLabels, resolveChartImageLabels,
  type ChartImageLabelDefaults, type ChartImageLabelOverrides } from '../lib/chartImageLabels'
import { getHpChartValueAxis, isValidHpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import { placeGroupedBarValueLabels } from '../lib/groupedBarValueLabels'
import { wrapText } from '../lib/slideComposer'
import type { SurtrDpsLineStyle } from '../lib/surtrDpsOutput'
import { getSurtrDpsResistanceRating, getSurtrDpsResistanceSamples, normalizeSurtrDpsResistanceRange,
  type SurtrDpsBarStep, type SurtrDpsResistanceRange } from '../lib/surtrDpsResistance'
import { ChartImageFrame } from './ChartImageFrame'
import { getStatRankBands } from '../lib/statRankBands'
import { StatRankStrip } from './StatRankStrip'
import './SurtrDpsChart.css'

export interface SurtrDpsChartSeries {
  id: string
  label: string
  color: string
  lineStyle?: SurtrDpsLineStyle
  points: { x: number; value: number | null }[]
}

export type SurtrDpsChartKind = 'bar' | 'line'
export type SurtrDpsChartMetric = 'total' | 'difference' | 'percent'
export interface SurtrDpsChartYAxis {
  mode: 'zero' | 'auto' | 'manual'
  min?: number
  max?: number
}

export interface SurtrDpsChartProps {
  series: SurtrDpsChartSeries[]
  kind?: SurtrDpsChartKind
  barStep?: SurtrDpsBarStep
  resistanceRange?: SurtrDpsResistanceRange
  gridStyle?: 'none' | 'dashed' | 'solid'
  precision?: number
  showValues?: boolean
  showLegend?: boolean
  showResistanceRanks?: boolean
  metric?: SurtrDpsChartMetric
  title?: string
  valueAxisLabel?: string
  yAxis?: SurtrDpsChartYAxis
  selectedResistance?: number | null
  onSelectResistance?: (value: number | null) => void
}

export interface SurtrDpsChartImageProps extends Omit<SurtrDpsChartProps, 'onSelectResistance'> {
  conditions: string
  labels?: ChartImageLabelOverrides
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}

const NATURAL_CHART_HEIGHT = 334
const RATING_TICK_LINE_HEIGHT = 14
const VALUE_LABEL_HEIGHT = 16
const VALUE_LABEL_FONT = '600 11px "Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'
const AXIS_TITLE_FONT = '700 12px "Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif'
const AXIS_TITLE_LINE_HEIGHT = 18
type ValueWidths = Record<string, number>
const DASH_PATTERNS = [undefined, '7 4', '2 3', '10 3 2 3', '4 3 1 3', '12 3 4 3'] as const
const LINE_STYLE_PATTERNS = { solid: undefined, dashed: '7 4', dotted: '2 3' } as const

function getLineDasharray(lineStyle: SurtrDpsLineStyle | undefined, index: number) {
  return lineStyle === undefined ? DASH_PATTERNS[index % DASH_PATTERNS.length] : LINE_STYLE_PATTERNS[lineStyle]
}

function getValueAxisLabel(valueAxisLabel: string | undefined, metric: SurtrDpsChartMetric) {
  return valueAxisLabel ?? (metric === 'percent' ? '増減率（%）' : metric === 'difference' ? 'DPS差分' : 'DPS')
}

export function getSurtrDpsImageLabelDefaults(series: readonly { id: string; label: string }[],
  title = 'スルト S3 DPS', metric: SurtrDpsChartMetric = 'total', valueAxisLabel?: string): ChartImageLabelDefaults {
  return { title, xAxis: '敵の術耐性', yAxis: getValueAxisLabel(valueAxisLabel, metric), series }
}

function useAxisTitleWidths(title: string): ValueWidths {
  const [widths, setWidths] = useState<ValueWidths>({})
  useLayoutEffect(() => {
    let active = true
    const measure = () => {
      if (!active) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      context.font = AXIS_TITLE_FONT
      // Rounded character widths keep wrapping conservative across font fallbacks.
      const next = Object.fromEntries([...new Set(title)].map(character => [character, Math.ceil(context.measureText(character).width)]))
      setWidths(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure) }
  }, [title])
  return widths
}

function normalizeSeries(series: SurtrDpsChartSeries[], kind: SurtrDpsChartKind, barStep: SurtrDpsBarStep,
  range: SurtrDpsResistanceRange, selectedResistance?: number | null): SurtrDpsChartSeries[] {
  const samples = new Set(getSurtrDpsResistanceSamples(barStep, range))
  return series.map((item) => ({ ...item, points: item.points.filter((point) => (
    Number.isFinite(point.x) && point.x >= range.min && point.x <= range.max
    && (kind !== 'bar' || samples.has(point.x) || point.x === selectedResistance)
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

function useValueWidths(series: SurtrDpsChartSeries[], precision: number, metric: SurtrDpsChartMetric, enabled: boolean): ValueWidths {
  const formatValue = createValueFormatter(precision, metric)
  const textKey = JSON.stringify(enabled ? [...new Set(series.flatMap((item) => item.points.flatMap((point) => (
    point.value === null ? [] : [formatValue(point.value)]
  ))))] : [])
  const [widths, setWidths] = useState<ValueWidths>({})
  useLayoutEffect(() => {
    let active = true
    const labels = JSON.parse(textKey) as string[]
    const measure = () => {
      if (!active) return
      const context = document.createElement('canvas').getContext('2d')
      if (!context) return
      context.font = VALUE_LABEL_FONT
      const next = Object.fromEntries(labels.map((text) => [text, Math.ceil(context.measureText(text).width)]))
      setWidths((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', measure) }
  }, [textKey])
  return widths
}

function getPlot(series: SurtrDpsChartSeries[], width: number, height: number, kind: SurtrDpsChartKind,
  { precision = 0, metric = 'total', valueAxisLabel, yAxis, barStep = 20, resistanceRange, showValues = false, showResistanceRanks = true, valueWidths = {}, axisTitleWidths = {} }: Pick<SurtrDpsChartProps,
    'precision' | 'metric' | 'valueAxisLabel' | 'yAxis' | 'barStep' | 'resistanceRange' | 'showValues' | 'showResistanceRanks'> & { valueWidths?: ValueWidths; axisTitleWidths?: ValueWidths } = {}) {
  const range = normalizeSurtrDpsResistanceRange(resistanceRange)
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
  const baseTop = 26
  const plotHeight = Math.max(1, height - 28 - baseTop)
  const xValues = [...new Set(series.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b)
  const rankBands = showResistanceRanks && xValues.length ? getStatRankBands({
    stat: 'magicResistance', chartKind: kind, min: range.min, max: range.max, barValues: xValues,
  }) : []
  const rankPointHeight = rankBands.some((band) => band.pointValue !== undefined) ? 12 : 0
  const rankHeaderHeight = rankBands.length ? 28 + rankPointHeight : 0
  const axisTitleLines = wrapText({ font: AXIS_TITLE_FONT,
    measureText: text => ({ width: [...text].reduce((sum, character) => sum + (axisTitleWidths[character] ?? 14), 0) }),
  }, getValueAxisLabel(valueAxisLabel, metric), Math.max(14, right - left - (rankBands.length ? 84 : 0)))
  const axisTitleExtraHeight = Math.max(0, axisTitleLines.length - 1) * AXIS_TITLE_LINE_HEIGHT
  const bandWidth = (right - left) / Math.max(1, xValues.length)
  const seriesCount = Math.max(1, series.length)
  const groupBudget = bandWidth * 0.74
  const barGap = Math.min(3, groupBudget / (seriesCount * 4))
  const barWidth = Math.min(32, (groupBudget - barGap * Math.max(0, series.length - 1)) / seriesCount)
  const groupWidth = series.length * barWidth + Math.max(0, series.length - 1) * barGap
  const x = (value: number) => kind === 'bar'
    ? left + (xValues.indexOf(value) + 0.5) * bandWidth
    : left + (value - range.min) / (range.max - range.min) * (right - left)
  const relativeY = (value: number) => plotHeight - (value - axis.lowerLimit) / (axis.upperLimit - axis.lowerLimit) * plotHeight
  const visibleY = (value: number) => Math.max(0, Math.min(plotHeight, relativeY(value)))
  const bars = kind === 'bar' ? series.flatMap((item, seriesIndex) => item.points.flatMap((point) => point.value === null ? [] : [{
    id: `${seriesIndex}:${point.x}`, value: point.value, text: formatValue(point.value),
    x: x(point.x) - left - groupWidth / 2 + seriesIndex * (barWidth + barGap),
    y: visibleY(point.value),
  }])) : []
  const placement = placeGroupedBarValueLabels({
    labels: showValues ? bars.map((bar) => ({
      id: bar.id, anchorX: bar.x + barWidth / 2, anchorY: bar.y,
      width: (valueWidths[bar.text] ?? bar.text.length * 7) + 2, height: VALUE_LABEL_HEIGHT,
      direction: bar.value < 0 ? 'below' as const : 'above' as const,
    })) : [],
    width: right - left, height: plotHeight, gap: 3,
    obstacles: bars.map((bar) => ({
      x: bar.x, y: Math.min(visibleY(0), bar.y) - (bar.value === 0 ? 1 : 0),
      width: barWidth, height: Math.max(2, Math.abs(visibleY(0) - bar.y)),
    })),
  })
  const extraTop = Math.ceil(placement.extraTop)
  const extraBottom = Math.ceil(placement.extraBottom)
  const top = baseTop + axisTitleExtraHeight + rankHeaderHeight + extraTop
  const bottom = top + plotHeight
  const ratingTicks = kind === 'bar' && barStep === 'ratings' && !showResistanceRanks
  const tickExtraHeight = ratingTicks ? RATING_TICK_LINE_HEIGHT : 0
  const tickHalfWidth = (value: number) => Math.max(String(value).length,
    ratingTicks ? getSurtrDpsResistanceRating(value)?.rating.length ?? 0 : 0) * 3.5
  const lineStep = [1, 2, 5, 10, 20, 50, 100].find(step => (range.max - range.min) / step <= 10) ?? 100
  const firstLineTick = Math.ceil(range.min / lineStep) * lineStep
  const lineTicks = Array.from({ length: Math.floor((range.max - firstLineTick) / lineStep) + 1 }, (_, index) => firstLineTick + index * lineStep)
    .filter(tick => tick > range.min && tick < range.max)
  const tickCandidates = kind === 'bar' ? xValues : [range.min, ...lineTicks, range.max]
  let previousTickRight = -Infinity
  const finalTick = tickCandidates[tickCandidates.length - 1]
  const finalTickLeft = finalTick === undefined ? 0 : x(finalTick) - tickHalfWidth(finalTick)
  const xTicks = tickCandidates.filter((tick, index) => {
    const halfWidth = tickHalfWidth(tick)
    const center = x(tick)
    if (index !== 0 && index !== tickCandidates.length - 1
      && (center - halfWidth < previousTickRight + 8 || center + halfWidth + 8 > finalTickLeft)) return false
    previousTickRight = center + halfWidth
    return true
  })
  return {
    left, right, top, bottom, ticks, bandWidth, barWidth, barGap, groupWidth, formatValue, formatTick,
    bars, placement, extraTop, extraBottom, ratingTicks, rankBands, rankTop: baseTop + axisTitleExtraHeight + rankPointHeight,
    axisTitleLines, height: height + axisTitleExtraHeight + rankHeaderHeight + extraTop + extraBottom + tickExtraHeight,
    minimum: axis.lowerLimit, maximum: axis.upperLimit,
    emptyMessage: xValues.length ? null : kind === 'bar' && barStep === 'ratings' ? '範囲内に代表値がありません' : '表示できるデータがありません',
    xTicks,
    x,
    y: (value: number) => top + relativeY(value),
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

function SeriesSwatch({ color, lineStyle, index, kind, image = false }: {
  color: string; lineStyle?: SurtrDpsLineStyle; index: number; kind: SurtrDpsChartKind; image?: boolean
}) {
  return <svg className={image ? 'chart-image-frame-legend-swatch' : 'surtr-dps-chart-swatch'}
    width="18" height="12" aria-hidden="true">
    {kind === 'bar' ? <rect x="4" y="1" width="10" height="10" fill={color} />
      : <line x1="0" x2="18" y1="6" y2="6" stroke={color} strokeWidth="2"
        strokeDasharray={getLineDasharray(lineStyle, index)} />}
  </svg>
}

function SurtrDpsSvg({ series, kind = 'line', width, height, activeX, gridStyle = 'solid', precision = 0,
  metric = 'total', title = 'スルト S3 DPS', valueAxisLabel, yAxis, barStep = 20, resistanceRange, showResistanceRanks = true, layout }: SurtrDpsChartProps & {
  width: number; height: number; activeX?: number | null; layout?: ReturnType<typeof getPlot>
}) {
  const clipId = `surtr-dps-clip-${useId().replace(/:/g, '')}`
  const plot = layout ?? getPlot(series, width, height, kind, { precision, metric, valueAxisLabel, yAxis, barStep, resistanceRange, showResistanceRanks })
  const svgHeight = Math.max(height, plot.height)
  const valueById = new Map(plot.bars.map((bar) => [bar.id, bar]))
  if (plot.emptyMessage) return <svg className="surtr-dps-chart-svg" width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`}
    role="img" aria-label={`${title}・${plot.emptyMessage}`}>
    <title>{title}</title>
    <text className="surtr-dps-chart-empty" x={width / 2} y={svgHeight / 2} textAnchor="middle">{plot.emptyMessage}</text>
  </svg>
  return <svg className="surtr-dps-chart-svg" width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`}
    data-resistance-ranks={plot.rankBands.length ? 'header' : 'none'}
    role="img" aria-label={`${title}・${kind === 'bar' ? '棒グラフ' : '折れ線グラフ'}`}>
    <title>{title}</title>
    {plot.rankBands.length > 0 && <desc>{`術耐性ランクは${kind === 'bar' ? '各棒のグループ' : '術耐性の数値範囲'}に対応。${plot.rankBands.map((band) => `${band.rating}: ${band.label}`).join('。')}`}</desc>}
    <defs><clipPath id={clipId}><rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} /></clipPath></defs>
    <text className="surtr-dps-chart-axis-title" x={plot.left} y="16">{plot.axisTitleLines.length === 1 ? plot.axisTitleLines[0]
      : plot.axisTitleLines.map((line, index) => <tspan key={index} x={plot.left} y={16 + index * AXIS_TITLE_LINE_HEIGHT}>{line}</tspan>)}</text>
    <StatRankStrip bands={plot.rankBands} left={plot.left} right={plot.right} top={plot.rankTop}
      title="術耐性ランク" titleY={16} />
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
    {plot.xTicks.map((tick) => {
      const rating = (plot.ratingTicks || showResistanceRanks) ? getSurtrDpsResistanceRating(tick) : null
      const tickY = plot.bottom + plot.extraBottom + 20
      return <g key={`x-${tick}`}>
      {rating && <title>{`${rating.rating}（${rating.label}）・術耐性 ${tick}`}</title>}
      {kind === 'line' && <line className="surtr-dps-chart-grid surtr-dps-chart-grid-vertical" x1={plot.x(tick)} x2={plot.x(tick)}
        y1={plot.top} y2={plot.bottom} />}
      <text className="surtr-dps-chart-tick" x={plot.x(tick)} y={tickY} textAnchor="middle">
        {plot.ratingTicks && rating ? <><tspan className="surtr-dps-chart-rating" x={plot.x(tick)}>{rating.rating}</tspan>
          <tspan x={plot.x(tick)} dy={RATING_TICK_LINE_HEIGHT}>{tick}</tspan></> : tick}
      </text>
    </g>})}
    <path className="surtr-dps-chart-axis" data-chart-image-plot-area="" d={`M ${plot.left} ${plot.top} V ${plot.bottom} H ${plot.right}`} />
    <g clipPath={`url(#${clipId})`}>
    {plot.minimum < 0 && plot.maximum >= 0 && <line className="surtr-dps-chart-zero"
      x1={plot.left} x2={plot.right} y1={plot.y(0)} y2={plot.y(0)} />}
    {series.map((item, index) => kind === 'bar'
      ? <g key={item.id}>{item.points.map((point) => point.value === null ? null : <rect key={point.x} className="surtr-dps-chart-bar" data-chart-image-ink=""
        x={plot.x(point.x) - plot.groupWidth / 2 + index * (plot.barWidth + plot.barGap)} y={Math.min(plot.y(point.value), plot.y(0))}
        width={plot.barWidth} height={Math.abs(plot.y(0) - plot.y(point.value))} fill={item.color} />)}</g>
      : <path key={item.id} className="surtr-dps-chart-line" data-chart-image-ink=""
        d={buildLinePath(item.points, plot)}
        stroke={item.color} strokeDasharray={getLineDasharray(item.lineStyle, index)} />)}
    {kind === 'line' && activeX !== undefined && activeX !== null && <g className="surtr-dps-chart-cursor">
      <line x1={plot.x(activeX)} x2={plot.x(activeX)} y1={plot.top} y2={plot.bottom} />
      {series.map((item) => {
        const point = item.points.find((entry) => entry.x === activeX)
        return point?.value !== null && point?.value !== undefined ? <circle key={item.id} cx={plot.x(activeX)} cy={plot.y(point.value)} r="4"
          fill="#fff" stroke={item.color} strokeWidth="2" /> : null
      })}
    </g>}
    </g>
    <g transform={`translate(${plot.left} ${plot.top})`} aria-hidden="true">
      {plot.placement.labels.filter((label) => label.shifted).map((label) => {
        const bar = valueById.get(label.id)!
        return <line className="surtr-dps-chart-value-connector" data-chart-image-ink="" key={label.id}
          x1={label.anchorX} y1={label.anchorY + (bar.value < 0 ? 2 : -2)}
          x2={label.x + label.width / 2} y2={bar.value < 0 ? label.y : label.y + label.height} />
      })}
      {plot.placement.labels.map((label) => <g className="surtr-dps-chart-value" key={label.id} data-bar-id={label.id}>
        <rect className="surtr-dps-chart-value-background" x={label.x} y={label.y} width={label.width} height={label.height} />
        <text className="surtr-dps-chart-value-label" data-chart-image-ink="" x={label.x + label.width / 2} y={label.y + 12} textAnchor="middle">
          {valueById.get(label.id)!.text}
        </text>
      </g>)}
    </g>
  </svg>
}

export function SurtrDpsChart({ series, kind = 'line', barStep = 20, resistanceRange, gridStyle = 'solid', precision = 0,
  metric = 'total', title = 'スルト S3 DPS', valueAxisLabel, yAxis, showValues = false, showLegend = true, showResistanceRanks = true, selectedResistance, onSelectResistance }: SurtrDpsChartProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(720)
  const [hoveredX, setHoveredX] = useState<number | null>(null)
  const [localSelection, setLocalSelection] = useState<number | null>(null)
  const selection = selectedResistance === undefined ? localSelection : selectedResistance
  const helpId = useId()
  const range = useMemo(() => normalizeSurtrDpsResistanceRange(resistanceRange), [resistanceRange?.min, resistanceRange?.max])
  const data = useMemo(() => normalizeSeries(series, kind, barStep, range, selection), [series, kind, barStep, range, selection])
  const valueWidths = useValueWidths(data, precision, metric, kind === 'bar' && showValues)
  const axisTitleWidths = useAxisTitleWidths(getValueAxisLabel(valueAxisLabel, metric))
  const xValues = useMemo(() => [...new Set(data.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b), [data])
  const height = availableWidth < 520 ? 290 : NATURAL_CHART_HEIGHT
  const plotOptions = { precision, metric, valueAxisLabel, yAxis, barStep, resistanceRange: range, showValues, showResistanceRanks, valueWidths, axisTitleWidths }
  const basePlot = getPlot(data, availableWidth, height, kind, plotOptions)
  const maximumValueWidth = showValues ? Math.max(0, ...basePlot.bars.map((bar) => (valueWidths[bar.text] ?? bar.text.length * 7) + 2)) : 0
  const minimumBarWidth = basePlot.left + 18 + Math.max(maximumValueWidth,
    xValues.length * Math.max(48, data.length * 16 + Math.max(0, data.length - 1) * 3 + 24))
  const width = kind === 'bar' ? Math.max(availableWidth, minimumBarWidth) : availableWidth
  const plot = width === availableWidth ? basePlot : getPlot(data, width, height, kind, plotOptions)
  const selectedX = selection !== null && xValues.includes(selection) ? selection : null
  const activeX = hoveredX !== null && xValues.includes(hoveredX) ? hoveredX : selectedX
  const selectedPoints = data.map((item, index) => ({ item, index, point: item.points.find((point) => point.x === activeX) }))
  const accessibleX = activeX ?? xValues[0] ?? range.min
  const resistanceLabel = (value: number) => {
    const rating = (plot.ratingTicks || showResistanceRanks) ? getSurtrDpsResistanceRating(value) : null
    return `術耐性 ${value}${rating ? `・${rating.rating}（${rating.label}）` : ''}`
  }
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
    {showLegend && <figcaption>
      <ul className="surtr-dps-chart-legend" aria-label="比較する系列">
        {data.map((item, index) => <li key={item.id}>
          <SeriesSwatch color={item.color} lineStyle={item.lineStyle} index={index} kind={kind} /><span>{item.label}</span>
        </li>)}
      </ul>
    </figcaption>}
    <div ref={viewportRef} className="surtr-dps-chart-viewport">
      <div ref={scrollRef} className="surtr-dps-chart-scroll">
        <div className="surtr-dps-chart-frame" style={{ width }} role="slider" tabIndex={xValues.length ? 0 : -1}
          aria-label={`${title}・敵の術耐性`} aria-describedby={helpId} aria-valuemin={range.min} aria-valuemax={range.max}
          aria-disabled={xValues.length === 0 || undefined}
          aria-valuenow={accessibleX} aria-valuetext={`${resistanceLabel(accessibleX)}、${accessibleValue}`}
          onPointerMove={selectPointer} onPointerDown={selectPointer}
          onPointerLeave={() => setHoveredX(null)}
          onClick={(event) => {
            const value = pointerResistance(event.clientX, event.currentTarget)
            selectResistance(value === selectedX ? null : value)
          }}
          onFocus={() => { if (xValues.length) setHoveredX(activeX ?? xValues[0]) }}
          onBlur={() => setHoveredX(null)} onKeyDown={selectKeyboard}>
          <SurtrDpsSvg series={data} kind={kind} barStep={barStep} width={width} height={height} activeX={activeX}
            showResistanceRanks={showResistanceRanks}
            resistanceRange={range} gridStyle={gridStyle} precision={precision} metric={metric} title={title} valueAxisLabel={valueAxisLabel} yAxis={yAxis} layout={plot} />
        </div>
      </div>
      {activeX !== null && <div className={`surtr-dps-chart-tooltip${activeX > (range.min + range.max) / 2 ? ' is-left' : ''}`} aria-hidden="true">
        <strong>{resistanceLabel(activeX)}</strong>
        <dl>{selectedPoints.map(({ item, index, point }) => <div key={item.id}>
          <dt><SeriesSwatch color={item.color} lineStyle={item.lineStyle} index={index} kind={kind} /><span>{item.label}</span></dt>
          <dd>{plot.formatValue(point?.value)}</dd>
        </div>)}</dl>
      </div>}
    </div>
    <p className="surtr-dps-chart-axis-caption">敵の術耐性</p>
    <span id={helpId} className="surtr-dps-chart-sr-only">左右の矢印キーで術耐性を選択、Escapeキーで選択を解除できます。</span>
  </figure>
}

export function SurtrDpsChartImage({ series, kind = 'line', barStep = 20, resistanceRange, gridStyle = 'solid', precision = 0,
  metric = 'total', title = 'スルト S3 DPS', valueAxisLabel, labels, yAxis, showValues = false, showResistanceRanks = true, selectedResistance, conditions, aspectRatio, onLayout }: SurtrDpsChartImageProps) {
  const display = useMemo(() => resolveChartImageLabels(getSurtrDpsImageLabelDefaults(series, title, metric, valueAxisLabel), labels),
    [series, title, metric, valueAxisLabel, labels])
  const displaySeries = useMemo(() => applyChartImageSeriesLabels(series, labels), [series, labels])
  const range = useMemo(() => normalizeSurtrDpsResistanceRange(resistanceRange), [resistanceRange?.min, resistanceRange?.max])
  const data = useMemo(() => normalizeSeries(displaySeries, kind, barStep, range, selectedResistance), [displaySeries, kind, barStep, range, selectedResistance])
  const valueWidths = useValueWidths(data, precision, metric, kind === 'bar' && showValues)
  const request = JSON.stringify([data, kind, barStep, range, gridStyle, precision, metric, title, valueAxisLabel, labels, yAxis, showValues, showResistanceRanks, conditions, aspectRatio, valueWidths])
  const [expansion, setExpansion] = useState({ request, overflow: 0 })
  const overflow = expansion.request === request ? expansion.overflow : 0
  const reserveOverflow = useCallback((required: number) => {
    // A wider aspect-ratio frame may need less label space. Keep expansion
    // monotonic for this snapshot so its dimensions cannot oscillate.
    setExpansion((current) => current.request === request && current.overflow >= required
      ? current : { request, overflow: Math.max(current.request === request ? current.overflow : 0, required) })
  }, [request])
  return <ChartImageFrame key={request} className="surtr-dps-chart-image" title={display.title} conditions={conditions}
    axisTitle={display.xAxis} naturalChartHeight={NATURAL_CHART_HEIGHT + overflow} aspectRatio={aspectRatio} onLayout={onLayout}
    legend={<SurtrDpsImageLegend series={data} kind={kind} />}>
    {({ width, height }) => <SurtrDpsImagePlot series={data} kind={kind} barStep={barStep} width={width} height={height}
      resistanceRange={range} gridStyle={gridStyle} precision={precision} metric={metric} title={display.title} valueAxisLabel={display.yAxis} yAxis={yAxis}
      showValues={showValues} showResistanceRanks={showResistanceRanks} valueWidths={valueWidths} reservedOverflow={overflow} onOverflow={reserveOverflow} />}
  </ChartImageFrame>
}

/** Reuse the export legend in a composed image without adding another image frame. */
export function SurtrDpsImageLegend({ series, kind = 'line' }: Pick<SurtrDpsChartProps, 'series' | 'kind'>) {
  return <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
    {series.map((item, index) => <li className="chart-image-frame-legend-item" key={item.id}>
      <SeriesSwatch color={item.color} lineStyle={item.lineStyle} index={index} kind={kind} image /><span>{item.label}</span>
    </li>)}
  </ul>
}

const ignoreOverflow = () => undefined

/** Plot-only export for ChartImageStackFrame; preserves the single-chart sampling and value-label layout. */
export function SurtrDpsSnapshotPlot({ series, kind = 'line', barStep = 20, resistanceRange, precision = 0, metric = 'total',
  showValues = false, selectedResistance, width, height, reservedOverflow = 0, onOverflow = ignoreOverflow, ...props
}: Omit<SurtrDpsChartProps, 'onSelectResistance'> & {
  width: number; height: number; reservedOverflow?: number; onOverflow?: (height: number) => void
}) {
  const range = useMemo(() => normalizeSurtrDpsResistanceRange(resistanceRange), [resistanceRange?.min, resistanceRange?.max])
  const data = useMemo(() => normalizeSeries(series, kind, barStep, range, selectedResistance), [series, kind, barStep, range, selectedResistance])
  const valueWidths = useValueWidths(data, precision, metric, kind === 'bar' && showValues)
  return <SurtrDpsImagePlot {...props} series={data} kind={kind} barStep={barStep} resistanceRange={range}
    precision={precision} metric={metric} showValues={showValues} width={width} height={height}
    valueWidths={valueWidths} reservedOverflow={reservedOverflow} onOverflow={onOverflow} />
}

function SurtrDpsImagePlot({ width, height, reservedOverflow, onOverflow, valueWidths, ...props }: SurtrDpsChartProps & {
  width: number; height: number; reservedOverflow: number; valueWidths: ValueWidths; onOverflow: (height: number) => void
}) {
  const baseHeight = Math.max(NATURAL_CHART_HEIGHT, height - reservedOverflow)
  const axisTitleWidths = useAxisTitleWidths(getValueAxisLabel(props.valueAxisLabel, props.metric ?? 'total'))
  const plot = getPlot(props.series, width, baseHeight, props.kind ?? 'line', { ...props, valueWidths, axisTitleWidths })
  const overflow = plot.height - baseHeight
  useLayoutEffect(() => { onOverflow(overflow) }, [onOverflow, overflow])
  return <SurtrDpsSvg {...props} width={width} height={height} layout={plot} />
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
