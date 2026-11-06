import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { EXPANDED_SUMMON_DEFINITIONS } from '../src/lib/expandedSummonDefinitions.ts'
import { sameReviewedSummon } from '../src/lib/summonActor.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedSummonSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function record(id: string, index: number): SkillRecord {
  const source = sources.find(source => source.operatorId === id)!, entry = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: entry.skillId, skillIndex: index,
    skillName: raw.name!, profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw), raw,
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), operatorProfile: structuredClone(source.profile) }
}
function output(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}, mutate?: (record: SkillRecord) => void) {
  const skill = record(id, index); mutate?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: skill.operatorProfile.phases[2].maxLevel!,
    trust: 100, skillLevelIndex: 9, conditions: { guard }, enemy: { defense: 500, resistance: 40 }, ...options })
}
function valid(value: ReturnType<typeof output>) {
  assert.deepEqual(value.unsupportedReasons, [])
  assert.equal(value.rows.length, 1)
  return value.rows[0]
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const physical = (attack: number, defense: number) => Math.max(attack - defense, attack * 0.05)

test('7名12技能を本人IDのまま評価し、tokenのATKと周期だけを独立させる', () => {
  assert.equal(EXPANDED_SUMMON_DEFINITIONS.length, 7)
  assert.equal(EXPANDED_SUMMON_DEFINITIONS.reduce((sum, source) => sum + source.recipes.length, 0), 12)
  for (const definition of EXPANDED_SUMMON_DEFINITIONS) for (const recipe of definition.recipes) {
    const result = output(definition.operatorId, recipe.skillIndex)
    valid(result)
    assert.equal(result.structure!.basicInfo.operatorId, definition.operatorId)
    assert.equal(result.structure!.basicInfo.skillIndex, recipe.skillIndex)
  }
})

test('SceneとDeepcolorは本人ではなく召喚物の独立ATK・1.25秒周期を使い、台数を掛けない', () => {
  for (const [id, index, attack, buffed] of [
    ['char_336_folivo', 1, 477, 763], ['char_336_folivo', 2, 477, 1097], ['char_110_deepcl', 1, 462, 739],
  ] as const) for (const defense of [0, 500, 100000]) {
    const result = output(id, index, {}, { enemy: { defense, resistance: 90 } }), row = valid(result)
    close(result.stats.attack, attack)
    close(result.effectiveAttack, buffed)
    close(result.attackInterval, 1.25)
    close(row.perAttack, physical(buffed, defense))
    close(row.dps, physical(buffed, defense) / 1.25)
    close(row.allTargetsPerAttack, row.perAttack)
    assert.equal(result.actor!.kind, 'TOKEN')
    close(result.stats.baseAttackBreakdown.trustAttack, 0)
  }
})

test('召喚物は本人信頼度や本人の攻撃力を引き継がず、本人のレベルだけと連動する', () => {
  const original = output('char_336_folivo', 2), lowTrust = output('char_336_folivo', 2, {}, { trust: 0 })
  close(valid(lowTrust).perAttack, valid(original).perAttack)
  const ownerChanged = output('char_336_folivo', 2, {}, {}, skill => {
    skill.operatorProfile.phases[2].attributesKeyFrames!.at(-1)!.data!.atk = 99999
  })
  close(valid(ownerChanged).perAttack, original.rows[0].perAttack)
  const level1 = output('char_336_folivo', 2, {}, { operatorLevel: 1 })
  valid(level1)
  const token = sources[0].profile.summonProfiles!.token_10010_folivo_car
  close(level1.stats.attack, token.profile.phases[2].attributesKeyFrames![0].data!.atk!)
})

test('Sandreは機械への120%を召喚物に1回だけ適用し、本人と羽獣のATKを分離する', () => {
  for (const targetMechanical of [false, true]) for (const index of [1, 2]) {
    const result = output('char_4140_lasher', index, { targetMechanical }), row = valid(result)
    const expected = (index === 1 ? 340 : 476) * 0.6 * (targetMechanical ? 1.2 : 1)
    close(result.stats.attack, 340)
    close(row.perAttack, expected)
    close(result.attackInterval, index === 1 ? 1 : 1.6)
    close(row.dps, expected / (index === 1 ? 1 : 1.6))
  }
  const owner = output('char_4140_lasher', 1, { lasherActor: 'OWNER', targetMechanical: true })
  close(valid(owner).perAttack, 485 * 0.6 * 1.2)
  assert.equal(owner.actor, undefined)
  close(owner.stats.attack, 485)
  close(owner.attackInterval, 1)
})

test('Blacknight S1は眠獣だけを55%強化し、S2は眠っていない敵にも範囲術化する', () => {
  const rage = output('char_476_blkngt', 1), row = valid(rage)
  close(rage.stats.attack, 474)
  close(row.perAttack, 734 - 500)
  close(rage.attackSpeed, 155)
  close(rage.attackInterval, 1.25 / 1.55)
  assert.ok(output('char_476_blkngt', 1, { hypnosState: 'DORMANT' }).unsupportedReasons.length)
  for (const targetAsleep of [false, true]) for (const resistance of [0, 40, 100]) {
    const value = output('char_476_blkngt', 2, { targetAsleep, actualAttackTargetCount: 4 }, { enemy: { defense: 99999, resistance } })
    const damage = valid(value), expected = 474 * (targetAsleep ? 2.1 : 1) * Math.max(0.05, 1 - resistance / 100)
    close(damage.perAttack, expected)
    close(damage.allTargetsPerAttack, expected * 4)
    close(value.attackInterval, 1.25)
    close(value.model!.duration, 6)
    // The owner's 150% reinforcement-blocking trait must never leak to Hypnos.
    const blocked = output('char_476_blkngt', 2, { targetAsleep, actualAttackTargetCount: 4, 'target.blockedByOwnReinforcement': true }, { enemy: { defense: 99999, resistance } })
    close(valid(blocked).perAttack, expected)
  }
})

test('Mitm S1/S2とMayer S2は本人ATKを参照し、召喚物ATK・退場後の残骸効果を先取りしない', () => {
  for (const blocked of [false, true]) {
    const explosion = output('char_4147_mitm', 1, { 'target.blockedByOwnReinforcement': blocked, actualAttackTargetCount: 3 })
    close(explosion.stats.attack, 555)
    close(valid(explosion).perAttack, physical(555 * 4 * (blocked ? 1.5 : 1), 500))
    assert.equal(explosion.rows[0].dps, null)
    assert.equal(explosion.actor, undefined)
    const sustained = output('char_4147_mitm', 2, { 'target.blockedByOwnReinforcement': blocked })
    close(valid(sustained).perAttack, physical(999 * (blocked ? 1.5 : 1), 500))
    close(sustained.attackInterval, 1)
  }
  const meebo = output('char_242_otter', 2, { actualAttackTargetCount: 3 })
  close(meebo.stats.attack, 478)
  close(valid(meebo).perAttack, 478 * 6 * 0.6)
  close(meebo.rows[0].allTargetsPerAttack, 478 * 6 * 0.6 * 3)
  assert.equal(meebo.actor, undefined)
  assert.equal(meebo.rows[0].dps, null)
})

test('ClosureのRhodes4%と本人skill80%は加算し、援軍150%を乗算する', () => {
  for (const blocked of [false, true]) {
    const value = output('char_4228_closur', 2, { 'target.blockedByOwnReinforcement': blocked, actualAttackTargetCount: 2 })
    close(value.stats.attack, 540)
    close(valid(value).perAttack, physical(993 * (blocked ? 1.5 : 1), 500))
    close(value.rows[0].allTargetsPerAttack, value.rows[0].perAttack * 2)
  }
  const changedFaction = output('char_4228_closur', 2, {}, {}, skill => { skill.operatorProfile.affiliationIds = { nationId: 'laterano', groupId: null, teamId: null } })
  close(valid(changedFaction).perAttack, 972 - 500)
  for (const closureTargetStacks of [0, 1, 6]) {
    const value = output('char_4228_closur', 3, { closureTargetStacks, actualAttackTargetCount: 1 + closureTargetStacks })
    close(valid(value).perAttack, 561 * 2.5 - 500)
    close(value.attackInterval, 0.5)
    close(value.rows[0].allTargetsPerAttack, value.rows[0].perAttack * (1 + closureTargetStacks))
  }
  for (const guard of [{ closureTargetStacks: -1 }, { closureTargetStacks: 7 }, { closureTargetStacks: 0.5 }, { closureTargetStacks: 0, actualAttackTargetCount: 2 }])
    assert.ok(output('char_4228_closur', 3, guard).unsupportedReasons.length)
})

test('仮想属性は召喚物の主攻撃へ適用し、独立ATK・ASPD・機械特効を保つ', () => {
  const scene = output('char_336_folivo', 1, {}, { virtualMainAttackType: 'ARTS' })
  close(valid(scene).perAttack, 763 * 0.6)
  const bird = output('char_4140_lasher', 1, { targetMechanical: true }, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 10000, resistance: 0 } })
  close(valid(bird).perAttack, 340 * 0.05 * 1.2)
  const sleep = output('char_476_blkngt', 2, { targetAsleep: true }, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 10000, resistance: 0 } })
  close(valid(sleep).perAttack, 474 * 2.1 * 0.05)
})

