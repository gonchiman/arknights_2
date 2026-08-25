import { SKILL_EFFECT_OPTIONS } from '../lib/classifier'
import type { SkillEffectType } from '../types/skill'

export interface FilterState {
  query: string
  rarity: number | 'ALL'
  effectType: SkillEffectType | 'ALL'
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
      <select value={value.effectType} onChange={(event) => onChange({ ...value, effectType: event.target.value as SkillEffectType | 'ALL' })}>
        <option value="ALL">効果タイプ: すべて</option>
        {SKILL_EFFECT_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
    </div>
  )
}
