import test from 'node:test'
import assert from 'node:assert/strict'
import { SkillKMeansSearchRunner, type SkillKMeansSearchRunState, type SkillKMeansSearchWorkerPort } from '../src/lib/skillKMeansSearchRunner.ts'
import type { SkillKMeansSearchWorkerRequest, SkillKMeansSearchWorkerResponse } from '../src/lib/skillKMeansSearch.worker.ts'
import type { SkillKMeansSearchConfig, SkillKMeansSearchResult } from '../src/lib/skillKMeansSearch.ts'

const config: SkillKMeansSearchConfig = { minK: 2, maxK: 4, seed: 2, restarts: 5, maxIterations: 30 }
const result: SkillKMeansSearchResult = {
  config, candidates: [{ k: 2, seed: 2, meanSquaredDistance: 0.2, silhouette: 0.7,
    iterations: 4, actualK: 2, stopReason: 'stable-assignments', eligible: true }],
  silhouetteK: 2, elbowK: null, documentCount: 8, excludedCount: 1, termsCount: 12,
}

class FakeWorker implements SkillKMeansSearchWorkerPort {
  onmessage: SkillKMeansSearchWorkerPort['onmessage'] = null
  onerror: SkillKMeansSearchWorkerPort['onerror'] = null
  onmessageerror: SkillKMeansSearchWorkerPort['onmessageerror'] = null
  sent: SkillKMeansSearchWorkerRequest[] = []
  terminated = false
  postError: Error | null = null
  postMessage(message: SkillKMeansSearchWorkerRequest) {
    if (this.postError) throw this.postError
    this.sent.push(message)
  }
  terminate() { this.terminated = true }
  emit(data: SkillKMeansSearchWorkerResponse) { this.onmessage?.({ data }) }
  progress(requestId: number) {
    this.emit({ type: 'progress', requestId,
      progress: { phase: 'fitting', completed: 3, total: 15, k: 2 }, elapsedMs: 12 })
  }
  complete(requestId: number) { this.emit({ type: 'result', requestId, result, elapsedMs: 30 }) }
}

function harness() {
  const workers: FakeWorker[] = [], states: SkillKMeansSearchRunState[] = []
  const runner = new SkillKMeansSearchRunner(state => states.push(state), () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  return { runner, workers, states, latest: () => states.at(-1)! }
}

test('search publishes progress without partial results, then releases the worker on completion', () => {
  const h = harness()
  h.runner.start([], config)
  assert.equal(h.latest().status, 'preparing')
  h.workers[0].emit({ type: 'progress', requestId: 1,
    progress: { phase: 'preparing', completed: 0, total: 8, k: null }, elapsedMs: 1 })
  assert.equal(h.latest().status, 'preparing')
  h.workers[0].progress(1)
  assert.equal(h.latest().status, 'running')
  assert.deepEqual(h.latest().progress, { phase: 'fitting', completed: 3, total: 15, k: 2 })
  assert.equal(h.latest().result, null)
  h.workers[0].complete(1)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.latest().result, result)
  assert.equal(h.latest().elapsedMs, 30)
  assert.equal(h.latest().progress, null)
  assert.equal(h.workers[0].terminated, true)
  const count = h.states.length
  h.workers[0].progress(1)
  h.workers[0].complete(1)
  h.workers[0].onerror?.({ preventDefault() {} })
  h.runner.stop()
  assert.equal(h.states.length, count)
})

test('restart rejects superseded worker callbacks and incorrect request IDs', () => {
  const h = harness()
  h.runner.start([], config)
  h.workers[0].progress(1)
  const queuedMessage = h.workers[0].onmessage
  const queuedError = h.workers[0].onerror
  h.runner.start([], { ...config, seed: 3 })
  assert.equal(h.workers[0].terminated, true)
  const count = h.states.length
  queuedMessage?.({ data: { type: 'result', requestId: 1, result, elapsedMs: 99 } })
  queuedError?.({ preventDefault() {} })
  h.workers[0].onmessageerror?.()
  h.workers[1].complete(1)
  assert.equal(h.states.length, count)
  h.workers[1].complete(2)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.latest().elapsedMs, 30)
  assert.equal(h.workers[1].sent[0].config.seed, 3)
})

test('stop terminates active work immediately, discards partial output, and permits a fresh search', () => {
  const h = harness()
  h.runner.start([], config)
  h.workers[0].progress(1)
  h.runner.stop()
  assert.equal(h.workers[0].terminated, true)
  assert.equal(h.latest().status, 'stopped')
  assert.equal(h.latest().progress, null)
  assert.equal(h.latest().result, null)
  const count = h.states.length
  h.workers[0].complete(1)
  h.workers[0].emit({ type: 'error', requestId: 1, error: 'late failure' })
  h.runner.stop()
  assert.equal(h.states.length, count)
  h.runner.start([], config)
  const requestId = h.latest().requestId
  assert.ok(requestId > 1)
  h.workers[1].complete(requestId)
  assert.equal(h.latest().status, 'complete')
})

