import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoldenglowPerformanceDifferenceCurve, buildGoldenglowPerformanceDifferences } from '../src/lib/goldenglowPerformanceDifference.ts'
import { buildGoldenglowPerformanceComparisonTsv } from '../src/lib/goldenglowPerformanceComparison.ts'
import type {
  GoldenglowComparisonBuild,
  GoldenglowPerformanceComparisonColumn,
  GoldenglowPerformanceComparisonValue,
} from '../src/lib/goldenglowPerformanceComparison.ts'

test('表の差分は術耐性キーで直接照合し、列順・逆順の行・育成条件を保ち、不足した点を補間しない', () => {
  const columns = [
    column('target', [row(100, 50), row(20, 900), row(37.5, 12.123456), row(0, 10)], { moduleId: 'mod-y', moduleLevel: 2, potential: 4 }),
    column('base', [row(0, 10), row(37.5, 20.987654), row(100, 25)]),
  ]
  const before = structuredClone(columns)
  const result = buildGoldenglowPerformanceDifferences(columns, 'base')
  assert.deepEqual(columns, before)
  assert.deepEqual(result.map((item) => item.build.id), ['target', 'base'])
  assert.deepEqual(result[0].values.map((value) => value.resistance), [100, 20, 37.5, 0])
  assert.deepEqual(result[1].values.map((value) => value.resistance), [0, 37.5, 100])
  assert.equal(result[0].values[0].expectedTotalDamage, 25)
  assert.deepEqual(result[0].values[1], row(20, null))
  assert.equal(result[0].values[2].expectedTotalDamage, 12.123456 - 20.987654)
  assert.deepEqual(result[0].values[3], row(0, 0))
  for (const value of result[1].values) assert.deepEqual(value, row(value.resistance, 0))
  result.forEach((item, index) => {
    assert.notEqual(item, columns[index])
    assert.notEqual(item.values, columns[index].values)
    assert.equal(item.build, columns[index].build)
    assert.equal(item.skill, columns[index].skill)
    item.values.forEach((value, rowIndex) => assert.notEqual(value, columns[index].values[rowIndex]))
  })
})

test('表の差分は正負が混在する内訳を保持し、相殺した合計0も有効な結果として扱う', () => {
  const base = { resistance: 37, expectedTotalDamage: 100, expectedBodyDamage: 20, expectedDroneNormalDamage: 60, expectedExplosionDamage: 20 }
  const mixed = { resistance: 37, expectedTotalDamage: 112.875, expectedBodyDamage: 15, expectedDroneNormalDamage: 80.25, expectedExplosionDamage: 17.625 }
  const cancelled = { resistance: 37, expectedTotalDamage: 100, expectedBodyDamage: 10, expectedDroneNormalDamage: 70, expectedExplosionDamage: 20 }
  const columns = [column('base', [base]), column('mixed', [mixed]), column('cancelled', [cancelled])]
  const result = buildGoldenglowPerformanceDifferences(columns, 'base')
  assert.deepEqual(result[1].values[0], {
    resistance: 37, expectedTotalDamage: 12.875, expectedBodyDamage: -5,
    expectedDroneNormalDamage: 20.25, expectedExplosionDamage: -2.375,
  })
  assert.deepEqual(result[2].values[0], {
    resistance: 37, expectedTotalDamage: 0, expectedBodyDamage: -10,
    expectedDroneNormalDamage: 10, expectedExplosionDamage: 0,
  })
  for (const item of result) {
    const value = item.values[0]
    assert.equal(value.expectedTotalDamage, value.expectedBodyDamage! + value.expectedDroneNormalDamage! + value.expectedExplosionDamage!)
  }
  const reversed = buildGoldenglowPerformanceDifferences(columns, 'mixed')
  assert.equal(reversed[0].values[0].expectedTotalDamage, -12.875)
  assert.deepEqual(reversed[1].values[0], row(37, 0))
})

