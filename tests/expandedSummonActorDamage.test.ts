import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = ['expandedArtsSources', 'expandedMeleeSources'].flatMap(name => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'))) as ExpandedOperatorSource[]
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


test('Ebenholz S2は召喚者ATK245%の残像1体を評価し貯蔵弾/孤立素質を継承しない', () => {
  for (const defense of [0, 100000]) for (const resistance of [0, 40, 100]) {
    const result = output('char_4046_ebnhlz', 2, { actualAttackTargetCount: 3 }, { enemy: { defense, resistance } }), row = valid(result)
    const expected = 1550 * 2.45 * Math.max(0.05, 1 - resistance / 100)
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * 3)
    assert.equal(result.actor?.tokenKey, 'token_10024_ebnhlz_rcube')
    close(result.actor?.ownerAttackStat, 1550)
    assert.equal(row.dps, null)
  }
  close(valid(output('char_4046_ebnhlz', 2, {}, { trust: 0 })).perAttack, 1400 * 2.45 * .6)
  close(valid(output('char_4046_ebnhlz', 2, {}, { operatorLevel: 1 })).perAttack, 1284 * 2.45 * .6)
  close(valid(output('char_4046_ebnhlz', 2, {}, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 99999, resistance: 0 } })).perAttack, 1550 * 2.45 * .05)
})

test('Kazemaru S2は本体/独立紙人形/出現時を分離し120%強化を出現270%より前に適用', () => {
  for (const defense of [0, 500, 100000]) {
    const options = { enemy: { defense, resistance: 40 } }
    const owner = output('char_4016_kazema', 2, { kazemaruS2Actor: 'OWNER' }, options)
    const token = output('char_4016_kazema', 2, { kazemaruS2Actor: 'TOKEN' }, options)
    close(valid(owner).perAttack, physical(1698, defense))
    close(valid(token).perAttack, physical(1698, defense))
    close(token.attackInterval, 1.2)
    assert.equal(token.actor?.ownerAttackStat, undefined)
    const entry = output('char_4016_kazema', 2, { kazemaruS2Actor: 'ENTRY', actualAttackTargetCount: 4 }, options)
    close(valid(entry).perAttack, 1698 * 2.7 * .6)
    close(entry.rows[0].allTargetsPerAttack, 1698 * 2.7 * .6 * 4)
    assert.equal(entry.rows[0].dps, null)
  }
  close(valid(output('char_4016_kazema', 2, { kazemaruS2Actor: 'OWNER' }, { trust: 0 })).perAttack, 1522 - 500)
  close(valid(output('char_4016_kazema', 2, { kazemaruS2Actor: 'TOKEN' }, { trust: 0 })).perAttack, 1698 - 500)
  close(valid(output('char_4016_kazema', 2, { kazemaruS2Actor: 'ENTRY' }, { trust: 0 })).perAttack, 1698 * 2.7 * .6)
  close(valid(output('char_4016_kazema', 2, { kazemaruS2Actor: 'TOKEN' }, { operatorLevel: 1 })).perAttack, 1392 - 500)
})

test('別群の召喚物もlive能力値・スキル紐付け・素質変化を黙って流用しない', () => {
  for (const [id, index, key, guard] of [
    ['char_4046_ebnhlz', 2, 'token_10024_ebnhlz_rcube', {}],
    ['char_4016_kazema', 2, 'token_10022_kazema_shadow', { kazemaruS2Actor: 'ENTRY' }],
  ] as const) {
    const mutations: ((skill: SkillRecord) => void)[] = [
      skill => { delete skill.operatorProfile.summonProfiles },
      skill => { skill.overrideTokenKey = null },
      skill => { skill.operatorProfile.summonProfiles![key].profile.phases[2].attributesKeyFrames!.at(-1)!.data!.atk! += 1 },
      skill => { skill.operatorProfile.summonProfiles![key].profile.talents = [] },
      skill => { for (const candidate of skill.operatorProfile.talents![0].candidates!) candidate.description += '未確認の追加効果' },
    ]
    for (const [mutationIndex, mutate] of mutations.entries()) {
      const result = output(id, index, guard, {}, mutate)
      assert.equal(result.rows.length, 0, `${id} mutation ${mutationIndex}`)
      assert.ok(result.unsupportedReasons.length)
    }
  }
  const changedScale = output('char_4016_kazema', 2, { kazemaruS2Actor: 'ENTRY' }, {}, skill => {
    for (const candidate of skill.operatorProfile.talents![0].candidates!)
      candidate.blackboard!.find(entry => entry.key === 'damage_scale')!.value = 3
  })
  assert.equal(changedScale.rows.length, 0)
  assert.ok(changedScale.unsupportedReasons.length)
  for (const attack of [NaN, Infinity, -1]) {
    const invalidOwner = output('char_4046_ebnhlz', 2, {}, {}, skill => {
      skill.operatorProfile.phases[2].attributesKeyFrames!.at(-1)!.data!.atk = attack
    })
    assert.equal(invalidOwner.rows.length, 0)
    assert.ok(invalidOwner.unsupportedReasons.length)
    assert.equal(invalidOwner.actor?.ownerAttackStat, undefined)
  }
})

test('Stainless S3は本人と装置の計算元を分離し直撃/周囲成分を独立評価する', () => {
  for (const active of [false, true]) for (const defense of [0, 500, 100000]) {
    const attack = active ? 981 : 633, options = { enemy: { defense, resistance: 40 } }
    const owner = output('char_4072_ironmn', 3, { ironmnSkillActive: active }, options)
    close(valid(owner).perAttack, physical(attack, defense))
    close(owner.attackSpeed, active ? 155 : 100)
    for (const [choice, scale] of [['DIRECT', 3], ['SPLASH', 1.5]] as const) {
      const result = output('char_4072_ironmn', 3, { ironmnS3Actor: choice, ironmnSkillActive: active,
        actualAttackTargetCount: choice === 'SPLASH' ? 3 : 1 }, options), row = valid(result)
      close(row.perAttack, physical(attack * scale, defense))
      close(row.allTargetsPerAttack, physical(attack * scale, defense) * (choice === 'SPLASH' ? 3 : 1))
      close(result.stats.attack, 100)
      close(result.actor?.ownerAttackStat, attack)
      assert.equal(result.actor?.tokenKey, 'token_10027_ironmn_pile3')
      assert.equal(row.dps, null)
    }
  }
  const lowTrust = output('char_4072_ironmn', 3, { ironmnS3Actor: 'DIRECT' }, { trust: 0 })
  close(valid(lowTrust).perAttack, 919 * 3 - 500)
  const lowLevel = output('char_4072_ironmn', 3, { ironmnS3Actor: 'DIRECT' }, { operatorLevel: 1 })
  close(valid(lowLevel).perAttack, 824 * 3 - 500)
  const arts = output('char_4072_ironmn', 3, { ironmnS3Actor: 'DIRECT' }, { virtualMainAttackType: 'ARTS' })
  close(valid(arts).perAttack, 981 * 3 * .6)
  const combined = output('char_4072_ironmn', 3, { ironmnS3Actor: 'COMBINED' })
  assert.equal(combined.rows.length, 0)
  assert.match(combined.unsupportedReasons.join(' '), /重複.*未確認/)
  const changed = output('char_4072_ironmn', 3, { ironmnS3Actor: 'DIRECT' }, {}, skill => {
    skill.operatorProfile.summonProfiles!.token_10027_ironmn_pile3.skills[0].levels.at(-1)!.blackboard![0].value! += 1
  })
  assert.equal(changed.rows.length, 0)
  assert.ok(changed.unsupportedReasons.length)
})
