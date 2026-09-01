import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_NAV_ITEMS } from '../src/lib/navigation.ts'
import { getSkillRouteHash, parseHashRoute } from '../src/lib/routes.ts'

test('サイドバーから主要ページへ遷移できる', () => {
  assert.deepEqual(
    APP_NAV_ITEMS.map((item) => [item.id, parseHashRoute(item.href).view]),
    [
      ['classifier', 'list'],
      ['operators', 'operators'],
      ['skills', 'skills'],
      ['damage', 'damage'],
      ['comparison', 'comparison'],
      ['enemies', 'enemies'],
      ['sources', 'sources'],
    ],
  )
  assert.equal(new Set(APP_NAV_ITEMS.map((item) => item.href)).size, APP_NAV_ITEMS.length)
})

test('比較ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/comparison'), { view: 'comparison' })
})

test('オペレーターデータベースのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/operators'), { view: 'operators' })
})

test('旧オペレータースキル分類hashはデータベースへ戻す', () => {
  assert.deepEqual(parseHashRoute('#/operators/skills/char_test%3Askill_1'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/skills/%E0%A4%A'), { view: 'operators' })
})

test('敵分析ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/enemies'), { view: 'enemies' })
})

test('全スキル一覧ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/skills'), { view: 'skills' })
})

test('参照元ページのhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/sources'), { view: 'sources' })
})

test('既存ルートと不明なhashのフォールバックを維持する', () => {
  assert.deepEqual(parseHashRoute('#/damage'), { view: 'damage' })
  assert.deepEqual(parseHashRoute('#/skills/test%3Aid'), { view: 'skill', skillId: 'test:id' })
  assert.deepEqual(parseHashRoute('#/unknown'), { view: 'list' })
  assert.equal(getSkillRouteHash('test:id'), '#/skills/test%3Aid')
})
