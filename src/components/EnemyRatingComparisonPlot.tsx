import { useId } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import {
  ENEMY_RATING_COMPARISON_LAYOUTS,
  ENEMY_RATING_COMPARISON_METRICS,
  type EnemyRatingComparison,
  type EnemyRatingComparisonLayout,
  type EnemyRatingComparisonMetric,
  type EnemyRatingComparisonSideValue,
} from '../lib/enemyRatingComparison'
import { formatHistogramPercentage } from '../lib/histogramPercentageLabels'
import { ChartStripCell } from './ChartStripCell'
import './EnemyRatingComparisonPlot.css'

type RatingRows = EnemyRatingComparison['rows']
type ValueAxis = ReturnType<typeof createZeroBasedValueAxis>

const BAR_AXIS_TITLE = '評価別割合（%）'
const CUMULATIVE_AXIS_TITLE = '累積割合（%）'
const RANK_SHARE_TITLE = '階級割合（%）'
const RATING_AXIS_TITLE = 'ゲーム内評価'
const DASH = '5 3'
const INK = { 'data-chart-image-ink': 'true' }

function seriesClass(metric: EnemyRatingComparisonMetric) {
  return `enemy-rating-comparison-series ${metric}`
}

export function EnemyRatingComparisonSwatch({ metric, layout, imageMode = false }: {
  metric: EnemyRatingComparisonMetric
  layout: EnemyRatingComparisonLayout
  imageMode?: boolean
}) {
  return <svg className={`enemy-rating-comparison-swatch ${seriesClass(metric)}${imageMode ? ' is-image chart-image-frame-legend-swatch' : ''}`}
    width="18" height="12" aria-hidden="true">
    {layout === 'CUMULATIVE'
      ? <line x1="0" x2="18" y1="6" y2="6" stroke="currentColor" strokeWidth="2"
        strokeDasharray={metric === 'magicResistance' ? DASH : undefined} />
      : <rect x="5" y="2" width="8" height="8" fill="currentColor" />}
  </svg>
}

function stripValue(share: number | null) {
  if (share === null) return '—'
  return formatHistogramPercentage(share, 1)?.replace(/%$/, '').replace(/\.0$/, '') ?? '—'
}

interface PlotProps {
  data: EnemyRatingComparison
  layout: EnemyRatingComparisonLayout
  selectedRanks?: readonly string[]
  width: number
  height: number
  imageMode?: boolean
  sideValue?: EnemyRatingComparisonSideValue
}

export function EnemyRatingComparisonPlot({
  data, layout, selectedRanks, width, height, imageMode = false, sideValue = 'cumulative',
}: PlotProps) {
  const titleId = useId()
  const descriptionId = useId()
  const { rows } = data
  const showRankShare = layout === 'MIRRORED' && sideValue === 'rank'
  const selection = new Set(selectedRanks)
  const layoutLabel = ENEMY_RATING_COMPARISON_LAYOUTS.find(({ key }) => key === layout)?.label
  const axis = createZeroBasedValueAxis(Math.max(0, ...rows.flatMap((row) =>
    ENEMY_RATING_COMPARISON_METRICS.map(({ key }) => 100 * (row.stats[key].share ?? 0)))))
  const description = imageMode ? '' : rows
    .filter(({ rank }) => selection.has(rank))
    .flatMap(({ rank, stats }) => ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }) => {
      const stat = stats[key]
      const proportion = showRankShare ? stat.share : stat.cumulativeShare
      const share = proportion === null ? 'データなし' : `${(100 * proportion).toFixed(3)}%`
      return showRankShare
        ? `${label}、${stat.range}、${rank}の階級割合 ${share}`
        : `${label}、${stat.cumulativeRange}、${rank}までの累積割合 ${share}`
    })).join('。')

  return <svg className={`enemy-rating-comparison-plot${imageMode ? ' is-image' : ''}`}
    width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
    role="img" aria-labelledby={description ? `${titleId} ${descriptionId}` : titleId}>
    <title id={titleId}>{`防御力・術耐性の評価別分布（${layoutLabel}）`}</title>
    {description && <desc id={descriptionId}>{description}</desc>}
    {layout === 'MIRRORED'
      ? <MirroredPlot rows={rows} selection={selection} width={width} height={height}
        axis={axis} imageMode={imageMode} showRankShare={showRankShare} />
      : <VerticalPlot rows={rows} selection={selection} width={width} height={height}
        axis={axis} cumulative={layout === 'CUMULATIVE'} imageMode={imageMode} />}
  </svg>
}

