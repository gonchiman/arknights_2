import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import { getDamageCalculatorThreeStructures, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { TalentStructureEffect } from '../src/lib/talentStructure.ts'
import type { SkillRecord } from '../src/types/skill.ts'

function calculate(stage: Partial<GuardStage>, options: Partial<DamageCalculatorThreeInput> = {}) {
  const source = EXPANDED_OPERATOR_SOURCES.find(entry => entry.operatorId === 'char_208_melan')!
  const entry = source.skills[0], raw = structuredClone(entry.raw), id = source.operatorId
  const skill: SkillRecord = { id, operatorId: id, operatorName: source.operatorName, profession: source.profession,
    professionLabel: source.profession, rarity: source.rarity, subProfessionId: source.subProfessionId,
    subProfessionName: source.subProfessionId, nameInitial: 'OTHER', skillId: entry.skillId,
    skillIndex: entry.skillIndex, skillName: raw.name!, raw, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), operatorProfile: structuredClone(source.profile),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)) }
  const original = getDamageCalculatorThreeStructures().find(entry => entry.basicInfo.operatorId === id && entry.basicInfo.skillIndex === 1)!
  return buildGuardDamageOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
    enemy: { defense: 100, resistance: 40 }, ...options }, { ...original, guardRecipe: { ...original.guardRecipe!, stages: [
      { id: 'test', label: 'test', kind: 'NORMAL', actions: [{ label: 'main', role: 'MAIN', damageType: 'ARTS', scale: 1 }], ...stage },
    ] } })
}
function withAddition(value: number, run: () => void, options: { weakpoint?: boolean; critical?: boolean } = {}) {
  const talent = EXPANDED_MELEE_DEFINITIONS.find(definition => definition.operatorId === 'char_208_melan')!.talents[0]
  const mutable = talent as { effects: typeof talent.effects }, original = mutable.effects
  mutable.effects = binding => {
    const effects = original(binding), template = effects[0]
    return [...effects,
      { ...template, id: 'test-addition', sourceBinding: 'test', item: 'ARTS_DAMAGE_FLAT_ADDITION', operation: 'ADD_VALUE', unit: 'POINT', value },
      ...(options.weakpoint ? [{ ...template, id: 'test-weakpoint', sourceBinding: 'test', item: 'WEAKPOINT_DAMAGE', operation: 'SET_ENABLED', unit: 'BOOLEAN', value: true }] : []),
      ...(options.critical ? [{ ...template, id: 'test-critical', sourceBinding: 'test', item: 'CRITICAL_ATTACK', operation: 'MULTIPLY', unit: 'MULTIPLIER', value: 2,
        probability: { chance: .5, rollScope: 'APPLICATION' }, timing: { type: 'EVENT', event: 'ATTACK' }, lifetime: { type: 'CURRENT_EVENT' } }] : []),
    ] as TalentStructureEffect[]
  }
  try { run() } finally { mutable.effects = original }
}
function close(value: number | null | undefined, expected: number) {
  assert.ok(value !== null && value !== undefined && Math.abs(value - expected) < 1e-7, `${value} != ${expected}`)
}

test('術固定加算は攻撃倍率と会心の後、軽減前に各命中へ1回加える', () => {
  withAddition(150, () => {
    const result = calculate({ actions: [{ label: 'main', role: 'MAIN', damageType: 'ARTS', scale: 3, hits: 2 }] })
    assert.deepEqual(result.unsupportedReasons, [])
    const base = Math.floor(result.stats.attack * 1.08 + 1e-9)
    close(result.rows[0].perAttack, ((base * 3 + 150) * .5 + (base * 3 * 2 + 150) * .5) * .6 * 2)
  }, { critical: true })
})

test('仮想主攻撃が物理でも追加術だけに加算し、確定ダメージには加算しない', () => {
  withAddition(150, () => {
    const result = calculate({ actions: [
      { label: 'main', role: 'MAIN', damageType: 'ARTS', scale: 2 },
      { label: 'arts', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', scale: .6 },
      { label: 'true', role: 'ADDITIONAL', damageType: 'TRUE', scale: 1 },
    ] }, { virtualMainAttackType: 'PHYSICAL' })
    assert.deepEqual(result.unsupportedReasons, [])
    const base = Math.floor(result.stats.attack * 1.08 + 1e-9)
    const parts = result.rows[0].attackComponents!
    close(parts[0].expectedDamage, base * 2 - 100)
    close(parts[1].expectedDamage, (base * .6 + 150) * .6)
    close(parts[2].expectedDamage, base)
  })
})

test('弱点判定は術固定加算を含めて選択し、実ダメージへは一度だけ加算する', () => {
  withAddition(10000, () => {
    const physical = calculate({}, { enemy: { defense: 0, resistance: 100 } })
    assert.deepEqual(physical.unsupportedReasons, [])
    const base = Math.floor(physical.stats.attack * 1.08 + 1e-9)
    assert.equal(physical.rows[0].attackComponents![0].damageType, 'PHYSICAL')
    close(physical.rows[0].perAttack, base)
    // With DEF=0, the unchanged attack alone would select physical damage.
    const arts = calculate({}, { enemy: { defense: 0, resistance: 40 } })
    assert.deepEqual(arts.unsupportedReasons, [])
    assert.equal(arts.rows[0].attackComponents![0].damageType, 'ARTS')
    close(arts.rows[0].perAttack, (base + 10000) * .6)
  }, { weakpoint: true })
})

test('固定値のみの術と確率分岐にも加算し、軽減後倍率と非致死上限より前に評価する', () => {
  withAddition(150, () => {
    const result = calculate({ damageScale: 2, damageCapPerTarget: 250,
      actions: [{ label: 'fixed', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', scale: 0, flatDamage: 100, probability: .4 }] })
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.rows[0].perAttack, 250 * .4)
    assert.equal(result.rows[0].dps, null)
  })
})

test('負数や不正な固定加算と未確認のDOT tick数を拒否し、ゼロ加算は既存毎秒値を維持する', () => {
  for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) withAddition(amount, () => {
    const result = calculate({})
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  })
  const dot: Partial<GuardStage> = { actions: [{ label: 'dot', role: 'MAIN', damageType: 'ARTS', basis: 'ATK_STAT', timing: 'PER_SECOND', scale: 0, flatDamage: 90 }] }
  withAddition(150, () => {
    const result = calculate(dot)
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('命中回数')))
    assert.deepEqual(result.rows, [])
  })
  withAddition(0, () => {
    const result = calculate(dot)
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.rows[0].combinedDps, 90 * .6)
  })
})