test('表の差分は欠測・null・非有限値を0にせず、基準が存在しなければ空配列を返す', () => {
  const partial = { resistance: 37, expectedTotalDamage: null, expectedBodyDamage: 10, expectedDroneNormalDamage: Infinity, expectedExplosionDamage: NaN }
  const columns = [
    column('target', [row(37, 120), row(100, null), row(NaN, 100)]),
    column('base', [partial, row(100, 20), row(NaN, 100)]),
    column('empty', []),
  ]
  const result = buildGoldenglowPerformanceDifferences(columns, 'base')
  assert.deepEqual(result[0].values[0], {
    resistance: 37, expectedTotalDamage: null, expectedBodyDamage: 2,
    expectedDroneNormalDamage: null, expectedExplosionDamage: null,
  })
  assert.deepEqual(result[0].values[1], row(100, null))
  assert.deepEqual(result[0].values[2], row(NaN, null))
  assert.equal(result[1].values[0].expectedTotalDamage, null)
  assert.equal(result[1].values[0].expectedBodyDamage, 0)
  assert.deepEqual(result[2].values, [])
  assert.deepEqual(buildGoldenglowPerformanceDifferences(columns, 'missing'), [])
  assert.deepEqual(buildGoldenglowPerformanceDifferences([], 'base'), [])
  assert.ok(buildGoldenglowPerformanceDifferences(columns, 'empty')[0].values.every((value) => value.expectedTotalDamage === null))
  const negativeZero = buildGoldenglowPerformanceDifferences([
    column('base', [row(0, 0)]), column('target', [row(0, -0)]),
  ], 'base')[1].values[0]
  assert.equal(Object.is(negativeZero.expectedTotalDamage, -0), false)
})

test('既存TSVは差分と基準を示す列名を出力し、小数と整数の表示切替を保つ', () => {
  const columns = [
    column('base', [row(0, 10.25), row(100, 1.75)]),
    column('target', [row(100, 0.5), row(0, 12.875)]),
  ]
  const differences = buildGoldenglowPerformanceDifferences(columns, 'base')
  const exportColumns = differences.map((item) => ({
    label: item.build.id === 'base' ? '未装備（基準・差分0）' : 'MOD Y（基準：未装備との差分）',
    values: item.values,
  }))
  const heading = '敵の術耐性\t未装備（基準・差分0）\tMOD Y（基準：未装備との差分）'
  assert.equal(buildGoldenglowPerformanceComparisonTsv(exportColumns), [
    heading, '0\t0\t=2625/1000', '100\t0\t=-125/100',
  ].join('\r\n'))
  assert.equal(buildGoldenglowPerformanceComparisonTsv(exportColumns, false), [
    heading, '0\t0\t3', '100\t0\t-1',
  ].join('\r\n'))
  assert.equal(differences[1].values[1].expectedTotalDamage, 2.625)
})

test('基準と対象の術耐性無視15・20の両境界を残し、途中の小数耐性も各成分の直接差分に一致する', () => {
  const columns = [
    column('base', [row(0, 1000), row(15, 1000), row(100, 150)]),
    column('target', [row(0, 1200), row(20, 1200), row(100, 240)]),
  ]
  const result = buildGoldenglowPerformanceDifferenceCurve(columns, 'base')
  assert.deepEqual(result[1].values.map((value) => value.resistance), [0, 15, 20, 100])
  assert.deepEqual(result[1].values.map((value) => value.expectedTotalDamage), [200, 200, 250, 90])
  for (const resistance of [0, 14.999, 15, 15.001, 17.5, 20, 20.001, 37.5, 100]) {
    const expected = artsDamage(1200, resistance, 20) - artsDamage(1000, resistance, 15)
    assertComponentsAt(result[1], resistance, expected)
  }
  for (const value of result[0].values) assert.deepEqual(value, row(value.resistance, 0))
})

