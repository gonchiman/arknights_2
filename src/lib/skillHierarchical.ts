import type { SkillClusteringFeatures, SkillClusteringSparseVector } from './skillClusteringData.ts'
import { calculateSkillClusteringSilhouette } from './skillClusteringSilhouette.ts'

export type HierarchicalLinkage = 'average' | 'complete'

export interface SkillHierarchyNode {
  id: number
  left: number | null
  right: number | null
  distance: number
  count: number
  documentIndices: number[]
  representativeTerms: string[]
  representativeIndex: number
}

export interface SkillHierarchyTree {
  nodes: SkillHierarchyNode[]
  rootId: number
  /** Original corpus length, including documents without usable terms. */
  documentCount: number
  /** Row order of the square, row-major cosine-distance matrix. */
  documentIndices: number[]
  excludedIndices: number[]
  termsCount: number
  linkage: HierarchicalLinkage
  distances: Float64Array
  recommendedThreshold: number
  autoCandidates: { threshold: number; groupCount: number; silhouette: number }[]
}

export interface SkillHierarchyPartition {
  threshold: number
  groupNodeIds: number[]
  /** Group positions aligned to the original corpus; excluded documents are -1. */
  assignments: number[]
  silhouette: number | null
}

export interface SkillHierarchyProgress {
  phase: 'distances' | 'merging' | 'evaluating'
  completed: number
  total: number
}

