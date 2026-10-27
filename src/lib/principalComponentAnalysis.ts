export interface StandardizedPcaResult {
  observationCount: number
  /** The original number of input columns, including constants. */
  featureCount: number
  activeColumns: number[]
  constantColumns: number[]
  means: number[]
  /** Population standard deviation (division by n). Constant columns are zero. */
  standardDeviations: number[]
  /** Original column order; constant columns are represented by zeros. */
  standardized: number[][]
  /** Descending eigenvalues of the standardized population covariance matrix. */
  eigenvalues: number[]
  explainedVariance: number[]
  /** One row per component, in the original input column order. */
  coefficients: number[][]
  /** One row per observation, one column per component. */
  scores: number[][]
}

/** Center and standardize finite observations, then diagonalize their correlation matrix. */
export function fitStandardizedPca(observations: readonly (readonly number[])[]): StandardizedPcaResult {
  const observationCount = observations.length
  if (observationCount < 2) throw new Error('主成分分析には、数値が揃う対象が2件以上必要です。')
  const featureCount = observations[0].length
  if (featureCount === 0) throw new Error('主成分分析の対象項目がありません。')
  for (const row of observations) {
    if (row.length !== featureCount) throw new Error('主成分分析の項目数が一致していません。')
    if (row.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('主成分分析には有限の数値を使用してください。')
    }
  }

  const means = Array<number>(featureCount).fill(0)
  const standardDeviations = Array<number>(featureCount).fill(0)
  const standardized = observations.map(() => Array<number>(featureCount).fill(0))
  const activeColumns: number[] = []
  const constantColumns: number[] = []
  for (let column = 0; column < featureCount; column++) {
    const values = observations.map(row => row[column])
    if (values.every(value => value === values[0])) {
      means[column] = values[0]
      constantColumns.push(column)
      continue
    }
    // Scaling before centering keeps differently sized units finite and avoids
    // treating a small, varying unit as constant because of an absolute epsilon.
    const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
    const normalized = values.map(value => value / scale)
    const center = sum(normalized) / observationCount
    const centered = normalized.map(value => value - center)
    const deviation = Math.sqrt(sum(centered.map(value => value * value)) / observationCount)
    if (!(deviation > 0) || !Number.isFinite(deviation)) throw numericalRangeError()
    means[column] = center * scale
    standardDeviations[column] = deviation * scale
    if (!(standardDeviations[column] > 0) || !Number.isFinite(standardDeviations[column])) throw numericalRangeError()
    centered.forEach((value, index) => { standardized[index][column] = value / deviation })
    activeColumns.push(column)
  }
  if (activeColumns.length === 0) throw new Error('すべての項目が同じ値のため、主成分分析できません。')

  const covariance = activeColumns.map(left => activeColumns.map(right => (
    sum(standardized.map(row => row[left] * row[right])) / observationCount
  )))
  const decomposition = symmetricEigenDecomposition(covariance)
  const eigenvalues = decomposition.map(({ value }) => value)
  const totalVariance = sum(eigenvalues)
  const explainedVariance = eigenvalues.map(value => value / totalVariance)
  const coefficients = decomposition.map(({ vector }) => {
    const coefficient = Array<number>(featureCount).fill(0)
    activeColumns.forEach((column, index) => { coefficient[column] = vector[index] })
    return coefficient
  })
  const scores = standardized.map(row => coefficients.map(component => (
    sum(row.map((value, column) => value * component[column]))
  )))
  return { observationCount, featureCount, activeColumns, constantColumns, means,
    standardDeviations, standardized, eigenvalues, explainedVariance, coefficients, scores }
}

/** Jacobi rotations for the small, real symmetric matrix used by PCA. */
function symmetricEigenDecomposition(input: readonly (readonly number[])[]) {
  const size = input.length
  const matrix = input.map(row => [...row])
  const vectors = input.map((_, row) => input.map((_, column) => Number(row === column)))
  const tolerance = 1e-13
  let converged = size === 1
  for (let iteration = 0; iteration < 100 * size * size; iteration++) {
    let p = 0
    let q = 0
    let largest = 0
    for (let row = 0; row < size; row++) {
      for (let column = row + 1; column < size; column++) {
        if (Math.abs(matrix[row][column]) > largest) {
          largest = Math.abs(matrix[row][column]); p = row; q = column
        }
      }
    }
    if (largest <= tolerance) { converged = true; break }
    const offDiagonal = matrix[p][q]
    const theta = (matrix[q][q] - matrix[p][p]) / (2 * offDiagonal)
    const tangent = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.hypot(theta, 1))
    const cosine = 1 / Math.hypot(1, tangent)
    const sine = tangent * cosine
    matrix[p][p] -= tangent * offDiagonal
    matrix[q][q] += tangent * offDiagonal
    matrix[p][q] = matrix[q][p] = 0
    for (let index = 0; index < size; index++) {
      if (index !== p && index !== q) {
        const left = matrix[index][p]
        const right = matrix[index][q]
        matrix[index][p] = matrix[p][index] = cosine * left - sine * right
        matrix[index][q] = matrix[q][index] = sine * left + cosine * right
      }
      const left = vectors[index][p]
      const right = vectors[index][q]
      vectors[index][p] = cosine * left - sine * right
      vectors[index][q] = sine * left + cosine * right
    }
  }
  if (!converged) throw new Error('主成分分析の計算が収束しませんでした。')
  return matrix.map((row, component) => {
    if (!Number.isFinite(row[component]) || row[component] < -1e-10) throw numericalRangeError()
    const vector = vectors.map(row => row[component])
    let largest = 0
    vector.forEach((value, index) => {
      if (Math.abs(value) > Math.abs(vector[largest])) largest = index
    })
    // Eigenvectors have an arbitrary sign. Fix it so repeated displays agree.
    if (vector[largest] < 0) vector.forEach((value, index) => { vector[index] = -value })
    return { value: Math.max(0, row[component]), vector, originalIndex: component }
  }).sort((left, right) => right.value - left.value || left.originalIndex - right.originalIndex)
}

function sum(values: readonly number[]): number {
  let total = 0
  let correction = 0
  for (const value of values) {
    const adjusted = value - correction
    const next = total + adjusted
    correction = (next - total) - adjusted
    total = next
  }
  return total
}

function numericalRangeError(): Error {
  return new Error('数値の範囲が大きすぎるため、主成分分析できません。')
}
