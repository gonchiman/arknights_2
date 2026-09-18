import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnemyRecords, cleanGameText, getEnemyStatRating, matchesEnemyFilters } from '../src/lib/enemyData.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'
import { ENEMY_RATING_STATS, getEnemyRatingRanges, type EnemyRatingStat } from '../src/lib/enemyStatRatings.ts'
import {
  formatEnemyNumericCondition,
  matchesEnemyNumericConditions,
  parseEnemyNumericFilterValue,
  type EnemyNumericCondition,
  type EnemyNumericFilterField,
  type EnemyNumericFilterOperator,
} from '../src/lib/enemyNumericFilters.ts'

const handbook = {
  enemyData: {
    enemy_test: {
      enemyId: 'enemy_test',
      enemyIndex: 'T1',
      sortId: 2,
      name: 'テスト敵',
      enemyLevel: 'ELITE',
      description: '説明 <@ba.kw>強調</>\\n続き',
      abilityList: [
        { text: '攻撃時、<$ba.dt.burning>灼熱</>を付与' },
      ],
      damageType: ['MAGIC'],
      hideInHandbook: false,
      isInvalidKilled: false,
    },
    enemy_hidden: {
      enemyId: 'enemy_hidden',
      name: '非表示敵',
      hideInHandbook: true,
    },
  },
}

const database = {
  enemy_test: [
    {
      level: 1,
      enemyData: {
        attributes: {
          maxHp: { m_defined: true, m_value: 9999 },
        },
      },
    },
    {
      level: 0,
      enemyData: {
        applyWay: { m_defined: true, m_value: 'RANGED' },
        lifePointReduce: { m_defined: true, m_value: 2 },
        attributes: {
          maxHp: { m_defined: true, m_value: 5000 },
          atk: { m_defined: true, m_value: 650 },
          def: { m_defined: true, m_value: 400 },
          magicResistance: { m_defined: true, m_value: 30 },
          moveSpeed: { m_defined: true, m_value: 0.8 },
          attackSpeed: { m_defined: true, m_value: 100 },
          baseAttackTime: { m_defined: true, m_value: 2.5 },
          massLevel: { m_defined: true, m_value: 3 },
          stunImmune: { m_defined: true, m_value: true },
          sleepImmune: { m_defined: true, m_value: false },
          silenceImmune: { m_defined: false, m_value: true },
        },
      },
    },
  ],
}

test('図鑑と基礎戦闘データを敵IDで結合する', () => {
  const rows = buildEnemyRecords(handbook, database)

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    id: 'enemy_test',
    index: 'T1',
    sortId: 2,
    name: 'テスト敵',
    levelType: 'ELITE',
    description: '説明 強調 続き',
    abilities: ['攻撃時、灼熱を付与'],
    damageTypes: ['MAGIC'],
    attackWay: 'RANGED',
    lifePointReduce: 2,
    databaseLevel: 0,
    databaseLevelCount: 2,
    stageAppearanceCount: null,
    statusImmunities: ['スタン'],
    ratings: {
      endurance: 'B',
      attack: 'B',
      defense: 'C',
      resistance: 'B+',
    },
    stats: {
      maxHp: 5000,
      attack: 650,
      defense: 400,
      magicResistance: 30,
      moveSpeed: 0.8,
      attackSpeed: 100,
      baseAttackTime: 2.5,
      massLevel: 3,
    },
  })
})

test('Key/Value配列形式の敵データにも対応する', () => {
  const rows = buildEnemyRecords(handbook, {
    enemies: [{ Key: 'enemy_test', Value: database.enemy_test }],
  })

  assert.equal(rows[0]?.stats.maxHp, 5000)
  assert.equal(rows[0]?.databaseLevel, 0)
})

test('生成済みデータから登場ステージ数を結合し、未登場の敵を0として扱う', () => {
  const counted = buildEnemyRecords(handbook, database, {
    schemaVersion: 1,
    enemies: {
      enemy_test: { stageCount: 12, stageIds: ['main_00-01'] },
    },
  })
  const zero = buildEnemyRecords(handbook, database, {
    schemaVersion: 1,
    enemies: {},
  })

  assert.equal(counted[0]?.stageAppearanceCount, 12)
  assert.equal(zero[0]?.stageAppearanceCount, 0)
})

test('名前・説明・内部IDと区分で絞り込める', () => {
  const enemy = buildEnemyRecords(handbook, database)[0]

  assert.equal(matchesEnemyFilters(enemy, { query: 'Ｔ１', levelType: 'ALL' }), true)
  assert.equal(matchesEnemyFilters(enemy, { query: '灼熱', levelType: 'ELITE' }), true)
  assert.equal(matchesEnemyFilters(enemy, { query: 'enemy_test', levelType: 'NORMAL' }), false)
})

