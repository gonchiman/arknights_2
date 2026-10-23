import type { SkillRecord } from '../types/skill'
import type { SkillClusteringDocument } from '../lib/skillClusteringFeatures'
import { createSkillSummaryHash } from '../lib/routes'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'

export function SkillClusteringRepresentativeTerms({ terms }: { terms: readonly string[] }) {
  return <div className="skill-kmeans-terms">{terms.length ? terms.map(term => <span key={term}>{term}</span>) : '—'}</div>
}

export function SkillClusteringDocumentSource({ document, recordMap, onOpenOperatorDetail }: { document: SkillClusteringDocument; recordMap: ReadonlyMap<string, SkillRecord>; onOpenOperatorDetail: OpenOperatorDetail }) {
  const sources = document.recordIds.map(id => recordMap.get(id)).filter((row): row is SkillRecord => !!row)
  const primary = sources[0]
  return <details className="skill-kmeans-source"><summary>スキル原文</summary><div className="skill-kmeans-source-body">
    {primary && <div className="skill-kmeans-source-links"><OperatorDetailLink operatorId={primary.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}>{primary.operatorName}</OperatorDetailLink><span>S{primary.skillIndex} · {primary.skillName}</span><a href={createSkillSummaryHash({ operatorId: primary.operatorId, skillId: primary.skillId, skillIndex: primary.skillIndex, levelIndex: Math.max(0, primary.skillLevels.length - 1) })}>効果の分解へ</a></div>}
    <p>{document.description}</p>
    {sources.length > 1 && <details><summary>同じ説明文の掲載先（{sources.length}件）</summary><ul>{sources.map(row => <li key={row.id}><OperatorDetailLink operatorId={row.operatorId} onOpenOperatorDetail={onOpenOperatorDetail}>{row.operatorName}</OperatorDetailLink> S{row.skillIndex} · {row.skillName}</li>)}</ul></details>}
  </div></details>
}
