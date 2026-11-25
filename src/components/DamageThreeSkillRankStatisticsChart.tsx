import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { SkillRankStatistics } from '../lib/damageThreeSkillRankStatistics'
import { formatAdvantagePercentage, type SkillRankStatisticsProps } from './DamageThreeSkillRankStatisticsTable'
import './DamageThreeSkillRankStatisticsChart.css'

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const VOTES = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const OUTCOMES = [
  { series: 'physical', key: 'physicalWins', label: '物理化優勢' },
  { series: 'tie', key: 'ties', label: '同値' },
  { series: 'arts', key: 'artsWins', label: '術化優勢' },
] as const
const DAMAGE_SERIES = [
  { key: 'physical', label: '物理化' },
  { key: 'arts', label: '術化' },
] as const

function DamageHistogram({ rows, resistance }: Pick<SkillRankStatisticsProps, 'rows'> & { resistance: number }) {
  const row = rows.find(item => item.resistance === resistance)
  if (!row?.count || row.defense === null) {
    return <p className="dc3-stat-chart-empty" role="status">術耐性 {resistance}：対象なし</p>
  }

  // A bar keeps the same scale when switching resistance conditions.
  const peak = Math.max(0, ...rows.flatMap(item => item.histogram.map(bin => Math.max(bin.physical, bin.arts))))
  const axis = createZeroBasedValueAxis(peak)
  return <figure className="dc3-stat-chart dc3-histogram" aria-label="主攻撃1回のダメージ分布">
    <figcaption className="dc3-histogram-caption">
      <ul className="dc3-stat-chart-legend" aria-label="凡例">
        {DAMAGE_SERIES.map(({ key, label }) => <li key={key}><i data-series={key} aria-hidden="true" />{label}</li>)}
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
          {row.histogram.map(bin => {
            const range = `${NUMBER.format(bin.lower)}以上${bin.upper === null ? '' : NUMBER.format(bin.upper) + '未満'}`
            return <div className="dc3-histogram-bin" key={bin.lower} role="img"
              aria-label={`${range}、物理化 ${NUMBER.format(bin.physical)}段階、術化 ${NUMBER.format(bin.arts)}段階`}>
              {DAMAGE_SERIES.map(({ key }) => <span key={key} data-series={key} aria-hidden="true"
                style={{ height: `${bin[key] / axis.maximum * 100}%` }} />)}
            </div>
          })}
        </div>
        <div className="dc3-histogram-bins" aria-hidden="true">
          {row.histogram.map(bin => <span key={bin.lower}>{NUMBER.format(bin.lower)}{bin.upper === null ? '以上' : '～'}</span>)}
        </div>
        <span className="dc3-histogram-x-title">主攻撃1回のダメージ</span>
      </div>
    </div>
  </figure>
}

function AdvantageBar({ row, bySkill }: { row: SkillRankStatistics; bySkill: boolean }) {
  const outcomes = bySkill ? row.bySkill : row
  if (!outcomes.count || row.defense === null) return <span className="dc3-stat-chart-empty">対象なし</span>

  const countLabel = bySkill ? '有効スキル数' : '有効段階数'
  const conditions = `術耐性 ${row.resistance}、対応防御力 ${NUMBER.format(row.defense)}、${countLabel} ${NUMBER.format(outcomes.count)}。`
  const description = OUTCOMES.map(({ key, label }) =>
    `${label} ${VOTES.format(outcomes[key])}${bySkill ? '票' : '段階'}（${formatAdvantagePercentage(outcomes[key], outcomes.count)}%）`).join('、')
  return <div className="dc3-stat-chart-stack" role="img" aria-label={conditions + description}>
    {OUTCOMES.map(({ key, series }) => outcomes[key] > 0 && <span key={key} data-series={series}
      style={{ width: `${outcomes[key] / outcomes.count * 100}%` }} />)}
  </div>
}

export default function DamageThreeSkillRankStatisticsChart({ rows, view, advantageUnit, resistance }: SkillRankStatisticsProps & { resistance: number }) {
  if (view === 'distribution') return <DamageHistogram rows={rows} resistance={resistance} />
  const bySkill = advantageUnit === 'skill'
  return <figure className="dc3-stat-chart" aria-label="術耐性別の属性別の優勢率">
    <figcaption>
      <ul className="dc3-stat-chart-legend" aria-label="凡例">
        {OUTCOMES.map(({ series, label }) => <li key={series}>
          <i data-series={series} aria-hidden="true" />{label}
        </li>)}
      </ul>
    </figcaption>
    <div className="dc3-stat-chart-heading">
      <span>術耐性</span><span>対応防御力</span>
      <div className="dc3-stat-chart-scale">
        <span>{bySkill ? '得票率（1スキル1票）' : '有効段階数に占める割合'}</span>
        <div className="dc3-stat-chart-ticks" aria-hidden="true">
          {[0, 50, 100].map(tick => <span key={tick}>{tick}%</span>)}
        </div>
      </div>
    </div>
    {rows.map(row => <div className="dc3-stat-chart-row" key={row.resistance} data-resistance={row.resistance}>
      <span>{row.resistance}</span><span>{row.defense === null ? '—' : NUMBER.format(row.defense)}</span>
      <div className="dc3-stat-chart-track"><AdvantageBar row={row} bySkill={bySkill} /></div>
    </div>)}
  </figure>
}
