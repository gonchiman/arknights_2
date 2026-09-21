import test from 'node:test'
import assert from 'node:assert/strict'
import type { EnemyRecord } from '../src/types/enemy.ts'
import {
  buildEnemyComparisonDistribution,
  createEnemyComparisonConditions,
  formatEnemyComparisonCondition,
  getEnemyComparisonValue,
  type EnemyComparisonCondition,
} from '../src/lib/enemyDistributionComparison.ts'
import { calculateNumericStatistics, validateCustomLinearBinWidth, type HistogramBin } from '../src/lib/enemyStatistics.ts'

const options = { scale: 'LINEAR', preferredBinCount: 10, minimumLinearBinWidth: 1 } as const

function enemy(id: string, value: number | null, levelType: EnemyRecord['levelType'] = 'NORMAL'): EnemyRecord {
  return {
    id, index: id, sortId: 0, name: id, levelType, description: '', abilities: [], damageTypes: [],
    attackWay: null, lifePointReduce: null, databaseLevel: 0, databaseLevelCount: 1,
    stageAppearanceCount: value, statusImmunities: [],
    ratings: { endurance: null, attack: null, defense: null, resistance: null },
    stats: {
      maxHp: value, attack: value, defense: value, magicResistance: value, moveSpeed: value,
      attackSpeed: value, baseAttackTime: value, massLevel: value,
    },
  }
}

function all(id = 1): EnemyComparisonCondition {
  return { id, colorIndex: id - 1, filters: { query: '', levelType: 'ALL' }, numericConditions: [], visible: true }
}

function ranges(bins: HistogramBin[]) {
  return bins.map(({ count: _count, ...range }) => range)
}

test('初期条件は通常敵とエリート敵で、別々の呼び出しに編集状態を共有しない', () => {
  const conditions = createEnemyComparisonConditions()
  assert.deepEqual(conditions.map(({ id, colorIndex, filters, visible }) => ({ id, colorIndex, filters, visible })), [
    { id: 1, colorIndex: 0, filters: { query: '', levelType: 'NORMAL' }, visible: true },
    { id: 2, colorIndex: 1, filters: { query: '', levelType: 'ELITE' }, visible: true },
  ])
  conditions[0].filters.query = '編集'
  assert.equal(createEnemyComparisonConditions()[0].filters.query, '')
})

test('共通の階級境界を使用し、空の階級と上限を超える敵を系列別に保持する', () => {
  const rows = [
    enemy('normal-0', 0), enemy('normal-10', 10), enemy('normal-20', 20), enemy('normal-21', 21),
    enemy('elite-5', 5, 'ELITE'), enemy('elite-100', 100, 'ELITE'),
  ]
  const result = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', {
    ...options, customLinearBinWidth: 10, customLinearUpperBound: 20,
  })
  assert.deepEqual(result.series.map((series) => series.bins.map((bin) => bin.count)), [[1, 2, 1], [1, 0, 1]])
  assert.deepEqual(result.series.map((series) => ranges(series.bins)), [ranges(result.bins), ranges(result.bins)])
  assert.deepEqual(result.series.map((series) => series.overflowCount), [1, 1])
  assert.deepEqual(result.bins.map((bin) => bin.count), [2, 2, 2])
  assert.equal(result.minimum, 0)
  assert.equal(result.maximum, 20)
  assert.equal(result.unionCount, 6)
})

test('割合は各系列の有限値数を分母にし、上限超を含め、欠損を除く', () => {
  const rows = [
    enemy('normal-0', 0), enemy('normal-100', 100), enemy('normal-missing', null), enemy('normal-nan', NaN),
    enemy('elite-0', 0, 'ELITE'), enemy('elite-infinity', Infinity, 'ELITE'),
  ]
  const result = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', {
    ...options, customLinearBinWidth: 10, customLinearUpperBound: 20,
  })
  assert.deepEqual(result.series.map(({ matchedCount, count, missingCount }) => ({ matchedCount, count, missingCount })), [
    { matchedCount: 4, count: 2, missingCount: 2 }, { matchedCount: 2, count: 1, missingCount: 1 },
  ])
  assert.deepEqual(result.series.map((series) => getEnemyComparisonValue(series.bins[0].count, series.count, 'PERCENT')), [50, 100])
  assert.equal(getEnemyComparisonValue(result.series[0].overflowCount, result.series[0].count, 'PERCENT'), 50)
  assert.equal(getEnemyComparisonValue(1, 2, 'COUNT'), 1)
  assert.equal(getEnemyComparisonValue(0, 0, 'PERCENT'), 0)
})

