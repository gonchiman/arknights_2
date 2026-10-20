export interface MultipleLinearRegressionResult {
  intercept: number
  /** Coefficients follow the input predictor columns, including after QR pivoting. */
  coefficients: readonly number[]
  /** b * sd(X) / sd(Y), using the same observations and predictor column order. */
  standardizedCoefficients: readonly number[]
  fittedValues: readonly number[]
  residuals: readonly number[]
  rSquared: number
  adjustedRSquared: number
  meanAbsoluteError: number
  observationCount: number
  /** Includes the intercept. */
  parameterCount: number
  residualDegreesOfFreedom: number
}

/**
 * Unweighted ordinary least squares with an intercept. Each predictor row is one
 * observation. The caller must remove missing observations before calling.
 * Centering, column scaling and pivoted, reorthogonalized QR avoid forming X'X.
 */
export function fitMultipleLinearRegression(
  predictors: readonly (readonly number[])[],
  responses: readonly number[],
  predictorNames?: readonly string[],
): MultipleLinearRegressionResult {
  const observationCount = responses.length
  if (predictors.length !== observationCount) {
    throw new Error('説明変数と目的変数の観測件数が一致していません。')
  }
  if (!observationCount) throw new Error('分析する観測データがありません。')
  const columnCount = predictors[0].length
  if (!columnCount) throw new Error('説明変数を1つ以上選んでください。')
  if (predictorNames && predictorNames.length !== columnCount) {
    throw new Error('説明変数の列数と変数名の数が一致していません。')
  }
  const names = Array.from({ length: columnCount }, (_, column) => (
    predictorNames?.[column]?.trim() || `説明変数${column + 1}`
  ))
  predictors.forEach((row, index) => {
    if (row.length !== columnCount) throw new Error(`${index + 1}件目の説明変数の列数が一致していません。`)
    row.forEach((value, column) => {
      if (!Number.isFinite(value)) throw new Error(`${index + 1}件目の「${names[column]}」が有限の数値ではありません。`)
    })
    if (!Number.isFinite(responses[index])) throw new Error(`${index + 1}件目の目的変数が有限の数値ではありません。`)
  })
  const parameterCount = columnCount + 1
  if (observationCount <= parameterCount) {
    throw new Error(`利用件数（${observationCount}件）は、切片を含むパラメーター数（${parameterCount}個）より多く必要です。`)
  }
  if (responses.every(value => value === responses[0])) {
    throw new Error('目的変数がすべて同じ値のため、分析できません。')
  }

  // Normalize before centering so very large or small units do not overflow or
  // get mistaken for constant columns by an absolute tolerance.
  const responseScale = maximumAbsoluteValue(responses)
  const normalizedResponses = responses.map(value => value / responseScale)
  const responseMean = mean(normalizedResponses)
  const centeredResponses = normalizedResponses.map(value => value - responseMean)
  const responseVariation = dot(centeredResponses, centeredResponses)
  if (!(responseVariation > 0)) throw numericalRangeError()

  const means: number[] = []
  const scales: number[] = []
  const lengths: number[] = []
  const columns = Array.from({ length: columnCount }, (_, column) => {
    const values = predictors.map(row => row[column])
    if (values.every(value => value === values[0])) {
      throw new Error(`「${names[column]}」がすべて同じ値です。この説明変数を外してください。`)
    }
    const scale = maximumAbsoluteValue(values)
    const normalized = values.map(value => value / scale)
    const center = mean(normalized)
    const centered = normalized.map(value => value - center)
    const length = Math.sqrt(dot(centered, centered))
    if (!(length > 0)) throw numericalRangeError()
    means.push(center)
    scales.push(scale)
    lengths.push(length)
    return centered.map(value => value / length)
  })

  const permutation = Array.from({ length: columnCount }, (_, index) => index)
  const orthogonalColumns: number[][] = []
  const triangular = Array.from({ length: columnCount }, () => Array<number>(columnCount).fill(0))
  const rankTolerance = 64 * Number.EPSILON * Math.max(observationCount, columnCount)

  for (let column = 0; column < columnCount; column++) {
    let pivot = column
    let largestNorm = dot(columns[column], columns[column])
    for (let candidate = column + 1; candidate < columnCount; candidate++) {
      const norm = dot(columns[candidate], columns[candidate])
      if (norm > largestNorm) { pivot = candidate; largestNorm = norm }
    }
    if (pivot !== column) {
      ;[columns[column], columns[pivot]] = [columns[pivot], columns[column]]
      ;[permutation[column], permutation[pivot]] = [permutation[pivot], permutation[column]]
      for (let previous = 0; previous < column; previous++) {
        ;[triangular[previous][column], triangular[previous][pivot]] = [triangular[previous][pivot], triangular[previous][column]]
      }
    }
    const length = Math.sqrt(largestNorm)
    if (length <= rankTolerance) {
      const dependentNames = permutation.slice(column).map(index => `「${names[index]}」`).join('・')
      throw new Error(`${dependentNames}がほかの説明変数と線形従属、または数値的に区別できません。説明変数を減らしてください。`)
    }
    triangular[column][column] = length
    const orthogonal = columns[column].map(value => value / length)
    orthogonalColumns.push(orthogonal)
    for (let remaining = column + 1; remaining < columnCount; remaining++) {
      // A second pass removes the loss of orthogonality from cancellation.
      for (let pass = 0; pass < 2; pass++) {
        const projection = dot(orthogonal, columns[remaining])
        triangular[column][remaining] += projection
        for (let observation = 0; observation < observationCount; observation++) {
          columns[remaining][observation] -= projection * orthogonal[observation]
        }
      }
    }
  }

  const pivotedCoefficients = orthogonalColumns.map(column => dot(column, centeredResponses))
  for (let column = columnCount - 1; column >= 0; column--) {
    for (let following = column + 1; following < columnCount; following++) {
      pivotedCoefficients[column] -= triangular[column][following] * pivotedCoefficients[following]
    }
    pivotedCoefficients[column] /= triangular[column][column]
  }
  const scaledCoefficients = Array<number>(columnCount).fill(0)
  permutation.forEach((originalColumn, index) => { scaledCoefficients[originalColumn] = pivotedCoefficients[index] })
  const coefficients = scaledCoefficients.map((value, column) => (
    rescaleCoefficient(value / lengths[column], responseScale, scales[column])
  ))
  // The scaled predictor columns have centered norm 1. Dividing their
  // coefficients by the response's centered norm gives b * sd(X) / sd(Y)
  // without reconstructing variances in the original, potentially huge units.
  const responseLength = Math.sqrt(responseVariation)
  const standardizedCoefficients = scaledCoefficients.map(value => value / responseLength)
  const intercept = responseMean * responseScale - sum(coefficients.map((value, column) => value * (means[column] * scales[column])))

  const fittedValues: number[] = []
  const residuals: number[] = []
  const normalizedResiduals: number[] = []
  predictors.forEach((row, index) => {
    const centeredFitted = sum(row.map((value, column) => (
      scaledCoefficients[column] * ((value / scales[column] - means[column]) / lengths[column])
    )))
    const residual = centeredResponses[index] - centeredFitted
    fittedValues.push((responseMean + centeredFitted) * responseScale)
    residuals.push(residual * responseScale)
    normalizedResiduals.push(residual)
  })
  const residualSumOfSquares = dot(normalizedResiduals, normalizedResiduals)
  // The intercept bounds training R² to [0, 1]; clamp floating-point roundoff.
  const rSquared = Math.max(0, Math.min(1, 1 - residualSumOfSquares / responseVariation))
  const residualDegreesOfFreedom = observationCount - parameterCount
  const adjustedRSquared = 1 - (1 - rSquared) * (observationCount - 1) / residualDegreesOfFreedom
  const meanAbsoluteError = mean(normalizedResiduals.map(Math.abs)) * responseScale
  if (![intercept, ...coefficients, ...standardizedCoefficients, ...fittedValues, ...residuals, rSquared, adjustedRSquared, meanAbsoluteError].every(Number.isFinite)) {
    throw numericalRangeError()
  }
  return { intercept, coefficients, standardizedCoefficients, fittedValues, residuals, rSquared, adjustedRSquared, meanAbsoluteError,
    observationCount, parameterCount, residualDegreesOfFreedom }
}

function sum(values: readonly number[]): number {
  let total = 0
  let correction = 0
  for (const value of values) {
    const corrected = value - correction
    const next = total + corrected
    correction = (next - total) - corrected
    total = next
  }
  return total
}

function mean(values: readonly number[]): number {
  return sum(values) / values.length
}

function dot(left: readonly number[], right: readonly number[]): number {
  return sum(left.map((value, index) => value * right[index]))
}

function maximumAbsoluteValue(values: readonly number[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
}

function rescaleCoefficient(value: number, numerator: number, denominator: number): number {
  // Try different operation orders before accepting underflow or overflow.
  const candidates = [(value / denominator) * numerator, (value * numerator) / denominator, value * (numerator / denominator)]
  return candidates.find(candidate => Number.isFinite(candidate) && candidate !== 0)
    ?? candidates.find(Number.isFinite) ?? Number.NaN
}

function numericalRangeError(): Error {
  return new Error('数値の桁差が大きく、安定して計算できません。変数の単位や対象範囲を見直してください。')
}
