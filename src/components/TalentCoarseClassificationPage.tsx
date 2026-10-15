import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  buildTalentCoarseRecords,
  DEFAULT_TALENT_COARSE_FILTERS,
  TALENT_COARSE_CATEGORY_LABELS,
  TALENT_COARSE_CATEGORY_OPTIONS,
  filterTalentCoarseRows,
  getTalentCoarseCategories,
  summarizeTalentCoarseCategories,
  type TalentCoarseCategory,
  type TalentCoarseFilters,
  type TalentCoarseRecord,
} from '../lib/talentCoarseClassification'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import type { SkillRecord } from '../types/skill'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './TalentCoarseClassificationPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

const EMPTY_FILTERS: TalentCoarseFilters = {
  query: '', profession: 'ALL', rarity: 'ALL', category: 'ALL',
}

const TABS = [['talents', '素質一覧'], ['categories', '大分類一覧']] as const
type ListTab = typeof TABS[number][0]

export function TalentCoarseClassificationPage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [filters, setFilters] = useState<TalentCoarseFilters>({ ...DEFAULT_TALENT_COARSE_FILTERS })
  const [activeTab, setActiveTab] = useState<ListTab>('talents')
  const [detail, setDetail] = useState<TalentCoarseRecord | null>(null)
  const tabIdPrefix = useId()
  const talentsTab = useRef<HTMLButtonElement>(null)
  const talents = useMemo(() => buildTalentCoarseRecords(rows), [rows])
  const professionOptions = useMemo(() => {
    const labels = new Map(talents.map((row) => [row.profession, row.professionLabel]))
    return PROFESSION_ORDER.filter((profession) => labels.has(profession))
      .map((profession) => ({ value: profession, label: labels.get(profession) }))
  }, [talents])
  const rarityOptions = useMemo(() => [...new Set(talents.map(row => row.rarity))]
    .sort((a, b) => b - a), [talents])
  const baseRows = useMemo(() => filterTalentCoarseRows(talents, {
    query: filters.query, profession: filters.profession, rarity: filters.rarity, category: 'ALL',
  }), [talents, filters.query, filters.profession, filters.rarity])
  const visibleRows = useMemo(() => {
    const category = filters.category
    return category === 'ALL' ? baseRows : baseRows.filter((row) => getTalentCoarseCategories(row).includes(category))
  }, [baseRows, filters.category])
  const categoryRows = useMemo(() => summarizeTalentCoarseCategories(baseRows), [baseRows])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.category !== 'ALL'

  const selectCategory = (category: TalentCoarseCategory | 'ALL') => {
    setFilters((current) => ({ ...current, category }))
    setActiveTab('talents')
    window.requestAnimationFrame(() => talentsTab.current?.focus({ preventScroll: true }))
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

  return <section className="skill-coarse-page talent-coarse-page">
    <header className="page-intro"><h1>素質大分類</h1></header>
    <section className="skill-directory-panel" aria-label="素質大分類の一覧">
      <div className="skill-directory-filters">
        <div className="filters-heading">
          <span>絞り込み</span>
          <button type="button" className="filter-reset-button" disabled={!hasFilters}
            onClick={() => setFilters({ ...EMPTY_FILTERS })}>条件をリセット</button>
        </div>
        <div className="skill-directory-filter-grid skill-coarse-filters">
          <label className="skill-directory-search">
            <span>文字検索</span>
            <input type="search" value={filters.query} placeholder="オペレーター名・素質名・説明文"
              onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
          </label>
          <label><span>職業</span>
            <select value={filters.profession}
              onChange={(event) => setFilters({ ...filters, profession: event.target.value })}>
              <option value="ALL">すべて</option>
              {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><span>レアリティ</span>
            <select value={filters.rarity} onChange={(event) => setFilters({
              ...filters, rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
            })}>
              <option value="ALL">すべて</option>
              {rarityOptions.map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
            </select>
          </label>
          <label><span>大分類候補</span>
            <select value={filters.category} onChange={(event) => setFilters({
              ...filters, category: event.target.value as TalentCoarseCategory | 'ALL',
            })}>
              <option value="ALL">すべて</option>
              {TALENT_COARSE_CATEGORY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="detail-tabs skill-coarse-tabs" role="tablist" aria-label="表示する一覧">
        {TABS.map(([tab, label], index) => <button type="button" key={tab} id={`${tabIdPrefix}-tab-${tab}`}
          ref={tab === 'talents' ? talentsTab : undefined}
          className={`detail-tab ${activeTab === tab ? 'active' : ''}`} role="tab"
          aria-selected={activeTab === tab} aria-controls={`${tabIdPrefix}-panel-${tab}`}
          tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}>{label}</button>)}
      </div>
      <div id={`${tabIdPrefix}-panel-talents`} role="tabpanel"
        aria-labelledby={`${tabIdPrefix}-tab-talents`} hidden={activeTab !== 'talents'}>
        <div className="result-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中…' : `${visibleRows.length} / ${talents.length} 素質表示`}</span>
          <span>最大昇進・潜在1・MODなし</span>
        </div>
        {!loading && visibleRows.length === 0 ? <div className="operator-empty-state" role="status">
          条件に一致する素質がありません
        </div> : <div className="table-wrap skill-coarse-table-wrap">
          <table className="skill-coarse-table">
            <caption className="visually-hidden">素質大分類の検索結果</caption>
            <thead><tr><th scope="col">オペレーター</th><th scope="col">素質番号</th>
              <th scope="col">素質名</th><th scope="col">大分類候補</th></tr></thead>
            <tbody>{visibleRows.map(row => <tr key={row.id}>
              <td><OperatorDetailLink operatorId={row.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
                className="skill-coarse-link">{row.operatorName}</OperatorDetailLink></td>
              <td className="skill-coarse-number">{row.talentIndex + 1}</td>
              <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
                aria-label={`${row.operatorName}の素質${row.talentIndex + 1} ${row.talentName}の説明文を表示`}
                onClick={() => setDetail(row)}>{row.talentName}</button></td>
              <td>{getTalentCoarseCategories(row).map(category => TALENT_COARSE_CATEGORY_LABELS[category]).join('、')}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      <div id={`${tabIdPrefix}-panel-categories`} role="tabpanel"
        aria-labelledby={`${tabIdPrefix}-tab-categories`} hidden={activeTab !== 'categories'}>
        <div className="result-meta skill-coarse-overview-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中…' : `対象：${baseRows.length} 素質`}</span>
          <button type="button" className="filter-reset-button" disabled={filters.category === 'ALL'}
            onClick={() => selectCategory('ALL')}>すべて</button>
        </div>
        <div className="table-wrap skill-coarse-table-wrap">
          <table className="skill-coarse-table skill-coarse-category-table">
            <caption className="visually-hidden">大分類の基準と該当素質数</caption>
            <thead><tr><th scope="col">大分類名</th><th scope="col">分類の基準</th>
              <th scope="col" className="skill-coarse-count">該当素質数</th></tr></thead>
            <tbody>{categoryRows.map(({ value, label, description, count }) => <tr key={value}
              className={filters.category === value ? 'skill-coarse-category-selected' : undefined}>
              <td><button type="button" className="skill-coarse-description-trigger"
                aria-pressed={filters.category === value} onClick={() => selectCategory(value)}>{label}</button></td>
              <td>{description}</td>
              <td className="skill-coarse-count"><button type="button"
                className="skill-coarse-description-trigger talent-coarse-count-trigger" disabled={loading}
                aria-label={`${label}に絞り込む（${count}件）`} onClick={() => selectCategory(value)}>
                {loading ? '—' : count.toLocaleString('ja-JP')}</button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <details className="skill-coarse-count-help">
          <summary>件数の数え方</summary>
          <p>サイトに読み込まれたスキル情報を持つオペレーターが対象です。</p>
          <p>文字検索・職業・レアリティに一致する素質を集計します。複数の分類に該当する素質は、それぞれに1件ずつ数えます。大分類候補の選択は件数に反映しません。</p>
        </details>
      </div>
    </section>
    {detail && <GoldenglowDetailModal title={`${detail.operatorName} · 素質${detail.talentIndex + 1} ${detail.talentName}`}
      closeLabel="素質の説明文を閉じる" onClose={() => setDetail(null)} className="talent-coarse-description-modal">
      <p className="talent-coarse-description">{detail.description || '説明文はありません。'}</p>
    </GoldenglowDetailModal>}
  </section>
}
