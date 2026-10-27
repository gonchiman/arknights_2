import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSkillHierarchyDisplayChildren, getSkillHierarchyFrontier, getSkillHierarchyParents, getSkillHierarchyPath,
} from '../src/lib/skillHierarchyView.ts'
import type { SkillHierarchyNode, SkillHierarchyTree } from '../src/lib/skillHierarchical.ts'

/** Balanced tree with higher merge distances on the right, making selection priority observable. */
function makeTree(): SkillHierarchyTree {
  const nodes: SkillHierarchyNode[] = Array.from({ length: 16 }, (_, id) => ({
    id, left: null, right: null, distance: 0, count: 1, documentIndices: [id],
    representativeTerms: [], representativeIndex: id,
  }))
  const merge = (left: number, right: number, distance: number) => {
    const documentIndices = [...nodes[left].documentIndices, ...nodes[right].documentIndices]
    nodes.push({ id: nodes.length, left, right, distance, count: documentIndices.length,
      documentIndices, representativeTerms: [], representativeIndex: documentIndices[0] })
  }
  for (let pair = 0; pair < 8; pair += 1) merge(pair * 2, pair * 2 + 1, 0.05 + pair * 0.025)
  merge(16, 17, 0.3)
  merge(18, 19, 0.4)
  merge(20, 21, 0.5)
  merge(22, 23, 0.6)
  merge(24, 25, 0.7)
  merge(26, 27, 0.8)
  merge(28, 29, 0.95)
  return {
    nodes, rootId: 30, documentCount: 16, documentIndices: Array.from({ length: 16 }, (_, id) => id),
    excludedIndices: [], termsCount: 0, linkage: 'average', distances: new Float64Array(16 * 16),
    recommendedThreshold: 0.25, autoCandidates: [],
  }
}

function assertLeafCoverage(tree: SkillHierarchyTree, focusId: number, frontier: number[], label = '') {
  const covered = frontier.flatMap(id => tree.nodes[id].documentIndices)
  assert.equal(new Set(covered).size, covered.length, `overlapping leaves: ${label}`)
  assert.deepEqual([...covered].sort((a, b) => a - b), [...tree.nodes[focusId].documentIndices].sort((a, b) => a - b),
    `missing or unrelated leaves: ${label}`)
}

test('frontier respects the default eight-node bound and requested integer limits', () => {
  const tree = makeTree()
  const defaults = getSkillHierarchyFrontier(tree, tree.rootId, 0, null, false)
  assert.equal(defaults.length, 8)
  assertLeafCoverage(tree, tree.rootId, defaults)
  for (const limit of [2, 3, 4, 7, 8, 12, 16, 24]) {
    const frontier = getSkillHierarchyFrontier(tree, tree.rootId, 0, null, false, limit)
    assert.equal(frontier.length, Math.min(limit, 16))
    assertLeafCoverage(tree, tree.rootId, frontier, `limit ${limit}`)
  }
})

test('every frontier covers exactly the focused leaves without overlaps across cuts and selections', () => {
  const tree = makeTree()
  for (const focusId of [tree.rootId, 28, 29, 24, 16, 0]) {
    for (const threshold of [0, 0.25, 0.4, 0.65, 0.95, 1]) {
      for (const limit of [2, 3, 5, 8, 20]) {
        for (const expanded of [false, true]) {
          for (const selectedId of [null, 0, 16, 23, 29]) {
            const frontier = getSkillHierarchyFrontier(tree, focusId, threshold, selectedId, expanded, limit)
            const label = JSON.stringify({ focusId, threshold, limit, expanded, selectedId })
            assert.ok(frontier.length <= limit, label)
            assertLeafCoverage(tree, focusId, frontier, label)
          }
        }
      }
    }
  }
})

test('completed threshold groups stay collapsed, including merges exactly on the threshold', () => {
  const tree = makeTree()
  const frontier = getSkillHierarchyFrontier(tree, tree.rootId, 0.65, null, false, 20)
  assert.deepEqual(frontier, [24, 25, 26, 27])
  for (const id of frontier) assert.ok(tree.nodes[id].distance <= 0.65)
  assert.deepEqual(getSkillHierarchyFrontier(tree, tree.rootId, 0.25, null, false, 20), [16, 17, 18, 19, 20, 21, 22, 23])
  assert.deepEqual(getSkillHierarchyFrontier(tree, tree.rootId, 0.95, null, false), [tree.rootId])
  assert.deepEqual(getSkillHierarchyFrontier(tree, 24, 0.3, null, false), [24])
})

