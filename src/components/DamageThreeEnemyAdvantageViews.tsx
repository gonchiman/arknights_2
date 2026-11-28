import type { EnemyOperatorVoteSummary, EnemySpawnAdvantageRow, WeightedVotes } from '../lib/damageThreeEnemySpawnAdvantage'
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
  const categoryLabel = { all: '区分', defense: '防御力帯', profession: '職業', rarity: 'レアリティ', outlier: '上側外れ値' }[breakdown]
  const isOutlier = breakdown === 'outlier'
  return <table className="damage-two-table dc3-statistics-table dc3-enemy-advantage-table" aria-label="出現敵での優勢率">
    <colgroup><col /></colgroup><colgroup><col />{isOutlier && <col />}</colgroup>
    <colgroup>{ADVANTAGE_OUTCOMES.map(({ key }) => <col key={key} />)}</colgroup>
    <thead>{isOutlier ? <>
      <tr><th scope="col" rowSpan={2}>{categoryLabel}</th><th scope="colgroup" colSpan={2}>敵の出現</th>
        <th scope="colgroup" colSpan={ADVANTAGE_OUTCOMES.length}>{ADVANTAGE_LEGEND} (%)</th></tr>
      <tr><th scope="col">出現回数</th><th scope="col">出現割合 (%)</th>
        {ADVANTAGE_OUTCOMES.map(({ key, label }) => <th scope="col" key={key}>{label}</th>)}</tr>
    </> : <tr>
      <th scope="col">{categoryLabel}</th><th scope="col">{getEnemyAdvantageCountLabel(breakdown, unit)}</th>
      {ADVANTAGE_OUTCOMES.map(({ key, label }) => <th scope="col" key={key}>{label} (%)</th>)}
    </tr>}</thead>
    <tbody>{rows.map(row => {
      const votes = row[unit]
      return <tr key={row.label}>
        <th scope="row">{row.label}</th><td data-table-image-number>{INTEGER.format(getEnemyAdvantageRowCount(row, unit))}</td>
        {'spawnShare' in row && <td data-table-image-number>{formatSpawnShare(row.spawnShare)}</td>}
        {ADVANTAGE_OUTCOMES.map(({ key }) => <td key={key} data-table-image-number>
          {formatAdvantagePercentage(votes[key], votes.count)}
        </td>)}
      </tr>
    })}</tbody>
  </table>
}

function formatSpawnShare(share: number | null) {
  return share === null ? '—' : (share * 100).toFixed(1)
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
  emptyLabel?: string
}

function VoteSharePlot({ rows, title, width, height, minWidth }: PlotSize & {
  rows: VotePlotRow[]
  title: string
  minWidth?: string
}) {
  const rowHeight = height / Math.max(rows.length, 1)
  return <svg className="dc3-enemy-advantage-plot" width={width ?? '100%'} height={height}
    style={minWidth ? { minWidth } : undefined} aria-label={title} role="img">
    <desc>{rows.map(({ label, note, votes, emptyLabel = '対象なし' }) => {
      const details = votes.count > 0 ? ADVANTAGE_OUTCOMES.map(({ key, label }) =>
        `${label} ${formatAdvantagePercentage(votes[key], votes.count)}%`).join('、') : emptyLabel
      return [label, note, details].filter(Boolean).join('、')
    }).join('。')}</desc>
    {rows.map(({ key, label, note, votes, emptyLabel = '対象なし' }, index) => {
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
        }) : <text y={center + 9}>{emptyLabel}</text>}
      </g>
    })}
  </svg>
}

