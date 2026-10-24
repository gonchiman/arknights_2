import {
  createSkillKMeansEngine,
  createSkillKMeansFeatures,
  type SkillKMeansConfig,
  type SkillKMeansDocument,
  type SkillKMeansEngine,
  type SkillKMeansResult,
} from './skillKMeans.ts'

export type SkillKMeansWorkerRequest =
  | { type: 'start'; requestId: number; documents: SkillKMeansDocument[]; config: SkillKMeansConfig; stepOnly: boolean }
  | { type: 'step' | 'resume' | 'pause'; requestId: number }

export type SkillKMeansWorkerResponse =
  | { type: 'result'; requestId: number; termsCount: number; result: SkillKMeansResult; complete: boolean; paused: boolean; elapsedMs: number }
  | { type: 'error'; requestId: number; error: string }

let activeRequestId: number | null = null
let engine: SkillKMeansEngine | null = null
let termsCount = 0
let elapsedMs = 0
let paused = true
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined

function cancelScheduledStep(): void {
  generation += 1
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function publish(): boolean {
  if (activeRequestId === null || !engine) return true
  const result = engine.snapshot()
  const complete = result.converged
  if (complete) paused = false
  self.postMessage({ type: 'result', requestId: activeRequestId, termsCount, result, complete, paused, elapsedMs } satisfies SkillKMeansWorkerResponse)
  return complete
}

function fail(cause: unknown): void {
  cancelScheduledStep()
  paused = true
  if (activeRequestId === null) return
  self.postMessage({ type: 'error', requestId: activeRequestId,
    error: cause instanceof Error ? cause.message : '学習に失敗しました。条件を確認してください。' } satisfies SkillKMeansWorkerResponse)
}

function stepOnce(): boolean {
  if (!engine) return true
  const started = performance.now()
  engine.step()
  elapsedMs += performance.now() - started
  return publish()
}

function scheduleNextStep(): void {
  const currentGeneration = generation
  timer = setTimeout(() => {
    timer = undefined
    if (currentGeneration !== generation || paused || !engine) return
    try {
      if (!stepOnce()) scheduleNextStep()
    } catch (cause) {
      fail(cause)
    }
  }, 0)
}

self.onmessage = (event: MessageEvent<SkillKMeansWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'start' && request.requestId !== activeRequestId) return
  try {
    if (request.type === 'start') {
      cancelScheduledStep()
      activeRequestId = request.requestId
      engine = null
      elapsedMs = 0
      paused = request.stepOnly
      const started = performance.now()
      const features = createSkillKMeansFeatures(request.documents)
      termsCount = features.terms.length
      engine = createSkillKMeansEngine(features, request.config)
      elapsedMs = performance.now() - started
      publish()
      if (request.stepOnly) stepOnce()
      else scheduleNextStep()
    } else if (request.type === 'pause') {
      cancelScheduledStep()
      paused = true
      publish()
    } else if (request.type === 'step') {
      cancelScheduledStep()
      paused = true
      stepOnce()
    } else if (request.type === 'resume') {
      cancelScheduledStep()
      paused = false
      if (!publish()) scheduleNextStep()
    }
  } catch (cause) {
    fail(cause)
  }
}
