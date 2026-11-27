import type { EnemyOperatorVotes, EnemySpawnAdvantageRow, WeightedVotes } from '../lib/damageThreeEnemySpawnAdvantage'
import { ADVANTAGE_LEGEND, ADVANTAGE_OUTCOMES, DAMAGE_THREE_STATISTIC_COLORS } from '../lib/damageThreeAdvantageChart'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'
import { formatAdvantagePercentage } from './DamageThreeSkillRankStatisticsTable'
import { getEnemyAdvantageCountLabel, getEnemyAdvantageRowCount, type EnemyAdvantageBreakdown, type EnemyAdvantageDisplayRow } from './enemyAdvantageBreakdown'
import './DamageThreeEnemyAdvantageViews.css'

interface EnemyAdvantageViewProps {
  rows: readonly EnemyAdvantageDisplayRow[]
  unit: AdvantageUnit
  breakdown: EnemyAdvantageBreakdown
}

const INTEGER = new Intl.NumberFormat('ja-JP')
const damagePrecision = { minimumFractionDigits: 1, maximumFractionDigits: 1 }
const DAMAGE = new Intl.NumberFormat('ja-JP', damagePrecision)
const DAMAGE_DIFFERENCE = new Intl.NumberFormat('ja-JP', { ...damagePrecision, signDisplay: 'exceptZero' })
export const ENEMY_MEAN_DAMAGE_TITLE = '主攻撃1回の平均ダメージ'

export function DamageThreeEnemyMeanDamageTable({ rows }: { rows: readonly EnemySpawnAdvantageRow[] }) {
  return <table className="damage-two-table dc3-statistics-table dc3-enemy-advantage-table" aria-label={ENEMY_MEAN_DAMAGE_TITLE}>
    <colgroup><col /><col /><col /><col /><col /></colgroup>
    <thead><tr>
      <th scope="col">防御力帯</th><th scope="col">出現回数</th>
      <th scope="col">物理平均</th><th scope="col">術平均</th><th scope="col">差（物理−術）</th>
    </tr></thead>
    <tbody>{rows.map(({ label, meanDamage }) => <tr key={label}>
      <th scope="row">{label}</th><td data-table-image-number>{INTEGER.format(meanDamage?.spawnCount ?? 0)}</td>
      <td data-table-image-number>{meanDamage ? DAMAGE.format(meanDamage.physical) : '—'}</td>
      <td data-table-image-number>{meanDamage ? DAMAGE.format(meanDamage.arts) : '—'}</td>
      <td data-table-image-number>{meanDamage ? DAMAGE_DIFFERENCE.format(meanDamage.physical - meanDamage.arts) : '—'}</td>
    </tr>)}</tbody>
  </table>
}

export function DamageThreeEnemyAdvantageTable({ rows, unit, breakdown }: EnemyAdvantageViewProps) {
  const categoryLabel = { all: '区分', defense: '防御力帯', profession: '職業', rarity: 'レアリティ' }[breakdown]
  return <table className="damage-two-table dc3-statistics-table dc3-enemy-advantage-table" aria-label="出現敵での優勢率">
    <colgroup><col /><col />{ADVANTAGE_OUTCOMES.map(({ key }) => <col key={key} />)}</colgroup>
    <thead><tr>
      <th scope="col">{categoryLabel}</th><th scope="col">{getEnemyAdvantageCountLabel(breakdown, unit)}</th>
      {ADVANTAGE_OUTCOMES.map(({ key, label }) => <th scope="col" key={key}>{label} (%)</th>)}
    </tr></thead>
    <tbody>{rows.map(row => {
      const votes = row[unit]
      return <tr key={row.label}>
        <th scope="row">{row.label}</th><td data-table-image-number>{INTEGER.format(getEnemyAdvantageRowCount(row, unit))}</td>
        {ADVANTAGE_OUTCOMES.map(({ key }) => <td key={key} data-table-image-number>
          {formatAdvantagePercentage(votes[key], votes.count)}
        </td>)}
      </tr>
    })}</tbody>
  </table>
}

export function getEnemyAdvantagePlotHeight(rowCount: number) {
  return rowCount * 80
}

interface PlotSize {
  width?: number
  height: number
}

interface VotePlotRow {
  key: string
  label: string
  note?: string
  votes: WeightedVotes
}

