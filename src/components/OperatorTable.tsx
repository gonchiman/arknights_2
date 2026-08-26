import type { SkillRecord } from '../types/skill'

interface Props {
  rows: SkillRecord[]
  onSelect: (row: SkillRecord) => void
}

export function OperatorTable({ rows, onSelect }: Props) {
  return (
    <div className="table-wrap operator-table">
      <table>
        <thead>
          <tr>
            <th>オペレーター</th>
            <th>レアリティ</th>
            <th>職業</th>
            <th>職分</th>
            <th aria-label="詳細画面" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.operatorId}
              tabIndex={0}
              aria-label={`${row.operatorName}の詳細を開く`}
              onClick={() => onSelect(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(row)
              }}
            >
              <td><strong>{row.operatorName}</strong></td>
              <td>★{row.rarity}</td>
              <td>{row.professionLabel}</td>
              <td>{row.subProfessionName}</td>
              <td className="detail-link-cell">詳細を見る →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
