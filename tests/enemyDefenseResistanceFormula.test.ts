import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEnemyDefenseResistanceCorrespondence,
  evaluateCorrespondenceErrors,
  fitCorrespondenceModel,
  type CorrespondenceMethod,
  type CorrespondencePoint,
} from '../src/lib/enemyDefenseResistanceFormula.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'
import type { EnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'

const row = (id: string, defense: number | null, magicResistance: number | null) => (
  { id, stats: { defense, magicResistance } } as EnemyRecord
)
const counts = (weights: Record<string, number>): EnemyHistogramCounts => ({
  schemaVersion: 1, generatedAt: '', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(Object.entries(weights).map(([id, spawnCount]) => [id, { mapCount: 1, spawnCount }])),
})
const points = (pairs: number[][]): CorrespondencePoint[] => pairs.map(([x, y], index) => ({ x, y, percentage: (index + 1) / pairs.length * 100 }))
const near = (actual: number | null, expected: number, tolerance = 1e-8) => {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) <= tolerance, `${actual} ≈ ${expected}`)
}
function fit(source: CorrespondencePoint[], method: CorrespondenceMethod, options = {}) {
  const result = fitCorrespondenceModel(source, method, options)
  assert.equal(result.error, null)
  assert.ok(result.model)
  return result.model
}

test('順位対応は同値の上端を使い、出現回数で同じ有効集合を比較する', () => {
  const source = [row('a', 0, 0), row('b', 100, 20), row('c', 200, 20), row('d', 300, 50),
    row('b', 100, 20), row('missingDef', null, 70), row('missingRes', 9999, null), row('infinite', Infinity, 99), row('unknown', 5000, 99)]
  const result = buildEnemyDefenseResistanceCorrespondence(source,
    counts({ a: 1, b: 2, c: 3, d: 4, missingDef: 7, missingRes: 11, infinite: 13 }))
  assert.equal(result.total, 10)
  assert.equal(result.missingCount, 31)
  assert.deepEqual(result.points, [{ x: 0, y: 0, percentage: 10 }, { x: 20, y: 200, percentage: 60 }, { x: 50, y: 300, percentage: 100 }])
})

test('小数の出現回数でも累積割合の一致する境界を越えない', () => {
  const result = buildEnemyDefenseResistanceCorrespondence(
    [row('a', 0, 0), row('b', 100, 10), row('c', 200, 20)], counts({ a: 0.1, b: 0.2, c: 0.7 }),
  )
  assert.deepEqual(result.points.map(({ x, y }) => [x, y]), [[0, 0], [10, 100], [20, 200]])
  assert.equal(result.total, 1)
  const empty = buildEnemyDefenseResistanceCorrespondence([row('a', null, 0), row('b', 0, 0)], counts({ a: 2, b: 0 }))
  assert.deepEqual(empty, { points: [], total: 0, missingCount: 2 })
})

test('階段関数は右連続で、適用範囲外と非有限値を返さない', () => {
  const source = points([[0, 100], [20, 300], [50, 1200]])
  const model = fit(source, 'exact')
  assert.deepEqual([0, 19.9, 20, 49.9, 50].map(model.predict), [100, 100, 300, 300, 1200])
  for (const value of [-1, 51, NaN, Infinity]) assert.equal(model.predict(value), null)
  assert.deepEqual(evaluateCorrespondenceErrors([...source].reverse(), model), {
    meanAbsoluteError: 0, maximumAbsoluteError: 0, sampleCount: 51, step: 1,
  })
})

test('1個の対応点でも累積割合方式は値を返す', () => {
  const source = points([[20, 500]])
  const model = fit(source, 'exact')
  assert.equal(model.predict(20), 500)
  assert.equal(model.predict(20.1), null)
  assert.deepEqual(evaluateCorrespondenceErrors(source, model), { meanAbsoluteError: 0, maximumAbsoluteError: 0, sampleCount: 1, step: 0 })
  for (const method of ['linear', 'polynomial', 'piecewise', 'spline'] as const) {
    const result = fitCorrespondenceModel(source, method)
    assert.equal(result.model, null)
    assert.ok(result.error)
  }
})

test('一次式は対応点を等しく重み付けし、負の予測を保持する', () => {
  const source = points([[0, 0], [1, 0], [2, 10], [3, 20]])
  const model = fit(source, 'linear')
  near(model.predict(0), -3)
  near(model.predict(3), 18)
  assert.equal(model.negativePrediction, true)
  assert.equal(model.nonMonotonic, false)
  assert.ok(evaluateCorrespondenceErrors(source, model).meanAbsoluteError > 0)
})

