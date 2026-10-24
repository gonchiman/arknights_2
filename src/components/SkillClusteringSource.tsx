import type { SkillClusteringDocument } from '../lib/skillClusteringData'
import { cleanGameText } from '../lib/enemyData'
import { formatSkillEffectDescription } from '../lib/skillEffectDetails'
import { createSkillSummaryHash } from '../lib/routes'
import type { SkillRecord } from '../types/skill'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './SkillClusteringSource.css'

export function SkillClusteringTerms({ terms }: { terms: readonly string[] }) {
  return <div className="skill-clustering-terms">{terms.length ? terms.map(term => <span key={term}>{term}</span>) : '—'}</div>
}

export function SkillClusteringSource({ document, recordMap, onOpenOperatorDetail, defaultOpen = false }: { document: SkillClusteringDocument; recordMap: ReadonlyMap<string, SkillRecord>; onOpenOperatorDetail: OpenOperatorDetail; defaultOpen?: boolean }) {
  const sources = document.recordIds.map(id => recordMap.get(id)).filter((row): row is SkillRecord => !!row)
  return <SourcePanel primary={sources[0]} description={document.description} sources={sources} onOpenOperatorDetail={onOpenOperatorDetail} defaultOpen={defaultOpen} />
}

export function SkillClusteringRecordSource({ record, onOpenOperatorDetail, defaultOpen = false }: { record: SkillRecord; onOpenOperatorDetail: OpenOperatorDetail; defaultOpen?: boolean }) {
  return <SourcePanel primary={record} description={cleanGameText(formatSkillEffectDescription(record))} onOpenOperatorDetail={onOpenOperatorDetail} defaultOpen={defaultOpen} />
}

function SourcePanel({ primary, description, sources = [], onOpenOperatorDetail, defaultOpen }: { primary?: SkillRecord; description: string; sources?: readonly SkillRecord[]; onOpenOperatorDetail: OpenOperatorDetail; defaultOpen: boolean }) {
  return <details className="skill-clustering-source" open={defaultOpen}><summary>スキル原文</summary><div className="skill-clustering-source-body">
    {primary && <div className="skill-clustering-source-links"><OperatorDetailLink operatorId={primary.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}>{primary.operatorName}</OperatorDetailLink><span>S{primary.skillIndex} · {primary.skillName}</span><a href={createSkillSummaryHash({ operatorId: primary.operatorId, skillId: primary.skillId, skillIndex: primary.skillIndex, levelIndex: Math.max(0, primary.skillLevels.length - 1) })}>効果の分解へ</a></div>}
    <p>{description}</p>
    {sources.length > 1 && <details><summary>同じ説明文の掲載先（{sources.length}件）</summary><ul>{sources.map(row => <li key={row.id}><OperatorDetailLink operatorId={row.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}>{row.operatorName}</OperatorDetailLink> S{row.skillIndex} · {row.skillName}</li>)}</ul></details>}
  </div></details>
}
