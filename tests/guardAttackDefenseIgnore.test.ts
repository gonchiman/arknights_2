import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { getDamageCalculatorThreeStructures } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const guards = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')).guards as {
  id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[]
}[]
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function calculate(id: string, chance?: number, virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const expanded = EXPANDED_OPERATOR_SOURCES.find(source => source.operatorId === id)
  const old = guards.find(source => source.id === id)
  const profile = structuredClone(expanded?.profile ?? profiles.find(source => source.operatorId === id)!.operatorProfile)
  const entry = (expanded?.skills ?? old!.skills)[0], raw = structuredClone(entry.raw)
  if (chance !== undefined) for (const talent of profile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    const probability = candidate.blackboard?.find(entry => entry.key === 'prob')
    if (probability) probability.value = chance
  }
  const skill: SkillRecord = { id, operatorId: id, operatorName: expanded?.operatorName ?? old!.name,
    profession: expanded?.profession ?? 'WARRIOR', professionLabel: '前衛', rarity: expanded?.rarity ?? 6,
    subProfessionId: expanded?.subProfessionId ?? old!.subProfessionId, subProfessionName: 'test', nameInitial: 'OTHER',
    skillId: entry.skillId, skillIndex: entry.skillIndex, skillName: raw.name!, raw, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!, spType: raw.spData!.spType!,
    spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw), operatorProfile: profile,
    skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)) }
  const original = getDamageCalculatorThreeStructures().find(structure => structure.basicInfo.operatorId === id
    && structure.basicInfo.skillIndex === entry.skillIndex)!
  // Test-only added components exercise the scope of the retained live talent.
  const stage: GuardStage = { ...original.guardRecipe!.stages[0], actions: [
    { label: 'main', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 },
    { label: 'extra attack', role: 'ADDITIONAL', damageType: 'PHYSICAL', scale: .4 },
    { label: 'stat DOT', role: 'ADDITIONAL', damageType: 'PHYSICAL', basis: 'ATK_STAT', timing: 'PER_SECOND', scale: .2 },
  ] }
  return buildGuardDamageOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: profile.phases[2].maxLevel!,
    trust: 100, skillLevelIndex: 9, enemy: { defense: 1000, resistance: 40 }, virtualMainAttackType },
  { ...original, guardRecipe: { ...original.guardRecipe!, stages: [stage] } })
}
const physical = (attack: number, defense = 1000) => Math.max(attack - defense, attack * .05)
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-7, String(actual) + ' != ' + expected)
}

test('フランカの20/50/100%防御無視は攻撃だけに適用し、物理ATK_STAT DOTへ波及しない', () => {
  for (const chance of [.2, .5, 1]) for (const type of [undefined, 'PHYSICAL', 'ARTS'] as const) {
    const result = calculate('char_106_franka', chance, type)
    assert.deepEqual(result.unsupportedReasons, [])
    const row = result.rows[0], attack = result.effectiveAttack!
    const expected = (scale: number) => physical(attack * scale) * (1 - chance) + attack * scale * chance
    const main = type === 'ARTS' ? attack * .6 : expected(1)
    close(row.perAttack, main + expected(.4))
    close(row.damageOverTimeDps, physical(attack * .2))
    close(row.attackComponents[0].expectedDamage, main)
    close(row.attackComponents[0].defenseIgnoreChance, chance)
    close(row.attackComponents[0].defenseIgnoreRatio, 1)
    close(row.attackComponents[1].expectedDamage, expected(.4))
    assert.equal(row.attackComponents[1].damageType, 'PHYSICAL')
    assert.equal(result.hasProbabilisticDamage, chance < 1)
    const displayed = result.guard!.evaluations.find(entry => entry.item === '防御力無視')!
    assert.equal(displayed.status, 'APPLIED')
    assert.equal(displayed.timing, '攻撃時')
    assert.equal(displayed.probability, chance === 1 ? undefined : chance)
  }
})

test('耀騎士ニアールの確定20%無視は通常攻撃の値を維持し、DOTと仮想術のRESへ混入しない', () => {
  for (const type of [undefined, 'PHYSICAL', 'ARTS'] as const) {
    const result = calculate('char_1014_nearl2', undefined, type)
    assert.deepEqual(result.unsupportedReasons, [])
    const attack = result.effectiveAttack!, row = result.rows[0]
    close(row.perAttack, (type === 'ARTS' ? attack * .6 : physical(attack, 800)) + physical(attack * .4, 800))
    close(row.damageOverTimeDps, physical(attack * .2))
    close(row.attackComponents[0].defenseIgnoreChance, 1)
    close(row.attackComponents[0].defenseIgnoreRatio, .2)
    assert.equal(result.hasProbabilisticDamage, false)
  }
})
