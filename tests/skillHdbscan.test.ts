import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  runSkillHdbscan,
  skillHdbscanEuclideanDistance,
  type SkillHdbscanConfig,
  type SkillHdbscanStage,
} from '../src/lib/skillHdbscan.ts'
import { createSkillClusteringFeatures, type SkillClusteringFeatures } from '../src/lib/skillClusteringFeatures.ts'

function features(rows: number[][]): SkillClusteringFeatures {
  return {
    terms: rows[0].map((_, index) => `term${index}`),
    vectors: rows.map((values) => ({ indices: values.flatMap((value, index) => value === 0 ? [] : [index]), values: values.filter((value) => value !== 0) })),
    documentIndices: rows.map((_, index) => index), excludedIndices: [], documentCount: rows.length,
  }
}

function partition(labels: number[]): number[] {
  const canonical = new Map<number, number>()
  return labels.map((label) => {
    if (label < 0) return label
    if (!canonical.has(label)) canonical.set(label, canonical.size)
    return canonical.get(label)!
  })
}

const base: SkillHdbscanConfig = { minClusterSize: 2, minSamples: 2, clusterSelectionMethod: 'eom' }
const reference = JSON.parse(readFileSync(new URL('./fixtures/skillHdbscan.sklearn-1.7.2.json', import.meta.url), 'utf8')) as {
  reference: { version: string; min_samples_includes_self: boolean }
  cases: { name: string; vectors: number[][]; runs: {
    config: SkillHdbscanConfig
    labels: number[]
    stable_sort_labels?: number[]
    tie_sensitive_indices?: number[]
  }[] }[]
}

test('固定版scikit-learn 1.7.2の公開実装と同距離順序に依存しない40構成が完全一致する', () => {
  assert.equal(reference.reference.version, '1.7.2')
  assert.equal(reference.reference.min_samples_includes_self, true)
  let compared = 0
  for (const sample of reference.cases) {
    for (const run of sample.runs) {
      if (run.tie_sensitive_indices) continue
      const result = runSkillHdbscan(features(sample.vectors), run.config)
      assert.deepEqual(partition(result.assignments), partition(run.labels), `${sample.name} ${JSON.stringify(run.config)}`)
      assert.equal(result.noiseCount, run.labels.filter((label) => label === -1).length)
      assert.equal(result.counts.reduce((sum, count) => sum + count, 0) + result.noiseCount, sample.vectors.length)
      assert.ok(result.counts.every((count) => count >= run.config.minClusterSize))
      compared += 1
    }
  }
  assert.equal(compared, 40)
})

test('同距離に依存する8構成は公開結果との差を境界点に限定し、独立実装の安定順序とも一致する', () => {
  let compared = 0
  for (const sample of reference.cases) {
    for (const run of sample.runs) {
      if (!run.tie_sensitive_indices) continue
      const result = runSkillHdbscan(features(sample.vectors), run.config)
      const expected = partition(run.labels)
      result.assignments.forEach((label, index) => {
        if (!run.tie_sensitive_indices!.includes(index)) assert.equal(label, expected[index])
      })
      // Same pinned sklearn estimator, with just MST edge sorting made stable.
      // Public expected labels above are deliberately retained, not overwritten.
      assert.deepEqual(result.assignments, partition(run.stable_sort_labels!), `${sample.name} ${JSON.stringify(run.config)}`)
      assert.equal(result.noiseCount, run.stable_sort_labels!.filter((label) => label === -1).length)
      assert.ok(result.counts.every((count) => count >= run.config.minClusterSize))
      assert.deepEqual(run.tie_sensitive_indices, sample.name === 'duplicates' ? [12] : [16, 54])
      compared += 1
    }
  }
  assert.equal(compared, 8)
})

test('参照データはEOMとleafの違い・複数密度・ノイズ・自身を含むmin_samplesの違いを検出できる', () => {
  let selectionDifference = false
  let noiseAndClusters = false
  for (const sample of reference.cases) {
    for (let index = 0; index < sample.runs.length; index += 2) {
      const eom = sample.runs[index].labels
      const leaf = sample.runs[index + 1].labels
      selectionDifference ||= JSON.stringify(partition(eom)) !== JSON.stringify(partition(leaf))
      noiseAndClusters ||= eom.includes(-1) && eom.some((label) => label >= 0)
    }
  }
  assert.ok(selectionDifference, 'golden fixtures must distinguish EOM from leaf')
  assert.ok(noiseAndClusters, 'golden fixtures must distinguish noise from a cluster')
  const sample = reference.cases.find((entry) => entry.name === 'minimum-samples-includes-self')!
  assert.notDeepEqual(partition(sample.runs[2].labels), partition(sample.runs[4].labels))
})

test('距離は正規化TF-IDF間のユークリッド距離で、二乗距離やコサイン距離ではない', () => {
  const left = { indices: [0, 2], values: [.6, .8] }
  const right = { indices: [1, 2], values: [.6, .8] }
  assert.ok(Math.abs(skillHdbscanEuclideanDistance(left, right) - Math.sqrt(.72)) < 1e-15)
  assert.equal(skillHdbscanEuclideanDistance(left, left), 0)
  const near = { indices: [0, 2], values: [.6 + 1e-10, .8] }
  assert.ok(skillHdbscanEuclideanDistance(left, near) > 0, 'near duplicates must not round down to duplicate distance')
  assert.equal(skillHdbscanEuclideanDistance(left, right), skillHdbscanEuclideanDistance(right, left))
})

