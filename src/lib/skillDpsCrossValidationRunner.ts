import type {
  SkillDpsCrossValidationInput, SkillDpsCrossValidationProgress, SkillDpsCrossValidationResult,
} from './skillDpsCrossValidation.ts'
import type { SkillDpsCrossValidationWorkerResponse } from './skillDpsCrossValidation.worker.ts'
import type { SkillDpsAnalysisDataset, SkillDpsAnalysisMetric } from './skillDpsAnalysis.ts'
import { prepareRegressionCohort, type SkillDpsRegressionPredictor } from './skillDpsMultipleRegression.ts'

export type SkillDpsCrossValidationRunState =
  | { status: 'idle' | 'stopped'; progress: null; result: null; error: null }
  | { status: 'running'; progress: SkillDpsCrossValidationProgress; result: null; error: null }
  | { status: 'complete'; progress: null; result: SkillDpsCrossValidationResult; error: null }
  | { status: 'error'; progress: null; result: null; error: string }

export const EMPTY_SKILL_DPS_CROSS_VALIDATION_RUN: SkillDpsCrossValidationRunState =
  { status: 'idle', progress: null, result: null, error: null }

export function prepareSkillDpsCrossValidation(
  dataset: SkillDpsAnalysisDataset,
  candidates: readonly SkillDpsRegressionPredictor[],
  metric: SkillDpsAnalysisMetric,
): { input: SkillDpsCrossValidationInput; error: null } | { input: null; error: string } {
  const cohort = prepareRegressionCohort(dataset, candidates, metric)
  if (cohort.error !== null) return { input: null, error: cohort.error }
  const { predictorValues, dpsValues, operatorIds } = cohort
  if (new Set(operatorIds).size < 2) {
    return { input: null, error: '交差検証には2人以上のオペレーターが必要です。' }
  }
  return { input: { candidates, predictorValues, dpsValues, operatorIds }, error: null }
}

export class SkillDpsCrossValidationRunner {
  private worker: Worker | null = null
  private disposed = false
  private readonly onChange: (state: SkillDpsCrossValidationRunState) => void

  constructor(onChange: (state: SkillDpsCrossValidationRunState) => void) {
    this.onChange = onChange
  }

  start(
    dataset: SkillDpsAnalysisDataset,
    candidates: readonly SkillDpsRegressionPredictor[],
    metric: SkillDpsAnalysisMetric,
  ) {
    if (this.disposed) return
    this.closeWorker()
    const { input, error } = prepareSkillDpsCrossValidation(dataset, candidates, metric)
    if (error !== null) {
      this.onChange({ status: 'error', progress: null, result: null, error })
      return
    }

    try {
      const worker = new Worker(new URL('./skillDpsCrossValidation.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      worker.onmessage = ({ data }: MessageEvent<SkillDpsCrossValidationWorkerResponse>) => {
        // Cancellation and a new run both close the old worker. Ignore its queued updates.
        if (this.worker !== worker) return
        if (data.type === 'progress') {
          this.onChange({ status: 'running', progress: data.progress, result: null, error: null })
        } else if (data.type === 'complete') {
          this.closeWorker()
          this.onChange({ status: 'complete', progress: null, result: data.result, error: null })
        } else {
          this.fail(data.error)
        }
      }
      worker.onerror = event => {
        if (this.worker !== worker) return
        event.preventDefault()
        this.fail('交差検証を実行できませんでした。')
      }
      worker.onmessageerror = () => {
        if (this.worker === worker) this.fail('交差検証の結果を読み取れませんでした。')
      }

      worker.postMessage(input)
      const progress = { completed: 0, total: new Set(input.operatorIds).size }
      this.onChange({ status: 'running', progress, result: null, error: null })
    } catch {
      this.fail('交差検証を開始できませんでした。')
    }
  }

  stop() {
    if (!this.worker) return
    this.closeWorker()
    this.onChange({ status: 'stopped', progress: null, result: null, error: null })
  }

  dispose() {
    this.disposed = true
    this.closeWorker()
  }

  private fail(error: string) {
    this.closeWorker()
    this.onChange({ status: 'error', progress: null, result: null, error })
  }

  private closeWorker() {
    const worker = this.worker
    this.worker = null
    worker?.terminate()
  }
}
