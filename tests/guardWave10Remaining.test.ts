import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { SkillRecord, OperatorCombatProfile, RawSkillLevel } from '../src/types/skill.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'

const data = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function record(id: string): SkillRecord {
  const operator = data.guards.find(value => value.id === id)!, entry = operator.skills.find(value => value.skillIndex === 3)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/3`, operatorId: id, operatorName: operator.name, skillId: entry.skillId,
    skillIndex: 3, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === id)!.operatorProfile) }
}
function output(id: string, guard: GuardConditions = {}, defense = 1000, resistance = 60, virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const skill = record(id)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100,
    skillLevelIndex: 9, conditions: { guard }, enemy: { defense, resistance }, virtualMainAttackType })
}
function fixed(id: string, guard: GuardConditions = {}, defense = 1000, resistance = 60, virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const result = output(id, guard, defense, resistance, virtualMainAttackType)
  assert.deepEqual(result.unsupportedReasons, [], id)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}
const physical = (attack: number, defense: number) => Math.max(attack - defense, attack * .05)
const buff = (attack: number, ratio: number) => Math.floor(attack * (1 + ratio) + 1e-9)
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('怒潮S3は選択した槌撃までのATK加算と、周囲50%・素質24%を別計算する', () => {
  for (const completed of [0, 1, 4]) for (const count of [1, 3]) for (const defense of [0, 1000, 10000]) {
    const { result, row } = fixed('char_1051_headb2', { completedHammerCount: completed, actualAttackTargetCount: count }, defense)
    const atk = buff(result.stats.attack, 1 + .3 * completed + .14 * 2)
    const main = physical(atk * 2.4, defense), splash = physical(atk * 2.4 * .5, defense) * 1.24
    close(row.perAttack, (main + splash * (count - 1)) / count)
    close(row.allTargetsPerAttack, main + splash * (count - 1))
    assert.equal(row.dps, null)
  }
  assert.deepEqual(output('char_1051_headb2', { terrainHitCount: 1 }).rows, [])
  assert.deepEqual(output('char_1051_headb2', { phase: 'terrain' }).rows, [])
  assert.deepEqual(output('char_1051_headb2', { completedHammerCount: 5 }).rows, [])
})

test('司霆S3の物理300%と電流70%1判定を分離し、接触をスキル再発動として扱わない', () => {
  for (const charge of [0, 50, 100]) for (const count of [1, 4]) {
    const { result, row } = fixed('char_1043_leizi2', { traitChargePercent: charge, actualAttackTargetCount: count })
    const atk = buff(result.stats.attack, 2 * charge / 100)
    close(row.perAttack, physical(atk * 1.07 * 3, 1000))
    close(row.allTargetsPerAttack, row.perAttack * count)
    assert.equal(row.dps, null)
    const current = fixed('char_1043_leizi2', { phase: 'current', traitChargePercent: charge, actualAttackTargetCount: count }).row
    close(current.perAttack, atk * .7 * .4)
    close(current.allTargetsPerAttack, current.perAttack * count)
    assert.equal(current.attackComponents.length, 1)
    assert.equal(current.dps, null)
  }
  assert.deepEqual(output('char_1043_leizi2', { phase: 'sequence' }).rows, [])
})

test('エンテレケイアS3の35%保証は心燭の直接命中だけに適用し、200術/秒へ乗せない', () => {
  for (const phase of ['heart', 'enemy']) for (const defense of [0, 1000, 10000]) for (const resistance of [0, 60, 100]) {
    const { result, row } = fixed('char_4010_etlchi', { phase }, defense, resistance)
    const atk = buff(result.stats.attack, 1.35)
    close(row.perAttack, Math.max(atk - defense, atk * (phase === 'heart' ? .35 : .05)))
    close(row.damageOverTimeDps, 200 * Math.max(.05, 1 - resistance / 100))
    assert.equal(row.dps, null)
    assert.equal(row.combinedDps, null)
  }
  for (const resistance of [0, 60, 100]) {
    const { result, row } = fixed('char_4010_etlchi', { phase: 'heart', actualAttackTargetCount: 3 }, 10000, resistance, 'ARTS')
    const atk = buff(result.stats.attack, 1.35)
    close(row.perAttack, Math.max(atk * (1 - resistance / 100), atk * .35))
    close(row.allTargetsPerAttack, row.perAttack * 3)
  }
  assert.deepEqual(output('char_4010_etlchi', { actualAttackTargetCount: 4 }).rows, [])
  assert.deepEqual(output('char_4010_etlchi', { phase: 'combined' }).rows, [])
  const inactive = fixed('char_4010_etlchi', { dotActive: false }).row
  assert.equal(inactive.damageOverTimeDps, null)
})

test('V10旧群3名は必要なskill数値の欠落・非有限値を停止し、部分値を返さない', () => {
  for (const id of ['char_1051_headb2', 'char_4010_etlchi', 'char_1043_leizi2']) for (const invalid of ['missing', NaN, Infinity]) {
    const skill = record(id)
    if (invalid === 'missing') skill.raw.blackboard = skill.raw.blackboard!.slice(1)
    else skill.raw.blackboard![0].value = invalid as number
    skill.skillLevels[9] = structuredClone(skill.raw)
    const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100,
      skillLevelIndex: 9, conditions: { guard: {} } })
    assert.deepEqual(result.rows, [], id)
    assert.ok(result.unsupportedReasons.length, id)
  }
})
