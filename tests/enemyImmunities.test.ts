import test from 'node:test'
import assert from 'node:assert/strict'
import type { EnemyRecord } from '../src/types/enemy.ts'
import { filterEnemiesByImmunity, summarizeEnemyImmunities } from '../src/lib/enemyImmunities.ts'
import { parseEnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'

function spawnCounts(enemies: Record<string, number>) {
  return parseEnemyHistogramCounts({
    schemaVersion: 1,
    generatedAt: '',
    sourceGeneratedAt: null,
    summary: { mapCount: 2, missingMapCount: 0, spawnMapCount: 2, spawnExcludedMapCount: 0 },
    enemies: Object.fromEntries(Object.entries(enemies).map(([id, spawnCount]) => [id, { mapCount: 1, spawnCount }])),
  })
}

function enemy(id: string, statusImmunities: string[] = []): EnemyRecord {
  return {
    id, index: id, name: id, sortId: 0, levelType: 'NORMAL',
    description: '', abilities: [], damageTypes: [], attackWay: null, lifePointReduce: null,
    databaseLevel: 0, databaseLevelCount: 1, stageAppearanceCount: null, statusImmunities,
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: {
      maxHp: null, attack: null, defense: null, magicResistance: null,
      moveSpeed: null, attackSpeed: null, baseAttackTime: null, massLevel: null,
    },
  }
}

test('空の分析対象でも9種を定義順に残し、割合を0にする', () => {
  const summary = summarizeEnemyImmunities([])
  assert.equal(summary.total, 0)
  assert.deepEqual(summary.items.map(({ label, count, ratio }) => [label, count, ratio]), [
    ['スタン', 0, 0], ['沈黙', 0, 0], ['睡眠', 0, 0], ['凍結', 0, 0], ['浮遊', 0, 0],
    ['戦慄', 0, 0], ['恐怖', 0, 0], ['麻痺', 0, 0], ['誘導', 0, 0],
  ])
  assert.deepEqual(filterEnemiesByImmunity([], 'stunImmune'), [])
})

test('各耐性を持つ敵を数え、耐性未設定の敵を含む全分析対象を割合の分母にする', () => {
  const rows = [enemy('a', ['スタン', '沈黙']), enemy('b', ['沈黙']), enemy('c')]
  const summary = summarizeEnemyImmunities(rows)
  assert.equal(summary.total, 3)
  assert.deepEqual(summary.items.slice(0, 2), [
    { key: 'silenceImmune', label: '沈黙', count: 2, ratio: 2 / 3 },
    { key: 'stunImmune', label: 'スタン', count: 1, ratio: 1 / 3 },
  ])
  assert.equal(summary.items.length, 9)
  assert.ok(summary.items.slice(2).every(({ count, ratio }) => count === 0 && ratio === 0))
  assert.deepEqual(filterEnemiesByImmunity(rows, 'silenceImmune'), rows.slice(0, 2))
})

test('同一敵の複数耐性はそれぞれに数えるが同じ耐性の重複表記は重ねて数えない', () => {
  const rows = [enemy('a', ['スタン', 'スタン', '沈黙', '睡眠']), enemy('b', ['沈黙', '睡眠'])]
  const summary = summarizeEnemyImmunities(rows)
  assert.deepEqual(summary.items.slice(0, 3).map(({ label, count, ratio }) => [label, count, ratio]), [
    ['沈黙', 2, 1], ['睡眠', 2, 1], ['スタン', 1, 0.5],
  ])
  assert.deepEqual(filterEnemiesByImmunity(rows, 'stunImmune'), [rows[0]])
})

test('敵IDが重複する場合は先頭の基礎レコードだけを集計・一覧に使う', () => {
  const first = enemy('a', ['スタン'])
  const second = enemy('b', ['沈黙'])
  const rows = [first, second, first, enemy('a', ['沈黙', '睡眠'])]
  const summary = summarizeEnemyImmunities(rows)
  assert.equal(summary.total, 2)
  assert.deepEqual(summary.items.slice(0, 3).map(({ label, count, ratio }) => [label, count, ratio]), [
    ['スタン', 1, 0.5], ['沈黙', 1, 0.5], ['睡眠', 0, 0],
  ])
  assert.deepEqual(filterEnemiesByImmunity(rows, 'stunImmune'), [first])
  assert.deepEqual(filterEnemiesByImmunity(rows, 'silenceImmune'), [second])
  assert.deepEqual(filterEnemiesByImmunity(rows, 'sleepImmune'), [])
})

test('未知の表記を耐性とみなさず、該当なしの敵も分母から除外しない', () => {
  const rows = [enemy('a', ['凍結']), enemy('b', ['未知耐性', 'stunImmune']), enemy('c')]
  const summary = summarizeEnemyImmunities(rows)
  assert.equal(summary.total, 3)
  assert.deepEqual(summary.items[0], { key: 'frozenImmune', label: '凍結', count: 1, ratio: 1 / 3 })
  assert.ok(summary.items.slice(1).every(({ count }) => count === 0))
  assert.deepEqual(filterEnemiesByImmunity(rows, 'stunImmune'), [])
})

test('従来の武装解除と戦慄を同じ耐性として数え、表示は戦慄に統一する', () => {
  const rows = [enemy('legacy', ['武装解除']), enemy('current', ['戦慄']), enemy('both', ['武装解除', '戦慄']), enemy('none')]
  const original = structuredClone(rows)
  const summary = summarizeEnemyImmunities(rows)
  assert.deepEqual(summary.items[0], { key: 'disarmedCombatImmune', label: '戦慄', count: 3, ratio: 0.75 })
  assert.deepEqual(filterEnemiesByImmunity(rows, 'disarmedCombatImmune'), rows.slice(0, 3))
  assert.deepEqual(rows, original)
})

test('出現回数では各耐性の回数を合計し、耐性なしの敵も含めた出現総数から割合を求める', () => {
  const rows = [enemy('a', ['スタン']), enemy('b', ['沈黙']), enemy('c', ['沈黙']), enemy('none')]
  const counts = spawnCounts({ a: 20, b: 3, c: 2, none: 5, outside: 1000 })
  const types = summarizeEnemyImmunities(rows)
  assert.deepEqual(summarizeEnemyImmunities(rows, 'TYPES', counts), types)
  assert.equal(types.total, 4)
  assert.equal(types.items[0].label, '沈黙')
  assert.equal(types.items[0].count, 2)
  const spawns = summarizeEnemyImmunities(rows, 'SPAWNS', counts)
  assert.equal(spawns.total, 30)
  assert.deepEqual(spawns.items.slice(0, 2), [
    { key: 'stunImmune', label: 'スタン', count: 20, ratio: 20 / 30 },
    { key: 'silenceImmune', label: '沈黙', count: 5, ratio: 5 / 30 },
  ])
  assert.equal(spawns.items.length, 9)
  assert.ok(spawns.items.slice(2).every(({ count, ratio }) => count === 0 && ratio === 0))
})

test('出現回数が未取得・0・未登録の場合も種類数へ代替せず、9種を0件で残す', () => {
  const rows = [enemy('zero', ['スタン']), enemy('missing', ['沈黙'])]
  for (const counts of [null, spawnCounts({ zero: 0, outside: 100 })]) {
    const summary = summarizeEnemyImmunities(rows, 'SPAWNS', counts)
    assert.deepEqual(summary, summarizeEnemyImmunities([]))
  }
  assert.equal(summarizeEnemyImmunities(rows).total, 2)
  const mixed = summarizeEnemyImmunities([...rows, enemy('present', ['睡眠'])], 'SPAWNS', spawnCounts({ zero: 0, present: 7 }))
  assert.equal(mixed.total, 7)
  assert.deepEqual(mixed.items[0], { key: 'sleepImmune', label: '睡眠', count: 7, ratio: 1 })
  assert.ok(mixed.items.slice(1).every(({ count, ratio }) => count === 0 && ratio === 0))
})

test('重複ID・重複耐性を出現回数へ重ねて加算せず、先頭の耐性と重複する各カテゴリを使う', () => {
  const rows = [
    enemy('a', ['スタン', 'スタン', '沈黙', '武装解除', '戦慄']),
    enemy('a', ['睡眠']),
    enemy('b', ['沈黙']),
  ]
  const original = structuredClone(rows)
  const counts = spawnCounts({ a: 6, b: 4 })
  const originalCounts = structuredClone(counts)
  const summary = summarizeEnemyImmunities(rows, 'SPAWNS', counts)
  assert.equal(summary.total, 10)
  assert.deepEqual(summary.items.slice(0, 3).map(({ label, count, ratio }) => [label, count, ratio]), [
    ['沈黙', 10, 1], ['スタン', 6, 0.6], ['戦慄', 6, 0.6],
  ])
  assert.equal(summary.items.find(({ key }) => key === 'sleepImmune')?.count, 0)
  assert.deepEqual(rows, original)
  assert.deepEqual({ ...counts.enemies }, originalCounts.enemies)
})

test('絞り込み後の対象だけを分母にし、選択した集計データの出現回数を使う', () => {
  const rows = [enemy('normal', ['スタン']), { ...enemy('boss', ['沈黙']), levelType: 'BOSS' as const },
    { ...enemy('boss-none'), levelType: 'BOSS' as const }]
  const bosses = rows.filter(({ levelType }) => levelType === 'BOSS')
  const first = spawnCounts({ normal: 100, boss: 6, 'boss-none': 4, outside: 200 })
  const second = spawnCounts({ normal: 20, boss: 2, 'boss-none': 8, outside: 1000 })
  assert.equal(summarizeEnemyImmunities(rows, 'SPAWNS', first).total, 110)
  assert.equal(summarizeEnemyImmunities(rows, 'SPAWNS', second).total, 30)
  for (const [counts, expectedCount] of [[first, 6], [second, 2]] as const) {
    const summary = summarizeEnemyImmunities(bosses, 'SPAWNS', counts)
    assert.equal(summary.total, 10)
    assert.deepEqual(summary.items[0], { key: 'silenceImmune', label: '沈黙', count: expectedCount, ratio: expectedCount / 10 })
    assert.equal(summary.items.find(({ key }) => key === 'stunImmune')?.count, 0)
  }
})
