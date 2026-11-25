import { fitMultipleLinearRegression } from './multipleLinearRegression.ts'
import { getSkillDpsPredictorColumnSets } from './skillDpsRegressionSubsets.ts'
import type { SkillDpsRegressionPredictor } from './skillDpsMultipleRegression.ts'

export const SKILL_DPS_CROSS_VALIDATION_VIF_TOLERANCE = 0.5

export interface SkillDpsCrossValidationInput {
  candidates: readonly SkillDpsRegressionPredictor[]
  predictorValues: readonly (readonly number[])[]
  dpsValues: readonly number[]
  operatorIds: readonly string[]
}

export interface SkillDpsCrossValidationProgress {
  completed: number
  total: number
}

export interface SkillDpsCrossValidationErrorMetrics {
  mae: number
  rmse: number
}

export interface SkillDpsCrossValidationResult {
  observationCount: number
  operatorCount: number
  methods: Record<'adjusted' | 'vif' | 'fixed', SkillDpsCrossValidationErrorMetrics | null>
}

interface FoldFit {
  columns: readonly number[]
  key: string
  adjustedRSquared: number
  maxVif: number
  intercept: number
  coefficients: readonly number[]
}

interface PredictionErrors {
  count: number
  absoluteSum: number
  squaredSum: number
}

export function evaluateSkillDpsCrossValidation(
  { candidates, predictorValues, dpsValues, operatorIds }: SkillDpsCrossValidationInput,
  onProgress?: (progress: SkillDpsCrossValidationProgress) => void,
): SkillDpsCrossValidationResult {
  const heldOperatorIds = [...new Set(operatorIds)]
  const columnSets = getSkillDpsPredictorColumnSets(candidates.length).map(columns => ({
    columns, key: columns.map(column => candidates[column]).join(','),
  }))
  const attackColumn = candidates.indexOf('attack')
  const intervalColumn = candidates.indexOf('interval')
  const fixedKey = columnSets.find(({ columns }) => columns.length === 2
    && columns.includes(attackColumn) && columns.includes(intervalColumn))?.key
  const errors = {
    adjusted: { count: 0, absoluteSum: 0, squaredSum: 0 },
    vif: { count: 0, absoluteSum: 0, squaredSum: 0 },
    fixed: { count: 0, absoluteSum: 0, squaredSum: 0 },
  }

  heldOperatorIds.forEach((heldOperatorId, index) => {
    const trainingRows: number[] = []
    const heldRows: number[] = []
    operatorIds.forEach((operatorId, row) => {
      const rows = operatorId === heldOperatorId ? heldRows : trainingRows
      rows.push(row)
    })
    const trainingDps = trainingRows.map(row => dpsValues[row])
    const fits: FoldFit[] = []
    // Both selection scores come solely from this fold's training operators.
    for (const { columns, key } of columnSets) {
      if (trainingRows.length <= columns.length + 1) continue
      try {
        const trainingValues = trainingRows.map(row => columns.map(column => predictorValues[row][column]))
        const { adjustedRSquared, varianceInflationFactors, intercept, coefficients } =
          fitMultipleLinearRegression(trainingValues, trainingDps)
        fits.push({ columns, key, adjustedRSquared, maxVif: Math.max(...varianceInflationFactors), intercept, coefficients })
      } catch {
        // A rank-deficient or otherwise unfit subset is ineligible in this fold.
      }
    }
    fits.sort((left, right) => right.adjustedRSquared - left.adjustedRSquared || compareByVif(left, right))
    const best = fits[0]
    const lowVif = best && fits
      .filter(fit => (best.adjustedRSquared - fit.adjustedRSquared) * 100 <= SKILL_DPS_CROSS_VALIDATION_VIF_TOLERANCE + 1e-10)
      .sort(compareByVif)[0]
    const fixed = fits.find(fit => fit.key === fixedKey)
    const choices = { adjusted: best, vif: lowVif, fixed }
    for (const method of ['adjusted', 'vif', 'fixed'] as const) {
      const fit = choices[method]
      if (!fit) continue
      accumulatePredictionErrors(errors[method], heldRows, fit, predictorValues, dpsValues)
    }
    onProgress?.({ completed: index + 1, total: heldOperatorIds.length })
  })

  const observationCount = dpsValues.length
  const methods = {
    adjusted: summarizePredictionErrors(errors.adjusted, observationCount),
    vif: summarizePredictionErrors(errors.vif, observationCount),
    fixed: summarizePredictionErrors(errors.fixed, observationCount),
  }
  return { observationCount, operatorCount: heldOperatorIds.length, methods }
}

function compareByVif(left: FoldFit, right: FoldFit): number {
  return left.maxVif - right.maxVif || right.adjustedRSquared - left.adjustedRSquared
    || left.columns.length - right.columns.length || left.key.localeCompare(right.key)
}

function accumulatePredictionErrors(
  result: PredictionErrors,
  heldRows: readonly number[],
  fit: FoldFit,
  predictorValues: SkillDpsCrossValidationInput['predictorValues'],
  dpsValues: SkillDpsCrossValidationInput['dpsValues'],
) {
  for (const row of heldRows) {
    const prediction = fit.intercept + fit.columns.reduce((sum, column, index) => (
      sum + predictorValues[row][column] * fit.coefficients[index]
    ), 0)
    const error = prediction - dpsValues[row]
    if (!Number.isFinite(error)) continue
    result.count += 1
    result.absoluteSum += Math.abs(error)
    result.squaredSum += error ** 2
  }
}

function summarizePredictionErrors(errors: PredictionErrors, observationCount: number): SkillDpsCrossValidationErrorMetrics | null {
  // Compare identical held-out observations across all selection methods.
  if (!observationCount || errors.count !== observationCount) return null
  const mae = errors.absoluteSum / observationCount
  const rmse = Math.sqrt(errors.squaredSum / observationCount)
  return Number.isFinite(mae) && Number.isFinite(rmse) ? { mae, rmse } : null
}
