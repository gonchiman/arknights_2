import test from 'node:test'
import assert from 'node:assert/strict'
import sourceJson from '../src/data/expandedMeleeSources.json' with { type: 'json' }
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = sourceJson as unknown as ExpandedOperatorSource[]
function record(suffix: string, skillIndex: number): SkillRecord {
  const source = sources.find(entry => entry.operatorId.endsWith(`_${suffix}`))!
  const skill = source.skills.find(entry => entry.skillIndex === skillIndex)!, raw = structuredClone(skill.raw)
  return { id: `${source.operatorId}/${skillIndex}`, operatorId: source.operatorId, operatorName: source.operatorName,
    skillId: skill.skillId, skillIndex, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
    nameInitial: 'OTHER', description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
    skillType: raw.skillType!, spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), raw, skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    operatorProfile: structuredClone(source.profile) }
}
function output(suffix: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}, mutate?: (skill: SkillRecord) => void) {
  const skill = record(suffix, index)
  mutate?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2,
    operatorLevel: skill.operatorProfile.phases[2].maxLevel!, trust: 100, skillLevelIndex: 9,
    conditions: { guard }, enemy: { defense: 500, resistance: 40 }, ...options })
}
function valid(value: ReturnType<typeof output>) {
  assert.deepEqual(value.unsupportedReasons, [])
  assert.equal(value.rows.length, 1)
  return value.rows[0]
}
function close(value: number | null | undefined, expected: number) {
  assert.ok(typeof value === 'number' && Math.abs(value - expected) < 1e-7, `${value} != ${expected}`)
}
const phys = (attack: number, defense: number) => Math.max(attack - defense, attack * .05)
const arts = (attack: number, resistance: number) => attack * Math.max(.05, 1 - resistance / 100)
function probability(skill: SkillRecord, chance: number) {
  skill.operatorProfile.talents![0].candidates!.find(candidate => candidate.unlockCondition?.phase === 'PHASE_2'
    && candidate.requiredPotentialRank === 0)!.blackboard!.find(entry => entry.key === 'prob')!.value = chance
}

test('Luton S2はATK790の術パルス1回/2秒だけを計算し、通常攻撃と防御130%を混ぜない', () => {
  for (const resistance of [0, 40, 100]) for (const targets of [1, 4]) {
    const value = output('luton', 2, { actualAttackTargetCount: targets }, { enemy: { defense: 100000, resistance } })
    const row = valid(value), expected = arts(790, resistance)
    close(value.stats.attack, 790)
    close(value.effectiveAttack, 790)
    close(value.attackInterval, 2)
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * targets)
    close(row.dps, expected / 2)
    assert.equal(row.attackComponents.length, 1)
    assert.equal(value.structure!.guardRecipe!.stages[0].periodTotal!.kind, 'UNSUPPORTED')
  }
  for (const defense of [0, 500, 100000]) {
    const value = output('luton', 2, {}, { enemy: { defense, resistance: 100 }, virtualMainAttackType: 'PHYSICAL' })
    close(valid(value).perAttack, phys(790, defense))
    close(value.attackInterval, 2)
  }
  const fasterOwner = output('luton', 2, {}, {}, skill => {
    skill.operatorProfile.phases[2].attributesKeyFrames!.forEach(frame => { frame.data!.baseAttackTime = .1 })
  })
  close(valid(fasterOwner).dps, 790 * .6 / 2)
})

test('Mousse S1はATK+75%が当該攻撃の2撃目にも持続し、20%分を軽減後に加算する', () => {
  for (const chance of [0, .2, 1]) for (const resistance of [0, 40, 100]) {
    const value = output('frncat', 1, {}, { enemy: { defense: 100000, resistance } }, skill => probability(skill, chance))
    const row = valid(value), attack = 1188 // floor((644 + 35) * 1.75)
    close(value.stats.attack, 679)
    close(value.effectiveAttack, attack)
    close(row.perAttack, arts(attack, resistance) * (1 + chance))
    assert.equal(row.dps, null)
    close(row.allTargetsPerAttack, row.perAttack!)
  }
  for (const defense of [0, 500, 100000]) {
    const value = output('frncat', 1, {}, { enemy: { defense, resistance: 40 }, virtualMainAttackType: 'PHYSICAL' })
    const row = valid(value)
    close(row.perAttack, phys(1188, defense) + .2 * arts(1188, 40))
    assert.equal(row.attackComponents.find(component => component.role === 'ADDITIONAL')!.damageType, 'ARTS')
  }
  assert.ok(output('frncat', 1, { actualAttackTargetCount: 2 }).unsupportedReasons.length)
})

test('追加2技能の既知スキル原文が変化した場合は古い定義でダメージを出さない', () => {
  for (const [suffix, index] of [['luton', 2], ['frncat', 1]] as const) {
    const value = output(suffix, index, {}, {}, skill => {
      skill.raw.description += '未確認の追加ダメージ'
      skill.skillLevels[9].description = skill.raw.description
      skill.description = skill.raw.description!
    })
    assert.ok(value.unsupportedReasons.length, suffix)
    assert.deepEqual(value.rows, [])
  }
})
