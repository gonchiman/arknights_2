export interface FilterState {
  query: string
  rarity: number | 'ALL'
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
    </div>
  )
}
