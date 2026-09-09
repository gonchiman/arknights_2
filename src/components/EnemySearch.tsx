import { useMemo, useState } from 'react'
import {
  EMPTY_ENEMY_SEARCH_FILTERS,
  ENEMY_SEARCH_RATINGS,
  addRecentEnemyId,
  getRecentEnemyRows,
  hasActiveEnemySearchFilters,
  matchesEnemySearchFilters,
  normalizeRecentEnemyIds,
  type EnemySearchFilters,
  type EnemySearchRating,
} from '../lib/enemySearchFilters'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import './EnemySearch.css'

export { EMPTY_ENEMY_SEARCH_FILTERS } from '../lib/enemySearchFilters'
export type { EnemySearchFilters } from '../lib/enemySearchFilters'

const RECENT_ENEMY_STORAGE_KEY = 'arknights-recent-enemy-ids-v1'
const NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}
const LEVEL_OPTIONS: ReadonlyArray<{ value: EnemyLevelType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  ...Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value: value as EnemyLevelType, label })),
]

interface Props {
  rows: readonly EnemyRecord[]
  filters: EnemySearchFilters
  loading: boolean
  onFiltersChange: (next: EnemySearchFilters) => void
  onSelect: (enemy: EnemyRecord) => void
  selectedEnemyId?: string
}

