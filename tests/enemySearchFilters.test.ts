import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_ENEMY_SEARCH_FILTERS,
  ENEMY_SEARCH_RATINGS,
  addRecentEnemyId,
  getRecentEnemyRows,
  hasActiveEnemySearchFilters,
  matchesEnemySearchFilters,
  normalizeRecentEnemyIds,
  type EnemySearchFilters,
} from '../src/lib/enemySearchFilters.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'

test('初期条件と空白だけの文字検索は未指定として扱う', () => {
  assert.deepEqual(EMPTY_ENEMY_SEARCH_FILTERS, {
    query: '', levelType: 'ALL', hpRatings: [], resistanceRatings: [],
  })
  assert.equal(hasActiveEnemySearchFilters(EMPTY_ENEMY_SEARCH_FILTERS), false)
  assert.equal(hasActiveEnemySearchFilters(filters({ query: ' \t\n　 ' })), false)
  assert.equal(hasActiveEnemySearchFilters(filters({ query: '　敵　' })), true)
  for (const levelType of ['NORMAL', 'ELITE', 'BOSS', 'UNKNOWN'] as const) {
    assert.equal(hasActiveEnemySearchFilters(filters({ levelType })), true)
  }
  for (const key of ['hpRatings', 'resistanceRatings'] as const) {
    assert.equal(hasActiveEnemySearchFilters(filters({ [key]: ['E'] })), true)
  }
})

test('同じステータスのランクはOR条件、HPと術耐性はAND条件で絞り込む', () => {
  const enemy = createEnemy('enemy_multi_rank')
  enemy.stats.maxHp = 12000
  enemy.stats.magicResistance = 30
  const selected = filters({ hpRatings: ['A', 'A+'], resistanceRatings: ['E', 'B+'] })
  assert.equal(matchesEnemySearchFilters(enemy, selected), true)
  assert.equal(matchesEnemySearchFilters(enemy, filters({ hpRatings: ['A'] })), true)
  assert.equal(matchesEnemySearchFilters(enemy, filters({ resistanceRatings: ['B+'] })), true)
  assert.equal(matchesEnemySearchFilters(enemy, { ...selected, hpRatings: ['B', 'B+'] }), false)
  assert.equal(matchesEnemySearchFilters(enemy, { ...selected, resistanceRatings: ['A', 'A+'] }), false)
  assert.equal(matchesEnemySearchFilters(enemy, { ...selected, hpRatings: [], resistanceRatings: [] }), true)
  assert.equal(matchesEnemySearchFilters(enemy, EMPTY_ENEMY_SEARCH_FILTERS), true)
})

test('各ステータスのランク境界を正確に判定する', () => {
  const enemy = createEnemy('enemy_boundary')
  const hpCases = [
    [0, 'E'], [999, 'E'], [1000, 'D'], [3499, 'D'], [3500, 'C'], [4999, 'C'],
    [5000, 'B'], [7999, 'B'], [8000, 'B+'], [11999, 'B+'], [12000, 'A'], [24999, 'A'],
    [25000, 'A+'], [99999, 'A+'], [100000, 'S'], [249999, 'S'], [250000, 'S+'],
    [500000, 'S+'], [500001, 'SS'],
  ] as const
  const resistanceCases = [
    [0, 'E'], [0.5, 'D'], [9.9, 'D'], [10, 'C'], [19.9, 'C'], [20, 'B'], [29.9, 'B'],
    [30, 'B+'], [49.9, 'B+'], [50, 'A'], [59.9, 'A'], [60, 'A+'], [69.9, 'A+'],
    [70, 'S'], [79.9, 'S'], [80, 'S+'], [90, 'S+'], [90.1, 'SS'], [100, 'SS'],
  ] as const
  for (const [hp, expected] of hpCases) {
    enemy.stats.maxHp = hp
    for (const rating of ENEMY_SEARCH_RATINGS) {
      assert.equal(matchesEnemySearchFilters(enemy, filters({ hpRatings: [rating] })), rating === expected, `HP ${hp}: ${rating}`)
    }
  }
  for (const [resistance, expected] of resistanceCases) {
    enemy.stats.magicResistance = resistance
    for (const rating of ENEMY_SEARCH_RATINGS) {
      assert.equal(matchesEnemySearchFilters(enemy, filters({ resistanceRatings: [rating] })), rating === expected, `術耐性 ${resistance}: ${rating}`)
    }
  }
})

test('区分・文字検索とランクを同時に満たす敵だけに絞り込む', () => {
  const enemy = createEnemy('enemy_special')
  enemy.name = '特殊テスト兵'
  enemy.index = 'T01'
  enemy.levelType = 'ELITE'
  enemy.abilities = ['術耐性を強化する']
  enemy.stats.maxHp = 8000
  enemy.stats.magicResistance = 50
  const ratingFilters = { levelType: 'ELITE', hpRatings: ['B+'], resistanceRatings: ['A'] } as const
  for (const query of ['特殊テスト兵', 'Ｔ０１', '術耐性を強化', 'ＥＮＥＭＹ＿ＳＰＥＣＩＡＬ']) {
    assert.equal(matchesEnemySearchFilters(enemy, filters({ ...ratingFilters, query })), true)
  }
  assert.equal(matchesEnemySearchFilters(enemy, filters({ ...ratingFilters, query: '該当しない名前' })), false)
  assert.equal(matchesEnemySearchFilters(enemy, filters({ ...ratingFilters, levelType: 'BOSS' })), false)
  assert.equal(matchesEnemySearchFilters(enemy, filters({ ...ratingFilters, query: '特殊テスト兵', hpRatings: ['A'] })), false)
})

