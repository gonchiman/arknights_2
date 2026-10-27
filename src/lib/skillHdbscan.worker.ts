import { createSkillClusteringFeatures, type SkillClusteringDocument } from './skillClusteringFeatures.ts'
import { runSkillHdbscan, type SkillHdbscanExperimentConfig, type SkillHdbscanExperimentResult, type SkillHdbscanStage } from './skillHdbscan.ts'

export interface SkillHdbscanWorkerRequest {
  type: 'start'
  requestId: number
  documents: SkillClusteringDocument[]
  config: SkillHdbscanExperimentConfig
}

export type SkillHdbscanWorkerResponse =
  | { type: 'progress'; requestId: number; stage: SkillHdbscanStage; termsCount: number; elapsedMs: number }
  | { type: 'result'; requestId: number; result: SkillHdbscanExperimentResult; termsCount: number; elapsedMs: number }
  | { type: 'error'; requestId: number; error: string }

// Each run owns its worker. Cancellation terminates it, including synchronous computation.
self.onmessage = (event: MessageEvent<SkillHdbscanWorkerRequest>) => {
  const { requestId, documents, config } = event.data
  const started = performance.now()
  try {
    const experimentConfig = structuredClone(config)
    if (experimentConfig.stopWordProfile !== 'basic' && experimentConfig.stopWordProfile !== 'extended') {
      throw new RangeError('除外語リストは基本または拡張を指定してください。')
    }
    const features = createSkillClusteringFeatures(documents, experimentConfig.stopWordProfile)
    const termsCount = features.terms.length
    const clustering = runSkillHdbscan(features, experimentConfig, stage => {
      self.postMessage({ type: 'progress', requestId, stage, termsCount,
        elapsedMs: performance.now() - started } satisfies SkillHdbscanWorkerResponse)
    })
    const result: SkillHdbscanExperimentResult = { ...clustering, config: experimentConfig }
    self.postMessage({ type: 'result', requestId, result, termsCount,
      elapsedMs: performance.now() - started } satisfies SkillHdbscanWorkerResponse)
  } catch (cause) {
    self.postMessage({ type: 'error', requestId,
      error: cause instanceof Error ? cause.message : '分類に失敗しました。条件を確認してください。' } satisfies SkillHdbscanWorkerResponse)
  }
}
