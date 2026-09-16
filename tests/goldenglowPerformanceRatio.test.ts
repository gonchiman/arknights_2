import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoldenglowPerformanceRatioCurve,
  buildGoldenglowPerformanceRatios,
  type GoldenglowPerformanceRatioMode,
} from '../src/lib/goldenglowPerformanceRatio.ts'
import type {
  GoldenglowPerformanceComparisonColumn,
  GoldenglowPerformanceComparisonValue,
} from '../src/lib/goldenglowPerformanceComparison.ts'

test('基準比と増減率は同じ耐性の元ダメージを補間してから計算し、基準列と入力を保つ', () => {
  const columns = [column('target', [row(100, 240), row(20, 1200), row(0, 1200)]),
    column('base', [row(100, 150), row(0, 1000), row(15, 1000)])]
  const before = structuredClone(columns)
  const resistances = [100, 37.5, 0, 15, 20]
  const ratios = buildGoldenglowPerformanceRatios(columns, 'ratio', 'base', resistances)
  const growth = buildGoldenglowPerformanceRatios(columns, 'growth', 'base', resistances)
  const expectedRatio = 990 / 775 * 100
  close(ratios[0].values[1].expectedTotalDamage!, expectedRatio)
  close(growth[0].values[1].expectedTotalDamage!, (990 / 775 - 1) * 100)
  assert.notEqual(expectedRatio, 120 + (160 - 120) * 0.375)
  for (const value of ratios[1].values) {
    assert.equal(value.expectedTotalDamage, 100)
    close(value.expectedBodyDamage! + value.expectedDroneNormalDamage! + value.expectedExplosionDamage!, 100)
  }
  // 37.5 is not a source point in either curve: the same guarantee must hold after interpolation.
  const interpolatedBaseline = ratios[1].values[1]
  close(interpolatedBaseline.expectedBodyDamage!, 10)
  close(interpolatedBaseline.expectedDroneNormalDamage!, 60)
  close(interpolatedBaseline.expectedExplosionDamage!, 30)
  for (const value of growth[1].values) assert.deepEqual(value, row(value.resistance, 0))
  assert.deepEqual(ratios.map((item) => item.build.id), ['target', 'base'])
  assert.deepEqual(ratios[0].values.map((value) => value.resistance), resistances)
  assert.deepEqual(columns, before)
  ratios.forEach((item, index) => {
    assert.notEqual(item, columns[index])
    assert.notEqual(item.values, columns[index].values)
    assert.equal(item.build, columns[index].build)
    assert.equal(item.skill, columns[index].skill)
  })
  const reversed = buildGoldenglowPerformanceRatios(columns, 'ratio', 'target', [37.5])
  assert.equal(reversed[0].values[0].expectedTotalDamage, 100)
  close(reversed[1].values[0].expectedTotalDamage!, 775 / 990 * 100)
})

test('内訳は各成分の倍率ではなく基準の合計で割り、増減率では負の寄与も保持する', () => {
  const columns = [column('base', [row(0, 100, 20, 60, 20)]), column('target', [row(0, 120, 10, 80, 30)])]
  assert.deepEqual(buildGoldenglowPerformanceRatios(columns, 'ratio', 'base', [0])[1].values[0], row(0, 120, 10, 80, 30))
  const value = buildGoldenglowPerformanceRatios(columns, 'growth', 'base', [0])[1].values[0]
  close(value.expectedTotalDamage!, 20)
  close(value.expectedBodyDamage!, -10)
  close(value.expectedDroneNormalDamage!, 20)
  close(value.expectedExplosionDamage!, 10)
  close(value.expectedTotalDamage!, value.expectedBodyDamage! + value.expectedDroneNormalDamage! + value.expectedExplosionDamage!)
})

