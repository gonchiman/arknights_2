import test from 'node:test'
import assert from 'node:assert/strict'
import { SkillKMeansRunner, type SkillKMeansRunState, type SkillKMeansWorkerPort } from '../src/lib/skillKMeansRunner.ts'
import type { SkillKMeansWorkerRequest, SkillKMeansWorkerResponse } from '../src/lib/skillKMeans.worker.ts'

const config = { k: 3, seed: 2, maxIterations: 30 }
class FakeWorker implements SkillKMeansWorkerPort {
  onmessage: SkillKMeansWorkerPort['onmessage'] = null
  onerror: SkillKMeansWorkerPort['onerror'] = null
  onmessageerror: SkillKMeansWorkerPort['onmessageerror'] = null
  sent: SkillKMeansWorkerRequest[] = []
  terminated = false
  postMessage(message: SkillKMeansWorkerRequest) { this.sent.push(message) }
  terminate() { this.terminated = true }
  emit(requestId: number, paused = false, complete = false) {
    this.onmessage?.({ data: { type: 'result', requestId, result: { config, iteration: 1 }, termsCount: 10, elapsedMs: 12, paused, complete } as SkillKMeansWorkerResponse })
  }
}
function harness() {
  const workers: FakeWorker[] = [], states: SkillKMeansRunState[] = []
  const runner = new SkillKMeansRunner(state => states.push(state), () => { const worker = new FakeWorker(); workers.push(worker); return worker })
  return { runner, workers, states, latest: () => states.at(-1)! }
}
test('a superseded worker and wrong request ID cannot overwrite the current run', () => {
  const h = harness()
  h.runner.start([], config)
  h.workers[0].emit(1)
  assert.equal(h.latest().status, 'running')
  h.runner.start([], config, true)
  assert.equal(h.workers[0].terminated, true)
  const count = h.states.length
  h.workers[0].emit(1, false, true)
  h.workers[1].emit(1, false, true)
  assert.equal(h.states.length, count)
  h.workers[1].emit(2, true)
  assert.equal(h.latest().status, 'paused')
  assert.equal(h.workers[1].sent[0].type, 'start')
  assert.equal((h.workers[1].sent[0] as { stepOnly: boolean }).stepOnly, true)
})
test('pause, step and resume keep the same worker and result until completion', () => {
  const h = harness()
  h.runner.start([], config)
  h.runner.pause()
  assert.equal(h.latest().status, 'pausing')
  h.workers[0].emit(1)
  assert.equal(h.latest().status, 'pausing')
  h.workers[0].emit(1, true)
  const result = h.latest().result
  h.runner.step()
  assert.equal(h.latest().result, result)
  h.workers[0].emit(1, true)
  h.runner.resume()
  h.workers[0].emit(1, false, true)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.workers[0].terminated, true)
  h.runner.resume()
  h.runner.pause()
  assert.deepEqual(h.workers[0].sent.map(item => item.type), ['start', 'pause', 'step', 'resume'])
  assert.equal(h.workers.length, 1)
})
test('disposing terminates the worker and prevents late state updates', () => {
  const h = harness()
  h.runner.start([], config)
  h.runner.dispose()
  const count = h.states.length
  h.workers[0].emit(1, false, true)
  h.runner.start([], config)
  assert.equal(h.workers[0].terminated, true)
  assert.equal(h.states.length, count)
})
test('worker errors retain a clear failure state and a new run can recover', () => {
  const h = harness()
  h.runner.start([], config)
  h.workers[0].onmessage?.({ data: { type: 'error', requestId: 1, error: '語彙なし' } })
  assert.equal(h.latest().error, '語彙なし')
  assert.equal(h.latest().status, 'error')
  assert.equal(h.workers[0].terminated, true)
  h.runner.start([], config)
  h.workers[1].emit(2, false, true)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.latest().error, null)
})

test('starting learning sends one independently cloned configuration', () => {
  const h = harness()
  const settings = { ...config }
  h.runner.start([], settings, true)
  const request = h.workers[0].sent[0]
  assert.equal(request.type, 'start')
  if (request.type !== 'start') assert.fail('start expected')
  assert.deepEqual(request.config, config)
  assert.notEqual(request.config, settings)
  settings.k = 6
  assert.equal(request.config.k, 3)
  assert.equal('configs' in request, false)
  h.workers[0].emit(1, true)
  assert.equal(h.latest().result?.iteration, 1)
  assert.equal('results' in h.latest(), false)
})

test('completion closes the worker and ignores queued late updates', () => {
  const h = harness()
  h.runner.start([], config)
  h.workers[0].emit(1, false, true)
  const finalState = h.latest()
  h.workers[0].emit(1, true)
  h.workers[0].onmessageerror?.()
  assert.equal(h.latest(), finalState)
  assert.equal(h.workers[0].terminated, true)
})

test('disposing during the preparing notification never creates a worker', () => {
  let workersCreated = 0
  const runner = new SkillKMeansRunner(() => runner.dispose(), () => { workersCreated++; return new FakeWorker() })
  runner.start([], config)
  assert.equal(workersCreated, 0)
})

test('starting a new run during preparation does not leak the superseded worker', () => {
  const workers: FakeWorker[] = []
  const runner = new SkillKMeansRunner(state => {
    if (state.requestId === 1) runner.start([], { ...config, k: 4 })
  }, () => { const worker = new FakeWorker(); workers.push(worker); return worker })
  runner.start([], config)
  assert.equal(workers.length, 1)
  const request = workers[0].sent[0]
  assert.equal(request.type, 'start')
  if (request.type !== 'start') assert.fail('start expected')
  assert.equal(request.requestId, 2)
  assert.equal(request.config.k, 4)
})

test('disposing while creating a worker terminates it without sending a start request', () => {
  const worker = new FakeWorker()
  const runner = new SkillKMeansRunner(() => {}, () => { runner.dispose(); return worker })
  runner.start([], config)
  assert.equal(worker.terminated, true)
  assert.equal(worker.sent.length, 0)
})

test('reentrant run replacement while pausing never sends pause to the new worker', () => {
  const workers: FakeWorker[] = []
  const runner = new SkillKMeansRunner(state => {
    if (state.status === 'pausing') runner.start([], { ...config, k: 4 })
  }, () => { const worker = new FakeWorker(); workers.push(worker); return worker })
  runner.start([], config)
  workers[0].emit(1)
  runner.pause()
  assert.equal(workers[0].terminated, true)
  assert.deepEqual(workers[0].sent.map(item => item.type), ['start'])
  assert.deepEqual(workers[1].sent.map(item => item.type), ['start'])
})

test('creation and message failures terminate the active worker and remain recoverable', () => {
  const states: SkillKMeansRunState[] = []
  let failCreation = true
  const worker = new FakeWorker()
  const runner = new SkillKMeansRunner(state => states.push(state), () => {
    if (failCreation) throw new Error('起動失敗')
    return worker
  })
  runner.start([], config)
  assert.equal(states.at(-1)?.error, '起動失敗')
  failCreation = false
  runner.start([], config)
  worker.onmessageerror?.()
  assert.equal(states.at(-1)?.status, 'error')
  assert.equal(worker.terminated, true)
})
