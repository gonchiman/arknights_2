import type { SkillRecord } from '../types/skill'

export function SummaryCards({ rows }: { rows: SkillRecord[] }) {
  const operators = new Set(rows.map((row) => row.operatorId)).size
  const sixStars = new Set(rows.filter((row) => row.rarity === 6).map((row) => row.operatorId)).size

  return (
    <section className="summary-grid">
      <article className="summary-card"><span>スキル</span><strong>{rows.length}</strong></article>
      <article className="summary-card"><span>オペレーター</span><strong>{operators}</strong></article>
      <article className="summary-card"><span>★6オペレーター</span><strong>{sixStars}</strong></article>
    </section>
  )
}
