import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { SkillClusteringDocument } from '../lib/skillClusteringData'
import type { SkillHierarchyTree } from '../lib/skillHierarchical'
import { getSkillHierarchyFrontier, getSkillHierarchyParents } from '../lib/skillHierarchyView'
import './SkillHierarchyDendrogram.css'

interface Props {
  tree: SkillHierarchyTree
  documents: readonly SkillClusteringDocument[]
  threshold: number
  groupNodeIds: readonly number[]
  selectedId: number | null
  focusId: number
  expanded: boolean
  onSelect: (id: number) => void
  onFocus: (id: number, expanded: boolean) => void
}

export function SkillHierarchyDendrogram({ tree, documents, threshold, groupNodeIds, selectedId,
  focusId, expanded, onSelect, onFocus }: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(500)
  const svgId = useId()
  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    let frame = 0, measuredWidth = 0
    const measure = () => {
      const next = Math.floor(plot.getBoundingClientRect().width)
      if (next <= 0 || next === measuredWidth) return
      measuredWidth = next
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setWidth(current => current === next ? current : next))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(plot)
    if (!observer) window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(frame) }
  }, [])
  const focus = tree.nodes[focusId] ?? tree.nodes[tree.rootId]
  const parents = useMemo(() => getSkillHierarchyParents(tree), [tree])
  const frontier = useMemo(() => getSkillHierarchyFrontier(tree, focus?.id ?? -1, threshold, selectedId, expanded),
    [tree, focus?.id, threshold, selectedId, expanded])
  const groupIndex = useMemo(() => new Map(groupNodeIds.map((id, index) => [id, index])), [groupNodeIds])
  const groupsBelow = useMemo(() => {
    const counts = new Map<number, number>()
    const visit = (id: number): number => {
      const node = tree.nodes[id]
      const count = groupIndex.has(id) ? 1 : node.left === null ? 0 : visit(node.left) + visit(node.right!)
      counts.set(id, count)
      return count
    }
    if (tree.rootId >= 0) visit(tree.rootId)
    return counts
  }, [tree, groupIndex])
  if (!focus) return null
  const label = (id: number) => {
    const node = tree.nodes[id], group = groupIndex.get(id)
    if (group !== undefined) return `G${group + 1}`
    if (node.left === null) {
      const doc = documents[node.documentIndices[0]]
      return doc ? `${doc.operatorName} S${doc.skillIndex}` : 'スキル'
    }
    return `枝 ${id + 1}`
  }
  const height = 20 + frontier.length * 56 + 58
  const left = 9, right = Math.max(left + 1, width - 12), bottom = height - 44
  const x = (value: number) => left + (right - left) * value
  const yById = new Map(frontier.map((id, index) => [id, 48 + index * 56]))
  const ends = new Set(frontier)
  const paths: { id: number; d: string }[] = []
  const walk = (id: number): number => {
    if (ends.has(id)) return yById.get(id)!
    const node = tree.nodes[id], a = tree.nodes[node.left!], b = tree.nodes[node.right!]
    const ya = walk(a.id), yb = walk(b.id)
    paths.push({ id, d: `M ${x(a.distance)} ${ya} H ${x(node.distance)} V ${yb} H ${x(b.distance)}` })
    return (ya + yb) / 2
  }
  walk(focus.id)
  const ticks = width < 300 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]
  const parent = parents.get(focus.id)
  return <section className="skill-hierarchy-diagram" aria-label="スキル説明文の樹形図">
    <div className="skill-hierarchy-diagram-toolbar">
      <div className="skill-hierarchy-path"><button type="button" className="button secondary" disabled={focus.id === tree.rootId && !expanded} onClick={() => onFocus(tree.rootId, false)}>全体</button>
        {parent !== undefined && <button type="button" className="button secondary" onClick={() => onFocus(parent, true)}>上の枝へ</button>}
        {focus.id !== tree.rootId && <span>{label(focus.id)} · {focus.count}件</span>}
      </div><span>表示 {frontier.length}枝</span>
    </div>
    <div className="skill-hierarchy-tree-grid">
      <div className="skill-hierarchy-tree-labels">
        {frontier.map(id => {
          const node = tree.nodes[id], below = groupsBelow.get(id) ?? 0
          return <button type="button" key={id} aria-pressed={id === selectedId} onClick={() => onSelect(id)}
            aria-label={`${label(id)}、${node.count}件${below > 1 ? `、${below}分類` : ''}`}>
            <span>{label(id)} · {node.count}件</span>
            <span>{below > 1 ? `${below}分類` : node.representativeTerms.slice(0, 2).join('・') || '—'}</span>
          </button>
        })}
      </div>
      <div ref={plotRef} className="skill-hierarchy-tree-plot">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${svgId}-title ${svgId}-description`}>
          <title id={`${svgId}-title`}>スキル説明文の樹形図</title>
          <desc id={`${svgId}-description`}>横軸は結合時のコサイン距離。破線は区切り距離{threshold.toFixed(4)}。左のボタンで枝を選択。</desc>
          {ticks.map(tick => <line key={tick} x1={x(tick)} x2={x(tick)} y1={20} y2={bottom} className="hierarchy-grid" />)}
          {paths.map(path => <path key={path.id} d={path.d} className="hierarchy-branch" />)}
          {frontier.map(id => {
            const node = tree.nodes[id], y = yById.get(id)!
            return node.left === null || node.distance === 0
              ? <circle key={id} cx={x(0)} cy={y} r={3} className={id === selectedId ? 'hierarchy-leaf selected' : 'hierarchy-leaf'} />
              : <path key={id} d={`M ${x(0)} ${y - 9} L ${x(node.distance)} ${y} L ${x(0)} ${y + 9} Z`}
                className={id === selectedId ? 'hierarchy-collapsed selected' : 'hierarchy-collapsed'} />
          })}
          <line x1={x(threshold)} x2={x(threshold)} y1={12} y2={bottom} className="hierarchy-cut" />
          {ticks.map(tick => <text key={tick} x={x(tick)} y={bottom + 20} textAnchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'}>{tick.toFixed(2)}</text>)}
          <text x={(left + right) / 2} y={height - 4} textAnchor="middle" className="hierarchy-axis-title">結合距離</text>
        </svg>
      </div>
    </div>
  </section>
}
