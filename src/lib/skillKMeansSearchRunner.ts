import type { SkillKMeansDocument } from './skillKMeans.ts'
import type { SkillKMeansSearchConfig, SkillKMeansSearchProgress, SkillKMeansSearchResult } from './skillKMeansSearch.ts'
import type { SkillKMeansSearchWorkerRequest, SkillKMeansSearchWorkerResponse } from './skillKMeansSearch.worker.ts'

export interface SkillKMeansSearchRunState {
  requestId: number
  status: 'idle' | 'preparing' | 'running' | 'complete' | 'stopped' | 'error'
  progress: SkillKMeansSearchProgress | null
  result: SkillKMeansSearchResult | null
  elapsedMs: number
  error: string | null
}

export const EMPTY_SKILL_KMEANS_SEARCH_RUN: SkillKMeansSearchRunState = {
  requestId: 0, status: 'idle', progress: null, result: null, elapsedMs: 0, error: null,
}

export interface SkillKMeansSearchWorkerPort {
  onmessage: ((event: { data: SkillKMeansSearchWorkerResponse }) => void) | null
  onerror: ((event: { preventDefault(): void }) => void) | null
  onmessageerror: (() => void) | null
  postMessage(message: SkillKMeansSearchWorkerRequest): void
  terminate(): void
}

/** Termination stops synchronous search; identities reject messages already queued before termination. */
export class SkillKMeansSearchRunner {
  private worker: SkillKMeansSearchWorkerPort | null = null
  private generation = 0
  private state: SkillKMeansSearchRunState = EMPTY_SKILL_KMEANS_SEARCH_RUN
  private disposed = false
  private readonly onChange: (state: SkillKMeansSearchRunState) => void
  private readonly createWorker: () => SkillKMeansSearchWorkerPort

  constructor(onChange: (state: SkillKMeansSearchRunState) => void, createWorker: () => SkillKMeansSearchWorkerPort = () => (
    new Worker(new URL('./skillKMeansSearch.worker.ts', import.meta.url), { type: 'module' }) as unknown as SkillKMeansSearchWorkerPort
  )) {
    this.onChange = onChange
    this.createWorker = createWorker
  }

  private publish(next: SkillKMeansSearchRunState) {
    this.state = next
    if (!this.disposed) this.onChange(next)
  }

  private closeWorker() {
    const worker = this.worker
    this.worker = null
    worker?.terminate()
  }

  private fail(error: string) {
    this.closeWorker()
    this.publish({ ...this.state, status: 'error', progress: null, result: null, error })
  }

  start(documents: readonly SkillKMeansDocument[], config: SkillKMeansSearchConfig) {
    if (this.disposed) return
    this.closeWorker()
    const requestId = ++this.generation
    this.publish({ ...EMPTY_SKILL_KMEANS_SEARCH_RUN, requestId, status: 'preparing' })
    if (this.disposed || requestId !== this.generation) return
    try {
      const worker = this.createWorker()
      if (this.disposed || requestId !== this.generation) { worker.terminate(); return }
      this.worker = worker
      const current = () => !this.disposed && this.worker === worker && requestId === this.generation
      worker.onmessage = ({ data }) => {
        if (!current() || data.requestId !== requestId) return
        if (data.type === 'error') {
          this.fail(data.error)
        } else if (data.type === 'progress') {
          this.publish({ ...this.state, status: data.progress.phase === 'preparing' ? 'preparing' : 'running',
            progress: data.progress, elapsedMs: data.elapsedMs })
        } else {
          this.closeWorker()
          this.publish({ ...this.state, status: 'complete', progress: null,
            result: data.result, elapsedMs: data.elapsedMs, error: null })
        }
      }
      worker.onerror = event => {
        event.preventDefault()
        if (current()) this.fail('K探索を実行できませんでした。もう一度実行してください。')
      }
      worker.onmessageerror = () => {
        if (current()) this.fail('K探索の結果を読み取れませんでした。もう一度実行してください。')
      }
      worker.postMessage({ type: 'start', requestId,
        documents: structuredClone([...documents]), config: structuredClone(config) })
    } catch (cause) {
      if (!this.disposed && requestId === this.generation) {
        this.fail(cause instanceof Error ? cause.message : 'K探索を開始できませんでした。')
      }
    }
  }

  stop() {
    if (this.disposed || (this.state.status !== 'preparing' && this.state.status !== 'running')) return
    this.generation += 1
    this.closeWorker()
    this.publish({ ...this.state, status: 'stopped', progress: null, result: null })
  }

  dispose() {
    this.disposed = true
    this.generation += 1
    this.closeWorker()
  }
}
