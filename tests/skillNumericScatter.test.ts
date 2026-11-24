import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSkillNumericScatter } from '../src/lib/skillNumericScatter.ts'
import {
  buildSkillNumericDataset, DEFAULT_SKILL_NUMERIC_CONFIG,
  type SkillNumericDataset, type SkillNumericObservation,
} from '../src/lib/skillNumericStatistics.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

function observation(id: string, changes: Partial<SkillNumericObservation> = {}): SkillNumericObservation {
  return { id, skill: {} as SkillRecord, skillLevelIndex: 9, skillLevelLabel: '特化3', durationSeconds: 30,
    durationState: 'FIXED_DURATION', spCost: 40, initialSp: 0, spGap: 40, initialRatio: 0, uptime: null, ...changes }
}
const dataset = (observations: SkillNumericObservation[]): SkillNumericDataset => ({ observations, unavailableLevelCount: 0 })
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12, `${actual} ≈ ${expected}`)

test('finite pairs preserve skill identity instead of zipping independently filtered marginal values', () => {
  const source = dataset([
    observation('x-only', { durationSeconds: 10, spCost: null }),
    observation('y-only', { durationSeconds: null, spCost: 20 }),
    observation('pair-a', { durationSeconds: 30, spCost: 40 }),
    observation('pair-b', { durationSeconds: 40, spCost: 30 }),
  ])
  const result = buildSkillNumericScatter(source, 'duration', 'spCost')
  assert.deepEqual(result.points, [{ id: 'pair-a', x: 30, y: 40 }, { id: 'pair-b', x: 40, y: 30 }])
  assert.equal(result.validCount, 2)
  assert.equal(result.excludedCount, 2)
  close(result.correlation, -1)
  assert.deepEqual(result.fit, { slope: -1, intercept: 70, rSquared: 1 })
})

test('different skills at the same coordinate retain individual weight in counts and Pearson r', () => {
  const source = dataset([
    observation('origin-a', { spCost: 0, initialSp: 0 }), observation('origin-b', { spCost: 0, initialSp: 0 }),
    observation('a', { spCost: 1, initialSp: 2 }), observation('b', { spCost: 2, initialSp: 1 }),
  ])
  const result = buildSkillNumericScatter(source, 'spCost', 'initialSp')
  assert.equal(result.validCount, 4)
  assert.equal(result.points.length, 4)
  assert.equal(new Set(result.points.map(point => point.id)).size, 4)
  close(result.correlation, 7 / 11)
  assert.ok(result.fit)
  close(result.fit.slope, 7 / 11)
  close(result.fit.intercept, 3 / 11)
  close(result.fit.rSquared, 49 / 121)
})

test('observed zero and negative SP gaps stay finite while missing and nonfinite pairs are excluded', () => {
  const source = dataset([
    observation('zero', { spGap: 0, initialSp: 0 }), observation('negative', { spGap: -5, initialSp: 10 }),
    observation('missing-gap', { spGap: null }), observation('bad-x', { spGap: Infinity }),
    observation('bad-y', { spGap: 4, initialSp: Number.NaN }),
  ])
  const result = buildSkillNumericScatter(source, 'spGap', 'initialSp')
  assert.deepEqual(result.points, [{ id: 'zero', x: 0, y: 0 }, { id: 'negative', x: -5, y: 10 }])
  assert.equal(result.excludedCount, 3)
  close(result.correlation, -1)
  assert.deepEqual(result.fit, { slope: -2, intercept: 0, rSquared: 1 })
})

test('NO_SP cohort retains skills but has no fabricated zero-SP pairs', () => {
  const raw: RawSkillLevel = { duration: 20, skillType: 'PASSIVE', description: '配置後20秒間、攻撃力が上昇',
    spData: { spType: 8, spCost: 0, initSp: 0 } as unknown as RawSkillLevel['spData'] }
  const skill = { operatorId: 'passive', skillIndex: 1, skillId: 'passive-skill', skillLevels: [raw] } as SkillRecord
  const source = buildSkillNumericDataset([skill], { ...DEFAULT_SKILL_NUMERIC_CONFIG, spRecovery: 'NO_SP' })
  assert.equal(source.observations.length, 1)
  const result = buildSkillNumericScatter(source, 'duration', 'spCost')
  assert.equal(result.validCount, 0)
  assert.equal(result.excludedCount, 1)
  assert.equal(result.correlation, null)
  assert.equal(result.fit, null)
})

