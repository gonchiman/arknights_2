import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord, OperatorCombatProfile, RawSkillLevel } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function record(id: string, index: number): SkillRecord {
  const operator = sources.guards.find(value => value.id === id)!
  const skill = operator.skills.find(value => value.skillIndex === index)!, raw = structuredClone(skill.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: operator.name, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === id)!.operatorProfile) }
}
function calculate(skill: SkillRecord, guard: GuardConditions = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, conditions: { guard } })
}
function traitValue(skill: SkillRecord, key: string, value: number) {
  const entry = skill.operatorProfile.trait!.candidates![0].blackboard!.find(entry => entry.key === key)!
  assert.ok(entry, key)
  entry.value = value
}
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)

test('群攻の対象数はスキル側の固定3ではなく構造化特性の基本ブロック数参照から得る', () => {
  const skill = record('char_017_huang', 2)
  assert.equal(calculate(skill).maxTargetCount, 3)
  for (const frame of skill.operatorProfile.phases[2].attributesKeyFrames ?? []) frame.data!.blockCnt = 4
  const result = calculate(skill, { actualAttackTargetCount: 4 })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.maxTargetCount, 4)
  close(result.rows[0].allTargetsPerAttack, result.rows[0].perAttack * 4)
})

test('スキルのブロック数加算を構造化特性の対象上限へ一度だけ適用する', () => {
  const skill = record('char_1026_gvial2', 3)
  assert.equal(calculate(skill).maxTargetCount, 5)
  for (const frame of skill.operatorProfile.phases[2].attributesKeyFrames ?? []) frame.data!.blockCnt = 4
  const result = calculate(skill, { actualAttackTargetCount: 6 })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.maxTargetCount, 6)
})

test('ペペの周辺倍率は職分固定値0.5ではなく特性の参照値から軽減前に計算する', () => {
  const skill = record('char_4058_pepe', 1)
  traitValue(skill, 'attack@atk_scale_2', 0.25)
  const result = calculate(skill, { actualAttackTargetCount: 3 })
  assert.deepEqual(result.unsupportedReasons, [])
  const attack = Math.floor(result.stats.attack * 1.16 + 1e-9) * 2.9
  const row = result.rows.find(row => row.axisValue === 1000)!
  const main = Math.max(attack - 1000, attack * 0.05)
  const splash = Math.max(attack * 0.25 - 1000, attack * 0.25 * 0.05)
  close(row.allTargetsPerAttack, main + splash * 2)
  assert.equal(row.attackComponents[1].attackScale, 2.9 * 0.25)
})

test('解放者の蓄積上限は構造化特性から取り、スキル側倍率と撃破減衰を重複適用しない', () => {
  const skill = record('char_4064_mlynar', 3)
  const before = calculate(skill, { traitChargePercent: 50, skillKillCount: 2 })
  traitValue(skill, 'atk', 4)
  const after = calculate(skill, { traitChargePercent: 50, skillKillCount: 2 })
  assert.deepEqual(after.unsupportedReasons, [])
  close(after.talentAttackRatio - before.talentAttackRatio, (4 - 2) * 0.5 * (2 - 0.1 * 2))
})

test('剣豪の強化攻撃・複合ダメージはスキルの上書きを優先する', () => {
  const chen = calculate(record('char_010_chen', 1))
  assert.deepEqual(chen.unsupportedReasons, [])
  assert.equal(chen.rows[0].attackComponents[0].count, 1)
  const siege = calculate(record('char_1019_siege2', 1))
  assert.deepEqual(siege.unsupportedReasons, [])
  assert.deepEqual(siege.rows[0].attackComponents.map(component => component.damageType), ['ARTS', 'TRUE'])
})
