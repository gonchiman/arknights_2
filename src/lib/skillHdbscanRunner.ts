import type { SkillClusteringDocument } from './skillClusteringFeatures.ts'
import type { SkillHdbscanConfig, SkillHdbscanResult, SkillHdbscanStage } from './skillHdbscan.ts'
import type { SkillHdbscanWorkerRequest, SkillHdbscanWorkerResponse } from './skillHdbscan.worker.ts'

export interface SkillHdbscanRunState {
  requestId: number
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
  stage: 'preparing' | SkillHdbscanStage | null
  result: SkillHdbscanResult | null
  termsCount: number
  elapsedMs: number
  error: string | null
}

export const EMPTY_SKILL_HDBSCAN_RUN: SkillHdbscanRunState = {
  requestId: 0, status: 'idle', stage: null, result: null, termsCount: 0, elapsedMs: 0, error: null,
}

export interface SkillHdbscanWorkerPort {
  onmessage: ((event: { data: SkillHdbscanWorkerResponse }) => void) | null
  onerror: ((event: { preventDefault(): void }) => void) | null
  onmessageerror: (() => void) | null
  postMessage(message: SkillHdbscanWorkerRequest): void
  terminate(): void
}

/** Worker identity and generation also reject callbacks queued before termination. */
export class SkillHdbscanRunner {
  private worker: SkillHdbscanWorkerPort | null = null
  private generation = 0
  private state: SkillHdbscanRunState = EMPTY_SKILL_HDBSCAN_RUN
  private disposed = false
  private readonly onChange: (state: SkillHdbscanRunState) => void
  private readonly createWorker: () => SkillHdbscanWorkerPort

  constructor(onChange: (state: SkillHdbscanRunState) => void, createWorker: () => SkillHdbscanWorkerPort = () => (
    new Worker(new URL('./skillHdbscan.worker.ts', import.meta.url), { type: 'module' }) as unknown as SkillHdbscanWorkerPort
  )) {
    this.onChange = onChange
    this.createWorker = createWorker
  }

  private publish(next: SkillHdbscanRunState) {
    this.state = next
    if (!this.disposed) this.onChange(next)
  }

  private closeWorker() {
    const worker = this.worker
    this.worker = null
    if (!worker) return
    worker.onmessage = null
    worker.onerror = null
    worker.onmessageerror = null
    worker.terminate()
  }

  private fail(error: string) {
    this.closeWorker()
    this.publish({ ...this.state, status: 'error', stage: null, error })
  }

  start(documents: readonly SkillClusteringDocument[], config: SkillHdbscanConfig) {
    if (this.disposed) return
    this.closeWorker()
    const requestId = ++this.generation
    this.publish({ ...EMPTY_SKILL_HDBSCAN_RUN, requestId, status: 'running', stage: 'preparing' })
    if (this.disposed || requestId !== this.generation) return
    try {
      const request: SkillHdbscanWorkerRequest = {
        type: 'start', requestId, documents: structuredClone([...documents]), config: structuredClone(config),
      }
      const worker = this.createWorker()
      this.worker = worker
      const current = () => !this.disposed && this.worker === worker && requestId === this.generation
      worker.onmessage = ({ data }) => {
        if (!current() || data.requestId !== requestId) return
        if (data.type === 'error') { this.fail(data.error); return }
        if (data.type === 'progress') {
          this.publish({ ...this.state, stage: data.stage, termsCount: data.termsCount, elapsedMs: data.elapsedMs })
          return
        }
        this.closeWorker()
        this.publish({ requestId, status: 'complete', stage: null, result: data.result,
          termsCount: data.termsCount, elapsedMs: data.elapsedMs, error: null })
      }
      worker.onerror = event => {
        event.preventDefault()
        if (current()) this.fail('分類処理を実行できませんでした。もう一度実行してください。')
      }
      worker.onmessageerror = () => {
        if (current()) this.fail('分類結果を読み取れませんでした。もう一度実行してください。')
      }
      worker.postMessage(request)
    } catch (cause) {
      if (!this.disposed && requestId === this.generation) {
        this.fail(cause instanceof Error ? cause.message : '分類処理を開始できませんでした。')
      }
    }
  }

  cancel() {
    if (this.disposed || this.state.status !== 'running') return
    this.generation += 1
    this.closeWorker()
    this.publish({ ...this.state, status: 'cancelled', stage: null })
  }

  dispose() {
    this.disposed = true
    this.generation += 1
    this.closeWorker()
  }
}
