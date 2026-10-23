import type { SkillClusteringFeatures } from './skillClusteringFeatures.ts'

export interface SkillHdbscanConfig {
  minClusterSize: number
  /** Includes the point itself, as in scikit-learn HDBSCAN. */
  minSamples: number
  clusterSelectionMethod: 'eom' | 'leaf'
}

export type SkillHdbscanStage = 'distances' | 'hierarchy' | 'extract'

export interface SkillHdbscanResult {
  config: SkillHdbscanConfig
  /** Original document order: -1 = density noise, -2 = no usable features. */
  assignments: number[]
  counts: number[]
  representativeTerms: string[][]
  representativeIndices: number[]
  noiseCount: number
  excludedCount: number
}

type SparseVector = SkillClusteringFeatures['vectors'][number]
interface Edge { left: number; right: number; distance: number }
interface HierarchyNode extends Edge { size: number }
interface CondensedCluster {
  parent: number
  birth: number
  stability: number
  children: number[]
}

/** Exact sparse Euclidean distance; direct differences preserve zero-distance duplicates. */
export function skillHdbscanEuclideanDistance(left: SparseVector, right: SparseVector): number {
  let first = 0
  let second = 0
  let squared = 0
  while (first < left.indices.length || second < right.indices.length) {
    const leftIndex = left.indices[first] ?? Infinity
    const rightIndex = right.indices[second] ?? Infinity
    let difference: number
    if (leftIndex === rightIndex) difference = left.values[first++] - right.values[second++]
    else if (leftIndex < rightIndex) difference = left.values[first++]
    else difference = right.values[second++]
    squared += difference * difference
  }
  return Math.sqrt(squared)
}

/**
 * HDBSCAN*: Euclidean mutual reachability → exact MST → condensed hierarchy → EOM/leaf.
 * Fixed options: alpha=1, cluster_selection_epsilon=0, allow_single_cluster=false.
 * Distance storage and Prim's algorithm are O(n²); no approximate neighbour search.
 */
export function runSkillHdbscan(
  features: SkillClusteringFeatures,
  settings: SkillHdbscanConfig,
  onStage?: (stage: SkillHdbscanStage) => void,
): SkillHdbscanResult {
  validateFeatures(features)
  const config = { ...settings }
  const count = features.vectors.length
  if (!Number.isSafeInteger(config.minClusterSize) || config.minClusterSize < 2) {
    throw new RangeError('最小グループ件数は2以上の整数で指定してください。')
  }
  if (!Number.isSafeInteger(config.minSamples) || config.minSamples < 1 || config.minSamples > count) {
    throw new RangeError(`密度判定の近傍数は1〜${count}の整数で指定してください。`)
  }
  if (config.clusterSelectionMethod !== 'eom' && config.clusterSelectionMethod !== 'leaf') {
    throw new RangeError('グループの選び方はeomまたはleafで指定してください。')
  }
  onStage?.('distances')
  // The root can never be selected, including the single-document case.
  if (count < config.minClusterSize) {
    onStage?.('hierarchy')
    onStage?.('extract')
    return summarize(features, config, Array<number>(count).fill(-1))
  }
  const distances = new Float64Array(count * count)
  for (let left = 0; left < count; left += 1) {
    for (let right = left + 1; right < count; right += 1) {
      const value = skillHdbscanEuclideanDistance(features.vectors[left], features.vectors[right])
      if (!Number.isFinite(value)) throw new RangeError('説明文の特徴量の距離が有限値になりません。')
      distances[left * count + right] = value
      distances[right * count + left] = value
    }
  }
  const coreDistances = new Float64Array(count)
  for (let row = 0; row < count; row += 1) {
    // The diagonal zero is included: min_samples=1 has core distance zero.
    coreDistances[row] = distances.slice(row * count, (row + 1) * count).sort()[config.minSamples - 1]
  }
  onStage?.('hierarchy')
  const hierarchy = buildHierarchy(minimumSpanningTree(distances, coreDistances, count), count)
  const { clusters, pointParents } = condenseHierarchy(hierarchy, count, config.minClusterSize)
  onStage?.('extract')
  const assignments = selectClusters(clusters, pointParents, config.clusterSelectionMethod)
  return summarize(features, config, assignments)
}

