import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_SKILL_HDBSCAN_RUN, SkillHdbscanRunner, type SkillHdbscanRunState, type SkillHdbscanWorkerPort } from '../src/lib/skillHdbscanRunner.ts'
import type { SkillHdbscanWorkerRequest, SkillHdbscanWorkerResponse } from '../src/lib/skillHdbscan.worker.ts'
import type { SkillClusteringDocument } from '../src/lib/skillClusteringFeatures.ts'
import type { SkillHdbscanExperimentConfig, SkillHdbscanExperimentResult, SkillHdbscanStage } from '../src/lib/skillHdbscan.ts'

const config: SkillHdbscanExperimentConfig = { minClusterSize: 3, minSamples: 2, clusterSelectionMethod: 'eom', stopWordProfile: 'basic' }
const result: SkillHdbscanExperimentResult = {
  config, assignments: [0, 0, 0, -1, -2], counts: [3], representativeTerms: [['攻撃']],
  representativeIndices: [0], noiseCount: 1, excludedCount: 1,
}
const progress = (requestId: number, stage: SkillHdbscanStage = 'distances'): SkillHdbscanWorkerResponse => (
  { type: 'progress', requestId, stage, termsCount: 10, elapsedMs: 12 }
)
const complete = (requestId: number, experimentResult = result): SkillHdbscanWorkerResponse => (
  { type: 'result', requestId, result: experimentResult, termsCount: 10, elapsedMs: 24 }
)

class FakeWorker implements SkillHdbscanWorkerPort {
  onmessage: SkillHdbscanWorkerPort['onmessage'] = null
  onerror: SkillHdbscanWorkerPort['onerror'] = null
  onmessageerror: SkillHdbscanWorkerPort['onmessageerror'] = null
  sent: SkillHdbscanWorkerRequest[] = []
  terminateCount = 0
  sendFailure: Error | null = null
  postMessage(message: SkillHdbscanWorkerRequest) {
    if (this.sendFailure) throw this.sendFailure
    this.sent.push(message)
  }
  terminate() { this.terminateCount += 1 }
  emit(data: SkillHdbscanWorkerResponse) { this.onmessage?.({ data }) }
  queuedCallbacks() {
    return { message: this.onmessage!, error: this.onerror!, messageerror: this.onmessageerror! }
  }
}

