import { fitMultipleLinearRegression, type MultipleLinearRegressionResult } from './multipleLinearRegression.ts'
import {
  getSkillDpsAnalysisAxisValue, SKILL_DPS_ANALYSIS_AXES,
  type SkillDpsAnalysisAxis, type SkillDpsAnalysisDataset, type SkillDpsAnalysisMetric,
} from './skillDpsAnalysis.ts'

export type SkillDpsRegressionPredictor = Exclude<SkillDpsAnalysisAxis, 'maxTargets'>

type PredictorOption = Exclude<typeof SKILL_DPS_ANALYSIS_AXES[number], readonly ['maxTargets', string]>

export const SKILL_DPS_REGRESSION_PREDICTORS: readonly PredictorOption[] = SKILL_DPS_ANALYSIS_AXES.filter(
  (option): option is PredictorOption => option[0] !== 'maxTargets',
)

export const DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS = ['duration', 'spCost'] as const satisfies readonly SkillDpsRegressionPredictor[]

export interface SkillDpsMultipleRegressionResult {
  fit: MultipleLinearRegressionResult | null
  observationCount: number
  error: string | null
}

export interface SkillDpsCombinationModel {
  predictors: readonly SkillDpsRegressionPredictor[]
  adjustedRSquared: number
  maxVif: number
  /** Uses the same complete rows and order as predictors. */
  varianceInflationFactors: readonly number[]
}

export interface SkillDpsCombinationEvaluation {
  observationCount: number
  models: readonly SkillDpsCombinationModel[]
  failedCount: number
  error: string | null
}

export function analyzeSkillDpsMultipleRegression(
  dataset: SkillDpsAnalysisDataset,
  predictors: readonly SkillDpsRegressionPredictor[],
  metric: SkillDpsAnalysisMetric,
): SkillDpsMultipleRegressionResult {
  const cohort = prepareRegressionCohort(dataset, predictors, metric)
  if (cohort.error !== null) return { fit: null, observationCount: 0, error: cohort.error }
  const { predictorValues, dpsValues, labels } = cohort
  const observationCount = dpsValues.length

  try {
    const fit = fitMultipleLinearRegression(predictorValues, dpsValues, labels)
    return { fit, observationCount, error: null }
  } catch (error) {
    return { fit: null, observationCount, error: error instanceof Error ? error.message : '重回帰を計算できません。' }
  }
}

export function evaluateSkillDpsPredictorCombinations(
  dataset: SkillDpsAnalysisDataset,
  candidates: readonly SkillDpsRegressionPredictor[],
  metric: SkillDpsAnalysisMetric,
): SkillDpsCombinationEvaluation {
  const cohort = prepareRegressionCohort(dataset, candidates, metric)
  if (cohort.error !== null) return { models: [], observationCount: 0, failedCount: 0, error: cohort.error }
  const { predictorValues, dpsValues, labels } = cohort
  const models: SkillDpsCombinationModel[] = []
  let failedCount = 0
  let firstError: string | null = null

  // There are at most eight supported candidates. Every subset projects
  // columns from the same complete rows without changing which skills enter.
  for (let mask = 1; mask < 2 ** candidates.length; mask++) {
    const columns = candidates.flatMap((_, index) => mask & (1 << index) ? [index] : [])
    if (columns.length < 2) continue

    try {
      const fit = fitMultipleLinearRegression(
        predictorValues.map(row => columns.map(index => row[index])),
        dpsValues,
        columns.map(index => labels[index]),
      )
      models.push({
        predictors: columns.map(index => candidates[index]),
        adjustedRSquared: fit.adjustedRSquared,
        maxVif: Math.max(...fit.varianceInflationFactors),
        varianceInflationFactors: fit.varianceInflationFactors,
      })
    } catch (error) {
      failedCount++
      firstError ??= error instanceof Error ? error.message : '組み合わせを比較できません。'
    }
  }

  return { models, observationCount: dpsValues.length, failedCount, error: models.length ? null : firstError }
}

function prepareRegressionCohort(
  dataset: SkillDpsAnalysisDataset,
  predictors: readonly SkillDpsRegressionPredictor[],
  metric: SkillDpsAnalysisMetric,
): { error: string } | { error: null; labels: string[]; predictorValues: number[][]; dpsValues: number[] } {
  if (predictors.length < 2 || new Set(predictors).size !== predictors.length) {
    return { error: '異なる説明変数を2つ以上選んでください。' }
  }
  const labels = predictors.map(predictor => SKILL_DPS_REGRESSION_PREDICTORS.find(([key]) => key === predictor)?.[1])
  if (!labels.every(label => label !== undefined)) {
    return { error: '重回帰に対応する数値の説明変数を選んでください。' }
  }

  const predictorValues: number[][] = []
  const dpsValues: number[] = []
  for (const observation of dataset.observations) {
    const dps = metric === 'direct' ? observation.directDps : observation.combinedDps
    if (dps === null || !Number.isFinite(dps)) continue
    const values = predictors.map(predictor => getSkillDpsAnalysisAxisValue(observation, predictor))
    if (!values.every((value): value is number => typeof value === 'number')) continue
    predictorValues.push(values)
    dpsValues.push(dps)
  }
  if (!dpsValues.length) {
    return { error: 'DPSと選んだ説明変数がすべて揃うスキルがありません。' }
  }

  return { predictorValues, dpsValues, labels, error: null }
}