test('manual expansion reveals the focused node children while preserving completed descendants', () => {
  const tree = makeTree()
  assert.deepEqual(getSkillHierarchyFrontier(tree, tree.rootId, 1, null, false), [tree.rootId])
  const rootExpanded = getSkillHierarchyFrontier(tree, tree.rootId, 1, null, true)
  assert.deepEqual(rootExpanded, [28, 29])
  assertLeafCoverage(tree, tree.rootId, rootExpanded)
  assert.deepEqual(getSkillHierarchyFrontier(tree, 24, 0.3, null, true), [16, 17])
  assert.deepEqual(getSkillHierarchyFrontier(tree, 16, 0.25, null, true), [0, 1])
  assert.deepEqual(getSkillHierarchyFrontier(tree, 0, 1, null, true), [0])
})

test('a selected group is exposed within the budget before higher-distance unrelated branches', () => {
  const tree = makeTree()
  const unselected = getSkillHierarchyFrontier(tree, tree.rootId, 0.25, null, false, 4)
  assert.deepEqual(unselected, [24, 25, 26, 27])
  const selected = getSkillHierarchyFrontier(tree, tree.rootId, 0.25, 16, false, 4)
  assert.deepEqual(selected, [16, 17, 25, 29])
  assertLeafCoverage(tree, tree.rootId, selected)
  assert.deepEqual(getSkillHierarchyFrontier(tree, tree.rootId, 0, 0, false, 5), [0, 1, 17, 25, 29])
  const tooSmall = getSkillHierarchyFrontier(tree, tree.rootId, 0.25, 16, false, 3)
  assert.deepEqual(tooSmall, [24, 25, 29])
  assert.equal(tooSmall.filter(id => tree.nodes[id].documentIndices.includes(0)).length, 1)
  assertLeafCoverage(tree, tree.rootId, tooSmall)
})

test('selection outside the focus or an invalid selection does not alter its frontier', () => {
  const tree = makeTree()
  const expected = getSkillHierarchyFrontier(tree, 29, 0, null, false, 3)
  assert.deepEqual(getSkillHierarchyFrontier(tree, 29, 0, 16, false, 3), expected)
  assert.deepEqual(getSkillHierarchyFrontier(tree, 29, 0, -1, false, 3), expected)
  assert.deepEqual(getSkillHierarchyFrontier(tree, 29, 0, 1000, false, 3), expected)
})

test('parent mapping includes leaves and internal nodes, omits the root, and supports upward navigation', () => {
  const tree = makeTree()
  const parents = getSkillHierarchyParents(tree)
  assert.equal(parents.size, tree.nodes.length - 1)
  assert.equal(parents.has(tree.rootId), false)
  assert.deepEqual([parents.get(0), parents.get(1), parents.get(15)], [16, 16, 23])
  const path = [0]
  while (parents.has(path.at(-1)!)) path.push(parents.get(path.at(-1)!)!)
  assert.deepEqual(path, [0, 16, 24, 28, 30])
  assert.equal(parents.get(29), tree.rootId)
  assert.equal(parents.get(999), undefined)
})

test('invalid focus and empty trees yield no visible frontier or parent mapping', () => {
  const tree = makeTree()
  for (const focusId of [-1, 31, 1000]) {
    assert.deepEqual(getSkillHierarchyFrontier(tree, focusId, 0, 16, true), [])
  }
  const empty = { ...tree, nodes: [], rootId: -1, documentCount: 0, documentIndices: [], distances: new Float64Array() }
  assert.deepEqual(getSkillHierarchyFrontier(empty, empty.rootId, 0, null, false), [])
  assert.equal(getSkillHierarchyParents(empty).size, 0)
})

