import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { SkillRankStatistics } from '../lib/damageThreeSkillRankStatistics'
import { formatAdvantagePercentage, STATISTIC_VIEWS, type SkillRankStatisticsProps, type StatisticView } from './DamageThreeSkillRankStatisticsTable'
import { viewLabel } from './PageViewSwitch'
import './DamageThreeSkillRankStatisticsChart.css'

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const TICK = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const VOTES = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const OUTCOMES = [
  { series: 'physical', key: 'physicalWins', label: '物理化優勢' },
  { series: 'tie', key: 'ties', label: '同値' },
  { series: 'arts', key: 'artsWins', label: '術化優勢' },
] as const

type Quartiles = NonNullable<SkillRankStatistics['physical']>

function describeQuartiles(values: Quartiles) {
  return `第1四分位 ${NUMBER.format(values.q1)}、中央値 ${NUMBER.format(values.median)}、第3四分位 ${NUMBER.format(values.q3)}`
}

function QuartileInterval({ values, maximum, series }: {
  values: Quartiles; maximum: number; series: 'physical' | 'arts'
}) {
  const start = `${values.q1 / maximum * 100}%`
  const middle = `${values.median / maximum * 100}%`
  const end = `${values.q3 / maximum * 100}%`
  const y = series === 'physical' ? 9 : 23
  return <g data-series={series}>
    <g stroke="currentColor" strokeWidth={2}>
      <line x1={start} x2={end} y1={y} y2={y} />
      <line x1={start} x2={start} y1={y - 3} y2={y + 3} />
      <line x1={end} x2={end} y1={y - 3} y2={y + 3} />
    </g>
    {series === 'physical' ? <circle cx={middle} cy={y} r={3.8} fill="currentColor" />
      : <svg x={middle} y={y} width={1} height={1} overflow="visible">
        <rect x={-3.4} y={-3.4} width={6.8} height={6.8} transform="rotate(45)" fill="currentColor" />
      </svg>}
  </g>
}

function RowPlot({ row, view, maximum, bySkill }: {
  row: SkillRankStatistics; view: StatisticView; maximum: number; bySkill: boolean
}) {
  const outcomes = bySkill ? row.bySkill : row
  if (!outcomes.count || row.defense === null || (view === 'distribution' && (!row.physical || !row.arts))) {
    return <span className="dc3-stat-chart-empty">対象なし</span>
  }
  const countLabel = bySkill ? '有効スキル数' : '有効段階数'
  const conditions = `術耐性 ${row.resistance}、対応防御力 ${NUMBER.format(row.defense)}、${countLabel} ${NUMBER.format(outcomes.count)}。`
  if (view === 'distribution' && row.physical && row.arts) {
    return <svg className="dc3-stat-chart-intervals" role="img"
      aria-label={`${conditions}物理化 ${describeQuartiles(row.physical)}。術化 ${describeQuartiles(row.arts)}。`}>
      <QuartileInterval series="physical" values={row.physical} maximum={maximum} />
      <QuartileInterval series="arts" values={row.arts} maximum={maximum} />
    </svg>
  }
  const description = OUTCOMES.map(({ key, label }) =>
    `${label} ${VOTES.format(outcomes[key])}${bySkill ? '票' : '段階'}（${formatAdvantagePercentage(outcomes[key], outcomes.count)}%）`).join('、')
  return <div className="dc3-stat-chart-stack" role="img" aria-label={conditions + description}>
    {OUTCOMES.map(({ key, series }) => outcomes[key] > 0 && <span key={key} data-series={series}
      style={{ width: `${outcomes[key] / outcomes.count * 100}%` }} />)}
  </div>
}

export default function DamageThreeSkillRankStatisticsChart({ rows, view, advantageUnit }: SkillRankStatisticsProps) {
  const distribution = view === 'distribution'
  const bySkill = !distribution && advantageUnit === 'skill'
  const maximum = distribution ? createZeroBasedValueAxis(
    Math.max(0, ...rows.map(row => Math.max(row.physical?.q3 ?? 0, row.arts?.q3 ?? 0))), 0,
  ).maximum : 100
  const ticks = [0, maximum / 2, maximum]
  return <figure className="dc3-stat-chart" aria-label={`術耐性別の${viewLabel(STATISTIC_VIEWS, view)}`}>
    <figcaption>
      <ul className="dc3-stat-chart-legend" aria-label="凡例">
        {distribution ? <>
          <li><i data-series="physical" className="is-circle" aria-hidden="true" />物理化</li>
          <li><i data-series="arts" className="is-diamond" aria-hidden="true" />術化</li>
          <li>線は中央50%・点は中央値</li>
        </> : OUTCOMES.map(({ series, label }) => <li key={series}>
          <i data-series={series} aria-hidden="true" />{label}
        </li>)}
      </ul>
    </figcaption>
    <div className="dc3-stat-chart-heading">
      <span>術耐性</span><span>対応防御力</span>
      <div className="dc3-stat-chart-scale">
        <span>{distribution ? '主攻撃の1攻撃ダメージ' : bySkill ? '得票率（1スキル1票）' : '有効段階数に占める割合'}</span>
        {(!distribution || rows.some(row => row.count > 0)) && <div className="dc3-stat-chart-ticks" aria-hidden="true">
          {ticks.map(tick => <span key={tick}>{distribution ? TICK.format(tick) : `${tick}%`}</span>)}
        </div>}
      </div>
    </div>
    {rows.map(row => <div className="dc3-stat-chart-row" key={row.resistance} data-resistance={row.resistance}>
      <span>{row.resistance}</span><span>{row.defense === null ? '—' : NUMBER.format(row.defense)}</span>
      <div className="dc3-stat-chart-track"><RowPlot row={row} view={view} maximum={maximum} bySkill={bySkill} /></div>
    </div>)}
  </figure>
}
