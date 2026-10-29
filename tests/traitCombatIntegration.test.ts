import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { SkillRecord, OperatorCombatProfile, RawSkillLevel } from '../src/types/skill.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')).guards as {
  id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[]
}[]
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function record(id: string, index = 1): SkillRecord {
  const operator = sources.find(value => value.id === id)!, entry = operator.skills.find(value => value.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: operator.name, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === id)!.operatorProfile) }
}
function calculate(skill: SkillRecord, guard: GuardConditions = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, conditions: { guard } })
}
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('DC3は構造化された槌撃士の周囲倍率を計算に使い、主対象のダメージを変えない', () => {
  const original = record('char_4058_pepe'), changed = structuredClone(original)
  const entry = changed.operatorProfile.trait!.candidates![0].blackboard!.find(value => value.key === 'attack@atk_scale_2')!
  entry.value = 0.75
  const before = calculate(original, { actualAttackTargetCount: 2 }), after = calculate(changed, { actualAttackTargetCount: 2 })
  assert.deepEqual(before.unsupportedReasons, [])
  assert.deepEqual(after.unsupportedReasons, [])
  const beforeParts = before.rows.find(row => row.axisValue === 0)!.attackComponents
  const afterParts = after.rows.find(row => row.axisValue === 0)!.attackComponents
  assert.equal(beforeParts.length, 2)
  close(afterParts[0].expectedDamage, beforeParts[0].expectedDamage)
  close(afterParts[1].expectedDamage, beforeParts[1].expectedDamage * 1.5)
})

test('DC3は強襲者の攻撃対象上限を特性のステータス参照から取得する', () => {
  const original = record('char_017_huang', 2), changed = structuredClone(original)
  for (const frame of changed.operatorProfile.phases[2].attributesKeyFrames!) frame.data!.blockCnt = 2
  const before = calculate(original, { actualAttackTargetCount: 2 }), after = calculate(changed, { actualAttackTargetCount: 2 })
  assert.deepEqual(before.unsupportedReasons, [])
  assert.deepEqual(after.unsupportedReasons, [])
  assert.equal(before.maxTargetCount, 3)
  assert.equal(after.maxTargetCount, 2)
  close(after.rows[0].perAttack, before.rows[0].perAttack)
  assert.ok(calculate(changed, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
})

test('DC3の特性データが未確認になった場合は古い固定倍率で計算を続けない', () => {
  const changed = record('char_4082_qiubai', 2)
  const trait = changed.operatorProfile.trait!.candidates![0]
  trait.blackboard = trait.blackboard!.filter(value => value.key !== 'atk_scale')
  const result = calculate(changed, { attackDistanceType: 'RANGED' })
  assert.ok(result.unsupportedReasons.length)
  assert.deepEqual(result.rows, [])
})

test('確認済み前衛の職分・職業が変わった場合、特性なしの基礎攻撃へフォールバックしない', () => {
  for (const job of ['unknown-job', 'artsfghter']) {
    const changed = record('char_017_huang', 2)
    changed.subProfessionId = job
    if (job === 'artsfghter') changed.operatorProfile.traitDescription = '敵に術ダメージを与える'
    const result = calculate(changed)
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('職業・職分')), job)
    assert.deepEqual(result.rows, [], job)
  }
  const changed = record('char_017_huang', 2)
  changed.profession = 'CASTER'
  const result = calculate(changed)
  assert.ok(result.unsupportedReasons.some(reason => reason.includes('職業・職分')))
  assert.deepEqual(result.rows, [])
})

test('複数成分のスキルでは通常の術打撃だけ特性を継承し、追加確定ダメージの属性を上書きしない', () => {
  const result = calculate(record('char_1019_siege2'), { actualAttackTargetCount: 1 })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.deepEqual(result.rows[0].attackComponents.map(component => component.damageType), ['ARTS', 'TRUE'])
  assert.equal(result.traitEvaluation?.evaluations.find(effect => effect.effectId === 'normal-attack-damage-type')?.status, 'APPLIED')
})

test('チューバイS2の発動時・終了時のスキルダメージには通常遠距離攻撃の特性倍率を適用しない', () => {
  const skill = record('char_4082_qiubai', 2)
  for (const phase of ['start', 'end']) {
    const melee = calculate(skill, { phase, attackDistanceType: 'MELEE' })
    const ranged = calculate(skill, { phase, attackDistanceType: 'RANGED' })
    assert.deepEqual(melee.unsupportedReasons, [])
    assert.deepEqual(ranged.unsupportedReasons, [])
    close(ranged.rows[0].perAttack, melee.rows[0].perAttack)
  }
})

test('チューバイS2の通常遠距離攻撃は、足止め中の追加術攻撃にも従来の特性倍率を一度だけ適用する', () => {
  const skill = record('char_4082_qiubai', 2)
  const melee = calculate(skill, { phase: 'normal', attackDistanceType: 'MELEE', targetSlowedOrBound: true })
  const ranged = calculate(skill, { phase: 'normal', attackDistanceType: 'RANGED', targetSlowedOrBound: true })
  assert.deepEqual(melee.unsupportedReasons, [])
  assert.deepEqual(ranged.unsupportedReasons, [])
  const meleeComponents = melee.rows.find(row => row.axisValue === 0)!.attackComponents
  const rangedComponents = ranged.rows.find(row => row.axisValue === 0)!.attackComponents
  assert.deepEqual(rangedComponents.map(component => component.damageType), ['PHYSICAL', 'ARTS'])
  for (let index = 0; index < meleeComponents.length; index++)
    close(rangedComponents[index].expectedDamage, meleeComponents[index].expectedDamage * 0.8)
})
