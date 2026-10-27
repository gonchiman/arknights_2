import { createSkillKMeansEngine, type SkillKMeansEvaluation, type SkillKMeansFeatures, type SkillKMeansResult,
  type SkillKMeansSparseVector } from './skillKMeans.ts'
import { calculateSkillClusteringSilhouette } from './skillClusteringSilhouette.ts'

export interface SkillKMeansSearchConfig {
  minK: number
  maxK: number
  seed: number
  restarts: number
  maxIterations: number
}

export interface SkillKMeansSearchCandidate {
  k: number
  seed: number
  meanSquaredDistance: number
  silhouette: number | null
  iterations: number
  stopReason: SkillKMeansResult['stopReason']
  actualK: number
  eligible: boolean
}

export interface SkillKMeansSearchResult {
  config: SkillKMeansSearchConfig
  candidates: SkillKMeansSearchCandidate[]
  silhouetteK: number | null
  elbowK: number | null
  /** Number of usable feature rows; original corpus size also includes excludedCount. */
  documentCount: number
  excludedCount: number
  termsCount: number
}

export interface SkillKMeansSearchProgress {
  phase: 'preparing' | 'fitting' | 'evaluating'
  completed: number
  total: number
  k: number | null
}

/** Reuse one feature set and distance matrix for every K and restart. */
export function runSkillKMeansSearch(
  features: SkillKMeansFeatures,
  settings: SkillKMeansSearchConfig,
  onProgress?: (progress: SkillKMeansSearchProgress) => void,
): SkillKMeansSearchResult {
  const config = { ...settings }
  validateConfig(features, config)
  // The first engine also validates feature contents before any pairwise calculation.
  const initialEngine = createSkillKMeansEngine(features, { k: config.minK, seed: config.seed, maxIterations: config.maxIterations })
  const n = features.vectors.length
  const distances = new Float64Array(n * n)
  const norms = features.vectors.map((vector) => vector.values.reduce((sum, value) => sum + value * value, 0))
  const pairs = n * (n - 1) / 2
  onProgress?.({ phase: 'preparing', completed: 0, total: pairs, k: null })
  let prepared = 0
  for (let row = 0; row < n; row += 1) {
    for (let other = 0; other < row; other += 1) {
      const distance = euclideanDistance(features.vectors[row], features.vectors[other], norms[row], norms[other])
      distances[row * n + other] = distance
      distances[other * n + row] = distance
      prepared += 1
    }
    onProgress?.({ phase: 'preparing', completed: prepared, total: pairs, k: null })
  }
  const fitTotal = (config.maxK - config.minK + 1) * config.restarts
  const winners: { k: number; seed: number; evaluation: SkillKMeansEvaluation }[] = []
  let fitted = 0
  onProgress?.({ phase: 'fitting', completed: 0, total: fitTotal, k: config.minK })
  for (let k = config.minK; k <= config.maxK; k += 1) {
    let winner: typeof winners[number] | null = null
    for (let restart = 0; restart < config.restarts; restart += 1) {
      // Keep the same bounded, reproducible seed sequence for every K.
      const seed = (config.seed + restart) % 100000
      const engine = k === config.minK && restart === 0 ? initialEngine
        : createSkillKMeansEngine(features, { k, seed, maxIterations: config.maxIterations })
      while (!engine.step()) { /* Complete this trial without sorting representative terms. */ }
      const evaluation = engine.evaluate()
      // Exact ties retain the earliest restart, including a seed sequence that wraps at 99999.
      if (!winner || evaluation.meanSquaredDistance < winner.evaluation.meanSquaredDistance) winner = { k, seed, evaluation }
      fitted += 1
      onProgress?.({ phase: 'fitting', completed: fitted, total: fitTotal, k })
    }
    winners.push(winner!)
  }
  const candidates: SkillKMeansSearchCandidate[] = []
  onProgress?.({ phase: 'evaluating', completed: 0, total: winners.length, k: null })
  winners.forEach(({ k, seed, evaluation }, index) => {
    const actualK = evaluation.counts.filter((count) => count > 0).length
    const silhouette = calculateSkillClusteringSilhouette(distances, evaluation.assignments)
    const eligible = evaluation.stopReason !== null && evaluation.stopReason !== 'max-iterations' && actualK === k
    candidates.push({ k, seed, meanSquaredDistance: evaluation.meanSquaredDistance, silhouette,
      iterations: evaluation.iteration, stopReason: evaluation.stopReason, actualK, eligible })
    onProgress?.({ phase: 'evaluating', completed: index + 1, total: winners.length, k })
  })
  let bestSilhouette: SkillKMeansSearchCandidate | null = null
  for (const candidate of candidates) {
    if (!candidate.eligible || candidate.silhouette === null) continue
    // Candidates ascend by K, so an exact tie selects fewer clusters.
    if (!bestSilhouette || candidate.silhouette > bestSilhouette.silhouette!) bestSilhouette = candidate
  }
  return { config, candidates, silhouetteK: bestSilhouette?.k ?? null, elbowK: findSkillKMeansElbow(candidates),
    documentCount: n, excludedCount: features.excludedIndices.length, termsCount: features.terms.length }
}

