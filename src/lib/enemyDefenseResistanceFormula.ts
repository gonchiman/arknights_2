import type { EnemyRecord } from '../types/enemy.ts'
import { buildEnemyHistogramObservations, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import { calculateWeightedEmpiricalCdf } from './enemyWeightedEcdf.ts'
import { fitMultipleLinearRegression } from './multipleLinearRegression.ts'

export interface CorrespondencePoint {
  x: number
  y: number
  percentage: number
}

export interface CorrespondenceData {
  points: CorrespondencePoint[]
  total: number
  missingCount: number
}

export type CorrespondenceMethod = 'exact' | 'linear' | 'piecewise' | 'polynomial' | 'spline'

/** Y = coefficients[0] + coefficients[1] u + ..., where u = X - origin. */
export interface FormulaSegment {
  from: number
  to: number
  origin: number
  coefficients: number[]
}

export interface CorrespondenceModel {
  method: CorrespondenceMethod
  domain: [number, number]
  segments: FormulaSegment[]
  predict: (x: number) => number | null
  negativePrediction: boolean
  nonMonotonic: boolean
}

export interface CorrespondenceErrors {
  meanAbsoluteError: number
  maximumAbsoluteError: number
  sampleCount: number
  step: number
}

const CDF_TOLERANCE = Number.EPSILON * 8
const NUMERICAL_ERROR = '数値の桁差が大きく、安定して計算できません。'

/** Both distributions use the same finite paired cohort and compressed spawn frequencies. */
export function buildEnemyDefenseResistanceCorrespondence(
  rows: readonly EnemyRecord[],
  counts: EnemyHistogramCounts,
): CorrespondenceData {
  const paired = (enemy: EnemyRecord) => Number.isFinite(enemy.stats.defense) && Number.isFinite(enemy.stats.magicResistance)
  const resistanceObservations = buildEnemyHistogramObservations(
    rows, enemy => paired(enemy) ? enemy.stats.magicResistance : null, 'SPAWNS', counts,
  )
  const resistance = calculateWeightedEmpiricalCdf(resistanceObservations)
  const defense = calculateWeightedEmpiricalCdf(buildEnemyHistogramObservations(
    rows, enemy => paired(enemy) ? enemy.stats.defense : null, 'SPAWNS', counts,
  ))
  const missingCount = resistanceObservations.reduce((sum, { value, weight }) => (
    value === null && Number.isFinite(weight) && weight > 0 ? sum + weight : sum
  ), 0)
  const total = resistance.at(-1)?.cumulativeCount ?? 0
  if (!resistance.length || !defense.length) return { points: [], total: 0, missingCount }

  let defenseIndex = 0
  const points = resistance.map(point => {
    while (defenseIndex < defense.length - 1 && defense[defenseIndex].proportion + CDF_TOLERANCE < point.proportion) {
      defenseIndex += 1
    }
    return { x: point.value, y: defense[defenseIndex].value, percentage: point.proportion * 100 }
  })
  return { points, total, missingCount }
}

export function fitCorrespondenceModel(
  source: readonly CorrespondencePoint[],
  method: CorrespondenceMethod,
  options: { degree?: 2 | 3; breakpoints?: readonly number[] } = {},
): { model: CorrespondenceModel | null; error: string | null } {
  const points = [...source].sort((left, right) => left.x - right.x)
  if (!points.length) return { model: null, error: '対応するデータがありません。' }
  if (points.some((point, index) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || (index > 0 && point.x === points[index - 1].x))) {
    return { model: null, error: '対応点の値や術耐性の重複を確認してください。' }
  }
  const domain: [number, number] = [points[0].x, points.at(-1)!.x]
  if (!Number.isFinite(domain[1] - domain[0])) return { model: null, error: NUMERICAL_ERROR }
  try {
    let segments: FormulaSegment[]
    switch (method) {
      case 'exact':
        segments = points.map((point, index) => ({ from: point.x, to: points[index + 1]?.x ?? point.x,
          origin: point.x, coefficients: [point.y] }))
        break
      case 'linear':
        segments = [fitPolynomial(points, 1)]
        break
      case 'polynomial':
        segments = [fitPolynomial(points, options.degree ?? 2)]
        break
      case 'piecewise': {
        if (points.length < 2) throw new Error('区分一次式には対応点が2点以上必要です。')
        const breaks = options.breakpoints ?? []
        if (breaks.length > 20 || breaks.some((value, index) => !Number.isFinite(value)
          || value <= domain[0] || value >= domain[1] || (index > 0 && value <= breaks[index - 1]))) {
          throw new Error('区切りは適用範囲の内側で、小さい順に20個以内で指定してください。')
        }
        const knots = [domain[0], ...breaks, domain[1]]
        segments = knots.slice(0, -1).map((from, index) => {
          const to = knots[index + 1]
          const value = exactValue(points, from)
          return { from, to, origin: from, coefficients: [value, (exactValue(points, to) - value) / (to - from)] }
        })
        break
      }
      case 'spline':
        segments = monotoneSpline(points)
        break
      default:
        throw new Error('式を作る方法を確認してください。')
    }
    if (segments.some(segment => ![segment.from, segment.to, segment.origin, ...segment.coefficients].every(Number.isFinite))) {
      throw new Error(NUMERICAL_ERROR)
    }
    return { model: createModel(method, domain, segments), error: null }
  } catch (cause) {
    return { model: null, error: cause instanceof Error ? cause.message : NUMERICAL_ERROR }
  }
}

/** A shared evaluation grid keeps errors comparable across methods, including between observed knots. */
export function evaluateCorrespondenceErrors(
  points: readonly CorrespondencePoint[],
  model: CorrespondenceModel,
): CorrespondenceErrors {
  const ordered = [...points].sort((left, right) => left.x - right.x)
  const [minimum, maximum] = model.domain
  const range = maximum - minimum
  const step = range === 0 ? 0 : Math.max(1, range / 1000)
  const intervals = range === 0 ? 0 : Math.min(1000, Math.ceil(range / step))
  let sum = 0
  let maximumAbsoluteError = 0
  for (let index = 0; index <= intervals; index++) {
    const x = index === intervals ? maximum : minimum + index * step
    const error = Math.abs(model.predict(x)! - exactValue(ordered, x))
    sum += error
    maximumAbsoluteError = Math.max(maximumAbsoluteError, error)
  }
  return { meanAbsoluteError: sum / (intervals + 1), maximumAbsoluteError, sampleCount: intervals + 1, step }
}

function exactValue(points: readonly CorrespondencePoint[], x: number): number {
  let lower = 0
  let upper = points.length - 1
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    if (points[middle].x <= x) lower = middle
    else upper = middle - 1
  }
  return points[lower].y
}

