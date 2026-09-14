import test from 'node:test'
import assert from 'node:assert/strict'
import { sortEnemyRows, type EnemyTableSortKey } from '../src/lib/enemyTableSort.ts'
import type { EnemyRecord, EnemyStats } from '../src/types/enemy.ts'

type EnemyOverrides = Partial<Omit<EnemyRecord, 'stats'>> & { stats?: Partial<EnemyStats> }

function enemy(id: string, overrides: EnemyOverrides = {}): EnemyRecord {
  const { stats, ...fields } = overrides
  return {
    id,
    index: id,
    sortId: 0,
    name: `敵${id}`,
    levelType: 'NORMAL',
    description: '',
    abilities: [],
    damageTypes: [],
    attackWay: null,
    lifePointReduce: null,
    databaseLevel: null,
    databaseLevelCount: 1,
    stageAppearanceCount: null,
    statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    ...fields,
    stats: {
      maxHp: null,
      attack: null,
      defense: null,
      magicResistance: null,
      moveSpeed: null,
      attackSpeed: null,
      baseAttackTime: null,
      massLevel: null,
      ...stats,
    },
  }
}

const ids = (rows: readonly EnemyRecord[]) => rows.map((row) => row.id)

test('数値を文字列順ではなく実数値の昇順・降順に並べる', () => {
  const rows = [enemy('ten', { stats: { attack: 10 } }), enemy('two', { stats: { attack: 2 } }), enemy('hundred', { stats: { attack: 100 } })]
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'attack', direction: 'asc' })), ['two', 'ten', 'hundred'])
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'attack', direction: 'desc' })), ['hundred', 'ten', 'two'])
})

test('0・負数・小数を欠損と区別して並べる', () => {
  const rows = [0, -1.5, 0.25, -0.5, 2].map((value) => enemy(String(value), { stats: { moveSpeed: value } }))
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'speed', direction: 'asc' })), ['-1.5', '-0.5', '0', '0.25', '2'])
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'speed', direction: 'desc' })), ['2', '0.25', '0', '-0.5', '-1.5'])
})

test('null・NaN・正負のInfinityは昇降順とも最後へ送り、欠損同士の入力順を保つ', () => {
  const rows = [
    enemy('null'),
    enemy('ten', { stats: { maxHp: 10 } }),
    enemy('nan', { stats: { maxHp: Number.NaN } }),
    enemy('zero', { stats: { maxHp: 0 } }),
    enemy('infinity', { stats: { maxHp: Number.POSITIVE_INFINITY } }),
    enemy('negative', { stats: { maxHp: -2 } }),
    enemy('negative-infinity', { stats: { maxHp: Number.NEGATIVE_INFINITY } }),
  ]
  const missing = ['null', 'nan', 'infinity', 'negative-infinity']
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'hp', direction: 'asc' })), ['negative', 'zero', 'ten', ...missing])
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'hp', direction: 'desc' })), ['ten', 'zero', 'negative', ...missing])
})

test('同値の敵はsortIdや名前ではなく入力順を保つ', () => {
  const rows = [
    enemy('z', { sortId: 20, stats: { defense: 100 } }),
    enemy('a', { sortId: 1, stats: { defense: 100 } }),
    enemy('middle', { stats: { defense: 50 } }),
    enemy('b', { sortId: 2, stats: { defense: 100 } }),
  ]
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'defense', direction: 'asc' })), ['middle', 'z', 'a', 'b'])
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'defense', direction: 'desc' })), ['z', 'a', 'b', 'middle'])
})

test('名前に含まれる数字を自然順で比較する', () => {
  const rows = [enemy('ten', { name: '敵10' }), enemy('two', { name: '敵2' }), enemy('one', { name: '敵1' })]
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'name', direction: 'asc' })), ['one', 'two', 'ten'])
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'name', direction: 'desc' })), ['ten', 'two', 'one'])
})

test('同名の敵も入力順を保つ', () => {
  const rows = [enemy('z', { name: '兵士' }), enemy('a', { name: '兵士' })]
  for (const direction of ['asc', 'desc'] as const) {
    assert.deepEqual(ids(sortEnemyRows(rows, { key: 'name', direction })), ['z', 'a'])
  }
})

