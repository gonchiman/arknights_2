import type { SkillClusteringDocument } from './skillClusteringData.ts'
import type { HierarchicalLinkage, SkillHierarchyPartition, SkillHierarchyTree } from './skillHierarchical.ts'
import type {
  SkillHierarchicalProgress,
  SkillHierarchicalWorkerRequest,
  SkillHierarchicalWorkerResponse,
} from './skillHierarchical.worker.ts'

export interface SkillHierarchicalRunState {
  requestId: number
  status: 'idle' | 'preparing' | 'running' | 'complete' | 'cancelled' | 'error'
  tree: SkillHierarchyTree | null
  partition: SkillHierarchyPartition | null
  cutPending: boolean
  progress: SkillHierarchicalProgress | null
  elapsedMs: number
  error: string | null
}

export const EMPTY_SKILL_HIERARCHICAL_RUN: SkillHierarchicalRunState = {
  requestId: 0, status: 'idle', tree: null, partition: null, cutPending: false, progress: null, elapsedMs: 0, error: null,
}

export interface SkillHierarchicalWorkerPort {
  onmessage: ((event: { data: SkillHierarchicalWorkerResponse }) => void) | null
  onerror: ((event: { preventDefault(): void }) => void) | null
  onmessageerror: (() => void) | null
  postMessage(message: SkillHierarchicalWorkerRequest): void
  terminate(): void
}

/** Termination cancels synchronous worker computation; identities also reject already queued callbacks. */
export class SkillHierarchicalRunner {
  private worker: SkillHierarchicalWorkerPort | null = null
  private generation = 0
  private cutId = 0
  private state: SkillHierarchicalRunState = EMPTY_SKILL_HIERARCHICAL_RUN
  private disposed = false
  private readonly onChange: (state: SkillHierarchicalRunState) => void
  private readonly createWorker: () => SkillHierarchicalWorkerPort

  constructor(onChange: (state: SkillHierarchicalRunState) => void, createWorker: () => SkillHierarchicalWorkerPort = () => (
    new Worker(new URL('./skillHierarchical.worker.ts', import.meta.url), { type: 'module' }) as unknown as SkillHierarchicalWorkerPort
  )) {
    this.onChange = onChange
    this.createWorker = createWorker
  }

  private publish(next: SkillHierarchicalRunState) {
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
    this.publish({ ...this.state, status: 'error', cutPending: false, progress: null, error })
  }

  start(documents: readonly SkillClusteringDocument[], linkage: HierarchicalLinkage) {
    if (this.disposed) return
    this.closeWorker()
    const requestId = ++this.generation
    this.cutId = 0
    this.publish({ ...EMPTY_SKILL_HIERARCHICAL_RUN, requestId, status: 'preparing' })
    if (this.disposed || requestId !== this.generation) return
    try {
      const worker = this.createWorker()
      if (this.disposed || requestId !== this.generation) { worker.terminate(); return }
      this.worker = worker
      const current = () => !this.disposed && this.worker === worker && requestId === this.generation
      worker.onmessage = ({ data }) => {
        if (!current() || data.requestId !== requestId) return
        if (data.type === 'error') {
          if (data.cutId !== undefined && (data.cutId !== this.cutId || !this.state.cutPending)) return
          this.fail(data.error)
        } else if (data.type === 'progress') {
          if (this.state.status !== 'preparing' && this.state.status !== 'running') return
          this.publish({ ...this.state, status: 'running', progress: data.progress, elapsedMs: data.elapsedMs })
        } else if (data.type === 'result') {
          if (this.state.tree) return
          this.publish({ ...this.state, status: 'complete', tree: data.tree, partition: data.partition,
            cutPending: false, progress: null, elapsedMs: data.elapsedMs, error: null })
        } else if (data.cutId === this.cutId && this.state.cutPending) {
          this.publish({ ...this.state, partition: data.partition, cutPending: false, elapsedMs: data.elapsedMs, error: null })
        }
      }
      worker.onerror = event => {
        event.preventDefault()
        if (current()) this.fail('階層クラスタリングを実行できませんでした。もう一度実行してください。')
      }
      worker.onmessageerror = () => {
        if (current()) this.fail('階層クラスタリングの結果を読み取れませんでした。もう一度実行してください。')
      }
      worker.postMessage({ type: 'start', requestId, documents: structuredClone([...documents]), linkage })
    } catch (cause) {
      if (!this.disposed && requestId === this.generation) {
        this.fail(cause instanceof Error ? cause.message : '階層クラスタリングを開始できませんでした。')
      }
    }
  }

  setThreshold(threshold: number) {
    const worker = this.worker
    if (this.disposed || !worker || this.state.status !== 'complete' || !this.state.tree || !Number.isFinite(threshold)) return
    const requestId = this.generation
    const cutId = ++this.cutId
    this.publish({ ...this.state, cutPending: true, error: null })
    if (this.disposed || this.worker !== worker || requestId !== this.generation || cutId !== this.cutId) return
    try { worker.postMessage({ type: 'cut', requestId, cutId, threshold }) }
    catch {
      if (!this.disposed && this.worker === worker && requestId === this.generation && cutId === this.cutId) {
        this.fail('しきい値の変更を送信できませんでした。もう一度実行してください。')
      }
    }
  }

  cancel() {
    if (this.disposed || !this.worker) return
    this.generation += 1
    this.closeWorker()
    this.publish({ ...this.state, status: 'cancelled', cutPending: false, progress: null })
  }

  dispose() {
    this.disposed = true
    this.generation += 1
    this.closeWorker()
  }
}
