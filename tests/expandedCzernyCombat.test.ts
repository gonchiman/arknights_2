import test from 'node:test'
import assert from 'node:assert/strict'
import sourcesJson from '../src/data/expandedMeleeSources.json' with { type: 'json' }
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = sourcesJson as unknown as ExpandedOperatorSource[]
function record(suffix: string, skillIndex: number): SkillRecord {
  const source = sources.find(source => source.operatorId.endsWith(`_${suffix}`))!
  const entry = source.skills.find(skill => skill.skillIndex === skillIndex)!, raw = structuredClone(entry.raw)
  return { id: `${source.operatorId}/${skillIndex}`, operatorId: source.operatorId, operatorName: source.operatorName,
    skillId: entry.skillId, skillIndex, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
    nameInitial: 'OTHER', description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
    skillType: raw.skillType!, spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    raw, operatorProfile: structuredClone(source.profile) }
}
function output(suffix: string, skillIndex: number, guard: GuardConditions = {}) {
  return outputRecord(record(suffix, skillIndex), guard)
}
function outputRecord(skill: SkillRecord, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  const source = sources.find(source => source.operatorId === skill.operatorId)!
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard }, ...options })
}
function at(suffix: string, skillIndex: number, axis = 0, conditions: GuardConditions = {}) {
  const result = output(suffix, skillIndex, conditions)
  assert.deepEqual(result.unsupportedReasons, [], `${suffix} S${skillIndex}`)
  const row = result.rows.find(row => row.axisValue === axis)!
  assert.ok(row, `${suffix} S${skillIndex} axis ${axis}`)
  return { result, row }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const buffed = (attack: number, ratio: number) => Math.floor(attack * (1 + ratio) + 1e-9)
const physical = (attack: number, defense: number) => Math.max(attack - defense, attack * 0.05)

function fixed(suffix: string, index: number, guard: GuardConditions = {}, defense = 1000, resistance = 60,
  virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const result = outputRecord(record(suffix, index), guard, { enemy: { defense, resistance }, virtualMainAttackType })
  assert.deepEqual(result.unsupportedReasons, [], `${suffix} S${index}`)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}

test('ツェルニーS2は累積数0〜10の通常攻撃と18.6秒後の爆発を個別計算する', () => {
  for (const stacks of [0, 1, 5, 10]) for (const phase of ['normal', 'finale']) {
    const count = phase === 'normal' ? 1 : 4
    const { result, row } = fixed('pianst', 2, { pianstStacks: stacks, damagePhase: phase, actualAttackTargetCount: count })
    const expected = Math.floor(665 * (1 + stacks * 0.3)) * (phase === 'normal' ? 1 : 2.5) * 0.4
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * count)
    assert.equal(row.dps, null)
    assert.equal(row.attackComponents?.length, 1)
  }
})

test('ツェルニーS2の反撃は今回被弾前の累積0〜10で80%を1回、被弾後の増加を含めない', () => {
  for (const stacks of [0, 1, 5, 9, 10]) {
    const { row } = fixed('pianst', 2, { pianstStacks: stacks, damagePhase: 'counter' })
    const attack = Math.floor(665 * (1 + stacks * 0.3))
    close(row.perAttack, attack * 0.8 * 0.4)
    assert.equal(row.dps, null)
    assert.equal(row.attackComponents?.length, 1)
    if (stacks < 10) assert.notEqual(row.perAttack, Math.floor(665 * (1 + (stacks + 1) * 0.3)) * 0.8 * 0.4)
    const physical = fixed('pianst', 2, { pianstStacks: stacks, damagePhase: 'counter' }, 1000, 60, 'PHYSICAL')
    close(physical.row.perAttack, Math.max(attack * 0.8 - 1000, attack * 0.8 * 0.05))
  }
  for (const stacks of [-1, 1.5, 11]) assert.deepEqual(output('pianst', 2, { pianstStacks: stacks, damagePhase: 'counter' }).rows, [])
})