test('召喚物のlive数値・隠し素質・スキル・binding欠損/変更を全て拒否する', () => {
  const key = 'token_10010_folivo_car'
  const mutations: ((record: SkillRecord) => void)[] = [
    skill => { delete skill.operatorProfile.summonProfiles },
    skill => { delete skill.operatorProfile.summonProfiles![key] },
    skill => { skill.operatorProfile.summonProfiles![key].profile.phases[2].attributesKeyFrames!.at(-1)!.data!.atk! += 1 },
    skill => { skill.operatorProfile.summonProfiles![key].profile.phases[2].attributesKeyFrames!.at(-1)!.data!.baseAttackTime! += 0.1 },
    skill => { skill.operatorProfile.summonProfiles![key].profile.phases[2].attributesKeyFrames!.at(-1)!.data!.atk = NaN },
    skill => { skill.operatorProfile.summonProfiles![key].profile.talents = [] },
    skill => { skill.operatorProfile.summonProfiles![key].profile.traitDescription += '攻撃力倍増' },
    skill => { skill.operatorProfile.summonProfiles![key].skills[1].levels[0].description += '未確認の追加効果' },
    skill => { skill.operatorProfile.summonProfiles![key].profession = 'WARRIOR' },
    skill => { skill.operatorProfile.summonSkillTokenKeys![1] = 'token_unknown' },
    skill => { skill.overrideTokenKey = 'token_unknown' },
    skill => { skill.operatorProfile.talents![0].candidates!.at(-1)!.description += '未確認の追加効果' },
  ]
  for (const mutate of mutations) {
    const value = output('char_336_folivo', 2, {}, {}, mutate)
    assert.ok(value.unsupportedReasons.length, mutate.toString())
    assert.deepEqual(value.rows, [])
  }
  const otherOwner = output('char_336_folivo', 2, {}, {}, skill => { skill.operatorId = 'char_110_deepcl' })
  assert.ok(otherOwner.unsupportedReasons.length)
  assert.equal(sameReviewedSummon({ a: 1, b: [2] }, { b: [2], a: 1 }), true)
  assert.equal(sameReviewedSummon({ a: NaN }, { a: 1 }), false)
})

test('actor選択と育成段階の不正入力は例外で落ちず数値出力を止める', () => {
  for (const options of [{ operatorLevel: 0 }, { operatorLevel: 81 }, { operatorLevel: NaN }, { phaseIndex: 1 },
    { phaseIndex: NaN }, { trust: -1 }, { skillLevelIndex: 8 }]) {
    const value = output('char_336_folivo', 2, {}, options)
    assert.ok(value.unsupportedReasons.length, JSON.stringify(options))
    assert.deepEqual(value.rows, [])
  }
  for (const guard of [{ lasherActor: 'INVALID' }, { actualAttackTargetCount: 0 }, { actualAttackTargetCount: 2 }, { targetMechanical: 'yes' }]) {
    const value = output('char_4140_lasher', 1, guard)
    assert.ok(value.unsupportedReasons.length, JSON.stringify(guard))
    assert.deepEqual(value.rows, [])
  }
})
