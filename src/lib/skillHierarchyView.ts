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

/** Flatten tied merges for display, keeping the current partition's group boundaries visible. */
export function getSkillHierarchyDisplayChildren(tree: SkillHierarchyTree, nodeId: number,
  groupNodeIds: ReadonlySet<number>): number[] {
  const node = tree.nodes[nodeId]
  if (!node || node.left === null || node.right === null) return []
  const children: number[] = []
  const pending = [node.right, node.left]
  while (pending.length > 0) {
    const child = tree.nodes[pending.pop()!]
    if (child.left !== null && child.right !== null
      && child.distance === node.distance && !groupNodeIds.has(child.id)) {
      pending.push(child.right, child.left)
    } else {
      children.push(child.id)
    }
  }
  return children
}

/** The actual tree path, including its root and destination, for revealing a selected node. */
export function getSkillHierarchyPath(tree: SkillHierarchyTree, nodeId: number,
  parents: ReadonlyMap<number, number> = getSkillHierarchyParents(tree)): number[] {
  if (!tree.nodes[nodeId] || !tree.nodes[tree.rootId]) return []
  const path: number[] = []
  const visited = new Set<number>()
  let current: number | undefined = nodeId
  while (current !== undefined && tree.nodes[current] && !visited.has(current)) {
    path.push(current)
    if (current === tree.rootId) return path.reverse()
    visited.add(current)
    current = parents.get(current)
  }
  return []
}
