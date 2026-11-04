import { useMemo, type CSSProperties } from 'react'
import { getEnemyHeatmapOpacity } from '../lib/enemyHeatmapColor'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import { ENEMY_IMMUNITIES, summarizeEnemyImmunityOverlaps, type EnemyImmunityCountMode } from '../lib/enemyImmunities'
import type { EnemyRecord } from '../types/enemy'
import './EnemyAnalysis.css'
import './EnemyImmunityOverlap.css'

const formatCount = (value: number) => value.toLocaleString('ja-JP')
const formatRatio = (value: number) => `${(value * 100).toFixed(1)}%`

export function EnemyImmunityOverlap({ rows, countMode, counts }: {
  rows: readonly EnemyRecord[]
  countMode: EnemyImmunityCountMode
  counts: EnemyHistogramCounts
}) {
  const summary = useMemo(() => summarizeEnemyImmunityOverlaps(rows, countMode, counts), [rows, countMode, counts])
  const unit = ENEMY_HISTOGRAM_COUNT_MODES.find(option => option.key === countMode)!.unit

  return <div className="enemy-immunity-overlap">
    <div className="enemy-immunity-overlap-axes">
      <span>行：基準の耐性（分母）</span>
      <span>列：併せ持つ耐性</span>
    </div>
    <div className="table-wrap enemy-table-wrap enemy-immunity-overlap-scroll"
      role="region" aria-label="耐性の重複率一覧・横スクロール領域" tabIndex={0}>
      <table className="enemy-table enemy-immunity-overlap-table">
        <caption>耐性の重複率（各行の耐性保有数を分母）</caption>
        <thead><tr>
          <th scope="col">基準</th>
          {ENEMY_IMMUNITIES.map(item => <th scope="col" key={item.key}>{item.label}</th>)}
        </tr></thead>
        <tbody>{summary.rows.map(row => <tr key={row.key}>
          <th scope="row">
            {row.label}
            <span className="enemy-immunity-overlap-total">{formatCount(row.total)}{unit}</span>
          </th>
          {row.cells.map(cell => {
            const diagonal = row.key === cell.key
            const missing = cell.ratio === null
            const label = diagonal ? '同じ耐性'
              : missing ? `${row.label}耐性を持つ対象なし`
                : `${row.label}耐性の敵のうち${cell.label}耐性あり：${formatCount(cell.count)} / ${formatCount(row.total)}${unit}、${formatRatio(cell.ratio!)}`
            return <td key={cell.key} className={diagonal || missing ? 'enemy-immunity-overlap-empty' : undefined}
              aria-label={label}
              style={diagonal || missing ? undefined : {
                '--immunity-overlap-intensity': `${getEnemyHeatmapOpacity(cell.count, row.total, 'LINEAR') * 100}%`,
              } as CSSProperties}>
              {diagonal || missing ? '—' : formatRatio(cell.ratio!)}
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="enemy-immunity-overlap-legend" aria-label="色の濃さは重複率0%から100%">
      <span>重複率</span><span>0%</span><i aria-hidden="true" /><span>100%</span>
    </div>
  </div>
}
