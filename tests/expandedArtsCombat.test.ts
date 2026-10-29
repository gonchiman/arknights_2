import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXPANDED_ARTS_DEFINITIONS } from '../src/lib/expandedArtsDefinitions.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import { buildExpandedTalentStructures } from '../src/lib/expandedTalentStructure.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedArtsSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function record(id: string, index: number): SkillRecord {
  const source = sources.find(source => source.operatorId === id)!
  const skill = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(source.profile) }
}
function output(id: string, index: number, guard: GuardConditions = {}, change?: (record: SkillRecord) => void) {
  const skill = record(id, index), source = sources.find(source => source.operatorId === id)!
  change?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard } })
}
function at(id: string, index: number, guard: GuardConditions = {}, resistance = 0) {
  const result = output(id, index, guard)
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
  return { result, row: result.rows.find(row => row.axisValue === resistance)! }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const attack = (base: number, ratio = 0) => Math.floor(base * (1 + ratio) + 1e-9)

test('術師・補助・呪癒師32名の67スキルを45対応・22保留に分け、全素質を登録する', () => {
  assert.equal(sources.length, 32)
  assert.equal(sources.reduce((sum, source) => sum + source.skills.length, 0), 67)
  assert.equal(EXPANDED_ARTS_DEFINITIONS.reduce((sum, definition) => sum + definition.recipes.length, 0), 45)
  for (const definition of EXPANDED_ARTS_DEFINITIONS) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    const indices = [...definition.recipes.map(recipe => recipe.skillIndex), ...(definition.deferredSkills ?? []).map(skill => skill.skillIndex)]
    assert.deepEqual(indices.sort(), source.skills.map(skill => skill.skillIndex).sort())
    assert.equal(new Set(indices).size, indices.length)
    assert.equal(definition.talents.length, source.profile.talents?.length)
    const structures = buildExpandedTalentStructures([record(source.operatorId, 1)])
    for (const structure of structures) {
      assert.deepEqual(structure.issues, [], source.operatorName + structure.basicInfo.talentName)
      assert.ok(structure.effects.length)
    }
  }
})

test('対応45スキルの初期条件は有限のダメージを返し、保留22スキルは部分結果を出さない', () => {
  for (const definition of EXPANDED_ARTS_DEFINITIONS) {
    for (const recipe of definition.recipes) {
      const result = output(definition.operatorId, recipe.skillIndex)
      assert.deepEqual(result.unsupportedReasons, [], `${definition.operatorId} S${recipe.skillIndex}`)
      assert.ok(result.rows.length)
      const raw = sources.find(source => source.operatorId === definition.operatorId)!.skills.find(skill => skill.skillIndex === recipe.skillIndex)!.raw
      assert.equal(result.model!.duration, Math.max(0, raw.duration!))
      for (const row of result.rows) assert.ok([row.perAttack, row.allTargetsPerAttack, row.dps ?? 0].every(Number.isFinite))
    }
    for (const deferred of definition.deferredSkills ?? []) {
      const result = output(definition.operatorId, deferred.skillIndex)
      assert.ok(result.unsupportedReasons.some(reason => reason.includes(deferred.reason)))
      assert.deepEqual(result.rows, [])
    }
  }
})

test('星3は昇進1・Lv55・SL7で素質とスキルを適用する', () => {
  const { result: lava, row: lavaRow } = at('char_121_lava', 1, { actualAttackTargetCount: 3 }, 40)
  close(lavaRow.perAttack, lava.stats.attack * 0.6)
  close(lavaRow.dps, lavaRow.perAttack / (2.9 / 1.5))
  close(lavaRow.allTargetsPerAttack, lavaRow.perAttack * 3)
  const { result: steward, row: stewardRow } = at('char_210_stward', 1)
  close(stewardRow.perAttack, attack(steward.stats.attack, 0.06) * 1.9)
  assert.equal(stewardRow.dps, null)
  const { result: orchid, row: orchidRow } = at('char_278_orchid', 1)
  close(orchidRow.perAttack, attack(orchid.stats.attack, 0.25))
  close(orchidRow.dps, orchidRow.perAttack / (1.9 / 1.34))
})

test('ギターノの占いは一つの効果だけを適用し、三効果を合算しない', () => {
  const atk = at('char_109_fmout', 2, { fortuneResult: 'ATK' })
  const speed = at('char_109_fmout', 2, { fortuneResult: 'ASPD' })
  const hp = at('char_109_fmout', 2, { fortuneResult: 'HP' })
  close(atk.row.perAttack, attack(atk.result.stats.attack, 1.13))
  close(speed.row.perAttack, attack(speed.result.stats.attack, 1))
  close(speed.result.attackInterval, 2.9 / 1.13)
  close(hp.row.perAttack, speed.row.perAttack)
  close(hp.result.attackInterval, 2.9)
})

test('アーミヤS2は8発の総量を対象数で分配し、S3は術耐性で減衰しない', () => {
  const one = at('char_002_amiya', 2)
  const four = at('char_002_amiya', 2, { actualAttackTargetCount: 4 })
  close(one.row.perAttack, one.result.stats.attack * 0.6 * 8)
  close(four.row.perAttack, one.row.perAttack / 4)
  close(four.row.allTargetsPerAttack, one.row.perAttack)
  const trueDamage = output('char_002_amiya', 3)
  assert.deepEqual(trueDamage.unsupportedReasons, [])
  for (const row of trueDamage.rows) close(row.perAttack, attack(trueDamage.stats.attack, 2.3))
})

