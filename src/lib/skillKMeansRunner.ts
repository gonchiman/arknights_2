import type { SkillKMeansConfig, SkillKMeansDocument, SkillKMeansResult } from './skillKMeans.ts'
import type { SkillKMeansWorkerRequest, SkillKMeansWorkerResponse } from './skillKMeans.worker.ts'

export interface SkillKMeansRunState {
  requestId: number
  status: 'idle' | 'preparing' | 'running' | 'pausing' | 'paused' | 'complete' | 'error'
  result: SkillKMeansResult | null
  termsCount: number
  elapsedMs: number
  error: string | null
}
export const EMPTY_SKILL_KMEANS_RUN: SkillKMeansRunState = {
  requestId: 0, status: 'idle', result: null, termsCount: 0, elapsedMs: 0, error: null,
}

export interface SkillKMeansWorkerPort {
  onmessage: ((event: { data: SkillKMeansWorkerResponse }) => void) | null
  onerror: ((event: { preventDefault(): void }) => void) | null
  onmessageerror: (() => void) | null
  postMessage(message: SkillKMeansWorkerRequest): void
  terminate(): void
}

/** Request/worker identity guards also reject callbacks queued before termination. */
export class SkillKMeansRunner {
  private worker: SkillKMeansWorkerPort | null = null
  private generation = 0
  private state: SkillKMeansRunState = EMPTY_SKILL_KMEANS_RUN
  private disposed = false
  private readonly onChange: (state: SkillKMeansRunState) => void
  private readonly createWorker: () => SkillKMeansWorkerPort

  constructor(onChange: (state: SkillKMeansRunState) => void, createWorker: () => SkillKMeansWorkerPort = () => (
    new Worker(new URL('./skillKMeans.worker.ts', import.meta.url), { type: 'module' }) as unknown as SkillKMeansWorkerPort
  )) {
    this.onChange = onChange
    this.createWorker = createWorker
  }

  private publish(next: SkillKMeansRunState) {
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
    this.publish({ ...this.state, status: 'error', error })
  }

  start(documents: readonly SkillKMeansDocument[], config: SkillKMeansConfig, stepOnly = false) {
    if (this.disposed) return
    this.closeWorker()
    const requestId = ++this.generation
    this.publish({ ...EMPTY_SKILL_KMEANS_RUN, requestId, status: 'preparing' })
    if (this.disposed || requestId !== this.generation) return
    try {
      const worker = this.createWorker()
      if (this.disposed || requestId !== this.generation) { worker.terminate(); return }
      this.worker = worker
      const current = () => !this.disposed && this.worker === worker && requestId === this.generation
      worker.onmessage = ({ data }) => {
        if (!current() || data.requestId !== requestId) return
        if (data.type === 'error') { this.fail(data.error); return }
        if (data.complete) this.closeWorker()
        this.publish({ requestId, result: data.result, termsCount: data.termsCount, elapsedMs: data.elapsedMs,
          status: data.complete ? 'complete' : data.paused ? 'paused' : this.state.status === 'pausing' ? 'pausing' : 'running', error: null })
      }
      worker.onerror = event => {
        event.preventDefault()
        if (current()) this.fail('学習処理を実行できませんでした。もう一度学習してください。')
      }
      worker.onmessageerror = () => { if (current()) this.fail('学習結果を読み取れませんでした。もう一度学習してください。') }
      worker.postMessage({ type: 'start', requestId, documents: structuredClone([...documents]), config: structuredClone(config), stepOnly })
    } catch (cause) {
      if (!this.disposed && requestId === this.generation) {
        this.fail(cause instanceof Error ? cause.message : '学習処理を開始できませんでした。')
      }
    }
  }

  private send(type: 'step' | 'resume' | 'pause') {
    if (this.disposed || !this.worker) return
    if (type === 'pause' ? !['preparing', 'running'].includes(this.state.status) : this.state.status !== 'paused') return
    const worker = this.worker
    const requestId = this.generation
    const current = () => !this.disposed && this.worker === worker && requestId === this.generation
    this.publish({ ...this.state, status: type === 'pause' ? 'pausing' : 'running' })
    if (!current()) return
    try { worker.postMessage({ type, requestId }) }
    catch { if (current()) this.fail('学習操作を送信できませんでした。もう一度学習してください。') }
  }

  pause() { this.send('pause') }
  step() { this.send('step') }
  resume() { this.send('resume') }
  dispose() { this.disposed = true; this.generation += 1; this.closeWorker() }
}
