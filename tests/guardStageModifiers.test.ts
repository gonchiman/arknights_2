import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { getDamageCalculatorThreeStructures, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { buildGuardSkillApplicationRows } from '../src/lib/guardEffectApplication.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

// Exercise shared arithmetic with synthetic modifiers on retained, independently
// reviewed source records. These recipes are test-only and do not alter the registry.
function calculate(id: string, stage: Partial<GuardStage>, options: Partial<DamageCalculatorThreeInput> = {}) {
  const source = EXPANDED_OPERATOR_SOURCES.find(entry => entry.operatorId === id)!
  const skillSource = source.skills[0], raw = structuredClone(skillSource.raw)
  const skill: SkillRecord = { id, operatorId: id, operatorName: source.operatorName, profession: source.profession,
    professionLabel: source.profession, rarity: source.rarity, subProfessionId: source.subProfessionId,
    subProfessionName: source.subProfessionId, nameInitial: 'OTHER', skillId: skillSource.skillId,
    skillIndex: skillSource.skillIndex, skillName: raw.name!, raw, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), operatorProfile: structuredClone(source.profile),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)) }
  const original = structuredClone(getDamageCalculatorThreeStructures().find(entry => entry.basicInfo.operatorId === id
    && entry.basicInfo.skillIndex === skill.skillIndex)!)
  const structure = { ...original, guardRecipe: { ...original.guardRecipe!, stages: [{ id: 'test', label: 'test', kind: 'NORMAL',
    actions: [{ label: 'attack', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }], ...stage } as GuardStage] } }
  const input: DamageCalculatorThreeInput = { operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
    enemy: { defense: 300, resistance: 80 }, ...options }
  const output = buildGuardDamageOutput(input, structure)
  return { output, display: buildGuardSkillApplicationRows(input, output) }
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('段階の与ダメージ倍率は防御軽減後に掛け、攻撃力倍率に置換しない', () => {
  const base = calculate('char_208_melan', {}).output
  const { output, display } = calculate('char_208_melan', { damageScale: 1.5 })
  assert.deepEqual(output.unsupportedReasons, [])
  close(output.rows[0].perAttack, base.rows[0].perAttack * 1.5)
  assert.notEqual(output.rows[0].perAttack, base.effectiveAttack! * 1.5 - 300)
  close(output.effectiveAttack, base.effectiveAttack!)
  assert.equal(display.find(row => row.item === '与ダメージ倍率')?.value, '×1.5')
})

test('防御低下は防御無視の前に適用し、術属性へ変更しても術耐性低下と取り違えない', () => {
  const stage = { defenseReductionRatio: 0.5, defenseIgnoreRatio: 0.2, defenseIgnoreFixed: 10,
    resistanceReductionRatio: 0.3, resistanceIgnoreFixed: 5 }
  const { output, display } = calculate('char_208_melan', stage)
  assert.deepEqual(output.unsupportedReasons, [])
  close(output.rows[0].perAttack, Math.max(output.effectiveAttack! - (300 * 0.5 * 0.8 - 10), output.effectiveAttack! * 0.05))
  const virtual = calculate('char_208_melan', stage, { virtualMainAttackType: 'ARTS' }).output
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, virtual.effectiveAttack! * (1 - (80 * 0.7 - 5) / 100))
  assert.equal(display.find(row => row.item === '防御力低下')?.value, '−50%')
  assert.equal(display.find(row => row.item === '術耐性低下')?.status, 'NOT_RELEVANT')
})

test('イフリータ素質の術耐性40%低下と段階の30%低下は残存率で合成する', () => {
  const { output } = calculate('char_134_ifrit', { resistanceReductionRatio: 0.3, resistanceIgnoreFixed: 20 })
  assert.deepEqual(output.unsupportedReasons, [])
  close(output.rows[0].perAttack, output.effectiveAttack! * (1 - (80 * 0.6 * 0.7 - 20) / 100))
})

