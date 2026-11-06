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
    overrideTokenKey: source.profile.summonSkillTokenKeys?.[index - 1] ?? null,
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

test('13名23技能を本人IDのまま評価し、tokenのATKと周期だけを独立させる', () => {
  assert.equal(EXPANDED_SUMMON_DEFINITIONS.length, 13)
  assert.equal(EXPANDED_SUMMON_DEFINITIONS.reduce((sum, source) => sum + source.recipes.length, 0), 23)
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

test('Magallan S2/S3は異なるドローンの周期・属性・範囲を保持し、本人への効果も分離する', () => {
  for (const resistance of [0, 40, 100]) {
    const laser = output('char_248_mgllan', 2, { actualAttackTargetCount: 3 }, { enemy: { defense: 10000, resistance } })
    const expected = 509 * Math.max(0.05, 1 - resistance / 100)
    close(valid(laser).perAttack, expected)
    close(laser.stats.attack, 509)
    close(laser.attackInterval, 0.4)
    close(laser.rows[0].allTargetsDps, expected / 0.4 * 3)
    const owner = output('char_248_mgllan', 2, { summonDamageActor: 'OWNER' }, { enemy: { defense: 10000, resistance } })
    close(valid(owner).perAttack, expected)
    close(owner.attackInterval, 1.6 / 2.5)
    assert.equal(owner.actor, undefined)
  }
  for (const defense of [0, 1000, 100000]) {
    const assault = output('char_248_mgllan', 3, { actualAttackTargetCount: 3 }, { enemy: { defense, resistance: 0 } })
    close(assault.stats.attack, 753)
    close(valid(assault).perAttack, physical(1882, defense))
    close(assault.attackInterval, 2.3)
    close(assault.rows[0].allTargetsPerAttack, physical(1882, defense) * 3)
  }
  const owner = output('char_248_mgllan', 3, { summonDamageActor: 'OWNER' })
  close(valid(owner).perAttack, 1272 * 0.6)
  close(owner.attackInterval, 1.6)
})

test('Lingの回収素質は本人だけに加算し、S1召喚物を術化しS2は独立した450%発動を計算する', () => {
  for (const lingRefundStacks of [0, 1, 5]) {
    const first = output('char_2023_ling', 1, { lingRefundStacks })
    close(valid(first).perAttack, 823 * 0.6)
    close(first.stats.attack, 549)
    close(first.attackInterval, 1.25 / 1.5)
    assert.ok(first.guard!.evaluations.filter(row => row.talentIndex === 1).every(row => row.status === 'NOT_RELEVANT'))
    const owner = output('char_2023_ling', 1, { lingRefundStacks, summonDamageActor: 'OWNER' })
    close(valid(owner).perAttack, Math.floor(508 * (1.5 + 0.03 * lingRefundStacks) + 1e-9) * 0.6)
    close(owner.attackInterval, 1.6 / 1.5)
    const second = output('char_2023_ling', 2, { lingRefundStacks, actualAttackTargetCount: 2 })
    close(second.stats.attack, 406)
    close(valid(second).perAttack, 406 * 4.5 * 0.6)
    close(second.rows[0].allTargetsPerAttack, 406 * 4.5 * 0.6 * 2)
    assert.equal(second.rows[0].dps, null)
    const ownerSecond = output('char_2023_ling', 2, { lingRefundStacks, summonDamageActor: 'OWNER' })
    close(valid(ownerSecond).perAttack, Math.floor(508 * (1 + 0.03 * lingRefundStacks) + 1e-9) * 4.5 * 0.6)
  }
  for (const guard of [{ lingRefundStacks: -1 }, { lingRefundStacks: 6 }, { lingRefundStacks: 1.5 }, { actualAttackTargetCount: 3 }])
    assert.ok(output('char_2023_ling', 2, guard).unsupportedReasons.length)
  const virtual = output('char_2023_ling', 2, { lingRefundStacks: 5 }, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 10000, resistance: 0 } })
  close(valid(virtual).perAttack, 406 * 4.5 * 0.05)
})

