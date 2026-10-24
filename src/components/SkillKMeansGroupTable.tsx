import { useMemo, useState } from 'react'
import type { SkillClusteringDocument } from '../lib/skillClusteringData'
import { PROFESSION_LABELS, PROFESSION_ORDER } from '../lib/operatorFilters'
import { EMPTY_SKILL_DIRECTORY_FILTERS, filterSkillDirectoryRows, hasActiveSkillDirectoryFilters, type SkillDirectoryFilters } from '../lib/skillDirectory'
import type { SkillRecord } from '../types/skill'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { SkillClusteringTerms } from './SkillClusteringSource'
import { SkillEffectModal } from './SkillEffectModal'

const MEMBER_PAGE_SIZE = 12

interface Props {
  group: number
  documents: readonly SkillClusteringDocument[]
  recordMap: ReadonlyMap<string, SkillRecord>
  terms: readonly string[]
  filters: SkillDirectoryFilters
  onFiltersChange: (filters: SkillDirectoryFilters) => void
  onOpenOperatorDetail: OpenOperatorDetail
}

export function SkillKMeansGroupTable({ group, documents, recordMap, terms, filters, onFiltersChange, onOpenOperatorDetail }: Props) {
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<{ skill: SkillRecord; trigger: HTMLButtonElement } | null>(null)
  const members = useMemo(() => [...new Set(documents.flatMap(document => document.recordIds))]
    .map(id => recordMap.get(id)).filter((record): record is SkillRecord => !!record)
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'ja') || a.skillIndex - b.skillIndex || a.id.localeCompare(b.id)), [documents, recordMap])
  const filteredMembers = useMemo(() => filterSkillDirectoryRows(members, filters), [members, filters])
  const pages = Math.ceil(filteredMembers.length / MEMBER_PAGE_SIZE)
  const activePage = Math.max(0, Math.min(page, pages - 1))
  const visibleMembers = filteredMembers.slice(activePage * MEMBER_PAGE_SIZE, (activePage + 1) * MEMBER_PAGE_SIZE)

  function changeFilters(next: SkillDirectoryFilters) {
    setPage(0)
    onFiltersChange(next)
  }

  function closeDescription() {
    const trigger = detail?.trigger
    setDetail(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    })
  }

  return <section className="skill-kmeans-member-panel">
    <div className="skill-kmeans-member-heading">
      <h3 aria-live="polite">G{group + 1} · {filteredMembers.length} / {members.length}スキル</h3>
      <button type="button" className="filter-reset-button" disabled={!hasActiveSkillDirectoryFilters(filters)}
        onClick={() => changeFilters({ ...EMPTY_SKILL_DIRECTORY_FILTERS })}>条件をリセット</button>
    </div>
    <dl className="skill-kmeans-term-field"><dt>代表語</dt><dd><SkillClusteringTerms terms={terms} /></dd></dl>
    <div className="skill-kmeans-member-filters">
      <label><span>文字検索</span><input type="search" value={filters.query} placeholder="名前・スキル名・原文"
        onChange={event => changeFilters({ ...filters, query: event.target.value })} /></label>
      <label><span>職業</span><select value={filters.profession}
        onChange={event => changeFilters({ ...filters, profession: event.target.value })}>
        <option value="ALL">すべて</option>
        {PROFESSION_ORDER.map(profession => <option key={profession} value={profession}>{PROFESSION_LABELS[profession]}</option>)}
      </select></label>
      <label><span>レアリティ</span><select value={filters.rarity}
        onChange={event => changeFilters({ ...filters, rarity: event.target.value === 'ALL' ? 'ALL' : Number(event.target.value) })}>
        <option value="ALL">すべて</option>
        {[6, 5, 4, 3, 2, 1].map(rarity => <option key={rarity} value={rarity}>★{rarity}</option>)}
      </select></label>
    </div>
    <div className="skill-kmeans-member-scroll" role="region" aria-label={`G${group + 1}のスキル一覧`} tabIndex={0}>
      <table className="skill-kmeans-table skill-kmeans-member-table" aria-label="グループ内のスキル">
        <thead><tr><th scope="col">オペレーター</th><th scope="col">スキル</th></tr></thead>
        <tbody>{visibleMembers.map(record => <tr key={record.id}>
          <td><OperatorDetailLink operatorId={record.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}>{record.operatorName}</OperatorDetailLink></td>
          <td><button type="button" className="skill-kmeans-skill-link" aria-haspopup="dialog"
            aria-label={`${record.operatorName} S${record.skillIndex} · ${record.skillName}の原文を表示`} onClick={event => setDetail({ skill: record, trigger: event.currentTarget })}>S{record.skillIndex} · {record.skillName}</button></td>
        </tr>)}
          {filteredMembers.length === 0 && <tr><td colSpan={2} className="skill-kmeans-member-empty">該当するスキルなし</td></tr>}
        </tbody>
      </table>
    </div>
    {pages > 1 && <div className="skill-kmeans-pagination skill-kmeans-member-pagination">
      <span aria-live="polite">{activePage * MEMBER_PAGE_SIZE + 1}〜{Math.min(filteredMembers.length, (activePage + 1) * MEMBER_PAGE_SIZE)} / {filteredMembers.length}スキル</span>
      <div className="skill-kmeans-actions">
        <button type="button" className="button secondary" aria-label="前のスキル一覧" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>前へ</button>
        <button type="button" className="button secondary" aria-label="次のスキル一覧" disabled={activePage + 1 === pages} onClick={() => setPage(activePage + 1)}>次へ</button>
      </div>
    </div>}
    {detail && <SkillEffectModal skill={detail.skill} descriptionOnly onClose={closeDescription} />}
  </section>
}
