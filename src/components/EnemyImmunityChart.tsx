import type { CSSProperties } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { ENEMY_HISTOGRAM_COUNT_MODES } from '../lib/enemyHistogramCounts'
import type { EnemyImmunityCountMode, EnemyImmunitySummaryItem } from '../lib/enemyImmunities'

const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`

export function EnemyImmunityChart({ items, countMode }: {
  items: readonly EnemyImmunitySummaryItem[]
  countMode: EnemyImmunityCountMode
}) {
  const axis = createZeroBasedValueAxis(Math.max(0, ...items.map(item => item.count)) * 1.2)
  const countOption = ENEMY_HISTOGRAM_COUNT_MODES.find(option => option.key === countMode)!

  return <div className="enemy-immunity-chart" data-count-mode={countMode}>
    <div className="enemy-immunity-axis-title">無効フラグありの{countMode === 'SPAWNS' ? '出現回数' : '敵数'}（{countOption.unit}）</div>
    <div className="enemy-immunity-plot">
      <div className="enemy-immunity-grid" aria-hidden="true">
        {axis.ticks.map(tick => <div key={tick} className="enemy-immunity-gridline"
          style={{ bottom: `${tick / axis.maximum * 100}%` }}>
          <span>{tick.toLocaleString('ja-JP')}</span>
        </div>)}
      </div>
      <div className="enemy-immunity-bars" role="group" aria-label={`無効化する状態異常別の${countOption.label}`}>
        {items.map(item => <div key={item.key}
          className="enemy-immunity-bar" role="img"
          aria-label={`${item.label}無効：${item.count.toLocaleString('ja-JP')}${countOption.unit}、${percent(item.ratio)}`}
          style={{ '--immunity-height': `${item.count / axis.maximum * 100}%` } as CSSProperties}>
          <span className="enemy-immunity-bar-fill" aria-hidden="true" />
          <span className="enemy-immunity-bar-value" aria-hidden="true">
            <strong>{item.count.toLocaleString('ja-JP')}</strong><span>{percent(item.ratio)}</span>
          </span>
          <span className="enemy-immunity-bar-label" aria-hidden="true">{item.label}</span>
        </div>)}
      </div>
    </div>
    <div className="enemy-immunity-x-title">無効化する状態異常</div>
  </div>
}
