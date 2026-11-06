import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import type { TalentStructureEffect } from '../src/lib/talentStructure.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const originals = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')).guards
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8'))
function input(index = 1, options: Partial<DamageCalculatorThreeInput> = {}, id = 'char_1050_chen3'): DamageCalculatorThreeInput {
  const retained = EXPANDED_OPERATOR_SOURCES.find(source => source.operatorId === id)
  const source = retained ?? originals.find((source: { id: string }) => source.id === id)
  const entry = source.skills.find((skill: { skillIndex: number }) => skill.skillIndex === index), raw = structuredClone(entry.raw)
  const skill: SkillRecord = { id, operatorId: id, operatorName: source.operatorName ?? source.name,
    skillId: entry.skillId, skillIndex: index, skillName: raw.name, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description, duration: raw.duration, durationType: raw.durationType, skillType: raw.skillType,
    spType: raw.spData.spType, spCost: raw.spData.spCost, initSp: raw.spData.initSp,
    classification: classifySkill(raw), raw, skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)),
    operatorProfile: structuredClone(retained?.profile ?? profiles.find((p: { operatorId: string }) => p.operatorId === id).operatorProfile) }
  return { operator: skill, skill, phaseIndex: 2, operatorLevel: retained?.profile.phases[2].maxLevel ?? 90,
    trust: 100, skillLevelIndex: 9, enemy: { defense: 1000, resistance: 50 }, ...options }
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
function synthetic(stage: GuardStage, options: Partial<DamageCalculatorThreeInput> = {}, id?: string) {
  const data = input(1, options, id)
  const original = getDamageCalculatorThreeStructures().find(s => s.basicInfo.operatorId === data.skill.operatorId && s.basicInfo.skillIndex === 1)!
  return buildGuardDamageOutput(data, { ...original, guardRecipe: { ...original.guardRecipe!, stages: [stage] } })
}

test('チェン3の各攻撃を1命中ずつ弱点判定し、スキル倍率と素質13%を一度ずつ適用する', () => {
  for (const [index, phase, ratio, scale, hits] of [[1, 'active', 1.2, 1, 2], [2, 'slashes', 0, 4.8, 10],
    [2, 'normal', 3, 1, 1], [3, 'normal', 0, 2.1, 3]] as const) {
    for (const defense of [0, 1000, 10000]) for (const resistance of [0, 50, 100]) {
      const output = buildDamageCalculatorThreeOutput(input(index, { enemy: { defense, resistance }, conditions: { guard: { phase } } }))
      assert.deepEqual(output.unsupportedReasons, [])
      const attack = Math.floor(output.stats.attack * (1 + .13 + ratio) + 1e-9) * scale
      const physical = Math.max(attack - defense, attack * .05), arts = Math.max(attack * (1 - resistance / 100), attack * .05)
      close(output.rows[0].perAttack, Math.max(physical, arts) * hits)
      assert.equal(output.rows[0].attackComponents[0].damageType, physical > arts ? 'PHYSICAL' : 'ARTS')
      assert.equal(output.axisLabel, '敵の防御力')
      assert.ok(output.guard!.evaluations.some(effect => effect.item === '弱点ダメージ' && effect.status === 'APPLIED'))
    }
  }
})

test('弱点の既知敵入力とDEF軸・RES入力は一致し、固定弱点と仮想主属性を区別する', () => {
  const data = input(), direct = buildDamageCalculatorThreeOutput(data)
  const axis = buildDamageCalculatorThreeOutput(input(1, { enemy: undefined, conditions: { guard: { enemyResistance: 50 } } }))
  close(axis.rows.find(row => row.axisValue === 1000)!.perAttack, direct.rows[0].perAttack)
  for (const fixedWeakpoint of ['NONE', 'PHYSICAL', 'ARTS'] as const) {
    const native = buildDamageCalculatorThreeOutput(input(1, { conditions: { guard: { fixedWeakpoint } } }))
    const virtual = buildDamageCalculatorThreeOutput(input(1, { conditions: { guard: { fixedWeakpoint } }, virtualMainAttackType: 'PHYSICAL' }))
    assert.deepEqual(native.unsupportedReasons, [])
    close(native.rows[0].perAttack, virtual.rows[0].perAttack)
    if (fixedWeakpoint !== 'NONE') assert.equal(native.rows[0].attackComponents[0].damageType, fixedWeakpoint)
  }
  const invalid = buildDamageCalculatorThreeOutput(input(1, { conditions: { guard: { fixedWeakpoint: 'TRUE' } } }))
  assert.ok(invalid.unsupportedReasons.length)
})

test('弱点の属性選択へ与ダメージ倍率を先取りせず、選択後に該当属性の倍率だけを掛ける', () => {
  const stage: GuardStage = { id: 'test', label: 'test', kind: 'NORMAL', actions: [
    { label: 'main', role: 'MAIN', damageType: 'ARTS', scale: 1, damageScaleWhenType: { damageType: 'ARTS', scale: 100 } },
  ] }
  const physical = synthetic(stage, { enemy: { defense: 0, resistance: 50 } })
  assert.deepEqual(physical.unsupportedReasons, [])
  close(physical.rows[0].perAttack, physical.effectiveAttack!)
  assert.equal(physical.rows[0].attackComponents[0].damageType, 'PHYSICAL')
  const arts = synthetic(stage, { enemy: { defense: 10000, resistance: 50 } })
  close(arts.rows[0].perAttack, arts.effectiveAttack! * .5 * 100)
})

test('事前計算の剣気は未確認の弱点式へ流さず、S3通常攻撃だけを計算する', () => {
  const wave = buildDamageCalculatorThreeOutput(input(3, { conditions: { guard: { phase: 'wave' } } }))
  assert.deepEqual(wave.rows, [])
  assert.ok(wave.unsupportedReasons.some(reason => reason.includes('事前計算')))
  assert.ok(buildDamageCalculatorThreeOutput(input(3)).rows.length)
})

test('防御無視の確率枝で弱点属性が異なる場合も、属性別期待値と命中数を二重計上しない', () => {
  const talent = EXPANDED_MELEE_DEFINITIONS.find(definition => definition.operatorId === 'char_106_franka')!.talents[0]
  const mutable = talent as { effects: typeof talent.effects }, original = mutable.effects
  mutable.effects = b => {
    const effects = original(b), sample = effects.find(effect => effect.item === 'DEFENSE_IGNORE_RATIO')!
    return [...effects, { ...sample, item: 'WEAKPOINT_DAMAGE', operation: 'SET_ENABLED', value: true, unit: 'BOOLEAN',
      probability: { chance: 1, rollScope: 'APPLICATION' } } as TalentStructureEffect]
  }
  try {
    const output = synthetic({ id: 'test', label: 'test', kind: 'NORMAL',
      actions: [{ label: 'attack', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }] },
    { enemy: { defense: 10000, resistance: 50 } }, 'char_106_franka')
    assert.deepEqual(output.unsupportedReasons, [])
    const attack = output.effectiveAttack!, components = output.rows[0].attackComponents
    assert.deepEqual(components.map(component => component.damageType).sort(), ['ARTS', 'PHYSICAL'])
    close(output.rows[0].perAttack, attack * .5 * .8 + attack * .2)
    close(components.reduce((sum, component) => sum + component.expectedHitCount, 0), 1)
    close(components.find(component => component.damageType === 'ARTS')!.expectedDamage, attack * .5 * .8)
  } finally { mutable.effects = original }
})
