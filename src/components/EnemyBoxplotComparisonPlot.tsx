import { useId } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import {
  getEnemyBoxplotDisplaySeries,
  type EnemyBoxplotComparison,
  type EnemyBoxplotRange,
  type EnemyBoxplotScale,
  type EnemyBoxplotStatistics,
} from '../lib/enemyBoxplotComparison'
import { ChartStripCell } from './ChartStripCell'
import './EnemyRatingComparisonPlot.css'
import './EnemyBoxplotComparisonPlot.css'

type DisplaySeries = ReturnType<typeof getEnemyBoxplotDisplaySeries>[number]

interface ValueAxis {
  minimum: number
  maximum: number
  ticks: number[]
}

interface PlotProps {
  data: EnemyBoxplotComparison
  scale: EnemyBoxplotScale
  range: EnemyBoxplotRange
  width: number
  height?: number
  imageMode?: boolean
  unit?: string
  showOutlierInfo?: boolean
}

const INK = { 'data-chart-image-ink': 'true' }
const formatValue = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const formatCount = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const SUMMARY_FIELDS = [
  { key: 'minimum', label: '最小' },
  { key: 'firstQuartile', label: 'Q1' },
  { key: 'median', label: '中央値' },
  { key: 'thirdQuartile', label: 'Q3' },
  { key: 'maximum', label: '最大' },
] as const

export function getEnemyBoxplotComparisonPlotHeight(scale: EnemyBoxplotScale): number {
  return scale === 'RAW' ? 392 : 394
}

export function EnemyBoxplotComparisonLegend({ imageMode = false }: { imageMode?: boolean }) {
  const items = [
    { key: 'box', label: '箱 中央50%' },
    { key: 'median', label: '中央値' },
    { key: 'whisker', label: 'ひげ 1.5IQR' },
    { key: 'outlier', label: 'ひげ外' },
  ] as const
  return <ul className={`chart-image-frame-legend-list enemy-boxplot-legend${imageMode ? ' is-image' : ''}`} aria-label="箱ひげ図の凡例">
    {items.map(({ key, label }) => <li className="chart-image-frame-legend-item" key={key}>
      <svg width="18" height="12" className="chart-image-frame-legend-swatch" aria-hidden="true">
        {key === 'box' && <rect {...INK} x="2" y="2" width="14" height="8" fill="currentColor" fillOpacity="0.14" stroke="currentColor" />}
        {key === 'median' && <line {...INK} x1="9" x2="9" y1="1" y2="11" stroke="currentColor" strokeWidth="2.5" />}
        {key === 'whisker' && <g {...INK} stroke="currentColor" strokeWidth="1.5">
          <line x1="1" x2="17" y1="6" y2="6" /><line x1="1" x2="1" y1="2" y2="10" /><line x1="17" x2="17" y1="2" y2="10" />
        </g>}
        {key === 'outlier' && <circle {...INK} cx="9" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />}
      </svg>
      <span>{label}</span>
    </li>)}
  </ul>
}

function makeAxis(series: readonly DisplaySeries[], range: EnemyBoxplotRange, normalized: boolean): ValueAxis {
  const bounds = series.flatMap(({ statistics }) => statistics ? [
    range === 'ALL' ? statistics.minimum : statistics.lowerWhisker,
    range === 'ALL' ? statistics.maximum : statistics.upperWhisker,
  ] : [])
  const minimum = Math.min(0, ...bounds)
  const observedMaximum = Math.max(0, ...bounds)
  const axis = createZeroBasedValueAxis(observedMaximum - minimum, normalized ? 0 : 1)
  return { minimum, maximum: minimum + axis.maximum, ticks: axis.ticks.map(value => minimum + value) }
}

