import { useId, useLayoutEffect, useRef, useState } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import type { EnemyRankBandMetric, EnemyStandardizedRankBandStatistics } from '../lib/enemyRankBandStatistics'
import { ENEMY_RANK_BAND_METRIC_LABELS, formatRankBandStatistic } from '../lib/enemyRankBandStatisticsDisplay'
import { ChartStripCell } from './ChartStripCell'
import './EnemyRatingComparisonPlot.css'
import './EnemyRankBandStatisticsPlot.css'

const SERIES = [
  { key: 'defense', label: '防御力', colorClass: 'defense' },
  { key: 'resistance', label: '術耐性', colorClass: 'magicResistance' },
] as const
const MINIMUM_WIDTH = 720
const ROW_HEIGHT = 32
const CHROME_HEIGHT = 96
const RANK_COLUMN_WIDTH = 122
const COLUMN_GAP = 8
const OUTER_PADDING = 8
const MINIMUM_TRACK_WIDTH = 160
const INK = { 'data-chart-image-ink': 'true' }

export function getEnemyRankBandStatisticsPlotHeight(bandCount: number): number {
  return CHROME_HEIGHT + Math.max(1, bandCount) * ROW_HEIGHT
}

function metricValue(band: EnemyStandardizedRankBandStatistics, key: typeof SERIES[number]['key'], metric: EnemyRankBandMetric): number | null {
  const value = band[key]?.[metric]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatValue(value: number | null): string {
  return value === null ? '—' : formatRankBandStatistic(value)
}

/** Both standardized series share one value domain; controls live outside the drawing. */
export function EnemyRankBandStatisticsPlot({ bands, metric, width, height, imageMode = false }: {
  bands: readonly EnemyStandardizedRankBandStatistics[]
  metric: EnemyRankBandMetric
  width?: number
  height?: number
  imageMode?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(MINIMUM_WIDTH)
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || width !== undefined) return
    const measure = () => {
      const next = Math.max(MINIMUM_WIDTH, Math.floor(element.clientWidth))
      setAvailableWidth(previous => previous === next ? previous : next)
    }
    measure()
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    })
    observer.observe(element)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame) }
  }, [width])

  const allValues = bands.flatMap(band => SERIES.map(({ key }) => metricValue(band, key, metric)))
  const finiteValues = allValues.filter((value): value is number => value !== null)
  const allLabels = allValues.map(formatValue)
  const axis = getHpChartValueAxis(finiteValues, { mode: 'zero' })
  const span = axis.upperLimit - axis.lowerLimit
  // Both outer columns use the widest label so neither long variances nor small
  // nonzero values are shortened, and the two drawing areas stay equally wide.
  const valueColumnWidth = Math.max(76, ...allLabels.map(label => Math.ceil(label.length * 7.2) + 18))
  const minimumWidth = 2 * (OUTER_PADDING + valueColumnWidth + MINIMUM_TRACK_WIDTH) + RANK_COLUMN_WIDTH + 4 * COLUMN_GAP
  const plotWidth = Math.max(MINIMUM_WIDTH, minimumWidth, width !== undefined && Number.isFinite(width) ? width : availableWidth)
  const naturalHeight = getEnemyRankBandStatisticsPlotHeight(bands.length)
  const plotHeight = Math.max(naturalHeight, height !== undefined && Number.isFinite(height) ? height : naturalHeight)
  const metricLabel = ENEMY_RANK_BAND_METRIC_LABELS[metric]
  const columnLabel = metric === 'width' ? '幅' : metricLabel
  const middle = plotWidth / 2
  const top = 58
  const bottom = plotHeight - 38
  const rowStep = (bottom - top) / Math.max(1, bands.length)
  const trackWidth = (plotWidth - 2 * OUTER_PADDING - 2 * valueColumnWidth - RANK_COLUMN_WIDTH - 4 * COLUMN_GAP) / 2
  const largestTickLabel = Math.max(...axis.yTicks.map(tick => formatRankBandStatistic(tick).length * 7))
  const tickGap = largestTickLabel + 14
  const ticks = axis.yTicks.length <= 5 && trackWidth / Math.max(1, axis.yTicks.length - 1) >= tickGap
    ? axis.yTicks : [...new Set([axis.lowerLimit, 0, axis.upperLimit])].filter(tick => tick === 0
      || Math.abs(tick) / span * trackWidth >= (formatRankBandStatistic(tick).length + 1) * 3.5 + 12)
  const description = SERIES.map(({ key, label }) => `${label}：${bands.map(band =>
    `上位${band.from}〜${band.to}% ${formatValue(metricValue(band, key, metric))}`).join('、')}`).join('。')

  const drawing = <svg className={`enemy-rank-band-statistics-plot${imageMode ? ' is-image' : ''}`}
    width={plotWidth} height={plotHeight} viewBox={`0 0 ${plotWidth} ${plotHeight}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>順位帯ごとの防御力・術耐性の{metricLabel}（標準化）</title>
    <desc id={descriptionId}>{description}。中央はステータス順位帯、左が防御力、右が術耐性です。標準化した値を左右共通の数値軸で表示しています。</desc>
    <text {...INK} x={middle} y="18" textAnchor="middle" className="enemy-rank-band-axis-label">
      <tspan x={middle}>ステータス</tspan><tspan x={middle} dy="13">順位帯</tspan>
    </text>
    {SERIES.map(({ key, label, colorClass }, seriesIndex) => {
      const direction = seriesIndex === 0 ? -1 : 1
      const origin = middle + direction * (RANK_COLUMN_WIDTH / 2 + COLUMN_GAP)
      const edge = origin + direction * trackWidth
      const valueLeft = seriesIndex === 0 ? OUTER_PADDING : plotWidth - OUTER_PADDING - valueColumnWidth
      const valueCenter = valueLeft + valueColumnWidth / 2
      const trackCenter = (origin + edge) / 2
      const valueX = (value: number) => origin + direction * trackWidth
        * Math.max(0, Math.min(1, (value - axis.lowerLimit) / span))
      const zeroX = valueX(0)
      return <g key={key} className={`enemy-rating-comparison-series ${colorClass}`}
        data-rank-band-domain-min={axis.lowerLimit} data-rank-band-domain-max={axis.upperLimit}
        data-rank-band-zero-x={zeroX}>
        <text {...INK} x={trackCenter} y="20" textAnchor="middle" className="enemy-rank-band-series-label">{label}</text>
        <text {...INK} x={valueCenter} y="20" textAnchor="middle" className="enemy-rank-band-axis-label">{columnLabel}</text>
        {ticks.map(tick => <g key={tick}>
          <line x1={valueX(tick)} x2={valueX(tick)} y1={top} y2={bottom}
            className={tick === 0 ? 'enemy-rating-comparison-baseline' : 'enemy-rating-comparison-gridline'} />
          <text {...INK} x={valueX(tick)} y="48"
            textAnchor={tick === axis.lowerLimit ? direction === -1 ? 'end' : 'start'
              : tick === axis.upperLimit ? direction === -1 ? 'start' : 'end' : 'middle'}
            className="enemy-rank-band-tick">{formatRankBandStatistic(tick)}</text>
        </g>)}
        {bands.map((band, rowIndex) => {
          const value = metricValue(band, key, metric)
          const y = top + rowStep * (rowIndex + 0.5)
          const endpoint = value === null ? zeroX : valueX(value)
          const barHeight = Math.min(26, rowStep * 0.62)
          return <g key={band.from}>
            {value !== null && <rect {...INK} className="enemy-rank-band-statistics-bar" data-rank-band-series={key}
              data-rank-band-from={band.from} data-rank-band-to={band.to} data-rank-band-statistic={value}
              x={Math.min(zeroX, endpoint)} y={y - barHeight / 2}
              width={Math.abs(endpoint - zeroX)} height={barHeight} fill="currentColor" />}
            <ChartStripCell left={valueLeft} width={valueColumnWidth} top={top + rowIndex * rowStep + 2}
              height={Math.max(0, rowStep - 4)} labelY={y + 4} label={formatValue(value)}
              labelClassName="chart-strip-label enemy-rank-band-value"
              fillAttributes={{ 'data-rank-band-strip': 'value', 'data-rank-band-series': key, 'data-rank-band-from': band.from }}
              labelAttributes={{ 'data-rank-band-value': key, 'data-rank-band-from': band.from }} />
          </g>
        })}
        {bands.length === 0 && <text {...INK} x={trackCenter} y={top + rowStep / 2}
          textAnchor="middle" className="enemy-rank-band-label">データなし</text>}
        <text {...INK} x={trackCenter} y={bottom + 17} textAnchor="middle" className="enemy-rank-band-axis-title">
          <tspan x={trackCenter}>{metricLabel}</tspan><tspan x={trackCenter} dy="15">（標準化）</tspan>
        </text>
      </g>
    })}
    {bands.map((band, rowIndex) => <ChartStripCell key={band.from} left={middle - RANK_COLUMN_WIDTH / 2}
      width={RANK_COLUMN_WIDTH} top={top + rowIndex * rowStep + 2} height={Math.max(0, rowStep - 4)}
      labelY={top + (rowIndex + 0.5) * rowStep + 4} label={`上位${band.from}〜${band.to}%`}
      labelClassName="chart-strip-label enemy-rank-band-label"
      fillAttributes={{ 'data-rank-band-strip': 'rank', 'data-rank-band-from': band.from }}
      labelAttributes={{ 'data-rank-band-rank': band.from }} />)}
  </svg>

  return imageMode ? drawing : <div className="enemy-rank-band-statistics-scroll" ref={scrollRef}
    role="region" tabIndex={0} aria-label={`順位帯ごとの${metricLabel}グラフ`}>{drawing}</div>
}
