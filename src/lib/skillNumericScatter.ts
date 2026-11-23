import { calculatePearsonCorrelation } from './pearsonCorrelation.ts'
import { fitMultipleLinearRegression } from './multipleLinearRegression.ts'
import {
  getSkillNumericValue, type SkillNumericDataset, type SkillNumericMetric,
} from './skillNumericStatistics.ts'

export interface SkillNumericScatterPoint {
  id: string
  x: number
  y: number
}

export interface SkillNumericScatterResult {
  points: SkillNumericScatterPoint[]
  validCount: number
  excludedCount: number
  correlation: number | null
  fit: SkillNumericScatterFit | null
}

export interface SkillNumericScatterFit {
  slope: number
  intercept: number
  /** A constant response has no response variation to explain. */
  rSquared: number | null
}

/** The two values always come from the same skill. Coincident coordinates remain
 * separate observations, so every skill keeps its original weight in Pearson r.
 */
export function buildSkillNumericScatter(
  dataset: SkillNumericDataset, xMetric: SkillNumericMetric, yMetric: SkillNumericMetric,
): SkillNumericScatterResult {
  const points = dataset.observations.flatMap(observation => {
    const x = getSkillNumericValue(observation, xMetric)
    const y = getSkillNumericValue(observation, yMetric)
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
      ? [{ id: observation.id, x, y }] : []
  })
  return {
    points, validCount: points.length, excludedCount: dataset.observations.length - points.length,
    correlation: calculatePearsonCorrelation(points.map(point => point.x), points.map(point => point.y)),
    fit: fitScatter(points),
  }
}

function fitScatter(points: readonly SkillNumericScatterPoint[]): SkillNumericScatterFit | null {
  if (points.length < 2 || points.every(point => point.x === points[0].x)) return null
  if (points.every(point => point.y === points[0].y)) {
    return { slope: 0, intercept: points[0].y, rSquared: null }
  }
  // The common inference-oriented fitter requires positive residual degrees of
  // freedom. Two distinct X values still define a descriptive line exactly.
  if (points.length === 2) return fitTwoPoints(points[0], points[1])
  try {
    const result = fitMultipleLinearRegression(points.map(point => [point.x]), points.map(point => point.y))
    return checkedFit({ slope: result.coefficients[0], intercept: result.intercept, rSquared: result.rSquared })
  } catch {
    return null
  }
}

function fitTwoPoints(first: SkillNumericScatterPoint, last: SkillNumericScatterPoint): SkillNumericScatterFit | null {
  const directSlope = (last.y - first.y) / (last.x - first.x)
  const xScale = Math.max(Math.abs(first.x), Math.abs(last.x))
  const yScale = Math.max(Math.abs(first.y), Math.abs(last.y))
  const normalizedSlope = (last.y / yScale - first.y / yScale) / (last.x / xScale - first.x / xScale)
  const scaledCandidates = [
    normalizedSlope * (yScale / xScale),
    (normalizedSlope * yScale) / xScale,
    (normalizedSlope / xScale) * yScale,
  ]
  const slope = Number.isFinite(directSlope) && directSlope !== 0 ? directSlope
    : scaledCandidates.find(value => Number.isFinite(value) && value !== 0)
  // The response varies, so an underflowed zero would fabricate a horizontal fit.
  if (slope === undefined || !Number.isFinite(slope) || slope === 0) return null
  const directIntercept = first.y - slope * first.x
  const intercept = Number.isFinite(directIntercept) ? directIntercept
    : (first.y / yScale - normalizedSlope * (first.x / xScale)) * yScale
  return checkedFit({ slope, intercept, rSquared: 1 })
}

function checkedFit(fit: SkillNumericScatterFit): SkillNumericScatterFit | null {
  return Number.isFinite(fit.slope) && Number.isFinite(fit.intercept)
    && (fit.rSquared === null || Number.isFinite(fit.rSquared)) ? fit : null
}
