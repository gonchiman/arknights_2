import type {
  SkillClusteringFeatures as SkillKMeansFeatures,
  SkillClusteringSparseVector as SkillKMeansSparseVector,
} from './skillClusteringFeatures.ts'

// Retain the original public names for the existing K-means page and workers.
export {
  buildSkillClusteringCorpus as buildSkillKMeansCorpus,
  createSkillClusteringFeatures as createSkillKMeansFeatures,
} from './skillClusteringFeatures.ts'
export type {
  SkillClusteringDocument as SkillKMeansDocument,
  SkillClusteringFeatures as SkillKMeansFeatures,
  SkillClusteringSparseVector as SkillKMeansSparseVector,
} from './skillClusteringFeatures.ts'

export interface SkillKMeansConfig {
  k: number
  seed: number
  maxIterations: number
}

export interface SkillKMeansResult {
  config: SkillKMeansConfig
  iteration: number
  converged: boolean
  stopReason: 'stable-assignments' | 'tolerance' | 'max-iterations' | null
  assignments: number[]
  counts: number[]
  representativeTerms: string[][]
  representativeIndices: number[]
  history: { iteration: number; meanSquaredDistance: number; changes: number | null }[]
}

export interface SkillKMeansEngine {
  step(): void
  snapshot(): SkillKMeansResult
}

export function createSkillKMeansEngine(features: SkillKMeansFeatures, settings: SkillKMeansConfig): SkillKMeansEngine {
  const config = { ...settings }
  validateFeatures(features)
  if (!Number.isInteger(config.k) || config.k < 1 || config.k > features.vectors.length) {
    throw new RangeError(`クラスタ数は1〜${features.vectors.length}の整数で指定してください。`)
  }
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) {
    throw new RangeError('初期値は0〜4294967295の整数で指定してください。')
  }
  if (!Number.isInteger(config.maxIterations) || config.maxIterations < 1 || config.maxIterations > 1000) {
    throw new RangeError('反復上限は1〜1000の整数で指定してください。')
  }
  const snapshotConfig = { ...config }
  const vectors = features.vectors
  const dimensions = features.terms.length
  const squaredNorms = vectors.map((vector) => vector.values.reduce((sum, value) => sum + value * value, 0))
  const random = seededRandom(config.seed)
  const centers: Float64Array[] = []
  const chosen = new Set<number>()
  const nearest = vectors.map(() => Infinity)
  const addCenter = (index: number) => {
    chosen.add(index)
    const center = new Float64Array(dimensions)
    vectors[index].indices.forEach((term, offset) => { center[term] = vectors[index].values[offset] })
    centers.push(center)
    const norm = squaredNorms[index]
    vectors.forEach((vector, row) => { nearest[row] = Math.min(nearest[row], squaredDistance(vector, squaredNorms[row], center, norm)) })
  }
  addCenter(Math.floor(random() * vectors.length))
  while (centers.length < config.k) {
    const total = nearest.reduce((sum, value, index) => sum + (chosen.has(index) ? 0 : value), 0)
    let next = -1
    if (total > 0) {
      let target = random() * total
      for (let index = 0; index < vectors.length; index += 1) {
        if (chosen.has(index)) continue
        target -= nearest[index]
        if (target < 0) { next = index; break }
      }
    }
    if (next < 0) next = vectors.findIndex((_, index) => !chosen.has(index))
    addCenter(next)
  }
  let centerNorms = centers.map((center) => center.reduce((sum, value) => sum + value * value, 0))
  let assignments: number[] = []
  let distances: number[] = []
  const assign = () => {
    const nextAssignments: number[] = []
    const nextDistances: number[] = []
    vectors.forEach((vector, row) => {
      let best = 0
      let distance = squaredDistance(vector, squaredNorms[row], centers[0], centerNorms[0])
      for (let cluster = 1; cluster < centers.length; cluster += 1) {
        const candidate = squaredDistance(vector, squaredNorms[row], centers[cluster], centerNorms[cluster])
        if (candidate < distance) { best = cluster; distance = candidate }
      }
      nextAssignments.push(best)
      nextDistances.push(distance)
    })
    assignments = nextAssignments
    distances = nextDistances
  }
  assign()
  let iteration = 0
  let stopReason: SkillKMeansResult['stopReason'] = null
  const objective = () => distances.reduce((sum, value) => sum + value, 0) / vectors.length
  const history: SkillKMeansResult['history'] = [{ iteration: 0, meanSquaredDistance: objective(), changes: null }]

  return {
    step() {
      if (stopReason) return
      const previousAssignments = assignments
      const counts = Array<number>(config.k).fill(0)
      const sums = centers.map(() => new Float64Array(dimensions))
      vectors.forEach((vector, row) => {
        const cluster = previousAssignments[row]
        counts[cluster] += 1
        vector.indices.forEach((term, offset) => { sums[cluster][term] += vector.values[offset] })
      })
      sums.forEach((sum, cluster) => {
        // Keeping an empty cluster's previous center preserves the Lloyd objective.
        if (!counts[cluster]) return
        sum.forEach((value, term) => { centers[cluster][term] = value / counts[cluster] })
      })
      centerNorms = centers.map((center) => center.reduce((sum, value) => sum + value * value, 0))
      assign()
      iteration += 1
      const changes = assignments.reduce((sum, cluster, index) => sum + Number(cluster !== previousAssignments[index]), 0)
      const value = objective()
      const previousValue = history.at(-1)!.meanSquaredDistance
      history.push({ iteration, meanSquaredDistance: value, changes })
      if (changes === 0) stopReason = 'stable-assignments'
      else if (previousValue - value <= 1e-10 * Math.max(1, previousValue)) stopReason = 'tolerance'
      else if (iteration >= snapshotConfig.maxIterations) stopReason = 'max-iterations'
    },
    snapshot() {
      const alignedAssignments = Array<number>(features.documentCount).fill(-1)
      const counts = Array<number>(config.k).fill(0)
      const representativeIndices = Array<number>(config.k).fill(-1)
      const representativeDistances = Array<number>(config.k).fill(Infinity)
      assignments.forEach((cluster, row) => {
        alignedAssignments[features.documentIndices[row]] = cluster
        counts[cluster] += 1
        if (distances[row] < representativeDistances[cluster]) {
          representativeDistances[cluster] = distances[row]
          representativeIndices[cluster] = features.documentIndices[row]
        }
      })
      const representativeTerms = centers.map((center, cluster) => counts[cluster] === 0 ? [] : [...center]
        .map((weight, index) => ({ weight, term: features.terms[index] }))
        .filter(({ weight, term }) => weight > 0 && [...term].length >= 2)
        .sort((left, right) => right.weight - left.weight || compareText(left.term, right.term))
        .slice(0, 5).map(({ term }) => term))
      return {
        config: { ...snapshotConfig }, iteration, converged: stopReason !== null, stopReason,
        assignments: alignedAssignments, counts, representativeTerms, representativeIndices,
        history: history.map((point) => ({ ...point })),
      }
    },
  }
}

