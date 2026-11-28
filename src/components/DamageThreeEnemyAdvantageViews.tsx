import type { EnemyOperatorVoteSummary, EnemyOutlierRow, EnemySpawnAdvantageRow, WeightedVotes } from '../lib/damageThreeEnemySpawnAdvantage'
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
export const ENEMY_OUTLIER_PLOT_TITLE = '外れ値別の出現割合と属性別の優勢率'
const OUTLIER_HEADER_HEIGHT = 32

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

export function getEnemyAdvantagePlotHeight(rowCount: number, breakdown?: EnemyAdvantageBreakdown) {
  return breakdown === 'outlier' ? OUTLIER_HEADER_HEIGHT + rowCount * 64 : rowCount * 80
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

function VoteShareStrip({ votes, barY, labelY, barHeight = 19 }: {
  votes: WeightedVotes
  barY: number
  labelY: number
  barHeight?: number
}) {
  let offset = 0
  return <>{ADVANTAGE_OUTCOMES.map(({ series, key, label }, index) => {
    const start = offset
    const share = votes[key] / votes.count
    offset += share
    const color = DAMAGE_THREE_STATISTIC_COLORS[series]
    const labelX = `${index * 100 / ADVANTAGE_OUTCOMES.length}%`
    return <g key={key}>
      <rect data-series={series} x={`${start * 100}%`} y={barY}
        width={`${share * 100}%`} height={barHeight} fill={color} />
      <rect x={labelX} y={labelY - 8} width={8} height={8} fill={color} />
      <text x={labelX} dx={13} y={labelY}>{label} {formatAdvantagePercentage(votes[key], votes.count)}%</text>
    </g>
  })}</>
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
      return <g key={key} data-band={key} aria-hidden="true">
        <text y={center - 15} fontWeight="600">{label}</text>
        {note && <text x="100%" y={center - 15} textAnchor="end">{note}</text>}
        {votes.count > 0
          ? <VoteShareStrip votes={votes} barY={center - 7} labelY={center + 29} />
          : <text y={center + 9}>対象なし</text>}
      </g>
    })}
  </svg>
}

function OutlierComparisonPlot({ rows, unit, width, height }: PlotSize & {
  rows: readonly EnemyOutlierRow[]
  unit: AdvantageUnit
}) {
  const rowHeight = Math.min(88, (height - OUTLIER_HEADER_HEIGHT) / Math.max(1, rows.length))
  const chartTop = (height - OUTLIER_HEADER_HEIGHT - rowHeight * rows.length) / 2
  const bands = rows.map(row => {
    const votes = row[unit]
    const share = row.spawnShare === null ? '—' : `${formatSpawnShare(row.spawnShare)}%`
    const emptyLabel = row.spawnCount === 0 ? '該当する出現なし' : '比較票なし'
    const voteSummary = votes.count > 0 ? ADVANTAGE_OUTCOMES.map(({ key, label }) =>
      `${label} ${formatAdvantagePercentage(votes[key], votes.count)}%`).join('、') : emptyLabel
    const description = `${row.label}、出現回数 ${INTEGER.format(row.spawnCount)} · 出現割合 ${share}、${voteSummary}`
    return { row, votes, share, emptyLabel, description }
  })
  return <svg className="dc3-enemy-advantage-plot dc3-outlier-comparison-plot" width={width ?? '100%'} height={height}
    role="img" aria-label={ENEMY_OUTLIER_PLOT_TITLE}>
    <desc>{bands.map(band => band.description).join('。')}</desc>
    <g aria-hidden="true" fontWeight="600" transform={`translate(0 ${chartTop})`}>
      <text y={21}>上側外れ値</text>
      <text x="22%" y={21}>対象内の出現割合</text>
      <text x="52%" y={21}>区分内の優勢率</text>
      <line x1={0} x2="100%" y1={OUTLIER_HEADER_HEIGHT} y2={OUTLIER_HEADER_HEIGHT} stroke="var(--border, #ddd)" />
    </g>
    {bands.map(({ row, votes, share, emptyLabel }, index) => {
      const rowTop = chartTop + OUTLIER_HEADER_HEIGHT + index * rowHeight
      const top = rowTop + rowHeight / 2 - 18
      return <g key={row.label} data-band={row.label} aria-hidden="true">
        <text y={top + 13} fontWeight="600">{row.label}</text>
        <text y={top + 35}>{INTEGER.format(row.spawnCount)}回</text>
        <svg x="22%" y={top} width="26%" height={40}>
          {row.spawnShare !== null && <>
            <rect width="100%" height={14} fill="var(--border, #ddd)" />
            <rect data-series="spawn" width={`${row.spawnShare * 100}%`} height={14} fill="var(--text-muted, #666)" />
          </>}
          <text y={35}>{share}</text>
        </svg>
        <svg x="52%" y={top} width="48%" height={40}>
          {votes.count > 0 ? <VoteShareStrip votes={votes} labelY={35} barY={0} barHeight={14} />
            : <text y={24}>{emptyLabel}</text>}
        </svg>
        {row.label === '全体' && index < bands.length - 1 &&
          <line x1={0} x2="100%" y1={rowTop + rowHeight} y2={rowTop + rowHeight} stroke="var(--border, #ddd)" />}
      </g>
    })}
  </svg>
}

export function DamageThreeEnemyAdvantagePlot({ rows, unit, breakdown, ...size }: EnemyAdvantageViewProps & PlotSize) {
  if (breakdown === 'outlier') {
    return <OutlierComparisonPlot {...size} rows={rows.filter(row => 'spawnShare' in row)} unit={unit} />
  }
  const countLabel = getEnemyAdvantageCountLabel(breakdown, unit)
  const bands = rows.map(row => ({
    key: row.label, label: breakdown === 'defense' && row.label !== '全体' ? `防御力 ${row.label}` : row.label,
    note: `${countLabel} ${INTEGER.format(getEnemyAdvantageRowCount(row, unit))}`, votes: row[unit],
  }))
  return <VoteSharePlot {...size} rows={bands} title="出現回数で重み付けした属性別の優勢率" />
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
  const plot = <DamageThreeEnemyAdvantagePlot {...props} height={getEnemyAdvantagePlotHeight(props.rows.length, props.breakdown)} />
  return <figure className="dc3-stat-chart" aria-label="出現敵での優勢率">
    <figcaption className="dc3-stat-chart-caption"><strong>
      {props.breakdown === 'outlier' ? ENEMY_OUTLIER_PLOT_TITLE : ADVANTAGE_LEGEND}
    </strong></figcaption>
    {props.breakdown === 'outlier'
      ? <div className="dc3-skill-votes-plot-scroll" role="region" aria-label="外れ値別の優勢率グラフ" tabIndex={0}>{plot}</div>
      : plot}
  </figure>
}