interface PlotBodyProps {
  rows: RatingRows
  selection: ReadonlySet<string>
  width: number
  height: number
  axis: ValueAxis
  imageMode: boolean
}

function VerticalPlot({ rows, selection, width, height, axis, imageMode, cumulative }: PlotBodyProps & { cumulative: boolean }) {
  const left = 58
  const right = width - 8
  const step = (right - left) / rows.length
  const center = (index: number) => left + step * (index + 0.5)
  const bandHeight = step < 29 ? 40 : 22
  const bandRotation = bandHeight === 40 ? -90 : 0
  const bandTop = 19
  const top = cumulative ? 14 : bandTop + (bandHeight + 2) * 2 + 10
  const bottom = height - (imageMode ? 24 : 45)
  const y = (amount: number) => bottom - amount / (cumulative ? 100 : axis.maximum) * (bottom - top)
  const ticks = cumulative ? [0, 25, 50, 75, 100] : axis.ticks

  return <>
    {rows.map(({ rank }, index) => selection.has(rank) && <rect key={rank} className="enemy-rating-comparison-highlight"
      x={left + index * step} y={cumulative ? top : bandTop}
      width={step} height={bottom + 22 - (cumulative ? top : bandTop)} />)}
    {!cumulative && <g>
      <text className="enemy-rating-comparison-label" x={right} y="13" textAnchor="end" {...INK}>{CUMULATIVE_AXIS_TITLE}</text>
      {ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }, seriesIndex) => {
        const y = bandTop + seriesIndex * (bandHeight + 2)
        return <g key={key}>
          <rect className={seriesClass(key)} x="3" y={y + bandHeight / 2 - 4} width="8" height="8" fill="currentColor" {...INK} />
          <text className="enemy-rating-comparison-label" x="15" y={y + bandHeight / 2 + 4} {...INK}>{label}</text>
          {rows.map((row, index) => <ChartStripCell key={row.rank} left={left + index * step} width={step}
            top={y} label={stripValue(row.stats[key].cumulativeShare)} height={bandHeight}
            leftInset={1} rightInset={1} labelRotation={bandRotation}
            labelY={bandRotation ? y + bandHeight / 2 : y + bandHeight / 2 + 4}
            labelClassName={selection.has(row.rank) ? 'chart-strip-label is-selected' : 'chart-strip-label'} />)}
        </g>
      })}
    </g>}
    {ticks.map((tick) => <g key={tick}>
      <line className="enemy-rating-comparison-gridline" x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
      <text className="enemy-rating-comparison-tick" x={left - 7} y={y(tick) + 4} textAnchor="end">{tick}</text>
    </g>)}
    <line className="enemy-rating-comparison-baseline" x1={left} x2={right} y1={bottom} y2={bottom} />
    {cumulative ? ENEMY_RATING_COMPARISON_METRICS.map(({ key }) => {
      const points = rows.flatMap((row, index) => {
        const share = row.stats[key].cumulativeShare
        return share === null ? [] : [{ x: center(index), y: y(share * 100), rank: row.rank }]
      })
      if (points.length === 0) return null
      const secondary = key === 'magicResistance'
      return <g className={seriesClass(key)} key={key}>
        <polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor"
          strokeWidth="2" strokeDasharray={secondary ? DASH : undefined} {...INK} />
        {points.map((point) => secondary
          ? <rect key={point.rank} className="enemy-rating-comparison-line-point" x={point.x - 2} y={point.y - 2}
            width="4" height="4" transform={`rotate(45 ${point.x} ${point.y})`} stroke="currentColor" {...INK} />
          : <circle key={point.rank} cx={point.x} cy={point.y} r="2.4" fill="currentColor" {...INK} />)}
        {points.filter(({ rank }) => selection.has(rank)).map((point) => <circle key={point.rank} cx={point.x} cy={point.y}
          r={secondary ? 4.4 : 6.5} stroke="currentColor" strokeWidth="1.5" fill="none" {...INK} />)}
      </g>
    }) : rows.map((row, index) => <g key={row.rank}>
      {ENEMY_RATING_COMPARISON_METRICS.map(({ key }, seriesIndex) => {
        const share = row.stats[key].share
        if (share === null || share <= 0) return null
        const barWidth = step * 0.32
        const offset = seriesIndex === 0 ? -barWidth - 1 : 1
        const barTop = y(share * 100)
        return <rect className={seriesClass(key)} key={key} x={center(index) + offset} y={barTop}
          width={barWidth} height={bottom - barTop} fill="currentColor" {...INK} />
      })}
    </g>)}
    {rows.map(({ rank }, index) => <text className={`enemy-rating-comparison-tick${selection.has(rank) ? ' is-selected' : ''}`}
      key={rank} x={center(index)} y={bottom + 17} textAnchor="middle">{rank}</text>)}
    <text className="enemy-rating-comparison-axis" x="13" y={(top + bottom) / 2}
      textAnchor="middle" transform={`rotate(-90 13 ${(top + bottom) / 2})`}>
      {cumulative ? CUMULATIVE_AXIS_TITLE : BAR_AXIS_TITLE}
    </text>
    {!imageMode && <text className="enemy-rating-comparison-axis" x={(left + right) / 2} y={height - 8}
      textAnchor="middle">{RATING_AXIS_TITLE}</text>}
  </>
}