test('増減率の合計が0でも正負の積み上げ内訳を消さず、基準比の内訳は100%へ合計する', () => {
  const columns = [column('base', [row(0, 200, 40, 120, 40), row(100, 200, 40, 120, 40)]),
    column('target', [row(0, 200, 20, 140, 40), row(100, 200, 20, 140, 40)])]
  const [ratio] = buildGoldenglowPerformanceRatios(columns, 'ratio', 'base', [37.5])[1].values
  assert.equal(ratio.expectedTotalDamage, 100)
  close(ratio.expectedBodyDamage!, 10)
  close(ratio.expectedDroneNormalDamage!, 70)
  close(ratio.expectedExplosionDamage!, 20)
  close(ratio.expectedBodyDamage! + ratio.expectedDroneNormalDamage! + ratio.expectedExplosionDamage!, 100)

  const [growth] = buildGoldenglowPerformanceRatios(columns, 'growth', 'base', [37.5])[1].values
  assert.equal(growth.expectedTotalDamage, 0)
  close(growth.expectedBodyDamage!, -10)
  close(growth.expectedDroneNormalDamage!, 10)
  assert.equal(growth.expectedExplosionDamage, 0)
  close(growth.expectedBodyDamage! + growth.expectedDroneNormalDamage! + growth.expectedExplosionDamage!, 0)
  assert.ok(growth.expectedBodyDamage! < 0 && growth.expectedDroneNormalDamage! > 0)
})

test('基準0・0対0・基準なしを未定義とし、正の基準に対する0は有効', () => {
  const columns = [column('zero', [row(0, 0), row(100, 0)]), column('positive', [row(0, 50), row(100, 10)])]
  for (const mode of ['ratio', 'growth'] as const) {
    for (const baseline of ['zero', 'missing']) {
      const result = buildGoldenglowPerformanceRatios(columns, mode, baseline, [0, 50, 100])
      assert.equal(result.length, columns.length)
      for (const item of result) for (const value of item.values) assert.deepEqual(value, row(value.resistance, null))
    }
  }
  assert.equal(buildGoldenglowPerformanceRatios(columns, 'ratio', 'positive', [0])[0].values[0].expectedTotalDamage, 0)
  assert.equal(buildGoldenglowPerformanceRatios(columns, 'growth', 'positive', [0])[0].values[0].expectedTotalDamage, -100)
})

test('欠測区間を飛び越えず外挿せず、無効な内訳だけをnullにする', () => {
  const columns = [column('base', [row(0, 100), row(100, 100)]),
    column('gap', [row(0, 100), row(40, null), row(100, 200)]),
    column('partial', [row(0, 100, 0, -1, Infinity), row(100, 100, 10, 90, NaN)])]
  const result = buildGoldenglowPerformanceRatios(columns, 'ratio', 'base', [-1, 0, 20, 40, 70, 100, 101, NaN])
  for (const index of [0, 2, 3, 4, 6, 7]) assert.deepEqual(result[1].values[index], row(result[1].values[index].resistance, null))
  assert.equal(result[1].values[1].expectedTotalDamage, 100)
  assert.equal(result[1].values[5].expectedTotalDamage, 200)
  assert.deepEqual(result[2].values[2], row(20, 100, 2, null, null))
  const badBase = [column('base', [row(0, 100, -1, 80, 20)]), column('target', [row(0, 120, 10, 90, 20)])]
  const growth = buildGoldenglowPerformanceRatios(badBase, 'growth', 'base', [0])[1].values[0]
  assert.equal(growth.expectedBodyDamage, null)
  close(growth.expectedTotalDamage!, 20)
  for (const bad of [-1, NaN, Infinity, null]) {
    const badColumns = [column('base', [row(0, bad)]), column('target', [row(0, 100)])]
    assert.deepEqual(buildGoldenglowPerformanceRatios(badColumns, 'ratio', 'base', [0])[1].values[0], row(0, null))
  }
})

