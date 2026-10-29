import { reviewedTraitProfile } from './legacyTraitFixture.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { resolveSingleStackDamageOverTimeRate } from '../src/lib/damageOverTime.ts'
import type { CombatDamageOverTime } from '../src/lib/combatEffectStructure.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

// These saved JP candidates are independent of the executable skill/talent structures.
const skills = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorName: string; skills: (RawSkillLevel & { skillId: string; skillIndex: number })[]
}[]
const talents = JSON.parse(readFileSync(new URL('./fixtures/talentStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
const growth = {
  char_293_thorns: { low: 575, high: 711, trust: 30, interval: 1.3, subclass: 'lord' },
  char_350_surtr: { low: 544, high: 672, trust: 100, interval: 1.25, subclass: 'artsfghter' },
} as const
type OperatorId = keyof typeof growth

function record(skillIndex = 1, operatorId: OperatorId = 'char_293_thorns'): SkillRecord {
  const source = skills.find(entry => entry.operatorId === operatorId)!
  const skill = structuredClone(source.skills.find(entry => entry.skillIndex === skillIndex)!)
  const profile = structuredClone(talents.find(entry => entry.operatorId === operatorId)!.operatorProfile)
  const stats = growth[operatorId]
  return {
    id: `${operatorId}:${skill.skillId}`, operatorId, operatorName: source.operatorName,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: stats.subclass,
    subProfessionName: stats.subclass, nameInitial: 'S_ROW', skillId: skill.skillId, skillIndex,
    skillName: skill.name!, description: skill.description!, duration: skill.duration!, durationType: skill.durationType!,
    skillType: skill.skillType!, spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 1,
    classification: classifySkill(skill), skillLevels: Array.from({ length: 10 }, () => structuredClone(skill)), raw: skill,
    operatorProfile: { ...profile, ...reviewedTraitProfile(operatorId),
      affiliationIds: { nationId: 'iberia', groupId: null, teamId: null },
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: stats.low, baseAttackTime: stats.interval, attackSpeed: 100 } },
        { level: 90, data: { atk: stats.high, baseAttackTime: stats.interval, attackSpeed: 100 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: stats.trust } }],
    },
  }
}
function output(skill = record(), patch: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, ...patch })
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}
function dot(result: ReturnType<typeof output>) {
  assert.ok(result.damageOverTime)
  return result.damageOverTime
}
function poisonValues(skill: SkillRecord) {
  const values = skill.operatorProfile.talents![0].candidates![0].blackboard
  assert.ok(Array.isArray(values))
  return values
}
function setPoison(skill: SkillRecord, key: string, value: number) {
  const entry = poisonValues(skill).find(entry => entry.key === key)
  assert.ok(entry)
  entry.value = value
}
function setInterval(skill: SkillRecord, seconds: number) {
  for (const frame of skill.operatorProfile.phases[2].attributesKeyFrames!) frame.data!.baseAttackTime = seconds
}

test('毒の既定条件は術耐性0・遠距離攻撃不可で、単一の125毎秒だけを加算する', () => {
  const source = record()
  const before = structuredClone(source)
  const result = output(source)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.hasUnsupportedTalentDamage, false)
  const poison = dot(result)
  assert.equal(poison.enemyResistance, 0)
  assert.equal(poison.durationSeconds, 3)
  assert.equal(poison.rawDamagePerSecond, 125)
  assert.equal(poison.damagePerSecond, 125)
  assert.equal(poison.steadyDps, 125)
  const row = result.rows[0]
  assert.equal(row.perAttack, 1482, 'poison is not instantaneous damage per attack')
  close(row.dps, 1482 / 1.3)
  close(row.damageOverTimeDps, 125)
  close(row.combinedDps, 1482 / 1.3 + 125)
  assert.equal(result.talentEffects.filter(entry => entry.effect?.item === 'DAMAGE_OVER_TIME' && entry.status === 'APPLIED').length, 1)
  assert.equal(result.talentEffects.filter(entry => entry.effect?.item === 'DAMAGE_OVER_TIME' && entry.status === 'CONDITION_FALSE').length, 1)
  assert.deepEqual(source, before)
})