test('starting again clears the prior completed result before progress begins', () => {
  const h = harness()
  h.runner.start([], config)
  h.workers[0].complete(1)
  h.runner.start([], config)
  assert.equal(h.latest().result, null)
  assert.equal(h.latest().elapsedMs, 0)
  h.workers[1].progress(2)
  assert.equal(h.latest().result, null)
  h.runner.stop()
  assert.equal(h.latest().result, null)
})

test('dispose prevents future starts and queued callbacks', () => {
  const h = harness()
  h.runner.start([], config)
  const queuedMessage = h.workers[0].onmessage
  h.runner.dispose()
  const count = h.states.length
  queuedMessage?.({ data: { type: 'result', requestId: 1, result, elapsedMs: 30 } })
  h.workers[0].onerror?.({ preventDefault() {} })
  h.workers[0].onmessageerror?.()
  h.runner.start([], config)
  h.runner.stop()
  h.runner.dispose()
  assert.equal(h.workers[0].terminated, true)
  assert.equal(h.states.length, count)
  assert.equal(h.workers.length, 1)
})

test('construction failure is reported without falling back to main-thread computation and can recover', () => {
  const states: SkillKMeansSearchRunState[] = []
  const worker = new FakeWorker()
  let unavailable = true
  const runner = new SkillKMeansSearchRunner(state => states.push(state), () => {
    if (unavailable) throw new Error('worker unavailable')
    return worker
  })
  runner.start([], config)
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.error, 'worker unavailable')
  assert.equal(states.at(-1)?.result, null)
  unavailable = false
  runner.start([], config)
  worker.complete(2)
  assert.equal(states.at(-1)?.status, 'complete')
  assert.equal(states.at(-1)?.error, null)
})

test('start postMessage failure terminates the worker and exposes the error', () => {
  const states: SkillKMeansSearchRunState[] = []
  const worker = new FakeWorker()
  worker.postError = new Error('cannot clone documents')
  const runner = new SkillKMeansSearchRunner(state => states.push(state), () => worker)
  runner.start([], config)
  assert.equal(worker.terminated, true)
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(states.at(-1)?.error, 'cannot clone documents')
})

test('worker execution, runtime, and message decoding failures stop the run without results', () => {
  for (const failure of ['response', 'runtime', 'message'] as const) {
    const h = harness()
    h.runner.start([], config)
    h.workers[0].progress(1)
    if (failure === 'response') {
      h.workers[0].emit({ type: 'error', requestId: 1, error: 'invalid K' })
    } else if (failure === 'runtime') {
      let prevented = false
      h.workers[0].onerror?.({ preventDefault() { prevented = true } })
      assert.equal(prevented, true)
    } else h.workers[0].onmessageerror?.()
    assert.equal(h.latest().status, 'error', failure)
    assert.equal(h.latest().progress, null, failure)
    assert.equal(h.latest().result, null, failure)
    assert.ok(h.latest().error, failure)
    assert.equal(h.workers[0].terminated, true, failure)
    const count = h.states.length
    h.workers[0].complete(1)
    assert.equal(h.states.length, count, failure)
  }
})

test('documents and settings sent to a search are detached from subsequent caller edits', () => {
  const h = harness()
  const documents = [{ id: 'one', description: '攻撃力上昇', recordIds: ['one'], operatorName: '名前', skillName: '技', skillIndex: 1 }]
  const settings = { ...config }
  h.runner.start(documents, settings)
  documents[0].description = 'changed'
  documents[0].recordIds.push('two')
  settings.seed = 8
  assert.equal(h.workers[0].sent[0].documents[0].description, '攻撃力上昇')
  assert.deepEqual(h.workers[0].sent[0].documents[0].recordIds, ['one'])
  assert.equal(h.workers[0].sent[0].config.seed, 2)
})

test('stop or dispose from the initial state callback prevents worker creation', () => {
  for (const action of ['stop', 'dispose'] as const) {
    const states: SkillKMeansSearchRunState[] = []
    let created = 0
    const runner = new SkillKMeansSearchRunner(state => {
      states.push(state)
      if (state.status === 'preparing') runner[action]()
    }, () => { created += 1; return new FakeWorker() })
    runner.start([], config)
    assert.equal(created, 0, action)
    assert.equal(states.at(-1)?.status, action === 'stop' ? 'stopped' : 'preparing', action)
  }
})

test('a worker created after disposal during its factory is terminated without starting', () => {
  const worker = new FakeWorker()
  const runner = new SkillKMeansSearchRunner(() => {}, () => {
    runner.dispose()
    return worker
  })
  runner.start([], config)
  assert.equal(worker.terminated, true)
  assert.equal(worker.sent.length, 0)
})