test('ゲーム内マークアップと改行を表示用テキストから除去する', () => {
  assert.equal(cleanGameText('<@ba.kw>能力</>\\n  説明'), '能力 説明')
})

test('敵の実数ステータスをゲーム内と同じ段階評価へ変換する', () => {
  assert.equal(getEnemyStatRating('maxHp', 550), 'E')
  assert.equal(getEnemyStatRating('maxHp', 5000), 'B')
  assert.equal(getEnemyStatRating('attack', 3000), 'S+')
  assert.equal(getEnemyStatRating('defense', 1200), 'A+')
  assert.equal(getEnemyStatRating('magicResistance', 0), 'E')
  assert.equal(getEnemyStatRating('magicResistance', 30), 'B+')
  assert.equal(getEnemyStatRating('magicResistance', 91), 'SS')
  assert.equal(getEnemyStatRating('maxHp', null), null)
})

test('4ステータスの全評価境界で小数を丸めず、S+の上端と術耐性0を含めて判定する', () => {
  const ratings = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']
  const boundaries: Record<EnemyRatingStat, readonly number[]> = {
    maxHp: [1000, 3500, 5000, 8000, 12000, 25000, 100000, 250000, 500000],
    attack: [200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000],
    defense: [100, 200, 500, 800, 1000, 1200, 2000, 3000, 5000],
    magicResistance: [0, 10, 20, 30, 50, 60, 70, 80, 90],
  }
  for (const stat of Object.keys(boundaries) as EnemyRatingStat[]) {
    for (const [index, boundary] of boundaries[stat].entries()) {
      const upperInclusive = index === 8 || (stat === 'magicResistance' && index === 0)
      assert.equal(getEnemyStatRating(stat, boundary - 0.25), ratings[index], `${stat}: ${boundary}直前`)
      assert.equal(getEnemyStatRating(stat, boundary), ratings[upperInclusive ? index : index + 1], `${stat}: ${boundary}`)
      assert.equal(getEnemyStatRating(stat, boundary + 0.25), ratings[index + 1], `${stat}: ${boundary}直後`)
    }
    assert.equal(getEnemyStatRating(stat, -Number.MAX_VALUE), 'E')
    assert.equal(getEnemyStatRating(stat, Number.MAX_VALUE), 'SS')
  }
})

test('評価は欠損・非有限値を未取得として扱い、有限の0や負数と区別する', () => {
  for (const stat of ['maxHp', 'attack', 'defense', 'magicResistance'] as const) {
    for (const value of [null, NaN, Infinity, -Infinity]) {
      assert.equal(getEnemyStatRating(stat, value), null, `${stat}: ${value}`)
    }
    assert.equal(getEnemyStatRating(stat, 0), 'E')
    assert.equal(getEnemyStatRating(stat, -0.25), 'E')
  }
  assert.equal(getEnemyStatRating('magicResistance', Number.MIN_VALUE), 'D')
})

test('評価基準表は全4項目のEからSSまで実数値に正しい開区間・閉区間で表示する', () => {
  assert.deepEqual(ENEMY_RATING_STATS, [
    { key: 'maxHp', label: 'HP（耐久）' },
    { key: 'attack', label: '攻撃力' },
    { key: 'defense', label: '防御力' },
    { key: 'magicResistance', label: '術耐性' },
  ])
  const expectedLabels: Record<EnemyRatingStat, readonly string[]> = {
    maxHp: [
      '1,000 未満', '1,000 以上 3,500 未満', '3,500 以上 5,000 未満', '5,000 以上 8,000 未満',
      '8,000 以上 12,000 未満', '12,000 以上 25,000 未満', '25,000 以上 100,000 未満',
      '100,000 以上 250,000 未満', '250,000 以上 500,000 以下', '500,000 超',
    ],
    attack: [
      '200 未満', '200 以上 300 未満', '300 以上 500 未満', '500 以上 700 未満',
      '700 以上 1,000 未満', '1,000 以上 1,500 未満', '1,500 以上 2,000 未満',
      '2,000 以上 3,000 未満', '3,000 以上 5,000 以下', '5,000 超',
    ],
    defense: [
      '100 未満', '100 以上 200 未満', '200 以上 500 未満', '500 以上 800 未満',
      '800 以上 1,000 未満', '1,000 以上 1,200 未満', '1,200 以上 2,000 未満',
      '2,000 以上 3,000 未満', '3,000 以上 5,000 以下', '5,000 超',
    ],
    magicResistance: [
      '0 以下', '0 超 10 未満', '10 以上 20 未満', '20 以上 30 未満',
      '30 以上 50 未満', '50 以上 60 未満', '60 以上 70 未満',
      '70 以上 80 未満', '80 以上 90 以下', '90 超',
    ],
  }
  for (const stat of Object.keys(expectedLabels) as EnemyRatingStat[]) {
    const ranges = getEnemyRatingRanges(stat)
    assert.deepEqual(ranges.map(({ rating }) => rating), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS'])
    assert.deepEqual(ranges.map(({ label }) => label), expectedLabels[stat])
  }
})

test('数値条件は0・小数・負数を受け入れ、空欄・不正な文字列・非有限値を無効にする', () => {
  for (const [input, expected] of [['0', 0], [' 0 ', 0], ['0.8', 0.8], ['.5', 0.5], ['-2.5', -2.5], ['+3', 3], ['1e3', 1000]] as const) {
    assert.equal(parseEnemyNumericFilterValue(input), expected, input)
  }
  for (const input of ['', ' \t　', '.', '+', '-', '1e', '1e309', 'NaN', 'Infinity', '-Infinity', '0x10', '0b10', '0o10', '1,000', '30秒', '1 2']) {
    assert.equal(parseEnemyNumericFilterValue(input), null, input)
  }
})

test('数値条件の5種類の比較を境界値で判定する', () => {
  const enemy = buildEnemyRecords(handbook, database)[0]
  const cases: ReadonlyArray<readonly [EnemyNumericFilterOperator, readonly boolean[]]> = [
    ['eq', [false, true, false]],
    ['gte', [true, true, false]],
    ['lte', [false, true, true]],
    ['gt', [true, false, false]],
    ['lt', [false, false, true]],
  ]
  for (const [operator, expected] of cases) {
    for (const [index, value] of ['29.9', '30', '30.1'].entries()) {
      assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition('magicResistance', operator, value)]), expected[index], `${operator} ${value}`)
    }
  }
})