test('区分は通常・エリート・ボス順、未分類は昇降順とも最後にする', () => {
  const rows = [
    enemy('unknown-first', { levelType: 'UNKNOWN' }),
    enemy('boss', { levelType: 'BOSS' }),
    enemy('elite-first', { levelType: 'ELITE' }),
    enemy('normal'),
    enemy('unknown-last', { levelType: 'UNKNOWN' }),
    enemy('elite-last', { levelType: 'ELITE' }),
  ]
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'level', direction: 'asc' })), ['normal', 'elite-first', 'elite-last', 'boss', 'unknown-first', 'unknown-last'])
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'level', direction: 'desc' })), ['boss', 'elite-first', 'elite-last', 'normal', 'unknown-first', 'unknown-last'])
})

test('ゲーム内評価が同じでも基礎ステータスの実数値で比較する', () => {
  const ratings = { endurance: 'SS', attack: 'SS', defense: 'SS', resistance: 'SS' }
  const rows = [
    enemy('higher', { ratings, stats: { maxHp: 2_500_000 } }),
    enemy('lower', { ratings, stats: { maxHp: 600_000 } }),
  ]
  assert.deepEqual(ids(sortEnemyRows(rows, { key: 'hp', direction: 'asc' })), ['lower', 'higher'])
})

const numericColumns: Array<{ key: Exclude<EnemyTableSortKey, 'name' | 'level'>; low: EnemyOverrides; high: EnemyOverrides }> = [
  { key: 'stages', low: { stageAppearanceCount: 2 }, high: { stageAppearanceCount: 10 } },
  { key: 'hp', low: { stats: { maxHp: 2 } }, high: { stats: { maxHp: 10 } } },
  { key: 'attack', low: { stats: { attack: 2 } }, high: { stats: { attack: 10 } } },
  { key: 'defense', low: { stats: { defense: 2 } }, high: { stats: { defense: 10 } } },
  { key: 'resistance', low: { stats: { magicResistance: 2 } }, high: { stats: { magicResistance: 10 } } },
  { key: 'speed', low: { stats: { moveSpeed: 2 } }, high: { stats: { moveSpeed: 10 } } },
  { key: 'interval', low: { stats: { baseAttackTime: 2 } }, high: { stats: { baseAttackTime: 10 } } },
  { key: 'weight', low: { stats: { massLevel: 2 } }, high: { stats: { massLevel: 10 } } },
]

for (const { key, low, high } of numericColumns) {
  test(`${key}列を対応する実数値で並べ、欠損は末尾に置く`, () => {
    const rows = [enemy('missing'), enemy('high', high), enemy('low', low)]
    assert.deepEqual(ids(sortEnemyRows(rows, { key, direction: 'asc' })), ['low', 'high', 'missing'])
    assert.deepEqual(ids(sortEnemyRows(rows, { key, direction: 'desc' })), ['high', 'low', 'missing'])
  })
}

test('元配列と敵レコードを変更せず、同じレコード参照を返す', () => {
  const first = enemy('higher', { stats: { maxHp: 10 } })
  const second = enemy('lower', { stats: { maxHp: 2 } })
  for (const row of [first, second]) {
    Object.freeze(row.stats)
    Object.freeze(row.ratings)
    Object.freeze(row.abilities)
    Object.freeze(row.damageTypes)
    Object.freeze(row.statusImmunities)
    Object.freeze(row)
  }
  const rows = Object.freeze([first, second])
  const before = structuredClone(rows)
  const result = sortEnemyRows(rows, { key: 'hp', direction: 'asc' })
  assert.notStrictEqual(result, rows)
  assert.strictEqual(result[0], second)
  assert.strictEqual(result[1], first)
  assert.deepEqual(rows, before)
})

test('並べ替え未選択なら入力順の新しい配列を返す', () => {
  const rows = Object.freeze([enemy('last'), enemy('first')])
  const result = sortEnemyRows(rows, null)
  assert.notStrictEqual(result, rows)
  assert.deepEqual(result, rows)
  assert.strictEqual(result[0], rows[0])
})

test('101件目も含めた結果全体を並べ替えてから先頭100件を取得できる', () => {
  const rows = Array.from({ length: 101 }, (_, index) => enemy(String(index), { stats: { maxHp: 101 - index } }))
  const result = sortEnemyRows(rows, { key: 'hp', direction: 'asc' })
  const firstPage = result.slice(0, 100)
  assert.equal(result.length, 101)
  assert.equal(firstPage.length, 100)
  assert.equal(firstPage[0].id, '100')
  assert.equal(firstPage.at(-1)?.id, '1')
  assert.equal(result[100].id, '0')
})

test('空配列と1件だけの配列も扱う', () => {
  assert.deepEqual(sortEnemyRows([], { key: 'hp', direction: 'asc' }), [])
  const row = enemy('only')
  assert.deepEqual(sortEnemyRows([row], { key: 'hp', direction: 'desc' }), [row])
})
