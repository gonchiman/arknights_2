import test from 'node:test'
import assert from 'node:assert/strict'
import { createSkillKMeansEngine, type SkillKMeansFeatures } from '../src/lib/skillKMeans.ts'
import { findSkillKMeansElbow, runSkillKMeansSearch, type SkillKMeansSearchConfig,
  type SkillKMeansSearchProgress } from '../src/lib/skillKMeansSearch.ts'

function features(rows: number[][]): SkillKMeansFeatures {
  return { terms: (rows[0] ?? []).map((_, index) => `term${index}`),
    vectors: rows.map((row) => ({ indices: row.flatMap((value, index) => value ? [index] : []), values: row.filter(Boolean) })),
    documentIndices: rows.map((_, index) => index), excludedIndices: [], documentCount: rows.length }
}

const config: SkillKMeansSearchConfig = { minK: 2, maxK: 4, seed: 2, restarts: 5, maxIterations: 30 }
const rows = [[1, 0], [1, 0.1], [1, 0.2], [0, 1], [0.1, 1], [0.2, 1], [1, 1], [1.1, 1], [1, 1.1]]

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
}

/** Independent dense pairwise Euclidean reference, grouping members explicitly. */
function bruteSilhouette(points: number[][], labels: number[]): number | null {
  const groups = [...new Set(labels)].map((label) => labels.flatMap((group, index) => group === label ? [index] : []))
  if (groups.length < 2 || groups.length >= labels.length) return null
  const distance = (a: number, b: number) => Math.sqrt(points[a].reduce((sum, value, dim) => sum + (value - points[b][dim]) ** 2, 0))
  return points.reduce((sum, _, index) => {
    const own = groups.find((group) => group.includes(index))!
    if (own.length === 1) return sum
    const a = own.filter((other) => other !== index).reduce((total, other) => total + distance(index, other), 0) / (own.length - 1)
    const b = Math.min(...groups.filter((group) => group !== own).map((group) =>
      group.reduce((total, other) => total + distance(index, other), 0) / group.length))
    return sum + (Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b))
  }, 0) / points.length
}

test('全Kを同じseed列で試し、最小MSEの試行とそのユークリッドシルエットを返す', () => {
  const input = features(rows)
  const result = runSkillKMeansSearch(input, config)
  for (const candidate of result.candidates) {
    const fits = Array.from({ length: config.restarts }, (_, restart) => {
      const seed = config.seed + restart
      const engine = createSkillKMeansEngine(input, { k: candidate.k, seed, maxIterations: config.maxIterations })
      while (!engine.step()) { /* train */ }
      return { seed, result: engine.snapshot() }
    })
    const best = fits.reduce((a, b) => b.result.history.at(-1)!.meanSquaredDistance < a.result.history.at(-1)!.meanSquaredDistance ? b : a)
    assert.equal(candidate.seed, best.seed)
    close(candidate.meanSquaredDistance, best.result.history.at(-1)!.meanSquaredDistance)
    close(candidate.silhouette!, bruteSilhouette(rows, best.result.assignments)!)
    assert.equal(candidate.iterations, best.result.iteration)
    assert.equal(candidate.stopReason, best.result.stopReason)
    assert.equal(candidate.actualK, candidate.k)
    assert.equal(candidate.eligible, true)
  }
  const best = result.candidates.reduce((a, b) => b.silhouette! > a.silhouette! ? b : a)
  assert.equal(result.silhouetteK, best.k)
})

test('同条件を再現し、入力や返却済み設定・結果の編集に依存しない', () => {
  const input = features(rows)
  const originalInput = structuredClone(input)
  const settings = { ...config }
  const first = runSkillKMeansSearch(input, settings)
  assert.deepEqual(first, runSkillKMeansSearch(input, settings))
  assert.deepEqual(input, originalInput)
  settings.seed = 100
  assert.equal(first.config.seed, config.seed)
  first.config.seed = 999
  first.candidates[0].seed = 999
  assert.deepEqual(runSkillKMeansSearch(input, config).config, config)
})

test('seed列は99999から0へ巡回し、同点なら最初の試行を採用する', () => {
  const input = features([[1, 0], [1, 0], [0, 1], [0, 1]])
  const result = runSkillKMeansSearch(input, { ...config, maxK: 2, seed: 99999 })
  assert.equal(result.candidates[0].seed, 99999)
  assert.equal(result.candidates[0].silhouette, 1)
  assert.equal(result.elbowK, null)
})

test('全試行と距離行列・評価の進捗を通知する', () => {
  const progress: SkillKMeansSearchProgress[] = []
  runSkillKMeansSearch(features(rows), config, (value) => progress.push(value))
  const fitting = progress.filter((value) => value.phase === 'fitting')
  const total = 3 * config.restarts
  assert.deepEqual(fitting.map((value) => value.completed), Array.from({ length: total + 1 }, (_, index) => index))
  assert.ok(fitting.every((value) => value.total === total))
  assert.deepEqual(fitting.slice(1).map((value) => value.k), [2, 3, 4].flatMap((k) => Array(config.restarts).fill(k)))
  for (const phase of ['preparing', 'evaluating'] as const) {
    const values = progress.filter((value) => value.phase === phase)
    assert.equal(values[0].completed, 0)
    assert.equal(values.at(-1)!.completed, values.at(-1)!.total)
    assert.ok(values.every((value, index) => index === 0 || value.completed >= values[index - 1].completed))
  }
})

