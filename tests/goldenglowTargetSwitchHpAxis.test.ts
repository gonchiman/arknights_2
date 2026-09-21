import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getHpChartValueAxis, isValidHpChartYAxisRange,
  type HpChartValueAxis, type HpChartYAxisRange,
} from '../src/lib/goldenglowTargetSwitchHpAxis.ts'

function assertUsableAxis(axis: HpChartValueAxis, values: readonly number[]) {
  assert.ok(Number.isFinite(axis.lowerLimit))
  assert.ok(Number.isFinite(axis.upperLimit))
  assert.ok(Number.isFinite(axis.valueStep) && axis.valueStep > 0)
  assert.ok(Number.isFinite(axis.upperLimit - axis.lowerLimit) && axis.upperLimit > axis.lowerLimit)
  assert.ok(axis.yTicks.length >= 2 && axis.yTicks.length <= 10)
  assert.equal(axis.yTicks[0], axis.lowerLimit)
  const tolerance = Math.max(axis.valueStep * 1e-8,
    Math.max(Math.abs(axis.lowerLimit), Math.abs(axis.upperLimit)) * Number.EPSILON * 2)
  assert.ok(Math.abs(axis.yTicks.at(-1)! - axis.upperLimit) <= tolerance)
  for (let index = 1; index < axis.yTicks.length; index += 1) {
    assert.ok(Number.isFinite(axis.yTicks[index]))
    assert.ok(axis.yTicks[index] > axis.yTicks[index - 1])
    assert.ok(Math.abs(axis.yTicks[index] - axis.yTicks[index - 1] - axis.valueStep) <= tolerance)
  }
  for (const value of values.filter(Number.isFinite)) {
    assert.ok(value >= axis.lowerLimit && value <= axis.upperLimit, `${value} must be inside the axis`)
  }
}

test('通常表示は既存の0始まりと1・2・5の目盛りを維持する', () => {
  assert.deepEqual(getHpChartValueAxis([16_721, 41_052]), {
    lowerLimit: 0, upperLimit: 60_000, valueStep: 20_000, yTicks: [0, 20_000, 40_000, 60_000],
  })
  assert.deepEqual(getHpChartValueAxis([-12, 17]), {
    lowerLimit: -20, upperLimit: 20, valueStep: 10, yTicks: [-20, -10, 0, 10, 20],
  })
  assert.deepEqual(getHpChartValueAxis([-12, -8]), {
    lowerLimit: -15, upperLimit: 0, valueStep: 5, yTicks: [-15, -10, -5, 0],
  })
})

test('自動調整は全系列の値を余白付きで収め、期待する拡大範囲を返す', () => {
  const values = Object.freeze([24_000, 41_052, 16_721, 36_000])
  const axis = getHpChartValueAxis(values, { mode: 'auto', nonNegative: true })
  assert.deepEqual(axis, {
    lowerLimit: 15_000, upperLimit: 45_000, valueStep: 5_000,
    yTicks: [15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000],
  })
  assertUsableAxis(axis, values)
  assert.deepEqual(getHpChartValueAxis([...values].reverse(), { mode: 'auto' }), axis)
})

test('総ダメージの下端余白は0を下回らず、0の値も収める', () => {
  for (const values of [[0, 100], [1, 100], [0.001, 2]]) {
    const axis = getHpChartValueAxis(values, { mode: 'auto', nonNegative: true })
    assert.equal(axis.lowerLimit, 0)
    assertUsableAxis(axis, values)
  }
})

test('差分の負値・正負の混在・小数を自動調整でも切り捨てない', () => {
  for (const values of [[-1_000, -800], [-123, 321], [-0.01, 0.02], [0.000001, 0.000004]]) {
    const axis = getHpChartValueAxis(values, { mode: 'auto' })
    assertUsableAxis(axis, values)
    assert.ok(axis.lowerLimit < Math.min(...values))
    assert.ok(axis.upperLimit > Math.max(...values))
  }
  assert.ok(getHpChartValueAxis([-1_000, -800], { mode: 'auto' }).upperLimit < 0)
})

test('構成比は表示モードや系列の有無にかかわらず0〜100%を維持する', () => {
  for (const mode of ['zero', 'auto', 'manual'] as const) {
    for (const values of [[], [17, 83], [NaN, Infinity]]) {
      assert.deepEqual(getHpChartValueAxis(values, { mode, composition: true, manualRange: { min: 10, max: 50 } }), {
        lowerLimit: 0, upperLimit: 100, valueStep: 25, yTicks: [0, 25, 50, 75, 100],
      })
    }
  }
})

test('空系列・未計算・すべて0は有限で幅のある軸を返す', () => {
  for (const mode of ['zero', 'auto'] as const) {
    for (const values of [[], [NaN, Infinity, -Infinity], [0, 0]]) {
      const axis = getHpChartValueAxis(values, { mode })
      assert.deepEqual(axis, { lowerLimit: 0, upperLimit: 1, valueStep: 1, yTicks: [0, 1] })
      assertUsableAxis(axis, values)
    }
    assert.deepEqual(
      getHpChartValueAxis([16_721, NaN, Infinity, 41_052, -Infinity], { mode }),
      getHpChartValueAxis([16_721, 41_052], { mode }),
    )
  }
})

test('同じ値だけの系列も、ほぼ同値の大きな系列も表示範囲がつぶれない', () => {
  for (const mode of ['zero', 'auto'] as const) {
    for (const values of [[100], [-100, -100], [0.005, 0.005], [1e16, 1e16 + 2]]) {
      assertUsableAxis(getHpChartValueAxis(values, { mode }), values)
    }
  }
})

