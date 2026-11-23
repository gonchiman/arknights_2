import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries } from '../src/lib/damageCalculatorThreeComparison.ts'
import {
  analyzeSkillDps, buildSkillDpsAnalysisDataset, DEFAULT_SKILL_DPS_ANALYSIS_CONFIG,
  calculateSkillDpsInitialSpRatio, getSkillDpsAnalysisAxisValue, SKILL_DPS_ANALYSIS_AXES, SKILL_DPS_ANALYSIS_X_LABELS,
  type SkillDpsAnalysisConfig, type SkillDpsAnalysisDataset, type SkillDpsObservation,
} from '../src/lib/skillDpsAnalysis.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const guards = (JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}).guards
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
const melee = JSON.parse(readFileSync(new URL('../src/data/expandedMeleeSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]

function record(operatorId: string, skillIndex: number): SkillRecord {
  const expanded = melee.find(source => source.operatorId === operatorId)
  const guard = guards.find(source => source.id === operatorId)
  const source = (expanded?.skills ?? guard!.skills).find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(source.raw)
  return { id: `${operatorId}/${skillIndex}`, operatorId, operatorName: expanded?.operatorName ?? guard!.name,
    skillId: source.skillId, skillIndex, skillName: raw.name!, profession: expanded?.profession ?? 'WARRIOR',
    professionLabel: expanded?.profession ?? '前衛', rarity: expanded?.rarity ?? 6,
    subProfessionId: expanded?.subProfessionId ?? guard!.subProfessionId,
    subProfessionName: expanded?.subProfessionId ?? guard!.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: (expanded?.skillLevelIndex ?? 9) + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(expanded?.profile ?? profiles.find(profile => profile.operatorId === operatorId)!.operatorProfile) }
}

const config = (overrides: Partial<SkillDpsAnalysisConfig> = {}): SkillDpsAnalysisConfig => (
  { ...DEFAULT_SKILL_DPS_ANALYSIS_CONFIG, ...overrides }
)

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should be close to ${expected}`)
}

test('one operator/skill is one observation and its DPS is ordinary DC3 at the selected common enemy', () => {
  const skill = record('char_264_f12yin', 3)
  const changedSummary = { ...skill, spCost: 999, initSp: 999, duration: 999 }
  const options = config({ defense: 450, resistance: 40 })
  const dataset = buildSkillDpsAnalysisDataset([changedSummary, changedSummary], options)
  assert.equal(dataset.consideredCount, 1)
  assert.equal(dataset.excludedCount, 0)
  assert.equal(dataset.observations.length, 1)
  const actual = dataset.observations[0]
  const entry = getDamageThreeComparisonEntries([changedSummary]).find(entry => entry.kind === 'NORMAL')!
  const expected = evaluateDamageThreeComparisonEntry(entry, { defense: 450, resistance: 40, enemyCount: 1 })
  assert.equal(actual.directDps, expected.dps)
  assert.equal(actual.combinedDps, expected.combinedDps)
  assert.equal(actual.stageLabel, entry.stageLabel)
  assert.equal(actual.durationSeconds, 30)
  assert.equal(actual.spCost, 40)
  assert.equal(actual.initialSp, 25)
  assert.equal(actual.spGap, 15)
  close(actual.uptime!, 30 / (30 + 40) * 100)
  assert.equal(actual.uptimeUnavailableReason, null)
  assert.equal(actual.deploymentCost, 11)
  close(actual.initialRatio!, 62.5)
  assert.equal(actual.attack, expected.finalAttack)
  assert.equal(actual.attackInterval, expected.output!.attackInterval)
  assert.equal(actual.maxTargets, expected.output!.maxTargetCount)
  assert.notEqual(actual.maxTargets, expected.actualTargetCount)
})

test('multiple NORMAL stages and non-NORMAL skills never become a best-DPS sample', () => {
  const dataset = buildSkillDpsAnalysisDataset([
    record('char_264_f12yin', 2), record('char_2024_chyue', 2), record('char_264_f12yin', 3),
  ], config())
  assert.equal(dataset.consideredCount, 3)
  assert.equal(dataset.observations.length, 1)
  assert.equal(dataset.observations[0].skill.skillIndex, 3)
  assert.equal(dataset.excludedCount, 2)
  assert.deepEqual(dataset.exclusions, [
    { label: '通常攻撃型なし', count: 1 }, { label: '通常攻撃型の段階が複数', count: 1 },
  ])
})

test('the highest source level and rank 7 require an exact reviewed DC3 level', () => {
  const mountain = record('char_264_f12yin', 3)
  const futureLevel = structuredClone(mountain)
  futureLevel.skillLevels.push(structuredClone(futureLevel.raw))
  const future = buildSkillDpsAnalysisDataset([futureLevel], config())
  assert.equal(future.observations.length, 0)
  assert.deepEqual(future.exclusions, [{ label: 'スキルLv未対応', count: 1 }])
  const rank7 = buildSkillDpsAnalysisDataset([mountain], config({ skillLevel: 'RANK_7' }))
  assert.equal(rank7.observations.length, 0)
  assert.deepEqual(rank7.exclusions, [{ label: 'スキルLv未対応', count: 1 }])
  const melantha = record('char_208_melan', 1)
  assert.equal(melantha.skillLevels.length, 7)
  const lowRarity = buildSkillDpsAnalysisDataset([melantha], config({ skillLevel: 'RANK_7' }))
  assert.equal(lowRarity.observations.length, 1)
  assert.equal(lowRarity.excludedCount, 0)
})

test('permanent and ammunition durations stay missing without removing their SP/DPS observations', () => {
  const permanent = record('char_017_huang', 2)
  const ammo = record('char_1032_excu2', 1)
  for (const [skill, recovery] of [[permanent, 'INCREASE_WITH_TIME'], [ammo, 'INCREASE_WHEN_ATTACK']] as const) {
    const dataset = buildSkillDpsAnalysisDataset([skill], config({ spRecovery: recovery }))
    assert.equal(dataset.excludedCount, 0)
    assert.equal(dataset.observations.length, 1)
    assert.equal(dataset.observations[0].durationSeconds, null)
    assert.equal(dataset.observations[0].uptime, null)
    assert.ok(dataset.observations[0].uptimeUnavailableReason)
    assert.notEqual(dataset.observations[0].directDps, null)
    assert.equal(analyzeSkillDps(dataset, 'duration', 'direct').missingValueCount, 1)
    assert.equal(analyzeSkillDps(dataset, 'spCost', 'direct').missingValueCount, 0)
  }
})

test('source recovery groups stay separate, SP-less skills never become zero-SP observations', () => {
  const attack = record('char_350_surtr', 1)
  const natural = record('char_350_surtr', 2)
  const noSp = record('char_263_skadi', 2)
  const naturalData = buildSkillDpsAnalysisDataset([attack, natural, noSp], config())
  assert.equal(naturalData.consideredCount, 1)
  assert.deepEqual(naturalData.observations.map(row => row.skill.skillIndex), [2])
  const attackData = buildSkillDpsAnalysisDataset([attack, natural, noSp], config({ spRecovery: 'INCREASE_WHEN_ATTACK' }))
  assert.equal(attackData.consideredCount, 1)
  assert.deepEqual(attackData.exclusions, [{ label: '通常攻撃型なし', count: 1 }])
  assert.equal(buildSkillDpsAnalysisDataset([natural], config({ damageType: 'PHYSICAL' })).consideredCount, 0)
  assert.equal(buildSkillDpsAnalysisDataset([natural], config({ rarity: 5 })).consideredCount, 0)
  assert.equal(buildSkillDpsAnalysisDataset([natural], config({ profession: 'CASTER' })).consideredCount, 0)
})

test('unknown coverage and unresolved DC3 conditions are counted instead of emitting numbers', () => {
  const unknown = { ...record('char_264_f12yin', 3), operatorId: 'unreviewed-operator' }
  const invalid = record('char_350_surtr', 2)
  invalid.operatorProfile.phases[2].attributesKeyFrames = []
  const dataset = buildSkillDpsAnalysisDataset([unknown, invalid], config())
  assert.equal(dataset.consideredCount, 2)
  assert.equal(dataset.observations.length, 0)
  assert.equal(dataset.excludedCount, 2)
  assert.deepEqual(dataset.exclusions, [{ label: 'DC3未対応', count: 1 }, { label: '計算条件未解決', count: 1 }])
})

test('steady DoT combined DPS keeps DC3 semantics rather than dividing a duration total', () => {
  const thorns = record('char_293_thorns', 1)
  const dataset = buildSkillDpsAnalysisDataset([thorns], config())
  assert.equal(dataset.observations.length, 1)
  const actual = dataset.observations[0]
  const entry = getDamageThreeComparisonEntries([thorns]).find(row => row.kind === 'NORMAL')!
  const expected = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount: 1 })
  assert.equal(actual.combinedDps, expected.combinedDps)
  assert.equal(actual.directDps, expected.dps)
  assert.ok(actual.combinedDps! > actual.directDps!)
  assert.equal(expected.totalDamage, null)
})

test('a missing combined DoT rate does not remove a valid direct DPS observation', () => {
  const thorns = record('char_293_thorns', 1)
  // A deliberately slow but finite attack interval leaves the poison's maintained
  // rate unresolved in the existing DC3 engine, while direct DPS is still valid.
  for (const frame of thorns.operatorProfile.phases[2].attributesKeyFrames ?? []) {
    if (frame.data) frame.data.baseAttackTime = 100
  }
  const dataset = buildSkillDpsAnalysisDataset([thorns], config())
  assert.equal(dataset.observations.length, 1)
  assert.equal(dataset.excludedCount, 0)
  assert.ok(Number.isFinite(dataset.observations[0].directDps))
  assert.equal(dataset.observations[0].combinedDps, null)
  assert.equal(analyzeSkillDps(dataset, 'duration', 'direct').missingValueCount, 0)
  assert.equal(analyzeSkillDps(dataset, 'duration', 'combined').missingValueCount, 1)
})

test('a summon NORMAL stage is not another owner stage or another operator/skill observation', () => {
  const skill = record('char_4016_kazema', 2)
  const entries = getDamageThreeComparisonEntries([skill]).filter(entry => entry.kind === 'NORMAL')
  assert.equal(entries.length, 2)
  const dataset = buildSkillDpsAnalysisDataset([skill], config())
  assert.equal(dataset.consideredCount, 1)
  assert.equal(dataset.excludedCount, 0)
  assert.equal(dataset.observations.length, 1)
  assert.equal(dataset.observations[0].stageLabel, 'カゼマル本人・スキル中')
})

const sampleSkill = record('char_264_f12yin', 3)
function sample(id: number, patch: Partial<SkillDpsObservation> = {}): SkillDpsObservation {
  return { id: String(id), skill: sampleSkill, stageLabel: 'スキル中', durationSeconds: id,
    spCost: id, initialSp: 5, spGap: id - 5, directDps: id * 3, combinedDps: id * 3 + 2,
    deploymentCost: id, initialRatio: id * 10, uptime: id * 5, uptimeUnavailableReason: null,
    maxTargets: id + 1, attack: id * 100, attackInterval: id / 10,
    damageType: 'PHYSICAL', ...patch }
}
function dataset(observations: SkillDpsObservation[]): SkillDpsAnalysisDataset {
  return { observations, consideredCount: observations.length, excludedCount: 0, exclusions: [] }
}

test('each axis and metric uses its own finite pairs, preserving confirmed zero DPS and negative SP gaps', () => {
  const input = dataset([
    sample(0), sample(1), sample(2), sample(3),
    sample(4, { durationSeconds: null, combinedDps: null }),
    sample(5, { directDps: null, spCost: null, spGap: null }),
    sample(6, { durationSeconds: Infinity, directDps: NaN, combinedDps: Infinity }),
  ])
  const duration = analyzeSkillDps(input, 'duration', 'direct')
  assert.equal(duration.missingValueCount, 3)
  assert.deepEqual(duration.observations.map(({ x, y }) => [x, y]), [[0, 0], [1, 3], [2, 6], [3, 9]])
  assert.equal(duration.error, null)
  close(duration.fit!.intercept, 0)
  close(duration.fit!.coefficients[0], 3)
  close(duration.correlation!, 1)
  const combined = analyzeSkillDps(input, 'duration', 'combined')
  assert.equal(combined.missingValueCount, 2)
  close(combined.fit!.intercept, 2)
  close(combined.fit!.coefficients[0], 3)
  const gap = analyzeSkillDps(input, 'spGap', 'direct')
  assert.equal(gap.missingValueCount, 2)
  assert.equal(gap.observations[0].x, -5)
  close(gap.fit!.intercept, 15)
  close(gap.fit!.coefficients[0], 3)
})

test('negative correlation and outliers are retained, while insufficient or constant data reports no fit', () => {
  const decreasing = analyzeSkillDps(dataset([0, 1, 2, 3].map(id => sample(id, { directDps: 12 - id * 2 }))), 'spCost', 'direct')
  close(decreasing.correlation!, -1)
  close(decreasing.fit!.coefficients[0], -2)
  const withOutlier = analyzeSkillDps(dataset([sample(1), sample(2), sample(3), sample(4, { directDps: 1000 })]), 'spCost', 'direct')
  assert.equal(withOutlier.observations.length, 4)
  assert.equal(withOutlier.fit!.observationCount, 4)
  for (const rows of [[sample(1), sample(2)], [sample(1), sample(1), sample(1)],
    [sample(1), sample(2), sample(3)].map(row => ({ ...row, directDps: 0 }))]) {
    const result = analyzeSkillDps(dataset(rows), 'spCost', 'direct')
    assert.equal(result.fit, null)
    assert.equal(result.correlation, null)
    assert.ok(result.error)
    assert.equal(result.observations.length, rows.length)
  }
})

test('nine axes share stable keys, concise names and correctly labelled units', () => {
  assert.deepEqual(SKILL_DPS_ANALYSIS_AXES.map(([key]) => key), [
    'duration', 'spCost', 'spGap', 'deploymentCost', 'initialRatio', 'uptime', 'maxTargets', 'attack', 'interval',
  ])
  assert.equal(new Set(SKILL_DPS_ANALYSIS_AXES.map(([key]) => key)).size, 9)
  assert.equal(SKILL_DPS_ANALYSIS_X_LABELS.initialRatio, '初期SP率（%）')
  assert.equal(SKILL_DPS_ANALYSIS_X_LABELS.uptime, '理論稼働率（%）')
  assert.equal(SKILL_DPS_ANALYSIS_X_LABELS.interval, '攻撃間隔（秒）')
  assert.equal(SKILL_DPS_ANALYSIS_X_LABELS.maxTargets, '最大対象数（体）')
  assert.equal(SKILL_DPS_ANALYSIS_X_LABELS.attack, '軽減前攻撃力')
})

test('initial SP ratio retains zero and values above 100%, but never divides by absent or zero cost', () => {
  assert.equal(calculateSkillDpsInitialSpRatio(0, 10), 0)
  assert.equal(calculateSkillDpsInitialSpRatio(10, 10), 100)
  assert.equal(calculateSkillDpsInitialSpRatio(15, 10), 150)
  for (const [initial, cost] of [[0, 0], [5, 0], [5, null], [null, 5], [5, -1],
    [Infinity, 5], [5, NaN], [-1, 5]] as const) {
    assert.equal(calculateSkillDpsInitialSpRatio(initial, cost), null)
  }
})

test('base deployment cost comes from the max-growth operator, preserving zero and missing independently of DPS', () => {
  const missing = record('char_264_f12yin', 3)
  for (const frame of missing.operatorProfile.phases[2].attributesKeyFrames ?? []) {
    if (frame.data) delete frame.data.cost
  }
  const zero = record('char_350_surtr', 2)
  for (const frame of zero.operatorProfile.phases[2].attributesKeyFrames ?? []) {
    if (frame.data) frame.data.cost = 0
  }
  const values = buildSkillDpsAnalysisDataset([missing, zero], config())
  assert.equal(values.observations.length, 2)
  assert.equal(values.excludedCount, 0)
  assert.equal(values.observations[0].deploymentCost, null)
  assert.equal(values.observations[1].deploymentCost, 0)
  assert.equal(analyzeSkillDps(values, 'deploymentCost', 'direct').missingValueCount, 1)
  assert.equal(analyzeSkillDps(values, 'spCost', 'direct').missingValueCount, 0)
})

test('confirmed unlimited targets remain a category, distinct from unknown capacity and the common enemy count', () => {
  const values = buildSkillDpsAnalysisDataset([record('char_017_huang', 3)], config())
  assert.equal(values.observations.length, 1)
  assert.equal(values.observations[0].maxTargets, 'UNLIMITED')
  const input = dataset([sample(0, { maxTargets: 1 }), sample(1, { maxTargets: 3 }),
    sample(2, { maxTargets: 'UNLIMITED' }), sample(3, { maxTargets: null }),
    sample(4, { maxTargets: 0 }), sample(5, { maxTargets: Infinity }),
    sample(6, { maxTargets: 'UNLIMITED', directDps: null }),
  ])
  const result = analyzeSkillDps(input, 'maxTargets', 'direct')
  assert.deepEqual(result.observations.map(({ x }) => x), [1, 3, 'UNLIMITED'])
  assert.equal(result.observations[0].y, 0)
  assert.equal(result.missingValueCount, 4)
  assert.equal(result.fit, null)
  assert.equal(result.correlation, null)
  assert.equal(result.error, null)
  assert.deepEqual(result.missingValueReasons, [{ label: '最大対象数・DPS未確定', count: 4 }])
})

test('non-unique attack values are missing only on the attack axis, without replacing them by maximum or mean', () => {
  // Mountain's ordinary and critical strikes have different pre-mitigation values.
  const values = buildSkillDpsAnalysisDataset([record('char_264_f12yin', 3)], config())
  assert.equal(values.observations.length, 1)
  assert.ok(Number.isFinite(values.observations[0].directDps))
  assert.equal(values.observations[0].attack, null)
  assert.equal(analyzeSkillDps(values, 'attack', 'direct').missingValueCount, 1)
  assert.equal(analyzeSkillDps(values, 'duration', 'direct').missingValueCount, 0)
})

test('a unique pre-mitigation attack value and effective interval match the ordinary DC3 result', () => {
  const skill = record('char_350_surtr', 2)
  const values = buildSkillDpsAnalysisDataset([skill], config({ defense: 500, resistance: 35 }))
  assert.equal(values.observations.length, 1)
  const entry = getDamageThreeComparisonEntries([skill]).find(entry => entry.kind === 'NORMAL')!
  const expected = evaluateDamageThreeComparisonEntry(entry, { defense: 500, resistance: 35, enemyCount: 1 })
  assert.ok(Number.isFinite(expected.finalAttack))
  assert.equal(values.observations[0].attack, expected.finalAttack)
  assert.equal(values.observations[0].attackInterval, expected.output!.attackInterval)
  assert.equal(values.observations[0].deploymentCost, 21)
})

test('new numeric axes use independent observations and the ordinary unweighted OLS', () => {
  const input = dataset([1, 2, 3, 4].map(index => sample(index)))
  for (const axis of ['deploymentCost', 'initialRatio', 'uptime', 'attack', 'interval'] as const) {
    const result = analyzeSkillDps(input, axis, 'direct')
    assert.equal(result.observations.length, 4)
    assert.equal(result.missingValueCount, 0)
    assert.deepEqual(result.missingValueReasons, [])
    assert.equal(result.error, null)
    close(result.correlation!, 1)
    result.observations.forEach(observation => assert.equal(observation.x, getSkillDpsAnalysisAxisValue(observation, axis)))
  }
  const incomplete = dataset([sample(0), sample(1, { attack: null }), sample(2, { attackInterval: 0 }),
    sample(3, { initialRatio: Infinity }), sample(4, { deploymentCost: null }),
  ])
  assert.equal(analyzeSkillDps(incomplete, 'attack', 'direct').missingValueCount, 1)
  assert.equal(analyzeSkillDps(incomplete, 'interval', 'direct').missingValueCount, 2)
  assert.equal(analyzeSkillDps(incomplete, 'initialRatio', 'direct').missingValueCount, 1)
  assert.equal(analyzeSkillDps(incomplete, 'deploymentCost', 'direct').missingValueCount, 1)
  assert.equal(analyzeSkillDps(incomplete, 'spCost', 'direct').missingValueCount, 0)
})

test('unavailable uptime reasons are counted once per missing pair, after DPS missingness', () => {
  const input = dataset([
    sample(0, { uptime: null, uptimeUnavailableReason: '反復周期未確認', directDps: null }),
    sample(1, { uptime: null, uptimeUnavailableReason: '反復周期未確認' }),
    sample(2, { uptime: null, uptimeUnavailableReason: '有限期間なし' }),
    sample(3, { uptime: 0 }),
  ])
  const result = analyzeSkillDps(input, 'uptime', 'direct')
  assert.equal(result.missingValueCount, 3)
  assert.deepEqual(result.missingValueReasons, [
    { label: '理論稼働率・DPS未確定', count: 1 }, { label: '反復周期未確認', count: 1 }, { label: '有限期間なし', count: 1 },
  ])
  assert.equal(result.observations[0].x, 0)
  assert.equal(result.missingValueReasons.reduce((total, row) => total + row.count, 0), result.missingValueCount)
  assert.equal(analyzeSkillDps(input, 'spCost', 'direct').missingValueCount, 1)
})