test('数値条件は表の8項目をそれぞれの実数値で絞り込む', () => {
  const enemy = buildEnemyRecords(handbook, database, { schemaVersion: 1, enemies: { enemy_test: { stageCount: 12 } } })[0]
  const values: ReadonlyArray<readonly [EnemyNumericFilterField, string]> = [
    ['maxHp', '5000'], ['attack', '650'], ['defense', '400'], ['magicResistance', '30'],
    ['moveSpeed', '0.8'], ['baseAttackTime', '2.5'], ['massLevel', '3'], ['stageAppearanceCount', '12'],
  ]
  for (const [field, value] of values) {
    assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition(field, 'eq', value)]), true, field)
    assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition(field, 'eq', String(Number(value) + 1))]), false, field)
  }
})

test('術耐性0は有効な条件とし、欠損・非有限値を0扱いしない', () => {
  const enemy = buildEnemyRecords(handbook, database)[0]
  const zero = numericCondition('magicResistance', 'eq', '0')
  enemy.stats.magicResistance = 0
  assert.equal(matchesEnemyNumericConditions(enemy, [zero]), true)
  for (const missing of [null, NaN, Infinity, -Infinity]) {
    enemy.stats.magicResistance = missing
    assert.equal(matchesEnemyNumericConditions(enemy, [zero]), false)
    assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition('magicResistance', 'lte', '0')]), false)
    assert.equal(matchesEnemyNumericConditions(enemy, []), true)
    assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition('defense', 'eq', '400')]), true)
  }
  enemy.stageAppearanceCount = 0
  assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition('stageAppearanceCount', 'eq', '0')]), true)
  enemy.stageAppearanceCount = null
  assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition('stageAppearanceCount', 'eq', '0')]), false)
})

test('同一項目の範囲や複数項目の数値条件をすべて満たす敵だけを残す', () => {
  const enemy = buildEnemyRecords(handbook, database)[0]
  const range = [numericCondition('magicResistance', 'gte', '30'), numericCondition('magicResistance', 'lte', '50')]
  assert.equal(matchesEnemyNumericConditions(enemy, range), true)
  enemy.stats.magicResistance = 50
  assert.equal(matchesEnemyNumericConditions(enemy, range), true)
  enemy.stats.magicResistance = 50.1
  assert.equal(matchesEnemyNumericConditions(enemy, range), false)
  enemy.stats.magicResistance = 29.9
  assert.equal(matchesEnemyNumericConditions(enemy, range), false)
  enemy.stats.magicResistance = 40
  assert.equal(matchesEnemyNumericConditions(enemy, [...range, numericCondition('defense', 'gte', '400')]), true)
  assert.equal(matchesEnemyNumericConditions(enemy, [...range, numericCondition('defense', 'gt', '400')]), false)
  assert.equal(matchesEnemyNumericConditions(enemy, [numericCondition('maxHp', 'gte', '6000'), numericCondition('maxHp', 'lte', '4000')]), false)
})

