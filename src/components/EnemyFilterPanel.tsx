import type { EnemyLevelType } from '../types/enemy'
import { ENEMY_LEVEL_LABELS, normalizeEnemyLevelSelection, toggleEnemyLevelSelection, type EnemyLevelSelection } from '../lib/enemyLevelSelection'
import './EnemyFilterPanel.css'

export { ENEMY_LEVEL_LABELS } from '../lib/enemyLevelSelection'

const LEVEL_OPTIONS: Array<{ value: EnemyLevelType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  ...Object.entries(ENEMY_LEVEL_LABELS).map(([value, label]) => ({ value: value as EnemyLevelType, label })),
]

type EnemyFilterPanelProps = {
  showReset?: boolean
} & ({
  multiple: true
  levelType: EnemyLevelSelection
  onChange: (levelType: EnemyLevelSelection) => void
} | {
  multiple?: false
  levelType: EnemyLevelType | 'ALL'
  onChange: (levelType: EnemyLevelType | 'ALL') => void
})

export function EnemyFilterPanel(props: EnemyFilterPanelProps) {
  const { levelType, multiple = false, showReset = true } = props
  const selected = normalizeEnemyLevelSelection(levelType)
  const change = (value: EnemyLevelType | 'ALL') => {
    if (props.multiple) props.onChange(toggleEnemyLevelSelection(levelType, value))
    else props.onChange(value)
  }
  return <fieldset className="enemy-level-filter">
    <legend>対象の敵</legend>
    <div className="enemy-level-filter-row">
      <div className="enemy-level-filter-buttons" role="group" aria-label={multiple ? '区分（複数選択）' : '区分'}>
        {LEVEL_OPTIONS.map((option) => {
          const active = option.value === 'ALL' ? selected === 'ALL' : selected !== 'ALL' && selected.includes(option.value)
          return (
            <button
              type="button"
              className={active ? 'active' : ''}
              aria-pressed={active}
              onClick={() => change(option.value)}
              key={option.value}
            >{multiple && option.value !== 'ALL' && <span className="enemy-level-filter-check" aria-hidden="true">{active ? '✓' : ''}</span>}{option.label}</button>
          )
        })}
      </div>
      {showReset && <button type="button" className="button secondary" onClick={() => change('ALL')} disabled={selected === 'ALL'} aria-label="区分をリセット">リセット</button>}
    </div>
  </fieldset>
}
