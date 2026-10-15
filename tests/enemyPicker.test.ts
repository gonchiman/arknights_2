import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_ENEMY_PICKER_RANGES, ENEMY_PICKER_BATCH_SIZE, filterEnemyPickerRows,
  getEnemyPickerCombatStats, getEnemyPickerRangeError, matchesEnemyPickerRange,
  sortEnemyPickerRows, type EnemyPickerFilters,
} from '../src/lib/enemyPicker.ts'
import type { EnemyRecord, EnemyStats } from '../src/types/enemy.ts'

type Overrides = Partial<Omit<EnemyRecord, 'stats'>> & { stats?: Partial<EnemyStats> }
function enemy(id: string, overrides: Overrides = {}): EnemyRecord {
  const { stats, ...fields } = overrides
  return {
    id, index: id, sortId: 0, name: id, levelType: 'NORMAL', description: '', abilities: [],
    damageTypes: ['PHYSIC'], attackWay: 'MELEE', lifePointReduce: 1, databaseLevel: 0,
    databaseLevelCount: 1, stageAppearanceCount: 1, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null }, ...fields,
    stats: { maxHp: 1000, attack: 200, defense: 0, magicResistance: 0, moveSpeed: 1,
      attackSpeed: 100, baseAttackTime: 2, massLevel: 1, ...stats },
  }
}
function filters(overrides: Partial<EnemyPickerFilters> = {}): EnemyPickerFilters {
  return { variant: 'combat', levelType: 'ALL', ranges: { ...EMPTY_ENEMY_PICKER_RANGES },
    damageType: 'ALL', query: '', searchOpen: false, ...overrides }
}
const ids = (rows: readonly EnemyRecord[]) => rows.map(row => row.id)

test('戦闘用の間隔は基礎攻撃時間ではなく攻撃速度で補正する', () => {
  const stats = getEnemyPickerCombatStats(enemy('fast', { stats: { baseAttackTime: 3, attackSpeed: 150 } }))
  assert.equal(stats.interval, 2)
  assert.equal(stats.attack, 200)
  assert.equal(stats.damageType, 'PHYSICAL')
})

test('攻撃時間・攻撃速度が欠損、0、負数、非有限なら間隔を計算しない', () => {
  for (const value of [null, 0, -1, Number.NaN, Infinity, -Infinity]) {
    assert.equal(getEnemyPickerCombatStats(enemy('time', { stats: { baseAttackTime: value } })).interval, null)
    assert.equal(getEnemyPickerCombatStats(enemy('speed', { stats: { attackSpeed: value } })).interval, null)
  }
  assert.equal(getEnemyPickerCombatStats(enemy('overflow', { stats: { baseAttackTime: Number.MAX_VALUE, attackSpeed: Number.MIN_VALUE } })).interval, null)
  assert.equal(getEnemyPickerCombatStats(enemy('zero', { stats: { attack: 0 } })).attack, 0)
  for (const value of [null, -1, Number.NaN, Infinity]) assert.equal(getEnemyPickerCombatStats(enemy('attack', { stats: { attack: value } })).attack, null)
})

test('単一のダメージ種別はSurtrモデルと同じ別名を扱う', () => {
  for (const [raw, normalized] of [['PHYSIC', 'PHYSICAL'], ['PHYSICAL', 'PHYSICAL'], ['MAGIC', 'ARTS'], ['ARTS', 'ARTS'], ['TRUE', 'TRUE']] as const) {
    assert.equal(getEnemyPickerCombatStats(enemy(raw, { damageTypes: [raw] })).damageType, normalized)
  }
  assert.equal(getEnemyPickerCombatStats(enemy('duplicate', { damageTypes: ['MAGIC', 'MAGIC'] })).damageType, 'ARTS')
})

