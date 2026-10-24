import test from 'node:test'
import assert from 'node:assert/strict'
import { SkillHierarchicalRunner, type SkillHierarchicalRunState, type SkillHierarchicalWorkerPort } from '../src/lib/skillHierarchicalRunner.ts'
import type { SkillHierarchicalWorkerRequest, SkillHierarchicalWorkerResponse } from '../src/lib/skillHierarchical.worker.ts'
import type { SkillHierarchyPartition, SkillHierarchyTree } from '../src/lib/skillHierarchical.ts'

const tree: SkillHierarchyTree = {
  nodes: [], rootId: -1, documentCount: 2, documentIndices: [0, 1], excludedIndices: [], termsCount: 3,
  linkage: 'average', distances: new Float64Array([0, 1, 1, 0]), recommendedThreshold: 0.5, autoCandidates: [],
}
const partition: SkillHierarchyPartition = { threshold: 0.5, groupNodeIds: [0, 1], assignments: [0, 1], silhouette: null }

class FakeWorker implements SkillHierarchicalWorkerPort {
  onmessage: SkillHierarchicalWorkerPort['onmessage'] = null
  onerror: SkillHierarchicalWorkerPort['onerror'] = null
  onmessageerror: SkillHierarchicalWorkerPort['onmessageerror'] = null
  sent: SkillHierarchicalWorkerRequest[] = []
  terminated = false
  postError: Error | null = null
  postMessage(message: SkillHierarchicalWorkerRequest) {
    if (this.postError) throw this.postError
    this.sent.push(message)
  }
  terminate() { this.terminated = true }
  emit(data: SkillHierarchicalWorkerResponse) { this.onmessage?.({ data }) }
  progress(requestId: number) {
    this.emit({ type: 'progress', requestId, progress: { phase: 'merging', completed: 3, total: 10 }, elapsedMs: 12 })
  }
  complete(requestId: number) { this.emit({ type: 'result', requestId, tree, partition, elapsedMs: 30 }) }
  cut(requestId: number, cutId: number, threshold: number) {
    this.emit({ type: 'partition', requestId, cutId, partition: { ...partition, threshold }, elapsedMs: 35 })
  }
}

function harness() {
  const workers: FakeWorker[] = [], states: SkillHierarchicalRunState[] = []
  const runner = new SkillHierarchicalRunner(state => states.push(state), () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  return { runner, workers, states, latest: () => states.at(-1)! }
}

test('restarting terminates the previous worker and ignores its messages and errors', () => {
  const h = harness()
  h.runner.start([], 'average')
  assert.equal(h.latest().status, 'preparing')
  h.workers[0].progress(1)
  assert.equal(h.latest().status, 'running')
  assert.deepEqual(h.latest().progress, { phase: 'merging', completed: 3, total: 10 })
  h.runner.start([], 'complete')
  assert.equal(h.workers[0].terminated, true)
  const count = h.states.length
  h.workers[0].complete(1)
  h.workers[0].emit({ type: 'error', requestId: 1, error: 'old failure' })
  h.workers[0].onerror?.({ preventDefault() {} })
  h.workers[0].onmessageerror?.()
  h.workers[1].complete(1)
  assert.equal(h.states.length, count)
  h.workers[1].complete(2)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.latest().tree, tree)
  assert.equal(h.latest().progress, null)
  assert.deepEqual(h.workers[1].sent[0], { type: 'start', requestId: 2, documents: [], linkage: 'complete' })
})

test('cancel terminates synchronous work, rejects queued callbacks, and allows a fresh run', () => {
  const h = harness()
  h.runner.start([], 'average')
  h.runner.cancel()
  assert.equal(h.workers[0].terminated, true)
  assert.equal(h.latest().status, 'cancelled')
  assert.equal(h.latest().cutPending, false)
  const count = h.states.length
  h.workers[0].progress(1)
  h.workers[0].complete(1)
  h.workers[0].onerror?.({ preventDefault() {} })
  h.runner.setThreshold(0.3)
  h.runner.cancel()
  assert.equal(h.states.length, count)
  h.runner.start([], 'average')
  const requestId = h.latest().requestId
  assert.ok(requestId > 1)
  h.workers[1].complete(requestId)
  assert.equal(h.latest().status, 'complete')
})

test('completed workers are reused for cuts, and only the most recent cut can update the partition', () => {
  const h = harness()
  h.runner.start([], 'average')
  h.runner.setThreshold(0.1)
  assert.equal(h.workers[0].sent.length, 1)
  h.workers[0].complete(1)
  assert.equal(h.workers[0].terminated, false)
  h.runner.setThreshold(0.2)
  h.runner.setThreshold(0.8)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.latest().tree, tree)
  assert.equal(h.latest().partition, partition)
  assert.equal(h.latest().cutPending, true)
  const count = h.states.length
  h.workers[0].cut(1, 1, 0.2)
  h.workers[0].emit({ type: 'error', requestId: 1, cutId: 1, error: 'old cut failure' })
  h.workers[0].cut(2, 2, 0.8)
  h.workers[0].progress(1)
  h.workers[0].complete(1)
  assert.equal(h.states.length, count)
  h.workers[0].cut(1, 2, 0.8)
  assert.equal(h.latest().partition?.threshold, 0.8)
  assert.equal(h.latest().cutPending, false)
  assert.equal(h.latest().elapsedMs, 35)
  const completeCount = h.states.length
  h.workers[0].cut(1, 1, 0.2)
  h.workers[0].cut(1, 2, 0.7)
  assert.equal(h.states.length, completeCount)
  assert.equal(h.workers.length, 1)
  assert.deepEqual(h.workers[0].sent.slice(1), [
    { type: 'cut', requestId: 1, cutId: 1, threshold: 0.2 },
    { type: 'cut', requestId: 1, cutId: 2, threshold: 0.8 },
  ])
})