function harness() {
  const workers: FakeWorker[] = [], states: SkillHdbscanRunState[] = []
  const runner = new SkillHdbscanRunner(state => states.push(state), () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  return { runner, workers, states, latest: () => states.at(-1)! }
}

function assertClosed(worker: FakeWorker) {
  assert.equal(worker.terminateCount, 1)
  assert.equal(worker.onmessage, null)
  assert.equal(worker.onerror, null)
  assert.equal(worker.onmessageerror, null)
}

function emitQueued(callbacks: ReturnType<FakeWorker['queuedCallbacks']>, requestId: number) {
  callbacks.message({ data: progress(requestId) })
  callbacks.message({ data: complete(requestId) })
  callbacks.message({ data: { type: 'error', requestId, error: '古いエラー' } })
  callbacks.error({ preventDefault() {} })
  callbacks.messageerror()
}

test('a run reports preparation and real stages, then releases its worker on completion', () => {
  const h = harness()
  assert.equal(EMPTY_SKILL_HDBSCAN_RUN.status, 'idle')
  h.runner.start([], config)
  assert.deepEqual(h.latest(), { ...EMPTY_SKILL_HDBSCAN_RUN, requestId: 1, status: 'running', stage: 'preparing' })
  const worker = h.workers[0]
  const queued = worker.queuedCallbacks()
  for (const stage of ['distances', 'hierarchy', 'extract'] as const) {
    worker.emit(progress(1, stage))
    assert.equal(h.latest().status, 'running')
    assert.equal(h.latest().stage, stage)
    assert.equal(h.latest().result, null)
    assert.equal(h.latest().termsCount, 10)
    assert.equal(h.latest().elapsedMs, 12)
  }
  worker.emit(complete(1))
  assert.deepEqual(h.latest(), { requestId: 1, status: 'complete', stage: null, result, termsCount: 10, elapsedMs: 24, error: null })
  assertClosed(worker)
  const count = h.states.length
  emitQueued(queued, 1)
  h.runner.cancel()
  assert.equal(h.states.length, count)
  assert.equal(worker.terminateCount, 1)
})

test('cancellation terminates immediately and rejects already queued progress, results and errors', () => {
  const h = harness()
  h.runner.cancel()
  assert.equal(h.states.length, 0)
  h.runner.start([], config)
  const worker = h.workers[0]
  worker.emit(progress(1))
  const queued = worker.queuedCallbacks()
  h.runner.cancel()
  assert.equal(h.latest().status, 'cancelled')
  assert.equal(h.latest().stage, null)
  assert.equal(h.latest().result, null)
  assert.equal(h.latest().elapsedMs, 12)
  assertClosed(worker)
  const count = h.states.length
  emitQueued(queued, 1)
  h.runner.cancel()
  assert.equal(h.states.length, count)
  h.runner.start([], config)
  const next = h.workers[1].sent[0].requestId
  assert.ok(next > 1)
  h.workers[1].emit(complete(next))
  assert.equal(h.latest().status, 'complete')
})

test('restarting rejects the superseded worker and all messages with a mismatched request ID', () => {
  const h = harness()
  h.runner.start([], config)
  const old = h.workers[0].queuedCallbacks()
  h.workers[0].emit(progress(1))
  h.runner.start([], config)
  assertClosed(h.workers[0])
  assert.deepEqual(h.latest(), { ...EMPTY_SKILL_HDBSCAN_RUN, requestId: 2, status: 'running', stage: 'preparing' })
  const count = h.states.length
  // Using the new request ID with the old worker also must fail its identity guard.
  emitQueued(old, 2)
  emitQueued(old, 1)
  h.workers[1].emit(progress(1))
  h.workers[1].emit(complete(1))
  h.workers[1].emit({ type: 'error', requestId: 1, error: '別の要求' })
  assert.equal(h.states.length, count)
  h.workers[1].emit(complete(2))
  assert.equal(h.latest().status, 'complete')
})

test('disposing releases the worker, rejects queued callbacks and prevents future runs', () => {
  const h = harness()
  h.runner.start([], config)
  const worker = h.workers[0]
  const queued = worker.queuedCallbacks()
  h.runner.dispose()
  assertClosed(worker)
  const count = h.states.length
  emitQueued(queued, 1)
  h.runner.start([], config)
  h.runner.cancel()
  h.runner.dispose()
  assert.equal(h.states.length, count)
  assert.equal(h.workers.length, 1)
  assert.equal(worker.terminateCount, 1)
})

test('start sends a deep snapshot of documents and configuration', () => {
  const h = harness()
  const documents: SkillClusteringDocument[] = [{
    id: 'a', description: '攻撃力上昇', recordIds: ['a', 'b'], operatorName: 'テスト', skillName: '強化', skillIndex: 1,
  }]
  const mutableConfig = { ...config }
  h.runner.start(documents, mutableConfig)
  const request = h.workers[0].sent[0]
  documents[0].description = '回復'
  documents[0].recordIds.push('c')
  documents.push({ ...documents[0], id: 'new' })
  mutableConfig.minSamples = 9
  mutableConfig.stopWordProfile = 'extended'
  assert.equal(request.type, 'start')
  assert.equal(request.documents.length, 1)
  assert.equal(request.documents[0].description, '攻撃力上昇')
  assert.deepEqual(request.documents[0].recordIds, ['a', 'b'])
  assert.deepEqual(request.config, config)
  assert.notEqual(request.config, mutableConfig)
  assert.notEqual(request.documents[0], documents[0])
  h.runner.dispose()
})

test('a restarted run retains its own stop-word profile and rejects the previous profile result', () => {
  const h = harness()
  h.runner.start([], config)
  const old = h.workers[0].queuedCallbacks()
  const extendedConfig: SkillHdbscanExperimentConfig = { ...config, stopWordProfile: 'extended' }
  h.runner.start([], extendedConfig)
  assert.equal(h.workers[0].sent[0].config.stopWordProfile, 'basic')
  assert.equal(h.workers[1].sent[0].config.stopWordProfile, 'extended')
  old.message({ data: complete(1) })
  assert.equal(h.latest().status, 'running')
  const extendedResult = { ...result, config: { ...extendedConfig } }
  h.workers[1].emit(complete(2, extendedResult))
  extendedConfig.stopWordProfile = 'basic'
  assert.equal(h.latest().result?.config.stopWordProfile, 'extended')
  assert.deepEqual(h.latest().result?.config, h.workers[1].sent[0].config)
})

test('an engine error clears the active stage and a fresh run can recover', () => {
  const h = harness()
  h.runner.start([], config)
  const queued = h.workers[0].queuedCallbacks()
  h.workers[0].emit({ type: 'error', requestId: 1, error: '設定値が無効です。' })
  assert.equal(h.latest().status, 'error')
  assert.equal(h.latest().stage, null)
  assert.equal(h.latest().error, '設定値が無効です。')
  assertClosed(h.workers[0])
  const count = h.states.length
  emitQueued(queued, 1)
  assert.equal(h.states.length, count)
  h.runner.start([], config)
  assert.equal(h.latest().error, null)
  h.workers[1].emit(complete(2))
  assert.equal(h.latest().status, 'complete')
})

for (const event of ['error', 'messageerror'] as const) {
  test(`worker ${event} ends the run and releases resources`, () => {
    const h = harness()
    h.runner.start([], config)
    let prevented = false
    if (event === 'error') h.workers[0].onerror?.({ preventDefault() { prevented = true } })
    else h.workers[0].onmessageerror?.()
    assert.equal(h.latest().status, 'error')
    assert.equal(h.latest().stage, null)
    assert.ok(h.latest().error)
    if (event === 'error') assert.equal(prevented, true)
    assertClosed(h.workers[0])
  })
}

test('worker creation failures surface as errors and do not prevent retrying', () => {
  const states: SkillHdbscanRunState[] = []
  const worker = new FakeWorker()
  let attempts = 0
  const runner = new SkillHdbscanRunner(state => states.push(state), () => {
    if (++attempts === 1) throw new Error('Worker を開始できません。')
    return worker
  })
  runner.start([], config)
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.stage, null)
  assert.equal(states.at(-1)?.error, 'Worker を開始できません。')
  runner.start([], config)
  worker.emit(complete(2))
  assert.equal(states.at(-1)?.status, 'complete')
  assertClosed(worker)
})

test('a postMessage failure terminates the partially initialized worker', () => {
  const states: SkillHdbscanRunState[] = []
  const worker = new FakeWorker()
  worker.sendFailure = new Error('送信失敗')
  const runner = new SkillHdbscanRunner(state => states.push(state), () => worker)
  runner.start([], config)
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.stage, null)
  assert.equal(states.at(-1)?.error, '送信失敗')
  assertClosed(worker)
})

test('disposal during the preparing notification does not create a new worker', () => {
  let created = false
  const runner = new SkillHdbscanRunner(() => runner.dispose(), () => {
    created = true
    return new FakeWorker()
  })
  runner.start([], config)
  assert.equal(created, false)
})
