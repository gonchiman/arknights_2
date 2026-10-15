import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

// Saved JP skill and talent candidates are independent of both structure registries.
const skills = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorName: string; skills: (RawSkillLevel & { skillId: string; skillIndex: number })[]
}[]
const talents = JSON.parse(readFileSync(new URL('./fixtures/talentStructureFourOperators.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
const profiles = {
  char_172_svrash: { low: 577, high: 713, trust: 50, interval: 1.3, subclass: 'lord', nationId: 'kjerag', groupId: 'karlan' },
  char_263_skadi: { low: 842, high: 1015, trust: 80, interval: 1.5, subclass: 'fearless', nationId: 'egir', groupId: 'abyssal' },
  char_350_surtr: { low: 544, high: 672, trust: 100, interval: 1.25, subclass: 'artsfghter', nationId: 'rhodes', groupId: null },
  char_293_thorns: { low: 575, high: 711, trust: 30, interval: 1.3, subclass: 'lord', nationId: 'iberia', groupId: null },
} as const
type OperatorId = keyof typeof profiles

function record(operatorId: OperatorId = 'char_350_surtr', skillIndex = 2): SkillRecord {
  const operator = skills.find(entry => entry.operatorId === operatorId)!
  const skill = structuredClone(operator.skills.find(entry => entry.skillIndex === skillIndex)!)
  const growth = profiles[operatorId]
  const operatorProfile = structuredClone(talents.find(entry => entry.operatorId === operatorId)!.operatorProfile)
  return {
    id: `${operatorId}:${skill.skillId}`, operatorId, operatorName: operator.operatorName,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: growth.subclass,
    subProfessionName: growth.subclass, nameInitial: 'S_ROW', skillId: skill.skillId, skillIndex,
    skillName: skill.name!, description: skill.description!, duration: skill.duration!, durationType: skill.durationType!,
    skillType: skill.skillType!, spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 1,
    classification: classifySkill(skill), skillLevels: Array.from({ length: 10 }, () => structuredClone(skill)), raw: skill,
    operatorProfile: {
      ...operatorProfile, affiliation: operatorId === 'char_263_skadi' ? 'アビサルハンター' : '表示用所属',
      affiliationIds: { nationId: growth.nationId, groupId: growth.groupId, teamId: null },
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: growth.low, baseAttackTime: growth.interval, attackSpeed: 100 } },
        { level: 90, data: { atk: growth.high, baseAttackTime: growth.interval, attackSpeed: 100 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: growth.trust } }],
    },
  }
}
function output(skill = record(), patch: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, ...patch })
}
function candidate(skill: SkillRecord, talentIndex = 0) {
  return skill.operatorProfile.talents![talentIndex].candidates![0]
}
function blackboard(skill: SkillRecord, talentIndex = 0) {
  const entries = candidate(skill, talentIndex).blackboard
  assert.ok(Array.isArray(entries))
  return entries
}
function setValue(skill: SkillRecord, key: string, value: number, talentIndex = 0) {
  const entry = blackboard(skill, talentIndex).find(entry => entry.key === key)
  assert.ok(entry, key)
  entry.value = value
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}
function rowAt(result: ReturnType<typeof output>, axisValue: number) {
  const row = result.rows.find(entry => entry.axisValue === axisValue)
  assert.ok(row, `axis=${axisValue}`)
  return row
}

test('自己ATKと陣営ATKはスキル補正へ加算し、基礎ATKや攻撃倍率と二重に乗算しない', () => {
  const silverash = output(record('char_172_svrash', 3))
  const skadi = output(record('char_263_skadi', 1))
  for (const [result, talentRatio, skillPercent, base, expected] of [
    [silverash, 0.10, 200, 763, 2365], [skadi, 0.14, 45, 1095, 1741],
  ] as const) {
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.talentAttackRatio, talentRatio)
    assert.equal(result.stats.attack, base)
    assert.equal(result.model?.directMultiplierPercent, skillPercent, 'skill and talent contributions stay separate')
    close(result.rows[0].breakdown.attackPipeline.directMultiplierPercent, skillPercent + talentRatio * 100)
    assert.equal(result.rows[0].perAttack, expected)
    assert.notEqual(result.rows[0].perAttack, Math.floor(base * (1 + skillPercent / 100) * (1 + talentRatio)))
  }
  assert.ok(skadi.talentEffects.some(entry => entry.effect?.item === 'ATK_BUFF_RATIO' && entry.status === 'APPLIED'))
})

