import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSkillClusteringCorpus,
  createSkillClusteringFeatures,
  type SkillClusteringFeatures,
} from '../src/lib/skillClusteringData.ts'
import { buildSkillKMeansCorpus, createSkillKMeansFeatures } from '../src/lib/skillKMeans.ts'
import {
  buildSkillHierarchy,
  cutSkillHierarchy,
  evaluateSkillHierarchyCut,
  type HierarchicalLinkage,
  type SkillHierarchyTree,
} from '../src/lib/skillHierarchical.ts'

function close(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

function features(rows: number[][]): SkillClusteringFeatures {
  return {
    terms: (rows[0] ?? []).map((_, index) => `term${index}`),
    vectors: rows.map((row) => ({ indices: row.flatMap((value, index) => value ? [index] : []), values: row.filter(Boolean) })),
    documentIndices: rows.map((_, index) => index), excludedIndices: [], documentCount: rows.length,
  }
}

function distance(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0)
  const a = left.reduce((sum, value) => sum + value * value, 0)
  const b = right.reduce((sum, value) => sum + value * value, 0)
  return Math.min(1, Math.max(0, 1 - dot / Math.sqrt(a * b)))
}

/** Reference recomputes every linkage from original pairs, without recurrence or heap. */
function bruteHierarchy(rows: number[][], linkage: HierarchicalLinkage) {
  const nodes = rows.map((_, id) => ({ id, members: [id], distance: 0 }))
  const active = new Set(nodes.map((node) => node.id))
  while (active.size > 1) {
    let selected: { left: number; right: number; distance: number } | null = null
    const ids = [...active].sort((a, b) => a - b)
    for (let first = 0; first < ids.length; first += 1) {
      for (let second = first + 1; second < ids.length; second += 1) {
        const left = ids[first]
        const right = ids[second]
        const distances = nodes[left].members.flatMap((a) => nodes[right].members.map((b) => distance(rows[a], rows[b])))
        const value = linkage === 'complete' ? Math.max(...distances) : distances.reduce((a, b) => a + b, 0) / distances.length
        if (!selected || value < selected.distance) selected = { left, right, distance: value }
      }
    }
    assert.ok(selected)
    const { left, right } = selected
    const id = nodes.length
    nodes.push({ id, members: [...nodes[left].members, ...nodes[right].members].sort((a, b) => a - b), distance: selected.distance })
    active.delete(left)
    active.delete(right)
    active.add(id)
  }
  return nodes
}

function bruteSilhouette(tree: SkillHierarchyTree, threshold: number): number | null {
  const groups = cutSkillHierarchy(tree, threshold).map((id) => tree.nodes[id].documentIndices)
  const indices = tree.documentIndices
  if (groups.length < 2 || groups.length >= indices.length) return null
  const distances = (a: number, b: number) => tree.distances[indices.indexOf(a) * indices.length + indices.indexOf(b)]
  return indices.reduce((sum, index) => {
    const own = groups.find((group) => group.includes(index))!
    if (own.length === 1) return sum
    const a = own.filter((member) => member !== index).reduce((total, member) => total + distances(index, member), 0) / (own.length - 1)
    const b = Math.min(...groups.filter((group) => group !== own).map((group) => group.reduce((total, member) => total + distances(index, member), 0) / group.length))
    return sum + (Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b))
  }, 0) / indices.length
}

const rows = [[1, 0], [4, 1], [0, 1], [1, 5]]

test('共通前処理は K-means の従来公開名と同じ関数を返す', () => {
  assert.equal(buildSkillClusteringCorpus, buildSkillKMeansCorpus)
  assert.equal(createSkillClusteringFeatures, createSkillKMeansFeatures)
  assert.deepEqual(createSkillClusteringFeatures([]), { terms: [], vectors: [], documentIndices: [], excludedIndices: [], documentCount: 0 })
})

