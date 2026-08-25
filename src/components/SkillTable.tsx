import { SKILL_OUTPUT_MODE_LABELS } from '../lib/classifier'
import type { SkillRecord } from '../types/skill'

interface Props {
  rows: SkillRecord[]
  selectedId: string | null
  onSelect: (row: SkillRecord) => void
}

export function SkillTable({ rows, selectedId, onSelect }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>オペレーター</th>
            <th>Skill</th>
            <th>効果タイプ</th>
            <th>計算機出力</th>
            <th>duration</th>
            <th>durationType</th>
            <th>SP回復</th>
            <th>必要SP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={selectedId === row.id ? 'selected' : ''} onClick={() => onSelect(row)}>
              <td><strong>{row.operatorName}</strong><small>★{row.rarity}</small></td>
              <td>S{row.skillIndex}<small>{row.skillName}</small></td>
              <td>
                <span className="tag">{row.classification.label}</span>
                <small className={`confidence ${row.classification.confidence.toLowerCase()}`}>
                  {row.classification.source === 'MANUAL' ? 'manual' : row.classification.confidence.toLowerCase()}
                </small>
              </td>
              <td>{SKILL_OUTPUT_MODE_LABELS[row.classification.outputMode]}</td>
              <td>{row.duration ?? '—'}</td>
              <td>{row.durationType}</td>
              <td>{row.spType}</td>
              <td>{row.spCost ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