function evaluatePolynomial(coefficients: readonly number[], value: number): number {
  return coefficients.reduceRight((sum, coefficient) => sum * value + coefficient, 0)
}

function fitPolynomial(points: readonly CorrespondencePoint[], degree: number): FormulaSegment {
  if (points.length <= degree) throw new Error(`${degree}次式には異なる術耐性の対応点が${degree + 1}点以上必要です。`)
  const from = points[0].x
  const to = points.at(-1)!.x
  const origin = from / 2 + to / 2
  const scale = (to - from) / 2
  if (!Number.isFinite(scale) || !(scale > 0)) throw new Error(NUMERICAL_ERROR)
  const coordinates = points.map(point => (point.x - origin) / scale)
  const responses = points.map(point => point.y)
  let coefficients: number[]
  if (responses.every(value => value === responses[0])) {
    coefficients = [responses[0], ...Array<number>(degree).fill(0)]
  } else if (points.length === degree + 1) {
    coefficients = interpolatePolynomial(coordinates, responses)
  } else {
    const predictors = coordinates.map(value => Array.from({ length: degree }, (_, index) => value ** (index + 1)))
    const fit = fitMultipleLinearRegression(predictors, responses)
    coefficients = [fit.intercept, ...fit.coefficients]
  }
  return { from, to, origin, coefficients: coefficients.map((value, power) => value / scale ** power) }
}

/** The minimum square system is interpolation, so no residual degrees of freedom are needed. */
function interpolatePolynomial(coordinates: readonly number[], responses: readonly number[]): number[] {
  const differences = [...responses]
  for (let order = 1; order < differences.length; order++) {
    for (let index = differences.length - 1; index >= order; index--) {
      differences[index] = (differences[index] - differences[index - 1]) / (coordinates[index] - coordinates[index - order])
    }
  }
  let coefficients = [differences.at(-1)!]
  for (let index = differences.length - 2; index >= 0; index--) {
    const expanded = Array<number>(coefficients.length + 1).fill(0)
    coefficients.forEach((coefficient, power) => {
      expanded[power] -= coordinates[index] * coefficient
      expanded[power + 1] += coefficient
    })
    expanded[0] += differences[index]
    coefficients = expanded
  }
  return coefficients
}

