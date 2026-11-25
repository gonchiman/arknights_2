import { ADVANTAGE_LEGEND, ADVANTAGE_OUTCOMES, getAdvantageChartAxisTitle, getAdvantageChartBar } from '../lib/damageThreeAdvantageChart'
import { DAMAGE_DISTRIBUTION_AXIS_TITLE, DAMAGE_SERIES, damageBinLabel, describeDamageBin, getDamageThreeDistributionHistogram } from '../lib/damageThreeDistributionChart'
import type { AdvantageUnit, SkillRankStatistics } from '../lib/damageThreeSkillRankStatistics'
import { formatAdvantagePercentage, type SkillRankStatisticsProps } from './DamageThreeSkillRankStatisticsTable'
import { DAMAGE_THREE_STATISTIC_STYLE } from './DamageThreeStatisticsImageLegend'
import './DamageThreeSkillRankStatisticsChart.css'

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const VOTES = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

function DamageHistogram({ rows, resistance }: Pick<SkillRankStatisticsProps, 'rows'> & { resistance: number }) {
  const histogram = getDamageThreeDistributionHistogram(rows, resistance)
  if (!histogram) {
    return <p className="dc3-stat-chart-empty" role="status">術耐性 {resistance}：対象なし</p>
  }

  const { row, axis } = histogram
  return <figure className="dc3-stat-chart dc3-histogram" aria-label="主攻撃1回のダメージ分布" style={DAMAGE_THREE_STATISTIC_STYLE}>
    <figcaption className="dc3-stat-chart-caption">
      <ul className="dc3-stat-chart-legend" aria-label="凡例">
        {DAMAGE_SERIES.map(({ series, label }) => <li key={series}><i data-series={series} aria-hidden="true" />{label}</li>)}
      </ul>
      <span>対応防御力 {NUMBER.format(row.defense)} · 有効段階数 {NUMBER.format(row.count)}</span>
    </figcaption>
    <div className="dc3-histogram-scroll" role="region" aria-label={`術耐性 ${resistance}のヒストグラム`} tabIndex={0}>
      <div className="dc3-histogram-grid">
        <span className="dc3-histogram-y-title">段階数</span>
        <div className="dc3-histogram-ticks" aria-hidden="true">
          {axis.ticks.map(tick => <span key={tick} style={{ bottom: `${tick / axis.maximum * 100}%` }}>{NUMBER.format(tick)}</span>)}
        </div>
        <div className="dc3-histogram-plot">
          {axis.ticks.map(tick => <i key={tick} className="dc3-histogram-guide" aria-hidden="true"
            style={{ bottom: `${tick / axis.maximum * 100}%` }} />)}
          {row.histogram.map(bin => <div className="dc3-histogram-bin" key={bin.lower} role="img" aria-label={describeDamageBin(bin)}>
            {DAMAGE_SERIES.map(({ series }) => <span key={series} data-series={series} aria-hidden="true"
              style={{ height: `${bin[series] / axis.maximum * 100}%` }} />)}
          </div>)}
        </div>
        <div className="dc3-histogram-bins" aria-hidden="true">
          {row.histogram.map(bin => <span key={bin.lower}>{damageBinLabel(bin)}</span>)}
        </div>
        <span className="dc3-histogram-x-title">{DAMAGE_DISTRIBUTION_AXIS_TITLE}</span>
      </div>
    </div>
  </figure>
}

function AdvantageBar({ row, unit }: { row: SkillRankStatistics; unit: AdvantageUnit }) {
  const bar = getAdvantageChartBar(row, unit)
  if (!bar) return <span className="dc3-stat-chart-empty">対象なし</span>

  const bySkill = unit === 'skill'
  const countLabel = bySkill ? '有効スキル数' : '有効段階数'
  const conditions = `術耐性 ${row.resistance}、対応防御力 ${NUMBER.format(bar.defense)}、${countLabel} ${NUMBER.format(bar.count)}。`
  const breakdown = bar.segments.map(({ count, description }) =>
    `${description} ${VOTES.format(count)}${bySkill ? '票' : '段階'}（${formatAdvantagePercentage(count, bar.count)}%）`).join('、')
  return <div className="dc3-stat-chart-stack" role="img" aria-label={conditions + breakdown}>
    {bar.segments.map(({ series, count, fraction }) => count > 0 && <span key={series} data-series={series}
      style={{ width: `${fraction * 100}%` }} />)}
  </div>
}

export default function DamageThreeSkillRankStatisticsChart({ rows, view, advantageUnit, resistance }: SkillRankStatisticsProps & { resistance: number }) {
  if (view === 'distribution') return <DamageHistogram rows={rows} resistance={resistance} />
  return <figure className="dc3-stat-chart" aria-label="術耐性別の属性別の優勢率" style={DAMAGE_THREE_STATISTIC_STYLE}>
    <figcaption className="dc3-stat-chart-caption">
      <strong>{ADVANTAGE_LEGEND}</strong>
      <ul className="dc3-stat-chart-legend" aria-label={ADVANTAGE_LEGEND}>
        {ADVANTAGE_OUTCOMES.map(({ series, label }) => <li key={series}>
          <i data-series={series} aria-hidden="true" />{label}
        </li>)}
      </ul>
    </figcaption>
    <div className="dc3-stat-chart-heading">
      <span>術耐性</span><span>対応防御力</span>
      <div className="dc3-stat-chart-scale">
        <span>{getAdvantageChartAxisTitle(advantageUnit)}</span>
        <div className="dc3-stat-chart-ticks" aria-hidden="true">
          {[0, 50, 100].map(tick => <span key={tick}>{tick}%</span>)}
        </div>
      </div>
    </div>
    {rows.map(row => <div className="dc3-stat-chart-row" key={row.resistance} data-resistance={row.resistance}>
      <span>{row.resistance}</span><span>{row.defense === null ? '—' : NUMBER.format(row.defense)}</span>
      <div className="dc3-stat-chart-track"><AdvantageBar row={row} unit={advantageUnit} /></div>
    </div>)}
  </figure>
}
