import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { DamageThreeAttributeRankRow } from '../lib/damageCalculatorThreeAttributeTables'
import { getEnemyStatRating } from '../lib/enemyStatRatings'
import { getColumnStatRankBands, type RankBandStat } from '../lib/statRankBands'
import { StatRankStrip } from './StatRankStrip'
import './DamageCalculatorThreeAttributeRankChart.css'

const ATTRIBUTES = [['physical', '物理'], ['arts', '術']] as const
const STAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const DAMAGE = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const TICK = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const RATING_ROW_HEIGHT = 18
const RATING_ROW_GAP = 2
const RATING_PLOT_GAP = 7
export const ATTRIBUTE_RANK_RATING_EXTRA_HEIGHT = 2 * RATING_ROW_HEIGHT + RATING_ROW_GAP + RATING_PLOT_GAP

export type DamageThreeAttributeRankChartType = 'line' | 'bar'

export function DamageCalculatorThreeAttributeRankLegend({ chartType = 'line', forImage = false }: {
  chartType?: DamageThreeAttributeRankChartType
  forImage?: boolean
}) {
  const isBar = chartType === 'bar'
  return <ul className={forImage ? 'chart-image-frame-legend-list damage-three-attribute-rank-image-legend'
    : 'damage-three-attribute-rank-chart-legend'} aria-label="属性の凡例">
    {ATTRIBUTES.map(([key, label]) => <li key={key} className={`is-${key}${forImage ? ' chart-image-frame-legend-item' : ''}`}>
      {forImage ? <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        {isBar ? <rect x="4" y="1" width="10" height="10" fill="currentColor" />
          : <line x1="0" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2"
            strokeDasharray={key === 'arts' ? '5 4' : undefined} />}
      </svg> : <i aria-hidden="true" />}
      {label}
    </li>)}
  </ul>
}

function describeRow({ resistance, defense, physical, arts }: DamageThreeAttributeRankRow, showRatings = false) {
  const resistanceRating = showRatings ? getEnemyStatRating('magicResistance', resistance) : null
  const defenseRating = showRatings ? getEnemyStatRating('defense', defense) : null
  return [
    ['術耐性', STAT.format(resistance) + (resistanceRating ? `（評価 ${resistanceRating}）` : '')],
    ['防御力', defense === null ? '—' : STAT.format(defense) + (defenseRating ? `（評価 ${defenseRating}）` : '')],
    ['物理', physical === null ? '—' : DAMAGE.format(physical)],
    ['術', arts === null ? '—' : DAMAGE.format(arts)],
  ] as const
}

function AttributeRankRatingRow({ label, stat, series, values, width }: {
  label: string; stat: RankBandStat; series: typeof ATTRIBUTES[number][0]
  values: readonly (number | null)[]; width: number
}) {
  return <>
    <span className="damage-three-attribute-rank-chart-axis-label damage-three-attribute-rank-chart-rating-label"
      aria-hidden="true">{label}</span>
    <svg className={`damage-three-attribute-rank-chart-ratings is-${series}`} height={RATING_ROW_HEIGHT}
      aria-hidden="true" focusable="false">
      <StatRankStrip bands={getColumnStatRankBands(stat, values)} left={0} right={width} top={0}
        height={RATING_ROW_HEIGHT} showTooltips={false} />
      {values.map((value, index) => value === null && <text key={index} className="stat-rank-strip-label"
        x={`${(index + 0.5) / values.length * 100}%`} y={RATING_ROW_HEIGHT / 2 + 4} textAnchor="middle">—</text>)}
    </svg>
  </>
}