test('原典blackboardの値の変更が共通適用へ届き、OP名に固定された係数を使わない', () => {
  const silverash = record('char_172_svrash', 3)
  setValue(silverash, 'atk', 0.23)
  const skadi = record('char_263_skadi', 1)
  setValue(skadi, 'atk', 0.20)
  const surtr = record()
  setValue(surtr, 'magic_resist_penetrate_fixed', 7)
  close(output(silverash).talentAttackRatio, 0.23)
  assert.equal(output(silverash).rows[0].perAttack, 2464)
  close(output(skadi).talentAttackRatio, 0.20)
  assert.equal(output(skadi).rows[0].perAttack, 1806)
  const result = output(surtr)
  assert.equal(result.resistanceIgnoreFixed, 7)
  close(rowAt(result, 60).perAttack, 2716.8 * 0.47)
})

test('術耐性無視は元の横軸60を40へ軽減して計算し、0未満への軽減と最低保証を既存処理へ委ねる', () => {
  const result = output()
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.resistanceIgnoreFixed, 20)
  const middle = rowAt(result, 60)
  assert.equal(middle.axisValue, 60)
  assert.equal(middle.breakdown.mitigation.inputResistance, 60)
  assert.equal(middle.breakdown.mitigation.appliedResistance, 40)
  close(middle.perAttack, 2716.8 * 0.6)
  for (const resistance of [0, 20]) {
    const row = rowAt(result, resistance)
    assert.equal(row.breakdown.mitigation.appliedResistance, 0)
    close(row.perAttack, 2716.8)
  }
  const noIgnore = record()
  setValue(noIgnore, 'magic_resist_penetrate_fixed', 0)
  const baseline = output(noIgnore)
  assert.deepEqual(result.rows.map(row => row.axisValue), baseline.rows.map(row => row.axisValue))
  assert.equal(rowAt(result, 100).breakdown.mitigation.appliedResistance, 80)
  close(rowAt(result, 100).perAttack, 2716.8 * 0.2)
  assert.equal(rowAt(baseline, 100).breakdown.mitigation.minimumApplied, true)
  close(rowAt(baseline, 100).perAttack, 2716.8 * 0.05)
})

test('陣営selectorは日本語表示名ではなくnation・group・teamの全raw IDを照合する', () => {
  for (const field of ['nationId', 'groupId', 'teamId'] as const) {
    const skadi = record('char_263_skadi', 1)
    skadi.operatorProfile.affiliation = '陣営名とは無関係な表示'
    skadi.operatorProfile.affiliationIds = { nationId: 'other_nation', groupId: 'other_group', teamId: 'other_team', [field]: 'abyssal' }
    const result = output(skadi)
    assert.deepEqual(result.unsupportedReasons, [], field)
    close(result.talentAttackRatio, 0.14)
    assert.equal(result.rows[0].perAttack, 1741)
    skadi.operatorProfile.affiliationIds = { [field]: 'abyssal' }
    assert.equal(output(skadi).rows[0].perAttack, 1741, `${field} match is decisive even with other IDs unknown`)
  }
})

test('既知の陣営非該当は不成立として素質なしの値を出し、所属データ不明は代用せず停止する', () => {
  const nonmember = record('char_263_skadi', 1)
  nonmember.operatorProfile.affiliationIds = { nationId: null, groupId: null, teamId: null }
  const result = output(nonmember)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.talentAttackRatio, 0)
  assert.equal(result.rows[0].perAttack, 1587)
  assert.equal(result.talentEffects.find(entry => entry.effect?.item === 'ATK_BUFF_RATIO')?.status, 'CONDITION_FALSE')
  for (const affiliationIds of [undefined, { nationId: 'egir' }]) {
    const unknown = record('char_263_skadi', 1)
    unknown.operatorProfile.affiliationIds = affiliationIds
    const missing = output(unknown)
    assert.deepEqual(missing.rows, [])
    assert.ok(missing.unsupportedReasons.length > 0)
    assert.ok(missing.talentEffects.some(entry => entry.talentIndex === 0 && entry.status === 'UNVERIFIED'))
  }
})