test('混合・不明と通常攻撃なしを分け、通常攻撃なしの数値を使用しない', () => {
  for (const damageTypes of [['PHYSIC', 'MAGIC'], ['UNKNOWN'], [], ['PHYSIC', 'PHYSICAL']]) {
    assert.equal(getEnemyPickerCombatStats(enemy('unknown', { damageTypes })).damageType, 'MIXED_UNKNOWN')
  }
  for (const foe of [enemy('none', { damageTypes: ['NONE'] }), enemy('no-attack', { damageTypes: ['NO_ATTACK'] }), enemy('jp-no-damage', { damageTypes: ['NO_DAMAGE'] }), enemy('way', { damageTypes: [], attackWay: 'NONE' })]) {
    assert.deepEqual(getEnemyPickerCombatStats(foe), { attack: null, damageType: 'NO_ATTACK', interval: null })
  }
})

test('数値範囲は両端を含み、0と欠損を区別する', () => {
  assert.equal(matchesEnemyPickerRange(0, '0', '0'), true)
  assert.equal(matchesEnemyPickerRange(10, '10', '20'), true)
  assert.equal(matchesEnemyPickerRange(20, '10', '20'), true)
  assert.equal(matchesEnemyPickerRange(20.01, '10', '20'), false)
  assert.equal(matchesEnemyPickerRange(null, '', ''), true)
  assert.equal(matchesEnemyPickerRange(null, '0', ''), false)
  assert.equal(matchesEnemyPickerRange(Number.NaN, '', '10'), false)
})

test('不正な数値入力・負数・範囲逆転を表示前に検出する', () => {
  assert.equal(getEnemyPickerRangeError('', '', false, '攻撃力'), null)
  assert.equal(getEnemyPickerRangeError(' 1e2 ', '100.5', false, '攻撃力'), null)
  for (const value of ['1e', 'NaN', 'Infinity', '12px', '-0.1']) {
    assert.match(getEnemyPickerRangeError(value, '', false, '攻撃力')!, /0以上/)
    assert.equal(matchesEnemyPickerRange(100, value, ''), false)
  }
  assert.match(getEnemyPickerRangeError('', '', true, '攻撃間隔')!, /0以上/)
  assert.match(getEnemyPickerRangeError('3', '2', false, '攻撃間隔')!, /下限は上限以下/)
  assert.equal(matchesEnemyPickerRange(2, '3', '2'), false)
})

test('攻撃力・補正後の間隔・攻撃種別・区分を組み合わせて絞り込む', () => {
  const rows = [
    enemy('match', { damageTypes: ['MAGIC'], levelType: 'ELITE', stats: { attack: 300, baseAttackTime: 4, attackSpeed: 200 } }),
    enemy('normal', { damageTypes: ['MAGIC'], stats: { attack: 300 } }),
    enemy('physical', { levelType: 'ELITE', stats: { attack: 300 } }),
    enemy('slow', { damageTypes: ['MAGIC'], levelType: 'ELITE', stats: { attack: 300, baseAttackTime: 4 } }),
    enemy('strong', { damageTypes: ['MAGIC'], levelType: 'ELITE', stats: { attack: 301 } }),
  ]
  assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ levelType: 'ELITE', damageType: 'ARTS', ranges: {
    ...EMPTY_ENEMY_PICKER_RANGES, attackMin: '300', attackMax: '300', intervalMin: '2', intervalMax: '2',
  } }))), ['match'])
})

test('通常攻撃なしと混合・不明のフィルターは別々に選択できる', () => {
  const rows = [enemy('none', { damageTypes: ['NONE'] }), enemy('mixed', { damageTypes: ['MAGIC', 'PHYSIC'] }), enemy('unknown', { damageTypes: [] }), enemy('physical')]
  assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ damageType: 'NO_ATTACK' }))), ['none'])
  assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ damageType: 'MIXED_UNKNOWN' }))), ['mixed', 'unknown'])
  assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ damageType: 'NO_ATTACK', ranges: { ...EMPTY_ENEMY_PICKER_RANGES, attackMin: '0' } }))), [])
})

