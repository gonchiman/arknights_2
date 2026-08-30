import test from 'node:test'
import assert from 'node:assert/strict'
import { getSkillRouteHash, parseHashRoute } from '../src/lib/routes.ts'

test('比較ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/comparison'), { view: 'comparison' })
})

test('既存ルートと不明なhashのフォールバックを維持する', () => {
  assert.deepEqual(parseHashRoute('#/damage'), { view: 'damage' })
  assert.deepEqual(parseHashRoute('#/skills/test%3Aid'), { view: 'skill', skillId: 'test:id' })
  assert.deepEqual(parseHashRoute('#/unknown'), { view: 'list' })
  assert.equal(getSkillRouteHash('test:id'), '#/skills/test%3Aid')
})