test('アブサントの40%未満の素質とS2の50%未満の対象制限を別々に守る', () => {
  const low = at('char_405_absin', 2, { targetHpPercent: 39 })
  const edge = at('char_405_absin', 2, { targetHpPercent: 40 })
  close(edge.row.perAttack, edge.result.stats.attack * 0.9 * 4)
  close(low.row.perAttack, edge.row.perAttack * 1.24)
  assert.ok(output('char_405_absin', 2, { targetHpPercent: 50 }).unsupportedReasons.length)
  assert.deepEqual(output('char_405_absin', 2, { targetHpPercent: 50 }).rows, [])
})

test('トミミのスキル中は攻撃力100%強化と物理変換を一度だけ適用する', () => {
  const { result, row } = at('char_411_tomimi', 1, {}, 1000)
  const a = attack(result.stats.attack, 1)
  assert.equal(result.damageType, 'PHYSICAL')
  close(row.perAttack, Math.max(a - 1000, a * 0.05))
  close(result.attackInterval, 1.6 / 1.9)
})

test('カニパラートとスカイフレアの対術脆弱は対象条件が成立する時だけ適用する', () => {
  for (const [id, condition, multiplier] of [
    ['char_466_qanik', 'targetAirborne', 1.2], ['char_166_skfire', 'targetBlocked', 1.15],
  ] as const) {
    const off = at(id, 1, { [condition]: false }, 40)
    const on = at(id, 1, { [condition]: true }, 40)
    close(on.row.perAttack, off.row.perAttack * multiplier)
  }
})

test('レオンハルトの敵数加算は5体で上限、リプレーザの範囲条件は3体から発動する', () => {
  const lion = at('char_373_lionhd', 1, { nearbyEnemyCount: 100 })
  close(lion.row.perAttack, attack(lion.result.stats.attack, 1.2))
  const two = at('char_4031_liesel', 1, { actualAttackTargetCount: 2 })
  const three = at('char_4031_liesel', 1, { actualAttackTargetCount: 3 })
  close(two.row.perAttack, two.result.stats.attack * 2.1)
  close(three.row.perAttack, two.row.perAttack * 1.2)
  close(three.row.allTargetsPerAttack, three.row.perAttack * 3)
})

test('シャマレS1は脆弱の増分30%を1.8倍にし、全倍率1.3を1.8倍にしない', () => {
  const high = at('char_254_vodfox', 1, { targetHpPercent: 40 })
  const low = at('char_254_vodfox', 1, { targetHpPercent: 39 })
  close(high.row.perAttack, attack(high.result.stats.attack, 0.6))
  close(low.row.perAttack, high.row.perAttack * 1.54)
})

test('エイヤS1は2回目から攻撃力を追加し、S3は6対象上限と短縮間隔を適用する', () => {
  const first = at('char_180_amgoat', 1, { skillActivationCount: 1 })
  const second = at('char_180_amgoat', 1, { skillActivationCount: 2 })
  close(first.row.perAttack, attack(first.result.stats.attack, 0.14))
  close(second.row.perAttack, attack(second.result.stats.attack, 0.74))
  const volcano = at('char_180_amgoat', 3, { actualAttackTargetCount: 6 })
  close(volcano.row.perAttack, attack(volcano.result.stats.attack, 1.44))
  close(volcano.row.allTargetsPerAttack, volcano.row.perAttack * 6)
  close(volcano.result.attackInterval, 0.5)
  assert.ok(output('char_180_amgoat', 3, { actualAttackTargetCount: 7 }).unsupportedReasons.length)
})

test('アンジェリーナS2は基礎間隔15%と攻撃力45%を使い、素質ASPD7を含める', () => {
  const { result, row } = at('char_291_aglina', 2)
  close(row.perAttack, result.stats.attack * 0.45)
  close(result.attackInterval, 1.9 * 0.15 / 1.07)
  close(row.dps, row.perAttack / (1.9 * 0.15 / 1.07))
})

test('スズランの脆弱を初回命中に無条件適用せず、命中前の足止め状態を指定する', () => {
  const first = at('char_358_lisa', 2, { targetAlreadySlowed: false })
  const slowed = at('char_358_lisa', 2, { targetAlreadySlowed: true })
  close(slowed.row.perAttack, first.row.perAttack * 1.2)
})

test('陣術師のスキル中は全対象へ攻撃し、カーネリアンS2のOC時だけ攻撃力を増す', () => {
  const beewax = at('char_344_beewax', 1, { actualAttackTargetCount: 4 })
  close(beewax.row.perAttack, attack(beewax.result.stats.attack, 0.6))
  close(beewax.row.allTargetsPerAttack, beewax.row.perAttack * 4)
  const mint = at('char_388_mint', 1)
  close(mint.row.perAttack, mint.result.stats.attack * 1.6)
  const normal = at('char_426_billro', 2, { overcharged: false })
  const charged = at('char_426_billro', 2, { overcharged: true })
  close(normal.row.perAttack, normal.result.stats.attack)
  close(charged.row.perAttack, attack(charged.result.stats.attack, 0.2))
  close(normal.result.attackInterval, 0.9)
  close(charged.result.attackInterval, normal.result.attackInterval!)
})

test('未確認のデータ変化や素質数値欠落ではsnapshot値を流用せず結果を止める', () => {
  const changedSkill = output('char_180_amgoat', 1, {}, skill => { skill.skillLevels[9].blackboard![0].value = 61 })
  assert.ok(changedSkill.unsupportedReasons.length)
  assert.deepEqual(changedSkill.rows, [])
  const missingTalent = output('char_405_absin', 1, {}, skill => {
    for (const candidate of skill.operatorProfile.talents![0].candidates!) candidate.blackboard = candidate.blackboard!.filter(entry => entry.key !== 'hp_ratio')
  })
  assert.ok(missingTalent.unsupportedReasons.some(reason => reason.includes('hp_ratio')))
  assert.deepEqual(missingTalent.rows, [])
})
