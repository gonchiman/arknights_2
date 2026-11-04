import { useMemo, type CSSProperties } from 'react'
import { getEnemyHeatmapOpacity } from '../lib/enemyHeatmapColor'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import { ENEMY_IMMUNITIES, summarizeEnemyImmunityOverlaps, type EnemyImmunityCountMode, type EnemyImmunityOverlapDenominator } from '../lib/enemyImmunities'
import type { EnemyRecord } from '../types/enemy'
import './EnemyAnalysis.css'
import './EnemyImmunityOverlap.css'

const formatCount = (value: number) => value.toLocaleString('ja-JP')
const formatRatio = (value: number) => `${(value * 100).toFixed(1)}%`

export function EnemyImmunityOverlap({ rows, countMode, counts, denominator }: {
  rows: readonly EnemyRecord[]
  countMode: EnemyImmunityCountMode
  counts: EnemyHistogramCounts
  denominator: EnemyImmunityOverlapDenominator
}) {
  const summary = useMemo(() => summarizeEnemyImmunityOverlaps(rows, countMode, counts, denominator), [rows, countMode, counts, denominator])
  const unit = ENEMY_HISTOGRAM_COUNT_MODES.find(option => option.key === countMode)!.unit
  const overall = denominator === 'ALL'

  return <div className="enemy-immunity-overlap">
    <div className="enemy-immunity-overlap-axes">
      <span>{overall ? '行・列：組み合わせる耐性' : '行：基準の耐性（分母）'}</span>
      <span>{overall ? `分母：対象全体 ${formatCount(summary.total)}${unit}` : '列：併せ持つ耐性'}</span>
    </div>
    <div className="table-wrap enemy-table-wrap enemy-immunity-overlap-scroll"
      role="region" aria-label="耐性の重複率一覧・横スクロール領域" tabIndex={0}>
      <table className="enemy-table enemy-immunity-overlap-table">
        <caption>耐性の重複率（{overall ? '対象全体を分母' : '各行の耐性保有数を分母'}）</caption>
        <thead><tr>
          <th scope="col">{overall ? '耐性' : '基準'}</th>
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
            const hiddenDiagonal = diagonal && !overall
            const base = overall ? summary.total : row.total
            const population = overall
              ? diagonal ? `対象全体のうち${row.label}耐性あり` : `対象全体のうち${row.label}・${cell.label}の両耐性あり`
              : `${row.label}耐性の敵のうち${cell.label}耐性あり`
            const label = hiddenDiagonal ? '同じ耐性'
              : missing ? overall ? '対象なし' : `${row.label}耐性を持つ対象なし`
                : `${population}：${formatCount(cell.count)} / ${formatCount(base)}${unit}、${formatRatio(cell.ratio!)}`
            return <td key={cell.key} className={hiddenDiagonal || missing ? 'enemy-immunity-overlap-empty' : undefined}
              aria-label={label}
              style={hiddenDiagonal || missing ? undefined : {
                '--immunity-overlap-intensity': `${getEnemyHeatmapOpacity(cell.count, base, 'LINEAR') * 100}%`,
              } as CSSProperties}>
              {hiddenDiagonal || missing ? '—' : formatRatio(cell.ratio!)}
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
