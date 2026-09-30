import { ENEMY_RATING_STATS, getEnemyRatingRanges, type EnemyRatingStat } from '../lib/enemyStatRatings'
import './EnemyRatingReferenceTable.css'

type EnemyRatingReferenceTableProps = { showStatLabels?: boolean } & (
  | { stats: readonly EnemyRatingStat[]; stat?: never }
  | { stat: EnemyRatingStat; stats?: never }
)

function RatingRangeLabel({ label }: { label: string }) {
  const bounds = label.match(/\S+ \S+/g) ?? [label]
  return bounds.map((bound, index) => <span key={bound}>
    {index > 0 ? ' ' : null}<span className="enemy-rating-range-bound">{bound}</span>
  </span>)
}

export function EnemyRatingReferenceTable({ stat, stats, showStatLabels = false }: EnemyRatingReferenceTableProps) {
  const selectedStats = ENEMY_RATING_STATS.filter(({ key }) => stats ? stats.includes(key) : key === stat)
  const columns = selectedStats.map(({ key, label }) => ({ key, label, ranges: getEnemyRatingRanges(key) }))
  if (columns.length === 0) return null

  const multipleStats = columns.length > 1
  const label = columns.map(({ label }) => label).join('・')

  return <table
    className="enemy-rating-reference-table"
    aria-label={`${label}の評価基準`}
    style={multipleStats ? { minWidth: 64 + 150 * columns.length } : undefined}
  >
    <thead>
      <tr>
        <th scope="col">評価</th>
        {columns.map(({ key, label }) => <th key={key} scope="col">{multipleStats || showStatLabels ? label : '実数値の範囲'}</th>)}
      </tr>
    </thead>
    <tbody>
      {columns[0].ranges.map(({ rating }, rowIndex) => (
        <tr key={rating}>
          <th scope="row">{rating}</th>
          {columns.map(({ key, ranges }) => <td key={key}><RatingRangeLabel label={ranges[rowIndex].label} /></td>)}
        </tr>
      ))}
    </tbody>
  </table>
}
