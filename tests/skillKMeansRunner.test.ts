import test from 'node:test'
import assert from 'node:assert/strict'
import { SkillKMeansRunner, type SkillKMeansRunState, type SkillKMeansWorkerPort } from '../src/lib/skillKMeansRunner.ts'
import type { SkillKMeansWorkerRequest, SkillKMeansWorkerResponse } from '../src/lib/skillKMeans.worker.ts'

const configs = [{ k: 3, seed: 2, maxIterations: 30 }, { k: 5, seed: 2, maxIterations: 30 }] as const
class FakeWorker implements SkillKMeansWorkerPort {
  onmessage: SkillKMeansWorkerPort['onmessage'] = null
  onerror: SkillKMeansWorkerPort['onerror'] = null
  onmessageerror: SkillKMeansWorkerPort['onmessageerror'] = null
  sent: SkillKMeansWorkerRequest[] = []
  terminated = false
  postMessage(message: SkillKMeansWorkerRequest) { this.sent.push(message) }
  terminate() { this.terminated = true }
  emit(requestId: number, paused = false, complete = false) {
    this.onmessage?.({ data: { type: 'result', requestId, results: [], termsCount: 10, elapsedMs: 12, paused, complete } as unknown as SkillKMeansWorkerResponse })
  }
}
function harness() {
  const workers: FakeWorker[] = [], states: SkillKMeansRunState[] = []
  const runner = new SkillKMeansRunner(state => states.push(state), () => { const worker = new FakeWorker(); workers.push(worker); return worker })
  return { runner, workers, states, latest: () => states.at(-1)! }
}
test('a superseded worker and wrong request ID cannot overwrite the current run', () => {
  const h = harness()
  h.runner.start([], configs)
  h.workers[0].emit(1)
  assert.equal(h.latest().status, 'running')
  h.runner.start([], configs, true)
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
  h.runner.start([], configs)
  h.runner.pause()
  assert.equal(h.latest().status, 'pausing')
  h.workers[0].emit(1)
  assert.equal(h.latest().status, 'pausing')
  h.workers[0].emit(1, true)
  const result = h.latest().results
  h.runner.step()
  assert.equal(h.latest().results, result)
  h.workers[0].emit(1, true)
  h.runner.resume()
  h.workers[0].emit(1, false, true)
  assert.equal(h.latest().status, 'complete')
  h.runner.resume()
  h.runner.pause()
  assert.deepEqual(h.workers[0].sent.map(item => item.type), ['start', 'pause', 'step', 'resume'])
  assert.equal(h.workers.length, 1)
})
test('disposing terminates the worker and prevents late state updates', () => {
  const h = harness()
  h.runner.start([], configs)
  h.runner.dispose()
  const count = h.states.length
  h.workers[0].emit(1, false, true)
  h.runner.start([], configs)
  assert.equal(h.workers[0].terminated, true)
  assert.equal(h.states.length, count)
})
test('worker errors retain a clear failure state and a new run can recover', () => {
  const h = harness()
  h.runner.start([], configs)
  h.workers[0].onmessage?.({ data: { type: 'error', requestId: 1, error: '語彙なし' } })
  assert.equal(h.latest().error, '語彙なし')
  assert.equal(h.latest().status, 'error')
  assert.equal(h.workers[0].terminated, true)
  h.runner.start([], configs)
  h.workers[1].emit(2, false, true)
  assert.equal(h.latest().status, 'complete')
  assert.equal(h.latest().error, null)
})