test('未取得・非有限のステータスは、そのランクを指定したときだけ除外する', () => {
  for (const missing of [null, NaN, Infinity, -Infinity]) {
    const enemy = createEnemy('enemy_unknown_stat')
    enemy.stats.maxHp = missing
    enemy.stats.magicResistance = 30
    assert.equal(matchesEnemySearchFilters(enemy, EMPTY_ENEMY_SEARCH_FILTERS), true)
    assert.equal(matchesEnemySearchFilters(enemy, filters({ resistanceRatings: ['B+'] })), true)
    assert.equal(matchesEnemySearchFilters(enemy, filters({ hpRatings: ['E'] })), false)
    assert.equal(matchesEnemySearchFilters(enemy, filters({ hpRatings: ENEMY_SEARCH_RATINGS })), false)
    enemy.stats.maxHp = 1000
    enemy.stats.magicResistance = missing
    assert.equal(matchesEnemySearchFilters(enemy, filters({ hpRatings: ['D'] })), true)
    assert.equal(matchesEnemySearchFilters(enemy, filters({ resistanceRatings: ['E'] })), false)
    assert.equal(matchesEnemySearchFilters(enemy, filters({ resistanceRatings: ENEMY_SEARCH_RATINGS })), false)
  }
})

test('配列以外の保存履歴は安全に空の履歴へ戻す', () => {
  const hostile = {
    toString() { throw new Error('文字列への変換は不要') },
    [Symbol.iterator]() { throw new Error('配列以外の列挙は不要') },
  }
  for (const value of [undefined, null, false, 123, 'enemy_a', {}, hostile]) {
    assert.deepEqual(normalizeRecentEnemyIds(value), [])
  }
})

test('保存履歴は文字列だけを受け入れ、空白・空文字・重複を除いて6件に制限する', () => {
  const hostile = { toString() { throw new Error('文字列以外を変換しない') } }
  const stored: unknown[] = [
    null, 12, false, hostile, ['enemy_hidden'], Symbol('enemy_symbol'),
    ' enemy_a ', '', '　', 'enemy_a', 'enemy_b', 'enemy_c',
    'enemy_d', 'enemy_e', 'enemy_f', 'enemy_g',
  ]

  assert.deepEqual(normalizeRecentEnemyIds(stored), [
    'enemy_a', 'enemy_b', 'enemy_c', 'enemy_d', 'enemy_e', 'enemy_f',
  ])
})

test('敵を選び直すと先頭へ移動し、元の履歴を変更せず最新6件を保つ', () => {
  let recentIds: string[] = []
  for (const id of ['enemy_a', 'enemy_b', 'enemy_c', 'enemy_d', 'enemy_e', 'enemy_f', 'enemy_g']) {
    recentIds = addRecentEnemyId(recentIds, id)
  }
  assert.deepEqual(recentIds, [
    'enemy_g', 'enemy_f', 'enemy_e', 'enemy_d', 'enemy_c', 'enemy_b',
  ])
  const existing = Object.freeze([...recentIds])
  assert.deepEqual(addRecentEnemyId(existing, 'enemy_d'), [
    'enemy_d', 'enemy_g', 'enemy_f', 'enemy_e', 'enemy_c', 'enemy_b',
  ])
  assert.deepEqual(existing, recentIds)
})

test('履歴は現在の敵データを選択順に復元し、不明なIDと重複を除く', () => {
  const currentA = createEnemy('enemy_a')
  const currentB = createEnemy('enemy_b')
  currentB.name = '更新済みの敵名'
  currentB.stats.maxHp = 12345
  const rows = Object.freeze([currentA, currentB, createEnemy('enemy_c')])
  const recentIds = Object.freeze(['enemy_b', 'unknown', 'enemy_b', 'enemy_a'])

  const recent = getRecentEnemyRows(rows, recentIds)
  assert.deepEqual(recent.map((row) => row.id), ['enemy_b', 'enemy_a'])
  assert.equal(recent[0], currentB)
  assert.equal(recent[1], currentA)
  assert.deepEqual(getRecentEnemyRows([], recentIds), [])
  assert.deepEqual(getRecentEnemyRows(rows, []), [])
})

test('履歴から復元する敵は最新6件までに制限する', () => {
  const rows = Array.from({ length: 8 }, (_, index) => createEnemy(`enemy_${index}`))
  const recentIds = rows.map((row) => row.id).reverse()

  assert.deepEqual(getRecentEnemyRows(rows, recentIds).map((row) => row.id), [
    'enemy_7', 'enemy_6', 'enemy_5', 'enemy_4', 'enemy_3', 'enemy_2',
  ])
})

function filters(overrides: Partial<EnemySearchFilters>): EnemySearchFilters {
  return { ...EMPTY_ENEMY_SEARCH_FILTERS, ...overrides }
}

function createEnemy(id: string): EnemyRecord {
  return {
    id,
    index: id,
    sortId: 0,
    name: 'テスト敵',
    levelType: 'NORMAL',
    description: '',
    abilities: [],
    damageTypes: [],
    attackWay: null,
    lifePointReduce: null,
    databaseLevel: null,
    databaseLevelCount: 0,
    stageAppearanceCount: null,
    statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: {
      maxHp: null,
      attack: null,
      defense: null,
      magicResistance: null,
      moveSpeed: null,
      attackSpeed: null,
      baseAttackTime: null,
      massLevel: null,
    },
  }
}
