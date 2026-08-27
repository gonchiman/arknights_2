import type { SkillRecord } from '../types/skill'

interface Props {
  rows: SkillRecord[]
  onSelect: (row: SkillRecord) => void
  actionLabel?: string
}

export function OperatorTable({ rows, onSelect, actionLabel = '詳細を見る →' }: Props) {
  const isSelectionTable = actionLabel.startsWith('選択')

  return (
    <div className="table-wrap operator-table">
      <table>
        <thead>
          <tr>
            <th>オペレーター</th>
            <th>レアリティ</th>
            <th>職業</th>
            <th>職分</th>
            <th aria-label={isSelectionTable ? '選択' : '詳細画面'} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.operatorId}
              tabIndex={0}
              aria-label={`${row.operatorName}を${isSelectionTable ? '選択' : '開く'}`}
              onClick={() => onSelect(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(row)
              }}
            >
              <td><span className="operator-name">{row.operatorName}</span></td>
              <td>★{row.rarity}</td>
              <td>{row.professionLabel}</td>
              <td>{row.subProfessionName}</td>
              <td className="detail-link-cell">{actionLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