test('E2 Lv1で解放済みの素質を使い、構造ページの最大レベル90を要求しない', () => {
  for (const [operatorId, skillIndex, expected, talentRatio, resistanceIgnore] of [
    ['char_172_svrash', 2, 634, 0.1, 0],
    ['char_263_skadi', 1, 1338, 0.14, 0],
    ['char_350_surtr', 2, 1913.6, 0, 20],
  ] as const) {
    const result = output(record(operatorId, skillIndex), { operatorLevel: 1, trust: 0 })
    assert.deepEqual(result.unsupportedReasons, [], operatorId)
    close(result.rows[0].perAttack, expected)
    close(result.talentAttackRatio, talentRatio)
    assert.equal(result.resistanceIgnoreFixed, resistanceIgnore)
    assert.ok(result.talentEffects.some(entry => entry.status === 'APPLIED'))
  }
})

test('未解放・別素質名・別prefabのcandidateを最大レベル版や同じキーだけで代用しない', () => {
  for (const mutate of [
    (skill: SkillRecord) => { candidate(skill).name = '別の効果' },
    (skill: SkillRecord) => { candidate(skill).prefabKey = 'wrong_slot' },
    (skill: SkillRecord) => { candidate(skill).unlockCondition = { phase: 'PHASE_2', level: 30 } },
    (skill: SkillRecord) => { candidate(skill).requiredPotentialRank = 4 },
  ]) {
    const skill = record()
    mutate(skill)
    const result = output(skill, { operatorLevel: 1 })
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.length > 0)
    assert.ok(result.talentEffects.some(entry => entry.talentIndex === 0 && entry.effect === null && entry.status === 'UNVERIFIED'))
  }
})

test('計算に必要な素質キーの欠落・非数値・重複は0や固定値へ置き換えない', () => {
  for (const [operatorId, skillIndex, key] of [
    ['char_172_svrash', 3, 'atk'], ['char_263_skadi', 1, 'atk'],
    ['char_350_surtr', 2, 'magic_resist_penetrate_fixed'],
  ] as const) for (const mutation of ['missing', 'nan', 'duplicate'] as const) {
    const skill = record(operatorId, skillIndex)
    const entries = blackboard(skill)
    const index = entries.findIndex(entry => entry.key === key)
    if (mutation === 'missing') entries.splice(index, 1)
    if (mutation === 'nan') entries[index].value = NaN
    if (mutation === 'duplicate') entries.push({ key, value: 0.99 })
    const result = output(skill)
    assert.deepEqual(result.rows, [], `${operatorId}/${mutation}`)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.ok(result.talentEffects.some(entry => entry.talentIndex === 0 && ['UNVERIFIED', 'UNSUPPORTED'].includes(entry.status)))
  }
})

test('同じ素質内の再配置キー欠落や別素質の生存・回復データ欠落は直接攻撃を止めない', () => {
  for (const [operatorId, skillIndex, talentIndex, key, expected] of [
    ['char_172_svrash', 3, 0, 'respawn_time', 2365],
    ['char_263_skadi', 1, 1, 'respawn_time', 1741],
    ['char_350_surtr', 2, 1, 'surtr_t_2[withdraw].interval', 2716.8],
    ['char_293_thorns', 1, 1, 'hp_recovery_per_sec_by_max_hp_ratio', 1482],
  ] as const) {
    const skill = record(operatorId, skillIndex)
    const entries = blackboard(skill, talentIndex)
    entries.splice(entries.findIndex(entry => entry.key === key), 1)
    const result = output(skill)
    assert.deepEqual(result.unsupportedReasons, [], key)
    close(result.rows[0].perAttack, expected)
    assert.ok(result.talentEffects.some(entry => entry.talentIndex === talentIndex && entry.status === 'NOT_RELEVANT'))
  }
})

test('素質枠そのものが未確認なら既知の非DPS効果と仮定して無視しない', () => {
  const skill = record('char_172_svrash', 3)
  skill.operatorProfile.talents![1] = { candidates: [] }
  const result = output(skill)
  assert.ok(result.unsupportedReasons.length > 0)
  assert.deepEqual(result.rows, [])
  assert.ok(result.talentEffects.some(entry => entry.talentIndex === 1 && entry.effect === null && entry.status === 'UNVERIFIED'))
})

