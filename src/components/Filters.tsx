import {
  DAMAGE_COMPONENT_OPTIONS,
  EFFECT_WINDOW_OPTIONS,
} from '../lib/classifier'
import type { DamageComponentType, EffectWindowType } from '../types/skill'

export interface FilterState {
  query: string
  rarity: number | 'ALL'
  effectWindow: EffectWindowType | 'ALL'
  damageComponent: DamageComponentType | 'ALL'
}

interface Props {
  value: FilterState
  onChange: (next: FilterState) => void
}

export function Filters({ value, onChange }: Props) {
  return (
    <div className="filters">
      <input
        className="search"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
        placeholder="オペレーター名・スキル名・説明文で検索"
      />
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
