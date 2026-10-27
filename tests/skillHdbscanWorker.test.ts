import test from 'node:test'
import assert from 'node:assert/strict'
import type { SkillClusteringDocument } from '../src/lib/skillClusteringFeatures.ts'
import type { SkillHdbscanExperimentConfig } from '../src/lib/skillHdbscan.ts'
import type { SkillHdbscanWorkerRequest, SkillHdbscanWorkerResponse } from '../src/lib/skillHdbscan.worker.ts'

const documents: SkillClusteringDocument[] = [
  '攻撃力が上昇し、通常攻撃が範囲攻撃となり、攻撃しない',
  'HPを回復して、味方を回復する',
  '弾薬として攻撃する',
  '弾薬を消費して、対象を攻撃する',
].map((description, index) => ({
  id: String(index), description, recordIds: [String(index)], operatorName: 'テスト', skillName: '試験', skillIndex: 1,
}))
const config: SkillHdbscanExperimentConfig = {
  minClusterSize: 2, minSamples: 1, clusterSelectionMethod: 'leaf', stopWordProfile: 'basic',
}

test('the actual worker uses and snapshots the selected preprocessing profile', async (t) => {
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')
  const messages: SkillHdbscanWorkerResponse[] = []
  const scope = {
    onmessage: null as ((event: { data: SkillHdbscanWorkerRequest }) => void) | null,
    postMessage(message: SkillHdbscanWorkerResponse) { messages.push(message) },
  }
  Object.defineProperty(globalThis, 'self', { configurable: true, value: scope })
  try {
    await import('../src/lib/skillHdbscan.worker.ts')
    assert.ok(scope.onmessage)
    const run = (experimentConfig: SkillHdbscanExperimentConfig, requestId: number) => {
      messages.length = 0
      scope.onmessage!({ data: { type: 'start', requestId, documents, config: experimentConfig } })
      assert.ok(messages.every(message => message.requestId === requestId))
      return [...messages]
    }

    await t.test('basic and extended produce different vocabularies and retain the complete config', () => {
      const basic = run({ ...config }, 1).find(message => message.type === 'result')
      const extendedConfig = { ...config, stopWordProfile: 'extended' as const }
      const extended = run(extendedConfig, 2).find(message => message.type === 'result')
      assert.ok(basic && extended)
      assert.ok(basic.termsCount > extended.termsCount)
      assert.deepEqual(basic.result.config, config)
      assert.deepEqual(extended.result.config, extendedConfig)
      assert.notEqual(extended.result.config, extendedConfig)
      extendedConfig.minSamples = 4
      assert.equal(extended.result.config.minSamples, 1)
      assert.equal(extended.result.config.stopWordProfile, 'extended')
      assert.equal(extended.result.assignments.length, documents.length)
    })

    await t.test('invalid and missing profiles return errors instead of silently using a default', () => {
      for (const stopWordProfile of ['invalid', undefined, null]) {
        const response = run({ ...config, stopWordProfile } as unknown as SkillHdbscanExperimentConfig, 3)
        assert.equal(response.length, 1)
        assert.equal(response[0].type, 'error')
        if (response[0].type === 'error') assert.match(response[0].error, /除外語リスト/u)
      }
    })
  } finally {
    if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf)
    else Reflect.deleteProperty(globalThis, 'self')
  }
})