function VoteSharePlot({ rows, title, width, height, minWidth }: PlotSize & {
  rows: VotePlotRow[]
  title: string
  minWidth?: string
}) {
  const rowHeight = height / Math.max(rows.length, 1)
  return <svg className="dc3-enemy-advantage-plot" width={width ?? '100%'} height={height}
    style={minWidth ? { minWidth } : undefined} aria-label={title} role="img">
    <desc>{rows.map(({ label, note, votes }) => {
      const details = votes.count > 0 ? ADVANTAGE_OUTCOMES.map(({ key, label }) =>
        `${label} ${formatAdvantagePercentage(votes[key], votes.count)}%`).join('、') : '対象なし'
      return [label, note, details].filter(Boolean).join('、')
    }).join('。')}</desc>
    {rows.map(({ key, label, note, votes }, index) => {
      const center = (index + 0.5) * rowHeight
      let offset = 0
      return <g key={key} data-band={key} aria-hidden="true">
        <text y={center - 15} fontWeight="600">{label}</text>
        {note && <text x="100%" y={center - 15} textAnchor="end">{note}</text>}
        {votes.count > 0 ? ADVANTAGE_OUTCOMES.map(({ series, key, label }, seriesIndex) => {
          const start = offset
          const share = votes[key] / votes.count
          offset += share
          const color = DAMAGE_THREE_STATISTIC_COLORS[series]
          const labelX = `${seriesIndex * 100 / ADVANTAGE_OUTCOMES.length}%`
          return <g key={key}>
            <rect data-series={series} x={`${start * 100}%`} y={center - 7}
              width={`${share * 100}%`} height={19} fill={color} />
            <rect x={labelX} y={center + 21} width={8} height={8} fill={color} />
            <text x={labelX} dx={13} y={center + 29}>{label} {formatAdvantagePercentage(votes[key], votes.count)}%</text>
          </g>
        }) : <text y={center + 9}>対象なし</text>}
      </g>
    })}
  </svg>
}

export function DamageThreeEnemyAdvantagePlot({ rows, unit, breakdown, ...size }: EnemyAdvantageViewProps & PlotSize) {
  const countLabel = getEnemyAdvantageCountLabel(breakdown, unit)
  const bands = rows.map(row => ({
    key: row.label, label: breakdown === 'defense' && row.label !== '全体' ? `防御力 ${row.label}` : row.label,
    note: `${countLabel} ${INTEGER.format(getEnemyAdvantageRowCount(row, unit))}`, votes: row[unit],
  }))
  return <VoteSharePlot {...size} rows={bands} title="出現回数で重み付けした属性別の優勢率" />
}

export function OperatorSkillVotesPlot({ operator, ...size }: { operator: EnemyOperatorVotes } & PlotSize) {
  const rows = operator.skills.map(skill => ({
    key: skill.key, label: `S${skill.skillIndex} ${skill.skillName}`, votes: skill.votes,
  }))
  // The SVG uses a single line for each name and three columns for percentages.
  const minWidth = size.width === undefined ? `${Math.max(23, ...rows.map(row => Array.from(row.label).length))}em` : undefined
  return <VoteSharePlot {...size} rows={rows} title={`${operator.operatorName}のスキル別の得票率`} minWidth={minWidth} />
}

export function OperatorSkillVotesChart({ operator }: { operator: EnemyOperatorVotes }) {
  return <figure className="dc3-stat-chart" aria-label="スキル別の得票率">
    <figcaption className="dc3-stat-chart-caption"><strong>{ADVANTAGE_LEGEND}</strong></figcaption>
    <div className="dc3-skill-votes-plot-scroll" role="region" aria-label="スキル別の得票率グラフ" tabIndex={0}>
      <OperatorSkillVotesPlot operator={operator} height={getEnemyAdvantagePlotHeight(operator.skills.length)} />
    </div>
  </figure>
}

export function DamageThreeEnemyAdvantageChart(props: EnemyAdvantageViewProps) {
  return <figure className="dc3-stat-chart" aria-label="出現敵での優勢率">
    <figcaption className="dc3-stat-chart-caption"><strong>{ADVANTAGE_LEGEND}</strong></figcaption>
    <DamageThreeEnemyAdvantagePlot {...props} height={getEnemyAdvantagePlotHeight(props.rows.length)} />
  </figure>
}