/** Agglomerative clustering with exact cosine distances and a global pair heap. */
export function buildSkillHierarchy(
  features: SkillClusteringFeatures,
  linkage: HierarchicalLinkage,
  onProgress?: (progress: SkillHierarchyProgress) => void,
): SkillHierarchyTree {
  validateFeatures(features)
  if (linkage !== 'average' && linkage !== 'complete') throw new RangeError('結合方法が不正です。')
  const n = features.vectors.length
  const vectors = features.vectors.map((vector) => {
    const norm = Math.sqrt(vector.values.reduce((sum, value) => sum + value * value, 0))
    return { indices: vector.indices, values: vector.values.map((value) => value / norm) }
  })
  const squaredNorms = vectors.map((vector) => vector.values.reduce((sum, value) => sum + value * value, 0))
  const nodes: SkillHierarchyNode[] = []
  const tree: SkillHierarchyTree = {
    nodes, rootId: -1, documentCount: features.documentCount,
    documentIndices: [...features.documentIndices], excludedIndices: [...features.excludedIndices],
    termsCount: features.terms.length, linkage, distances: new Float64Array(n * n),
    recommendedThreshold: 0, autoCandidates: [],
  }
  const localIndices = new Int32Array(features.documentCount).fill(-1)
  features.documentIndices.forEach((documentIndex, row) => { localIndices[documentIndex] = row })
  const maxNodes = Math.max(0, 2 * n - 1)
  const active = new Uint8Array(maxNodes)
  const firstLeaves = new Int32Array(maxNodes)
  const sums: (Float64Array | undefined)[] = []
  const summarize = (documentIndices: number[], sum: Float64Array) => {
    const representativeTerms = [...sum].map((weight, term) => ({ weight, term: features.terms[term] }))
      .filter(({ weight, term }) => weight > 0 && [...term].length >= 2)
      .sort((left, right) => right.weight - left.weight || compareText(left.term, right.term))
      .slice(0, 5).map(({ term }) => term)
    let representativeIndex = -1
    let bestDot = -Infinity
    // All vectors have unit norm, so nearest to the mean has the greatest dot product.
    for (const documentIndex of documentIndices) {
      const vector = vectors[localIndices[documentIndex]]
      let dot = 0
      for (let offset = 0; offset < vector.indices.length; offset += 1) dot += vector.values[offset] * sum[vector.indices[offset]]
      if (dot > bestDot || (dot === bestDot && documentIndex < representativeIndex)) {
        bestDot = dot
        representativeIndex = documentIndex
      }
    }
    return { representativeTerms, representativeIndex }
  }
  vectors.forEach((vector, row) => {
    const sum = new Float64Array(features.terms.length)
    vector.indices.forEach((term, offset) => { sum[term] = vector.values[offset] })
    const documentIndices = [features.documentIndices[row]]
    nodes.push({ id: row, left: null, right: null, distance: 0, count: 1, documentIndices, ...summarize(documentIndices, sum) })
    sums.push(sum)
    active[row] = 1
    firstLeaves[row] = row
  })

  // Lower triangle for all cluster IDs. Heap entries are immutable; stale pairs are skipped.
  // At most (n - 1)^2 pairs are ever inserted, giving O(n² log n) time and O(n²) space.
  const clusterDistances = new Float64Array(maxNodes * Math.max(0, maxNodes - 1) / 2)
  const heap = new PairHeap(Math.max(0, (n - 1) ** 2))
  const pairTotal = n * (n - 1) / 2
  let pairsDone = 0
  onProgress?.({ phase: 'distances', completed: 0, total: pairTotal })
  for (let row = 0; row < n; row += 1) {
    for (let other = 0; other < row; other += 1) {
      const distance = cosineDistance(vectors[row], vectors[other], squaredNorms[row], squaredNorms[other])
      tree.distances[row * n + other] = distance
      tree.distances[other * n + row] = distance
      clusterDistances[pairIndex(row, other)] = distance
      heap.push(other, row, distance)
      pairsDone += 1
    }
    onProgress?.({ phase: 'distances', completed: pairsDone, total: pairTotal })
  }
  const mergeTotal = Math.max(0, n - 1)
  onProgress?.({ phase: 'merging', completed: 0, total: mergeTotal })
  for (let merged = 0; merged < mergeTotal; merged += 1) {
    let pair = heap.pop()
    while (pair && (!active[pair.left] || !active[pair.right])) pair = heap.pop()
    if (!pair) throw new Error('階層の結合候補がありません。')
    const id = nodes.length
    const left = firstLeaves[pair.left] <= firstLeaves[pair.right] ? pair.left : pair.right
    const right = left === pair.left ? pair.right : pair.left
    const count = nodes[left].count + nodes[right].count
    const documentIndices = [...nodes[left].documentIndices, ...nodes[right].documentIndices]
    const sum = sums[left]!
    const rightSum = sums[right]!
    for (let term = 0; term < sum.length; term += 1) sum[term] += rightSum[term]
    nodes.push({ id, left, right, distance: pair.distance, count, documentIndices, ...summarize(documentIndices, sum) })
    sums[id] = sum
    sums[left] = undefined
    sums[right] = undefined
    firstLeaves[id] = firstLeaves[left]
    active[left] = 0
    active[right] = 0
    for (let other = 0; other < id; other += 1) {
      if (!active[other]) continue
      const leftDistance = clusterDistances[pairIndex(left, other)]
      const rightDistance = clusterDistances[pairIndex(right, other)]
      const combined = linkage === 'complete' || leftDistance === rightDistance ? Math.max(leftDistance, rightDistance)
        : (nodes[left].count * leftDistance + nodes[right].count * rightDistance) / count
      // The linkage is monotone; suppress only a downward floating-point rounding step.
      const distance = Math.min(1, Math.max(pair.distance, combined))
      clusterDistances[pairIndex(id, other)] = distance
      heap.push(other, id, distance)
    }
    active[id] = 1
    onProgress?.({ phase: 'merging', completed: merged + 1, total: mergeTotal })
  }
  tree.rootId = nodes.length - 1
  tree.recommendedThreshold = tree.rootId < 0 ? 0 : nodes[tree.rootId].distance

  // Evaluate every feasible partition with 2 <= groups < n. A threshold cannot split
  // merges of equal height, even if their binary order differs; zero-height merges count too.
  const thresholds: number[] = []
  for (let end = n; end < nodes.length; end += 1) {
    if (end + 1 < nodes.length && nodes[end + 1].distance === nodes[end].distance) continue
    const groups = n - (end - n + 1)
    if (groups >= 2 && groups < n) thresholds.push(nodes[end].distance)
  }
  onProgress?.({ phase: 'evaluating', completed: 0, total: thresholds.length })
  let bestSilhouette = -Infinity
  thresholds.forEach((threshold, index) => {
    const partition = evaluateSkillHierarchyCut(tree, threshold)
    if (partition.silhouette !== null) {
      tree.autoCandidates.push({ threshold, groupCount: partition.groupNodeIds.length, silhouette: partition.silhouette })
      // Thresholds ascend: a tie selects the simpler partition with fewer groups.
      if (partition.silhouette >= bestSilhouette) {
        bestSilhouette = partition.silhouette
        tree.recommendedThreshold = threshold
      }
    }
    onProgress?.({ phase: 'evaluating', completed: index + 1, total: thresholds.length })
  })
  return tree
}

/** Return whole subtrees whose merge heights are <= threshold, in dendrogram order. */
export function cutSkillHierarchy(tree: SkillHierarchyTree, threshold: number): number[] {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError('結合距離は0〜1で指定してください。')
  if (tree.rootId < 0) return []
  const groups: number[] = []
  const pending = [tree.rootId]
  while (pending.length) {
    const id = pending.pop()!
    const node = tree.nodes[id]
    if (node.left === null || node.right === null || node.distance <= threshold) groups.push(id)
    else pending.push(node.right, node.left)
  }
  return groups
}

