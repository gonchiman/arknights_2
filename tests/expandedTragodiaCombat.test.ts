import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SkillRecord } from '../src/types/skill.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
const sources = JSON.parse(readFileSync(new URL('../src/data/expandedElementalSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function input(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}): DamageCalculatorThreeInput {
  const source = sources.find(source => source.operatorId === id)!, skill = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  const record: SkillRecord = { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(source.profile) }
  return { operator: record, skill: record, phaseIndex: source.phaseIndex, operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!,
    trust: 100, skillLevelIndex: source.skillLevelIndex, conditions: { guard }, enemy: { defense: 500, resistance: 60 }, ...options }
}
function output(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput(input(id, index, guard, options))
}
function one(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  const result = output(id, index, guard, options)
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}
const close = (actual: number | null | undefined, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
const total = (row: ReturnType<typeof one>['row']) => (row.elementalBuildups ?? []).reduce((sum, item) => sum + item.perApplication, 0)
const arts = (a: number, r = 60) => a * Math.max(0.05, 1 - r / 100)
const physical = (a: number, d = 500) => Math.max(a * 0.05, a - d)

const id = 'char_1042_phatm2'
test('トラゴーディアS1はHP1命中・主対象の損傷1発動・周囲の損傷1発動を独立に評価する', () => {
  const main = one(id, 1)
  close(main.row.perAttack, arts(530 * 1.5))
  close(total(main.row), 0)
  const primary = one(id, 1, { tragodiaEvent: 'PRIMARY_BUILDUP' })
  close(primary.row.perAttack, 0)
  close(total(primary.row), 530 * 0.3 * 1.8)
  for (const bound of [false, true]) {
    const splash = one(id, 1, { tragodiaEvent: 'SPLASH', tragodiaS1Bound: bound, actualAttackTargetCount: 3 })
    close(splash.row.perAttack, 0)
    close(total(splash.row), 530 * 0.2 * (bound ? 1.8 : 1))
    close(splash.row.elementalBuildups![0].allTargetsPerApplication, total(splash.row) * 3)
  }
  assert.deepEqual(output(id, 1, { tragodiaEvent: 'PRIMARY_BUILDUP', tragodiaS1Bound: false }).rows, [])
  // Binding application order and talent activation counts are not inferred
  // from the independently selected HP hit, including a newly bound target.
  close(one(id, 1, { tragodiaS1Bound: false }).row.perAttack, arts(530 * 1.5))
})

test('トラゴーディアS2は本人の通常攻撃と召喚退場後の0.5秒周期を混ぜない', () => {
  const main = one(id, 2)
  close(main.row.perAttack, arts(530))
  close(total(main.row), 530 * 0.3)
  const pulse = one(id, 2, { tragodiaEvent: 'TOKEN_TICK', actualAttackTargetCount: 4 })
  close(pulse.row.perAttack, arts(530 * 1.5))
  close(pulse.row.allTargetsPerAttack, arts(530 * 1.5) * 4)
  close(total(pulse.row), 530 * 0.25)
  assert.equal(pulse.row.attackComponents?.length, 1)
  const virtual = one(id, 2, { tragodiaEvent: 'TOKEN_TICK' }, { virtualMainAttackType: 'PHYSICAL' })
  close(virtual.row.perAttack, physical(530 * 1.5))
  close(total(virtual.row), 530 * 0.25)
  assert.deepEqual(output(id, 2, { tragodiaEvent: 'TOKEN_TICK', elementalBuildupResistance: 10 }).rows, [])
  assert.deepEqual(output(id, 2, { tragodiaEvent: 'TOKEN_TICK', tragodiaSnapshotUnchanged: false }).rows, [])
})

test('トラゴーディアS3はATK125%上昇を本人と元素各周期へ1回適用する', () => {
  const attack = Math.floor(530 * 2.25)
  for (const [event, scale] of [['ATTACK',0.3], ['SPLASH',0.2], ['SKILL_TICK',0.1]] as const) {
    const { result, row } = one(id, 3, { tragodiaEvent: event })
    close(row.perAttack, event === 'ATTACK' ? arts(attack) : 0)
    close(total(row), attack * scale)
    assert.equal(row.dps, null)
    assert.equal(row.combinedDps, null)
    assert.equal(result.attackInterval, null)
    assert.equal(result.canShowDps, false)
  }
})

test('トラゴーディアの独立した素質損傷は爆発境界で停止し、HP命中は指定した爆発状態を使う', () => {
  const amount = 530 * 0.3 * 1.8
  const safe = one(id, 1, { tragodiaEvent: 'PRIMARY_BUILDUP', elementalGaugeRemaining: amount + 0.1 })
  close(safe.row.elementalBuildups![0].remainingGaugeAfter, 0.1)
  assert.deepEqual(output(id, 1, { tragodiaEvent: 'PRIMARY_BUILDUP', elementalGaugeRemaining: amount }).rows, [])
  for (const guard of [{ targetElementalImmune: true }, { elementalBuildupResistance: 100 }, { targetElementalBurst: 'NEURAL' }]) {
    const result = one(id, 1, { tragodiaEvent: 'PRIMARY_BUILDUP', ...guard })
    close(total(result.row), 0)
    close(result.row.perAttack, 0)
  }
  const virtual = one(id, 1, {}, { virtualMainAttackType: 'PHYSICAL' })
  close(virtual.row.perAttack, physical(530 * 1.5))
  close(total(virtual.row), 0)
  for (const [burst, resistance] of [['NONE', 60], ['NEURAL', 60], ['BURN', 40]] as const) {
    const hit = one(id, 1, { targetElementalBurst: burst, elementalGaugeRemaining: 1 })
    close(hit.row.perAttack, arts(530 * 1.5, resistance))
    close(total(hit.row), 0)
    assert.equal(hit.row.dps, null)
  }
  // S2's pulse is a combined, confirmed event; its threshold still rejects
  // both the HP and buildup results rather than returning partial damage.
  assert.deepEqual(output(id, 2, { tragodiaEvent: 'TOKEN_TICK', elementalGaugeRemaining: 530 * 0.25 }).rows, [])
})

test('敵攻撃への反応は攻撃力に依存しない固定損傷で、未確認の原文・素質変更は拒否する', () => {
  for (const index of [1,2,3]) {
    const response = output(id, index, { tragodiaEvent: 'ENEMY_ATTACK' })
    assert.deepEqual(response.unsupportedReasons, [])
    close(total(response.rows[0]), index === 1 ? 70 * 1.8 : 70)
    assert.equal(response.rows[0].elementalBuildups![0].basis, 'FIXED')
    close(response.rows[0].perAttack, 0)
    const changed = input(id, index)
    changed.skill.skillLevels[9].description += ' 未確認効果'
    assert.deepEqual(buildDamageCalculatorThreeOutput(changed).rows, [])
    const talent = input(id, index)
    for (const candidate of talent.skill.operatorProfile!.talents![0].candidates!) {
      const entry = candidate.blackboard?.find(item => item.key === 'attack@ep_damage_ratio')
      if (entry) entry.value = 0.9
    }
    assert.deepEqual(buildDamageCalculatorThreeOutput(talent).rows, [])
  }
})