export function DamageThreeEnemyAdvantagePlot({ rows, unit, breakdown, ...size }: EnemyAdvantageViewProps & PlotSize) {
  const countLabel = getEnemyAdvantageCountLabel(breakdown, unit)
  const bands = rows.map(row => {
    const count = getEnemyAdvantageRowCount(row, unit)
    let note = `${countLabel} ${INTEGER.format(count)}`
    if ('spawnShare' in row) note += ` · 出現割合 ${row.spawnShare === null ? '—' : formatSpawnShare(row.spawnShare) + '%'}`
    return {
      key: row.label, label: breakdown === 'defense' && row.label !== '全体' ? `防御力 ${row.label}` : row.label,
      note, votes: row[unit], emptyLabel: breakdown === 'outlier' && count > 0 ? '比較票なし' : undefined,
    }
  })
  const minWidth = breakdown === 'outlier' && size.width === undefined ? '32em' : undefined
  return <VoteSharePlot {...size} rows={bands} minWidth={minWidth} title="出現回数で重み付けした属性別の優勢率" />
}

export function OperatorSkillVotesPlot({ operator, ...size }: { operator: EnemyOperatorVoteSummary } & PlotSize) {
  const rows = operator.skills.map(skill => ({
    key: skill.key, label: `S${skill.skillIndex} ${skill.skillName}`, votes: skill.votes,
  }))
  // The SVG uses a single line for each name and three columns for percentages.
  const minWidth = size.width === undefined ? `${Math.max(23, ...rows.map(row => Array.from(row.label).length))}em` : undefined
  return <VoteSharePlot {...size} rows={rows} title={`${operator.operatorName}のスキル別の得票率`} minWidth={minWidth} />
}

export function OperatorSkillVotesChart({ operator }: { operator: EnemyOperatorVoteSummary }) {
  return <figure className="dc3-stat-chart" aria-label="スキル別の得票率">
    <figcaption className="dc3-stat-chart-caption"><strong>{ADVANTAGE_LEGEND}</strong></figcaption>
    <div className="dc3-skill-votes-plot-scroll" role="region" aria-label="スキル別の得票率グラフ" tabIndex={0}>
      <OperatorSkillVotesPlot operator={operator} height={getEnemyAdvantagePlotHeight(operator.skills.length)} />
    </div>
  </figure>
}

export function EnemyAdvantageCategorySelector({ rows, hidden, onChange }: {
  rows: readonly EnemyAdvantageDisplayRow[]
  hidden: readonly string[]
  onChange: (hidden: string[]) => void
}) {
  const labels = rows.map(row => row.label)
  const hiddenCount = labels.filter(label => hidden.includes(label)).length
  return <fieldset className="dc3-matrix-option-group enemy-chart-visibility dc3-matrix-category-visibility">
    <legend>表示カテゴリ</legend>
    <div>
      {labels.map(label => <label key={label} className={hidden.includes(label) ? '' : 'active'}>
        <input type="checkbox" checked={!hidden.includes(label)} onChange={event =>
          onChange(event.target.checked ? hidden.filter(item => item !== label) : [...hidden, label])} />
        {label}
      </label>)}
      <button type="button" className="filter-reset-button" disabled={hiddenCount === 0}
        onClick={() => onChange(hidden.filter(label => !labels.includes(label)))}>全選択</button>
      <button type="button" className="filter-reset-button" disabled={hiddenCount === labels.length}
        onClick={() => onChange([...new Set([...hidden, ...labels])])}>すべて解除</button>
    </div>
  </fieldset>
}

export function DamageThreeEnemyAdvantageChart(props: EnemyAdvantageViewProps) {
  if (!props.rows.length) return <p role="status">表示カテゴリを選択してください。</p>
  const plot = <DamageThreeEnemyAdvantagePlot {...props} height={getEnemyAdvantagePlotHeight(props.rows.length)} />
  return <figure className="dc3-stat-chart" aria-label="出現敵での優勢率">
    <figcaption className="dc3-stat-chart-caption"><strong>{ADVANTAGE_LEGEND}</strong></figcaption>
    {props.breakdown === 'outlier'
      ? <div className="dc3-skill-votes-plot-scroll" role="region" aria-label="外れ値別の優勢率グラフ" tabIndex={0}>{plot}</div>
      : plot}
  </figure>
}
