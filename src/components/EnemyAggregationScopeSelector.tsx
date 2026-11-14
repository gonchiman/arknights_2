import { useId } from 'react'

const SCOPE_LABELS = { all: '全体', main: 'メインストーリー' } as const
export type EnemyAggregationScope = keyof typeof SCOPE_LABELS
export const ENEMY_MAIN_STORY_LABEL = SCOPE_LABELS.main

export function EnemyAggregationScopeSelector({ scope, onChange, disabled }: {
  scope: EnemyAggregationScope
  onChange: (scope: EnemyAggregationScope) => void
  disabled: boolean
}) {
  const name = useId()
  return <fieldset className="enemy-chart-visibility enemy-analysis-scope" disabled={disabled}>
    <legend>集計範囲</legend>
    <div>
      {(['all', 'main'] as const).map(key => (
        <label key={key} className={scope === key ? 'active' : ''}>
          <input type="radio" name={name} value={key} checked={scope === key} onChange={() => onChange(key)} />
          <span>{SCOPE_LABELS[key]}</span>
        </label>
      ))}
    </div>
  </fieldset>
}
