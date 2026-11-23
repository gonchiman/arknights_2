import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePearsonCorrelation } from '../src/lib/pearsonCorrelation.ts'

function close(actual: number | null, expected: number, tolerance = 1e-12) {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`)
}

test('two varying observations have defined positive or negative correlation', () => {
  close(calculatePearsonCorrelation([0, 2], [5, 8]), 1)
  close(calculatePearsonCorrelation([-2, 0], [8, 5]), -1)
  close(calculatePearsonCorrelation([1e-300, 2e-300], [2e300, 1e300]), -1)
})

test('undefined correlations and invalid arrays are null rather than zero', () => {
  for (const [x, y] of [
    [[], []], [[1], [2]], [[1, 2], [1]], [[1, 1], [2, 3]], [[0, 0], [0, 1]],
    [[1, 2, 3], [4, 4, 4]], [[1, Number.NaN], [2, 3]], [[1, 2], [2, Infinity]],
  ]) assert.equal(calculatePearsonCorrelation(x, y), null)
})

test('known unweighted correlation is symmetric, sign-aware and retains duplicate weights', () => {
  const x = [0, 1, 2], y = [0, 2, 1]
  close(calculatePearsonCorrelation(x, y), .5)
  close(calculatePearsonCorrelation(y, x), .5)
  close(calculatePearsonCorrelation(x, y.map(value => -value)), -.5)
  close(calculatePearsonCorrelation([0, 0, 1, 2], [0, 0, 2, 1]), 7 / 11)
  close(calculatePearsonCorrelation([-1, 0, 1], [1, -2, 1]), 0)
})

test('positive unit changes, large offsets, extreme magnitudes and tiny scales do not overflow r', () => {
  const x = [0, 1, 2, 3], y = [1, 3, 2, 7]
  const expected = calculatePearsonCorrelation(x, y)!
  close(calculatePearsonCorrelation(x.map(value => value + 1e15), y.map(value => value - 1e15)), expected)
  close(calculatePearsonCorrelation(x.map(value => value * 1e-300), y.map(value => value * 1e300)), expected)
  close(calculatePearsonCorrelation([-1e308, 0, 1e308], [1e308, 0, -1e308]), -1)
  close(calculatePearsonCorrelation([0, Number.MIN_VALUE], [Number.MIN_VALUE, 0]), -1)
})

test('frozen arrays remain unchanged', () => {
  const x = Object.freeze([3, 1, 2]), y = Object.freeze([4, 2, 3])
  close(calculatePearsonCorrelation(x, y), 1)
  assert.deepEqual(x, [3, 1, 2])
  assert.deepEqual(y, [4, 2, 3])
})
