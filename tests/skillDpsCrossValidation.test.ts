import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSkillDpsCrossValidation } from '../src/lib/skillDpsCrossValidation.ts'

test('交差検証はオペレーター単位で取り分け、全スキルの誤差からMAEとRMSEを求める', () => {
  const grid = [[0, 0], [0, 1], [1, 0], [1, 1]]
  const rows = [
    ...grid.map(values => ({ operator: 'a', offset: 1, values })),
    ...[...grid, ...grid].map(values => ({ operator: 'b', offset: 4, values })),
    ...grid.map(values => ({ operator: 'c', offset: 10, values })),
  ]
  const progress: number[] = []
  const result = evaluateSkillDpsCrossValidation({
    candidates: ['attack', 'interval'],
    operatorIds: rows.map(row => row.operator),
    predictorValues: rows.map(row => row.values),
    dpsValues: rows.map(({ offset, values: [attack, interval] }) => 10 + 2 * attack + 3 * interval + offset),
  }, value => {
    assert.equal(value.total, 3)
    progress.push(value.completed)
  })

  assert.equal(result.observationCount, 16)
  assert.equal(result.operatorCount, 3)
  assert.deepEqual(progress, [1, 2, 3])
  // Identical predictor distributions leave absolute errors of 5, 1.5, and 7 by operator.
  for (const method of Object.values(result.methods)) {
    assert.ok(method)
    assert.ok(Math.abs(method.mae - 3.75) < 1e-8)
    assert.ok(Math.abs(method.rmse - Math.sqrt(314 / 16)) < 1e-8)
  }
})

test('検証用の一部を予測できなかった方式の誤差は表示できない', () => {
  const result = evaluateSkillDpsCrossValidation({
    candidates: ['attack', 'interval'],
    operatorIds: ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b'],
    predictorValues: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2], [2, 3]],
    dpsValues: [100, 130, 115, 145, 120, 145, 175, 205],
  })
  assert.deepEqual(result.methods, { adjusted: null, vif: null, fixed: null })
})