function minimumSpanningTree(distances: Float64Array, core: Float64Array, count: number): Edge[] {
  const visited = new Uint8Array(count)
  const nearest = new Float64Array(count).fill(Infinity)
  const sources = new Int32Array(count)
  const edges: Edge[] = []
  let current = 0
  for (let step = 1; step < count; step += 1) {
    visited[current] = 1
    let next = -1
    let best = Infinity
    for (let point = 0; point < count; point += 1) {
      if (visited[point]) continue
      const distance = Math.max(core[current], core[point], distances[current * count + point])
      if (distance < nearest[point]) {
        nearest[point] = distance
        sources[point] = current
      }
      // First input index wins a tie, retaining the first equally close source.
      if (nearest[point] < best) { best = nearest[point]; next = point }
    }
    edges.push({ left: sources[next], right: next, distance: best })
    current = next
  }
  // Stable sorting preserves Prim's edge order at equal distances.
  return edges.sort((left, right) => left.distance - right.distance)
}

function buildHierarchy(edges: Edge[], count: number): HierarchyNode[] {
  const parents = Int32Array.from({ length: 2 * count - 1 }, (_, index) => index)
  const sizes = new Int32Array(2 * count - 1).fill(1)
  const find = (node: number) => {
    let root = node
    while (parents[root] !== root) root = parents[root]
    while (parents[node] !== node) {
      const next = parents[node]
      parents[node] = root
      node = next
    }
    return root
  }
  return edges.map((edge, index) => {
    const left = find(edge.left)
    const right = find(edge.right)
    const merged = count + index
    const size = sizes[left] + sizes[right]
    sizes[merged] = size
    parents[left] = merged
    parents[right] = merged
    return { left, right, distance: edge.distance, size }
  })
}

function condenseHierarchy(hierarchy: HierarchyNode[], count: number, minimum: number): {
  clusters: CondensedCluster[]
  pointParents: Int32Array
} {
  const clusters: CondensedCluster[] = [{ parent: -1, birth: 0, stability: 0, children: [] }]
  const pointParents = new Int32Array(count)
  const pending = [{ node: 2 * count - 2, cluster: 0 }]
  const size = (node: number) => node < count ? 1 : hierarchy[node - count].size
  const addStability = (cluster: number, lambda: number, amount: number) => {
    const birth = clusters[cluster].birth
    // Equal infinite levels have zero duration; never let Infinity-Infinity produce NaN.
    const lifetime = lambda === birth ? 0 : lambda - birth
    clusters[cluster].stability += amount * lifetime
  }
  const prune = (node: number, cluster: number, lambda: number) => {
    addStability(cluster, lambda, size(node))
    const stack = [node]
    while (stack.length) {
      const child = stack.pop()!
      if (child < count) pointParents[child] = cluster
      else {
        const { left, right } = hierarchy[child - count]
        stack.push(left, right)
      }
    }
  }
  // Iterative traversal avoids recursion limits for long, chain-shaped hierarchies.
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const { node, cluster } = pending[cursor]
    const { left, right, distance } = hierarchy[node - count]
    const lambda = distance === 0 ? Infinity : 1 / distance
    const leftLarge = size(left) >= minimum
    const rightLarge = size(right) >= minimum
    if (leftLarge && rightLarge) {
      addStability(cluster, lambda, size(node))
      for (const child of [left, right]) {
        const childCluster = clusters.length
        clusters.push({ parent: cluster, birth: lambda, stability: 0, children: [] })
        clusters[cluster].children.push(childCluster)
        pending.push({ node: child, cluster: childCluster })
      }
    } else {
      if (leftLarge) pending.push({ node: left, cluster })
      else prune(left, cluster, lambda)
      if (rightLarge) pending.push({ node: right, cluster })
      else prune(right, cluster, lambda)
    }
  }
  return { clusters, pointParents }
}

function selectClusters(clusters: CondensedCluster[], pointParents: Int32Array, method: 'eom' | 'leaf'): number[] {
  const selected = new Uint8Array(clusters.length)
  const bestStability = new Float64Array(clusters.length)
  for (let index = clusters.length - 1; index > 0; index -= 1) {
    const cluster = clusters[index]
    const descendants = cluster.children.reduce((sum, child) => sum + bestStability[child], 0)
    const select = method === 'leaf' ? cluster.children.length === 0 : !(descendants > cluster.stability)
    selected[index] = Number(select)
    bestStability[index] = select ? cluster.stability : descendants
  }
  const labels = new Int32Array(clusters.length).fill(-1)
  let nextLabel = 0
  // Parents precede children. A selected ancestor takes precedence over descendants.
  for (let index = 1; index < clusters.length; index += 1) {
    labels[index] = labels[clusters[index].parent]
    if (labels[index] === -1 && selected[index]) labels[index] = nextLabel++
  }
  return Array.from(pointParents, (parent) => labels[parent])
}