test('非連続の元文書番号と除外文書は評価に混ぜず、利用数と除外数を返す', () => {
  const input = features(rows)
  input.documentIndices = rows.map((_, index) => index * 2)
  input.excludedIndices = rows.slice(1).map((_, index) => index * 2 + 1)
  input.documentCount = rows.length * 2 - 1
  const result = runSkillKMeansSearch(input, config)
  assert.equal(result.documentCount, rows.length)
  assert.equal(result.excludedCount, rows.length - 1)
  assert.equal(result.termsCount, 2)
  assert.deepEqual(result.candidates, runSkillKMeansSearch(features(rows), config).candidates)
})

test('同一特徴による実群数不足はスコアを捏造せず、推薦しない', () => {
  const result = runSkillKMeansSearch(features(Array.from({ length: 6 }, () => [1, 0])), config)
  assert.ok(result.candidates.every((candidate) => candidate.actualK === 1 && !candidate.eligible && candidate.silhouette === null))
  assert.equal(result.silhouetteK, null)
  assert.equal(result.elbowK, null)
})

test('有効文書3件ではK=2を評価でき、単独群は0・エルボーは判定なしになる', () => {
  const result = runSkillKMeansSearch(features([[1, 0], [1, 0], [0, 1]]), { ...config, maxK: 2 })
  close(result.candidates[0].silhouette!, 2 / 3)
  assert.equal(result.silhouetteK, 2)
  assert.equal(result.elbowK, null)
})

test('反復上限終了の候補はスコアを保持しても推薦対象から除外する', () => {
  const samples = Array.from({ length: 40 }, (_, index) => [1 + index % 5, index % 7, (index * 3) % 11])
  const result = runSkillKMeansSearch(features(samples), { ...config, maxIterations: 1, restarts: 1, seed: 0 })
  const limited = result.candidates.filter((candidate) => candidate.stopReason === 'max-iterations')
  assert.ok(limited.length > 0)
  assert.ok(limited.every((candidate) => !candidate.eligible && candidate.silhouette !== null))
  assert.ok(limited.every((candidate) => candidate.k !== result.silhouetteK))
  assert.equal(result.elbowK, null)
})

test('特徴量を作れない文書・K上限・seed・再試行数・反復上限を検証する', () => {
  for (const samples of [[], [[1]], [[1], [2]]]) assert.throws(() => runSkillKMeansSearch(features(samples), config), RangeError)
  for (const override of [{ minK: 1 }, { maxK: 9 }, { minK: 5, maxK: 3 }, { minK: 2.5 }, { maxK: 31 },
    { seed: -1 }, { seed: 100000 }, { seed: 0.5 }, { seed: NaN }, { restarts: 2 }, { restarts: 0 },
    { maxIterations: 0 }, { maxIterations: 31 }]) {
    assert.throws(() => runSkillKMeansSearch(features(rows), { ...config, ...override }), RangeError)
  }
  const invalid = features(rows)
  invalid.documentIndices[0] = invalid.documentIndices[1]
  assert.throws(() => runSkillKMeansSearch(invalid, config), RangeError)
})

const curve = (values: number[]) => values.map((meanSquaredDistance, index) => ({ k: index + 2, meanSquaredDistance, eligible: true }))

test('エルボーは明瞭な傾きの変化を選び、平行移動・正の倍率に依存しない', () => {
  const values = [10, 6, 2, 1.8, 1.6, 1.4]
  assert.equal(findSkillKMeansElbow(curve(values)), 4)
  assert.equal(findSkillKMeansElbow(curve(values.map((value) => 100 + value * 3))), 4)
  assert.equal(findSkillKMeansElbow(curve([10, 6, 2, 2, 2])), 4)
})

test('エルボーは直線・平坦・小さい曲がり・逆行・短い系列・曖昧な候補を判定なしにする', () => {
  for (const values of [[], [2], [2, 1], [5, 4, 3, 2, 1], [2, 2, 2, 2], [5, 3.98, 3, 2, 1],
    [5, 3, 3.5, 2, 1], [10, 5, 2, 1], [1, 1 - 1e-12, 1 - 2e-12]]) {
    assert.equal(findSkillKMeansElbow(curve(values)), null, JSON.stringify(values))
  }
  const ineligible = curve([10, 6, 2, 1.8, 1.6, 1.4])
  ineligible[1].eligible = false
  assert.equal(findSkillKMeansElbow(ineligible), null)
  assert.equal(findSkillKMeansElbow(curve([10, 6, 2, 1]).filter((_, index) => index !== 1)), null)
})