test('仮想属性と混在しても段階の低下・与ダメージ倍率を主攻撃と追加・継続ダメージに一度ずつ適用する', () => {
  const stage: Partial<GuardStage> = {
    atk: 0.45, defenseReductionRatio: 0.5, defenseIgnoreRatio: 0.2, defenseIgnoreFixed: 10,
    resistanceReductionRatio: 0.3, resistanceIgnoreFixed: 5, damageScale: 1.5,
    actions: [
      { label: 'main', role: 'MAIN', damageType: 'ARTS', scale: 1 },
      { label: 'extra', role: 'ADDITIONAL', damageType: 'ARTS', scale: 0.4 },
      { label: 'dot', role: 'ADDITIONAL', damageType: 'ARTS', scale: 0.2, basis: 'ATK_STAT', timing: 'PER_SECOND' },
    ],
  }
  const options = { conditions: { guard: { reedScarActive: true } } }
  const native = calculate('char_1020_reed2', stage, options).output
  assert.deepEqual(native.unsupportedReasons, [])
  const attack = Math.floor(native.stats.attack * 1.45 + 1e-9)
  const artsRetention = 1 - (80 * 0.7 - 5) / 100
  const arts = (scale: number) => attack * scale * artsRetention * 1.3 * 1.5
  const physical = Math.max(attack - (300 * 0.5 * 0.8 - 10), attack * 0.05) * 1.5
  for (const virtualMainAttackType of [undefined, 'ARTS', 'PHYSICAL'] as const) {
    const result = calculate('char_1020_reed2', stage, { ...options, virtualMainAttackType }).output
    assert.deepEqual(result.unsupportedReasons, [])
    const row = result.rows[0], components = row.attackComponents!
    assert.deepEqual(components.map(component => component.damageType), [virtualMainAttackType ?? 'ARTS', 'ARTS'])
    close(components[0].expectedDamage, virtualMainAttackType === 'PHYSICAL' ? physical : arts(1))
    close(components[1].expectedDamage, arts(0.4))
    close(row.damageOverTimeDps, arts(0.2))
    close(row.perAttack, components[0].expectedDamage + arts(0.4))
    close(row.combinedDps, row.perAttack / result.attackInterval! + arts(0.2))
    assert.deepEqual(components[1], native.rows[0].attackComponents![1])
    if (virtualMainAttackType !== 'PHYSICAL') assert.deepEqual(row, native.rows[0])
  }
})

test('素質由来のATK_STAT流血にも段階の術耐性低下・倍率を適用し、仮想主攻撃の特性倍率を混ぜない', () => {
  const stage: Partial<GuardStage> = {
    atk: 0.45, defenseReductionRatio: 0.5, resistanceReductionRatio: 0.3,
    resistanceIgnoreFixed: 5, damageScale: 1.5,
  }
  for (const virtualMainAttackType of [undefined, 'PHYSICAL', 'ARTS'] as const) {
    const { output } = calculate('char_346_aosta', stage, { virtualMainAttackType,
      conditions: { guard: { targetInFrontalTiles: true, bleedingActive: true } } })
    assert.deepEqual(output.unsupportedReasons, [])
    const attack = Math.floor(output.stats.attack * 1.45 + 1e-9)
    const artsRetention = 1 - (80 * 0.7 - 5) / 100
    close(output.rows[0].damageOverTimeDps, attack * 0.18 * artsRetention * 1.5)
    const main = virtualMainAttackType === 'ARTS' ? attack * 1.5 * artsRetention
      : Math.max(attack * 1.5 - 300 * 0.5, attack * 1.5 * 0.05)
    close(output.rows[0].perAttack, main * 1.5)
  }
})

test('ATK_STAT継続ダメージは通常攻撃用の倍率や会心を継承しない', () => {
  for (const [id, guard] of [['char_271_spikes', { targetDrone: true }], ['char_283_midn', {}]] as const) {
    for (const virtualMainAttackType of [undefined, 'ARTS'] as const) {
      const { output } = calculate(id, { attackTreatment: 'RANGED', actions: [
        { label: 'attack', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 },
        { label: 'dot', role: 'ADDITIONAL', damageType: 'ARTS', scale: 0.2, basis: 'ATK_STAT', timing: 'PER_SECOND' },
      ] }, { conditions: { guard }, virtualMainAttackType })
      assert.deepEqual(output.unsupportedReasons, [])
      close(output.rows[0].damageOverTimeDps, output.stats.attack * 0.2 * 0.2)
    }
  }
})

test('新しい段階倍率の欠落参照・非有限値・範囲外を拒否して部分数値を返さない', () => {
  for (const field of ['defenseReductionRatio', 'resistanceReductionRatio', 'damageScale'] as const) {
    for (const value of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, { key: 'missing' },
      ...(field === 'damageScale' ? [] : [1.01])]) {
      const { output } = calculate('char_208_melan', { [field]: value })
      assert.ok(output.unsupportedReasons.length, `${field}: ${String(value)}`)
      assert.deepEqual(output.rows, [])
      assert.equal(output.model, null)
    }
  }
})
