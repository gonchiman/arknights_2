import { useMemo } from 'react'
import { Filters, type FilterOption, type FilterState } from './Filters'
import { OperatorTable } from './OperatorTable'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type { SkillRecord } from '../types/skill'

export const EMPTY_OPERATOR_FILTERS: FilterState = {
  query: '',
  nameInitial: 'ALL',
  profession: 'ALL',
  subProfession: 'ALL',
  rarity: 'ALL',
  effectWindow: 'ALL',
  damageComponent: 'ALL',
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
}: Props) {
  const professionOptions = useMemo(() => sortProfessionOptions(uniqueOptions(rows.map((row) => ({
    value: row.profession,
    label: row.professionLabel,
  })))), [rows])

  const subProfessionOptions = useMemo(() => uniqueOptions(rows
    .filter((row) => filters.profession === 'ALL' || row.profession === filters.profession)
    .map((row) => ({ value: row.subProfessionId, label: row.subProfessionName }))), [rows, filters.profession])

  const filteredSkills = useMemo(() => rows.filter((row) => {
    const query = filters.query.trim().toLowerCase()
    if (query && !`${row.operatorName} ${row.skillName} ${row.description} ${row.skillId}`.toLowerCase().includes(query)) return false
    if (filters.nameInitial !== 'ALL' && row.nameInitial !== filters.nameInitial) return false
    if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
    if (filters.subProfession !== 'ALL' && row.subProfessionId !== filters.subProfession) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    if (filters.effectWindow !== 'ALL' && row.classification.effectWindow.value !== filters.effectWindow) return false
    if (filters.damageComponent !== 'ALL' && !row.classification.damageComponents.value.includes(filters.damageComponent)) return false
    return true
  }), [rows, filters])

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
        subProfessionOptions={subProfessionOptions}
        onChange={onFiltersChange}
        onReset={() => onFiltersChange({ ...EMPTY_OPERATOR_FILTERS })}
      />
      <div className="result-meta">
        <span>{loading ? '読み込み中...' : `${filteredOperators.length} 名表示`}</span>
        <span>{instruction}</span>
      </div>
      <OperatorTable rows={filteredOperators} onSelect={onSelect} actionLabel={actionLabel} />
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
