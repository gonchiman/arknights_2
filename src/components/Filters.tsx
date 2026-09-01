import { getProfessionColor, OPERATOR_INITIAL_LABELS } from '../lib/operatorFilters'
import type { FilterState } from '../lib/operatorSearchFilters'
import { OPERATOR_INITIALS } from '../types/skill'
import type { CSSProperties } from 'react'

export type { FilterState } from '../lib/operatorSearchFilters'

const RARITIES = [6, 5, 4, 3, 2, 1] as const

export interface FilterOption {
  value: string
  label: string
}

interface Props {
  value: FilterState
  professionOptions: FilterOption[]
  subProfessionOptions?: FilterOption[]
  onChange: (next: FilterState) => void
  onReset: () => void
  searchPlaceholder?: string
}

export function Filters({
  value,
  professionOptions,
  subProfessionOptions,
  onChange,
  onReset,
  searchPlaceholder = 'オペレーター名・スキル名・説明文で検索',
}: Props) {
  const hasActiveFilters = value.query.trim() !== ''
    || value.nameInitial !== 'ALL'
    || value.profession !== 'ALL'
    || value.subProfession !== 'ALL'
    || value.rarity !== 'ALL'

  const changeProfession = (profession: string | 'ALL') => onChange({
    ...value,
    profession,
    subProfession: profession === value.profession ? value.subProfession : 'ALL',
  })

  return (
    <div className="filters">
      <div className="filters-heading">
        <span>検索条件</span>
        <button
          type="button"
          className="filter-reset-button"
          disabled={!hasActiveFilters}
          onClick={onReset}
        >
          条件をリセット
        </button>
      </div>
      <div className="initial-filter" role="group" aria-label="オペレーター名の頭文字">
        <span className="initial-filter-label">頭文字</span>
        <button
          type="button"
          className={`initial-button ${value.nameInitial === 'ALL' ? 'active' : ''}`}
          aria-pressed={value.nameInitial === 'ALL'}
          onClick={() => onChange({ ...value, nameInitial: 'ALL' })}
        >
          すべて
        </button>
        {OPERATOR_INITIALS.map((initial) => (
          <button
            type="button"
            className={`initial-button ${value.nameInitial === initial ? 'active' : ''}`}
            aria-pressed={value.nameInitial === initial}
            onClick={() => onChange({ ...value, nameInitial: initial })}
            key={initial}
          >
            {OPERATOR_INITIAL_LABELS[initial]}
          </button>
        ))}
      </div>
      <div className="initial-filter profession-filter" role="group" aria-label="職業">
        <span className="initial-filter-label">職業</span>
        <button
          type="button"
          className={`initial-button ${value.profession === 'ALL' ? 'active' : ''}`}
          aria-pressed={value.profession === 'ALL'}
          onClick={() => changeProfession('ALL')}
        >
          すべて
        </button>
        {professionOptions.map((option) => (
          <button
            type="button"
            className={`initial-button profession-button ${value.profession === option.value ? 'active' : ''}`}
            aria-pressed={value.profession === option.value}
            onClick={() => changeProfession(option.value)}
            style={getProfessionButtonStyle(option.value)}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      {subProfessionOptions && (
        <div
          className="initial-filter subprofession-filter"
          role={value.profession === 'ALL' ? undefined : 'group'}
          aria-label={value.profession === 'ALL' ? undefined : '職分'}
        >
          <span className="initial-filter-label">職分</span>
          {value.profession === 'ALL' ? (
            <span className="subprofession-filter-hint">職業を選択すると職分を選べます</span>
          ) : (
            <>
              <button
                type="button"
                className={`initial-button ${value.subProfession === 'ALL' ? 'active' : ''}`}
                aria-pressed={value.subProfession === 'ALL'}
                onClick={() => onChange({ ...value, subProfession: 'ALL' })}
              >
                すべて
              </button>
              {subProfessionOptions.map((option) => (
                <button
                  type="button"
                  className={`initial-button ${value.subProfession === option.value ? 'active' : ''}`}
                  aria-pressed={value.subProfession === option.value}
                  onClick={() => onChange({ ...value, subProfession: option.value })}
                  key={option.value}
                >
                  {option.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <div className="initial-filter rarity-filter" role="group" aria-label="レアリティ">
        <span className="initial-filter-label">レアリティ</span>
        <button
          type="button"
          className={`initial-button ${value.rarity === 'ALL' ? 'active' : ''}`}
          aria-pressed={value.rarity === 'ALL'}
          onClick={() => onChange({ ...value, rarity: 'ALL' })}
        >
          すべて
        </button>
        {RARITIES.map((rarity) => (
          <button
            type="button"
            className={`initial-button ${value.rarity === rarity ? 'active' : ''}`}
            aria-pressed={value.rarity === rarity}
            onClick={() => onChange({ ...value, rarity })}
            key={rarity}
          >
            ★{rarity}
          </button>
        ))}
      </div>
      <label className="search-filter">
        <span className="initial-filter-label">文字検索</span>
        <input
          className="search"
          value={value.query}
          onChange={(event) => onChange({ ...value, query: event.target.value })}
          placeholder={searchPlaceholder}
        />
      </label>
    </div>
  )
}

function getProfessionButtonStyle(profession: string): CSSProperties | undefined {
  const color = getProfessionColor(profession)
  if (!color) return undefined
  return {
    '--profession-color': color.main,
  } as CSSProperties
}
