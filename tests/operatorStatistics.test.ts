import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OPERATOR_STAT_METRICS,
  buildOperatorMetricObservations,
  buildOperatorMetricSource,
  buildOperatorScatterObservations,
  calculateOperatorMetricStatistics,
  groupOperatorObservationsByProfession,
} from '../src/lib/operatorStatistics.ts'
import {
  EMPTY_OPERATOR_DATABASE_FILTERS,
  filterOperatorDatabaseRecords,
  type OperatorDatabaseRecord,
  type OperatorDatabaseStats,
} from '../src/lib/operatorDatabase.ts'

test('詳細画面と同じ9指標を分析対象として定義する', () => {
  assert.deepEqual(
    OPERATOR_STAT_METRICS.map(({ key }) => key),
    [
      'maxHp',
      'attack',
      'defense',
      'magicResistance',
      'deploymentCost',
      'blockCount',
      'redeployTime',
      'attackSpeed',
      'attackInterval',
    ],
  )
  assert.deepEqual(
    OPERATOR_STAT_METRICS.map(({ defaultScale }) => defaultScale),
    ['LOG', 'LOG', 'LOG', 'LINEAR', 'LINEAR', 'LINEAR', 'LINEAR', 'LINEAR', 'LINEAR'],
  )
  assert.deepEqual(
    OPERATOR_STAT_METRICS.map(({
      key,
      suffix,
      valueDigits,
      summaryDigits,
      minimumLinearBinWidth,
    }) => ({ key, suffix, valueDigits, summaryDigits, minimumLinearBinWidth })),
    [
      { key: 'maxHp', suffix: '', valueDigits: 0, summaryDigits: 1, minimumLinearBinWidth: 1 },
      { key: 'attack', suffix: '', valueDigits: 0, summaryDigits: 1, minimumLinearBinWidth: 1 },
      { key: 'defense', suffix: '', valueDigits: 0, summaryDigits: 1, minimumLinearBinWidth: 1 },
      { key: 'magicResistance', suffix: '', valueDigits: 0, summaryDigits: 1, minimumLinearBinWidth: 1 },
      { key: 'deploymentCost', suffix: '', valueDigits: 0, summaryDigits: 2, minimumLinearBinWidth: 1 },
      { key: 'blockCount', suffix: '', valueDigits: 0, summaryDigits: 2, minimumLinearBinWidth: 1 },
      { key: 'redeployTime', suffix: '秒', valueDigits: 0, summaryDigits: 2, minimumLinearBinWidth: 1 },
      { key: 'attackSpeed', suffix: '', valueDigits: 0, summaryDigits: 2, minimumLinearBinWidth: 1 },
      { key: 'attackInterval', suffix: '秒', valueDigits: 2, summaryDigits: 2, minimumLinearBinWidth: 0.01 },
    ],
  )
})

test('フィルタ後のオペレーター全体を母集団とし、欠損値と非有限値を観測から除外する', () => {
  const rows = [
    createOperator({ operatorId: 'sniper_valid', profession: 'SNIPER', professionLabel: '狙撃', maxHp: 1000 }),
    createOperator({ operatorId: 'sniper_missing', profession: 'SNIPER', professionLabel: '狙撃', maxHp: null }),
    createOperator({ operatorId: 'sniper_nan', profession: 'SNIPER', professionLabel: '狙撃', maxHp: Number.NaN }),
    createOperator({ operatorId: 'caster', profession: 'CASTER', professionLabel: '術師', maxHp: 5000 }),
  ]
  const filteredRows = filterOperatorDatabaseRecords(rows, {
    ...EMPTY_OPERATOR_DATABASE_FILTERS,
    profession: 'SNIPER',
  })

  const statistics = calculateOperatorMetricStatistics(filteredRows, 'maxHp', 'LOG')
  const observations = buildOperatorMetricObservations(filteredRows, 'maxHp')

  assert.equal(statistics.totalCount, 3)
  assert.equal(statistics.count, 1)
  assert.equal(statistics.missingCount, 2)
  assert.equal(statistics.minimum, 1000)
  assert.equal(statistics.maximum, 1000)
  assert.deepEqual(observations.map(({ operator, value }) => [operator.operatorId, value]), [
    ['sniper_valid', 1000],
  ])
})

