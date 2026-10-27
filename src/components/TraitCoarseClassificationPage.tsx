import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  buildTraitCoarseRecords, DEFAULT_TRAIT_COARSE_FILTERS, TRAIT_COARSE_CATEGORY_LABELS,
  TRAIT_COARSE_CATEGORY_OPTIONS, filterTraitCoarseRows, getTraitCoarseCategories,
  summarizeTraitCoarseCategories, type TraitCoarseCategory, type TraitCoarseFilters,
  type TraitCoarseRecord,
} from '../lib/traitCoarseClassification'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type { SkillRecord } from '../types/skill'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './TraitCoarseClassificationPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

const EMPTY_FILTERS: TraitCoarseFilters = { query: '', profession: 'ALL', rarity: 'ALL', category: 'ALL' }
const TABS = [['traits', '特性一覧'], ['categories', '大分類一覧']] as const
type ListTab = typeof TABS[number][0]
const operatorCount = (rows: TraitCoarseRecord[]) => new Set(rows.flatMap(row => row.operators.map(op => op.operatorId))).size

export function TraitCoarseClassificationPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [filters, setFilters] = useState<TraitCoarseFilters>({ ...DEFAULT_TRAIT_COARSE_FILTERS })
  const [activeTab, setActiveTab] = useState<ListTab>('traits')
  const [detail, setDetail] = useState<TraitCoarseRecord | null>(null)
  const tabIdPrefix = useId()
  const traitsTab = useRef<HTMLButtonElement>(null)
  const traits = useMemo(() => buildTraitCoarseRecords(rows), [rows])
  const professionOptions = useMemo(() => {
    const labels = new Map(traits.map(row => [row.profession, row.professionLabel]))
    return PROFESSION_ORDER.filter(value => labels.has(value)).map(value => ({ value, label: labels.get(value) }))
  }, [traits])
  const rarityOptions = useMemo(() => [...new Set(traits.flatMap(row => row.operators.map(op => op.rarity)))].sort((a, b) => b - a), [traits])
  const baseRows = useMemo(() => filterTraitCoarseRows(traits, { ...filters, category: 'ALL' }),
    [traits, filters.query, filters.profession, filters.rarity])
  const visibleRows = useMemo(() => filters.category === 'ALL' ? baseRows
    : baseRows.filter(row => getTraitCoarseCategories(row).includes(filters.category as TraitCoarseCategory)), [baseRows, filters.category])
  const categoryRows = useMemo(() => summarizeTraitCoarseCategories(baseRows), [baseRows])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.category !== 'ALL'

  const selectCategory = (category: TraitCoarseCategory | 'ALL') => {
    setFilters(current => ({ ...current, category }))
    setActiveTab('traits')
    window.requestAnimationFrame(() => traitsTab.current?.focus({ preventScroll: true }))
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

  return <section className="skill-coarse-page trait-coarse-page">
    <header className="page-intro"><h1>特性大分類</h1></header>
    <section className="skill-directory-panel" aria-label="特性大分類の一覧">
      <div className="skill-directory-filters">
        <div className="filters-heading">
          <span>絞り込み</span>
          <button type="button" className="filter-reset-button" disabled={!hasFilters}
            onClick={() => setFilters({ ...EMPTY_FILTERS })}>条件をリセット</button>
        </div>
        <div className="skill-directory-filter-grid skill-coarse-filters">
          <label className="skill-directory-search"><span>文字検索</span>
            <input type="search" value={filters.query} placeholder="職分・オペレーター名・特性説明文"
              onChange={event => setFilters({ ...filters, query: event.target.value })} />
          </label>
          <label><span>職業</span>
            <select aria-label="職業" value={filters.profession} onChange={event => setFilters({ ...filters, profession: event.target.value })}>
              <option value="ALL">すべて</option>
              {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><span>レアリティ</span>
            <select aria-label="レアリティ" value={filters.rarity} onChange={event => setFilters({ ...filters,
              rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value) })}>
              <option value="ALL">すべて</option>
              {rarityOptions.map(value => <option key={value} value={value}>★{value}</option>)}
            </select>
          </label>
          <label><span>大分類候補</span>
            <select aria-label="大分類候補" value={filters.category} onChange={event => setFilters({ ...filters,
              category: event.target.value as TraitCoarseCategory | 'ALL' })}>
              <option value="ALL">すべて</option>
              {TRAIT_COARSE_CATEGORY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="detail-tabs skill-coarse-tabs" role="tablist" aria-label="表示する一覧">
        {TABS.map(([tab, label], index) => <button type="button" key={tab} id={`${tabIdPrefix}-tab-${tab}`}
          ref={tab === 'traits' ? traitsTab : undefined} className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
          role="tab" aria-selected={activeTab === tab} aria-controls={`${tabIdPrefix}-panel-${tab}`}
          tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)}
          onKeyDown={event => handleTabKeyDown(event, index)}>{label}</button>)}
      </div>
      <div id={`${tabIdPrefix}-panel-traits`} role="tabpanel" aria-labelledby={`${tabIdPrefix}-tab-traits`} hidden={activeTab !== 'traits'}>
        <div className="result-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中…' : `${visibleRows.length} / ${traits.length} 特性表示・${operatorCount(visibleRows)} OP`}</span>
          <span>最大昇進・潜在1・MODなし</span>
        </div>
        {!loading && visibleRows.length === 0 ? <div className="operator-empty-state" role="status">条件に一致する特性がありません</div>
          : <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="特性大分類の検索結果" tabIndex={0}>
            <table className="skill-coarse-table trait-coarse-table">
              <caption className="visually-hidden">職分・説明文別の特性一覧</caption>
              <thead><tr><th scope="col">職業</th><th scope="col">職分</th><th scope="col">特性</th>
                <th scope="col">大分類候補</th><th scope="col" className="skill-coarse-count">該当OP数</th></tr></thead>
              <tbody>{visibleRows.map(row => <tr key={row.id}>
                <td>{row.professionLabel}</td><td>{row.subProfessionName}</td>
                <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
                  aria-label={`${row.subProfessionName}の特性${row.variantIndex}の説明文を表示`}
                  onClick={() => setDetail(row)}>特性{row.variantIndex}</button></td>
                <td>{getTraitCoarseCategories(row).map(category => TRAIT_COARSE_CATEGORY_LABELS[category]).join('、')}</td>
                <td className="skill-coarse-count"><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
                  aria-label={`${row.subProfessionName}の特性${row.variantIndex}の該当オペレーター${row.operators.length}人を表示`}
                  onClick={() => setDetail(row)}>{row.operators.length}</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
      </div>
      <div id={`${tabIdPrefix}-panel-categories`} role="tabpanel" aria-labelledby={`${tabIdPrefix}-tab-categories`} hidden={activeTab !== 'categories'}>
        <div className="result-meta skill-coarse-overview-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中…' : `対象：${baseRows.length} 特性・${operatorCount(baseRows)} OP`}</span>
          <button type="button" className="filter-reset-button" disabled={filters.category === 'ALL'} onClick={() => selectCategory('ALL')}>すべて</button>
        </div>
        <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="特性の大分類一覧" tabIndex={0}>
          <table className="skill-coarse-table skill-coarse-category-table">
            <caption className="visually-hidden">大分類の基準と該当特性数</caption>
            <thead><tr><th scope="col">大分類名</th><th scope="col">分類の基準</th><th scope="col" className="skill-coarse-count">該当特性数</th></tr></thead>
            <tbody>{categoryRows.map(({ value, label, description, count }) => <tr key={value}
              className={filters.category === value ? 'skill-coarse-category-selected' : undefined}>
              <td><button type="button" className="skill-coarse-description-trigger" aria-pressed={filters.category === value}
                onClick={() => selectCategory(value)}>{label}</button></td>
              <td>{description}</td>
              <td className="skill-coarse-count"><button type="button" className="skill-coarse-description-trigger" disabled={loading}
                aria-label={`${label}に絞り込む（${count}件）`} onClick={() => selectCategory(value)}>{loading ? '—' : count.toLocaleString('ja-JP')}</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
    {detail && <TraitCoarseDetailModal row={detail} onClose={() => setDetail(null)} onOpenOperatorDetail={onOpenOperatorDetail} />}
  </section>
}

export function TraitCoarseDetailModal({ row, onClose, onOpenOperatorDetail }: {
  row: TraitCoarseRecord; onClose: () => void; onOpenOperatorDetail: OpenOperatorDetail
}) {
  return <GoldenglowDetailModal title={`${row.subProfessionName} · 特性${row.variantIndex}`} closeLabel="特性の説明文を閉じる"
    onClose={onClose} className="trait-coarse-detail-modal">
    <p className="trait-coarse-description">{row.description || '説明文はありません。'}</p>
    <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="この特性を持つオペレーター" tabIndex={0}>
      <table className="skill-coarse-table trait-coarse-operators-table">
        <caption className="visually-hidden">該当オペレーター</caption>
        <thead><tr><th scope="col">オペレーター</th><th scope="col">レアリティ</th></tr></thead>
        <tbody>{row.operators.map(operator => <tr key={operator.operatorId}>
          <td><OperatorDetailLink operatorId={operator.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
            className="skill-coarse-link">{operator.operatorName}</OperatorDetailLink></td><td>★{operator.rarity}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </GoldenglowDetailModal>
}