test('敵名・図鑑番号・IDをNFKCで検索し、閉じた検索欄の文字は適用しない', () => {
  const rows = [enemy('enemy_001', { name: 'ＡＢＣ兵', index: 'Ｏ１' }), enemy('other', { name: '術師' })]
  for (const query of [' abc ', 'o1', 'ＥＮＥＭＹ＿００１']) {
    assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ query, searchOpen: true }))), ['enemy_001'])
  }
  assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ query: 'not-present', searchOpen: false }))), ['enemy_001', 'other'])
})

test('GG用は従来のHP・術耐性だけを絞り込み、戦闘用の非表示条件は無視する', () => {
  const rows = [enemy('match', { stats: { maxHp: 2000, magicResistance: 20 } }), enemy('high', { stats: { maxHp: 3000, magicResistance: 20 } }), enemy('missing', { stats: { maxHp: null } })]
  assert.deepEqual(ids(filterEnemyPickerRows(rows, filters({ variant: 'stats', damageType: 'NO_ATTACK', ranges: {
    ...EMPTY_ENEMY_PICKER_RANGES, hpMin: '2000', hpMax: '2000', resistanceMin: '20', resistanceMax: '20', attackMin: '999999',
  } }))), ['match'])
})

test('戦闘用の間隔を補正後の値で並べ、欠損は昇降順とも末尾にする', () => {
  const rows = [
    enemy('missing', { stats: { attackSpeed: null } }),
    enemy('fast', { stats: { baseAttackTime: 3, attackSpeed: 200 } }),
    enemy('slow', { stats: { baseAttackTime: 2, attackSpeed: 50 } }),
    enemy('equal', { stats: { baseAttackTime: 1.5 } }),
    enemy('none', { damageTypes: ['NONE'] }),
  ]
  assert.deepEqual(ids(sortEnemyPickerRows(rows, { key: 'interval', direction: 'asc' }, 'combat')), ['fast', 'equal', 'slow', 'missing', 'none'])
  assert.deepEqual(ids(sortEnemyPickerRows(rows, { key: 'interval', direction: 'desc' }, 'combat')), ['slow', 'fast', 'equal', 'missing', 'none'])
})

test('登場ステージ数の降順で全件を並べてから20体ずつ表示できる', () => {
  const rows = Object.freeze(Array.from({ length: 22 }, (_, index) => enemy(String(index), { stageAppearanceCount: index })))
  const sorted = sortEnemyPickerRows(rows, { key: 'stages', direction: 'desc' }, 'combat')
  assert.equal(ENEMY_PICKER_BATCH_SIZE, 20)
  assert.equal(sorted.slice(0, ENEMY_PICKER_BATCH_SIZE).length, 20)
  assert.equal(sorted[0].id, '21')
  assert.deepEqual(ids(sorted.slice(ENEMY_PICKER_BATCH_SIZE)), ['1', '0'])
  assert.equal(rows[0].id, '0')
  assert.strictEqual(sorted[0], rows[21])
})

test('GGのHP・術耐性とステージ数は元の並べ替えを維持する', () => {
  const rows = [enemy('missing', { stageAppearanceCount: null, stats: { maxHp: null } }), enemy('b', { stageAppearanceCount: 10, stats: { maxHp: 500, magicResistance: 50 } }), enemy('a', { stageAppearanceCount: 2, stats: { maxHp: 100, magicResistance: 0 } })]
  assert.deepEqual(ids(sortEnemyPickerRows(rows, { key: 'hp', direction: 'asc' }, 'stats')), ['a', 'b', 'missing'])
  assert.deepEqual(ids(sortEnemyPickerRows(rows, { key: 'resistance', direction: 'desc' }, 'stats')), ['b', 'missing', 'a'])
  assert.deepEqual(ids(sortEnemyPickerRows(rows, { key: 'stages', direction: 'desc' }, 'stats')), ['b', 'a', 'missing'])
})
