import type { Confidence, SkillCategory } from '../types/skill'

export interface FilterState {
  query: string
  category: SkillCategory | 'ALL'
  rarity: number | 'ALL'
  confidence: Confidence | 'ALL'
}

interface Props {
  value: FilterState
  categories: SkillCategory[]
  onChange: (next: FilterState) => void
}

export function Filters({ value, categories, onChange }: Props) {
  return (
    <div className="filters">
      <input
        className="search"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
        placeholder="オペレーター名・スキル名・説明文で検索"
      />
      <select value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value as FilterState['category'] })}>
        <option value="ALL">分類: すべて</option>
        {categories.map((category) => <option key={category}>{category}</option>)}
      </select>
      <select value={value.rarity} onChange={(event) => onChange({ ...value, rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value) })}>
        <option value="ALL">レアリティ: すべて</option>
        {[6, 5, 4, 3, 2, 1].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
      </select>
      <select value={value.confidence} onChange={(event) => onChange({ ...value, confidence: event.target.value as FilterState['confidence'] })}>
        <option value="ALL">信頼度: すべて</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
    </div>
  )
}