test('曲線は両列の境界と欠測を残し、区間内部の比率誤差を0.1ポイント未満に収める', () => {
  const columns = [column('base', [row(0, 1000), row(15, 1000), row(100, 150)]),
    column('target', [row(0, 1200), row(20, 1200), row(100, 240)])]
  const before = structuredClone(columns)
  for (const mode of ['ratio', 'growth'] as const) {
    const result = buildGoldenglowPerformanceRatioCurve(columns, mode, 'base')
    const target = result[1]
    for (const resistance of [0, 15, 20, 100]) assert.ok(target.values.some((row) => row.resistance === resistance))
    assert.ok(target.values.length > 4 && target.values.length < 150)
    for (let resistance = 0; resistance <= 100; resistance += 0.125) {
      const direct = buildGoldenglowPerformanceRatios(columns, mode, 'base', [resistance])[1].values[0].expectedTotalDamage!
      const plotted = interpolatePlot(target.values, resistance)
      assert.ok(plotted !== null && Math.abs(plotted - direct) <= 0.026, `${mode} at ${resistance}: ${plotted} vs ${direct}`)
    }
  }
  const gapColumns = [column('base', [row(0, 100), row(40, null), row(100, 50)]), column('target', [row(0, 150), row(100, 100)])]
  const gapCurve = buildGoldenglowPerformanceRatioCurve(gapColumns, 'ratio', 'base')[1]
  assert.equal(interpolatePlot(gapCurve.values, 20), null)
  assert.equal(interpolatePlot(gapCurve.values, 70), null)
  assert.ok(gapCurve.values.some((value) => value.resistance === 40 && value.expectedTotalDamage === null))
  assert.deepEqual(columns, before)
})

test('極端な分母でも補間を有界にし、基準0の点を線でつながない', () => {
  const columns = [column('base', [row(0, 0), row(50, 1), row(100, 1e-12)]),
    column('target', [row(0, 100), row(100, 100)])]
  const result = buildGoldenglowPerformanceRatioCurve(columns, 'ratio', 'base')[1]
  assert.ok(result.values.length < 2200)
  assert.equal(result.values[0].expectedTotalDamage, null)
  assert.ok(result.values.some((value) => value.resistance === 50 && value.expectedTotalDamage === 10000))
  assert.equal(result.values.at(-1)!.resistance, 100)
  for (const value of result.values) assert.ok(value.expectedTotalDamage === null || Number.isFinite(value.expectedTotalDamage))
})

test('基準比と増減率で小数精度を計算途中に丸めず、空配列を安全に扱う', () => {
  const columns = [column('base', [row(0, 3)]), column('target', [row(0, 1.23456789)])]
  assert.equal(buildGoldenglowPerformanceRatios(columns, 'ratio', 'base', [0])[1].values[0].expectedTotalDamage, 1.23456789 / 3 * 100)
  assert.equal(buildGoldenglowPerformanceRatios(columns, 'growth', 'base', [0])[1].values[0].expectedTotalDamage, (1.23456789 / 3 - 1) * 100)
  for (const mode of ['ratio', 'growth'] as const satisfies readonly GoldenglowPerformanceRatioMode[]) {
    assert.deepEqual(buildGoldenglowPerformanceRatios([], mode, '', [0]), [])
    assert.deepEqual(buildGoldenglowPerformanceRatios(columns, mode, 'base', [])[0].values, [])
  }
  assert.deepEqual(buildGoldenglowPerformanceRatioCurve([], 'ratio', ''), [])
})

function column(id: string, values: GoldenglowPerformanceComparisonValue[]): GoldenglowPerformanceComparisonColumn {
  return { build: { id, moduleId: '', moduleLevel: 3, potential: 1 }, skill: null, values }
}

function row(resistance: number, total: number | null, body = total === null ? null : total * 0.1,
  drone = total === null ? null : total * 0.6, explosion = total === null ? null : total * 0.3): GoldenglowPerformanceComparisonValue {
  return { resistance, expectedTotalDamage: total, expectedBodyDamage: body,
    expectedDroneNormalDamage: drone, expectedExplosionDamage: explosion }
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} vs ${expected}`)
}

function interpolatePlot(values: readonly GoldenglowPerformanceComparisonValue[], resistance: number): number | null {
  const index = values.findIndex((value) => value.resistance >= resistance)
  const upper = values[index]
  if (!upper || upper.expectedTotalDamage === null) return null
  if (upper.resistance === resistance) return upper.expectedTotalDamage
  const lower = values[index - 1]
  if (!lower || lower.expectedTotalDamage === null) return null
  const fraction = (resistance - lower.resistance) / (upper.resistance - lower.resistance)
  return lower.expectedTotalDamage * (1 - fraction) + upper.expectedTotalDamage * fraction
}
