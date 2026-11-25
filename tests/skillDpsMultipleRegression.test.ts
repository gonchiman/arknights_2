import test from 'node:test'
import assert from 'node:assert/strict'
import { SKILL_DPS_ANALYSIS_AXES, type SkillDpsAnalysisDataset, type SkillDpsObservation } from '../src/lib/skillDpsAnalysis.ts'
import {
  analyzeSkillDpsMultipleRegression, DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS, evaluateSkillDpsPredictorCombinations,
  SKILL_DPS_REGRESSION_PREDICTORS, type SkillDpsRegressionPredictor,
} from '../src/lib/skillDpsMultipleRegression.ts'

function observation(durationSeconds: number | null, spCost: number | null, directDps: number | null,
  combinedDps: number | null): SkillDpsObservation {
  return { id: `${durationSeconds}/${spCost}`, skill: {} as SkillDpsObservation['skill'], stageLabel: 'スキル中',
    durationSeconds, spCost, initialSp: null, spGap: null, deploymentCost: null, initialRatio: null,
    uptime: null, uptimeUnavailableReason: null, maxTargets: 'UNLIMITED', attack: null, attackInterval: null,
    directDps, combinedDps, damageType: 'PHYSICAL' }
}

function dataset(observations: SkillDpsObservation[]): SkillDpsAnalysisDataset {
  return { observations, consideredCount: observations.length, excludedCount: 0, exclusions: [] }
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should be close to ${expected}`)
}

test('重回帰は選んだDPSと説明変数が揃うスキルを使い、入力順に係数を返す', () => {
  const rows = [[1, 3], [2, 1], [3, 4], [4, 2], [5, 4]].map(([duration, spCost]) =>
    observation(duration, spCost, 4 + 2 * duration - 2 * spCost, 100 - duration + 3 * spCost))
  const data = dataset([
    ...rows,
    observation(null, 20, 5000, 5000),
    observation(8, Number.NaN, 5000, 5000),
    observation(6, 3, Number.POSITIVE_INFINITY, 103),
    observation(7, 3, 12, null),
    observation(8, 6, 8, null),
  ])

  const direct = analyzeSkillDpsMultipleRegression(data, ['spCost', 'duration'], 'direct')
  assert.equal(direct.error, null)
  assert.equal(direct.observationCount, 7)
  assert.ok(direct.fit)
  close(direct.fit.intercept, 4)
  close(direct.fit.coefficients[0], -2)
  close(direct.fit.coefficients[1], 2)
  close(direct.fit.fittedValues[0], 0)
  close(direct.fit.adjustedRSquared, 1)

  const combined = analyzeSkillDpsMultipleRegression(data, DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS, 'combined')
  assert.equal(combined.error, null)
  assert.equal(combined.observationCount, 6)
  assert.ok(combined.fit)
  close(combined.fit.intercept, 100)
  close(combined.fit.coefficients[0], -1)
  close(combined.fit.coefficients[1], 3)
  assert.ok(combined.fit.standardizedCoefficients[0] < 0)
  assert.ok(combined.fit.standardizedCoefficients[1] > 0)
})

test('数値の説明変数を2種類以上求める', () => {
  assert.deepEqual(SKILL_DPS_REGRESSION_PREDICTORS, SKILL_DPS_ANALYSIS_AXES.filter(([key]) => key !== 'maxTargets'))
  assert.deepEqual(DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS, ['duration', 'spCost'])
  const data = dataset([])
  for (const predictors of [['duration'], ['duration', 'duration']] as const) {
    const result = analyzeSkillDpsMultipleRegression(data, predictors, 'direct')
    assert.equal(result.fit, null)
    assert.equal(result.observationCount, 0)
    assert.match(result.error!, /異なる説明変数を2つ以上/)
  }
  const unsupported = analyzeSkillDpsMultipleRegression(data, ['duration', 'maxTargets' as SkillDpsRegressionPredictor], 'direct')
  assert.equal(unsupported.fit, null)
  assert.match(unsupported.error!, /数値の説明変数/)

  const candidates = ['duration', 'spCost', 'attack'] as const
  for (const predictors of [['duration'], ['duration', 'duration']] as const) {
    assert.match(analyzeSkillDpsMultipleRegression(data, predictors, 'direct', candidates).error!, /異なる説明変数を2つ以上/)
  }
  const outsidePool = analyzeSkillDpsMultipleRegression(data, ['duration', 'interval'], 'direct', candidates)
  assert.match(outsidePool.error!, /組み合わせ評価の候補から/)
  const invalidPool = analyzeSkillDpsMultipleRegression(data, DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS, 'direct',
    ['duration', 'spCost', 'maxTargets' as SkillDpsRegressionPredictor])
  assert.match(invalidPool.error!, /候補が無効/)
  const duplicatedPool = analyzeSkillDpsMultipleRegression(data, DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS, 'direct',
    ['duration', 'spCost', 'duration'])
  assert.match(duplicatedPool.error!, /候補が無効/)
})

test('揃ったスキルが不足する場合と説明変数が線形従属する場合の使用件数を返す', () => {
  const predictors = DEFAULT_SKILL_DPS_REGRESSION_PREDICTORS
  const empty = analyzeSkillDpsMultipleRegression(dataset([observation(null, 20, 900, 900)]), predictors, 'direct')
  assert.equal(empty.fit, null)
  assert.equal(empty.observationCount, 0)
  assert.match(empty.error!, /すべて揃うスキルがありません/)

  const few = analyzeSkillDpsMultipleRegression(dataset([observation(20, 40, 900, 900)]), predictors, 'direct')
  assert.equal(few.fit, null)
  assert.equal(few.observationCount, 1)
  assert.match(few.error!, /利用件数（1件）/)

  const collinear = dataset([1, 2, 3, 4].map(duration => observation(duration, 2 * duration, duration, duration)))
  const result = analyzeSkillDpsMultipleRegression(collinear, predictors, 'direct')
  assert.equal(result.fit, null)
  assert.equal(result.observationCount, 4)
  assert.match(result.error!, /線形従属/)
})

test('組み合わせを比較するときは全候補と選択中のDPSが揃う同じ観測を使う', () => {
  const candidates = ['duration', 'spCost', 'attack'] as const
  const predictors = ['duration', 'spCost'] as const
  const complete = [[1, 3, 1], [2, 1, 2], [3, 4, 5], [4, 2, 2], [5, 4, 6]].map(([duration, spCost, attack]) =>
    ({ ...observation(duration, spCost, 100 + attack * 30, 90 - attack), attack }))
  const directOnly = { ...observation(6, 2, 150, null), attack: 9 }
  const combinedOnly = { ...observation(7, 5, null, 160), attack: 2 }
  const missingCandidate = observation(8, 1, 5000, 5000)
  const data = dataset([...complete, directOnly, combinedOnly, missingCandidate])

  for (const [metric, additional] of [['direct', directOnly], ['combined', combinedOnly]] as const) {
    const fixedData = dataset([...complete, additional])
    const unfixed = analyzeSkillDpsMultipleRegression(data, predictors, metric)
    const result = evaluateSkillDpsPredictorCombinations(data, candidates, metric)
    assert.equal(result.error, null)
    assert.equal(result.failedCount, 0)
    assert.equal(result.observationCount, 6)
    assert.equal(unfixed.observationCount, 7)
    assert.ok(unfixed.fit)
    assert.notDeepEqual(result.models[0].varianceInflationFactors, unfixed.fit.varianceInflationFactors)
    assert.deepEqual(result.models.map(model => model.predictors), [
      ['duration', 'spCost'], ['duration', 'attack'], ['spCost', 'attack'], ['duration', 'spCost', 'attack'],
    ])
    for (const model of result.models) {
      const fixed = analyzeSkillDpsMultipleRegression(fixedData, model.predictors, metric)
      assert.equal(result.observationCount, fixed.observationCount)
      assert.ok(fixed.fit)
      assert.deepEqual(analyzeSkillDpsMultipleRegression(data, model.predictors, metric, candidates), fixed)
      close(model.adjustedRSquared, fixed.fit.adjustedRSquared)
      assert.deepEqual(model.varianceInflationFactors, fixed.fit.varianceInflationFactors)
      assert.equal(model.maxVif, Math.max(...model.varianceInflationFactors))
    }

    const reversed = [...candidates].reverse()
    const opened = analyzeSkillDpsMultipleRegression(data, reversed, metric, candidates)
    assert.deepEqual(opened, analyzeSkillDpsMultipleRegression(fixedData, reversed, metric))
  }
})

test('計算できない組み合わせを数え、比較可能な組み合わせは残す', () => {
  const data = dataset([1, 2, 3, 4, 5].map(duration => ({
    ...observation(duration, 2 * duration, duration, duration),
    attack: duration ** 2,
  })))
  const result = evaluateSkillDpsPredictorCombinations(data, ['duration', 'spCost', 'attack'], 'direct')
  assert.equal(result.error, null)
  assert.equal(result.observationCount, 5)
  assert.equal(result.failedCount, 2)
  assert.deepEqual(result.models.map(model => model.predictors), [['duration', 'attack'], ['spCost', 'attack']])

  const unavailable = evaluateSkillDpsPredictorCombinations(data, ['duration', 'spCost'], 'direct')
  assert.equal(unavailable.failedCount, 1)
  assert.equal(unavailable.observationCount, 5)
  assert.deepEqual(unavailable.models, [])
  assert.match(unavailable.error!, /線形従属/)
})
