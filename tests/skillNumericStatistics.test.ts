import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  buildSkillNumericDataset, DEFAULT_SKILL_NUMERIC_CONFIG, getSkillNumericValue,
  SKILL_NUMERIC_METRICS, summarizeSkillNumericMetric,
  type SkillNumericConfig,
} from '../src/lib/skillNumericStatistics.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const raw = (changes: Partial<RawSkillLevel> = {}): RawSkillLevel => ({
  name: 'スキル', description: '攻撃力が上昇', duration: 30, durationType: 'NONE', skillType: 'MANUAL',
  spData: { spType: 'INCREASE_WITH_TIME', spCost: 40, initSp: 0 }, ...changes,
})
function record(id: string, levels = [raw()], changes: Partial<SkillRecord> = {}): SkillRecord {
  const last = levels[levels.length - 1] ?? raw()
  return {
    id, operatorId: id, operatorName: id, profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: 'lord', subProfessionName: '領主', nameInitial: 'OTHER', rarity: 6,
    skillIndex: 1, skillId: 'shared', skillName: last.name ?? '', description: last.description ?? '',
    duration: last.duration ?? null, durationType: last.durationType ?? '', skillType: last.skillType ?? '',
    spType: last.spData?.spType ?? '', initSp: last.spData?.initSp ?? null, spCost: last.spData?.spCost ?? null,
    classification: classifySkill(last), raw: last, skillLevels: levels,
    operatorProfile: {} as OperatorCombatProfile, ...changes,
  }
}
const config = (changes: Partial<SkillNumericConfig> = {}): SkillNumericConfig => ({ ...DEFAULT_SKILL_NUMERIC_CONFIG, ...changes })
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`)

test('one operator/skill identity uses raw selected-level values and has no DC3 coverage requirement', () => {
  const first = record('unreviewed', [raw()], { duration: 999, initSp: 999, spCost: 999 })
  const anotherOperator = record('second', [raw()], { skillName: first.skillName })
  const anotherSlot = { ...first, skillIndex: 2 }
  const dataset = buildSkillNumericDataset([first, first, anotherOperator, anotherSlot], config())
  assert.equal(dataset.observations.length, 3)
  assert.equal(new Set(dataset.observations.map(row => row.id)).size, 3)
  assert.equal(dataset.unavailableLevelCount, 0)
  assert.deepEqual(dataset.observations.map(row => [row.durationSeconds, row.spCost, row.initialSp, row.spGap]), [
    [30, 40, 0, 40], [30, 40, 0, 40], [30, 40, 0, 40],
  ])
})

test('highest and rank 7 choose exact raw levels and filter on that level recovery', () => {
  const levels = Array.from({ length: 10 }, () => raw())
  levels[6] = raw({ duration: 18, spData: { spType: 'INCREASE_WHEN_ATTACK', spCost: 15, initSp: 20 } })
  levels[9] = raw({ duration: 25, spData: { spType: 'INCREASE_WITH_TIME', spCost: 20, initSp: 10 } })
  const skill = record('levels', levels)
  const maximum = buildSkillNumericDataset([skill], config()).observations[0]
  assert.equal(maximum.skillLevelIndex, 9)
  assert.equal(maximum.skillLevelLabel, '特化3')
  assert.deepEqual([maximum.durationSeconds, maximum.spGap], [25, 10])
  assert.equal(maximum.initialRatio, 50)
  assert.equal(buildSkillNumericDataset([skill], config({ skillLevel: 'RANK_7' })).observations.length, 0)
  const rank7 = buildSkillNumericDataset([skill], config({ skillLevel: 'RANK_7', spRecovery: 'INCREASE_WHEN_ATTACK' })).observations[0]
  assert.equal(rank7.skillLevelIndex, 6)
  assert.equal(rank7.skillLevelLabel, 'Lv.7')
  assert.deepEqual([rank7.durationSeconds, rank7.spCost, rank7.initialSp, rank7.spGap], [18, 15, 20, -5])
  close(rank7.initialRatio, 400 / 3)
})

test('missing exact levels never fall back to row.raw or another level and are counted before SP filtering', () => {
  const short = record('short', [raw({ spData: { spType: 'NO_SP' } })])
  const empty = record('empty', [])
  const outOfProfession = record('other', [], { profession: 'CASTER' })
  const dataset = buildSkillNumericDataset([short, empty, outOfProfession, short], config({ skillLevel: 'RANK_7', profession: 'WARRIOR' }))
  assert.equal(dataset.unavailableLevelCount, 2)
  assert.deepEqual(dataset.observations, [])
  const summary = summarizeSkillNumericMetric(dataset, 'spCost')
  assert.equal(summary.validCount, 0)
  assert.equal(summary.excludedCount, 0)
})

test('profession, rarity and all supported recovery types produce separate selected cohorts', () => {
  const rows = [
    record('natural'),
    record('attack', [raw({ spData: { spType: 'INCREASE_WHEN_ATTACK', spCost: 5, initSp: 0 } })], { rarity: 4 }),
    record('defense', [raw({ spData: { spType: 'INCREASE_WHEN_TAKEN_DAMAGE', spCost: 20, initSp: 5 } })], { profession: 'DEFENDER' }),
    record('passive', [raw({ skillType: 'PASSIVE', spData: { spType: 'NO_SP', spCost: 0, initSp: 0 } })]),
  ]
  for (const [spRecovery, id] of [
    ['INCREASE_WITH_TIME', 'natural'], ['INCREASE_WHEN_ATTACK', 'attack'],
    ['INCREASE_WHEN_TAKEN_DAMAGE', 'defense'], ['NO_SP', 'passive'],
  ] as const) {
    assert.deepEqual(buildSkillNumericDataset(rows, config({ spRecovery })).observations.map(row => row.skill.operatorId), [id])
  }
  assert.equal(buildSkillNumericDataset(rows, config({ rarity: 4 })).observations.length, 0)
  assert.equal(buildSkillNumericDataset(rows, config({ profession: 'DEFENDER' })).observations.length, 0)
})

test('ammo, permanent, toggle and instant states never become zero or inferred seconds', () => {
  const rows = [
    record('finite', [raw({ duration: .5 })]),
    record('ammo', [raw({ duration: 10, durationType: 'AMMO' })]),
    record('permanent', [raw({ duration: -1, description: '退場まで効果継続' })]),
    record('toggle', [raw({ duration: -1, description: '手動でスキルを停止可能' })]),
    record('instant', [raw({ duration: 0, description: '即座に術ダメージを与える' })]),
    record('inferred', [raw({ duration: -1, skillType: 'PASSIVE', description: '配置後20秒間攻撃力が上昇' })]),
    record('unknown', [raw({ duration: Number.NaN, description: '' })]),
  ]
  const dataset = buildSkillNumericDataset(rows, config())
  assert.deepEqual(dataset.observations.map(row => row.durationSeconds), [.5, null, null, null, null, null, null])
  assert.deepEqual(dataset.observations.map(row => row.durationState), ['FIXED_DURATION', 'AMMO', 'PERMANENT', 'TOGGLE_OR_MODE', 'NONE', 'UNKNOWN', 'UNKNOWN'])
  const duration = summarizeSkillNumericMetric(dataset, 'duration')
  assert.equal(duration.validCount, 1)
  assert.equal(duration.excludedCount, 6)
  assert.equal(duration.statistics.mean, .5)
  assert.equal(summarizeSkillNumericMetric(dataset, 'spCost').validCount, 7)
})

test('NO_SP source zero values are not zero-SP observations; finite duration stays independently valid', () => {
  const dataset = buildSkillNumericDataset([record('no-sp', [raw({ spData: { spType: 'NO_SP', spCost: 0, initSp: 0 } })])], config({ spRecovery: 'NO_SP' }))
  const observation = dataset.observations[0]
  assert.equal(observation.durationSeconds, 30)
  for (const metric of ['spCost', 'initialSp', 'spGap', 'initialRatio'] as const) {
    assert.equal(getSkillNumericValue(observation, metric), null)
    const summary = summarizeSkillNumericMetric(dataset, metric)
    assert.equal(summary.validCount, 0)
    assert.equal(summary.excludedCount, 1)
    assert.equal(summary.boxPlot, null)
    assert.equal(summary.statistics.mean, null)
  }
})

test('runtime numeric 8 selects actual non-SP skills without treating source zero SP as measured values', () => {
  // Runtime skill_table has spType:8 for PASSIVE skills, while the shared raw
  // interface and reviewed skill structures currently use string enum names.
  const runtimePassive = raw({ duration: -1, skillType: 'PASSIVE', description: '配置後、攻撃力が上昇' })
  runtimePassive.spData = { spType: 8, spCost: 0, initSp: 0 } as unknown as RawSkillLevel['spData']
  const unsupported = raw({ skillType: 'PASSIVE' })
  unsupported.spData = { spType: 999, spCost: 0, initSp: 0 } as unknown as RawSkillLevel['spData']
  const rows = [record('runtime-passive', [runtimePassive]), record('unknown-enum', [unsupported]), record('missing-enum', [raw({ spData: {} })]), record('natural')]
  const noSp = buildSkillNumericDataset(rows, config({ spRecovery: 'NO_SP' }))
  assert.deepEqual(noSp.observations.map(row => row.skill.operatorId), ['runtime-passive'])
  assert.deepEqual([noSp.observations[0].spCost, noSp.observations[0].initialSp, noSp.observations[0].spGap], [null, null, null])
  for (const metric of ['spCost', 'initialSp', 'spGap', 'initialRatio'] as const) {
    const summary = summarizeSkillNumericMetric(noSp, metric)
    assert.equal(summary.statistics.totalCount, 1)
    assert.equal(summary.validCount, 0)
    assert.equal(summary.excludedCount, 1)
  }
  assert.deepEqual(buildSkillNumericDataset(rows, config()).observations.map(row => row.skill.operatorId), ['natural'])
})

test('numeric recovery normalization uses the selected level and never changes the source', () => {
  const levels = Array.from({ length: 10 }, () => raw())
  levels[6] = raw({ spData: { spType: 8, spCost: 0, initSp: 0 } as unknown as RawSkillLevel['spData'], skillType: 'PASSIVE' })
  const skill = record('numeric-level', levels)
  assert.equal(buildSkillNumericDataset([skill], config({ spRecovery: 'NO_SP' })).observations.length, 0)
  const rank7 = buildSkillNumericDataset([skill], config({ spRecovery: 'NO_SP', skillLevel: 'RANK_7' })).observations[0]
  assert.equal(rank7.skillLevelIndex, 6)
  assert.equal(rank7.spCost, null)
  assert.equal((levels[6].spData as unknown as { spType: number }).spType, 8)
})

test('missing, negative and nonfinite values are rejected per metric while measured zero and signed gaps remain', () => {
  const rows = [
    record('zero', [raw({ spData: { spType: 'INCREASE_WITH_TIME', spCost: 0, initSp: 0 } })]),
    record('negative-gap', [raw({ spData: { spType: 'INCREASE_WITH_TIME', spCost: 5, initSp: 10 } })]),
    record('bad-cost', [raw({ spData: { spType: 'INCREASE_WITH_TIME', spCost: -1, initSp: 3 } })]),
    record('bad-initial', [raw({ spData: { spType: 'INCREASE_WITH_TIME', spCost: 20, initSp: Infinity } })]),
    record('missing', [raw({ spData: { spType: 'INCREASE_WITH_TIME' } })]),
  ]
  const dataset = buildSkillNumericDataset(rows, config())
  assert.deepEqual(dataset.observations.map(row => row.spGap), [0, -5, null, null, null])
  assert.deepEqual(dataset.observations.map(row => row.initialSp), [0, 10, 3, null, null])
  assert.deepEqual(dataset.observations.map(row => row.spCost), [0, 5, null, 20, null])
  assert.deepEqual(dataset.observations.map(row => row.initialRatio), [null, 200, null, null, null])
  assert.equal(summarizeSkillNumericMetric(dataset, 'duration').validCount, 5)
  assert.equal(summarizeSkillNumericMetric(dataset, 'spCost').validCount, 3)
  assert.equal(summarizeSkillNumericMetric(dataset, 'initialSp').validCount, 3)
  assert.equal(summarizeSkillNumericMetric(dataset, 'spGap').validCount, 2)
})

test('initial SP ratios retain full precision and each valid skill has equal weight', () => {
  const rows = [[0, 10], [1, 3], [10, 10], [35, 10], [5, 0]].map(([initSp, spCost], index) =>
    record(`ratio-${index}`, [raw({ spData: { spType: 'INCREASE_WITH_TIME', initSp, spCost } })]))
  const summary = summarizeSkillNumericMetric(buildSkillNumericDataset(rows, config()), 'initialRatio')
  assert.equal(summary.validCount, 4)
  assert.equal(summary.excludedCount, 1)
  assert.deepEqual(summary.values, [0, 1 / 3 * 100, 100, 350])
  close(summary.statistics.mean, (100 / 3 + 100 + 350) / 4)
})

test('shared statistics preserve unweighted quartiles, population deviation, histogram counts and signed endpoints', () => {
  const dataset = buildSkillNumericDataset([0, 1, 2, 3, 20].map((value, index) => record(`stat-${index}`, [raw({
    spData: { spType: 'INCREASE_WITH_TIME', spCost: value, initSp: 2 },
  })])), config())
  const summary = summarizeSkillNumericMetric(dataset, 'spGap')
  assert.deepEqual(summary.values, [-2, -1, 0, 1, 18])
  assert.equal(summary.statistics.totalCount, 5)
  assert.deepEqual([summary.statistics.minimum, summary.statistics.firstQuartile, summary.statistics.median, summary.statistics.thirdQuartile, summary.statistics.maximum], [-2, -1, 0, 1, 18])
  close(summary.statistics.mean, 3.2)
  close(summary.statistics.standardDeviation, Math.sqrt(55.76))
  assert.equal(summary.statistics.bins.reduce((sum, bin) => sum + bin.count, 0), 5)
  assert.equal(summary.statistics.bins[0].start, -2)
  assert.equal(summary.statistics.bins.at(-1)?.end, 18)
  assert.deepEqual(summary.boxPlot?.outliers, [18])
  assert.equal(summary.boxPlot?.upperWhisker, 1)
})

test('empty and constant datasets have finite bins and no fabricated zero statistics', () => {
  const empty = buildSkillNumericDataset([], config())
  for (const { key } of SKILL_NUMERIC_METRICS) {
    const summary = summarizeSkillNumericMetric(empty, key)
    assert.equal(summary.validCount, 0)
    assert.equal(summary.statistics.median, null)
    assert.equal(summary.boxPlot, null)
  }
  const constant = buildSkillNumericDataset([record('constant', [raw({ spData: { spType: 'INCREASE_WITH_TIME', spCost: 5, initSp: 10 } })])], config())
  const summary = summarizeSkillNumericMetric(constant, 'spGap')
  assert.deepEqual(summary.statistics.bins, [{ start: -5, end: -5, count: 1, includesMaximum: true }])
  assert.equal(summary.statistics.standardDeviation, 0)
})

test('frozen source records and configuration are never mutated', () => {
  const input = record('frozen')
  Object.freeze(input.raw.spData)
  Object.freeze(input.raw)
  Object.freeze(input.skillLevels)
  Object.freeze(input)
  const options = Object.freeze(config())
  const dataset = buildSkillNumericDataset(Object.freeze([input]), options)
  const before = JSON.stringify(dataset)
  for (const { key } of SKILL_NUMERIC_METRICS) summarizeSkillNumericMetric(dataset, key)
  assert.equal(JSON.stringify(dataset), before)
})
