import {
  ACTIVATION_TRIGGER_LABELS,
  DAMAGE_COMPONENT_LABELS,
  EFFECT_WINDOW_LABELS,
  getOutputCapabilityLabels,
} from '../lib/classifier'
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
            <th>終了条件</th>
            <th>発動契機</th>
            <th>ダメージ構成</th>
            <th>出力可否</th>
            <th>duration</th>
            <th>必要SP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outputs = getOutputCapabilityLabels(row.classification.outputCapabilities)
            return (
              <tr key={row.id} className={selectedId === row.id ? 'selected' : ''} onClick={() => onSelect(row)}>
                <td>
                  <strong>{row.operatorName}</strong>
                  <small>★{row.rarity} · {row.professionLabel} / {row.subProfessionName}</small>
                </td>
                <td>S{row.skillIndex}<small>{row.skillName}</small></td>
                <td>
                  <span className="tag">{EFFECT_WINDOW_LABELS[row.classification.effectWindow.value]}</span>
                  <Confidence field={row.classification.effectWindow} />
                </td>
                <td>
                  <span className="tag">{ACTIVATION_TRIGGER_LABELS[row.classification.activationTrigger.value]}</span>
                  <Confidence field={row.classification.activationTrigger} />
                </td>
                <td>
                  <div className="tag-list compact">
                    {row.classification.damageComponents.value.map((component) => (
                      <span className="tag" key={component}>{DAMAGE_COMPONENT_LABELS[component]}</span>
                    ))}
                  </div>
                </td>
                <td>{outputs.length ? outputs.join(' / ') : '直接出力なし'}</td>
                <td>{row.duration ?? '—'}</td>
                <td>{row.spCost ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Confidence({ field }: { field: { confidence: string; source: string } }) {
  return (
    <small className={`confidence ${field.confidence.toLowerCase()}`}>
      {field.source === 'MANUAL' ? 'manual' : field.confidence.toLowerCase()}
    </small>
  )
}
