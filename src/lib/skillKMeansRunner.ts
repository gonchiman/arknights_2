import type { SkillKMeansConfig, SkillKMeansDocument, SkillKMeansResult } from './skillKMeans.ts'
import type { SkillKMeansWorkerRequest, SkillKMeansWorkerResponse } from './skillKMeans.worker.ts'

export interface SkillKMeansRunState {
  requestId: number
  status: 'idle' | 'preparing' | 'running' | 'pausing' | 'paused' | 'complete' | 'error'
  results: [SkillKMeansResult, SkillKMeansResult] | null
  termsCount: number
  elapsedMs: number
  error: string | null
}
export const EMPTY_SKILL_KMEANS_RUN: SkillKMeansRunState = {
  requestId: 0, status: 'idle', results: null, termsCount: 0, elapsedMs: 0, error: null,
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
    this.worker?.terminate()
    this.worker = null
  }

  private fail(error: string) {
    this.closeWorker()
    this.publish({ ...this.state, status: 'error', error })
  }

  start(documents: readonly SkillKMeansDocument[], configs: readonly [SkillKMeansConfig, SkillKMeansConfig], stepOnly = false) {
    if (this.disposed) return
    this.closeWorker()
    const requestId = ++this.generation
    this.publish({ ...EMPTY_SKILL_KMEANS_RUN, requestId, status: 'preparing' })
    try {
      const worker = this.createWorker()
      this.worker = worker
      const current = () => !this.disposed && this.worker === worker && requestId === this.generation
      worker.onmessage = ({ data }) => {
        if (!current() || data.requestId !== requestId) return
        if (data.type === 'error') { this.fail(data.error); return }
        this.publish({ requestId, results: data.results, termsCount: data.termsCount, elapsedMs: data.elapsedMs,
          status: data.complete ? 'complete' : data.paused ? 'paused' : this.state.status === 'pausing' ? 'pausing' : 'running', error: null })
      }
      worker.onerror = event => {
        event.preventDefault()
        if (current()) this.fail('学習処理を実行できませんでした。もう一度学習してください。')
      }
      worker.onmessageerror = () => { if (current()) this.fail('学習結果を読み取れませんでした。もう一度学習してください。') }
      worker.postMessage({ type: 'start', requestId, documents: structuredClone([...documents]), configs: structuredClone([...configs]) as [SkillKMeansConfig, SkillKMeansConfig], stepOnly })
    } catch (cause) {
      this.fail(cause instanceof Error ? cause.message : '学習処理を開始できませんでした。')
    }
  }

  private send(type: 'step' | 'resume' | 'pause') {
    if (this.disposed || !this.worker) return
    if (type === 'pause' ? !['preparing', 'running'].includes(this.state.status) : this.state.status !== 'paused') return
    this.publish({ ...this.state, status: type === 'pause' ? 'pausing' : 'running' })
    try { this.worker.postMessage({ type, requestId: this.generation }) }
    catch { this.fail('学習操作を送信できませんでした。もう一度学習してください。') }
  }

  pause() { this.send('pause') }
  step() { this.send('step') }
  resume() { this.send('resume') }
  dispose() { this.disposed = true; this.generation += 1; this.closeWorker() }
}
