import { useMemo } from 'react'
import { Filters, type FilterOption, type FilterState } from './Filters'
import { OperatorTable } from './OperatorTable'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type { SkillRecord } from '../types/skill'

export const EMPTY_OPERATOR_FILTERS: FilterState = {
  query: '',
  nameInitial: 'ALL',
  profession: 'ALL',
  rarity: 'ALL',
}

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
  const professionOptions = useMemo(() => sortProfessionOptions(uniqueOptions(rows.map((row) => ({
    value: row.profession,
    label: row.professionLabel,
  })))), [rows])

  const filteredSkills = useMemo(
    () => rows.filter((row) => matchesOperatorFilters(row, filters)),
    [rows, filters],
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

  return (
    <section className={`list-pane list-view ${className}`.trim()}>
      <Filters
        value={filters}
        professionOptions={professionOptions}
        onChange={onFiltersChange}
        onReset={() => onFiltersChange({ ...EMPTY_OPERATOR_FILTERS })}
      />
      <div className="result-meta" role="status" aria-live="polite">
        <span>{loading ? '読み込み中...' : `${filteredOperators.length} 名表示`}</span>
        <span>{instruction}</span>
      </div>
      {!loading && filteredOperators.length === 0 ? (
        <div className="operator-empty-state" role="status">
          <strong>条件に一致するオペレーターがいません</strong>
          <span>検索文字や絞り込み条件を変更してください。</span>
          <button type="button" className="button secondary" onClick={() => onFiltersChange({ ...EMPTY_OPERATOR_FILTERS })}>
            条件をリセット
          </button>
        </div>
      ) : (
        <OperatorTable
          rows={filteredOperators}
          onSelect={onSelect}
          actionLabel={actionLabel}
          selectedOperatorId={selectedOperatorId}
        />
      )}
    </section>
  )
}

export function matchesOperatorFilters(row: SkillRecord, filters: FilterState): boolean {
  const query = normalizeSearchText(filters.query)
  if (query && !normalizeSearchText(`${row.operatorName} ${row.skillName} ${row.description} ${row.skillId}`).includes(query)) return false
  if (filters.nameInitial !== 'ALL' && row.nameInitial !== filters.nameInitial) return false
  if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
  if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
  return true
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja')
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
