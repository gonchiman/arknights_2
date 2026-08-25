import type { SkillRecord } from '../types/skill'

export function SummaryCards({ rows }: { rows: SkillRecord[] }) {
  const operators = new Set(rows.map((row) => row.operatorId)).size
  const dpsSkills = rows.filter((row) => row.classification.outputMode === 'SKILL_DPS').length
  const reviewSkills = rows.filter((row) => row.classification.type === 'UNKNOWN').length

  return (
    <section className="summary-grid">
      <article className="summary-card"><span>スキル</span><strong>{rows.length}</strong></article>
      <article className="summary-card"><span>オペレーター</span><strong>{operators}</strong></article>
      <article className="summary-card"><span>スキルDPS対象</span><strong>{dpsSkills}</strong></article>
      <article className="summary-card"><span>要確認</span><strong>{reviewSkills}</strong></article>
    </section>
  )
}
