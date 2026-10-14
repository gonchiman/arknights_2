import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  DEFAULT_SKILL_COARSE_FILTERS,
  SKILL_COARSE_CATEGORY_LABELS,
  SKILL_COARSE_CATEGORY_OPTIONS,
  filterSkillCoarseRows,
  getSkillCoarseCategories,
  summarizeSkillCoarseCategories,
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

const TABS = [['skills', 'スキル一覧'], ['categories', '大分類一覧']] as const
type ListTab = typeof TABS[number][0]

export function SkillCoarseClassificationPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [filters, setFilters] = useState<SkillCoarseFilters>({ ...DEFAULT_SKILL_COARSE_FILTERS })
  const [activeTab, setActiveTab] = useState<ListTab>('skills')
  const tabIdPrefix = useId()
  const skillsTab = useRef<HTMLButtonElement>(null)
  const [detail, setDetail] = useState<{ skill: SkillRecord; trigger: HTMLButtonElement } | null>(null)
  const professionOptions = useMemo(() => {
    const labels = new Map(rows.map((row) => [row.profession, row.professionLabel]))
    return PROFESSION_ORDER.filter((profession) => labels.has(profession))
      .map((profession) => ({ value: profession, label: labels.get(profession) }))
  }, [rows])
  const baseRows = useMemo(() => filterSkillCoarseRows(rows, {
    query: filters.query, profession: filters.profession, rarity: filters.rarity, category: 'ALL',
  }), [rows, filters.query, filters.profession, filters.rarity])
  const visibleRows = useMemo(() => {
    const category = filters.category
    return category === 'ALL' ? baseRows
      : baseRows.filter((row) => getSkillCoarseCategories(row).includes(category))
  }, [baseRows, filters.category])
  const categoryRows = useMemo(() => summarizeSkillCoarseCategories(baseRows), [baseRows])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.category !== 'ALL'

  const closeDescription = () => {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    })
  }

  const selectCategory = (category: SkillCoarseCategory | 'ALL') => {
    setFilters((current) => ({ ...current, category }))
    setActiveTab('skills')
    window.requestAnimationFrame(() => skillsTab.current?.focus({ preventScroll: true }))
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const [nextTab] = TABS[nextIndex]
    setActiveTab(nextTab)
    window.requestAnimationFrame(() => document.getElementById(`${tabIdPrefix}-tab-${nextTab}`)?.focus({ preventScroll: true }))
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
        <div className="detail-tabs skill-coarse-tabs" role="tablist" aria-label="表示する一覧">
          {TABS.map(([tab, label], index) => (
            <button type="button" key={tab} id={`${tabIdPrefix}-tab-${tab}`}
              ref={tab === 'skills' ? skillsTab : undefined}
              className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
              role="tab" aria-selected={activeTab === tab} aria-controls={`${tabIdPrefix}-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}>{label}</button>
          ))}
        </div>
        <div id={`${tabIdPrefix}-panel-skills`} role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-tab-skills`} hidden={activeTab !== 'skills'}>
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
        </div>
        <div id={`${tabIdPrefix}-panel-categories`} role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-tab-categories`} hidden={activeTab !== 'categories'}>
          <div className="result-meta skill-coarse-overview-meta" role="status" aria-live="polite">
            <span>{loading ? '読み込み中…' : `対象：${baseRows.length} スキル`}</span>
            <button type="button" className="filter-reset-button" disabled={filters.category === 'ALL'}
              onClick={() => selectCategory('ALL')}>すべて</button>
          </div>
          <div className="table-wrap skill-coarse-table-wrap">
            <table className="skill-coarse-table skill-coarse-category-table">
              <caption className="visually-hidden">大分類の基準と該当スキル数</caption>
              <thead><tr>
                <th scope="col">大分類名</th>
                <th scope="col">分類の基準</th>
                <th scope="col" className="skill-coarse-count">該当スキル数</th>
              </tr></thead>
              <tbody>{categoryRows.map(({ value, label, description, count }) => (
                <tr key={value} className={filters.category === value ? 'skill-coarse-category-selected' : undefined}>
                  <td><button type="button" className="skill-coarse-description-trigger"
                    aria-pressed={filters.category === value} onClick={() => selectCategory(value)}>{label}</button></td>
                  <td>{description}</td>
                  <td className="skill-coarse-count">{loading ? '—' : count.toLocaleString('ja-JP')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <details className="skill-coarse-count-help">
            <summary>件数の数え方</summary>
            <p>文字検索・職業・レアリティに一致するスキルを集計します。複数の分類に該当するスキルは、それぞれに１件ずつ数えます。大分類候補の選択は件数に反映しません。</p>
          </details>
        </div>
      </section>
      {detail && <SkillEffectModal skill={detail.skill} descriptionOnly onClose={closeDescription} />}
    </section>
  )
}