test('cancelling a pending cut retains the displayed result and rejects the cancelled cut', () => {
  const h = harness()
  h.runner.start([], 'average')
  h.workers[0].complete(1)
  h.runner.setThreshold(0.3)
  h.runner.cancel()
  const count = h.states.length
  h.workers[0].cut(1, 1, 0.3)
  assert.equal(h.states.length, count)
  assert.equal(h.latest().partition, partition)
  assert.equal(h.latest().cutPending, false)
  assert.equal(h.latest().status, 'cancelled')
  assert.equal(h.workers[0].terminated, true)
})

test('dispose terminates the retained worker and prevents subsequent starts, cuts, and callbacks', () => {
  const h = harness()
  h.runner.start([], 'average')
  h.workers[0].complete(1)
  h.runner.setThreshold(0.2)
  h.runner.dispose()
  const count = h.states.length
  h.workers[0].cut(1, 1, 0.2)
  h.workers[0].onerror?.({ preventDefault() {} })
  h.workers[0].onmessageerror?.()
  h.runner.start([], 'complete')
  h.runner.setThreshold(0.6)
  h.runner.cancel()
  h.runner.dispose()
  assert.equal(h.workers[0].terminated, true)
  assert.equal(h.states.length, count)
  assert.equal(h.workers.length, 1)
})

test('worker construction failure is reported and the runner can recover', () => {
  const states: SkillHierarchicalRunState[] = []
  const worker = new FakeWorker()
  let unavailable = true
  const runner = new SkillHierarchicalRunner(state => states.push(state), () => {
    if (unavailable) throw new Error('worker unavailable')
    return worker
  })
  runner.start([], 'average')
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.error, 'worker unavailable')
  unavailable = false
  runner.start([], 'average')
  worker.complete(2)
  assert.equal(states.at(-1)?.status, 'complete')
  assert.equal(states.at(-1)?.error, null)
})

test('start postMessage failures terminate the worker and expose the error', () => {
  const states: SkillHierarchicalRunState[] = []
  const worker = new FakeWorker()
  worker.postError = new Error('cannot clone documents')
  const runner = new SkillHierarchicalRunner(state => states.push(state), () => worker)
  runner.start([], 'average')
  assert.equal(worker.terminated, true)
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.error, 'cannot clone documents')
})

test('cut postMessage failures clear pending state and retain the displayed tree', () => {
  const h = harness()
  h.runner.start([], 'average')
  h.workers[0].complete(1)
  h.workers[0].postError = new Error('cannot send cut')
  h.runner.setThreshold(0.3)
  assert.equal(h.latest().status, 'error')
  assert.equal(h.latest().cutPending, false)
  assert.equal(h.latest().tree, tree)
  assert.equal(h.latest().partition, partition)
  assert.equal(h.workers[0].terminated, true)
})

test('current worker errors and malformed messages terminate work and clear pending state', () => {
  for (const failure of ['response', 'runtime', 'message', 'cut'] as const) {
    const h = harness()
    h.runner.start([], 'average')
    if (failure === 'cut') {
      h.workers[0].complete(1)
      h.runner.setThreshold(0.3)
      h.workers[0].emit({ type: 'error', requestId: 1, cutId: 1, error: 'cut failed' })
    } else if (failure === 'response') {
      h.workers[0].emit({ type: 'error', requestId: 1, error: 'features failed' })
    } else if (failure === 'runtime') {
      let prevented = false
      h.workers[0].onerror?.({ preventDefault() { prevented = true } })
      assert.equal(prevented, true)
    } else h.workers[0].onmessageerror?.()
    assert.equal(h.latest().status, 'error', failure)
    assert.equal(h.latest().cutPending, false, failure)
    assert.ok(h.latest().error, failure)
    assert.equal(h.workers[0].terminated, true, failure)
    const count = h.states.length
    h.workers[0].complete(1)
    assert.equal(h.states.length, count, failure)
  }
})

test('start captures a detached snapshot of the documents sent to the worker', () => {
  const h = harness()
  const documents = [{ id: 'one', description: '攻撃力上昇', recordIds: ['one'], operatorName: '名前', skillName: '技', skillIndex: 1 }]
  h.runner.start(documents, 'average')
  documents[0].description = 'changed'
  documents[0].recordIds.push('two')
  const request = h.workers[0].sent[0]
  assert.equal(request.type, 'start')
  if (request.type !== 'start') return
  assert.equal(request.documents[0].description, '攻撃力上昇')
  assert.deepEqual(request.documents[0].recordIds, ['one'])
})