test('重複する条件は独立に数え、共通階級の自動計算では同じ敵を一度だけ数える', () => {
  const rows = [
    ...Array.from({ length: 100 }, (_, index) => enemy(`normal-${index}`, index)),
    ...Array.from({ length: 4 }, (_, index) => enemy(`elite-${index}`, 10_000, 'ELITE')),
  ]
  const conditions = [all(), createEnemyComparisonConditions()[1]]
  const result = buildEnemyComparisonDistribution(rows, conditions, 'maxHp', options)
  const expected = calculateNumericStatistics(rows.map((row) => row.stats.maxHp), 10, 'LINEAR', 1)
  assert.deepEqual(result.bins, expected.bins)
  assert.deepEqual(result.histogram, expected.histogram)
  assert.equal(result.histogram?.normalRangeEnd, 100)
  assert.equal(result.unionCount, 104)
  assert.deepEqual(result.series.map((series) => series.count), [104, 4])
  assert.deepEqual(result.series.map((series) => series.overflowCount), [4, 4])
})

test('凡例で系列を非表示にしても、自動階級と他系列の度数は変わらない', () => {
  const rows = [enemy('normal', 10), enemy('elite', 1_000, 'ELITE')]
  const conditions = createEnemyComparisonConditions()
  const shown = buildEnemyComparisonDistribution(rows, conditions, 'maxHp', options)
  const hidden = buildEnemyComparisonDistribution(rows, conditions.map((condition) => ({ ...condition, visible: false })), 'maxHp', options)
  assert.deepEqual(hidden.bins, shown.bins)
  assert.deepEqual(hidden.histogram, shown.histogram)
  assert.deepEqual(hidden.series.map((series) => series.bins), shown.series.map((series) => series.bins))
  assert.equal(hidden.unionCount, 2)
})

test('区分・名前・複数の数値条件を各系列だけに適用し、元データと条件を変更しない', () => {
  const rows = [enemy('兵士A', 0), enemy('兵士B', 50), enemy('兵士C', 50, 'ELITE'), enemy('別名', 50)]
  const conditions: EnemyComparisonCondition[] = [
    { ...all(), filters: { query: '兵士', levelType: 'NORMAL' }, numericConditions: [
      { id: 1, field: 'magicResistance', operator: 'eq', value: '0' },
    ] },
    { ...all(2), filters: { query: '兵士', levelType: 'ALL' }, numericConditions: [
      { id: 1, field: 'magicResistance', operator: 'gte', value: '50' },
      { id: 2, field: 'maxHp', operator: 'lte', value: '50' },
    ] },
  ]
  const original = structuredClone({ rows, conditions })
  const result = buildEnemyComparisonDistribution(rows, conditions, 'maxHp', options)
  assert.deepEqual(result.series.map((series) => series.count), [1, 2])
  assert.equal(result.unionCount, 3)
  assert.deepEqual({ rows, conditions }, original)
  assert.equal(formatEnemyComparisonCondition(conditions[0]), '通常敵 · 検索「兵士」 · 術耐性＝0')
  assert.equal(formatEnemyComparisonCondition({ ...all(), numericConditions: [{ id: 1, field: 'maxHp', operator: 'eq', value: '' }] }), '全敵')
  assert.equal(formatEnemyComparisonCondition({ ...all(), filters: { query: '', levelType: 'UNKNOWN' } }), '未分類')
})

test('同値だけの系列・0・一致なしでも全系列は同じ区間を持つ', () => {
  for (const value of [0, 30]) {
    for (const scale of ['LINEAR', 'LOG'] as const) {
      const result = buildEnemyComparisonDistribution([enemy('one', value), enemy('two', value)], createEnemyComparisonConditions(), 'maxHp', { ...options, scale })
      assert.deepEqual(ranges(result.series[0].bins), ranges(result.series[1].bins))
      assert.equal(result.series[0].bins.reduce((total, bin) => total + bin.count, 0), 2)
      assert.ok(result.series[1].bins.every((bin) => bin.count === 0))
      assert.equal(result.series[1].count, 0)
      assert.ok(Number.isFinite(result.minimum) && Number.isFinite(result.maximum))
    }
  }
})

test('データなし・全欠損でも固定した幅と上限を保持する', () => {
  for (const rows of [[], [enemy('missing', null), enemy('invalid', NaN, 'ELITE')]]) {
    const automatic = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', options)
    assert.deepEqual(automatic.bins, [])
    assert.equal(automatic.histogram, null)
    assert.equal(automatic.minimum, 0)
    assert.equal(automatic.maximum, 1)
    assert.equal(automatic.observedMaximum, null)
    const fixed = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', { ...options, customLinearBinWidth: 5, customLinearUpperBound: 20 })
    assert.equal(fixed.histogram?.normalBinCount, 4)
    assert.equal(fixed.maximum, 20)
    assert.equal(fixed.series.length, 2)
    assert.ok(fixed.series.every((series) => series.count === 0 && series.bins.length === 5 && series.bins.every((bin) => bin.count === 0)))
  }
  assert.deepEqual(buildEnemyComparisonDistribution([enemy('ignored', 1)], [], 'maxHp', options).series, [])
})

