import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_NAV_ITEMS } from '../src/lib/navigation.ts'
import { parseHashRoute } from '../src/lib/routes.ts'

test('サイドバーから主要ページへ遷移できる', () => {
  assert.deepEqual(
    APP_NAV_ITEMS.map((item) => [item.id, parseHashRoute(item.href).view]),
    [
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

test('削除済みのスキル分類ページのhashはデータベースへ戻す', () => {
  assert.deepEqual(parseHashRoute('#/operators/skills/char_test%3Askill_1'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/skills/%E0%A4%A'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/skills/char_test%3Askill_1'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/skills/%E0%A4%A'), { view: 'operators' })
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

test('ホームと不明なhashはデータベースへフォールバックする', () => {
  assert.deepEqual(parseHashRoute('#/damage'), { view: 'damage' })
  assert.deepEqual(parseHashRoute(''), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/unknown'), { view: 'operators' })
})
