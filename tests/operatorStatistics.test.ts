import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OPERATOR_RADAR_METRICS,
  OPERATOR_STAT_METRICS,
  buildOperatorRadarProfile,
  buildOperatorMetricObservations,
  buildOperatorMetricSource,
  buildOperatorScatterObservations,
  calculateOperatorRadarScore,
  calculateOperatorMetricStatistics,
  groupOperatorObservationsByProfession,
  selectOperatorRadarPopulation,
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
  assert.equal(logarithmic.coefficientOfVariation, 0)
  assert.equal(logarithmic.interquartileRange, 0)
  assert.equal(logarithmic.normalizedInterquartileRange, 0)

  assert.equal(linear.histogram?.scale, 'LINEAR')
  assert.equal(linear.bins.reduce((sum, bin) => sum + bin.count, 0), 3)
  assert.equal(linear.standardDeviation, 0)
  assert.equal(linear.coefficientOfVariation, 0)
  assert.equal(linear.interquartileRange, 0)
  assert.equal(linear.normalizedInterquartileRange, 0)
})

test('CVと正規化IQRはステータスの尺度を変えても同じ比率を返す', () => {
  const baseRows = [1, 2, 3, 4].map((maxHp, index) => createOperator({
    operatorId: `base_${index}`,
    maxHp,
  }))
  const scaledRows = [100, 200, 300, 400].map((maxHp, index) => createOperator({
    operatorId: `scaled_${index}`,
    maxHp,
  }))

  const base = calculateOperatorMetricStatistics(baseRows, 'maxHp', 'LINEAR')
  const scaled = calculateOperatorMetricStatistics(scaledRows, 'maxHp', 'LINEAR')

  assert.ok(base.coefficientOfVariation !== null)
  assert.ok(base.normalizedInterquartileRange !== null)
  assert.ok(Math.abs(base.coefficientOfVariation - Math.sqrt(1.25) / 2.5) < 1e-12)
  assert.ok(Math.abs(base.normalizedInterquartileRange - 0.6) < 1e-12)
  assert.equal(base.interquartileRange, 1.5)
  assert.ok(Math.abs(scaled.coefficientOfVariation - base.coefficientOfVariation) < 1e-12)
  assert.ok(Math.abs(scaled.normalizedInterquartileRange - base.normalizedInterquartileRange) < 1e-12)
  assert.equal(scaled.interquartileRange, 150)
})

