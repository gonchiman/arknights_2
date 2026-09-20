import type { EnemyFilters } from '../lib/enemyData'
import type { EnemyNumericCondition } from '../lib/enemyNumericFilters'
import { EnemyFilterPanel } from './EnemyFilterPanel'
import { EnemyNumericFilter } from './EnemyNumericFilter'
import './EnemyAnalysisFilters.css'

export function EnemyAnalysisFilters({ filters, onFiltersChange, numericConditions, onNumericConditionsChange, matchedCount, totalCount, onReset }: {
  filters: EnemyFilters
  onFiltersChange: (filters: EnemyFilters) => void
  numericConditions: readonly EnemyNumericCondition[]
  onNumericConditionsChange: (conditions: readonly EnemyNumericCondition[]) => void
  matchedCount: number
  totalCount: number
  onReset: () => void
}) {
  const active = filters.query !== '' || filters.levelType !== 'ALL' || numericConditions.length > 0

  return <div className="enemy-analysis-filters" role="group" aria-label="分析対象の絞り込み">
    <EnemyFilterPanel
      levelType={filters.levelType}
      onChange={(levelType) => onFiltersChange({ ...filters, levelType })}
      showReset={false}
    />
    <label className="enemy-analysis-search">
      <span>敵名検索</span>
      <input
        type="search"
        value={filters.query}
        placeholder="敵名・図鑑番号・能力・内部ID"
        onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
      />
    </label>
    <EnemyNumericFilter legend="数値条件" conditions={numericConditions} onChange={onNumericConditionsChange} />
    <div className="enemy-analysis-filter-result">
      <span aria-live="polite" aria-atomic="true">対象 {matchedCount.toLocaleString('ja-JP')} / {totalCount.toLocaleString('ja-JP')}体</span>
      <button type="button" onClick={onReset} disabled={!active}>絞り込みをリセット</button>
    </div>
  </div>
}
