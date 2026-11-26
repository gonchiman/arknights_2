import { getBarChartBarWidth } from '../lib/barChartPresentation'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { DAMAGE_THREE_STATISTIC_COLORS } from '../lib/damageThreeAdvantageChart'
import type { SkillPhysicalRateBin } from '../lib/damageThreeEnemySpawnAdvantage'
import './DamageThreeSkillRankStatisticsChart.css'

export const SKILL_PHYSICAL_RATE_TITLE = 'スキル別の物理優勢率の分布'
export const SKILL_PHYSICAL_RATE_AXIS = '物理優勢率（%）'
const NUMBER = new Intl.NumberFormat('ja-JP')

interface HistogramProps {
  bins: readonly SkillPhysicalRateBin[]
}

/** Percent-based horizontal coordinates retain the same intervals at screen and export widths. */
export function DamageThreeSkillPhysicalRatePlot({ bins, width = '100%', height }: HistogramProps & {
  width?: number | string
  height: number
}) {
  const axis = createZeroBasedValueAxis(Math.max(0, ...bins.map(bin => bin.count)))
  const top = 34, bottom = height - 40
  const y = (count: number) => bottom - (bottom - top) * count / axis.maximum
  const left = 7, right = 99
  const x = (rate: number) => left + (right - left) * rate / 100
  return <svg className="dc3-skill-rate-plot" width={width} height={height} role="img" aria-label={SKILL_PHYSICAL_RATE_TITLE}>
    <desc>{bins.map(({ lower, upper, count }) =>
      `${lower}%以上${upper}%${upper === 100 ? '以下' : '未満'}、${NUMBER.format(count)}スキル`).join('。')}</desc>
    <g aria-hidden="true">
      <text x="0" y="13" className="dc3-skill-rate-y-title">スキル数</text>
      {axis.ticks.map(tick => <g key={tick}>
        <line x1={`${left}%`} x2={`${right}%`} y1={y(tick)} y2={y(tick)} />
        <text x={`${left}%`} dx="-6" y={y(tick)} dy="0.35em" textAnchor="end">{NUMBER.format(tick)}</text>
      </g>)}
      {bins.map(({ lower, upper, count }) => {
        const center = x((lower + upper) / 2)
        const barWidth = getBarChartBarWidth('interval', x(upper) - x(lower))
        return <g key={lower} data-lower={lower} data-count={count}>
          <rect x={`${center - barWidth / 2}%`} width={`${barWidth}%`} y={y(count)} height={bottom - y(count)}
            fill={DAMAGE_THREE_STATISTIC_COLORS.physical} />
          <text x={`${center}%`} y={y(count) - 5} textAnchor="middle">{NUMBER.format(count)}</text>
          <text x={`${center}%`} y={bottom + 15} textAnchor="middle">
            <tspan>{lower}以上</tspan>
            <tspan x={`${center}%`} dy="14">{upper}{upper === 100 ? '以下' : '未満'}</tspan>
          </text>
        </g>
      })}
    </g>
  </svg>
}

export function DamageThreeSkillPhysicalRateHistogram({ bins }: HistogramProps) {
  return <figure className="dc3-stat-chart" aria-label={SKILL_PHYSICAL_RATE_TITLE}>
    <figcaption className="dc3-stat-chart-caption"><strong>{SKILL_PHYSICAL_RATE_TITLE}</strong></figcaption>
    <div className="dc3-histogram-scroll" role="region" aria-label={SKILL_PHYSICAL_RATE_TITLE} tabIndex={0}>
      <DamageThreeSkillPhysicalRatePlot bins={bins} height={294} />
    </div>
    <div className="dc3-histogram-x-title">{SKILL_PHYSICAL_RATE_AXIS}</div>
  </figure>
}
