import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { ADVANTAGE_OUTCOMES, DAMAGE_THREE_STATISTIC_COLORS } from '../lib/damageThreeAdvantageChart'
import type { EnemySpawnAdvantageRow } from '../lib/damageThreeEnemySpawnAdvantage'
import { ENEMY_MEAN_DAMAGE_TITLE } from './DamageThreeEnemyAdvantageViews'
import { DamageThreeStatisticsImageLegend } from './DamageThreeStatisticsImageLegend'
import './DamageThreeSkillRankStatisticsChart.css'
import './DamageThreeEnemyMeanDamageChart.css'

export const ENEMY_MEAN_DAMAGE_AXIS = '平均ダメージ'
export const ENEMY_MEAN_DAMAGE_OVERALL_HEIGHT = 232
const SERIES = ADVANTAGE_OUTCOMES.filter(item => item.series !== 'tie')
const DAMAGE = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const TICK = new Intl.NumberFormat('ja-JP')
const TOP = 30
const BOTTOM = 6
const ORIGIN = 19
const TRACK = 64

interface MeanDamageChartProps {
  rows: readonly EnemySpawnAdvantageRow[]
}

export function getEnemyMeanDamagePlotHeight(rowCount: number) {
  return TOP + Math.max(1, rowCount) * 64 + BOTTOM
}

export function DamageThreeEnemyMeanDamageLegend() {
  return <DamageThreeStatisticsImageLegend items={SERIES} label="攻撃属性" />
}

export function DamageThreeEnemyMeanDamageOverallPlot({ meanDamage, width, height }: {
  meanDamage: NonNullable<EnemySpawnAdvantageRow['meanDamage']>
  width: number
  height: number
}) {
  const maximum = Math.max(meanDamage.physical, meanDamage.arts)
  const axis = createZeroBasedValueAxis(maximum, 0.1)
  const valueFont = 24
  const labelGap = 8
  const left = width * 0.125
  // Allow even a bar reaching the last tick to have its value outside its tip.
  const right = width - Math.max(width * 0.08, DAMAGE.format(maximum).length * valueFont * 0.65 + labelGap)
  const position = (value: number) => left + value / axis.maximum * (right - left)
  const trackHeight = Math.min(174, height * 0.72)
  const axisSpace = 48
  const gridTop = (height - trackHeight - axisSpace) / 2
  const baseline = gridTop + trackHeight
  const barHeight = trackHeight * 0.27

  return <svg width={width} height={height} role="img" aria-label={ENEMY_MEAN_DAMAGE_TITLE}
    fill="#333" style={{ fontVariantNumeric: 'tabular-nums' }}>
    <desc>{SERIES.map(({ label, series }) => `${label} ${DAMAGE.format(meanDamage[series])}`).join('、')}</desc>
    <g aria-hidden="true" textAnchor="middle" fontSize="16" fill="#555">
      {axis.ticks.map(tick => <g key={tick}>
        <line x1={position(tick)} x2={position(tick)} y1={gridTop} y2={baseline}
          stroke={tick === 0 ? '#999' : '#dadada'} />
        <text x={position(tick)} y={baseline + 20}>{TICK.format(tick)}</text>
      </g>)}
      <line x1={left} x2={right} y1={baseline} y2={baseline} stroke="#aaa" />
      <text x={(left + right) / 2} y={baseline + 43}>{ENEMY_MEAN_DAMAGE_AXIS}</text>
    </g>
    {SERIES.map(({ series, label }, index) => {
      const value = meanDamage[series]
      const end = position(value)
      const middle = gridTop + trackHeight * (index + 0.5) / SERIES.length
      return <g key={series} aria-hidden="true">
        <text x={left - 12} y={middle} dominantBaseline="central" textAnchor="end" fontWeight="600" fontSize="22">{label}</text>
        <rect x={left} y={middle - barHeight / 2} width={end - left} height={barHeight}
          fill={DAMAGE_THREE_STATISTIC_COLORS[series]} data-series={series} data-value={value} />
        <text x={end + labelGap} y={middle} dominantBaseline="central" fontWeight="600" fontSize={valueFont}
          stroke="white" strokeWidth="3" paintOrder="stroke">{DAMAGE.format(value)}</text>
      </g>
    })}
  </svg>
}

export function DamageThreeEnemyMeanDamagePlot({ rows, width, height }: MeanDamageChartProps & {
  width?: number
  height: number
}) {
  const maximum = rows.reduce((highest, { meanDamage }) =>
    meanDamage ? Math.max(highest, meanDamage.physical, meanDamage.arts) : highest, 0)
  const axis = createZeroBasedValueAxis(maximum, 0.1)
  const groupHeight = (height - TOP - BOTTOM) / Math.max(1, rows.length)
  const barHeight = Math.min(54, groupHeight * 0.29)
  const gap = Math.min(6, groupHeight * 0.06)
  const origin = `${ORIGIN}%`
  const position = (value: number) => `${ORIGIN + value / axis.maximum * TRACK}%`
  return <svg className="dc3-enemy-mean-damage-plot" width={width ?? '100%'} height={height}
    role="img" aria-label={ENEMY_MEAN_DAMAGE_TITLE}>
    <desc>{rows.map(({ label, meanDamage }) => meanDamage
      ? `${label}、物理 ${DAMAGE.format(meanDamage.physical)}、術 ${DAMAGE.format(meanDamage.arts)}`
      : `${label}、対象なし`).join('。')}</desc>
    <text x={origin} dx="-10" y="18" textAnchor="end" fontWeight="bold">防御力帯</text>
    {axis.ticks.map(tick => <g key={tick}>
      <line x1={position(tick)} x2={position(tick)} y1={TOP} y2={height - BOTTOM} />
      <text x={position(tick)} y="18" textAnchor="middle">{TICK.format(tick)}</text>
    </g>)}
    {rows.map(({ label, meanDamage }, index) => {
      const middle = TOP + groupHeight * (index + 0.5)
      return <g key={label} data-band={label}>
        <text x={origin} dx="-10" y={middle} dominantBaseline="central" textAnchor="end">{label}</text>
        {meanDamage ? SERIES.map(({ series }, seriesIndex) => {
          const value = meanDamage[series]
          const y = seriesIndex === 0 ? middle - gap / 2 - barHeight : middle + gap / 2
          return <g key={series}>
            <rect data-series={series} data-value={value} x={origin} y={y}
              width={`${value / axis.maximum * TRACK}%`} height={barHeight} fill={DAMAGE_THREE_STATISTIC_COLORS[series]} />
            <text x={position(value)} dx="5" y={y + barHeight / 2}
              dominantBaseline="central">{DAMAGE.format(value)}</text>
          </g>
        }) : <text x={origin} dx="5" y={middle} dominantBaseline="central">対象なし</text>}
      </g>
    })}
  </svg>
}

export function DamageThreeEnemyMeanDamageChart({ rows }: MeanDamageChartProps) {
  return <figure className="dc3-stat-chart" aria-label={ENEMY_MEAN_DAMAGE_TITLE}>
    <figcaption className="dc3-stat-chart-caption"><DamageThreeEnemyMeanDamageLegend /></figcaption>
    <div className="dc3-histogram-scroll">
      <DamageThreeEnemyMeanDamagePlot rows={rows} height={getEnemyMeanDamagePlotHeight(rows.length)} />
    </div>
    <div className="dc3-histogram-x-title">{ENEMY_MEAN_DAMAGE_AXIS}</div>
  </figure>
}
