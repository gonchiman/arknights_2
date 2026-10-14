import { useMemo, useState } from 'react'
import {
  DEFAULT_SKILL_COARSE_FILTERS,
  SKILL_COARSE_CATEGORY_LABELS,
  SKILL_COARSE_CATEGORY_OPTIONS,
  filterSkillCoarseRows,
  getSkillCoarseCategories,
  type SkillCoarseCategory,
  type SkillCoarseFilters,
} from '../lib/skillCoarseClassification'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type { SkillRecord } from '../types/skill'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { SkillEffectModal } from './SkillEffectModal'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

const EMPTY_FILTERS: SkillCoarseFilters = {
  query: '', profession: 'ALL', rarity: 'ALL', category: 'ALL',
}

export function SkillCoarseClassificationPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [filters, setFilters] = useState<SkillCoarseFilters>({ ...DEFAULT_SKILL_COARSE_FILTERS })
  const [detail, setDetail] = useState<{ skill: SkillRecord; trigger: HTMLButtonElement } | null>(null)
  const professionOptions = useMemo(() => {
    const labels = new Map(rows.map((row) => [row.profession, row.professionLabel]))
    return PROFESSION_ORDER.filter((profession) => labels.has(profession))
      .map((profession) => ({ value: profession, label: labels.get(profession) }))
  }, [rows])
  const visibleRows = useMemo(() => filterSkillCoarseRows(rows, filters), [rows, filters])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.category !== 'ALL'

  const closeDescription = () => {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    })
  }

  return (
    <section className="skill-coarse-page">
      <header className="page-intro"><h1>スキル大分類</h1></header>
      <section className="skill-directory-panel" aria-label="スキル大分類の一覧">
        <div className="skill-directory-filters">
          <div className="filters-heading">
            <span>絞り込み</span>
            <button type="button" className="filter-reset-button" disabled={!hasFilters}
              onClick={() => setFilters({ ...EMPTY_FILTERS })}>条件をリセット</button>
          </div>
          <div className="skill-directory-filter-grid skill-coarse-filters">
            <label className="skill-directory-search">
              <span>文字検索</span>
              <input type="search" value={filters.query} placeholder="オペレーター名・スキル名・原文"
                onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
            </label>
            <label>
              <span>職業</span>
              <select value={filters.profession}
                onChange={(event) => setFilters({ ...filters, profession: event.target.value })}>
                <option value="ALL">すべて</option>
                {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>レアリティ</span>
              <select value={filters.rarity} onChange={(event) => setFilters({
                ...filters, rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
              })}>
                <option value="ALL">すべて</option>
                {[6, 5, 4, 3, 2, 1].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
              </select>
            </label>
            <label>
              <span>大分類候補</span>
              <select value={filters.category} onChange={(event) => setFilters({
                ...filters, category: event.target.value as SkillCoarseCategory | 'ALL',
              })}>
                <option value="ALL">すべて</option>
                {SKILL_COARSE_CATEGORY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="result-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中…' : `${visibleRows.length} / ${rows.length} スキル表示`}</span>
          <span>最高レベル</span>
        </div>
        {!loading && visibleRows.length === 0 ? (
          <div className="operator-empty-state" role="status">条件に一致するスキルがありません</div>
        ) : (
          <div className="table-wrap skill-coarse-table-wrap">
            <table className="skill-coarse-table">
              <caption className="visually-hidden">スキル大分類の検索結果</caption>
              <thead><tr>
                <th scope="col">オペレーター</th>
                <th scope="col">S番号</th>
                <th scope="col">スキル名</th>
                <th scope="col">大分類候補</th>
              </tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td><OperatorDetailLink operatorId={row.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
                      className="skill-coarse-link">{row.operatorName}</OperatorDetailLink></td>
                    <td className="skill-coarse-number">S{row.skillIndex}</td>
                    <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
                      aria-label={`${row.operatorName} S${row.skillIndex} ${row.skillName}の原文を表示`}
                      onClick={(event) => setDetail({ skill: row, trigger: event.currentTarget })}>{row.skillName}</button></td>
                    <td>{getSkillCoarseCategories(row).map((category) => SKILL_COARSE_CATEGORY_LABELS[category]).join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {detail && <SkillEffectModal skill={detail.skill} descriptionOnly onClose={closeDescription} />}
    </section>
  )
}
