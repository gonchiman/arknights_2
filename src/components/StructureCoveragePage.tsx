import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import {
  buildStructureCoverage, DEFAULT_STRUCTURE_COVERAGE_FILTERS, filterStructureCoverage,
  summarizeStructureCoverage, type StructureCoverageRecord,
} from '../lib/structureCoverage'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabs } from './AnalysisTabs'
import { CoverageStackedBars } from './CoverageStackedBars'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './StructureCoveragePage.css'

const TABS = [['skill', 'スキル'], ['talent', '素質'], ['trait', '特性']] as const
type CoverageKind = typeof TABS[number][0]
const UNITS = { skill: 'スキル', talent: '素質', trait: 'OP' } as const
const REGISTRATION_CATEGORIES = [
  { key: 'REGISTERED', label: '登録済み', color: 'var(--coverage-bar-blue)' },
  { key: 'UNREGISTERED', label: '未登録', color: 'var(--coverage-bar-light-gray)' },
] as const

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

export default function StructureCoveragePage({ rows, loading, onOpenOperatorDetail }: Props) {
  const id = useId()
  const [tab, setTab] = useState<CoverageKind>('skill')
  const [filters, setFilters] = useState({ ...DEFAULT_STRUCTURE_COVERAGE_FILTERS })
  const [detail, setDetail] = useState<{ row: StructureCoverageRecord; trigger: HTMLButtonElement } | null>(null)
  const detailRef = useRef<HTMLElement>(null)
  const coverage = useMemo(() => buildStructureCoverage(rows), [rows])
  const filteredCoverage = useMemo(() => ({
    skill: filterStructureCoverage(coverage.skill, filters),
    talent: filterStructureCoverage(coverage.talent, filters),
    trait: filterStructureCoverage(coverage.trait, filters),
  }), [coverage, filters])
  const visibleRows = filteredCoverage[tab]
  const professionOptions = useMemo(() => {
    const labels = new Map(rows.map(row => [row.profession, row.professionLabel]))
    return PROFESSION_ORDER.filter(profession => labels.has(profession))
      .map(value => ({ value, label: labels.get(value) }))
  }, [rows])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.registration !== 'ALL'
  const filterSummary = [
    filters.profession === 'ALL' ? '全職業' : professionOptions.find(option => option.value === filters.profession)?.label,
    filters.rarity === 'ALL' ? '全レアリティ' : `★${filters.rarity}`,
    filters.registration === 'ALL' ? '' : filters.registration === 'REGISTERED' ? '登録済み' : '未登録',
    filters.query.trim() ? `検索：${filters.query.trim()}` : '',
  ].filter(Boolean).join('・')

  useEffect(() => {
    if (!detail) return
    detailRef.current?.focus({ preventScroll: true })
    detailRef.current?.scrollIntoView({ block: 'start' })
  }, [detail])

  const changeFilters = (next: typeof filters) => { setFilters(next); setDetail(null) }
  const closeDetail = () => {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
    })
  }

  return <section className="structure-coverage-page">
    <header className="page-intro"><h1>大分類・構造化の実装範囲</h1></header>
    <section className="skill-directory-panel" aria-label="大分類・構造化の登録状況">
      <div className="skill-directory-filters">
        <div className="filters-heading structure-coverage-heading">
          <h2>絞り込み</h2>
          <button type="button" className="filter-reset-button" disabled={!hasFilters}
            onClick={() => changeFilters({ ...DEFAULT_STRUCTURE_COVERAGE_FILTERS })}>条件をリセット</button>
        </div>
        <div className="skill-directory-filter-grid skill-coarse-filters">
          <label className="skill-directory-search"><span>文字検索</span>
            <input type="search" value={filters.query} placeholder="オペレーター名・名称・大分類"
              onChange={event => changeFilters({ ...filters, query: event.target.value })} />
          </label>
          <label><span>職業</span>
            <select aria-label="職業" value={filters.profession} onChange={event => changeFilters({ ...filters, profession: event.target.value })}>
              <option value="ALL">すべて</option>
              {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><span>レアリティ</span>
            <select aria-label="レアリティ" value={filters.rarity} onChange={event => changeFilters({ ...filters,
              rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
            })}>
              <option value="ALL">すべて</option>
              {[6, 5, 4, 3, 2, 1].map(rarity => <option key={rarity} value={rarity}>★{rarity}</option>)}
            </select>
          </label>
          <label><span>構造の登録</span>
            <select aria-label="構造の登録" value={filters.registration} onChange={event => changeFilters({ ...filters,
              registration: event.target.value as typeof filters.registration,
            })}>
              <option value="ALL">すべて</option>
              <option value="REGISTERED">登録済み</option>
              <option value="UNREGISTERED">未登録</option>
            </select>
          </label>
        </div>
      </div>
      <div className="filters-heading structure-coverage-heading">
        <h2>絞り込み結果の登録状況</h2><span>{filterSummary}</span>
      </div>
      {loading ? <div className="result-meta" role="status">読み込み中…</div>
        : <StructureCoverageSummary coverage={filteredCoverage} />}
      <div className="result-meta structure-coverage-results-bar">
        <div role="status" aria-live="polite">
          {loading ? '読み込み中…' : `${visibleRows.length.toLocaleString('ja-JP')} / ${coverage[tab].length.toLocaleString('ja-JP')} ${UNITS[tab]}表示`}
        </div>
        <AnalysisTabs tabs={TABS} activeTab={tab} onChange={next => { setTab(next); setDetail(null) }}
          idPrefix={id} label="一覧の区分" />
      </div>
      {TABS.map(([kind, label]) => <section key={kind} role="tabpanel" id={`${id}-panel-${kind}`}
        aria-labelledby={`${id}-tab-${kind}`} hidden={tab !== kind}>
        {tab === kind && <>
          {!loading && (visibleRows.length === 0
            ? <div className="operator-empty-state" role="status">条件に一致する{label}がありません</div>
            : <StructureCoverageTable rows={visibleRows} kind={kind} onOpenOperatorDetail={onOpenOperatorDetail}
                detailId={`${id}-concerns`} selectedId={detail?.row.id}
                onOpenConcerns={(row, trigger) => setDetail({ row, trigger })} />)}
        </>}
      </section>)}
      {detail && <section className="structure-coverage-concerns" id={`${id}-concerns`} ref={detailRef}
        tabIndex={-1} aria-labelledby={`${id}-concerns-heading`}>
        <div className="filters-heading structure-coverage-heading">
          <h2 id={`${id}-concerns-heading`}>{detail.row.operatorName}
            {detail.row.kind === 'skill' ? ` S${detail.row.number}`
              : detail.row.kind === 'talent' ? ` 素質${detail.row.number}` : ' 特性'}の保留事項</h2>
          <button type="button" className="filter-reset-button" onClick={closeDetail}>閉じる</button>
        </div>
        <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="保留事項の詳細" tabIndex={0}>
          <table className="skill-coarse-table structure-coverage-concerns-table">
            <caption className="visually-hidden">保留事項の詳細</caption>
            <colgroup><col style={{ width: '30%' }} /><col style={{ width: '70%' }} /></colgroup>
            <thead><tr><th scope="col">項目</th><th scope="col">内容</th></tr></thead>
            <tbody>{detail.row.concerns.map((concern, index) => <tr key={index}>
              <th scope="row">{concern.title}</th><td>{concern.detail}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
    </section>
  </section>
}

export function StructureCoverageSummary({ coverage }: { coverage: Record<CoverageKind, StructureCoverageRecord[]> }) {
  const summaries = TABS.map(([kind, label]) => ({ kind, label, ...summarizeStructureCoverage(coverage[kind]) }))
  return <>
    <div className="structure-coverage-chart">
      <CoverageStackedBars title="構造登録率" legendLabel="構造の登録状況の凡例"
        categories={REGISTRATION_CATEGORIES} showZeroCounts showCountPercent={false}
        rows={summaries.map(summary => ({
          key: summary.kind, label: summary.label, total: summary.total, unit: UNITS[summary.kind],
          buckets: REGISTRATION_CATEGORIES.map(category => ({
            ...category, count: category.key === 'REGISTERED' ? summary.registered : summary.unregistered,
          })),
        }))} />
    </div>
    <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="絞り込み結果の登録状況" tabIndex={0}>
      <table className="skill-coarse-table structure-coverage-summary-table">
        <caption className="visually-hidden">大分類・構造化の区分別集計</caption>
        <thead><tr>{['区分', '集計単位', '対象数', '構造登録', '未登録', '登録率'].map(label =>
          <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{summaries.map(summary => (
          <tr key={summary.kind}>
            <th scope="row">{summary.label}</th><td>{UNITS[summary.kind]}</td>
            <td>{summary.total.toLocaleString('ja-JP')}</td>
            <td>{summary.registered.toLocaleString('ja-JP')}</td>
            <td>{summary.unregistered.toLocaleString('ja-JP')}</td>
            <td>{summary.rate === null ? '—' : `${summary.rate.toFixed(1)}%`}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </>
}

export function StructureCoverageTable({ rows, kind, onOpenOperatorDetail, onOpenConcerns, detailId, selectedId }: {
  rows: StructureCoverageRecord[]
  kind: CoverageKind
  onOpenOperatorDetail: OpenOperatorDetail
  onOpenConcerns: (row: StructureCoverageRecord, trigger: HTMLButtonElement) => void
  detailId: string
  selectedId?: string
}) {
  const isTrait = kind === 'trait'
  const label = TABS.find(([value]) => value === kind)![1]
  const widths = isTrait ? ['20%', '18%', '36%', '14%', '12%'] : ['18%', '8%', '20%', '30%', '12%', '12%']
  return <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label={`${label}の登録一覧`} tabIndex={0}>
    <table className="skill-coarse-table structure-coverage-list-table">
      <caption className="visually-hidden">{label}の大分類・構造の登録・保留事項</caption>
      <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr>
        <th scope="col">オペレーター</th>
        {!isTrait && <th scope="col">{kind === 'skill' ? 'S番号' : '素質番号'}</th>}
        <th scope="col">{isTrait ? '職分' : `${label}名`}</th>
        <th scope="col">大分類</th><th scope="col">構造の登録</th><th scope="col">保留事項</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td><OperatorDetailLink operatorId={row.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
          className="skill-coarse-link">{row.operatorName}</OperatorDetailLink></td>
        {!isTrait && <td>{kind === 'skill' ? `S${row.number}` : row.number}</td>}
        <td>{isTrait ? row.jobName : row.name}</td>
        <td>{row.categoryLabels.join('・')}</td>
        <td>{row.registered && row.structureHref
          ? <a className="skill-coarse-link" href={row.structureHref}
              aria-label={`${row.operatorName} ${isTrait ? '特性' : row.name}の構造を開く`}>登録済み</a>
          : row.registered ? '登録済み' : '未登録'}</td>
        <td>{row.concerns.length > 0
          ? <button type="button" className="skill-coarse-description-trigger"
              aria-expanded={selectedId === row.id} aria-controls={selectedId === row.id ? detailId : undefined}
              aria-label={`${row.operatorName} ${isTrait ? '特性' : row.name}の保留事項`}
              onClick={event => onOpenConcerns(row, event.currentTarget)}>あり</button>
          : row.registered ? '記録なし' : '—'}</td>
      </tr>)}</tbody>
    </table>
  </div>
}
