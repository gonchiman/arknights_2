import type { EnemyLevelType } from '../types/enemy'
import './EnemyFilterPanel.css'

export const ENEMY_LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

const LEVEL_OPTIONS: Array<{ value: EnemyLevelType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  ...Object.entries(ENEMY_LEVEL_LABELS).map(([value, label]) => ({ value: value as EnemyLevelType, label })),
]

export function EnemyFilterPanel({ levelType, onChange, showReset = true }: {
  levelType: EnemyLevelType | 'ALL'
  onChange: (levelType: EnemyLevelType | 'ALL') => void
  showReset?: boolean
}) {
  return <fieldset className="enemy-level-filter">
    <legend>対象の敵</legend>
    <div className="enemy-level-filter-row">
      <div className="enemy-level-filter-buttons" role="group" aria-label="区分">
        {LEVEL_OPTIONS.map((option) => (
          <button
            type="button"
            className={levelType === option.value ? 'active' : ''}
            aria-pressed={levelType === option.value}
            onClick={() => onChange(option.value)}
            key={option.value}
          >{option.label}</button>
        ))}
      </div>
      {showReset && <button type="button" className="button secondary" onClick={() => onChange('ALL')} disabled={levelType === 'ALL'} aria-label="区分をリセット">リセット</button>}
    </div>
  </fieldset>
}
