import type { SkillCategory, SkillRecord } from '../types/skill'
import type { SkillOverrides } from '../lib/storage'

const categories: SkillCategory[] = ['持続', '弾薬', '永続', '通常攻撃強化', '一撃必殺', '持続＋一撃必殺', '条件分岐', 'その他', '要確認']

interface Props {
  skill: SkillRecord | null
  overrides: SkillOverrides
  onOverride: (id: string, category: SkillCategory | null) => void
}

export function SkillDetail({ skill, overrides, onOverride }: Props) {
  if (!skill) return <aside className="detail-pane"><p className="empty-state">スキルを選択してください。</p></aside>

  const current = overrides[skill.id] ?? skill.category
  return (
    <aside className="detail-pane">
      <p className="eyebrow">{skill.operatorName} · S{skill.skillIndex}</p>
      <h2>{skill.skillName}</h2>
      <p className="description">{skill.description || '説明文なし'}</p>

      <section className="detail-section">
        <h3>分類</h3>
        <select value={current} onChange={(event) => onOverride(skill.id, event.target.value as SkillCategory)}>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        {overrides[skill.id] && <button className="text-button" onClick={() => onOverride(skill.id, null)}>手動修正を解除</button>}
      </section>

      <section className="detail-section">
        <h3>自動判定</h3>
        <dl>
          <div><dt>分類</dt><dd>{skill.category}</dd></div>
          <div><dt>信頼度</dt><dd>{skill.confidence}</dd></div>
          <div><dt>duration</dt><dd>{skill.duration ?? 'null'}</dd></div>
          <div><dt>durationType</dt><dd>{skill.durationType}</dd></div>
          <div><dt>skillType</dt><dd>{skill.skillType}</dd></div>
          <div><dt>spType</dt><dd>{skill.spType}</dd></div>
        </dl>
        <ul>{skill.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>

      <details className="raw-json">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(skill.raw, null, 2)}</pre>
      </details>
    </aside>
  )
}