test('敵の遠距離攻撃能力だけで125と250を排他的に選び、自身の攻撃距離とは混同しない', () => {
  for (const attackDistanceType of ['MELEE', 'RANGED'] as const) {
    const melee = output(record(), { conditions: { attackDistanceType, enemyAttackCapability: 'MELEE_ONLY' } })
    const ranged = output(record(), { conditions: { attackDistanceType, enemyAttackCapability: 'RANGED_CAPABLE' } })
    assert.equal(dot(melee).rawDamagePerSecond, 125)
    assert.equal(dot(ranged).rawDamagePerSecond, 250)
    close(ranged.rows[0].damageOverTimeDps, 250)
    close(ranged.rows[0].combinedDps! - melee.rows[0].combinedDps!, 125)
    assert.equal(ranged.rows[0].perAttack, melee.rows[0].perAttack)
  }
})

test('毒だけを術耐性で軽減し、防御力の横軸や主攻撃の物理軽減から独立する', () => {
  const baseline = output()
  const result = output(record(), { conditions: { enemyResistance: 60, enemyAttackCapability: 'RANGED_CAPABLE' } })
  assert.equal(result.axisLabel, '敵の防御力')
  assert.deepEqual(result.rows.map(row => row.axisValue), baseline.rows.map(row => row.axisValue))
  close(dot(result).damagePerSecond, 250 * 0.4)
  assert.equal(dot(result).enemyResistance, 60)
  for (const [index, row] of result.rows.entries()) {
    close(row.perAttack, baseline.rows[index].perAttack)
    close(row.dps, baseline.rows[index].dps!)
    close(row.damageOverTimeDps, 100)
    close(row.combinedDps, row.dps! + 100)
  }
  assert.notEqual(result.rows[0].perAttack, result.rows.at(-1)!.perAttack)
})

test('毒の術耐性100にも既存の5%最低保証を適用し、0は省略と区別せず有効な入力とする', () => {
  for (const [enemyResistance, expected] of [[0, 125], [100, 6.25]] as const) {
    const result = output(record(), { conditions: { enemyResistance, enemyAttackCapability: 'MELEE_ONLY' } })
    assert.deepEqual(result.unsupportedReasons, [])
    close(dot(result).damagePerSecond, expected)
    close(result.rows[0].combinedDps, 1482 / 1.3 + expected)
  }
})

test('S1とS3の攻撃速度や発動段階が変わっても、同一対象の毒を積み重ねない', () => {
  const s1 = output(record(1))
  const first = output(record(3), { conditions: { skillActivationCount: 1 } })
  const second = output(record(3), { conditions: { skillActivationCount: 2 } })
  close(first.attackInterval, 1.3 / 1.25)
  close(second.attackInterval, 1.3 / 1.5)
  for (const result of [s1, first, second]) {
    assert.deepEqual(result.unsupportedReasons, [])
    close(dot(result).steadyDps, 125)
    close(result.rows[0].combinedDps! - result.rows[0].dps!, 125)
    assert.notEqual(result.rows[0].damageOverTimeDps, 125 / result.attackInterval!)
    assert.notEqual(result.rows[0].damageOverTimeDps, 125 * 3 / result.attackInterval!)
  }
})

test('反撃は命中した全対象へ毒を付与するが、頻度不明の反撃DPSや合計DPSを作らない', () => {
  const result = output(record(2), { conditions: {
    actualAttackTargetCount: 4, enemyResistance: 40, enemyAttackCapability: 'RANGED_CAPABLE',
  } })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.attackKind, 'COUNTER')
  assert.equal(result.canShowDps, false)
  assert.equal(result.hasUnsupportedTalentDamage, false)
  close(dot(result).damagePerSecond, 150)
  close(dot(result).allTargetsDamagePerSecond, 600)
  assert.equal(dot(result).steadyDps, null)
  assert.ok(dot(result).steadyDpsReason)
  for (const row of result.rows) {
    assert.equal(row.dps, null)
    assert.equal(row.allTargetsDps, null)
    assert.equal(row.damageOverTimeDps, null)
    assert.equal(row.combinedDps, null)
    assert.equal(row.allTargetsCombinedDps, null)
    close(row.allTargetsPerAttack, row.perAttack * 4)
  }
  close(result.rows[0].perAttack, 948)
})

