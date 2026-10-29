import { reviewedTraitProfile } from './legacyTraitFixture.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeConditions,
  type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const original = JSON.parse(readFileSync(new URL('./fixtures/ireneS1.json', import.meta.url), 'utf8')) as {
  operator: { operatorId: string; operatorName: string }; operatorProfile: OperatorCombatProfile
  skill: { skillId: string; skillIndex: number; levels: RawSkillLevel[] }
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/ireneS2S3.json', import.meta.url), 'utf8')) as {
  skills: { skillId: string; skillIndex: number; levels: RawSkillLevel[] }[]
}
function record(skillIndex: number): SkillRecord {
  const source = skillIndex === 1 ? original.skill : fixture.skills.find(entry => entry.skillIndex === skillIndex)!
  const raw = structuredClone(source.levels[9])
  return { id: `irene-s${skillIndex}`, operatorId: original.operator.operatorId, operatorName: original.operator.operatorName,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: 'sword', subProfessionName: '剣豪',
    nameInitial: 'A_ROW', skillId: source.skillId, skillIndex, skillName: raw.name!, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!, spType: 'INCREASE_WHEN_ATTACK',
    initSp: raw.spData!.initSp, spCost: raw.spData!.spCost, classification: classifySkill(raw),
    skillLevels: structuredClone(source.levels), raw, operatorProfile: { ...structuredClone(original.operatorProfile), ...reviewedTraitProfile('char_4009_irene') } }
}
function output(skillIndex: number, conditions: DamageCalculatorThreeConditions = {}, patch: Partial<DamageCalculatorThreeInput> = {}) {
  const skill = record(skillIndex)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, conditions, ...patch })
}
function at(result: ReturnType<typeof output>, defense: number) {
  assert.deepEqual(result.unsupportedReasons, [])
  const row = result.rows.find(entry => entry.axisValue === defense)
  assert.ok(row, `DEF=${defense}`)
  return row
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== undefined && actual !== null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}

test('S2は発動1回・4倍1hitであり、特性2hitや2チャージをダメージへ再乗算しない', () => {
  const result = output(2)
  assert.equal(result.stats.attack, 701)
  assert.equal(result.attackKind, 'SKILL_ACTION')
  assert.equal(result.attackLabel, 'スキル')
  assert.equal(result.maxTargetCount, 6)
  assert.equal(result.hasAttackSequence, true)
  close(at(result, 0).perAttack, 2804)
  close(at(result, 1000).perAttack, 2304)
  const components = at(result, 1000).attackComponents
  assert.equal(components.length, 1)
  assert.equal(components[0].count, 1)
  assert.equal(components[0].attackScale, 4)
  assert.equal(components[0].defenseIgnoreChance, 1)
})

test('S2の重量3は浮遊可能、重量4と浮遊免疫はダメージを残して50%確率の防御無視に戻る', () => {
  const light = output(2, { targetWeight: 3 })
  close(at(light, 1000).perAttack, 2304)
  assert.ok(at(light, 1000).attackComponents.every(component => component.targetAirborne))
  for (const conditions of [{ targetWeight: 4 }, { targetWeight: 3, targetCanBeLevitated: false }]) {
    const result = output(2, conditions)
    close(at(result, 1000).perAttack, 2054)
    assert.equal(result.hasProbabilisticDamage, true)
    assert.ok(at(result, 1000).attackComponents.every(component => !component.targetAirborne && component.defenseIgnoreChance === 0.5))
  }
})

test('S2は指定した1〜6体へ同じ1hitを与え、上限7体を黙って6体へ丸めない', () => {
  for (const actualAttackTargetCount of [1, 2, 6]) {
    const result = output(2, { actualAttackTargetCount })
    close(at(result, 1000).perAttack, 2304)
    close(at(result, 1000).allTargetsPerAttack, 2304 * actualAttackTargetCount)
  }
  const invalid = output(2, { actualAttackTargetCount: 7 })
  assert.deepEqual(invalid.rows, [])
  assert.ok(invalid.unsupportedReasons.length > 0)
})

test('S3は初撃3倍と砲撃2.5倍12発の合計を与え、通常2hitを重ねない', () => {
  const result = output(3)
  assert.equal(result.attackKind, 'SKILL_ACTION')
  close(at(result, 0).perAttack, 23133)
  close(at(result, 1000).perAttack, 16633)
  const components = at(result, 1000).attackComponents
  close(components.reduce((sum, component) => sum + component.count, 0), 13)
  close(components.filter(component => component.attackScale === 3).reduce((sum, component) => sum + component.count, 0), 1)
  close(components.filter(component => component.attackScale === 2.5).reduce((sum, component) => sum + component.count, 0), 12)
  assert.ok(components.every(component => component.targetAirborne && component.defenseIgnoreChance === 1))
})

test('S3浮遊免疫では初撃と全12発を地上50%抽選とし、軽減後の期待値を足す', () => {
  const result = output(3, { targetCanBeLevitated: false })
  close(at(result, 1000).perAttack, 13383)
  assert.ok(at(result, 1000).attackComponents.every(component => !component.targetAirborne && component.defenseIgnoreChance === 0.5))
  // At DEF2000, both no-ignore outcomes hit the 5% minimum, but the ignore outcomes do not.
  close(at(result, 2000).perAttack, (105.15 + 1103) / 2 + 12 * (87.625 + 752.5) / 2)
})

