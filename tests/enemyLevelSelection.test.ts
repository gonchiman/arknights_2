import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMY_LEVEL_TYPES, type EnemyLevelType } from '../src/types/enemy.ts'
import {
  copyEnemyLevelSelection,
  formatEnemyLevelSelection,
  isEnemyLevelSelection,
  normalizeEnemyLevelSelection,
  toggleEnemyLevelSelection,
  type EnemyLevelSelection,
} from '../src/lib/enemyLevelSelection.ts'

test('区分を定義順に揃え、空と全種類は全敵として扱う', () => {
  assert.equal(normalizeEnemyLevelSelection('ALL'), 'ALL')
  assert.deepEqual(normalizeEnemyLevelSelection('ELITE'), ['ELITE'])
  assert.equal(normalizeEnemyLevelSelection([]), 'ALL')
  assert.equal(normalizeEnemyLevelSelection([...ENEMY_LEVEL_TYPES].reverse()), 'ALL')
  const source = Object.freeze(['BOSS', 'NORMAL', 'BOSS', 'ELITE'] as const)
  assert.deepEqual(normalizeEnemyLevelSelection(source), ['NORMAL', 'ELITE', 'BOSS'])
  assert.deepEqual(source, ['BOSS', 'NORMAL', 'BOSS', 'ELITE'])
})

test('全敵から個別選択へ切り替え、区分を追加・解除できる', () => {
  let selection: EnemyLevelSelection = 'ALL'
  selection = toggleEnemyLevelSelection(selection, 'ELITE')
  assert.deepEqual(selection, ['ELITE'])
  selection = toggleEnemyLevelSelection(selection, 'NORMAL')
  assert.deepEqual(selection, ['NORMAL', 'ELITE'])
  selection = toggleEnemyLevelSelection(selection, 'ELITE')
  assert.deepEqual(selection, ['NORMAL'])
  selection = toggleEnemyLevelSelection(selection, 'NORMAL')
  assert.equal(selection, 'ALL')
  assert.equal(toggleEnemyLevelSelection(['NORMAL', 'ELITE'], 'ALL'), 'ALL')
  assert.deepEqual(toggleEnemyLevelSelection('NORMAL', 'ELITE'), ['NORMAL', 'ELITE'])
})

test('最後の種類を追加したときは全敵へ戻り、入力の配列は変更しない', () => {
  const partial = Object.freeze(['NORMAL', 'ELITE', 'BOSS'] as const)
  assert.equal(toggleEnemyLevelSelection(partial, 'UNKNOWN'), 'ALL')
  assert.deepEqual(partial, ['NORMAL', 'ELITE', 'BOSS'])
  assert.deepEqual(toggleEnemyLevelSelection(ENEMY_LEVEL_TYPES, 'BOSS'), ['BOSS'])
})

test('画像や編集用のコピーを、その後の配列変更から独立させる', () => {
  const source: EnemyLevelType[] = ['NORMAL', 'ELITE']
  const copied = copyEnemyLevelSelection(source)
  assert.notEqual(copied, source)
  source.push('BOSS')
  assert.deepEqual(copied, ['NORMAL', 'ELITE'])
  assert.equal(copyEnemyLevelSelection('ALL'), 'ALL')
  assert.equal(copyEnemyLevelSelection('BOSS'), 'BOSS')
})

test('複数区分を読みやすく表示し、既存の条件ラベルも指定できる', () => {
  assert.equal(formatEnemyLevelSelection('ALL'), '全敵')
  assert.equal(formatEnemyLevelSelection('NORMAL'), '通常')
  assert.equal(formatEnemyLevelSelection(['ELITE', 'NORMAL']), '通常＋エリート')
  assert.equal(formatEnemyLevelSelection(['BOSS', 'UNKNOWN']), 'ボス＋未分類')
  assert.equal(formatEnemyLevelSelection(ENEMY_LEVEL_TYPES), '全敵')
  assert.equal(formatEnemyLevelSelection(['NORMAL', 'ELITE'], { NORMAL: '通常敵', ELITE: 'エリート敵' }), '通常敵＋エリート敵')
  assert.equal(formatEnemyLevelSelection(['NORMAL', 'BOSS'], { NORMAL: '通常敵' }), '通常敵＋ボス')
  assert.equal(formatEnemyLevelSelection([], { ALL: 'すべて' }), 'すべて')
})

test('保存データでは旧形式と有効な複数選択だけを受け付ける', () => {
  const valid: unknown[] = ['ALL', ...ENEMY_LEVEL_TYPES, ['NORMAL'], ['ELITE', 'NORMAL'], [...ENEMY_LEVEL_TYPES]]
  for (const value of valid) assert.equal(isEnemyLevelSelection(value), true, JSON.stringify(value))
  const invalid: unknown[] = [undefined, null, '', 'OTHER', 1, {}, [], Array(1), ['ALL'], ['NORMAL', 'NORMAL'], ['NORMAL', 'OTHER'], ['NORMAL', null], [...ENEMY_LEVEL_TYPES, 'NORMAL']]
  for (const value of invalid) assert.equal(isEnemyLevelSelection(value), false, JSON.stringify(value))
})
