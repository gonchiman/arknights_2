import test from 'node:test'
import assert from 'node:assert/strict'
import { fitStandardizedPca } from '../src/lib/principalComponentAnalysis.ts'

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

function correlatedFixture() {
  const x = [-1, -1, 1, 1]
  const independent = [-1, 1, -1, 1]
  return x.map((value, index) => [value, 0.5 * value + Math.sqrt(0.75) * independent[index]])
}

test('既知の相関0.5から固有値1.5・0.5と寄与率75%・25%を得る', () => {
  const observations = correlatedFixture()
  const fit = fitStandardizedPca(observations)
  close(fit.eigenvalues[0], 1.5)
  close(fit.eigenvalues[1], 0.5)
  close(fit.explainedVariance[0], 0.75)
  close(fit.explainedVariance[1], 0.25)
  fit.coefficients[0].forEach(value => close(value, 1 / Math.sqrt(2)))
  fit.scores.forEach((row, index) => close(row[0], (observations[index][0] + observations[index][1]) / Math.sqrt(2)))
})

test('定数列を除外しても平均・係数・標準化値は元の列順を保つ', () => {
  const fit = fitStandardizedPca(correlatedFixture().map(([x, y]) => [42, x, y, 0]))
  assert.deepEqual(fit.activeColumns, [1, 2])
  assert.deepEqual(fit.constantColumns, [0, 3])
  assert.equal(fit.featureCount, 4)
  assert.equal(fit.observationCount, 4)
  assert.equal(fit.means[0], 42)
  assert.equal(fit.standardDeviations[0], 0)
  for (const row of [...fit.standardized, ...fit.coefficients]) {
    assert.equal(row[0], 0)
    assert.equal(row[3], 0)
  }
  close(fit.explainedVariance[0], 0.75)
})

test('全成分で標準化入力と共分散を復元し、成分を直交させる', () => {
  const rows = [[1, 4, 2], [5, 3, 1], [4, 9, 5], [7, 4, 4], [8, 2, 5], [1, 8, 9]]
  const fit = fitStandardizedPca(rows)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dot = fit.coefficients[i].reduce((total, value, k) => total + value * fit.coefficients[j][k], 0)
      close(dot, Number(i === j))
      const covariance = fit.standardized.reduce((total, row) => total + row[i] * row[j], 0) / rows.length
      const reconstructed = fit.coefficients.reduce((total, component, k) => (
        total + fit.eigenvalues[k] * component[i] * component[j]
      ), 0)
      close(reconstructed, covariance)
    }
    const coefficients = fit.coefficients[i]
    const largest = coefficients.reduce((previous, value, index) => Math.abs(value) > Math.abs(coefficients[previous]) ? index : previous, 0)
    assert.ok(coefficients[largest] > 0)
    close(fit.scores.reduce((total, row) => total + row[i] ** 2, 0) / rows.length, fit.eigenvalues[i])
  }
  fit.standardized.forEach((row, index) => row.forEach((value, column) => {
    close(fit.scores[index].reduce((total, score, component) => total + score * fit.coefficients[component][column], 0), value)
  }))
  close(fit.explainedVariance.reduce((total, value) => total + value, 0), 1)
})

test('入力の単位と並び順を変えても同じPCAになる', () => {
  const original = correlatedFixture()
  const changed = original.toReversed().map(([x, y]) => [x * 1e120 + 5e120, y * 1e-120])
  const first = fitStandardizedPca(original)
  const second = fitStandardizedPca(changed)
  first.eigenvalues.forEach((value, index) => close(second.eigenvalues[index], value))
  first.coefficients.forEach((component, index) => component.forEach((value, column) => close(second.coefficients[index][column], value)))
  first.scores.forEach((row, index) => row.forEach((value, component) => close(second.scores[original.length - index - 1][component], value)))
})

test('観測より列が多い行列と完全相関を扱い、ゼロ固有値でNaNにしない', () => {
  const rows = [[1, 2, -1, 5], [2, 4, -2, 10], [3, 6, -3, 15]]
  const fit = fitStandardizedPca(rows)
  close(fit.eigenvalues[0], 4)
  fit.eigenvalues.slice(1).forEach(value => close(value, 0))
  close(fit.explainedVariance[0], 1)
  assert.ok(fit.scores.flat().every(Number.isFinite))
})

test('1列のみ変動する場合は1成分を返す', () => {
  const rows = Object.freeze([Object.freeze([10, 2]), Object.freeze([20, 2])])
  const fit = fitStandardizedPca(rows)
  assert.deepEqual(fit.eigenvalues, [1])
  assert.deepEqual(fit.scores, [[-1], [1]])
  assert.deepEqual(rows, [[10, 2], [20, 2]])
})

test('対象不足・列不足・不揃いの列・非有限値・全定数を明示的に拒否する', () => {
  for (const rows of [[], [[1, 2]], [[], []], [[1], [2, 3]], [[1], [Infinity]], [[1], [NaN]], [[2, 3], [2, 3]]]) {
    assert.throws(() => fitStandardizedPca(rows), Error)
  }
})