test('constant axes and insufficient data leave points visible and only omit undefined correlation', () => {
  const constant = dataset([observation('a', { durationSeconds: 5, spCost: 10 }), observation('b', { durationSeconds: 5, spCost: 20 })])
  const result = buildSkillNumericScatter(constant, 'duration', 'spCost')
  assert.equal(result.validCount, 2)
  assert.equal(result.correlation, null)
  assert.equal(result.fit, null)
  const single = buildSkillNumericScatter(dataset([observation('single')]), 'duration', 'spCost')
  assert.equal(single.validCount, 1)
  assert.equal(single.correlation, null)
  assert.equal(single.fit, null)
  const empty = buildSkillNumericScatter(dataset([]), 'duration', 'spCost')
  assert.deepEqual(empty, { points: [], validCount: 0, excludedCount: 0, correlation: null, fit: null })
})

test('swapping axes preserves r, and identical finite metrics remain mathematically defined', () => {
  const source = dataset([observation('a', { spCost: 10, initialSp: 0 }), observation('b', { spCost: 20, initialSp: 15 }), observation('c', { spCost: 30, initialSp: 5 })])
  const original = buildSkillNumericScatter(source, 'spCost', 'initialSp')
  const swapped = buildSkillNumericScatter(source, 'initialSp', 'spCost')
  close(swapped.correlation, original.correlation!)
  assert.deepEqual(swapped.points, original.points.map(({ id, x, y }) => ({ id, x: y, y: x })))
  assert.ok(original.fit && swapped.fit)
  close(original.fit.slope, .25)
  close(swapped.fit.slope, 3 / 7)
  close(original.fit.rSquared, 3 / 28)
  close(swapped.fit.rSquared, original.fit.rSquared!)
  close(buildSkillNumericScatter(source, 'spCost', 'spCost').correlation, 1)
})

test('frozen input observations and excluded level metadata stay untouched', () => {
  const source = dataset([observation('b', { spCost: 5 }), observation('a', { spCost: 10 })])
  source.unavailableLevelCount = 3
  source.observations.forEach(Object.freeze)
  Object.freeze(source.observations)
  Object.freeze(source)
  const before = JSON.stringify(source)
  const result = buildSkillNumericScatter(source, 'duration', 'spCost')
  assert.equal(result.excludedCount, 0)
  assert.deepEqual(result.points.map(point => point.id), ['b', 'a'])
  assert.equal(JSON.stringify(source), before)
})

test('varying X with a constant response has a horizontal line but undefined correlation and R²', () => {
  for (const xValues of [[10, 30], [-5, 0, 5]]) {
    const source = dataset(xValues.map((spGap, index) => observation(`horizontal-${index}`, { spGap, initialSp: 0 })))
    const result = buildSkillNumericScatter(source, 'spGap', 'initialSp')
    assert.equal(result.validCount, xValues.length)
    assert.equal(result.correlation, null)
    assert.deepEqual(result.fit, { slope: 0, intercept: 0, rSquared: null })
  }
})

test('ordinary regression uses every finite skill pair and reproduces the raw-unit equation', () => {
  const source = dataset([-2, 0, 1, 3].map((x, index) => observation(`linear-${index}`, { spGap: x, spCost: 2 * x + 7 })))
  source.observations.push(observation('excluded', { spGap: null, spCost: 999 }))
  const result = buildSkillNumericScatter(source, 'spGap', 'spCost')
  assert.equal(result.validCount, 4)
  assert.equal(result.excludedCount, 1)
  assert.ok(result.fit)
  close(result.fit.slope, 2)
  close(result.fit.intercept, 7)
  close(result.fit.rSquared, 1)
})

test('two-point descriptive fits handle negative slopes, large units and offsets independently of inference degrees of freedom', () => {
  for (const [x, y, slope, intercept] of [
    [[1, 3], [5, 9], 2, 3],
    [[0, 2], [5, 1], -2, 5],
    [[1e15 + 1, 1e15 + 2], [2, 4], 2, -2e15],
    [[-1e308, 1e308], [-1e308, 1e308], 1, 0],
  ] as const) {
    const source = dataset(x.map((spGap, index) => observation(`two-${index}`, { spGap, spCost: y[index] })))
    const result = buildSkillNumericScatter(source, 'spGap', 'spCost')
    assert.ok(result.fit)
    close(result.fit.slope, slope)
    close(result.fit.intercept, intercept)
    assert.equal(result.fit.rSquared, 1)
  }
})

test('unrepresentable two-point coefficients never leak nonfinite or fabricated zero fits', () => {
  for (const [x, y] of [
    [[0, Number.MIN_VALUE], [0, 1]],
    [[-1e308, 1e308], [-Number.MIN_VALUE, Number.MIN_VALUE]],
    [[1e308, 1.0000000000000002e308], [-1e308, 1e308]],
  ]) {
    const source = dataset(x.map((spGap, index) => observation(`invalid-fit-${index}`, { spGap, spCost: y[index] })))
    const result = buildSkillNumericScatter(source, 'spGap', 'spCost')
    assert.equal(result.validCount, 2)
    assert.equal(result.fit, null)
    close(result.correlation, 1)
  }
})