test('数値条件は検索・区分で選んだ一覧だけを絞り、統計・グラフの分析対象を変更しない', () => {
  const rows = createNumericFilterRows()
  const originalRows = structuredClone(rows)
  const filters = { query: '灼熱', levelType: 'ELITE' } as const
  const baseRows = rows.filter((enemy) => matchesEnemyFilters(enemy, filters))
  const tableRows = baseRows.filter((enemy) => matchesEnemyNumericConditions(enemy, [numericCondition('magicResistance', 'eq', '0')]))

  assert.deepEqual(baseRows.map((enemy) => enemy.id), ['elite_zero', 'elite_resistant'])
  assert.deepEqual(tableRows.map((enemy) => enemy.id), ['elite_zero'])
  assert.deepEqual(baseRows.map((enemy) => enemy.stats.magicResistance), [0, 30])
  assert.deepEqual(rows, originalRows)
})

test('一覧が0件でも分析対象を残し、数値条件と検索・区分を独立して解除できる', () => {
  const rows = createNumericFilterRows()
  const filters = { query: '灼熱', levelType: 'ELITE' } as const
  const baseRows = rows.filter((enemy) => matchesEnemyFilters(enemy, filters))
  const emptyTableRows = baseRows.filter((enemy) => matchesEnemyNumericConditions(enemy, [numericCondition('magicResistance', 'gte', '100')]))
  assert.equal(emptyTableRows.length, 0)
  assert.deepEqual(baseRows.map((enemy) => enemy.id), ['elite_zero', 'elite_resistant'])

  const localResetRows = baseRows.filter((enemy) => matchesEnemyNumericConditions(enemy, []))
  assert.deepEqual(localResetRows.map((enemy) => enemy.id), ['elite_zero', 'elite_resistant'])

  const zeroResistance = [numericCondition('magicResistance', 'eq', '0')]
  const globallyResetBaseRows = rows.filter((enemy) => matchesEnemyFilters(enemy, { query: '', levelType: 'ALL' }))
  const globallyResetTableRows = globallyResetBaseRows.filter((enemy) => matchesEnemyNumericConditions(enemy, zeroResistance))
  assert.equal(globallyResetBaseRows.length, 4)
  assert.deepEqual(globallyResetTableRows.map((enemy) => enemy.id), ['elite_zero', 'normal_zero', 'unmatched_elite'])
  assert.deepEqual(baseRows.map((enemy) => enemy.id), ['elite_zero', 'elite_resistant'])
})

test('空欄や不正な数値の条件は無視し、有効な条件だけで絞り込む', () => {
  const enemy = buildEnemyRecords(handbook, database)[0]
  enemy.stats.magicResistance = null
  for (const value of ['', ' ', 'abc', '0x0', 'Infinity', '1e999']) {
    const invalid = numericCondition('magicResistance', 'eq', value)
    assert.equal(matchesEnemyNumericConditions(enemy, [invalid]), true, value)
    assert.equal(matchesEnemyNumericConditions(enemy, [invalid, numericCondition('maxHp', 'eq', '5000')]), true, value)
    assert.equal(matchesEnemyNumericConditions(enemy, [invalid, numericCondition('maxHp', 'gt', '5000')]), false, value)
  }
})

test('有効な数値条件を値と単位が分かる短いラベルにする', () => {
  assert.equal(formatEnemyNumericCondition(numericCondition('magicResistance', 'eq', '0')), '術耐性＝0')
  assert.equal(formatEnemyNumericCondition(numericCondition('baseAttackTime', 'gte', '2.5')), '攻撃間隔≥2.5秒')
  assert.equal(formatEnemyNumericCondition(numericCondition('maxHp', 'lte', '10000')), 'HP≤10000')
  assert.equal(formatEnemyNumericCondition(numericCondition('defense', 'gt', '400')), '防御力＞400')
  assert.equal(formatEnemyNumericCondition(numericCondition('moveSpeed', 'lt', '0.8')), '移動速度＜0.8')
  assert.equal(formatEnemyNumericCondition(numericCondition('maxHp', 'eq', '')), null)
  assert.equal(formatEnemyNumericCondition(numericCondition('maxHp', 'eq', 'invalid')), null)
})

function numericCondition(field: EnemyNumericFilterField, operator: EnemyNumericFilterOperator, value: string): EnemyNumericCondition {
  return { id: 1, field, operator, value }
}

function createNumericFilterRows(): EnemyRecord[] {
  const enemy = buildEnemyRecords(handbook, database)[0]
  return [
    { ...enemy, id: 'elite_zero', stats: { ...enemy.stats, magicResistance: 0 } },
    { ...enemy, id: 'elite_resistant', stats: { ...enemy.stats, magicResistance: 30 } },
    { ...enemy, id: 'normal_zero', levelType: 'NORMAL', stats: { ...enemy.stats, magicResistance: 0 } },
    { ...enemy, id: 'unmatched_elite', abilities: [], stats: { ...enemy.stats, magicResistance: 0 } },
  ]
}