export function DamageCalculatorThreeAttributeRankChart({ rows, chartType = 'line', showRatings = false, imageHeight }: {
  rows: readonly DamageThreeAttributeRankRow[]
  chartType?: DamageThreeAttributeRankChartType
  showRatings?: boolean
  imageHeight?: number
}) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [plotWidth, setPlotWidth] = useState(0)
  const hasRows = rows.length > 0
  useLayoutEffect(() => {
    const plot = plotRef.current
    if (!showRatings || !plot) return
    // The PNG preview scales the chart visually. Use the unscaled layout width.
    const measure = () => setPlotWidth(parseFloat(getComputedStyle(plot).width) || 0)
    measure()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(plot)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [showRatings, hasRows])
  if (!hasRows) return null

  const maximum = rows.reduce((value, row) => Math.max(value, row.physical ?? 0, row.arts ?? 0), 0)
  const axis = createZeroBasedValueAxis(maximum, 0)
  const x = (index: number) => (index + 0.5) / rows.length * 100
  const y = (damage: number) => (1 - damage / axis.maximum) * 100
  const layoutStyle = {
    '--attribute-rank-columns': rows.length,
    '--attribute-rank-rating-height': `${RATING_ROW_HEIGHT}px`,
    '--attribute-rank-rating-row-gap': `${RATING_ROW_GAP}px`,
    '--attribute-rank-rating-plot-gap': `${RATING_PLOT_GAP}px`,
  } as CSSProperties
  const isBar = chartType === 'bar'
  const forImage = imageHeight !== undefined

  return <figure className={`damage-three-attribute-rank-chart${isBar ? ' is-bar' : ''}${forImage ? ' is-image' : ''}${showRatings ? ' has-ratings' : ''}`}
    style={forImage ? { height: imageHeight } : undefined}
    aria-label="出現順位別の1回の攻撃ダメージ（1体あたり）">
    {!forImage && <figcaption><DamageCalculatorThreeAttributeRankLegend chartType={chartType} /></figcaption>}
    <div className="damage-three-attribute-rank-chart-scroll">
      <div className="damage-three-attribute-rank-chart-layout" style={layoutStyle}>
        {showRatings && <>
          <AttributeRankRatingRow label="術耐性" stat="magicResistance" series="arts" width={plotWidth}
            values={rows.map(row => row.resistance)} />
          <AttributeRankRatingRow label="防御力" stat="defense" series="physical" width={plotWidth}
            values={rows.map(row => row.defense)} />
        </>}
        <div className="damage-three-attribute-rank-chart-scale" aria-hidden="true">
          {axis.ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{TICK.format(tick)}</span>)}
        </div>
        <div ref={plotRef} className="damage-three-attribute-rank-chart-plot" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            {axis.ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
            {!isBar && ATTRIBUTES.map(([key]) => <path key={key} className={`is-${key}`} vectorEffect="non-scaling-stroke"
              d={rows.map((row, index) => {
                const damage = row[key]
                if (damage === null) return ''
                const command = rows[index - 1]?.[key] == null ? 'M' : 'L'
                return `${command} ${x(index)} ${y(damage)}`
              }).join(' ')} />)}
          </svg>
          <div className="damage-three-attribute-rank-chart-columns">
            {rows.map(row => <div key={row.resistance}>
              {ATTRIBUTES.map(([key]) => {
                const damage = row[key]
                if (damage === null) return null
                if (isBar) return <i key={key}
                  className={`damage-three-attribute-rank-chart-bar is-${key}${damage === 0 ? ' is-zero' : ''}`}
                  style={{ height: `${damage / axis.maximum * 100}%` }} />
                const coincident = key === 'physical' && row.physical === row.arts
                return <i key={key}
                  className={`damage-three-attribute-rank-chart-point is-${key}${coincident ? ' is-coincident' : ''}`}
                  style={{ top: `${y(damage)}%` }} />
              })}
            </div>)}
          </div>
        </div>
        <span className="damage-three-attribute-rank-chart-axis-label">術耐性</span>
        <div className="damage-three-attribute-rank-chart-resistance">
          {rows.map(row => <span key={row.resistance} role={forImage ? undefined : 'img'}
            aria-label={forImage ? undefined : describeRow(row, showRatings).map(([label, value]) => `${label} ${value}`).join('、')}>
            {STAT.format(row.resistance)}
          </span>)}
        </div>
        <span className="damage-three-attribute-rank-chart-axis-label">防御力</span>
        <div className="damage-three-attribute-rank-chart-defense" aria-hidden="true">
          {rows.map(row => <span key={row.resistance}>{row.defense === null ? '—' : STAT.format(row.defense)}</span>)}
        </div>
      </div>
    </div>
  </figure>
}
