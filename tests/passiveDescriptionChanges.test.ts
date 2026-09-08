import test from 'node:test'
import assert from 'node:assert/strict'
import { splitPassiveDescriptionChanges } from '../src/lib/passiveDescriptionChanges.ts'

test('unchanged descriptions have no highlighted segments, including empty descriptions', () => {
  const text = '攻撃時、敵の術耐性を15無視する'
  assert.deepEqual(splitPassiveDescriptionChanges(text, text), [{ text, changed: false }])
  assert.deepEqual(splitPassiveDescriptionChanges('', ''), [])
})

test('an inserted Japanese trait clause is one contiguous highlight', () => {
  const before = '浮遊ユニットを操作し、敵に術ダメージを与える。'
  const insertion = '浮遊ユニットの初期攻撃力が上昇し、'
  const after = `浮遊ユニットを操作し、${insertion}敵に術ダメージを与える。`
  assert.deepEqual(splitPassiveDescriptionChanges(before, after), [
    { text: '浮遊ユニットを操作し、', changed: false },
    { text: insertion, changed: true },
    { text: '敵に術ダメージを与える。', changed: false },
  ])
})

test('changed percentages and resistance values are highlighted as whole values', () => {
  for (const [before, after] of [['300%', '360%'], ['110%', '120%'], ['15', '20'], ['+0.5%', '+1.5%'], ['１５％', '２０％']]) {
    assert.deepEqual(splitPassiveDescriptionChanges(`効果は${before}になる`, `効果は${after}になる`), [
      { text: '効果は', changed: false },
      { text: after, changed: true },
      { text: 'になる', changed: false },
    ])
  }
})

test('multiple distant changes keep the intervening description unchanged', () => {
  assert.deepEqual(splitPassiveDescriptionChanges(
    '攻撃力の300%の術ダメージを与え、敵の術耐性を15無視する。',
    '攻撃力の360%の術ダメージを与え、敵の術耐性を20無視する。',
  ), [
    { text: '攻撃力の', changed: false },
    { text: '360%', changed: true },
    { text: 'の術ダメージを与え、敵の術耐性を', changed: false },
    { text: '20', changed: true },
    { text: '無視する。', changed: false },
  ])
})

test('deletions do not create highlights or invent replacement text', () => {
  assert.deepEqual(splitPassiveDescriptionChanges('敵全員に追加の術ダメージを与える', '敵に術ダメージを与える'), [
    { text: '敵に術ダメージを与える', changed: false },
  ])
  assert.deepEqual(splitPassiveDescriptionChanges('削除された説明', ''), [])
})

test('new descriptions and Unicode additions preserve the exact current text', () => {
  const after = '⚡効果：𠮷野\n攻撃力＋１０．５％'
  assert.deepEqual(splitPassiveDescriptionChanges('', after), [{ text: after, changed: true }])
  assert.deepEqual(splitPassiveDescriptionChanges('効果⚡\n発動', '効果💥\n発動'), [
    { text: '効果', changed: false },
    { text: '💥', changed: true },
    { text: '\n発動', changed: false },
  ])
})