test('最小点数の一次式・多項式と、QRの最小二乗近似で既知の式を再現する', () => {
  for (const count of [2, 7]) {
    const source = points(Array.from({ length: count }, (_, x) => [x, 7 * x + 11]))
    near(fit(source, 'linear').predict((count - 1) / 2), 7 * (count - 1) / 2 + 11)
  }
  for (const degree of [2, 3] as const) {
    const fn = (x: number) => 10 + 4 * x + 2 * x ** 2 + (degree === 3 ? 0.5 * x ** 3 : 0)
    for (const count of [degree + 1, 9]) {
      const source = points(Array.from({ length: count }, (_, x) => [x, fn(x)]))
      const model = fit(source, 'polynomial', { degree })
      near(model.predict((count - 1) / 2), fn((count - 1) / 2), 1e-7)
      assert.equal(model.nonMonotonic, false)
    }
  }
})

test('点数不足や重複した術耐性は計算エラーになり、定数の防御力は近似できる', () => {
  assert.ok(fitCorrespondenceModel(points([[0, 10], [1, 20]]), 'polynomial', { degree: 2 }).error)
  assert.ok(fitCorrespondenceModel(points([[0, 10], [0, 20], [1, 30]]), 'linear').error)
  assert.ok(fitCorrespondenceModel(points([[0, NaN]]), 'exact').error)
  assert.ok(fitCorrespondenceModel([], 'exact').error)
  const source = points([[0, 500], [10, 500], [20, 500], [30, 500], [40, 500]])
  for (const method of ['linear', 'polynomial', 'piecewise', 'spline'] as const) {
    const model = fit(source, method)
    near(model.predict(14), 500)
    assert.equal(model.nonMonotonic, false)
  }
})

test('多項式の減少区間は節点間の導関数から判定する', () => {
  const source = points([[0, 10], [1, 3], [2, 0], [3, 1], [4, 6]])
  const model = fit(source, 'polynomial', { degree: 2 })
  assert.equal(model.nonMonotonic, true)
  near(model.predict(2.25), -0.125)
  assert.equal(model.negativePrediction, true)
})

test('区分一次式は区切りの累積割合の値を結び、境界で連続する', () => {
  const source = points([[0, 100], [10, 100], [20, 300], [30, 1000]])
  const model = fit(source, 'piecewise', { breakpoints: [10, 20] })
  assert.deepEqual([0, 10, 15, 20, 30].map(model.predict), [100, 100, 200, 300, 1000])
  near(model.predict(20 - 1e-8), 300, 1e-5)
  assert.equal(model.nonMonotonic, false)
  assert.ok(evaluateCorrespondenceErrors(source, model).meanAbsoluteError > 0)
  for (const breakpoints of [[0], [30], [20, 10], [10, 10], [NaN]]) {
    assert.ok(fitCorrespondenceModel(source, 'piecewise', { breakpoints }).error)
  }
})

test('単調スプラインは全節点と水平区間を保ち、節点間でも逆転しない', () => {
  const source = points([[0, 100], [10, 100], [20, 150], [25, 200], [30, 220], [50, 1200], [60, 1700], [70, 1800], [80, 3000], [85, 3000], [90, 4000]])
  const model = fit(source, 'spline')
  for (const point of source) near(model.predict(point.x), point.y)
  near(model.predict(5), 100)
  near(model.predict(82.5), 3000)
  let previous = -Infinity
  for (let x = 0; x <= 90; x += 0.05) {
    const value = model.predict(x)!
    assert.ok(value >= previous - 1e-8)
    previous = value
  }
  assert.equal(model.nonMonotonic, false)
  assert.equal(model.negativePrediction, false)
  assert.ok(evaluateCorrespondenceErrors(source, model).meanAbsoluteError > 0)
  near(fit(points([[2, 5], [4, 9]]), 'spline').predict(3), 7)
})

test('誤差評価は小数の端点を含め、大きな範囲でも1001点以内で計算する', () => {
  const decimal = points([[0.2, 10], [1.7, 30]])
  const decimalErrors = evaluateCorrespondenceErrors(decimal, fit(decimal, 'exact'))
  assert.equal(decimalErrors.sampleCount, 3)
  assert.equal(decimalErrors.step, 1)
  assert.equal(decimalErrors.maximumAbsoluteError, 0)
  const large = points([[0, 0], [100000, 100]])
  const largeErrors = evaluateCorrespondenceErrors(large, fit(large, 'exact'))
  assert.equal(largeErrors.sampleCount, 1001)
  assert.equal(largeErrors.step, 100)
})

test('大きなXの原点をずらしても近似式を安定して計算する', () => {
  const source = points(Array.from({ length: 8 }, (_, index) => [1e8 + index, 20 + 5 * index + 2 * index ** 2]))
  const model = fit(source, 'polynomial', { degree: 2 })
  near(model.predict(1e8 + 3.5), 20 + 5 * 3.5 + 2 * 3.5 ** 2, 1e-7)
})
