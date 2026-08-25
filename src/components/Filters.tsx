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
}

export function Filters({ value, professionOptions, subProfessionOptions, onChange }: Props) {
  return (
    <div className="filters">
      <input
        className="search"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
        placeholder="オペレーター名・スキル名・説明文で検索"
      />
      <select value={value.nameInitial} onChange={(event) => onChange({ ...value, nameInitial: event.target.value as OperatorInitial | 'ALL' })}>
        <option value="ALL">頭文字: すべて</option>
        {OPERATOR_INITIALS.map((initial) => <option key={initial} value={initial}>{OPERATOR_INITIAL_LABELS[initial]}</option>)}
      </select>
      <select
        value={value.profession}
        onChange={(event) => onChange({ ...value, profession: event.target.value, subProfession: 'ALL' })}
      >
        <option value="ALL">職業: すべて</option>
        {professionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
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