for (const linkage of ['average', 'complete'] as const) {
  test(`${linkage}: 既知の二群を復元し結合高さを元の全ペア距離から検証する`, () => {
    const tree = buildSkillHierarchy(features(rows), linkage)
    assert.equal(tree.rootId, 6)
    assert.equal(tree.nodes.length, 7)
    assert.deepEqual(tree.nodes[4].documentIndices, [2, 3])
    assert.deepEqual(tree.nodes[5].documentIndices, [0, 1])
    close(tree.nodes[4].distance, 1 - 5 / Math.sqrt(26))
    close(tree.nodes[5].distance, 1 - 4 / Math.sqrt(17))
    const between = [distance(rows[0], rows[2]), distance(rows[0], rows[3]), distance(rows[1], rows[2]), distance(rows[1], rows[3])]
    close(tree.nodes[6].distance, linkage === 'complete' ? Math.max(...between) : between.reduce((a, b) => a + b, 0) / 4)
    const partition = evaluateSkillHierarchyCut(tree, 0.1)
    assert.deepEqual(partition.assignments, [0, 0, 1, 1])
    assert.deepEqual(partition.groupNodeIds, [5, 4])
    close(partition.silhouette!, bruteSilhouette(tree, 0.1)!)
    const a0 = distance(rows[0], rows[1])
    const a1 = distance(rows[2], rows[3])
    const expected = rows.reduce((sum, row, index) => {
      const neighbors = index < 2 ? [2, 3] : [0, 1]
      const b = neighbors.reduce((total, other) => total + distance(row, rows[other]), 0) / 2
      const a = index < 2 ? a0 : a1
      return sum + (b - a) / Math.max(a, b)
    }, 0) / 4
    close(partition.silhouette!, expected)
  })

  test(`${linkage}: 独立した総当たり実装と結合順序・高さが一致する`, () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const samples = Array.from({ length: 13 }, (_, row) => Array.from({ length: 5 }, (_, column) =>
        0.1 + ((row + 11) * (column + 3) * (seed + 7) % 37) / 37 + (row + column * seed) / 1000))
      const expected = bruteHierarchy(samples, linkage)
      const tree = buildSkillHierarchy(features(samples), linkage)
      tree.nodes.forEach((node, id) => {
        assert.deepEqual([...node.documentIndices].sort((a, b) => a - b), expected[id].members)
        close(node.distance, expected[id].distance)
        if (id > samples.length) assert.ok(node.distance >= tree.nodes[id - 1].distance)
      })
    }
  })
}

test('各切断のシルエットは単独群を0として全説明文で平均する', () => {
  const tree = buildSkillHierarchy(features([[1, 0], [1, 0], [0, 1]]), 'average')
  const partition = evaluateSkillHierarchyCut(tree, 0)
  assert.deepEqual(partition.assignments, [0, 0, 1])
  close(partition.silhouette!, 2 / 3)
  assert.deepEqual(tree.autoCandidates, [{ threshold: 0, groupCount: 2, silhouette: 2 / 3 }])
  assert.equal(tree.recommendedThreshold, 0)
})

test('距離閾値が上がると群は結合だけを行い、境界の高さを含める', () => {
  const tree = buildSkillHierarchy(features(rows), 'average')
  let previous = evaluateSkillHierarchyCut(tree, 0)
  assert.equal(previous.silhouette, null)
  for (const threshold of [...new Set(tree.nodes.map((node) => node.distance))].sort((a, b) => a - b)) {
    const current = evaluateSkillHierarchyCut(tree, threshold)
    assert.ok(current.groupNodeIds.length <= previous.groupNodeIds.length)
    for (const oldId of previous.groupNodeIds) {
      const members = tree.nodes[oldId].documentIndices
      assert.ok(members.every((index) => current.assignments[index] === current.assignments[members[0]]))
    }
    for (const id of current.groupNodeIds) assert.ok(tree.nodes[id].distance <= threshold)
    previous = current
  }
  assert.equal(previous.groupNodeIds.length, 1)
  assert.equal(previous.silhouette, null)
})

test('同距離の結合は一括で切断し、同じ入力は同じ階層を返す', () => {
  const input = features([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1]])
  for (const linkage of ['average', 'complete'] as const) {
    const first = buildSkillHierarchy(input, linkage)
    assert.deepEqual(buildSkillHierarchy(input, linkage), first)
    assert.deepEqual(first.nodes.slice(6).map(({ left, right }) => [left, right]), [[0, 3], [1, 4], [2, 5], [6, 7], [9, 8]])
    assert.equal(cutSkillHierarchy(first, 0).length, 3)
    assert.equal(cutSkillHierarchy(first, 1).length, 1)
    assert.deepEqual(first.autoCandidates, [{ threshold: 0, groupCount: 3, silhouette: 1 }])
  }
})

test('空・除外のみ・1文・2文・全同一文は有限値と有効な未評価状態を返す', () => {
  for (const input of [features([]), { ...features([]), documentCount: 2, excludedIndices: [0, 1] }]) {
    const tree = buildSkillHierarchy(input, 'average')
    assert.equal(tree.rootId, -1)
    assert.equal(tree.recommendedThreshold, 0)
    assert.deepEqual(tree.autoCandidates, [])
    assert.deepEqual(evaluateSkillHierarchyCut(tree, 0), { threshold: 0, groupNodeIds: [], assignments: Array(input.documentCount).fill(-1), silhouette: null })
  }
  for (const samples of [[[2, 3]], [[1, 0], [0, 1]], [[1, 1], [1, 1], [1, 1], [1, 1]]]) {
    const tree = buildSkillHierarchy(features(samples), 'complete')
    assert.deepEqual(tree.autoCandidates, [])
    assert.equal(evaluateSkillHierarchyCut(tree, tree.recommendedThreshold).silhouette, null)
    assert.ok(tree.nodes.every((node) => Number.isFinite(node.distance) && node.distance >= 0 && node.distance <= 1))
    if (samples.length === 4) {
      assert.equal(tree.recommendedThreshold, 0)
      assert.equal(cutSkillHierarchy(tree, 0).length, 1)
    }
  }
})