/**
 * Conservative chord-distance heuristic, not an assertion that a natural K exists.
 * Normalize both axes and require a unique interior departure of at least 10% of
 * the observed objective decrease, with a smaller slope immediately after it.
 * Flat, linear, increasing, incomplete, or ambiguous curves have no candidate.
 */
export function findSkillKMeansElbow(
  candidates: readonly Pick<SkillKMeansSearchCandidate, 'k' | 'meanSquaredDistance' | 'eligible'>[],
): number | null {
  if (candidates.length < 3 || candidates.some((point, index) => !point.eligible
    || !Number.isFinite(point.meanSquaredDistance) || point.meanSquaredDistance < 0
    || !Number.isInteger(point.k) || (index > 0 && point.k !== candidates[index - 1].k + 1))) return null
  const first = candidates[0]
  const last = candidates.at(-1)!
  const tolerance = 1e-10 * Math.max(1, first.meanSquaredDistance)
  const decrease = first.meanSquaredDistance - last.meanSquaredDistance
  if (decrease <= tolerance || candidates.some((point, index) => index > 0
    && point.meanSquaredDistance > candidates[index - 1].meanSquaredDistance + tolerance)) return null
  let bestIndex = -1
  let bestGap = -Infinity
  let tied = false
  for (let index = 1; index < candidates.length - 1; index += 1) {
    const point = candidates[index]
    const x = (point.k - first.k) / (last.k - first.k)
    const y = (point.meanSquaredDistance - last.meanSquaredDistance) / decrease
    const gap = 1 - x - y
    if (gap > bestGap + 1e-10) {
      bestGap = gap
      bestIndex = index
      tied = false
    } else if (Math.abs(gap - bestGap) <= 1e-10) tied = true
  }
  if (bestIndex < 0 || bestGap < 0.1 || tied) return null
  const before = candidates[bestIndex - 1].meanSquaredDistance - candidates[bestIndex].meanSquaredDistance
  const after = candidates[bestIndex].meanSquaredDistance - candidates[bestIndex + 1].meanSquaredDistance
  return before > after + tolerance ? candidates[bestIndex].k : null
}

function euclideanDistance(left: SkillKMeansSparseVector, right: SkillKMeansSparseVector, leftNorm: number, rightNorm: number): number {
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
  return Math.sqrt(Math.max(0, leftNorm + rightNorm - 2 * dot))
}

function validateConfig(features: SkillKMeansFeatures, config: SkillKMeansSearchConfig): void {
  const n = features?.vectors?.length ?? 0
  if (n < 3) throw new RangeError('K探索には学習に使える説明文が3件以上必要です。')
  const maxK = Math.min(80, n - 1)
  if (!Number.isInteger(config.minK) || !Number.isInteger(config.maxK) || config.minK < 2
    || config.maxK < config.minK || config.maxK > maxK) {
    throw new RangeError(`Kは2〜${maxK}の整数で、下限以下にならない上限を指定してください。`)
  }
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 99999) {
    throw new RangeError('開始seedは0〜99999の整数で指定してください。')
  }
  if (![1, 3, 5, 10].includes(config.restarts)) throw new RangeError('試行回数は1・3・5・10回から指定してください。')
  if (!Number.isInteger(config.maxIterations) || config.maxIterations < 1 || config.maxIterations > 30) {
    throw new RangeError('反復上限は1〜30の整数で指定してください。')
  }
}