test('原典の毎秒量と持続時間の変更を読み、125/250や3秒を計算式に固定しない', () => {
  const skill = record()
  setPoison(skill, 'damage[normal]', 70)
  setPoison(skill, 'damage[ranged]', 180)
  setPoison(skill, 'duration', 2)
  const normal = output(skill)
  const ranged = output(skill, { conditions: { enemyResistance: 30, enemyAttackCapability: 'RANGED_CAPABLE' } })
  assert.equal(dot(normal).durationSeconds, 2)
  close(dot(normal).rawDamagePerSecond, 70)
  close(dot(normal).steadyDps, 70)
  close(dot(ranged).rawDamagePerSecond, 180)
  close(dot(ranged).damagePerSecond, 126)
  close(ranged.rows[0].combinedDps, 1482 / 1.3 + 126)
})

test('持続時間より攻撃間隔が長い又は同じ場合は、付与中の毎秒量だけを出し定常合計を保留する', () => {
  for (const seconds of [3, 3.1]) {
    const skill = record()
    setInterval(skill, seconds)
    const result = output(skill)
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.attackInterval, seconds)
    close(dot(result).damagePerSecond, 125)
    assert.equal(dot(result).steadyDps, null)
    assert.ok(dot(result).steadyDpsReason)
    for (const row of result.rows) {
      assert.notEqual(row.dps, null)
      assert.equal(row.damageOverTimeDps, null)
      assert.equal(row.combinedDps, null)
      assert.equal(row.allTargetsCombinedDps, null)
    }
  }
})

test('原典の持続を短くすると常時維持できなくなるため、毎秒量を機械的に定常DPSへ流用しない', () => {
  const skill = record()
  setPoison(skill, 'duration', 1)
  const result = output(skill)
  assert.equal(dot(result).durationSeconds, 1)
  assert.equal(dot(result).damagePerSecond, 125)
  assert.equal(dot(result).steadyDps, null)
  assert.equal(result.rows[0].combinedDps, null)
})

test('毒の0ダメージは未取得と混同せず、0を含めて正常に加算する', () => {
  const skill = record()
  setPoison(skill, 'damage[normal]', 0)
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.hasUnsupportedTalentDamage, false)
  assert.equal(dot(result).damagePerSecond, 0)
  assert.equal(dot(result).steadyDps, 0)
  close(result.rows[0].combinedDps, result.rows[0].dps!)
})

test('毒の値欠落・不正値・持続0は0や固定値で補わず、直接攻撃だけを保持する', () => {
  for (const mutation of ['missing', 'nan', 'negative', 'zero_duration'] as const) {
    const skill = record()
    if (mutation === 'missing') {
      const entries = poisonValues(skill)
      entries.splice(entries.findIndex(entry => entry.key === 'damage[normal]'), 1)
    } else if (mutation === 'zero_duration') setPoison(skill, 'duration', 0)
    else setPoison(skill, 'damage[normal]', mutation === 'nan' ? NaN : -1)
    const result = output(skill)
    assert.deepEqual(result.unsupportedReasons, [], mutation)
    assert.equal(result.hasUnsupportedTalentDamage, true)
    assert.equal(result.damageOverTime, null)
    assert.equal(result.rows[0].perAttack, 1482)
    close(result.rows[0].dps, 1482 / 1.3)
    assert.equal(result.rows[0].combinedDps, null)
    assert.ok(result.talentEffects.some(entry => entry.effect?.item === 'DAMAGE_OVER_TIME'
      && ['UNSUPPORTED', 'UNVERIFIED'].includes(entry.status)), mutation)
  }
})

test('毒の新条件に不正な術耐性や敵攻撃方法を与えたら、既定値へ置き換えず入力エラーを返す', () => {
  for (const conditions of [
    { enemyResistance: -1 }, { enemyResistance: 101 }, { enemyResistance: NaN },
    { enemyResistance: Infinity }, { enemyAttackCapability: 'UNKNOWN' },
  ]) {
    const result = output(record(), { conditions: conditions as DamageCalculatorThreeInput['conditions'] })
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.length > 0)
  }
})