test('最低保証の95と97.5の境界を含め、基準の最低保証到達後も差分の傾きが正しい', () => {
  const columns = [
    column('base', [row(0, 1000), row(95, 50), row(100, 50)]),
    column('target', [row(0, 1200), row(2.5, 1200), row(97.5, 60), row(100, 60)]),
  ]
  const [base, target] = buildGoldenglowPerformanceDifferenceCurve(columns, 'base')
  assert.deepEqual(target.values.map((value) => value.resistance), [0, 2.5, 95, 97.5, 100])
  for (const resistance of [0, 2.499, 2.5, 2.501, 37.5, 94.999, 95, 95.001, 96, 97.499, 97.5, 97.501, 100]) {
    assertComponentsAt(target, resistance, artsDamage(1200, resistance, 2.5) - artsDamage(1000, resistance, 0))
  }
  for (const value of base.values) assert.deepEqual(value, row(value.resistance, 0))
})

test('基準をIDで選び、負の小数差分と有効な0を丸めず残す', () => {
  const columns = [
    column('weak', [row(0, 1.23456), row(100, 1.23456)]),
    column('strong', [row(0, 2.98765), row(100, 2.98765)]),
    column('same-build-other-id', [row(0, 2.98765), row(100, 2.98765)]),
  ]
  const result = buildGoldenglowPerformanceDifferenceCurve(columns, 'strong')
  assert.deepEqual(result.map((item) => item.build.id), ['weak', 'strong', 'same-build-other-id'])
  assertClose(result[0].values[0].expectedTotalDamage!, -1.75309)
  assert.equal(result[0].values[0].expectedTotalDamage, columns[0].values[0].expectedTotalDamage! - columns[1].values[0].expectedTotalDamage!)
  for (const item of result.slice(1)) for (const value of item.values) {
    assert.deepEqual(value, row(value.resistance, 0))
    assert.equal(Object.is(value.expectedTotalDamage, -0), false)
  }
  const reversed = buildGoldenglowPerformanceDifferenceCurve(columns, 'weak')
  assert.equal(reversed[1].values[0].expectedTotalDamage, -result[0].values[0].expectedTotalDamage!)
  const zeros = buildGoldenglowPerformanceDifferenceCurve([
    column('base', [row(0, 0), row(100, 0)]), column('target', [row(0, 0), row(100, 0)]),
  ], 'base')
  for (const item of zeros) for (const value of item.values) assert.deepEqual(value, row(value.resistance, 0))
})

test('基準または対象の欠損点を飛ばして補間せず、欠損した基準自身も0にしない', () => {
  const complete = column('complete', [row(0, 120), row(20, 110), row(40, 80), row(60, 60), row(100, 30)])
  const missing = column('missing', [row(0, 100), row(40, null), row(100, 20)])
  const result = buildGoldenglowPerformanceDifferenceCurve([complete, missing], 'missing')
  assert.deepEqual(result[0].values.map((value) => value.expectedTotalDamage), [20, null, null, null, 10])
  assert.deepEqual(result[1].values[1], row(40, null))
  const reversed = buildGoldenglowPerformanceDifferenceCurve([complete, missing], 'complete')
  assert.deepEqual(reversed[1].values.map((value) => value.expectedTotalDamage), [-20, null, null, null, -10])
})

test('片方の範囲外には外挿せず、1点だけの基準と空の基準も未計算として扱う', () => {
  const wide = column('wide', [row(0, 100), row(100, 0)])
  const narrow = column('narrow', [row(20, 100), row(80, 40)])
  for (const baseline of ['wide', 'narrow']) {
    const result = buildGoldenglowPerformanceDifferenceCurve([wide, narrow], baseline)
    const other = result.find((item) => item.build.id !== baseline)!
    assert.deepEqual(other.values.map((value) => value.resistance), [0, 20, 80, 100])
    assert.deepEqual(other.values[0], row(0, null))
    assert.deepEqual(other.values.at(-1), row(100, null))
    assert.ok(other.values.slice(1, -1).every((value) => value.expectedTotalDamage !== null))
  }
  const [singleResult] = buildGoldenglowPerformanceDifferenceCurve([wide, column('single', [row(50, 25)])], 'single')
  assert.deepEqual(singleResult.values.map((value) => value.expectedTotalDamage), [null, 25, null])
  const [emptyResult] = buildGoldenglowPerformanceDifferenceCurve([wide, column('empty', [])], 'empty')
  assert.deepEqual(emptyResult.values, [row(0, null), row(100, null)])
})