test('Kalts S2のASPD100は治療側だけでMon3trの攻撃周期は2秒、死亡爆発は別の1200固定ダメージ', () => {
  for (const defense of [0, 1000, 100000]) {
    const first = output('char_003_kalts', 1, {}, { enemy: { defense, resistance: 100 } })
    close(first.stats.attack, 1402)
    close(valid(first).perAttack, physical(1402, defense))
    close(first.attackInterval, 2)
    const second = output('char_003_kalts', 2, { actualAttackTargetCount: 3 }, { enemy: { defense, resistance: 100 } })
    close(valid(second).perAttack, physical(2663, defense))
    close(second.attackSpeed, 100)
    close(second.attackInterval, 2)
    close(second.rows[0].allTargetsDps, physical(2663, defense) / 2 * 3)
    assert.equal(second.rows[0].attackComponents.length, 1)
    const death = output('char_003_kalts', 2, { mon3trEvent: 'DEATH', actualAttackTargetCount: 5 }, { enemy: { defense, resistance: 100 } })
    close(valid(death).perAttack, 1200)
    close(death.rows[0].allTargetsPerAttack, 6000)
    assert.equal(death.rows[0].dps, null)
  }
  assert.ok(output('char_003_kalts', 1, { actualAttackTargetCount: 2 }).unsupportedReasons.length)
  assert.ok(output('char_003_kalts', 2, { actualAttackTargetCount: 4 }).unsupportedReasons.length)
  const virtual = output('char_003_kalts', 2, {}, { virtualMainAttackType: 'ARTS' })
  close(valid(virtual).perAttack, 2663 * 0.6)
  const virtualDeath = output('char_003_kalts', 2, { mon3trEvent: 'DEATH' }, { virtualMainAttackType: 'ARTS' })
  assert.match(virtualDeath.unsupportedReasons.join(), /主攻撃がありません/)
})

test('Vigil S2は狼数だけ連撃し、175防御無視はブロック対象だけ、150%特性は狼に適用しない', () => {
  for (const wolfCount of [1, 2, 3]) for (const blocked of [false, true]) for (const defense of [100, 500, 10000]) {
    const value = output('char_427_vigil', 2, { wolfCount, 'target.blockedByOwnReinforcement': blocked }, { enemy: { defense, resistance: 40 } })
    close(value.stats.attack, 371)
    const expected = physical(742, Math.max(0, defense - (blocked ? 175 : 0))) * wolfCount
    close(valid(value).perAttack, expected)
    close(value.rows[0].allTargetsPerAttack, expected)
    assert.equal(value.rows[0].dps, null)
    const virtual = output('char_427_vigil', 2, { wolfCount, 'target.blockedByOwnReinforcement': blocked }, { virtualMainAttackType: 'ARTS' })
    close(valid(virtual).perAttack, 742 * 0.6 * wolfCount)
  }
  for (const guard of [{ wolfCount: 0 }, { wolfCount: 4 }, { wolfCount: 1.5 }, { actualAttackTargetCount: 2 }])
    assert.ok(output('char_427_vigil', 2, guard).unsupportedReasons.length)
  const mismatch = output('char_427_vigil', 2, {}, {}, skill => {
    skill.operatorProfile.talents![1].candidates!.find(candidate => candidate.unlockCondition?.phase === 'PHASE_2' && candidate.requiredPotentialRank === 0)!
      .blackboard!.find(entry => entry.key === 'def_penetrate_fixed')!.value = 200
  })
  assert.ok(mismatch.unsupportedReasons.length)
  assert.deepEqual(mismatch.rows, [])
})

test('Beanstalk S2はハガネガニ1体の404ATK/1.25秒で、本人ATK・防御上昇・配置数を混ぜない', () => {
  for (const defense of [0, 500, 10000]) {
    const value = output('char_452_bstalk', 2, {}, { enemy: { defense, resistance: 100 } })
    close(value.stats.attack, 404)
    close(value.attackInterval, 1.25)
    close(valid(value).perAttack, physical(404, defense))
    close(value.rows[0].dps, physical(404, defense) / 1.25)
  }
  assert.ok(output('char_452_bstalk', 2, { actualAttackTargetCount: 2 }).unsupportedReasons.length)
})