test('同一ベクトルと同距離を含む入力は決定的で、全点同一では単一クラスタを作らない', () => {
  for (const clusterSelectionMethod of ['eom', 'leaf'] as const) {
    const config = { ...base, clusterSelectionMethod }
    const input = features([[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 1]])
    const first = runSkillHdbscan(input, config)
    assert.deepEqual(first.assignments, [0, 0, 0, 1, 1, 1])
    assert.deepEqual(first, runSkillHdbscan(input, config))
    assert.deepEqual(runSkillHdbscan(features(Array.from({ length: 20 }, () => [.6, .8])), config).assignments, Array(20).fill(-1))
  }
})

test('明確に分離した群は入力順を入れ替えても元文書への所属が変わらない', () => {
  const rows = [[1, 0, 0], [.99, .01, 0], [.98, .02, 0], [0, 1, 0], [.01, .99, 0], [.02, .98, 0], [0, 0, 1], [0, .01, .99], [0, .02, .98]]
  const normalized = rows.map((row) => row.map((value) => value / Math.hypot(...row)))
  for (const clusterSelectionMethod of ['eom', 'leaf'] as const) {
    const config = { ...base, clusterSelectionMethod }
    const expected = runSkillHdbscan(features(normalized), config).assignments
    for (const order of [[8, 7, 6, 5, 4, 3, 2, 1, 0], [3, 7, 1, 0, 8, 4, 2, 5, 6]]) {
      const input = features(order.map((index) => normalized[index]))
      input.documentIndices = order
      assert.deepEqual(runSkillHdbscan(input, config).assignments, expected)
    }
  }
})

test('元文書順への対応・特徴量なし・代表語・代表説明文と件数を保持する', () => {
  const input = features([[1, 0], [1, 0], [0, 1], [0, 1]])
  input.documentIndices = [4, 1, 5, 2]
  input.excludedIndices = [0, 3]
  input.documentCount = 6
  const result = runSkillHdbscan(input, base)
  assert.deepEqual(result.assignments, [-2, 0, 1, -2, 0, 1])
  assert.deepEqual(result.counts, [2, 2])
  assert.deepEqual(result.representativeTerms, [['term0'], ['term1']])
  assert.deepEqual(result.representativeIndices, [1, 2])
  assert.equal(result.excludedCount, 2)
  assert.equal(result.noiseCount, 0)
  result.representativeIndices.forEach((index, cluster) => assert.equal(result.assignments[index], cluster))
})

test('実際の共通TF-IDFで特徴量なしをノイズと区別する', () => {
  const documents = ['攻撃 ダメージ', '攻撃 ダメージ', '回復 治療', '回復 治療', '100% 20秒 の に を']
    .map((description, index) => ({ id: `${index}`, description, recordIds: [`${index}`], operatorName: 'テスト名', skillName: '名前', skillIndex: 1 }))
  const result = runSkillHdbscan(createSkillClusteringFeatures(documents), base)
  assert.deepEqual(result.assignments, [0, 0, 1, 1, -2])
  assert.equal(result.excludedCount, 1)
  assert.equal(result.noiseCount, 0)
})

test('全ノイズ・最小サイズ超過・1文書は正常完了し、設定と入力を変更しない', () => {
  const input = features([[1, 0], [0, 1]])
  const before = structuredClone(input)
  const config = { ...base, minClusterSize: 3 }
  const stages: SkillHdbscanStage[] = []
  const result = runSkillHdbscan(input, config, (stage) => stages.push(stage))
  assert.deepEqual(stages, ['distances', 'hierarchy', 'extract'])
  assert.deepEqual(result.assignments, [-1, -1])
  assert.deepEqual(result.counts, [])
  assert.deepEqual(result.representativeTerms, [])
  assert.deepEqual(result.representativeIndices, [])
  assert.equal(result.noiseCount, 2)
  assert.deepEqual(input, before)
  result.config.minSamples = 1
  assert.equal(config.minSamples, 2)
  assert.deepEqual(runSkillHdbscan(features([[1]]), { ...base, minSamples: 1 }).assignments, [-1])
})

test('不正な設定・特徴量・文書対応と使える説明文がない入力を拒否する', () => {
  const input = features([[1, 0], [0, 1]])
  for (const minClusterSize of [0, 1, 1.5, NaN, Infinity]) assert.throws(() => runSkillHdbscan(input, { ...base, minClusterSize }), RangeError)
  for (const minSamples of [0, -1, 1.5, 3, NaN, Infinity]) assert.throws(() => runSkillHdbscan(input, { ...base, minSamples }), /密度判定の近傍数/u)
  assert.throws(() => runSkillHdbscan(input, { ...base, clusterSelectionMethod: 'other' as 'eom' }), RangeError)
  assert.throws(() => runSkillHdbscan({ ...input, documentIndices: [0, 0] }, base), /対応/u)
  assert.throws(() => runSkillHdbscan({ ...input, excludedIndices: [2], documentCount: 2 }, base), /対応/u)
  assert.throws(() => runSkillHdbscan({ ...input, terms: ['same', 'same'] }, base), /語彙/u)
  for (const vector of [
    { indices: [0], values: [NaN] }, { indices: [0], values: [Infinity] },
    { indices: [0], values: [0] }, { indices: [2], values: [1] },
    { indices: [1, 0], values: [1, 1] }, { indices: [0, 0], values: [1, 1] },
    { indices: [], values: [] }, { indices: [0], values: [] },
  ]) assert.throws(() => runSkillHdbscan({ ...input, vectors: [vector, input.vectors[1]] }, base), /特徴量/u)
  assert.throws(() => runSkillHdbscan(createSkillClusteringFeatures([]), base), /使える説明文/u)
})