test('再配置・看破・回復・生存は今回の式の対象外とし、毒だけを未対応の攻撃成分として区別する', () => {
  for (const operatorId of Object.keys(profiles) as OperatorId[]) {
    const result = output(record(operatorId, 1))
    assert.deepEqual(result.unsupportedReasons, [])
    const expectedItems = operatorId === 'char_172_svrash' ? ['REDEPLOY_TIME', 'STEALTH']
      : operatorId === 'char_263_skadi' ? ['REDEPLOY_TIME']
        : operatorId === 'char_350_surtr' ? ['HP', 'FORCED_RETREAT'] : ['HP_RESTORE_RATIO']
    for (const item of expectedItems) assert.ok(result.talentEffects.some(entry => entry.effect?.item === item && entry.status === 'NOT_RELEVANT'), `${operatorId}/${item}`)
    assert.equal(result.hasUnsupportedTalentDamage, operatorId === 'char_293_thorns')
  }
})

test('ソーンズの毒125/250や未確定tickを加算せず、通常攻撃分を残し未対応成分を明示する', () => {
  const skill = record('char_293_thorns', 1)
  const before = structuredClone(skill)
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.hasUnsupportedTalentDamage, true)
  assert.equal(result.rows[0].perAttack, 1482)
  close(result.rows[0].dps, 1482 / 1.3)
  const poison = result.talentEffects.filter(entry => entry.effect?.item === 'DAMAGE_OVER_TIME')
  assert.equal(poison.length, 2)
  assert.ok(poison.every(entry => entry.status === 'UNSUPPORTED'))
  assert.ok(result.scopeNotes.some(note => /毒|継続ダメージ/.test(note)))
  assert.deepEqual(skill, before)
})

test('ソーンズS2は毒の反撃時付与を仮定せず、毒を除いた反撃1回とDPSなしを維持する', () => {
  const result = output(record('char_293_thorns', 2), { conditions: { actualAttackTargetCount: 4 } })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.attackKind, 'COUNTER')
  assert.equal(result.hasUnsupportedTalentDamage, true)
  close(result.rows[0].perAttack, 948)
  close(result.rows[0].allTargetsPerAttack, 3792)
  assert.equal(result.canShowDps, false)
  assert.ok(result.rows.every(row => row.dps === null && row.allTargetsDps === null))
})

test('潜在強化candidate・潜在ATK・MOD補正は潜在1の素質へ混入しない', () => {
  const skill = record('char_172_svrash', 3)
  const enhanced = structuredClone(candidate(skill))
  enhanced.requiredPotentialRank = 4
  enhanced.blackboard = [{ key: 'atk', value: 0.90 }, { key: 'respawn_time', value: -0.9 }]
  skill.operatorProfile.talents![0].candidates!.push(enhanced)
  skill.operatorProfile.potentialRanks = [{ buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', value: 999 }] } } }]
  skill.operatorProfile.modules = [{ uniEquipId: 'fake_module', phases: [{ equipLevel: 3, attributeBlackboard: { atk: 999, attack_speed: 99 } }] }]
  const result = output(skill)
  close(result.talentAttackRatio, 0.10)
  assert.equal(result.stats.attack, 763)
  assert.equal(result.stats.baseAttackBreakdown.potentialAttack, 0)
  assert.equal(result.stats.baseAttackBreakdown.moduleAttack, 0)
  assert.equal(result.attackSpeed, 100)
  assert.equal(result.rows[0].perAttack, 2365)
})

test('別OPの自己素質を同じatkキーから適用せず、結果の出典は選択OPだけを保持する', () => {
  const silverash = record('char_172_svrash', 3)
  const skadi = record('char_263_skadi', 1)
  const impostor = structuredClone(skadi)
  impostor.operatorProfile.talents![0] = structuredClone(silverash.operatorProfile.talents![0])
  const invalid = output(impostor)
  assert.deepEqual(invalid.rows, [])
  assert.ok(invalid.talentEffects.some(entry => entry.talentIndex === 0 && entry.effect === null && entry.status === 'UNVERIFIED'))
  for (const skill of [silverash, skadi, record(), record('char_293_thorns', 1), silverash]) {
    const result = output(skill)
    assert.ok(result.rows.length > 0)
    assert.ok(result.talentEffects.length > 0)
    assert.ok(result.talentEffects.every(entry => entry.operatorId === skill.operatorId))
    assert.equal(new Set(result.talentEffects.map(entry => entry.talentIndex)).size, 2)
  }
})