test('Mlyssの本人ATK50%とS1だけのASPD50を評価し、未確認のコピー側を数値で置換しない', () => {
  for (const index of [1, 2, 3]) for (const blocked of [false, true]) {
    const value = output('char_249_mlyss', index, { 'target.blockedByOwnReinforcement': blocked })
    close(value.stats.attack, 537)
    close(valid(value).perAttack, physical(805 * (blocked ? 1.5 : 1), 500))
    close(value.attackInterval, index === 1 ? 1 / 1.5 : 1)
    assert.equal(value.actor, undefined)
    const virtual = output('char_249_mlyss', index, { 'target.blockedByOwnReinforcement': blocked }, { virtualMainAttackType: 'ARTS' })
    close(valid(virtual).perAttack, 805 * (blocked ? 1.5 : 1) * 0.6)
    const copy = output('char_249_mlyss', index, { mlyssActor: 'TOKEN' })
    assert.match(copy.unsupportedReasons.join(), /コピー元/)
    assert.deepEqual(copy.rows, [])
  }
})

test('追加tokenの技能override・数値・死亡素質・属性が変わると停止し、既存snapshot値で続行しない', () => {
  const samples = [['char_248_mgllan', 2, 'token_10005_mgllan_drone2'], ['char_248_mgllan', 3, 'token_10005_mgllan_drone3'],
    ['char_2023_ling', 1, 'token_10020_ling_soul1'], ['char_2023_ling', 2, 'token_10020_ling_soul2'],
    ['char_003_kalts', 2, 'token_10002_kalts_mon3tr'], ['char_427_vigil', 2, 'token_10028_vigil_wolf'],
    ['char_452_bstalk', 2, 'token_10014_bstalk_crab']] as const
  for (const [id, index, tokenKey] of samples) for (const mutation of ['ATK', 'INTERVAL', 'DESCRIPTION', 'MISSING', 'BINDING']) {
    const value = output(id, index, {}, {}, skill => {
      const token = skill.operatorProfile.summonProfiles![tokenKey]
      if (mutation === 'ATK') token.profile.phases[2].attributesKeyFrames!.at(-1)!.data!.atk! += 1
      if (mutation === 'INTERVAL') token.profile.phases[2].attributesKeyFrames!.at(-1)!.data!.baseAttackTime! += 0.1
      if (mutation === 'DESCRIPTION') token.profile.traitDescription += '未確認の追加効果'
      if (mutation === 'MISSING') delete skill.operatorProfile.summonProfiles![tokenKey]
      if (mutation === 'BINDING') skill.overrideTokenKey = 'token_10030_mlyss_wtrman'
    })
    assert.ok(value.unsupportedReasons.length, `${id}/${index}/${mutation}`)
    assert.deepEqual(value.rows, [])
  }
  const changedDeath = output('char_003_kalts', 2, { mon3trEvent: 'DEATH' }, {}, skill => {
    skill.operatorProfile.summonProfiles!.token_10002_kalts_mon3tr.profile.talents![1].candidates![0].blackboard!.find(entry => entry.key === 'value')!.value = 1400
  })
  assert.ok(changedDeath.unsupportedReasons.length)
  assert.deepEqual(changedDeath.rows, [])
})

test('ケルシーのchar_idは確認済みmetadataだけを許可し、未知ID・数値・追加キーを拒否する', () => {
  valid(output('char_003_kalts', 2))
  for (const mutation of ['CHAR_ID', 'VALUE', 'NEW_KEY']) {
    const value = output('char_003_kalts', 2, {}, {}, skill => {
      const board = skill.operatorProfile.trait!.candidates![0].blackboard!
      if (mutation === 'CHAR_ID') board[0].valueStr = 'char_unknown'
      if (mutation === 'VALUE') board[0].value = 1
      if (mutation === 'NEW_KEY') board.push({ key: 'atk_scale', value: 2 })
    })
    assert.ok(value.unsupportedReasons.length, mutation)
    assert.deepEqual(value.rows, [])
  }
})
