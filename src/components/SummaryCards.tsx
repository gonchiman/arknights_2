import type { SkillRecord } from '../types/skill'

export function SummaryCards({ rows }: { rows: SkillRecord[] }) {
  const low = rows.filter((row) => row.confidence === 'low').length
  const categories = new Set(rows.map((row) => row.category)).size
  const operators = new Set(rows.map((row) => row.operatorId)).size

  return (
    <section className="summary-grid">
      <article className="summary-card"><span>スキル</span><strong>{rows.length}</strong></article>
      <article className="summary-card"><span>オペレーター</span><strong>{operators}</strong></article>
      <article className="summary-card"><span>分類</span><strong>{categories}</strong></article>
      <article className="summary-card"><span>要レビュー</span><strong>{low}</strong></article>
    </section>
  )
}
