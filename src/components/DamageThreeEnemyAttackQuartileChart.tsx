import { DAMAGE_THREE_STATISTIC_COLORS } from '../lib/damageThreeAdvantageChart'
import type { EnemyAttackQuartileRow } from '../lib/damageThreeEnemyAttackQuartiles'
import { ENEMY_ATTACK_QUARTILES_TITLE } from './enemyComparisonViews'
import './DamageThreeEnemyAdvantageViews.css'
import './DamageThreeSkillRankStatisticsChart.css'

export const ENEMY_ATTACK_QUARTILE_AXIS = '物理優勢率の平均（%）'
export const ENEMY_ATTACK_QUARTILE_PLOT_HEIGHT = 240
const LABEL_WIDTH = 80
const VALUE_WIDTH = 56
const TICKS = [0, 25, 50, 75, 100]

interface AttackQuartileChartProps {
  rows: readonly EnemyAttackQuartileRow[]
}

export function DamageThreeEnemyAttackQuartilePlot({ rows, width, height }: AttackQuartileChartProps & {
  width?: number
  height: number
}) {
  const top = 6
  const baseline = height - 24
  const rowHeight = (baseline - top) / Math.max(rows.length, 1)
  const barHeight = Math.min(38, rowHeight * 0.4)
  // Keep text margins in pixels so the same scale works on a phone and in a wide PNG.
  const margins = LABEL_WIDTH + VALUE_WIDTH
  const plotWidth = width === undefined ? `calc(100% - ${margins}px)` : width - margins
  const groups = rows.map(row => ({
    ...row, countText: `${row.stageCount.toLocaleString('ja-JP')}段階`,
    rateText: row.meanPhysicalRate === null ? '対象なし' : `${(row.meanPhysicalRate * 100).toFixed(1)}%`,
  }))
  return <svg className="dc3-enemy-advantage-plot dc3-attack-quartile-plot" width={width ?? '100%'} height={height}
    role="img" aria-label={ENEMY_ATTACK_QUARTILES_TITLE}>
    <desc>{groups.map(row => `${row.label}、${row.countText}、${row.rateText}`).join('。')}</desc>
    <svg x={LABEL_WIDTH} width={plotWidth} height={height} overflow="visible" aria-hidden="true">
      {TICKS.map(value => {
        const x = `${value}%`
        const half = value === 50
        return <g key={value}>
          <line x1={x} x2={x} y1={top} y2={baseline}
            data-reference={half ? '50%' : undefined} strokeDasharray={half ? '4 3' : undefined}
            stroke={half ? 'var(--text-muted, #666)' : 'var(--border, #d6d6d6)'} />
          <text x={x} y={baseline + 17} textAnchor="middle" fontSize="11">{x}</text>
        </g>
      })}
      <line x1="0" x2="100%" y1={baseline} y2={baseline} stroke="var(--border, #d6d6d6)" />
      {groups.map(({ label, countText, meanPhysicalRate, rateText }, index) => {
        const middle = top + (index + 0.5) * rowHeight
        const end = `${(meanPhysicalRate ?? 0) * 100}%`
        return <g key={label} data-quartile={label}>
          <text x={-LABEL_WIDTH} y={middle - 2} fontWeight="600">{label}</text>
          <text x={-LABEL_WIDTH} y={middle + 14} fontSize="11">{countText}</text>
          {meanPhysicalRate !== null && <rect x={0} y={middle - barHeight / 2} width={end} height={barHeight}
            fill={DAMAGE_THREE_STATISTIC_COLORS.physical} data-series="physical" data-value={meanPhysicalRate} />}
          <text x={end} dx={5} y={middle} dominantBaseline="central"
            stroke="var(--surface, #fff)" strokeWidth="3" paintOrder="stroke">{rateText}</text>
        </g>
      })}
    </svg>
  </svg>
}

export function DamageThreeEnemyAttackQuartileChart({ rows }: AttackQuartileChartProps) {
  return <figure className="dc3-stat-chart" aria-label={ENEMY_ATTACK_QUARTILES_TITLE}>
    <DamageThreeEnemyAttackQuartilePlot rows={rows} height={ENEMY_ATTACK_QUARTILE_PLOT_HEIGHT} />
    <figcaption className="dc3-histogram-x-title">{ENEMY_ATTACK_QUARTILE_AXIS}</figcaption>
  </figure>
}