test('別OPの術攻撃にソーンズの毒や毒用術耐性を混ぜず、従来の横軸軽減を保つ', () => {
  const skill = record(2, 'char_350_surtr')
  const baseline = output(skill)
  const unrelated = output(skill, { conditions: { enemyResistance: 90, enemyAttackCapability: 'RANGED_CAPABLE' } })
  assert.deepEqual(unrelated.unsupportedReasons, [])
  assert.equal(unrelated.damageOverTime, null)
  assert.equal(unrelated.resistanceIgnoreFixed, 20)
  assert.equal(unrelated.hasUnsupportedTalentDamage, false)
  assert.deepEqual(unrelated.rows.map(row => [row.axisValue, row.perAttack, row.dps]),
    baseline.rows.map(row => [row.axisValue, row.perAttack, row.dps]))
  const row = unrelated.rows.find(row => row.axisValue === 60)!
  close(row.perAttack, 2716.8 * 0.6)
  close(row.combinedDps, row.dps!)
  assert.ok(unrelated.talentEffects.every(entry => entry.operatorId === 'char_350_surtr'))
})

function rateFixture(): CombatDamageOverTime {
  return {
    kind: { type: 'ORDINARY', damageType: 'ARTS' },
    amount: { basis: 'FIXED', value: 70, referenceTime: 'NOT_APPLICABLE' },
    rate: 'PER_SECOND', duration: { type: 'FIXED_SECONDS', seconds: 2 },
    cadence: { intervalSeconds: null, firstTickSeconds: null },
    stacking: { mode: 'REPLACE', maxStacks: 1 }, refresh: 'RESET_DURATION',
  }
}

test('周期・初回時刻が未知でも既知の毎秒レートを解決し、未知時刻や有限時間の命中数を捏造しない', () => {
  const source = rateFixture()
  const before = structuredClone(source)
  const result = resolveSingleStackDamageOverTimeRate(source)
  assert.deepEqual(result, { rate: { durationSeconds: 2, rawDamagePerSecond: 70 }, status: null, reason: null })
  assert.deepEqual(source, before)
  assert.equal(source.cadence.intervalSeconds, null)
  assert.equal(source.cadence.firstTickSeconds, null)
})

test('未確認の重複・更新・量は確認済みの単一毒へ読み替えない', () => {
  const original = rateFixture()
  for (const source of [
    { ...original, stacking: { mode: 'UNSPECIFIED', maxStacks: null } },
    { ...original, refresh: 'UNSPECIFIED' },
    { ...original, amount: { basis: 'FIXED', value: null, referenceTime: 'NOT_APPLICABLE' } },
    { ...original, duration: { type: 'FIXED_SECONDS', seconds: null } },
  ] as CombatDamageOverTime[]) {
    const result = resolveSingleStackDamageOverTimeRate(source)
    assert.equal(result.rate, null)
    assert.equal(result.status, 'UNVERIFIED')
    assert.ok(result.reason)
  }
})

test('未対応の毎tick・攻撃力参照・異なる属性・重複方式を固定毎秒術ダメージとして実行しない', () => {
  const original = rateFixture()
  for (const source of [
    { ...original, rate: 'PER_TICK' },
    { ...original, amount: { basis: 'ATK_RATIO', ratio: 0.3, reference: 'SOURCE', referenceTime: 'ON_APPLY' } },
    { ...original, kind: { type: 'ORDINARY', damageType: 'PHYSICAL' } },
    { ...original, kind: { type: 'ELEMENTAL_DAMAGE', elementId: 'neural' } },
    { ...original, stacking: { mode: 'ADD_STACKS', maxStacks: 3 } },
    { ...original, refresh: 'INDEPENDENT' },
  ] as CombatDamageOverTime[]) {
    const result = resolveSingleStackDamageOverTimeRate(source)
    assert.equal(result.rate, null)
    assert.equal(result.status, 'UNSUPPORTED')
    assert.ok(result.reason)
  }
})
