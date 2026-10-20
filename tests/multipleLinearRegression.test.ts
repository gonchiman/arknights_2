import test from 'node:test'
import assert from 'node:assert/strict'
import { fitMultipleLinearRegression } from '../src/lib/multipleLinearRegression.ts'

function close(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (±${tolerance})`)
}

test('切片と複数の既知係数を復元する', () => {
  const predictors = Array.from({ length: 8 }, (_, index) => [index, index % 2])
  const responses = predictors.map(([hp, category]) => 7 + 2 * hp - 3 * category)
  const result = fitMultipleLinearRegression(predictors, responses, ['HP', 'エリート'])

  close(result.intercept, 7)
  close(result.coefficients[0], 2)
  close(result.coefficients[1], -3)
  result.fittedValues.forEach((value, index) => close(value, responses[index]))
  result.residuals.forEach(value => close(value, 0))
  close(result.rSquared, 1)
  close(result.adjustedRSquared, 1)
  close(result.meanAbsoluteError, 0)
  assert.equal(result.observationCount, 8)
  assert.equal(result.parameterCount, 3)
  assert.equal(result.residualDegreesOfFreedom, 5)
})

test('異なる桁の説明変数を一定値と誤認せず、元の単位で係数を返す', () => {
  const predictors = Array.from({ length: 8 }, (_, index) => [index * 1e12, (index % 2) * 1e-12])
  const responses = predictors.map(([first, second]) => 5 + 2e-12 * first - 3e12 * second)
  const result = fitMultipleLinearRegression(predictors, responses)

  close(result.intercept, 5)
  close(result.coefficients[0] / 1e-12, 2)
  close(result.coefficients[1] / 1e12, -3)
  result.fittedValues.forEach((value, index) => close(value, responses[index]))
})

test('QRの列選択順序が変わっても係数を元の説明変数順に戻す', () => {
  const original = Array.from({ length: 12 }, (_, index) => [
    index,
    index + (index % 3) * 0.001,
    (index * 7) % 5,
  ])
  const expected = [2, -3, 5]
  const responses = original.map(row => 11 + row.reduce((total, value, column) => total + value * expected[column], 0))
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    const predictors = original.map(row => order.map(column => row[column]))
    const result = fitMultipleLinearRegression(predictors, responses)
    close(result.intercept, 11, 1e-8)
    result.coefficients.forEach((coefficient, column) => close(coefficient, expected[order[column]], 1e-8))
    result.fittedValues.forEach((value, index) => close(value, responses[index], 1e-8))
  }
})

test('実測値−当てはめ値の残差と既知の誤差指標を計算する', () => {
  const result = fitMultipleLinearRegression([[0], [1], [2], [3]], [1, 2, 1, 4])

  close(result.intercept, 0.8)
  close(result.coefficients[0], 0.8)
  const expectedResiduals = [0.2, 0.4, -1.4, 0.8]
  result.residuals.forEach((value, index) => close(value, expectedResiduals[index]))
  close(result.rSquared, 1 - 2.8 / 6)
  close(result.adjustedRSquared, 0.3)
  close(result.meanAbsoluteError, 0.7)
  close(result.residuals.reduce((total, value) => total + value, 0), 0)
  close(result.residuals.reduce((total, value, index) => total + value * index, 0), 0)
})

test('調整済みR²が負の場合に0へ丸めない', () => {
  const result = fitMultipleLinearRegression([[-1], [0], [1]], [1, 0, 1])

  close(result.rSquared, 0)
  close(result.adjustedRSquared, -1)
  close(result.meanAbsoluteError, 4 / 9)
})

test('0を欠損扱いせず、小さな目的変数も絶対閾値で拒否しない', () => {
  const result = fitMultipleLinearRegression([[0], [1], [2], [3]], [0, 2e-120, 4e-120, 6e-120])

  close(result.coefficients[0] / 1e-120, 2)
  close(result.intercept / 1e-120, 0)
  close(result.rSquared, 1)
  assert.equal(result.observationCount, 4)
})

test('有限な大きな目的変数で平方和のオーバーフローを避ける', () => {
  const result = fitMultipleLinearRegression([[0], [1], [2], [3]], [1e200, 2e200, 3e200, 4e200])

  close(result.intercept / 1e200, 1)
  close(result.coefficients[0] / 1e200, 1)
  close(result.rSquared, 1)
  assert.ok(result.fittedValues.every(Number.isFinite))
})

test('入力の説明変数・目的変数を変更しない', () => {
  const predictors = Object.freeze([Object.freeze([0, 0]), Object.freeze([1, 0]), Object.freeze([0, 1]), Object.freeze([1, 1])])
  const responses = Object.freeze([1, 3, 4, 6])
  const before = JSON.stringify({ predictors, responses })

  fitMultipleLinearRegression(predictors, responses)

  assert.equal(JSON.stringify({ predictors, responses }), before)
})

test('非有限な値を欠損として黙って除外せず、観測位置と変数名を示す', () => {
  assert.throws(() => fitMultipleLinearRegression([[0], [1], [Infinity], [3]], [1, 2, 3, 4], ['HP']), /3件目.*HP.*有限/)
  assert.throws(() => fitMultipleLinearRegression([[0], [1], [2], [3]], [1, NaN, 3, 4]), /2件目.*目的変数.*有限/)
  assert.throws(() => fitMultipleLinearRegression([[0], [1], [2], [3]], [1, 2, 3, -Infinity]), /4件目.*目的変数.*有限/)
})

test('空データ・説明変数なし・件数・列数・変数名数の不一致を拒否する', () => {
  assert.throws(() => fitMultipleLinearRegression([], []), /観測データがありません/)
  assert.throws(() => fitMultipleLinearRegression([[], [], []], [1, 2, 3]), /説明変数を1つ以上/)
  assert.throws(() => fitMultipleLinearRegression([[1], [2]], [1]), /観測件数が一致/)
  assert.throws(() => fitMultipleLinearRegression([[0], [1, 2], [2], [3]], [1, 2, 3, 4]), /2件目.*列数が一致/)
  assert.throws(() => fitMultipleLinearRegression([[0], [1], [2]], [1, 2, 3], ['HP', '防御力']), /変数名の数が一致/)
})

test('切片込みの係数数以上の観測が必要である', () => {
  assert.throws(() => fitMultipleLinearRegression([[0], [1]], [1, 2]), /利用件数.*2件.*パラメーター数.*2個/)
  assert.throws(() => fitMultipleLinearRegression([[0, 0], [1, 0]], [1, 2]), /利用件数.*2件.*パラメーター数.*3個/)
})

test('目的変数が一定、説明変数が一定の場合は名前付きで拒否する', () => {
  assert.throws(() => fitMultipleLinearRegression([[0], [1], [2], [3]], [7, 7, 7, 7]), /目的変数がすべて同じ/)
  assert.throws(() => fitMultipleLinearRegression([[1], [1], [1], [1]], [1, 2, 3, 4], ['HP']), /HP.*すべて同じ/)
  assert.throws(() => fitMultipleLinearRegression([[0], [0], [0], [0]], [1, 2, 3, 4], ['術耐性']), /術耐性.*すべて同じ/)
})

test('完全な線形従属と切片を含むアフィン従属を拒否する', () => {
  const duplicate = Array.from({ length: 6 }, (_, index) => [index, 2 * index])
  const affine = Array.from({ length: 6 }, (_, index) => [index, 5 - 2 * index])
  const responses = [1, 2, 4, 3, 6, 8]

  assert.throws(() => fitMultipleLinearRegression(duplicate, responses, ['HP', '防御力']), /(?:HP|防御力).*線形従属/)
  assert.throws(() => fitMultipleLinearRegression(affine, responses), /線形従属/)
})

test('切片と全カテゴリのダミーを同時投入したランク不足を拒否する', () => {
  const predictors = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1]]

  assert.throws(() => fitMultipleLinearRegression(predictors, [1, 2, 3, 4, 5, 6], ['通常', 'エリート', 'ボス']), /線形従属/)
})
