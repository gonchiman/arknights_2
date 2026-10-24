import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SkillClusteringDocument } from '../lib/skillClusteringData'
import type { SkillRecord } from '../types/skill'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { SkillClusteringRecordSource, SkillClusteringTerms } from './SkillClusteringSource'

const MEMBER_PAGE_SIZE = 12

interface Props {
  group: number
  documents: readonly SkillClusteringDocument[]
  recordMap: ReadonlyMap<string, SkillRecord>
  terms: readonly string[]
  onOpenOperatorDetail: OpenOperatorDetail
}

export function SkillKMeansGroupTable({ group, documents, recordMap, terms, onOpenOperatorDetail }: Props) {
  const [page, setPage] = useState(0)
  const [selection, setSelection] = useState({ id: '', reveal: false })
  const sourceRef = useRef<HTMLDivElement>(null)
  const members = useMemo(() => [...new Set(documents.flatMap(document => document.recordIds))]
    .map(id => recordMap.get(id)).filter((record): record is SkillRecord => !!record)
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'ja') || a.skillIndex - b.skillIndex || a.id.localeCompare(b.id)), [documents, recordMap])
  const pages = Math.ceil(members.length / MEMBER_PAGE_SIZE)
  const activePage = Math.max(0, Math.min(page, pages - 1))
  const visibleMembers = members.slice(activePage * MEMBER_PAGE_SIZE, (activePage + 1) * MEMBER_PAGE_SIZE)
  const selected = visibleMembers.find(record => record.id === selection.id) ?? visibleMembers[0]

  useLayoutEffect(() => {
    if (!selection.reveal) return
    const source = sourceRef.current?.querySelector('details')
    if (!source) return
    source.open = true
    source.querySelector('summary')?.focus({ preventScroll: true })
    source.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selection])

  function changePage(next: number) {
    setPage(next)
    setSelection({ id: '', reveal: false })
  }

  return <section className="skill-kmeans-member-panel">
    <h3>G{group + 1} · {members.length}スキル</h3>
    <dl className="skill-kmeans-term-field"><dt>代表語</dt><dd><SkillClusteringTerms terms={terms} /></dd></dl>
    <div className="skill-kmeans-member-scroll" role="region" aria-label={`G${group + 1}のスキル一覧`} tabIndex={0}>
      <table className="skill-kmeans-table skill-kmeans-member-table" aria-label="グループ内のスキル">
        <thead><tr><th scope="col">オペレーター</th><th scope="col">スキル</th></tr></thead>
        <tbody>{visibleMembers.map(record => <tr key={record.id} className={record.id === selected?.id ? 'selected' : ''}>
          <td><OperatorDetailLink operatorId={record.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}>{record.operatorName}</OperatorDetailLink></td>
          <td><button type="button" className="skill-kmeans-skill-link" aria-pressed={record.id === selected?.id}
            aria-label={`${record.operatorName} S${record.skillIndex} · ${record.skillName}の原文を表示`} onClick={() => setSelection({ id: record.id, reveal: true })}>S{record.skillIndex} · {record.skillName}</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {pages > 1 && <div className="skill-kmeans-pagination skill-kmeans-member-pagination">
      <span aria-live="polite">{activePage * MEMBER_PAGE_SIZE + 1}〜{Math.min(members.length, (activePage + 1) * MEMBER_PAGE_SIZE)} / {members.length}スキル</span>
      <div className="skill-kmeans-actions">
        <button type="button" className="button secondary" aria-label="前のスキル一覧" disabled={activePage === 0} onClick={() => changePage(activePage - 1)}>前へ</button>
        <button type="button" className="button secondary" aria-label="次のスキル一覧" disabled={activePage + 1 === pages} onClick={() => changePage(activePage + 1)}>次へ</button>
      </div>
    </div>}
    {selected && <div className="skill-kmeans-selected-source" ref={sourceRef}><SkillClusteringRecordSource key={selected.id} record={selected} onOpenOperatorDetail={onOpenOperatorDetail} defaultOpen /></div>}
  </section>
}
