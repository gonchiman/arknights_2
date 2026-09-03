import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_NAV_ITEMS } from '../src/lib/navigation.ts'
import { createOperatorDetailHash, parseHashRoute } from '../src/lib/routes.ts'

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

test('オペレーター詳細のhashを解析する', () => {
  assert.deepEqual(parseHashRoute('#/operators/char_456_ash'), {
    view: 'operator-detail',
    operatorId: 'char_456_ash',
  })
  assert.deepEqual(parseHashRoute('#/operators/%E3%82%A2%E3%83%BC%E3%82%AF%2F%E3%83%8A%E3%82%A4%E3%83%84'), {
    view: 'operator-detail',
    operatorId: 'アーク/ナイツ',
  })
})

test('オペレーター詳細のhashを生成する', () => {
  assert.equal(createOperatorDetailHash('char_456_ash'), '#/operators/char_456_ash')
  assert.equal(
    createOperatorDetailHash('アーク/ナイツ'),
    '#/operators/%E3%82%A2%E3%83%BC%E3%82%AF%2F%E3%83%8A%E3%82%A4%E3%83%84',
  )
})

test('不正なオペレーター詳細のhashはデータベースへフォールバックする', () => {
  assert.deepEqual(parseHashRoute('#/operators/'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/char_test/extra'), { view: 'operators' })
  assert.deepEqual(parseHashRoute('#/operators/%E0%A4%A'), { view: 'operators' })
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