function squaredDistance(vector: SkillKMeansSparseVector, vectorNorm: number, center: Float64Array, centerNorm: number): number {
  let dot = 0
  vector.indices.forEach((term, offset) => { dot += vector.values[offset] * center[term] })
  return Math.max(0, vectorNorm + centerNorm - 2 * dot)
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let mixed = value
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61)
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateFeatures(features: SkillKMeansFeatures): void {
  if (!features || !Array.isArray(features.terms) || !features.terms.length || !Array.isArray(features.vectors)
    || !features.vectors.length || !Number.isSafeInteger(features.documentCount) || features.documentCount < 1
    || !Array.isArray(features.documentIndices) || features.documentIndices.length !== features.vectors.length
    || !Array.isArray(features.excludedIndices)) {
    throw new RangeError('学習に使える説明文がありません。')
  }
  const allIndices = [...features.documentIndices, ...features.excludedIndices]
  if (allIndices.length !== features.documentCount || new Set(allIndices).size !== features.documentCount
    || allIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= features.documentCount)) {
    throw new RangeError('説明文と特徴量の対応が不正です。')
  }
  for (const vector of features.vectors) {
    if (!Array.isArray(vector.indices) || !Array.isArray(vector.values) || vector.indices.length === 0
      || vector.indices.length !== vector.values.length
      || vector.indices.some((index, offset) => !Number.isInteger(index) || index < 0 || index >= features.terms.length
        || (offset > 0 && vector.indices[offset - 1] >= index))
      || vector.values.some((value) => !Number.isFinite(value))
      || !vector.values.some((value) => value !== 0)) {
      throw new RangeError('説明文の特徴量が不正です。')
    }
  }
}