function assertManualAxis(axis: HpChartValueAxis, range: HpChartYAxisRange) {
  assert.equal(axis.lowerLimit, range.min)
  assert.equal(axis.upperLimit, range.max)
  assert.equal(axis.yTicks[0], range.min)
  assert.equal(axis.yTicks.at(-1), range.max)
  assert.ok(Number.isFinite(axis.valueStep) && axis.valueStep > 0)
  assert.ok(axis.yTicks.length >= 2 && axis.yTicks.length <= 10)
  for (let index = 1; index < axis.yTicks.length; index += 1) {
    assert.ok(Number.isFinite(axis.yTicks[index]))
    assert.ok(axis.yTicks[index] > axis.yTicks[index - 1])
    assert.ok(axis.yTicks[index] <= range.max)
  }
}

test('手動設定は上下限を丸めず、端点と範囲内の読みやすい目盛りを返す', () => {
  const manualRange = Object.freeze({ min: 16_721, max: 41_052 })
  const axis = getHpChartValueAxis([20_000, 40_000], { mode: 'manual', manualRange })
  assert.deepEqual(axis, {
    lowerLimit: 16_721, upperLimit: 41_052, valueStep: 5_000,
    yTicks: [16_721, 20_000, 25_000, 30_000, 35_000, 41_052],
  })
  assertManualAxis(axis, manualRange)
})

test('手動の負値・小数の上下限は総ダメージの0制約にも丸められない', () => {
  const manualRange = { min: -1.3, max: 2.7 }
  const axis = getHpChartValueAxis([0, 1], { mode: 'manual', manualRange, nonNegative: true })
  assert.deepEqual(axis, {
    lowerLimit: -1.3, upperLimit: 2.7, valueStep: 1, yTicks: [-1.3, 0, 1, 2, 2.7],
  })
  assertManualAxis(axis, manualRange)
  const fractionalRange = { min: -0.031, max: -0.002 }
  assertManualAxis(getHpChartValueAxis([], { mode: 'manual', manualRange: fractionalRange }), fractionalRange)
})

test('手動の端点と近すぎる内側の目盛りを省き、十分離れた目盛りは残す', () => {
  for (const manualRange of [{ min: 35_001, max: 38_001 }, { min: 34_999, max: 37_999 }]) {
    const axis = getHpChartValueAxis([], { mode: 'manual', manualRange })
    assertManualAxis(axis, manualRange)
    assert.equal(axis.valueStep, 500)
    assert.deepEqual(axis.yTicks, [manualRange.min, 35_500, 36_000, 36_500, 37_000, 37_500, manualRange.max])
  }
  for (const manualRange of [{ min: 35_000, max: 38_000 }, { min: 34_800, max: 37_800 }, { min: 34_200, max: 37_200 }]) {
    const axis = getHpChartValueAxis([], { mode: 'manual', manualRange })
    assertManualAxis(axis, manualRange)
    const interiorTicks = axis.yTicks.slice(1, -1)
    assert.equal(interiorTicks[0], Math.floor(manualRange.min / 500) * 500 + 500)
    assert.equal(interiorTicks.at(-1), Math.ceil(manualRange.max / 500) * 500 - 500)
  }
})

test('手動範囲は有限で順序が正しく、差も有限になる場合だけ有効とする', () => {
  const invalidRanges = [
    undefined, { min: 1, max: 1 }, { min: 2, max: 1 }, { min: NaN, max: 1 },
    { min: 0, max: NaN }, { min: -Infinity, max: 1 }, { min: 0, max: Infinity },
    { min: -Number.MAX_VALUE, max: Number.MAX_VALUE },
  ]
  const values = [16_721, 41_052]
  for (const manualRange of invalidRanges) {
    assert.equal(isValidHpChartYAxisRange(manualRange), false)
    assert.deepEqual(
      getHpChartValueAxis(values, { mode: 'manual', manualRange }),
      getHpChartValueAxis(values, { mode: 'auto' }),
    )
  }
  for (const manualRange of [{ min: 0, max: Number.MIN_VALUE }, { min: -1, max: 1 }, { min: 0, max: Number.MAX_VALUE }]) {
    assert.equal(isValidHpChartYAxisRange(manualRange), true)
  }
})

test('手動範囲は空系列・0のみ・範囲外しかない系列でも変更しない', () => {
  const manualRange = { min: 12_345, max: 23_456 }
  for (const values of [[], [0, 0], [NaN, Infinity], [1], [50_000], [10_000, 30_000]]) {
    assertManualAxis(getHpChartValueAxis(values, { mode: 'manual', manualRange }), manualRange)
  }
  assert.deepEqual(
    getHpChartValueAxis([16_721, 41_052], { mode: 'auto', manualRange }),
    getHpChartValueAxis([16_721, 41_052], { mode: 'auto' }),
  )
})

test('手動範囲の極小値・極大値・表現精度に近い幅でも目盛りの生成回数を制限する', () => {
  for (const manualRange of [
    { min: 0, max: Number.MIN_VALUE },
    { min: -Number.MIN_VALUE, max: Number.MIN_VALUE },
    { min: 0, max: Number.MAX_VALUE },
    { min: -Number.MAX_VALUE, max: 0 },
    { min: 1e308, max: 1e308 + 2e292 },
    { min: 1e16, max: 1e16 + 2 },
  ]) {
    assertManualAxis(getHpChartValueAxis([], { mode: 'manual', manualRange }), manualRange)
  }
})
