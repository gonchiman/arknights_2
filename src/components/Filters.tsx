import {
  DAMAGE_COMPONENT_OPTIONS,
  EFFECT_WINDOW_OPTIONS,
} from '../lib/classifier'
import { OPERATOR_INITIAL_LABELS } from '../lib/operatorFilters'
import { OPERATOR_INITIALS } from '../types/skill'
import type { DamageComponentType, EffectWindowType, OperatorInitial } from '../types/skill'

export interface FilterState {
  query: string
  nameInitial: OperatorInitial | 'ALL'
  profession: string | 'ALL'
  subProfession: string | 'ALL'
  rarity: number | 'ALL'
  effectWindow: EffectWindowType | 'ALL'
  damageComponent: DamageComponentType | 'ALL'
}

export interface FilterOption {
  value: string
  label: string
}

interface Props {
  value: FilterState
  professionOptions: FilterOption[]
  subProfessionOptions: FilterOption[]
  onChange: (next: FilterState) => void
  onReset: () => void
}

export function Filters({ value, professionOptions, subProfessionOptions, onChange, onReset }: Props) {
  const hasActiveFilters = value.query !== ''
    || value.nameInitial !== 'ALL'
    || value.profession !== 'ALL'
    || value.subProfession !== 'ALL'
    || value.rarity !== 'ALL'
    || value.effectWindow !== 'ALL'
    || value.damageComponent !== 'ALL'

  return (
    <div className="filters">
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
        <button
          type="button"
          className="filter-reset-button"
          disabled={!hasActiveFilters}
          onClick={onReset}
        >
          条件をリセット
        </button>
      </div>
      <div className="initial-filter profession-filter" role="group" aria-label="職業">
        <span className="initial-filter-label">職業</span>
        <button
          type="button"
          className={`initial-button ${value.profession === 'ALL' ? 'active' : ''}`}
          aria-pressed={value.profession === 'ALL'}
          onClick={() => onChange({ ...value, profession: 'ALL', subProfession: 'ALL' })}
        >
          すべて
        </button>
        {professionOptions.map((option) => (
          <button
            type="button"
            className={`initial-button ${value.profession === option.value ? 'active' : ''}`}
            aria-pressed={value.profession === option.value}
            onClick={() => onChange({ ...value, profession: option.value, subProfession: 'ALL' })}
            key={option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      <input
        className="search"
        aria-label="オペレーター検索"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
        placeholder="オペレーター名・スキル名・説明文で検索"
      />
      <select value={value.subProfession} onChange={(event) => onChange({ ...value, subProfession: event.target.value })}>
        <option value="ALL">職分: すべて</option>
        {subProfessionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select value={value.rarity} onChange={(event) => onChange({ ...value, rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value) })}>
        <option value="ALL">レアリティ: すべて</option>
        {[6, 5, 4, 3, 2, 1].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
      </select>
      <select value={value.effectWindow} onChange={(event) => onChange({ ...value, effectWindow: event.target.value as EffectWindowType | 'ALL' })}>
        <option value="ALL">終了条件: すべて</option>
        {EFFECT_WINDOW_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
      <select value={value.damageComponent} onChange={(event) => onChange({ ...value, damageComponent: event.target.value as DamageComponentType | 'ALL' })}>
        <option value="ALL">ダメージ構成: すべて</option>
        {DAMAGE_COMPONENT_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
    </div>
  )
}
