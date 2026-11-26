import { useMemo } from 'react'
import { Filters, type FilterOption, type FilterState } from './Filters'
import { OperatorTable } from './OperatorTable'
import { useRecentOperators } from './useRecentOperators'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import {
  EMPTY_OPERATOR_FILTERS,
  buildSubProfessionOptions,
  getRecentOperatorRows,
  hasActiveOperatorFilters,
  matchesOperatorFilters,
} from '../lib/operatorSearchFilters'
import type { SkillRecord } from '../types/skill'

export { EMPTY_OPERATOR_FILTERS, matchesOperatorFilters } from '../lib/operatorSearchFilters'

interface Props {
  rows: SkillRecord[]
  filters: FilterState
  loading: boolean
  onFiltersChange: (next: FilterState) => void
  onSelect: (row: SkillRecord) => void
  instruction?: string
  actionLabel?: string
  className?: string
  selectedOperatorId?: string
}

export function OperatorSearch({
  rows,
  filters,
  loading,
  onFiltersChange,
  onSelect,
  instruction = 'オペレーターを選択すると詳細画面へ移動します',
  actionLabel,
  className = '',
  selectedOperatorId,
}: Props) {
  const { recentOperatorIds, rememberOperator } = useRecentOperators()
  const professionOptions = useMemo(() => sortProfessionOptions(uniqueOptions(rows.map((row) => ({
    value: row.profession,
    label: row.professionLabel,
  })))), [rows])
  const subProfessionOptions = useMemo(
    () => buildSubProfessionOptions(rows, filters.profession),
    [rows, filters.profession],
  )
  const hasActiveFilters = hasActiveOperatorFilters(filters)

  const filteredSkills = useMemo(
    () => hasActiveFilters ? rows.filter((row) => matchesOperatorFilters(row, filters)) : [],
    [rows, filters, hasActiveFilters],
  )

  // 一覧はオペレーターを1人1行だけ表示する。
  // スキル条件で絞り込んだ場合は、最初に一致したスキルを選択対象にする。
  const filteredOperators = useMemo(() => {
    const seen = new Set<string>()
    return filteredSkills.filter((row) => {
      if (seen.has(row.operatorId)) return false
      seen.add(row.operatorId)
      return true
    })
  }, [filteredSkills])
  const recentOperators = useMemo(
    () => getRecentOperatorRows(rows, recentOperatorIds),
    [rows, recentOperatorIds],
  )
  const displayedOperators = hasActiveFilters ? filteredOperators : recentOperators

  const selectOperator = (row: SkillRecord) => {
    rememberOperator(row.operatorId)
    onSelect(row)
  }

  return (
    <section className={`list-pane list-view ${className}`.trim()}>
      <Filters
        value={filters}
        professionOptions={professionOptions}
        subProfessionOptions={subProfessionOptions}
        onChange={onFiltersChange}
        onReset={() => onFiltersChange({ ...EMPTY_OPERATOR_FILTERS })}
      />
      <div className="result-meta" role="status" aria-live="polite">
        <span>{loading
          ? '読み込み中...'
          : hasActiveFilters
            ? `${displayedOperators.length} 名表示`
            : `最近選択したオペレーター · ${displayedOperators.length} 名`}</span>
        <span>{instruction}</span>
      </div>
      {!loading && displayedOperators.length === 0 && !hasActiveFilters ? (
        <div className="operator-empty-state" role="status">
          <strong>最近選択したオペレーターはまだいません</strong>
          <span>検索条件を指定してオペレーターを選択すると、ここに最大6名表示されます。</span>
        </div>
      ) : !loading && displayedOperators.length === 0 ? (
        <div className="operator-empty-state" role="status">
          <strong>条件に一致するオペレーターがいません</strong>
          <span>検索文字や絞り込み条件を変更してください。</span>
          <button type="button" className="button secondary" onClick={() => onFiltersChange({ ...EMPTY_OPERATOR_FILTERS })}>
            条件をリセット
          </button>
        </div>
      ) : (
        <OperatorTable
          rows={displayedOperators}
          onSelect={selectOperator}
          actionLabel={actionLabel}
          selectedOperatorId={selectedOperatorId}
        />
      )}
    </section>
  )
}

function uniqueOptions(options: FilterOption[]): FilterOption[] {
  return [...new Map(options.map((option) => [option.value, option])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
}

function sortProfessionOptions(options: FilterOption[]): FilterOption[] {
  const order = new Map<string, number>(PROFESSION_ORDER.map((profession, index) => [profession, index]))
  return [...options].sort((a, b) => {
    const aIndex = order.get(a.value) ?? PROFESSION_ORDER.length
    const bIndex = order.get(b.value) ?? PROFESSION_ORDER.length
    return aIndex - bIndex || a.label.localeCompare(b.label, 'ja')
  })
}