test('9指標を指定した順序のまま統計入力へ取り出す', () => {
  const rows = [
    createOperator({
      maxHp: 1000,
      attack: 300,
      defense: 200,
      magicResistance: 0,
      deploymentCost: 10,
      blockCount: 1,
      redeployTime: 70,
      attackSpeed: 100,
      attackInterval: 1.2,
    }),
    createOperator({
      operatorId: 'second',
      maxHp: 2000,
      attack: 500,
      defense: 400,
      magicResistance: 20,
      deploymentCost: 20,
      blockCount: 3,
      redeployTime: 80,
      attackSpeed: 110,
      attackInterval: 2.5,
    }),
  ]

  assert.deepEqual(buildOperatorMetricSource(rows, 'maxHp'), [1000, 2000])
  assert.deepEqual(buildOperatorMetricSource(rows, 'attack'), [300, 500])
  assert.deepEqual(buildOperatorMetricSource(rows, 'defense'), [200, 400])
  assert.deepEqual(buildOperatorMetricSource(rows, 'magicResistance'), [0, 20])
  assert.deepEqual(buildOperatorMetricSource(rows, 'deploymentCost'), [10, 20])
  assert.deepEqual(buildOperatorMetricSource(rows, 'blockCount'), [1, 3])
  assert.deepEqual(buildOperatorMetricSource(rows, 'redeployTime'), [70, 80])
  assert.deepEqual(buildOperatorMetricSource(rows, 'attackSpeed'), [100, 110])
  assert.deepEqual(buildOperatorMetricSource(rows, 'attackInterval'), [1.2, 2.5])
  assert.deepEqual(
    buildOperatorMetricObservations(rows, 'attackInterval').map(({ operator, value }) => [
      operator.operatorId,
      value,
    ]),
    [['operator', 1.2], ['second', 2.5]],
  )
})

test('一定値だけの母集団でも線形・対数目盛の統計を返す', () => {
  const rows = [
    createOperator({ maxHp: 1800, magicResistance: 10 }),
    createOperator({ operatorId: 'second', maxHp: 1800, magicResistance: 10 }),
    createOperator({ operatorId: 'third', maxHp: 1800, magicResistance: 10 }),
  ]

  const logarithmic = calculateOperatorMetricStatistics(rows, 'maxHp', 'LOG')
  const linear = calculateOperatorMetricStatistics(rows, 'magicResistance', 'LINEAR')

  assert.equal(logarithmic.histogram?.scale, 'LOG')
  assert.equal(logarithmic.bins.length, 1)
  assert.equal(logarithmic.bins[0].count, 3)
  assert.equal(logarithmic.standardDeviation, 0)

  assert.equal(linear.histogram?.scale, 'LINEAR')
  assert.equal(linear.bins.reduce((sum, bin) => sum + bin.count, 0), 3)
  assert.equal(linear.standardDeviation, 0)
})

test('対数目盛で0を含む広い分布を全件いずれかの階級へ含める', () => {
  const rows = [0, 10, 100, 1000, 10000].map((maxHp, index) => createOperator({
    operatorId: `operator_${index}`,
    maxHp,
  }))

  const statistics = calculateOperatorMetricStatistics(rows, 'maxHp', 'LOG')

  assert.equal(statistics.histogram?.scale, 'LOG')
  assert.equal(statistics.bins.reduce((sum, bin) => sum + bin.count, 0), rows.length)
  assert.equal(statistics.minimum, 0)
  assert.equal(statistics.maximum, 10000)
})

