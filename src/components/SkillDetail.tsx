import type { SkillRecord } from '../types/skill'

export function SkillDetail({ skill }: { skill: SkillRecord | null }) {
  if (!skill) return <aside className="detail-pane"><p className="empty-state">スキルを選択してください。</p></aside>

  return (
    <aside className="detail-pane">
      <p className="eyebrow">{skill.operatorName} · S{skill.skillIndex} · ★{skill.rarity}</p>
      <h2>{skill.skillName}</h2>
      <p className="description">{skill.description || '説明文なし'}</p>

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
