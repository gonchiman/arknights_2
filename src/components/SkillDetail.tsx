import { SKILL_EFFECT_OPTIONS, SKILL_OUTPUT_MODE_LABELS } from '../lib/classifier'
import type { SkillEffectType, SkillRecord } from '../types/skill'

interface Props {
  skill: SkillRecord | null
  onOverride: (type: SkillEffectType | null) => void
}

export function SkillDetail({ skill, onOverride }: Props) {
  if (!skill) return <aside className="detail-pane"><p className="empty-state">スキルを選択してください。</p></aside>

  return (
    <aside className="detail-pane">
      <p className="eyebrow">{skill.operatorName} · S{skill.skillIndex} · ★{skill.rarity}</p>
      <h2>{skill.skillName}</h2>
      <p className="description">{skill.description || '説明文なし'}</p>

      <section className="classification-card">
        <div>
          <span className="tag">{skill.classification.label}</span>
          <span className={`confidence ${skill.classification.confidence.toLowerCase()}`}>
            {skill.classification.source === 'MANUAL' ? 'manual' : skill.classification.confidence.toLowerCase()}
          </span>
        </div>
        <strong>{SKILL_OUTPUT_MODE_LABELS[skill.classification.outputMode]}</strong>
        <ul>
          {skill.classification.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <label>
          手動で分類を修正
          <select value={skill.classification.type} onChange={(event) => onOverride(event.target.value as SkillEffectType)}>
            {SKILL_EFFECT_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
        {skill.classification.source === 'MANUAL' && (
          <button className="text-button" onClick={() => onOverride(null)}>自動判定に戻す</button>
        )}
      </section>

      <section className="detail-section">
        <h3>スキル情報</h3>
        <dl>
          <div><dt>skillId</dt><dd>{skill.skillId}</dd></div>
          <div><dt>duration</dt><dd>{skill.duration ?? 'null'}</dd></div>
          <div><dt>durationType</dt><dd>{skill.durationType}</dd></div>
          <div><dt>skillType</dt><dd>{skill.skillType}</dd></div>
          <div><dt>spType</dt><dd>{skill.spType}</dd></div>
          <div><dt>initSp</dt><dd>{skill.initSp ?? 'null'}</dd></div>
          <div><dt>spCost</dt><dd>{skill.spCost ?? 'null'}</dd></div>
        </dl>
      </section>

      <details className="raw-json">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(skill.raw, null, 2)}</pre>
      </details>
    </aside>
  )
}
