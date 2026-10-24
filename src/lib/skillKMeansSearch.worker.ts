import { createSkillKMeansFeatures, type SkillKMeansDocument } from './skillKMeans.ts'
import {
  runSkillKMeansSearch,
  type SkillKMeansSearchConfig,
  type SkillKMeansSearchProgress,
  type SkillKMeansSearchResult,
} from './skillKMeansSearch.ts'

export type SkillKMeansSearchWorkerRequest = {
  type: 'start'
  requestId: number
  documents: SkillKMeansDocument[]
  config: SkillKMeansSearchConfig
}

export type SkillKMeansSearchWorkerResponse =
  | { type: 'progress'; requestId: number; progress: SkillKMeansSearchProgress; elapsedMs: number }
  | { type: 'result'; requestId: number; result: SkillKMeansSearchResult; elapsedMs: number }
  | { type: 'error'; requestId: number; error: string }

self.onmessage = (event: MessageEvent<SkillKMeansSearchWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'start') return
  const started = performance.now()
  const reportProgress = (progress: SkillKMeansSearchProgress) => {
    self.postMessage({ type: 'progress', requestId: request.requestId, progress,
      elapsedMs: performance.now() - started } satisfies SkillKMeansSearchWorkerResponse)
  }
  try {
    reportProgress({ phase: 'preparing', completed: 0, total: request.documents.length, k: null })
    const features = createSkillKMeansFeatures(request.documents)
    reportProgress({ phase: 'preparing', completed: request.documents.length, total: request.documents.length, k: null })
    const result = runSkillKMeansSearch(features, request.config, reportProgress)
    self.postMessage({ type: 'result', requestId: request.requestId, result,
      elapsedMs: performance.now() - started } satisfies SkillKMeansSearchWorkerResponse)
  } catch (cause) {
    self.postMessage({ type: 'error', requestId: request.requestId,
      error: cause instanceof Error ? cause.message : 'K探索に失敗しました。条件を確認してください。',
    } satisfies SkillKMeansSearchWorkerResponse)
  }
}
