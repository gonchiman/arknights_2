import type { CSSProperties } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { EnemyImmunityKey, EnemyImmunitySummaryItem } from '../lib/enemyImmunities'

const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`

export function EnemyImmunityChart({ items, selected, onSelect }: {
  items: readonly EnemyImmunitySummaryItem[]
  selected: EnemyImmunityKey
  onSelect: (key: EnemyImmunityKey) => void
}) {
  const axis = createZeroBasedValueAxis(Math.max(0, ...items.map(item => item.count)) * 1.2)
  const active = items.find(item => item.key === selected)

  return <div className="enemy-immunity-chart">
    <div className="enemy-immunity-axis-title">無効フラグありの敵数（種類）</div>
    <div className="enemy-immunity-plot">
      <div className="enemy-immunity-grid" aria-hidden="true">
        {axis.ticks.map(tick => <div key={tick} className="enemy-immunity-gridline"
          style={{ bottom: `${tick / axis.maximum * 100}%` }}>
          <span>{tick.toLocaleString('ja-JP')}</span>
        </div>)}
      </div>
      <div className="enemy-immunity-bars" role="group" aria-label="無効化する状態異常別の敵数">
        {items.map(item => <button type="button" key={item.key}
          className="enemy-immunity-bar" aria-pressed={item.key === selected}
          aria-label={`${item.label}無効：${item.count.toLocaleString('ja-JP')}種類、${percent(item.ratio)}`}
          aria-controls="enemy-immunity-list-body"
          style={{ '--immunity-height': `${item.count / axis.maximum * 100}%` } as CSSProperties}
          onClick={() => onSelect(item.key)}>
          <span className="enemy-immunity-bar-fill" aria-hidden="true" />
          <span className="enemy-immunity-bar-value" aria-hidden="true">
            <strong>{item.count.toLocaleString('ja-JP')}</strong><span>{percent(item.ratio)}</span>
          </span>
          <span className="enemy-immunity-bar-label" aria-hidden="true">{item.label}</span>
        </button>)}
      </div>
    </div>
    <div className="enemy-immunity-x-title">無効化する状態異常</div>
    {active && <div className="enemy-immunity-selection" role="status">
      <strong>{active.label}無効</strong>
      <span>{active.count.toLocaleString('ja-JP')}種類</span>
      <span>{percent(active.ratio)}</span>
    </div>}
  </div>
}
