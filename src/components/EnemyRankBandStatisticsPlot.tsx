import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { EnemyRankBandMetric, EnemyRankBandStatistics } from '../lib/enemyRankBandStatistics'
import { ENEMY_RANK_BAND_METRIC_LABELS, formatRankBandStatistic } from '../lib/enemyRankBandStatisticsDisplay'
import './EnemyRatingComparisonPlot.css'
import './EnemyRankBandStatisticsPlot.css'

const SERIES = [
  { key: 'defense', label: '防御力', colorClass: 'defense' },
  { key: 'resistance', label: '術耐性', colorClass: 'magicResistance' },
] as const
const MINIMUM_WIDTH = 560
const ROW_HEIGHT = 26
const PANEL_CHROME_HEIGHT = 80
const PANEL_GAP = 24
const INK = { 'data-chart-image-ink': 'true' }

export function getEnemyRankBandStatisticsPlotHeight(bandCount: number): number {
  return 2 * (PANEL_CHROME_HEIGHT + Math.max(1, bandCount) * ROW_HEIGHT) + PANEL_GAP
}

/** The two statistics retain independent axes; all controls live outside the drawing. */
export function EnemyRankBandStatisticsPlot({ bands, metric, width, height, imageMode = false }: {
  bands: readonly EnemyRankBandStatistics[]
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

  const plotWidth = Math.max(MINIMUM_WIDTH, width ?? availableWidth)
  const naturalHeight = getEnemyRankBandStatisticsPlotHeight(bands.length)
  const plotHeight = Math.max(naturalHeight, height ?? naturalHeight)
  const panelHeight = (plotHeight - PANEL_GAP) / 2
  const metricLabel = ENEMY_RANK_BAND_METRIC_LABELS[metric]
  const description = SERIES.map(({ key, label }) => `${label}：${bands.map(band =>
    `上位${band.from}〜${band.to}% ${formatRankBandStatistic(band[key][metric])}`).join('、')}`).join('。')

  const drawing = <svg className={`enemy-rank-band-statistics-plot${imageMode ? ' is-image' : ''}`}
    width={plotWidth} height={plotHeight} viewBox={`0 0 ${plotWidth} ${plotHeight}`}
    role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>順位帯ごとの防御力・術耐性の{metricLabel}</title>
    <desc id={descriptionId}>{description}。防御力と術耐性は別々の数値軸です。</desc>
    {SERIES.map(({ key, label, colorClass }, seriesIndex) => {
      const values = bands.map(band => band[key][metric])
      const axis = createZeroBasedValueAxis(Math.max(0, ...values), 0)
      const lastTick = axis.ticks.length - 1
      const ticks = axis.ticks.length <= 5 ? axis.ticks
        : axis.ticks.filter((_, index) => index === 0 || index === lastTick || index === Math.floor(lastTick / 2))
      const valueSpace = Math.max(64, ...values.map(value => formatRankBandStatistic(value).length * 7 + 14))
      const left = 88
      const right = plotWidth - valueSpace - 12
      const top = seriesIndex * (panelHeight + PANEL_GAP)
      const rowStep = (panelHeight - PANEL_CHROME_HEIGHT) / Math.max(1, bands.length)
      const rowsTop = top + 40
      const bottom = rowsTop + rowStep * Math.max(1, bands.length)
      const valueX = (value: number) => left + (right - left) * value / axis.maximum
      const axisLabel = metric === 'variance' ? `分散（${label}²）` : metricLabel
      return <g key={key} className={`enemy-rating-comparison-series ${colorClass}`}>
        <text {...INK} x="8" y={top + 15} className="enemy-rank-band-series-label">{label}</text>
        <text {...INK} x="8" y={top + 33} className="enemy-rank-band-axis-label">ステータス順位帯</text>
        {ticks.map(tick => <g key={tick}>
          <line x1={valueX(tick)} x2={valueX(tick)} y1={rowsTop} y2={bottom}
            className={tick === 0 ? 'enemy-rating-comparison-baseline' : 'enemy-rating-comparison-gridline'} />
          <text {...INK} x={valueX(tick)} y={bottom + 18}
            textAnchor={tick === 0 ? 'start' : tick === axis.maximum ? 'end' : 'middle'}
            className="enemy-rank-band-tick">{formatRankBandStatistic(tick)}</text>
        </g>)}
        {bands.map((band, rowIndex) => {
          const value = band[key][metric]
          const y = rowsTop + rowStep * (rowIndex + 0.5)
          const barHeight = Math.min(18, rowStep * 0.65)
          return <g key={band.from}>
            <text {...INK} x={left - 10} y={y + 4} textAnchor="end" className="enemy-rank-band-label">
              {band.from}〜{band.to}%
            </text>
            <rect {...INK} x={left} y={y - barHeight / 2} width={Math.max(0, valueX(value) - left)}
              height={barHeight} fill="currentColor" />
            <text {...INK} x={valueX(value) + 8} y={y + 4} className="enemy-rank-band-value">
              {formatRankBandStatistic(value)}
            </text>
          </g>
        })}
        {bands.length === 0 && <text {...INK} x={(left + right) / 2} y={rowsTop + rowStep / 2}
          textAnchor="middle" className="enemy-rank-band-label">データなし</text>}
        <text {...INK} x={(left + right) / 2} y={bottom + 38} textAnchor="middle"
          className="enemy-rank-band-axis-title">{axisLabel}</text>
      </g>
    })}
  </svg>

  return imageMode ? drawing : <div className="enemy-rank-band-statistics-scroll" ref={scrollRef}
    role="region" tabIndex={0} aria-label={`順位帯ごとの${metricLabel}グラフ`}>{drawing}</div>
}
