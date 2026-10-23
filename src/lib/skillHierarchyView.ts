import type { SkillHierarchyTree } from './skillHierarchical.ts'

/** Bound the visible frontier without losing leaves; retain the path to a selected node. */
export function getSkillHierarchyFrontier(tree: SkillHierarchyTree, focusId: number, threshold: number,
  selectedId: number | null, expanded: boolean, limit = 8): number[] {
  const focus = tree.nodes[focusId]
  if (!focus) return []
  const ancestors = new Set<number>()
  if (selectedId !== null && tree.nodes[selectedId]) {
    const parents = new Map<number, number>()
    tree.nodes.forEach(node => {
      if (node.left !== null) parents.set(node.left, node.id)
      if (node.right !== null) parents.set(node.right, node.id)
    })
    let current = parents.get(selectedId)
    while (current !== undefined) { ancestors.add(current); current = parents.get(current) }
  }
  const frontier = [focusId]
  while (frontier.length < Math.max(2, limit)) {
    const candidates = frontier.map(id => tree.nodes[id]).filter(node => node.left !== null
      && (node.distance > threshold || (expanded && frontier.length === 1)))
      .sort((a, b) => Number(ancestors.has(b.id)) - Number(ancestors.has(a.id)) || b.distance - a.distance || a.id - b.id)
    const next = candidates[0]
    if (!next) break
    frontier.splice(frontier.indexOf(next.id), 1, next.left!, next.right!)
  }
  return frontier
}

export function getSkillHierarchyParents(tree: SkillHierarchyTree): Map<number, number> {
  const parents = new Map<number, number>()
  tree.nodes.forEach(node => {
    if (node.left !== null) parents.set(node.left, node.id)
    if (node.right !== null) parents.set(node.right, node.id)
  })
  return parents
}
