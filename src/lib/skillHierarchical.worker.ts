import { createSkillClusteringFeatures, type SkillClusteringDocument } from './skillClusteringData.ts'
import {
  buildSkillHierarchy,
  evaluateSkillHierarchyCut,
  type HierarchicalLinkage,
  type SkillHierarchyPartition,
  type SkillHierarchyTree,
} from './skillHierarchical.ts'

export interface SkillHierarchicalProgress {
  phase: 'features' | 'distances' | 'merging' | 'evaluating'
  completed: number
  total: number
}

export type SkillHierarchicalWorkerRequest =
  | { type: 'start'; requestId: number; documents: SkillClusteringDocument[]; linkage: HierarchicalLinkage }
  | { type: 'cut'; requestId: number; cutId: number; threshold: number }

export type SkillHierarchicalWorkerResponse =
  | { type: 'progress'; requestId: number; progress: SkillHierarchicalProgress; elapsedMs: number }
  | { type: 'result'; requestId: number; tree: SkillHierarchyTree; partition: SkillHierarchyPartition; elapsedMs: number }
  | { type: 'partition'; requestId: number; cutId: number; partition: SkillHierarchyPartition; elapsedMs: number }
  | { type: 'error'; requestId: number; cutId?: number; error: string }

let activeRequestId: number | null = null
let tree: SkillHierarchyTree | null = null
let elapsedMs = 0

self.onmessage = (event: MessageEvent<SkillHierarchicalWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'start' && (request.requestId !== activeRequestId || !tree)) return
  const started = performance.now()
  try {
    if (request.type === 'start') {
      activeRequestId = request.requestId
      tree = null
      elapsedMs = 0
      const reportProgress = (progress: SkillHierarchicalProgress) => {
        self.postMessage({ type: 'progress', requestId: request.requestId, progress,
          elapsedMs: performance.now() - started } satisfies SkillHierarchicalWorkerResponse)
      }
      reportProgress({ phase: 'features', completed: 0, total: request.documents.length })
      const features = createSkillClusteringFeatures(request.documents)
      reportProgress({ phase: 'features', completed: request.documents.length, total: request.documents.length })
      tree = buildSkillHierarchy(features, request.linkage, reportProgress)
      const partition = evaluateSkillHierarchyCut(tree, tree.recommendedThreshold)
      elapsedMs = performance.now() - started
      // Keep the matrix here for later cuts; structured cloning sends it only with this first result.
      self.postMessage({ type: 'result', requestId: request.requestId, tree, partition,
        elapsedMs } satisfies SkillHierarchicalWorkerResponse)
    } else if (tree) {
      const partition = evaluateSkillHierarchyCut(tree, request.threshold)
      elapsedMs += performance.now() - started
      self.postMessage({ type: 'partition', requestId: request.requestId, cutId: request.cutId, partition,
        elapsedMs } satisfies SkillHierarchicalWorkerResponse)
    }
  } catch (cause) {
    self.postMessage({ type: 'error', requestId: request.requestId,
      ...(request.type === 'cut' ? { cutId: request.cutId } : {}),
      error: cause instanceof Error ? cause.message : '階層クラスタリングに失敗しました。条件を確認してください。',
    } satisfies SkillHierarchicalWorkerResponse)
  }
}