function summarize(features: SkillClusteringFeatures, config: SkillHdbscanConfig, labels: number[]): SkillHdbscanResult {
  // Canonical labels follow the first original document, independent of hierarchy node IDs.
  const groups = new Map<number, number[]>()
  labels.forEach((cluster, row) => {
    if (cluster < 0) return
    const group = groups.get(cluster) ?? []
    group.push(row)
    groups.set(cluster, group)
  })
  const members = [...groups.values()].sort((left, right) =>
    Math.min(...left.map((row) => features.documentIndices[row])) - Math.min(...right.map((row) => features.documentIndices[row])))
  const assignments = Array<number>(features.documentCount).fill(-2)
  features.documentIndices.forEach((index) => { assignments[index] = -1 })
  const representativeTerms: string[][] = []
  const representativeIndices: number[] = []
  members.forEach((rows, cluster) => {
    const mean = new Float64Array(features.terms.length)
    rows.forEach((row) => {
      assignments[features.documentIndices[row]] = cluster
      const vector = features.vectors[row]
      vector.indices.forEach((term, offset) => { mean[term] += vector.values[offset] / rows.length })
    })
    representativeTerms.push(Array.from(mean, (weight, index) => ({ weight, term: features.terms[index] }))
      .filter(({ weight, term }) => weight > 0 && [...term].length >= 2)
      .sort((left, right) => right.weight - left.weight || compareText(left.term, right.term))
      .slice(0, 5).map(({ term }) => term))
    const center = { indices: Array.from(mean, (_, index) => index), values: Array.from(mean) }
    let bestRow = rows[0]
    let bestDistance = Infinity
    rows.forEach((row) => {
      const distance = skillHdbscanEuclideanDistance(features.vectors[row], center)
      if (distance < bestDistance || (distance === bestDistance && features.documentIndices[row] < features.documentIndices[bestRow])) {
        bestRow = row
        bestDistance = distance
      }
    })
    representativeIndices.push(features.documentIndices[bestRow])
  })
  return {
    config: { ...config }, assignments, counts: members.map((rows) => rows.length), representativeTerms, representativeIndices,
    noiseCount: labels.filter((label) => label === -1).length, excludedCount: features.excludedIndices.length,
  }
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }

function validateFeatures(features: SkillClusteringFeatures): void {
  if (!features || !Array.isArray(features.terms) || !features.terms.length || !Array.isArray(features.vectors)
    || !features.vectors.length || !Number.isSafeInteger(features.documentCount) || features.documentCount < 1
    || !Array.isArray(features.documentIndices) || features.documentIndices.length !== features.vectors.length
    || !Array.isArray(features.excludedIndices)) {
    throw new RangeError('学習に使える説明文がありません。')
  }
  const indices = [...features.documentIndices, ...features.excludedIndices]
  if (indices.length !== features.documentCount || new Set(indices).size !== features.documentCount
    || indices.some((index) => !Number.isInteger(index) || index < 0 || index >= features.documentCount)) {
    throw new RangeError('説明文と特徴量の対応が不正です。')
  }
  if (features.terms.some((term) => typeof term !== 'string') || new Set(features.terms).size !== features.terms.length) {
    throw new RangeError('説明文の特徴量の語彙が不正です。')
  }
  for (const vector of features.vectors) {
    if (!vector || !Array.isArray(vector.indices) || !Array.isArray(vector.values) || !vector.indices.length
      || vector.indices.length !== vector.values.length
      || vector.indices.some((index, offset) => !Number.isInteger(index) || index < 0 || index >= features.terms.length
        || (offset > 0 && vector.indices[offset - 1] >= index))
      || vector.values.some((value) => !Number.isFinite(value)) || !vector.values.some((value) => value !== 0)) {
      throw new RangeError('説明文の特徴量が不正です。')
    }
  }
}