export function EnemySearch({ rows, filters, loading, onFiltersChange, onSelect, selectedEnemyId }: Props) {
  const [recentEnemyIds, setRecentEnemyIds] = useState(loadRecentEnemyIds)
  const hasActiveFilters = hasActiveEnemySearchFilters(filters)
  const displayedEnemies = useMemo(() => hasActiveFilters
    ? rows.filter((enemy) => matchesEnemySearchFilters(enemy, filters))
    : getRecentEnemyRows(rows, recentEnemyIds), [rows, filters, hasActiveFilters, recentEnemyIds])

  const resetFilters = () => onFiltersChange({ ...EMPTY_ENEMY_SEARCH_FILTERS })
  const selectEnemy = (enemy: EnemyRecord) => {
    const latestIds = normalizeRecentEnemyIds([...loadRecentEnemyIds(), ...recentEnemyIds])
    const nextIds = addRecentEnemyId(latestIds, enemy.id)
    persistRecentEnemyIds(nextIds)
    setRecentEnemyIds(nextIds)
    onSelect(enemy)
  }

  return <section className="list-pane list-view enemy-search" aria-label="敵を検索して選択">
    <div className="filters">
      <div className="filters-heading">
        <span>検索条件</span>
        <button type="button" className="filter-reset-button" disabled={!hasActiveFilters} onClick={resetFilters}>条件をリセット</button>
      </div>
      <div className="initial-filter" role="group" aria-label="敵の区分">
        <span className="initial-filter-label">区分</span>
        {LEVEL_OPTIONS.map((option) => <button key={option.value} type="button"
          className={`initial-button${filters.levelType === option.value ? ' active' : ''}`}
          aria-pressed={filters.levelType === option.value}
          onClick={() => onFiltersChange({ ...filters, levelType: option.value })}>
          {option.label}
        </button>)}
      </div>
      <EnemySearchRatings label="HP（耐久）" value={filters.hpRatings}
        onChange={(hpRatings) => onFiltersChange({ ...filters, hpRatings })} />
      <EnemySearchRatings label="術耐性" value={filters.resistanceRatings}
        onChange={(resistanceRatings) => onFiltersChange({ ...filters, resistanceRatings })} />
      <p className="enemy-search-rating-hint">HP・術耐性のランクは複数選択できます。</p>
      <label className="search-filter">
        <span className="initial-filter-label">文字検索</span>
        <input type="search" className="search" value={filters.query}
          aria-label="敵名・図鑑番号・能力・内部IDで検索"
          placeholder="敵名・図鑑番号・能力・内部ID"
          onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} />
      </label>
    </div>
    <div className="result-meta" role="status" aria-live="polite">
      <span>{loading ? '敵データを読み込み中…' : hasActiveFilters
        ? `${NUMBER_FORMATTER.format(displayedEnemies.length)}体表示`
        : `最近選択した敵 · ${displayedEnemies.length}体`}</span>
      <span>行を選択すると敵のHP・術耐性を反映します</span>
    </div>
    {loading ? <div className="enemy-search-empty-state"><span>敵データを読み込んでいます。</span></div>
      : displayedEnemies.length === 0 ? <div className="enemy-search-empty-state">
        <strong>{hasActiveFilters ? '条件に一致する敵がいません' : '最近選択した敵はまだいません'}</strong>
        <span>{hasActiveFilters ? '検索文字・区分・ランクを変更してください。' : '検索条件を指定して敵を選択すると、ここに最大6体表示されます。'}</span>
        {hasActiveFilters && <button type="button" className="button secondary" onClick={resetFilters}>条件をリセット</button>}
      </div> : <div className="table-wrap enemy-search-table-wrap" tabIndex={0} role="region" aria-label="敵の検索結果">
        <table className="enemy-search-table">
          <caption className="visually-hidden">敵の図鑑番号、名前、区分、HP、防御力、術耐性と選択操作</caption>
          <thead><tr>
            <th scope="col">図鑑番号</th><th scope="col">敵名</th><th scope="col">区分</th>
            <th scope="col" className="enemy-search-number">HP</th><th scope="col" className="enemy-search-number">防御力</th><th scope="col" className="enemy-search-number">術耐性</th><th scope="col">選択</th>
          </tr></thead>
          <tbody>{displayedEnemies.map((enemy) => {
            const selected = enemy.id === selectedEnemyId
            return <tr key={enemy.id} data-enemy-id={enemy.id} className={selected ? 'selected' : undefined}
              aria-current={selected ? 'true' : undefined}
              onClick={(event) => {
                if (event.target instanceof Element && event.target.closest('button')) return
                event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                selectEnemy(enemy)
              }}>
              <td>{enemy.index || '—'}</td><td><span className="enemy-search-name">{enemy.name}</span></td><td>{LEVEL_LABELS[enemy.levelType]}</td>
              <td className="enemy-search-number">{formatStat(enemy.stats.maxHp)}</td>
              <td className="enemy-search-number">{formatStat(enemy.stats.defense)}</td>
              <td className="enemy-search-number">{formatStat(enemy.stats.magicResistance)}</td>
              <td><button type="button" className="enemy-search-select"
                aria-label={`${enemy.name}${enemy.index ? `（${enemy.index}）` : ''}を選択${selected ? '・選択中' : ''}`}
                onClick={() => selectEnemy(enemy)}>{selected ? '選択中' : '選択する →'}</button></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
  </section>
}

function EnemySearchRatings({ label, value, onChange }: {
  label: string
  value: readonly EnemySearchRating[]
  onChange: (value: EnemySearchRating[]) => void
}) {
  return <div className="initial-filter enemy-search-rating-filter" role="group" aria-label={`${label}のランク`}>
    <span className="initial-filter-label">{label}</span>
    <div className="enemy-search-rating-options">
      <button type="button" className={`initial-button${value.length === 0 ? ' active' : ''}`}
        aria-pressed={value.length === 0} onClick={() => onChange([])}>すべて</button>
      {ENEMY_SEARCH_RATINGS.map((rating) => {
        const selected = value.includes(rating)
        return <button key={rating} type="button" className={`initial-button${selected ? ' active' : ''}`}
          aria-pressed={selected}
          onClick={() => onChange(selected ? value.filter((entry) => entry !== rating) : [...value, rating])}>
          {rating}
        </button>
      })}
    </div>
  </div>
}

function formatStat(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : NUMBER_FORMATTER.format(value)
}

function loadRecentEnemyIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(RECENT_ENEMY_STORAGE_KEY)
    return stored ? normalizeRecentEnemyIds(JSON.parse(stored) as unknown) : []
  } catch {
    return []
  }
}

function persistRecentEnemyIds(enemyIds: readonly string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_ENEMY_STORAGE_KEY, JSON.stringify(enemyIds))
  } catch {
    // 保存できない環境でも、この画面内の履歴と敵の選択は利用できる。
  }
}
