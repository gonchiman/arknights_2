import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  buildDamageCalculatorThreeCoverage,
  COVERAGE_STATUS_LABELS,
  COVERAGE_STATUS_OPTIONS,
  COVERAGE_SECTION_STATUS_LABELS,
  type DamageCalculatorThreeCoverageRow,
  type DamageCalculatorThreeCoverageStatus,
} from '../lib/damageCalculatorThreeCoverage'
import {
  DEFAULT_DAMAGE_THREE_COVERAGE_FILTERS,
  EMPTY_DAMAGE_THREE_COVERAGE_FILTERS,
  filterDamageCalculatorThreeCoverage,
  type DamageCalculatorThreeCoverageFilters,
} from '../lib/damageCalculatorThreeCoverageFilters'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import { lockPageScroll } from '../lib/pageScrollLock'
import { createDamageCalculatorThreeHash } from '../lib/routes'
import type { SkillRecord } from '../types/skill'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './SkillDirectory.css'
import './SkillCoarseClassificationPage.css'
import './SkillEffectModal.css'
import './DamageCalculatorThreeCoveragePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

export function DamageCalculatorThreeCoveragePage({ rows, loading, onOpenOperatorDetail }: Props) {
  const [filters, setFilters] = useState<DamageCalculatorThreeCoverageFilters>({ ...DEFAULT_DAMAGE_THREE_COVERAGE_FILTERS })
  const [detail, setDetail] = useState<{ row: DamageCalculatorThreeCoverageRow; trigger: HTMLButtonElement } | null>(null)
  const coverage = useMemo(() => buildDamageCalculatorThreeCoverage(rows), [rows])
  const visibleRows = useMemo(() => filterDamageCalculatorThreeCoverage(coverage, filters), [coverage, filters])
  const professionOptions = useMemo(() => {
    const labels = new Map(rows.map((row) => [row.profession, row.professionLabel]))
    return PROFESSION_ORDER.filter((profession) => labels.has(profession))
      .map((profession) => ({ value: profession, label: labels.get(profession) }))
  }, [rows])
  const counts = useMemo(() => COVERAGE_STATUS_OPTIONS.map(({ value, label }) =>
    `${label} ${visibleRows.filter((row) => row.status === value).length}`), [visibleRows])
  const hasFilters = filters.query.trim() !== '' || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL' || filters.status !== 'ALL'

  const closeDetail = () => {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    })
  }

  return (
    <section className="damage-three-coverage-page">
      <header className="page-intro"><h1>DC3 実装範囲</h1></header>
      <section className="skill-directory-panel" aria-label="DC3の対応スキル一覧">
        <div className="skill-directory-filters">
          <div className="filters-heading">
            <span>絞り込み</span>
            <button type="button" className="filter-reset-button" disabled={!hasFilters}
              onClick={() => setFilters({ ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS })}>条件をリセット</button>
          </div>
          <div className="skill-directory-filter-grid skill-coarse-filters">
            <label className="skill-directory-search">
              <span>文字検索</span>
              <input type="search" value={filters.query} placeholder="オペレーター名・スキル名・S番号"
                onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
            </label>
            <label>
              <span>職業</span>
              <select aria-label="職業" value={filters.profession}
                onChange={(event) => setFilters({ ...filters, profession: event.target.value })}>
                <option value="ALL">すべて</option>
                {professionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>レアリティ</span>
              <select aria-label="レアリティ" value={filters.rarity} onChange={(event) => setFilters({ ...filters,
                rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value),
              })}>
                <option value="ALL">すべて</option>
                {[6, 5, 4, 3, 2, 1].map((rarity) => <option key={rarity} value={rarity}>★{rarity}</option>)}
              </select>
            </label>
            <label>
              <span>総合の状況</span>
              <select aria-label="総合の状況" value={filters.status} onChange={(event) => setFilters({ ...filters,
                status: event.target.value as DamageCalculatorThreeCoverageStatus | 'ALL',
              })}>
                <option value="ALL">すべて</option>
                {COVERAGE_STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="result-meta damage-three-coverage-meta" role="status" aria-live="polite">
          <span>{loading ? '読み込み中…' : `${visibleRows.length} / ${coverage.length} スキル表示`}</span>
          {!loading && <span>{counts.join('・')}</span>}
        </div>
        {!loading && visibleRows.length === 0 ? (
          <div className="operator-empty-state" role="status">条件に一致するスキルがありません</div>
        ) : (
          <div className="table-wrap skill-coarse-table-wrap" role="region" aria-label="DC3の対応スキル" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-table">
              <caption className="visually-hidden">DC3の区分別の実装状況</caption>
              <thead><tr>
                <th scope="col">オペレーター</th>
                <th scope="col">S番号</th>
                <th scope="col">スキル名</th>
                <th scope="col">スキル</th>
                <th scope="col">素質</th>
                <th scope="col">特性</th>
                <th scope="col">総合</th>
                <th scope="col">詳細</th>
              </tr></thead>
              <tbody>{!loading && visibleRows.map((row) => (
                <tr key={row.skill.id}>
                  <td><OperatorDetailLink operatorId={row.skill.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}
                    className="skill-coarse-link">{row.skill.operatorName}</OperatorDetailLink></td>
                  <td>S{row.skill.skillIndex}</td>
                  <td>{row.skill.skillName}</td>
                  <td>{COVERAGE_SECTION_STATUS_LABELS[row.sections.skill]}</td>
                  <td>{COVERAGE_SECTION_STATUS_LABELS[row.sections.talent]}</td>
                  <td>{COVERAGE_SECTION_STATUS_LABELS[row.sections.trait]}</td>
                  <td>{COVERAGE_STATUS_LABELS[row.status]}</td>
                  <td><button type="button" className="skill-coarse-description-trigger" aria-haspopup="dialog"
                    aria-label={`${row.skill.operatorName} S${row.skill.skillIndex}の対応詳細`}
                    onClick={(event) => setDetail({ row, trigger: event.currentTarget })}>詳細</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {detail && <DamageCalculatorThreeCoverageDialog row={detail.row} onClose={closeDetail} />}
    </section>
  )
}

export function DamageCalculatorThreeCoverageDialog({ row, onClose }: {
  row: DamageCalculatorThreeCoverageRow
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdropPointerDownRef = useRef(false)
  const titleId = useId()
  const { skill } = row
  const facts: [string, string][] = [
    ['スキル名', skill.skillName],
    ['総合', COVERAGE_STATUS_LABELS[row.status]],
    ...(row.selection ? [['共通条件', '昇進2・特化3・潜在1・MODなし'] as [string, string]] : []),
    ...row.calculationScope.map((value): [string, string] => ['計算範囲', value]),
    ...row.supportedConditions.map((value): [string, string] => ['対応条件', value]),
    ...row.scopeNotes.map((value): [string, string] => ['対象範囲', value]),
  ]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const unlockScroll = lockPageScroll(document.documentElement)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      unlockScroll()
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog ref={dialogRef} className="skill-effect-dialog damage-three-coverage-dialog"
      aria-labelledby={titleId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onPointerDown={(event) => { backdropPointerDownRef.current = event.target === event.currentTarget }}
      onPointerCancel={() => { backdropPointerDownRef.current = false }}
      onClick={(event) => {
        if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
        backdropPointerDownRef.current = false
      }}>
      <div className="skill-effect-modal">
        <header className="skill-effect-modal-header">
          <h2 id={titleId}>{skill.operatorName} S{skill.skillIndex}</h2>
          <button ref={closeRef} type="button" aria-label="対応詳細を閉じる" onClick={onClose}>×</button>
        </header>
        <div className="skill-effect-modal-body" role="region" aria-label="スキルの対応詳細" tabIndex={0}>
          <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="区分別の実装状況" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-sections-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の区分別の実装状況</caption>
              <thead><tr><th scope="col">区分</th><th scope="col">項目</th><th scope="col">実装状況</th></tr></thead>
              <tbody>{row.details.map((section) => <tr key={section.id}>
                <th scope="row">{section.label}</th><td>{section.name}</td>
                <td>{COVERAGE_SECTION_STATUS_LABELS[section.status]}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="計算範囲と対応条件" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-detail-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の計算範囲</caption>
              <thead><tr><th scope="col">項目</th><th scope="col">内容</th></tr></thead>
              <tbody>{facts.map(([label, value], index) => <tr key={`${label}-${index}`}>
                <th scope="row">{label}</th><td>{value}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {row.issues.length > 0 && <div className="table-wrap skill-coarse-table-wrap damage-three-coverage-detail-wrap"
            role="region" aria-label="保留事項と関連区分" tabIndex={0}>
            <table className="skill-coarse-table damage-three-coverage-issues-table">
              <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex}の保留事項と関連区分</caption>
              <thead><tr><th scope="col">関連区分</th><th scope="col">保留事項</th><th scope="col">現在の対応</th></tr></thead>
              <tbody>{row.issues.map((issue) => <tr key={issue.id}>
                <th scope="row">{issue.relatedSections.join('・')}</th><td>{issue.reason}</td>
                <td>{issue.impact === 'OUTSIDE_SCOPE' ? '計算範囲外' : issue.supportedCondition ?? '保留'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {row.selection && <div className="damage-three-coverage-actions">
            <a className="button" href={createDamageCalculatorThreeHash(row.selection)}>計算機3で開く</a>
          </div>}
        </div>
      </div>
    </dialog>
  )
}