test('幅だけ手動指定するときは自動区間の上端と実測最大値を区別して階級数を検証できる', () => {
  const rows = [enemy('normal', 95)]
  const automatic = buildEnemyComparisonDistribution(rows, [all()], 'maxHp', options)
  const manual = buildEnemyComparisonDistribution(rows, [all()], 'maxHp', { ...options, customLinearBinWidth: 0.49 })

  assert.equal(automatic.maximum, 100)
  assert.equal(automatic.observedMaximum, 95)
  assert.equal(automatic.histogram?.hasOverflow, false)
  assert.deepEqual(validateCustomLinearBinWidth(0.49, automatic.observedMaximum), { valid: true, binCount: 194, error: null })
  assert.equal(manual.histogram?.normalBinCount, 194)
  assert.equal(manual.maximum, 95.06)
  assert.equal(manual.observedMaximum, 95)

  const fixed = buildEnemyComparisonDistribution(rows, [all()], 'maxHp', { ...options, customLinearBinWidth: 5, customLinearUpperBound: 20 })
  assert.equal(fixed.maximum, 20)
  assert.equal(fixed.observedMaximum, 95)
  assert.equal(fixed.series[0].overflowCount, 1)
})

test('対数階級は和集合の共通区間を使い、すべての値を一度ずつ数える', () => {
  const values = [0, Math.expm1(1), Math.expm1(2), Math.expm1(3), 100, 1_000, 10_000]
  const rows = values.map((value, index) => enemy(String(index), value, index % 2 ? 'ELITE' : 'NORMAL'))
  const result = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', { ...options, preferredBinCount: 7, scale: 'LOG', customLinearBinWidth: 5, customLinearUpperBound: 20 })
  const expected = calculateNumericStatistics(values, 7, 'LOG', 1)
  assert.deepEqual(result.bins, expected.bins)
  assert.equal(result.histogram?.scale, 'LOG')
  assert.equal(result.histogram?.hasOverflow, false)
  for (const [index, bin] of result.bins.entries()) {
    assert.equal(result.series.reduce((total, series) => total + series.bins[index].count, 0), bin.count)
  }
  assert.deepEqual(result.series.map((series) => series.count), [4, 3])
})

test('小数境界の値とわずかな上限超を既存のヒストグラムと同じ規則で分離する', () => {
  const values = [0, 0.1, 0.2, 0.3, 0.30000000000000004, 1]
  const rows = values.map((value, index) => enemy(String(index), value, index % 2 ? 'ELITE' : 'NORMAL'))
  const result = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', {
    ...options, minimumLinearBinWidth: 0.01, customLinearBinWidth: 0.1, customLinearUpperBound: 0.3,
  })
  assert.deepEqual(result.bins.map((bin) => bin.count), [1, 1, 2, 2])
  assert.deepEqual(result.series.map((series) => series.bins.map((bin) => bin.count)), [[1, 0, 1, 1], [0, 1, 1, 1]])
  assert.equal(result.maximum, 0.3)
})

test('自動上限と手動幅の小数境界も保持し、同じ値の別敵をすべて数える', () => {
  const values = [...Array.from({ length: 100 }, (_, index) => index / 100), 1, 1.000001, 100]
  const rows = values.map((value, index) => enemy(String(index), value, index % 2 ? 'ELITE' : 'NORMAL'))
  const result = buildEnemyComparisonDistribution(rows, createEnemyComparisonConditions(), 'maxHp', {
    ...options, minimumLinearBinWidth: 0.01, customLinearBinWidth: 0.3,
  })
  assert.deepEqual(result.bins.map((bin) => bin.count), [30, 30, 30, 11, 2])
  for (const [index, bin] of result.bins.entries()) {
    assert.equal(result.series.reduce((total, series) => total + series.bins[index].count, 0), bin.count)
  }
  const same = buildEnemyComparisonDistribution([enemy('one', 30), enemy('two', 30), enemy('one', 30)], [all()], 'maxHp', options)
  assert.equal(same.unionCount, 2)
  assert.equal(same.series[0].count, 2)
})

test('登場ステージ数は stats 外の値を使用し、0と欠損を区別する', () => {
  const zero = enemy('zero', 999)
  zero.stageAppearanceCount = 0
  const missing = enemy('missing', 999)
  missing.stageAppearanceCount = null
  const result = buildEnemyComparisonDistribution([zero, missing], [all()], 'stageAppearanceCount', options)
  assert.equal(result.series[0].matchedCount, 2)
  assert.equal(result.series[0].count, 1)
  assert.equal(result.series[0].missingCount, 1)
  assert.equal(result.series[0].bins[0].count, 1)
})