test('非有限値を差分や補間に流さず、成分の欠損はその成分に保持する', () => {
  const bad = row(50, 80)
  bad.expectedTotalDamage = NaN
  bad.expectedDroneNormalDamage = Infinity
  bad.expectedExplosionDamage = null
  const result = buildGoldenglowPerformanceDifferenceCurve([
    column('target', [row(0, 120), row(25, 100), row(50, 80), row(75, 60), row(100, 40)]),
    column('base', [row(0, 100), bad, row(100, 20)]),
  ], 'base')
  for (const value of result[0].values.filter((value) => value.resistance > 0 && value.resistance < 100)) {
    assert.equal(value.expectedTotalDamage, null)
    assert.equal(value.expectedDroneNormalDamage, null)
    assert.equal(value.expectedExplosionDamage, null)
    assert.ok(Number.isFinite(value.expectedBodyDamage))
  }
})

test('入力の列順・育成条件・値を変更せず、出力の節点だけを昇順に揃える', () => {
  const columns = [
    column('target', [row(100, 240), row(20, 1200), row(0, 1200)], { moduleId: 'mod-y', moduleLevel: 2, potential: 4 }),
    column('base', [row(100, 150), row(0, 1000), row(15, 1000)]),
  ]
  const before = structuredClone(columns)
  const result = buildGoldenglowPerformanceDifferenceCurve(columns, 'base')
  assert.deepEqual(columns, before)
  assert.notEqual(result, columns)
  assert.deepEqual(result.map((item) => item.build.id), ['target', 'base'])
  result.forEach((item, index) => {
    assert.notEqual(item, columns[index])
    assert.notEqual(item.values, columns[index].values)
    assert.equal(item.build, columns[index].build)
    assert.equal(item.skill, columns[index].skill)
  })
  assert.deepEqual(result[0].values.map((value) => value.resistance), [0, 15, 20, 100])
  assert.deepEqual(buildGoldenglowPerformanceDifferenceCurve(columns, 'unknown'), [])
  assert.deepEqual(buildGoldenglowPerformanceDifferenceCurve([], 'base'), [])
})

function column(
  id: string,
  values: GoldenglowPerformanceComparisonValue[],
  build: Partial<GoldenglowComparisonBuild> = {},
): GoldenglowPerformanceComparisonColumn {
  return { build: { id, moduleId: '', moduleLevel: 3, potential: 1, ...build }, skill: null, values }
}

function row(resistance: number, total: number | null): GoldenglowPerformanceComparisonValue {
  return {
    resistance,
    expectedTotalDamage: total,
    expectedBodyDamage: total === null ? null : total / 10,
    expectedDroneNormalDamage: total === null ? null : total * 0.6,
    expectedExplosionDamage: total === null ? null : total * 0.3,
  }
}

function artsDamage(attack: number, resistance: number, ignore: number): number {
  return attack * Math.max(0.05, 1 - Math.max(0, resistance - ignore) / 100)
}

function assertComponentsAt(column: GoldenglowPerformanceComparisonColumn, resistance: number, expected: number): void {
  const lower = column.values.findLast((value) => value.resistance <= resistance)!
  const upper = column.values.find((value) => value.resistance >= resistance)!
  const weight = lower === upper ? 0 : (resistance - lower.resistance) / (upper.resistance - lower.resistance)
  const expectedRow = row(resistance, expected)
  for (const key of ['expectedTotalDamage', 'expectedBodyDamage', 'expectedDroneNormalDamage', 'expectedExplosionDamage'] as const) {
    assertClose(lower[key]! + (upper[key]! - lower[key]!) * weight, expectedRow[key]!)
  }
}

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}