test('display children flatten whole chains of exactly tied merges in leaf order', () => {
  const tree = makeTree()
  for (const id of [24, 25, 28, 29]) tree.nodes[id].distance = tree.nodes[tree.rootId].distance
  const originalNodes = structuredClone(tree.nodes)
  const children = getSkillHierarchyDisplayChildren(tree, tree.rootId, new Set())
  assert.deepEqual(children, [16, 17, 18, 19, 26, 27])
  assert.deepEqual(children.flatMap(id => tree.nodes[id].documentIndices), tree.nodes[tree.rootId].documentIndices)
  assert.equal(children.reduce((sum, id) => sum + tree.nodes[id].count, 0), tree.documentCount)
  assertLeafCoverage(tree, tree.rootId, children)
  assert.deepEqual(tree.nodes, originalNodes, 'display flattening must not change the learned tree')
})

test('display flattening preserves tied group boundaries and allows expansion within those groups', () => {
  const tree = makeTree()
  for (const id of [16, 17, 24, 25, 28, 29]) tree.nodes[id].distance = tree.nodes[tree.rootId].distance
  const groups = new Set([24, 25, 26, 27])
  assert.deepEqual(getSkillHierarchyDisplayChildren(tree, tree.rootId, groups), [24, 25, 26, 27])
  const insideGroup = getSkillHierarchyDisplayChildren(tree, 24, groups)
  assert.deepEqual(insideGroup, [0, 1, 2, 3])
  assertLeafCoverage(tree, 24, insideGroup)
})

test('display children retain leaf nodes even when their distances equal the parent distance', () => {
  const tree = makeTree()
  for (const id of [16, 17, 24]) tree.nodes[id].distance = 0
  assert.deepEqual(getSkillHierarchyDisplayChildren(tree, 24, new Set()), [0, 1, 2, 3])
  assert.deepEqual(getSkillHierarchyDisplayChildren(tree, 24, new Set([16, 2, 3])), [16, 2, 3])
  assert.deepEqual(getSkillHierarchyDisplayChildren(tree, 0, new Set([0])), [])
})

test('distinct merge distances stay separate even when closer than a floating-point tolerance', () => {
  const tree = makeTree()
  tree.nodes[28].distance = tree.nodes[tree.rootId].distance - 1e-14
  tree.nodes[29].distance = tree.nodes[tree.rootId].distance
  assert.deepEqual(getSkillHierarchyDisplayChildren(tree, tree.rootId, new Set()), [28, 26, 27])
})

test('paths include every ancestor from the root to internal nodes and leaves', () => {
  const tree = makeTree()
  const parents = getSkillHierarchyParents(tree)
  assert.deepEqual(getSkillHierarchyPath(tree, tree.rootId), [tree.rootId])
  assert.deepEqual(getSkillHierarchyPath(tree, 0), [30, 28, 24, 16, 0])
  assert.deepEqual(getSkillHierarchyPath(tree, 23, parents), [30, 29, 27, 23])
  for (const node of tree.nodes) {
    const path = getSkillHierarchyPath(tree, node.id, parents)
    assert.equal(path[0], tree.rootId)
    assert.equal(path.at(-1), node.id)
    assert.deepEqual(path, getSkillHierarchyPath(tree, node.id))
    path.slice(1).forEach((id, index) => assert.equal(parents.get(id), path[index]))
  }
})

test('invalid nodes, empty trees, and broken parent paths yield no display children or path', () => {
  const tree = makeTree()
  for (const nodeId of [-1, tree.nodes.length, 1000, Number.NaN, 0.5]) {
    assert.deepEqual(getSkillHierarchyDisplayChildren(tree, nodeId, new Set()), [])
    assert.deepEqual(getSkillHierarchyPath(tree, nodeId), [])
  }
  const empty = { ...tree, nodes: [], rootId: -1, documentCount: 0, documentIndices: [], distances: new Float64Array() }
  assert.deepEqual(getSkillHierarchyDisplayChildren(empty, -1, new Set()), [])
  assert.deepEqual(getSkillHierarchyPath(empty, -1), [])
  const parents = getSkillHierarchyParents(tree)
  parents.delete(16)
  assert.deepEqual(getSkillHierarchyPath(tree, 0, parents), [])
  parents.set(16, 0)
  assert.deepEqual(getSkillHierarchyPath(tree, 0, parents), [])
})