test('S3重量4では初撃から浮遊するが、空中砲撃5発と着地後7発の素質確率を分ける', () => {
  const result = output(3, { targetWeight: 4, airborneHitCount: 5 })
  close(at(result, 1000).perAttack, 14883)
  const components = at(result, 1000).attackComponents
  assert.ok(components.find(component => component.attackScale === 3)?.targetAirborne)
  const barrage = components.filter(component => component.attackScale === 2.5)
  assert.equal(barrage.filter(component => component.targetAirborne).reduce((sum, component) => sum + component.count, 0), 5)
  assert.equal(barrage.filter(component => !component.targetAirborne).reduce((sum, component) => sum + component.count, 0), 7)
})

test('S3の重量3/4境界は浮遊時間の短縮であり、重い敵への浮遊を丸ごと無効にしない', () => {
  close(at(output(3, { targetWeight: 3 }), 1000).perAttack, 16633)
  close(at(output(3, { targetWeight: 4, airborneHitCount: 12 }), 1000).perAttack, 16633)
  close(at(output(3, { targetWeight: 4, airborneHitCount: 0 }), 1000).perAttack, 1603 + 12 * 1002.5)
  const unresolved = output(3, { targetWeight: 4 })
  assert.deepEqual(unresolved.rows, [])
  assert.ok(unresolved.unsupportedReasons.some(reason => /浮遊|砲撃|命中/.test(reason)))
})

test('S3散開N3/M1では12発を3体へ均等抽選し、全対象へ12発ずつ与えない', () => {
  const result = output(3, { actualAttackTargetCount: 3, splashTargetCount: 1 })
  close(at(result, 1000).perAttack, 6613)
  close(at(result, 1000).allTargetsPerAttack, 19839)
  close(at(result, 1000).perAttack * 3, at(result, 1000).allTargetsPerAttack)
})

test('S3密集N3/M3は各砲撃が全員へ命中し、初撃と砲撃を一度ずつ集計する', () => {
  const result = output(3, { actualAttackTargetCount: 3, splashTargetCount: 3 })
  close(at(result, 1000).perAttack, 16633)
  close(at(result, 1000).allTargetsPerAttack, 49899)
  const partial = output(3, { actualAttackTargetCount: 5, splashTargetCount: 2 })
  close(at(partial, 1000).perAttack, 7615)
  close(at(partial, 1000).allTargetsPerAttack, 38075)
  const average = output(3, { actualAttackTargetCount: 3, splashTargetCount: 1.5 })
  close(at(average, 1000).perAttack, 9118)
  close(at(average, 1000).allTargetsPerAttack, 27354)
})

test('S3は初期飛行敵への初撃を除外し、全砲撃を空中への確定防御無視として計算する', () => {
  const result = output(3, { targetInitialState: 'AIRBORNE' })
  close(at(result, 1000).perAttack, 15030)
  const components = at(result, 1000).attackComponents
  assert.ok(components.every(component => component.attackScale === 2.5 && component.targetAirborne && component.defenseIgnoreChance === 1))
  close(components.reduce((sum, component) => sum + component.count, 0), 12)
  // No levitation duration is needed for an enemy that flies independently of this status.
  const airborneHeavy = output(3, { targetInitialState: 'AIRBORNE', targetWeight: 4, targetCanBeLevitated: false })
  close(at(airborneHeavy, 1000).perAttack, 15030)
})

test('S3軽量敵では空中12発の確定条件を用い、未使用の重い敵用入力で性能を変えない', () => {
  close(at(output(3, { targetWeight: 3, airborneHitCount: 2 }), 1000).perAttack, 16633)
})

test('ASPDと海の怪物は一斉攻撃・砲撃の発動1回総量へ再乗算せず、周期DPSも推定しない', () => {
  for (const skillIndex of [2, 3]) for (const seaMonsterPresent of [false, true]) {
    const result = output(skillIndex, { seaMonsterPresent })
    assert.deepEqual(result.unsupportedReasons, [])
    assert.equal(result.attackSpeed, seaMonsterPresent ? 136 : 118)
    assert.equal(result.canShowDps, false)
    assert.ok(result.dpsReason)
    close(at(result, 1000).perAttack, skillIndex === 2 ? 2304 : 16633)
    for (const row of result.rows) {
      assert.equal(row.dps, null)
      assert.equal(row.allTargetsDps, null)
    }
  }
})

test('重量・巻き込み・空中砲撃数の不正入力や未対応スキルレベルを既定値で計算しない', () => {
  const malformed: unknown[] = [
    { targetWeight: -1 }, { targetWeight: NaN }, { targetWeight: 1.5 },
    { actualAttackTargetCount: 3, splashTargetCount: 0 }, { actualAttackTargetCount: 3, splashTargetCount: 4 },
    { actualAttackTargetCount: 3, splashTargetCount: NaN },
    { targetWeight: 4, airborneHitCount: -1 }, { targetWeight: 4, airborneHitCount: 13 },
    { targetWeight: 4, airborneHitCount: 1.5 }, { targetWeight: 4, airborneHitCount: NaN },
    { targetInitialState: 'SUBMERGED' },
  ]
  for (const conditions of malformed) {
    const result = output(3, conditions as DamageCalculatorThreeConditions)
    assert.deepEqual(result.rows, [], JSON.stringify(conditions))
    assert.ok(result.unsupportedReasons.length > 0)
  }
  for (const skillIndex of [2, 3]) {
    const lower = output(skillIndex, {}, { skillLevelIndex: 8 })
    assert.deepEqual(lower.rows, [])
    assert.ok(lower.unsupportedReasons.length > 0)
  }
})

test('S2/S3登録後もS1の2倍2hitと浮遊無効時の期待値を変えない', () => {
  close(at(output(1), 1000).perAttack, 1804)
  close(at(output(1, { targetCanBeLevitated: false }), 1000).perAttack, 1304)
})