test('散布図は両方の指標が有限値のオペレーターだけを使う', () => {
  const rows = [
    createOperator({ operatorId: 'complete', attack: 400, defense: 250 }),
    createOperator({ operatorId: 'missing_y', attack: 500, defense: null }),
    createOperator({ operatorId: 'missing_x', attack: null, defense: 300 }),
    createOperator({ operatorId: 'infinite', attack: Number.POSITIVE_INFINITY, defense: 400 }),
  ]

  const observations = buildOperatorScatterObservations(rows, 'attack', 'defense')

  assert.deepEqual(observations.map(({ operator, x, y }) => [operator.operatorId, x, y]), [
    ['complete', 400, 250],
  ])
})

test('個体観測を職業ごとの表示グループへまとめる', () => {
  const observations = buildOperatorMetricObservations([
    createOperator({ operatorId: 'sniper_1', profession: 'SNIPER', professionLabel: '狙撃', attack: 300 }),
    createOperator({ operatorId: 'caster', profession: 'CASTER', professionLabel: '術師', attack: 500 }),
    createOperator({ operatorId: 'sniper_2', profession: 'SNIPER', professionLabel: '狙撃', attack: 350 }),
    createOperator({ operatorId: 'unknown_z', profession: 'UNKNOWN_Z', professionLabel: '未分類Z', attack: 200 }),
    createOperator({ operatorId: 'vanguard', profession: 'PIONEER', professionLabel: '先鋒', attack: 250 }),
    createOperator({ operatorId: 'unknown_a', profession: 'UNKNOWN_A', professionLabel: '未分類A', attack: 210 }),
  ], 'attack')

  const groups = groupOperatorObservationsByProfession(observations)

  assert.deepEqual(groups.map(({ key, label, observations: groupRows }) => ({
    key,
    label,
    ids: groupRows.map(({ operator }) => operator.operatorId),
  })), [
    { key: 'PIONEER', label: '先鋒', ids: ['vanguard'] },
    { key: 'SNIPER', label: '狙撃', ids: ['sniper_1', 'sniper_2'] },
    { key: 'CASTER', label: '術師', ids: ['caster'] },
    { key: 'UNKNOWN_A', label: '未分類A', ids: ['unknown_a'] },
    { key: 'UNKNOWN_Z', label: '未分類Z', ids: ['unknown_z'] },
  ])
})

interface OperatorFixture extends Partial<OperatorDatabaseStats> {
  operatorId?: string
  profession?: string
  professionLabel?: string
}

function createOperator(fixture: OperatorFixture = {}): OperatorDatabaseRecord {
  const operatorId = fixture.operatorId ?? 'operator'
  return {
    operatorId,
    name: operatorId,
    nameInitial: 'OTHER',
    rarity: 6,
    profession: fixture.profession ?? 'GUARD',
    professionLabel: fixture.professionLabel ?? '前衛',
    subProfessionId: 'fighter',
    subProfessionName: '勇士',
    stats: {
      maxHp: fixture.maxHp === undefined ? 1000 : fixture.maxHp,
      attack: fixture.attack === undefined ? 300 : fixture.attack,
      defense: fixture.defense === undefined ? 200 : fixture.defense,
      magicResistance: fixture.magicResistance === undefined ? 0 : fixture.magicResistance,
      deploymentCost: fixture.deploymentCost === undefined ? 10 : fixture.deploymentCost,
      blockCount: fixture.blockCount === undefined ? 1 : fixture.blockCount,
      redeployTime: fixture.redeployTime === undefined ? 70 : fixture.redeployTime,
      attackSpeed: fixture.attackSpeed === undefined ? 100 : fixture.attackSpeed,
      attackInterval: fixture.attackInterval === undefined ? 1 : fixture.attackInterval,
    },
    statsCondition: 'テスト条件',
    traitDescription: '',
    potentials: [],
    talents: [],
    skills: [],
    modules: [],
  }
}
