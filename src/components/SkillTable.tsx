import type { SkillCategory, SkillRecord } from '../types/skill'
import type { SkillOverrides } from '../lib/storage'

interface Props {
  rows: SkillRecord[]
  selectedId: string | null
  overrides: SkillOverrides
  onSelect: (row: SkillRecord) => void
}

export function SkillTable({ rows, selectedId, overrides, onSelect }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>オペレーター</th><th>Skill</th><th>分類</th><th>信頼度</th><th>時間</th><th>SP</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const category: SkillCategory = overrides[row.id] ?? row.category
            return (
              <tr key={row.id} className={selectedId === row.id ? 'selected' : ''} onClick={() => onSelect(row)}>
                <td><strong>{row.operatorName}</strong><small>★{row.rarity}</small></td>
                <td>S{row.skillIndex}<small>{row.skillName}</small></td>
                <td><span className="tag">{category}</span></td>
                <td><span className={`confidence ${row.confidence}`}>{row.confidence}</span></td>
                <td>{row.duration ?? '—'}</td>
                <td>{row.spType}<small>{row.spCost != null ? `cost ${row.spCost}` : ''}</small></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
