import { Fragment } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { formatEnemyRankPercentage, type EnemyResistanceThreshold } from '../lib/enemyDefenseResistance'

const NUMBER = new Intl.NumberFormat('ja-JP')
export const ENEMY_RESISTANCE_THRESHOLD_AXIS_TITLE = '術耐性（下限）'
export type EnemyResistanceChartType = 'scatter' | 'bar'

export function EnemyResistanceThresholdScatter({ rows, chartType = 'scatter', imageHeight, showXAxisTitle = imageHeight === undefined, showMissingCaption = true }: {
  rows: readonly EnemyResistanceThreshold[]
  chartType?: EnemyResistanceChartType
  imageHeight?: number
  showXAxisTitle?: boolean
  showMissingCaption?: boolean
}) {
  const forImage = imageHeight !== undefined
  const isBar = chartType === 'bar'
  const chartLabel = isBar ? '棒グラフ' : '散布図'
  const { maximum, ticks } = createZeroBasedValueAxis(Math.max(0, ...rows.map(row => row.defense ?? 0)))
  const firstMissing = rows.find(row => row.defense === null)
  const maxResistance = rows.at(-1)?.resistance || 1
  const x = (resistance: number, index: number) => `${(isBar ? (index + 0.5) / rows.length : resistance / maxResistance) * 100}%`
  const y = (defense: number) => 100 - defense / maximum * 100

  return <figure className={`enemy-resistance-threshold-scatter${isBar ? ' is-bar' : ''}${forImage ? ' is-image' : ''}`}
    style={forImage ? { height: imageHeight } : undefined} aria-label={`術耐性と対応する防御力の${chartLabel}`}>
    <div className="enemy-resistance-scatter-scroll" role={forImage ? undefined : 'region'}
      aria-label={forImage ? undefined : `${chartLabel}の描画領域`} tabIndex={forImage ? undefined : 0}>
      <div className="enemy-resistance-scatter-layout">
        <span className="enemy-resistance-scatter-y-title">対応する防御力</span>
        <div className="enemy-resistance-scatter-scale" aria-hidden="true">
          {ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{NUMBER.format(tick)}</span>)}
        </div>
        <div className="enemy-resistance-scatter-plot" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            {ticks.slice(1, -1).map(tick => <line key={tick} className="enemy-chart-gridline"
              x1={0} x2={100} y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
            <rect className="enemy-chart-frame" width={100} height={100} vectorEffect="non-scaling-stroke" />
          </svg>
          {isBar ? rows.map(({ resistance, defense }, index) => <Fragment key={resistance}>
            {defense !== null && <span className="enemy-resistance-threshold-bar" style={{
              left: x(resistance, index), width: `${60 / rows.length}%`, height: `${defense / maximum * 100}%`,
            }} />}
            <span className="enemy-resistance-threshold-bar-value" style={{
              left: x(resistance, index), top: `${defense === null ? 100 : y(defense)}%`,
            }}>{defense === null ? '—' : NUMBER.format(defense)}</span>
          </Fragment>) : rows.map(({ resistance, defense }, index) => defense === null ? null : (
            <span key={resistance} className="enemy-resistance-scatter-point"
              data-resistance-video-point={forImage ? resistance : undefined}
              style={{ left: x(resistance, index), top: `${y(defense)}%` }}>
              {NUMBER.format(defense)}
            </span>
          ))}
        </div>
        <div className="enemy-resistance-scatter-x-ticks">
          {rows.map(({ resistance, defense, percentage }, index) => <span key={resistance} style={{ left: x(resistance, index) }} role="img"
            aria-label={defense === null ? `術耐性${resistance}以上、該当なし`
              : `術耐性${resistance}以上、対応する防御力${NUMBER.format(defense)}、上位${formatEnemyRankPercentage(percentage)}`}>
            {resistance}
          </span>)}
        </div>
        {showXAxisTitle && <span className="enemy-resistance-scatter-x-title">{ENEMY_RESISTANCE_THRESHOLD_AXIS_TITLE}</span>}
      </div>
    </div>
    {showMissingCaption && firstMissing && <figcaption data-resistance-video-missing={forImage && !isBar || undefined}>
      術耐性{firstMissing.resistance}以上 · 該当なし
    </figcaption>}
  </figure>
}