/** PCHIP uses local harmonic slopes and limited endpoints to preserve plateaus and monotonicity. */
function monotoneSpline(points: readonly CorrespondencePoint[]): FormulaSegment[] {
  if (points.length < 2) throw new Error('単調スプラインには対応点が2点以上必要です。')
  const widths = points.slice(1).map((point, index) => point.x - points[index].x)
  const slopes = widths.map((width, index) => (points[index + 1].y - points[index].y) / width)
  if (slopes.some(value => value < 0)) throw new Error('単調スプラインには防御力が減少しない対応点が必要です。')
  const tangents = Array<number>(points.length).fill(slopes[0])
  if (points.length > 2) {
    tangents[0] = endpointSlope(widths[0], widths[1], slopes[0], slopes[1])
    tangents[tangents.length - 1] = endpointSlope(widths.at(-1)!, widths.at(-2)!, slopes.at(-1)!, slopes.at(-2)!)
    for (let index = 1; index < points.length - 1; index++) {
      const before = slopes[index - 1]
      const after = slopes[index]
      if (before === 0 || after === 0) tangents[index] = 0
      else {
        const weightBefore = 2 * widths[index] + widths[index - 1]
        const weightAfter = widths[index] + 2 * widths[index - 1]
        tangents[index] = (weightBefore + weightAfter) / (weightBefore / before + weightAfter / after)
      }
    }
  }
  return widths.map((width, index) => ({
    from: points[index].x, to: points[index + 1].x, origin: points[index].x,
    coefficients: [points[index].y, tangents[index],
      (3 * slopes[index] - 2 * tangents[index] - tangents[index + 1]) / width,
      (tangents[index] + tangents[index + 1] - 2 * slopes[index]) / width ** 2],
  }))
}

function endpointSlope(width: number, nextWidth: number, slope: number, nextSlope: number): number {
  const estimate = ((2 * width + nextWidth) * slope - width * nextSlope) / (width + nextWidth)
  return Math.max(0, Math.min(3 * slope, estimate))
}

function createModel(method: CorrespondenceMethod, domain: [number, number], segments: FormulaSegment[]): CorrespondenceModel {
  const predict = (x: number): number | null => {
    if (!Number.isFinite(x) || x < domain[0] || x > domain[1]) return null
    let index = segments.length - 1
    while (segments[index].from > x) index -= 1
    const segment = segments[index]
    const result = evaluatePolynomial(segment.coefficients, x - segment.origin)
    return Number.isFinite(result) ? result : null
  }
  let negativePrediction = false
  let nonMonotonic = false
  let previousEnd: number | undefined
  for (const segment of segments) {
    const low = segment.from - segment.origin
    const high = segment.to - segment.origin
    const coefficients = segment.coefficients
    const derivative = coefficients.slice(1).map((value, index) => value * (index + 1))
    const extrema = quadraticRoots(derivative[2] ?? 0, derivative[1] ?? 0, derivative[0] ?? 0)
      .filter(value => value > low && value < high)
    const values = [low, high, ...extrema].map(value => evaluatePolynomial(coefficients, value))
    const derivativeLocations = [low, high]
    if (derivative[2]) {
      const vertex = -derivative[1] / (2 * derivative[2])
      if (vertex > low && vertex < high) derivativeLocations.push(vertex)
    }
    const derivativeValues = derivativeLocations.map(value => evaluatePolynomial(derivative, value))
    if (![...values, ...derivativeValues].every(Number.isFinite)) throw new Error(NUMERICAL_ERROR)
    const valueTolerance = 1e-10 * Math.max(1, ...values.map(Math.abs))
    const slopeTolerance = 1e-10 * Math.max(1, ...derivativeValues.map(Math.abs))
    negativePrediction ||= values.some(value => value < -valueTolerance)
    nonMonotonic ||= derivativeValues.some(value => value < -slopeTolerance)
      || (previousEnd !== undefined && values[0] < previousEnd - valueTolerance)
    previousEnd = values[1]
  }
  return { method, domain, segments, predict, negativePrediction, nonMonotonic }
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b]
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c))
  const normalizedA = a / scale
  const normalizedB = b / scale
  const normalizedC = c / scale
  const discriminant = normalizedB ** 2 - 4 * normalizedA * normalizedC
  if (discriminant < 0) return []
  const numerator = -0.5 * (normalizedB + (normalizedB >= 0 ? 1 : -1) * Math.sqrt(discriminant))
  if (numerator === 0) return [-normalizedB / (2 * normalizedA)]
  return [numerator / normalizedA, normalizedC / numerator]
}