export function evaluateSkillHierarchyCut(tree: SkillHierarchyTree, threshold: number): SkillHierarchyPartition {
  const groupNodeIds = cutSkillHierarchy(tree, threshold)
  const assignments = Array<number>(tree.documentCount).fill(-1)
  groupNodeIds.forEach((id, group) => tree.nodes[id].documentIndices.forEach((index) => { assignments[index] = group }))
  const groups = tree.documentIndices.map((index) => assignments[index])
  return { threshold, groupNodeIds, assignments, silhouette: calculateSkillClusteringSilhouette(tree.distances, groups) }
}

function cosineDistance(left: SkillClusteringSparseVector, right: SkillClusteringSparseVector, leftNorm: number, rightNorm: number): number {
  let first = 0
  let second = 0
  let dot = 0
  while (first < left.indices.length && second < right.indices.length) {
    if (left.indices[first] < right.indices[second]) first += 1
    else if (left.indices[first] > right.indices[second]) second += 1
    else {
      dot += left.values[first] * right.values[second]
      first += 1
      second += 1
    }
  }
  // TF-IDF is nonnegative. Roundoff must not produce a distance outside [0, 1].
  return Math.max(0, Math.min(1, 1 - dot / Math.sqrt(leftNorm * rightNorm)))
}

function pairIndex(first: number, second: number): number {
  const high = Math.max(first, second)
  return high * (high - 1) / 2 + Math.min(first, second)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateFeatures(features: SkillClusteringFeatures): void {
  if (!features || !Array.isArray(features.terms) || !Array.isArray(features.vectors)
    || !Number.isSafeInteger(features.documentCount) || features.documentCount < 0
    || !Array.isArray(features.documentIndices) || features.documentIndices.length !== features.vectors.length
    || !Array.isArray(features.excludedIndices)
    || features.terms.some((term) => typeof term !== 'string' || !term.length)
    || new Set(features.terms).size !== features.terms.length) throw new RangeError('説明文の特徴量が不正です。')
  const indices = [...features.documentIndices, ...features.excludedIndices]
  if (indices.length !== features.documentCount || new Set(indices).size !== features.documentCount
    || indices.some((index) => !Number.isInteger(index) || index < 0 || index >= features.documentCount)) {
    throw new RangeError('説明文と特徴量の対応が不正です。')
  }
  for (const vector of features.vectors) {
    if (!vector || !Array.isArray(vector.indices) || !Array.isArray(vector.values) || vector.indices.length === 0
      || vector.indices.length !== vector.values.length
      || vector.indices.some((index, offset) => !Number.isInteger(index) || index < 0 || index >= features.terms.length
        || (offset > 0 && vector.indices[offset - 1] >= index))
      || vector.values.some((value) => !Number.isFinite(value) || value < 0)) throw new RangeError('説明文の特徴量が不正です。')
    const squaredNorm = vector.values.reduce((sum, value) => sum + value * value, 0)
    if (!Number.isFinite(squaredNorm) || squaredNorm <= 0) throw new RangeError('説明文の特徴量が不正です。')
  }
}

/** Compact typed-array heap avoids allocating an object for every queued pair. */
class PairHeap {
  private size = 0
  private readonly left: Int32Array
  private readonly right: Int32Array
  private readonly distances: Float64Array

  constructor(capacity: number) {
    this.left = new Int32Array(capacity)
    this.right = new Int32Array(capacity)
    this.distances = new Float64Array(capacity)
  }

  push(left: number, right: number, distance: number): void {
    let at = this.size++
    while (at > 0) {
      const parent = (at - 1) >>> 1
      if (!this.before(distance, left, right, parent)) break
      this.copy(parent, at)
      at = parent
    }
    this.left[at] = left
    this.right[at] = right
    this.distances[at] = distance
  }

  pop(): { left: number; right: number; distance: number } | null {
    if (this.size === 0) return null
    const result = { left: this.left[0], right: this.right[0], distance: this.distances[0] }
    const last = --this.size
    if (last === 0) return result
    const left = this.left[last]
    const right = this.right[last]
    const distance = this.distances[last]
    let at = 0
    while (at * 2 + 1 < last) {
      let next = at * 2 + 1
      if (next + 1 < last && this.before(this.distances[next + 1], this.left[next + 1], this.right[next + 1], next)) next += 1
      if (!this.before(this.distances[next], this.left[next], this.right[next], last)) break
      this.copy(next, at)
      at = next
    }
    this.left[at] = left
    this.right[at] = right
    this.distances[at] = distance
    return result
  }

  private before(distance: number, left: number, right: number, at: number): boolean {
    return distance < this.distances[at] || (distance === this.distances[at]
      && (left < this.left[at] || (left === this.left[at] && right < this.right[at])))
  }

  private copy(from: number, to: number): void {
    this.left[to] = this.left[from]
    this.right[to] = this.right[from]
    this.distances[to] = this.distances[from]
  }
}
