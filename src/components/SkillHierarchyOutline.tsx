import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react'
import type { SkillClusteringDocument } from '../lib/skillClusteringData'
import type { SkillHierarchyTree } from '../lib/skillHierarchical'
import { getSkillHierarchyDisplayChildren, getSkillHierarchyParents, getSkillHierarchyPath } from '../lib/skillHierarchyView'
import './SkillHierarchyOutline.css'

interface Props {
  tree: SkillHierarchyTree
  documents: readonly SkillClusteringDocument[]
  groupNodeIds: readonly number[]
  selectedId: number | null
  focusId: number
  onSelect: (id: number) => void
  onFocus: (id: number) => void
}

/** An outline keeps ancestors visible while independently opening each branch. */
export function SkillHierarchyOutline({ tree, documents, groupNodeIds, selectedId, focusId, onSelect, onFocus }: Props) {
  const focus = tree.nodes[focusId] ?? tree.nodes[tree.rootId]
  const scopeId = focus?.id ?? tree.rootId
  const [expansion, setExpansion] = useState(() => ({ tree, ids: new Set([scopeId]) }))
  const expanded = expansion.tree === tree ? expansion.ids : new Set([scopeId])
  const sectionRef = useRef<HTMLElement>(null)
  const navigationTarget = useRef<number | null>(null)
  const idPrefix = useId()
  const parents = useMemo(() => getSkillHierarchyParents(tree), [tree])
  const groupIndex = useMemo(() => new Map(groupNodeIds.map((id, index) => [id, index])), [groupNodeIds])
  const groupBoundaries = useMemo(() => new Set(groupNodeIds), [groupNodeIds])
  const path = useMemo(() => getSkillHierarchyPath(tree, scopeId, parents), [tree, scopeId, parents])
  const selectedPath = useMemo(() => new Set(selectedId === null ? [] : getSkillHierarchyPath(tree, selectedId, parents)),
    [tree, selectedId, parents])
  const groupCounts = useMemo(() => {
    const counts = new Map<number, number>()
    const visit = (id: number): number => {
      const node = tree.nodes[id]
      if (!node) return 0
      const childrenCount = node.left === null ? 0 : visit(node.left) + visit(node.right!)
      const count = groupBoundaries.has(id) ? 1 : childrenCount
      counts.set(id, count)
      return count
    }
    visit(tree.rootId)
    return counts
  }, [tree, groupBoundaries])

  useEffect(() => {
    setExpansion(previous => {
      if (previous.tree === tree && previous.ids.has(scopeId)) return previous
      const ids = previous.tree === tree ? new Set(previous.ids) : new Set<number>()
      ids.add(scopeId)
      return { tree, ids }
    })
    if (navigationTarget.current === scopeId) {
      sectionRef.current?.querySelector<HTMLButtonElement>(`[data-outline-select="${scopeId}"]`)?.focus()
      navigationTarget.current = null
    }
  }, [tree, scopeId])

  if (!focus) return null

  const nodeTitle = (id: number) => {
    const node = tree.nodes[id]
    if (node.left === null) {
      const doc = documents[node.documentIndices[0]]
      return doc ? `${doc.operatorName} S${doc.skillIndex}` : 'スキル'
    }
    return node.representativeTerms.slice(0, 2).join('・') || 'まとまり'
  }
  const nodeLabel = (id: number) => {
    const group = groupIndex.get(id)
    return `${id === tree.rootId ? '全体 · ' : ''}${group === undefined ? '' : `G${group + 1} · `}${nodeTitle(id)}`
  }
  const navigate = (id: number) => {
    if (!tree.nodes[id] || id === scopeId) return
    navigationTarget.current = id
    onFocus(id)
  }
  const toggle = (id: number) => {
    if (expanded.has(id) && selectedId !== id && selectedPath.has(id)) onSelect(id)
    setExpansion(previous => {
      const ids = new Set(previous.tree === tree ? previous.ids : [scopeId])
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return { tree, ids }
    })
  }
  const renderNode = (id: number, depth: number): ReactElement => {
    const node = tree.nodes[id]
    const children = getSkillHierarchyDisplayChildren(tree, id, groupBoundaries)
    const isOpen = expanded.has(id)
    const group = groupIndex.get(id)
    const childrenId = `${idPrefix}-children-${id}`
    return <li key={id} className="skill-hierarchy-outline-node">
      <div className="skill-hierarchy-outline-row" data-selected={id === selectedId}>
        {children.length > 0 ? <button type="button" className="skill-hierarchy-outline-toggle"
          aria-label={`${nodeLabel(id)}、${node.count}件を${isOpen ? '閉じる' : '開く'}`}
          aria-expanded={isOpen} aria-controls={childrenId} onClick={() => toggle(id)}>
          <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
        </button> : <span className="skill-hierarchy-outline-spacer" aria-hidden="true" />}
        <button type="button" className="skill-hierarchy-outline-select" aria-pressed={id === selectedId}
          data-outline-select={id} onClick={() => onSelect(id)} aria-label={`${nodeLabel(id)}、説明文${node.count}件を選択`}>
          <span className="skill-hierarchy-outline-name">
            {id === tree.rootId && <span className="skill-hierarchy-outline-root-label">全体</span>}
            {group !== undefined && <span className="skill-hierarchy-outline-group">G{group + 1}</span>}
            <span>{nodeTitle(id)}</span>
          </span>
          <span className="skill-hierarchy-outline-count">{node.count}件</span>
        </button>
      </div>
      {children.length > 0 && <div id={childrenId} className={`skill-hierarchy-outline-children skill-hierarchy-outline-depth-${depth}`} hidden={!isOpen}>
        {isOpen && <>
          {depth >= 3 && <div className={`skill-hierarchy-outline-zoom${depth < 5 ? ' skill-hierarchy-outline-zoom-mobile' : ''}`}>
            <button type="button" className="button secondary" onClick={() => navigate(id)}>この枝に絞る</button>
          </div>}
          {depth < 5 && <ul className="skill-hierarchy-outline-list">{children.map(childId => renderNode(childId, depth + 1))}</ul>}
        </>}
      </div>}
    </li>
  }
  const parent = parents.get(scopeId)
  const count = groupCounts.get(scopeId) ?? 0
  const containingGroupId = path.find(id => groupIndex.has(id))
  const containingGroup = containingGroupId === undefined ? undefined : groupIndex.get(containingGroupId)

  return <section ref={sectionRef} className="skill-hierarchy-outline" aria-label="スキル説明文の展開ツリー">
    <nav className="skill-hierarchy-outline-toolbar" aria-label="表示する階層">
      <div className="skill-hierarchy-outline-navigation">
        <button type="button" className="button secondary" disabled={scopeId === tree.rootId} onClick={() => navigate(tree.rootId)}>全体</button>
        <button type="button" className="button secondary" disabled={parent === undefined} onClick={() => { if (parent !== undefined) navigate(parent) }}>上へ</button>
      </div>
      <label className="skill-hierarchy-outline-scope"><span>表示範囲</span>
        <select value={scopeId} onChange={event => navigate(Number(event.target.value))}>
          {path.map(id => <option key={id} value={id}>{nodeLabel(id)} · {tree.nodes[id].count}件</option>)}
        </select>
      </label>
    </nav>
    <div className="skill-hierarchy-outline-status">
      <span>説明文 {focus.count}件</span>
      <span>{count > 0 ? `${count}分類` : containingGroup === undefined ? '' : `所属 G${containingGroup + 1}`}</span>
    </div>
    <ul className="skill-hierarchy-outline-list skill-hierarchy-outline-tree">{renderNode(scopeId, 0)}</ul>
  </section>
}