test('分母が0または負値を含む場合は相対的なばらつきを算出しない', () => {
  const allZero = calculateOperatorMetricStatistics([
    createOperator({ maxHp: 0 }),
    createOperator({ operatorId: 'zero_2', maxHp: 0 }),
  ], 'maxHp', 'LINEAR')
  const zeroMedian = calculateOperatorMetricStatistics([
    createOperator({ maxHp: 0 }),
    createOperator({ operatorId: 'zero_2', maxHp: 0 }),
    createOperator({ operatorId: 'positive', maxHp: 100 }),
  ], 'maxHp', 'LINEAR')
  const includesNegative = calculateOperatorMetricStatistics([
    createOperator({ maxHp: -10 }),
    createOperator({ operatorId: 'positive', maxHp: 30 }),
  ], 'maxHp', 'LINEAR')

  assert.equal(allZero.coefficientOfVariation, null)
  assert.equal(allZero.interquartileRange, 0)
  assert.equal(allZero.normalizedInterquartileRange, null)

  assert.ok(zeroMedian.coefficientOfVariation !== null)
  assert.equal(zeroMedian.normalizedInterquartileRange, null)

  assert.equal(includesNegative.coefficientOfVariation, null)
  assert.equal(includesNegative.interquartileRange, 20)
  assert.equal(includesNegative.normalizedInterquartileRange, null)
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

test('線形目盛へ任意の階級幅を渡してオペレーター全件を集計する', () => {
  const rows = [0, 10, 20, 21].map((magicResistance, index) => createOperator({
    operatorId: `operator_${index}`,
    magicResistance,
  }))

  const statistics = calculateOperatorMetricStatistics(
    rows,
    'magicResistance',
    'LINEAR',
    10,
  )

  assert.equal(statistics.histogram?.binWidth, 10)
  assert.equal(statistics.histogram?.normalRangeStart, 0)
  assert.equal(statistics.histogram?.normalRangeEnd, 30)
  assert.equal(statistics.histogram?.normalBinCount, 3)
  assert.deepEqual(statistics.bins.map(({ count }) => count), [1, 1, 2])
  assert.equal(statistics.bins.reduce((sum, bin) => sum + bin.count, 0), rows.length)
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

test('レーダーは攻撃速度を除く8指標を定義し、時間・コスト系だけ向きを反転する', () => {
  assert.deepEqual(
    OPERATOR_RADAR_METRICS.map(({ key, direction }) => [key, direction]),
    [
      ['maxHp', 'HIGHER_OUTWARD'],
      ['attack', 'HIGHER_OUTWARD'],
      ['defense', 'HIGHER_OUTWARD'],
      ['magicResistance', 'HIGHER_OUTWARD'],
      ['deploymentCost', 'LOWER_OUTWARD'],
      ['blockCount', 'HIGHER_OUTWARD'],
      ['redeployTime', 'LOWER_OUTWARD'],
      ['attackInterval', 'LOWER_OUTWARD'],
    ],
  )
})

test('レーダーの比較対象を全体・同職業・同職分で切り替える', () => {
  const target = createOperator({
    operatorId: 'target',
    profession: 'GUARD',
    professionLabel: '前衛',
    subProfessionId: 'fighter',
  })
  const rows = [
    target,
    createOperator({ operatorId: 'same_branch', profession: 'GUARD', subProfessionId: 'fighter' }),
    createOperator({ operatorId: 'same_job', profession: 'GUARD', subProfessionId: 'lord' }),
    createOperator({ operatorId: 'other_job', profession: 'SNIPER', subProfessionId: 'fighter' }),
  ]

  assert.deepEqual(
    selectOperatorRadarPopulation(rows, target, 'ALL').map(({ operatorId }) => operatorId),
    ['target', 'same_branch', 'same_job', 'other_job'],
  )
  assert.deepEqual(
    selectOperatorRadarPopulation(rows, target, 'PROFESSION').map(({ operatorId }) => operatorId),
    ['target', 'same_branch', 'same_job'],
  )
  assert.deepEqual(
    selectOperatorRadarPopulation(rows, target, 'SUB_PROFESSION').map(({ operatorId }) => operatorId),
    ['target', 'same_branch'],
  )
})

test('レーダーの相対スコアは中間順位で小集団・同順位・一定値を公平に扱う', () => {
  assertClose(calculateOperatorRadarScore(10, [10, 20, 30]), 100 / 6)
  assert.equal(calculateOperatorRadarScore(20, [10, 20, 30]), 50)
  assertClose(calculateOperatorRadarScore(30, [10, 20, 30]), 500 / 6)
  const tiedMinimum = calculateOperatorRadarScore(10, [10, 10, 20, 30])
  assert.equal(tiedMinimum, 25)
  assert.equal(calculateOperatorRadarScore(10, [10, 10, 10]), 50)
  assert.equal(calculateOperatorRadarScore(10, [10]), 50)
  assert.equal(calculateOperatorRadarScore(10, [10, 20]), 25)
  assert.equal(calculateOperatorRadarScore(20, [10, 20]), 75)
})

test('低いほど外側の指標は順位を反転し、欠損・非有限値を母集団から除外する', () => {
  assertClose(calculateOperatorRadarScore(10, [10, 20, 30], 'LOWER_OUTWARD'), 500 / 6)
  assertClose(calculateOperatorRadarScore(30, [10, 20, 30], 'LOWER_OUTWARD'), 100 / 6)
  assert.equal(calculateOperatorRadarScore(10, [null, Number.NaN, 10, 20], 'LOWER_OUTWARD'), 75)
  assert.equal(calculateOperatorRadarScore(null, [10, 20], 'LOWER_OUTWARD'), null)
  assert.equal(calculateOperatorRadarScore(15, [10, 20], 'HIGHER_OUTWARD'), null)
})

test('レーダープロファイルは指標ごとの有効人数と欠損を保持する', () => {
  const target = createOperator({
    operatorId: 'target',
    maxHp: 2000,
    attack: null,
    deploymentCost: 10,
  })
  const profile = buildOperatorRadarProfile([
    createOperator({ operatorId: 'lower', maxHp: 1000, attack: 300, deploymentCost: 20 }),
    target,
    createOperator({ operatorId: 'higher', maxHp: 3000, attack: Number.NaN, deploymentCost: null }),
  ], target, 'ALL')
  const hp = profile.points.find(({ key }) => key === 'maxHp')
  const attack = profile.points.find(({ key }) => key === 'attack')
  const cost = profile.points.find(({ key }) => key === 'deploymentCost')

  assert.equal(profile.populationCount, 3)
  assert.deepEqual(hp && { value: hp.value, score: hp.score, validCount: hp.validCount }, {
    value: 2000,
    score: 50,
    validCount: 3,
  })
  assert.deepEqual(attack && { value: attack.value, score: attack.score, validCount: attack.validCount }, {
    value: null,
    score: null,
    validCount: 1,
  })
  assert.deepEqual(cost && { value: cost.value, score: cost.score, validCount: cost.validCount }, {
    value: 10,
    score: 75,
    validCount: 2,
  })
})

function assertClose(actual: number | null, expected: number): void {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12)
}

interface OperatorFixture extends Partial<OperatorDatabaseStats> {
  operatorId?: string
  profession?: string
  professionLabel?: string
  subProfessionId?: string
  subProfessionName?: string
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
    subProfessionId: fixture.subProfessionId ?? 'fighter',
    subProfessionName: fixture.subProfessionName ?? '勇士',
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
