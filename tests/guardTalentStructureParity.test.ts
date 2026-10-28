import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import type { DamageCalculatorThreeOutput, DamageCalculatorThreeRow } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

type Value = number | string | boolean | null
interface Snapshot {
  blocked: boolean
  rowCount: number
  summary: Value[]
  rows: (number | null)[][]
}
interface BaselineCase {
  operatorId: string
  skillIndex: number
  guard: GuardConditions
  expected: Snapshot
}

// Captured before the migration, directly from the per-operator implementation at
// sourceCommit. Never regenerate these expectations from the new evaluator.
const baseline = JSON.parse(readFileSync(new URL('./fixtures/guardTalentCalculationBaseline.json', import.meta.url), 'utf8')) as {
  sourceCommit: string
  evaluatorBlob: string
  summaryFields: (keyof DamageCalculatorThreeOutput)[]
  rowFields: (keyof DamageCalculatorThreeRow)[]
  cases: BaselineCase[]
}
const data = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; supported: boolean; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]

function record(id: string, index: number): SkillRecord {
  const operator = data.guards.find(value => value.id === id)!
  const entry = operator.skills.find(value => value.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: operator.name, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === id)!.operatorProfile) }
}

function snapshot(output: DamageCalculatorThreeOutput): Snapshot {
  // Compare several defenses/resistances, including the damage floor. Table row
  // counts are checked separately, so changed axis generation cannot go unnoticed.
  const indices = [...new Set([0, 1, Math.floor(output.rows.length / 2), output.rows.length - 1])]
    .filter(index => index >= 0 && index < output.rows.length)
  return {
    blocked: output.unsupportedReasons.length > 0,
    rowCount: output.rows.length,
    summary: baseline.summaryFields.map(key => output[key] as Value),
    rows: indices.map(index => baseline.rowFields.map(key => output.rows[index][key] as number | null)),
  }
}

function equalValue(actual: Value, expected: Value, label: string) {
  if (typeof expected !== 'number') {
    assert.equal(actual, expected, label)
    return
  }
  assert.equal(typeof actual, 'number', label)
  assert.ok(Number.isFinite(actual), `${label}: must be finite`)
  // Allow only floating point evaluation-order differences, not display rounding.
  const tolerance = 1e-10 * Math.max(1, Math.abs(expected))
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`)
}

test('回帰基準は旧実装から取得した25人75スキルの全初期条件を含む', () => {
  assert.equal(baseline.sourceCommit, 'd2cef808b54742501804642e47b324d1e46e0fb4')
  assert.match(baseline.evaluatorBlob, /^[0-9a-f]{40}$/)
  const expected = data.guards.flatMap(operator => operator.skills.filter(skill => !skill.supported)
    .map(skill => `${operator.id}/${skill.skillIndex}`)).sort()
  const defaults = baseline.cases.filter(item => Object.keys(item.guard).length === 0)
  assert.equal(new Set(defaults.map(item => item.operatorId)).size, 25)
  assert.equal(defaults.length, 75)
  assert.deepEqual(defaults.map(item => `${item.operatorId}/${item.skillIndex}`).sort(), expected)
  assert.equal(new Set(baseline.cases.map(item => `${item.operatorId}/${item.skillIndex}/${JSON.stringify(item.guard)}`)).size,
    baseline.cases.length)
  assert.ok(baseline.cases.some(item => item.expected.blocked && item.expected.rowCount === 0))
  assert.ok(baseline.cases.some(item => !item.expected.blocked && item.expected.rowCount > 0))
})

for (const operatorId of new Set(baseline.cases.map(item => item.operatorId))) {
  const name = data.guards.find(operator => operator.id === operatorId)!.name
  test(`${name}: 素質の構造化前後で既定値・端点・条件・段階の計算結果と出力可否が一致する`, () => {
    for (const item of baseline.cases.filter(value => value.operatorId === operatorId)) {
      const skill = record(item.operatorId, item.skillIndex)
      const output = buildDamageCalculatorThreeOutput({ operator: skill, skill,
        phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, conditions: { guard: item.guard } })
      const actual = snapshot(output)
      const label = `${name} S${item.skillIndex} ${JSON.stringify(item.guard)}`
      assert.equal(actual.blocked, item.expected.blocked, `${label}: output availability`)
      assert.equal(actual.rowCount, item.expected.rowCount, `${label}: row count`)
      assert.equal(actual.summary.length, item.expected.summary.length, `${label}: summary length`)
      actual.summary.forEach((value, index) => equalValue(value, item.expected.summary[index], `${label}: ${baseline.summaryFields[index]}`))
      assert.equal(actual.rows.length, item.expected.rows.length, `${label}: sampled rows`)
      actual.rows.forEach((row, index) => {
        assert.equal(row.length, item.expected.rows[index].length, `${label}: row fields`)
        row.forEach((value, field) => equalValue(value, item.expected.rows[index][field], `${label}: row ${index} ${baseline.rowFields[field]}`))
      })
    }
  })
}
