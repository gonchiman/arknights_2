import type { ReactNode } from 'react'
import { hasActiveOperatorDatabaseFilters, type OperatorDatabaseFilters } from '../lib/operatorDatabase'
import { OPERATOR_INITIAL_LABELS } from '../lib/operatorFilters'
import { OPERATOR_INITIALS } from '../types/skill'
import { Filters, type FilterOption } from './Filters'
import './OperatorFilterPanel.css'

interface Props {
  value: OperatorDatabaseFilters
  professionOptions: FilterOption[]
  onChange: (value: OperatorDatabaseFilters) => void
  onReset: () => void
  sharedSettings?: ReactNode
  inline?: boolean
  label?: string
  subProfessionOptions?: FilterOption[]
  showNameInitial?: boolean
  showSearch?: boolean
  headingLabel?: string | null
}

const RARITIES = [6, 5, 4, 3, 2, 1] as const

export function OperatorFilterPanel({
  value, professionOptions, onChange, onReset, sharedSettings,
  inline = false, label = '一覧のオペレーター絞り込み',
  subProfessionOptions, showNameInitial = true, showSearch = true,
  headingLabel,
}: Props) {
  const changeInitial = (next: string) => {
    const nameInitial = next === 'ALL' ? 'ALL' : OPERATOR_INITIALS.find((initial) => initial === next)
    if (nameInitial === undefined) return
    onChange({ ...value, nameInitial })
  }

  const changeProfession = (next: string) => {
    const profession = next === 'ALL' ? 'ALL' : professionOptions.find((option) => option.value === next)?.value
    if (profession === undefined) return
    onChange({
      ...value,
      profession,
      subProfession: profession === value.profession ? value.subProfession : 'ALL',
    })
  }

  const changeRarity = (next: string) => {
    const rarity = next === 'ALL' ? 'ALL' : RARITIES.find((candidate) => String(candidate) === next)
    if (rarity === undefined) return
    onChange({ ...value, rarity })
  }

  if (inline) {
    return (
      <div className="operator-filter-inline" role="region" aria-label={label}>
        <Filters
          value={value}
          professionOptions={professionOptions}
          subProfessionOptions={subProfessionOptions}
          showNameInitial={showNameInitial}
          showSearch={showSearch}
          headingLabel={headingLabel}
          onChange={onChange}
          onReset={onReset}
          searchPlaceholder="名前・職分・潜在能力・素質・スキル・モジュールで検索"
        />
        {sharedSettings}
      </div>
    )
  }

  return (
    <div
      className="damage-build-navigation operator-filter-compact"
      role="region"
      aria-label="オペレーターの絞り込み・統計設定"
    >
      <input
        className="operator-filter-query"
        type="search"
        aria-label="検索"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
        placeholder="名前・職分・潜在能力・素質・スキル・モジュールで検索"
      />

      <label className="operator-filter-select">
        <span>頭文字</span>
        <select value={value.nameInitial} onChange={(event) => changeInitial(event.target.value)}>
          <option value="ALL">すべて</option>
          {OPERATOR_INITIALS.map((initial) => (
            <option value={initial} key={initial}>{OPERATOR_INITIAL_LABELS[initial]}</option>
          ))}
        </select>
      </label>

      <label className="operator-filter-select">
        <span>職業</span>
        <select value={value.profession} onChange={(event) => changeProfession(event.target.value)}>
          <option value="ALL">すべて</option>
          {professionOptions.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="operator-filter-select">
        <span>レアリティ</span>
        <select value={value.rarity} onChange={(event) => changeRarity(event.target.value)}>
          <option value="ALL">すべて</option>
          {RARITIES.map((rarity) => (
            <option value={rarity} key={rarity}>★{rarity}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="button secondary operator-filter-reset"
        disabled={!hasActiveOperatorDatabaseFilters(value)}
        onClick={onReset}
      >
        条件をリセット
      </button>
      {sharedSettings}
    </div>
  )
}