test('非連続の元文書番号と除外文書を維持し、入力を変更しない', () => {
  const input = { ...features(rows), documentIndices: [3, 0, 4, 1], excludedIndices: [2, 5], documentCount: 6 }
  const before = structuredClone(input)
  const tree = buildSkillHierarchy(input, 'average')
  const partition = evaluateSkillHierarchyCut(tree, 0.1)
  assert.deepEqual(partition.assignments, [0, 1, -1, 0, 1, -1])
  assert.deepEqual(tree.documentIndices, [3, 0, 4, 1])
  assert.deepEqual(tree.excludedIndices, [2, 5])
  assert.deepEqual(tree.nodes[tree.rootId].documentIndices, [3, 0, 4, 1])
  assert.deepEqual(input, before)
  tree.nodes.forEach((node) => {
    assert.equal(node.documentIndices.length, node.count)
    assert.ok(node.documentIndices.includes(node.representativeIndex))
  })
})

test('代表語は平均TF-IDFの上位語から一文字を除き、代表文は中心に最も近い文になる', () => {
  const input = { ...features([[1, 0, 4], [1, 1, 4], [0, 1, 4]]), terms: ['攻撃', '防御', 'a'] }
  const tree = buildSkillHierarchy(input, 'average')
  const root = tree.nodes[tree.rootId]
  assert.deepEqual(root.representativeTerms, ['攻撃', '防御'])
  assert.equal(root.representativeIndex, 1)
})

test('自動閾値は2〜30群の実在する全切断候補のシルエット最大を選ぶ', () => {
  const samples = Array.from({ length: 40 }, (_, index) => [1 + (index % 9) / 10, 0.3 + index / 40, 1 + ((index * 13) % 19) / 10])
  const tree = buildSkillHierarchy(features(samples), 'average')
  const expected = [...new Set(tree.nodes.slice(samples.length).map((node) => node.distance))]
    .filter((threshold) => {
      const count = cutSkillHierarchy(tree, threshold).length
      return count >= 2 && count <= Math.min(30, samples.length - 1)
    })
  assert.deepEqual(tree.autoCandidates.map((candidate) => candidate.threshold), expected)
  assert.equal(tree.autoCandidates.length, 29)
  for (const candidate of tree.autoCandidates) close(candidate.silhouette, bruteSilhouette(tree, candidate.threshold)!)
  const recommended = tree.autoCandidates.find((candidate) => candidate.threshold === tree.recommendedThreshold)!
  assert.equal(recommended.silhouette, Math.max(...tree.autoCandidates.map((candidate) => candidate.silhouette)))
})

test('進行状況は距離計算・結合・候補評価の各段階で完了数を返す', () => {
  const progress: { phase: string; completed: number; total: number }[] = []
  buildSkillHierarchy(features(rows), 'average', (value) => progress.push(value))
  assert.deepEqual([...new Set(progress.map((value) => value.phase))], ['distances', 'merging', 'evaluating'])
  for (const phase of ['distances', 'merging', 'evaluating']) {
    const values = progress.filter((value) => value.phase === phase)
    assert.equal(values[0].completed, 0)
    assert.equal(values.at(-1)!.completed, values.at(-1)!.total)
    values.forEach((value, index) => assert.ok(index === 0 || value.completed >= values[index - 1].completed))
  }
})

test('不正な特徴量・結合方法・閾値は明確に拒否する', () => {
  const valid = features(rows)
  const invalid: SkillClusteringFeatures[] = [
    { ...valid, documentIndices: [0, 0, 1, 2] },
    { ...valid, documentCount: -1 },
    { ...valid, excludedIndices: [2] },
    { ...valid, terms: ['same', 'same'] },
    { ...valid, vectors: [{ indices: [0], values: [NaN] }, ...valid.vectors.slice(1)] },
    { ...valid, vectors: [{ indices: [0], values: [-1] }, ...valid.vectors.slice(1)] },
    { ...valid, vectors: [{ indices: [0], values: [0] }, ...valid.vectors.slice(1)] },
    { ...valid, vectors: [{ indices: [0], values: [1e300] }, ...valid.vectors.slice(1)] },
    { ...valid, vectors: [{ indices: [1, 0], values: [1, 1] }, ...valid.vectors.slice(1)] },
    { ...valid, vectors: [{ indices: [2], values: [1] }, ...valid.vectors.slice(1)] },
    { ...valid, vectors: [{ indices: [0], values: [] }, ...valid.vectors.slice(1)] },
  ]
  for (const input of invalid) assert.throws(() => buildSkillHierarchy(input, 'average'), RangeError)
  assert.throws(() => buildSkillHierarchy(valid, 'bad' as HierarchicalLinkage), RangeError)
  const tree = buildSkillHierarchy(valid, 'average')
  for (const threshold of [NaN, Infinity, -Infinity, -0.1, 1.1]) {
    assert.throws(() => cutSkillHierarchy(tree, threshold), RangeError)
    assert.throws(() => evaluateSkillHierarchyCut(tree, threshold), RangeError)
  }
})