/** A read-only comparison; the controls deliberately live outside the drawing. */
export function EnemyBoxplotComparisonPlot({ data, scale, range, width, height, imageMode = false, unit = '体', showOutlierInfo = true }: PlotProps) {
  const titleId = useId()
  const descriptionId = useId()
  const series = getEnemyBoxplotDisplaySeries(data, scale)
  const naturalHeight = getEnemyBoxplotComparisonPlotHeight(scale)
  const plotHeight = Math.max(naturalHeight, height ?? naturalHeight)
  const plotWidth = Math.max(320, Number.isFinite(width) ? width : 320)
  const left = 66
  const right = plotWidth - 16
  const sharedAxis = makeAxis(series, range, scale === 'MEDIAN')
  const extraHeight = plotHeight - naturalHeight
  const description = series.map((item, index) => `${item.label}、${
    item.unavailable === 'median-zero' ? '中央値0のため換算不可' : item.unavailable === 'no-data' ? 'データなし'
      : SUMMARY_FIELDS.map(({ key, label }) => `${label} ${formatValue.format(item.statistics![key])}`).join('、')
  }、有効 ${formatCount.format(item.validCount)}${unit}、値なし ${formatCount.format(item.missingCount)}${unit}${showOutlierInfo
    ? `、${formatOutlierInformation(data.series[index].statistics?.outlierCount ?? null, item.validCount, unit)}` : ''}`).join('。')

  return <svg className={`enemy-boxplot-comparison-plot${imageMode ? ' is-image' : ''}`}
    width="100%" height={plotHeight} viewBox={`0 0 ${plotWidth} ${plotHeight}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>防御力・術耐性の箱ひげ図</title>
    <desc id={descriptionId}>{description}</desc>
    {scale === 'RAW' ? series.map((item, index) => {
      const top = index * (200 + extraHeight / 2)
      const axis = makeAxis([item], range, false)
      return <g key={item.key} className={`enemy-rating-comparison-series ${item.key}`}>
        <text {...INK} x="8" y={top + 16} className="enemy-boxplot-series-label">{item.label}</text>
        <SeriesStatus series={item} unit={unit} range={range} x={left} y={top + 34}
          outlierCount={data.series[index].statistics?.outlierCount ?? null} showOutlierInfo={showOutlierInfo} />
        <Axis axis={axis} left={left} right={right} top={top + 60} bottom={top + 110} />
        <Box series={item} axis={axis} left={left} right={right} y={top + 85} range={range} />
        <SummaryBand statistics={item.statistics} left={left} right={right} top={top + 144} />
      </g>
    }) : <>
      <Axis axis={sharedAxis} left={left} right={right} top={20} bottom={144 + extraHeight / 2} />
      {series.map((item, index) => <g key={item.key} className={`enemy-rating-comparison-series ${item.key}`}>
        <text {...INK} x={left - 8} y={54 + index * (60 + extraHeight / 2)}
          textAnchor="end" className="enemy-boxplot-series-label">{item.label}</text>
        <Box series={item} axis={sharedAxis} left={left} right={right}
          y={50 + index * (60 + extraHeight / 2)} range={range} />
        <text {...INK} x={left - 8} y={240 + index * 92 + extraHeight}
          textAnchor="end" className="enemy-boxplot-series-label">{item.label}</text>
        <SummaryBand statistics={item.statistics} left={left} right={right} top={212 + index * 92 + extraHeight} />
        <SeriesStatus series={item} range={range} unit={unit} x={left} y={270 + index * 92 + extraHeight}
          outlierCount={data.series[index].statistics?.outlierCount ?? null} showOutlierInfo={showOutlierInfo} />
      </g>)}
      <text {...INK} x={(left + right) / 2} y={188 + extraHeight / 2}
        textAnchor="middle" className="enemy-boxplot-axis-title">中央値に対する倍率</text>
    </>}
  </svg>
}

function Axis({ axis, left, right, top, bottom }: {
  axis: ValueAxis; left: number; right: number; top: number; bottom: number
}) {
  return <g className="enemy-boxplot-axis">
    {axis.ticks.map((value, index) => {
      const x = left + (right - left) * (value - axis.minimum) / (axis.maximum - axis.minimum)
      return <g key={value}>
        <line x1={x} x2={x} y1={top} y2={bottom} className="enemy-rating-comparison-gridline" />
        <text {...INK} x={x} y={bottom + 20} textAnchor={index === 0 ? 'start' : index === axis.ticks.length - 1 ? 'end' : 'middle'}
          className="enemy-rating-comparison-tick">{formatValue.format(value)}</text>
      </g>
    })}
    <line x1={left} x2={right} y1={bottom} y2={bottom} className="enemy-rating-comparison-baseline" />
  </g>
}

function Box({ series, axis, left, right, y, range }: {
  series: DisplaySeries; axis: ValueAxis; left: number; right: number; y: number; range: EnemyBoxplotRange
}) {
  const { statistics } = series
  if (!statistics) return <text {...INK} x={(left + right) / 2} y={y + 4} textAnchor="middle"
    className="enemy-boxplot-status">{series.unavailable === 'median-zero' ? '換算不可（中央値0）' : 'データなし'}</text>
  const x = (value: number) => left + (right - left) * (value - axis.minimum) / (axis.maximum - axis.minimum)
  return <g className="enemy-boxplot-marks" {...INK}>
    <line x1={x(statistics.lowerWhisker)} x2={x(statistics.upperWhisker)} y1={y} y2={y} stroke="currentColor" strokeWidth="1.5" />
    {[statistics.lowerWhisker, statistics.upperWhisker].map((value, index) =>
      <line key={index} x1={x(value)} x2={x(value)} y1={y - 8} y2={y + 8} stroke="currentColor" strokeWidth="1.5" />)}
    <rect x={x(statistics.firstQuartile)} y={y - 14}
      width={Math.max(0, x(statistics.thirdQuartile) - x(statistics.firstQuartile))} height="28"
      fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.5" />
    <line x1={x(statistics.median)} x2={x(statistics.median)} y1={y - 14} y2={y + 14} stroke="currentColor" strokeWidth="2.5" />
    {range === 'ALL' && statistics.outliers.map(({ value }) => <circle key={value}
      cx={x(value)} cy={y} r="2.5" className="enemy-boxplot-outlier" stroke="currentColor" strokeWidth="1.2" />)}
  </g>
}

function SummaryBand({ statistics, left, right, top }: {
  statistics: EnemyBoxplotStatistics | null; left: number; right: number; top: number
}) {
  const step = (right - left) / SUMMARY_FIELDS.length
  return <g className="enemy-boxplot-summary">
    {SUMMARY_FIELDS.map(({ key, label }, index) => <g key={key}>
      <ChartStripCell left={left + step * index} width={step} top={top} height={42}
        leftInset={index ? 1.5 : 0} rightInset={index === SUMMARY_FIELDS.length - 1 ? 0 : 1.5}
        label={label} labelY={top + 14} labelClassName="chart-strip-title" />
      <text {...INK} x={left + step * (index + 0.5)} y={top + 34} textAnchor="middle"
        className="chart-strip-label">{statistics ? formatValue.format(statistics[key]) : '—'}</text>
    </g>)}
  </g>
}

function formatOutlierInformation(count: number | null, validCount: number, unit: string): string {
  const percentage = count === null ? null : formatHistogramPercentage(count, validCount)
  return percentage === null ? '外れ値 —' : `外れ値 ${formatCount.format(count!)}${unit}（${percentage}）`
}

function SeriesStatus({ series, range, unit, x, y, outlierCount, showOutlierInfo }: {
  series: DisplaySeries; range: EnemyBoxplotRange; unit: string; x: number; y: number
  outlierCount: number | null; showOutlierInfo: boolean
}) {
  const pointsHidden = range === 'WHISKERS' && outlierCount !== null && outlierCount > 0
  const outlierLabel = showOutlierInfo
    ? `${formatOutlierInformation(outlierCount, series.validCount, unit)}${pointsHidden ? ' · 点は非表示' : ''}`
    : pointsHidden ? `ひげ外 ${formatCount.format(outlierCount)}${unit} 非表示` : null
  return <g className="enemy-boxplot-status">
    <text {...INK} x={x} y={y}>{`有効 ${formatCount.format(series.validCount)}${unit} · 値なし ${formatCount.format(series.missingCount)}${unit}`}</text>
    {outlierLabel && <text {...INK} x={x} y={y + 16}>{outlierLabel}</text>}
  </g>
}
