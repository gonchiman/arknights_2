import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateNormalQqPlot } from '../src/lib/normalQqPlot.ts'

function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`)
}

test('sorts finite observations without modifying the input or collapsing repeated values', () => {
  const values = Object.freeze([30, NaN, 0, 30, Infinity, -5, 10])
  const { points } = calculateNormalQqPlot(values, 0, 30)
  assert.deepEqual(points.map(point => point.observed), [-5, 0, 10, 30, 30])
  const quantiles = [-1.2815515655, -0.5244005127, 0, 0.5244005127, 1.2815515655]
  points.forEach((point, index) => close(point.theoretical, quantiles[index]))
})

test('reference line passes through the supplied empirical quartiles', () => {
  const { reference } = calculateNormalQqPlot([-12, 0, 5, 18, 120], 0, 18)
  assert.ok(reference)
  close(reference.intercept - reference.slope * 0.6744897501960817, 0)
  close(reference.intercept + reference.slope * 0.6744897501960817, 18)
})

test('small and zero-IQR samples retain their observations with no reference line', () => {
  assert.deepEqual(calculateNormalQqPlot([Infinity, NaN], null, null), { points: [], reference: null })
  assert.deepEqual(calculateNormalQqPlot([20], 20, 20), {
    points: [{ theoretical: 0, observed: 20 }], reference: null,
  })
  for (const values of [[20, 20, 20], [20, 20, 20, 20, 80]]) {
    const plot = calculateNormalQqPlot(values, 20, 20)
    assert.equal(plot.reference, null)
    assert.deepEqual(plot.points.map(point => point.observed), values)
  }
})

test('normal quantiles remain accurate in both tails and increase at every rank', () => {
  const count = 10_000
  const { points } = calculateNormalQqPlot(Array(count).fill(1), 1, 1)
  close(points[0].theoretical, -3.8905918864)
  close(points[count - 1].theoretical, 3.8905918864)
  for (let i = 1; i < count; i++) assert.ok(points[i].theoretical > points[i - 1].theoretical)
})
