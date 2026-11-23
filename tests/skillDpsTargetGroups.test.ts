import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateWeightedPercentile } from '../src/lib/enemyWeightedHistogram.ts'
import { buildSkillDpsTargetGroups, type SkillDpsTargetPoint } from '../src/lib/skillDpsTargetGroups.ts'

const point = (targetCount: SkillDpsTargetPoint['targetCount'], y: number, id = `${targetCount}:${y}`): SkillDpsTargetPoint => ({ id, targetCount, y })

test('target capacities remain distinct groups, numerically ordered with known unlimited last', () => {
  const groups = buildSkillDpsTargetGroups([point('UNLIMITED', 900), point(10, 600), point(2, 200), point(1, 0), point(2, 400)])
  assert.deepEqual(groups.map(group => [group.label, group.count]), [['1体', 1], ['2体', 2], ['10体', 1], ['上限なし', 1]])
  assert.equal(groups[0].minimum, 0)
  assert.equal(groups[0].median, 0)
  assert.equal(groups.at(-1)?.targetCount, 'UNLIMITED')
})

test('quartiles use the shared unit-frequency definition and whiskers stop at observed values', () => {
  const values = [0, 10, 20, 30, 40, 50, 60, 70, 1000]
  const [group] = buildSkillDpsTargetGroups(values.map(y => point(1, y)))
  const weighted = values.map(value => ({ value, weight: 1 }))
  assert.equal(group.firstQuartile, calculateWeightedPercentile(weighted, 25))
  assert.equal(group.median, calculateWeightedPercentile(weighted, 50))
  assert.equal(group.thirdQuartile, calculateWeightedPercentile(weighted, 75))
  assert.equal(group.lowerWhisker, 0)
  assert.equal(group.upperWhisker, 70)
  assert.deepEqual(group.outliers, [1000])
  assert.equal(group.maximum, 1000)
})

test('unknown, noninteger and invalid capacities never become unlimited or zero groups', () => {
  const groups = buildSkillDpsTargetGroups([
    point(null, 800), point(Number.NaN, 500), point(Number.POSITIVE_INFINITY, 500), point(0, 100), point(-1, 100), point(1.5, 100),
    point(1, Number.NaN), point(1, Number.POSITIVE_INFINITY), point('UNLIMITED', 0),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].targetCount, 'UNLIMITED')
  assert.equal(groups[0].count, 1)
  assert.deepEqual(groups[0].outliers, [])
})

test('constant and sparse groups retain every supplied skill without invented spread', () => {
  const source = Object.freeze([Object.freeze(point(1, 100, 'a')), Object.freeze(point(1, 100, 'b')), Object.freeze(point(3, 400, 'c'))])
  const groups = buildSkillDpsTargetGroups(source)
  assert.equal(groups[0].count, 2)
  assert.equal(groups[0].firstQuartile, 100)
  assert.equal(groups[0].thirdQuartile, 100)
  assert.equal(groups[0].lowerWhisker, 100)
  assert.equal(groups[0].upperWhisker, 100)
  assert.deepEqual(groups[0].values.map(value => value.id), ['a', 'b'])
  assert.deepEqual(groups[1].values, [{ id: 'c', value: 400 }])
  assert.deepEqual(buildSkillDpsTargetGroups([]), [])
})