function MirroredPlot({
  rows, selection, width, height, axis, imageMode, showRankShare,
}: PlotBodyProps & { showRankShare: boolean }) {
  const compact = width < 460
  const columnWidth = compact ? 54 : 89
  const columnTitle = showRankShare
    ? (compact ? '階級（%）' : RANK_SHARE_TITLE)
    : (compact ? '累積（%）' : CUMULATIVE_AXIS_TITLE)
  const middle = width / 2
  const top = 54
  const bottom = height - (imageMode ? 5 : 28)
  const step = (bottom - top) / rows.length
  const sides = ENEMY_RATING_COMPARISON_METRICS.map(({ key, label }, index) => {
    const direction = index === 0 ? -1 : 1
    return {
      key, label, direction,
      origin: middle + direction * 20,
      edge: index === 0 ? columnWidth : width - columnWidth,
      labelX: index === 0 ? columnWidth / 2 : width - columnWidth / 2,
    }
  })
  const trackWidth = Math.abs(sides[0].edge - sides[0].origin)
  const ticks = trackWidth < 90 ? [0, axis.maximum] : axis.ticks
  return <>
    {rows.map(({ rank }, index) => selection.has(rank) && <rect key={rank} className="enemy-rating-comparison-highlight" x="0"
      y={top + step * index} width={width} height={step} />)}
    <text className="enemy-rating-comparison-label" x={middle} y="26" textAnchor="middle" {...INK}>評価</text>
    {sides.map(({ key, label, direction, origin, edge, labelX }) => {
      const center = (origin + edge) / 2
      return <g key={key}>
        <text className="enemy-rating-comparison-label" x={labelX} y="26" textAnchor="middle" {...INK}>{columnTitle}</text>
        <text className={`enemy-rating-comparison-series-label ${seriesClass(key)}`} x={center}
          y="17" textAnchor="middle" {...INK}>{label}</text>
        {ticks.map((tick) => {
          const x = origin + direction * trackWidth * tick / axis.maximum
          return <g key={tick}>
            <line className={tick === 0 ? 'enemy-rating-comparison-baseline' : 'enemy-rating-comparison-gridline'}
              x1={x} x2={x} y1={top} y2={bottom} />
            <text className="enemy-rating-comparison-tick" x={x} y="46" textAnchor="middle">{tick}</text>
          </g>
        })}
        {rows.map((row, index) => {
          const { share, cumulativeShare } = row.stats[key]
          const y = top + (index + 0.5) * step
          const extent = share === null ? 0 : trackWidth * 100 * share / axis.maximum
          const barHeight = step * 0.58
          return <g key={row.rank}>
            {extent > 0 && <rect className={seriesClass(key)} x={direction === -1 ? origin - extent : origin}
              y={y - barHeight / 2} width={extent} height={barHeight} fill="currentColor" {...INK} />}
            <text className={`enemy-rating-comparison-value${selection.has(row.rank) ? ' is-selected' : ''}`}
              x={labelX} y={y + 4} textAnchor="middle" {...INK}>{stripValue(showRankShare ? share : cumulativeShare)}</text>
          </g>
        })}
      </g>
    })}
    {rows.map(({ rank }, index) => <text className={`enemy-rating-comparison-tick${selection.has(rank) ? ' is-selected' : ''}`}
      key={rank} x={middle} y={top + (index + 0.5) * step + 4} textAnchor="middle">{rank}</text>)}
    {!imageMode && <text className="enemy-rating-comparison-axis" x={middle} y={height - 7}
      textAnchor="middle">{BAR_AXIS_TITLE}</text>}
  </>
}
