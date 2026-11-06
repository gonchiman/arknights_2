import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { getDamageCalculatorThreeStructures, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { buildGuardSkillApplicationRows } from '../src/lib/guardEffectApplication.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { calculateDamageThreePeriodTotal } from '../src/lib/damageCalculatorThreePeriodTotal.ts'
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

test('命中上限は軽減と与ダメージ倍率の後・確率平均の前に適用し、各対象に独立する', () => {
  for (const virtualMainAttackType of [undefined, 'ARTS'] as const) {
    const base = calculate('char_208_melan', { damageScale: 1.5 }, { virtualMainAttackType }).output
    for (const cap of [0, 100, 10000]) {
      const { output, display } = calculate('char_208_melan', { damageScale: 1.5,
        damageCapPerTarget: cap, maxTargets: null },
      { virtualMainAttackType, conditions: { guard: { actualAttackTargetCount: 3 } } })
      assert.deepEqual(output.unsupportedReasons, [])
      close(output.rows[0].perAttack, Math.min(base.rows[0].perAttack, cap))
      close(output.rows[0].allTargetsPerAttack, Math.min(base.rows[0].perAttack, cap) * 3)
      assert.equal(output.rows[0].dps, null)
      assert.equal(output.rows[0].combinedDps, null)
      assert.equal(output.attackInterval, null)
      assert.equal(output.canShowDps, false)
      assert.ok(display.some(row => row.item === '対象ごとのダメージ上限'))
    }
  }
  const probabilistic = calculate('char_208_melan', { damageCapPerTarget: 100,
    actions: [{ label: 'sample', role: 'MAIN', damageType: 'PHYSICAL', scale: 1, probability: .5 }] }).output
  assert.deepEqual(probabilistic.unsupportedReasons, [])
  close(probabilistic.rows[0].perAttack, 50)
  const franka = calculate('char_106_franka', { damageCapPerTarget: 300 },
    { enemy: { defense: 2000, resistance: 0 } }).output
  assert.deepEqual(franka.unsupportedReasons, [])
  const atk = franka.effectiveAttack!
  const expected = .8 * Math.min(Math.max(atk - 2000, atk * .05), 300) + .2 * Math.min(atk, 300)
  close(franka.rows[0].perAttack, expected)
  assert.notEqual(expected, Math.min(.8 * Math.max(atk - 2000, atk * .05) + .2 * atk, 300))
})

test('上限の不正値と命中後HPが未追跡の連撃・複数攻撃・継続ダメージは数値を返さない', () => {
  for (const cap of [-1, Number.NaN, Number.POSITIVE_INFINITY, { key: 'missing' }]) {
    const { output } = calculate('char_208_melan', { damageCapPerTarget: cap })
    assert.ok(output.unsupportedReasons.length)
    assert.deepEqual(output.rows, [])
  }
  const action = { label: 'attack', role: 'MAIN' as const, damageType: 'PHYSICAL' as const, scale: 1 }
  for (const actions of [[{ ...action, hits: 2 }], [{ ...action, timing: 'PER_SECOND' as const }],
    [{ ...action, isStoredCharge: true }], [action, { ...action, role: 'ADDITIONAL' as const }]]) {
    const { output } = calculate('char_208_melan', { damageCapPerTarget: 100, actions })
    assert.ok(output.unsupportedReasons.length)
    assert.deepEqual(output.rows, [])
  }
})

test('命中上限のある段階を定常DPSと誤宣言しても、期間総量へ掛け算しない', () => {
  const stage: GuardStage = { id: 'test', label: 'test', kind: 'NORMAL', actions: [],
    damageCapPerTarget: 100, duration: 30, periodTotal: { kind: 'CONSTANT_RATE' } }
  const result = calculateDamageThreePeriodTotal({ stage, attackKind: 'NORMAL',
    combinedDps: 100, allTargetsCombinedDps: 200 })
  assert.equal(result.durationSeconds, 30)
  assert.equal(result.totalDamage, null)
  assert.equal(result.allTargetsTotalDamage, null)
  assert.ok(result.totalDamageReason?.includes('HP'))
})

test('属性限定の与ダメージ倍率は軽減後だけに掛け、仮想主攻撃と追加攻撃を別に判定する', () => {
  const stage: Partial<GuardStage> = { actions: [
    { label: 'main', role: 'MAIN', damageType: 'ARTS', scale: 1, damageScaleWhenType: { damageType: 'ARTS', scale: 1.3 } },
    { label: 'extra', role: 'ADDITIONAL', damageType: 'ARTS', scale: .4, damageScaleWhenType: { damageType: 'ARTS', scale: 1.3 } },
  ] }
  for (const virtualMainAttackType of [undefined, 'PHYSICAL'] as const) {
    const { output, display } = calculate('char_208_melan', stage, { virtualMainAttackType })
    assert.deepEqual(output.unsupportedReasons, [])
    const atk = output.effectiveAttack!, expectedMain = virtualMainAttackType === 'PHYSICAL' ? atk - 300 : atk * .2 * 1.3
    close(output.rows[0].perAttack, expectedMain + atk * .4 * .2 * 1.3)
    assert.equal(display.find(row => row.item === 'main：術の与ダメージ倍率')?.status,
      virtualMainAttackType === 'PHYSICAL' ? 'NOT_RELEVANT' : 'APPLIED')
    assert.equal(display.find(row => row.item === 'extra：術の与ダメージ倍率')?.status, 'APPLIED')
  }
  for (const scale of [-1, Number.NaN, Number.POSITIVE_INFINITY, { key: 'missing' }]) {
    assert.ok(calculate('char_208_melan', { actions: [{ ...stage.actions![0], damageScaleWhenType: { damageType: 'ARTS', scale } }] })
      .output.unsupportedReasons.length)
  }
})

test('段階の与ダメージ倍率は防御軽減後に掛け、攻撃力倍率に置換しない', () => {
  const base = calculate('char_208_melan', {}).output
  const { output, display } = calculate('char_208_melan', { damageScale: 1.5 })
  assert.deepEqual(output.unsupportedReasons, [])
  close(output.rows[0].perAttack, base.rows[0].perAttack * 1.5)
  assert.notEqual(output.rows[0].perAttack, base.effectiveAttack! * 1.5 - 300)
  close(output.effectiveAttack, base.effectiveAttack!)
  assert.equal(display.find(row => row.item === '与ダメージ倍率')?.value, '×1.5')
})

test('固定周期は攻撃速度と独立し、周期未確認の攻撃は1回の値だけを返す', () => {
  for (const aspd of [0, 100, 300]) {
    const { output } = calculate('char_208_melan', { fixedAttackInterval: 1, aspd })
    assert.deepEqual(output.unsupportedReasons, [])
    close(output.attackInterval, 1)
    close(output.rows[0].dps, output.rows[0].perAttack)
  }
  const { output } = calculate('char_208_melan', { dpsUnsupportedReason: '帰還周期未確認' })
  assert.deepEqual(output.unsupportedReasons, [])
  assert.ok(output.rows[0].perAttack > 0)
  assert.equal(output.rows[0].dps, null)
  assert.equal(output.rows[0].combinedDps, null)
  assert.equal(output.canShowDps, false)
  assert.equal(output.attackInterval, null)
  assert.equal(output.dpsReason, '帰還周期未確認')
  for (const fixedAttackInterval of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid = calculate('char_208_melan', { fixedAttackInterval }).output
    assert.ok(invalid.unsupportedReasons.length)
    assert.deepEqual(invalid.rows, [])
  }
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

test('固定低下を割合低下より前に適用し、防御・術耐性の無視と区別する', () => {
  const stage = { defenseReductionFixed: 100, defenseReductionRatio: 0.5,
    defenseIgnoreRatio: 0.2, defenseIgnoreFixed: 10, resistanceReductionFixed: 20,
    resistanceReductionRatio: 0.3, resistanceIgnoreFixed: 5 }
  const native = calculate('char_208_melan', stage).output
  const arts = calculate('char_208_melan', stage, { virtualMainAttackType: 'ARTS' }).output
  assert.deepEqual(native.unsupportedReasons, [])
  assert.deepEqual(arts.unsupportedReasons, [])
  close(native.rows[0].perAttack, native.effectiveAttack! - ((300 - 100) * 0.5 * 0.8 - 10))
  close(arts.rows[0].perAttack, arts.effectiveAttack! * (1 - ((80 - 20) * 0.7 - 5) / 100))
  const ifrit = calculate('char_134_ifrit', { resistanceReductionFixed: 20, resistanceIgnoreFixed: 5 }).output
  close(ifrit.rows[0].perAttack, ifrit.effectiveAttack! * (1 - ((80 - 20) * 0.6 - 5) / 100))
  const zeroDefense = calculate('char_208_melan', { defenseReductionFixed: 1000 }).output
  close(zeroDefense.rows[0].perAttack, zeroDefense.effectiveAttack!)
  const zeroResistance = calculate('char_208_melan', { resistanceReductionFixed: 1000 }, { virtualMainAttackType: 'ARTS' }).output
  close(zeroResistance.rows[0].perAttack, zeroResistance.effectiveAttack!)
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

test('最終加算の攻撃力は割合強化を受けず、最終減算の防御力は割合低下の後・防御無視の前に適用する', () => {
  const stage: Partial<GuardStage> = { atk: 0.5, attackFinalFlat: 100,
    defenseReductionFixed: 100, defenseReductionRatio: 0.5, defenseReductionFinalFixed: 30,
    defenseIgnoreRatio: 0.2, defenseIgnoreFixed: 10,
    actions: [{ label: 'main', role: 'MAIN', damageType: 'PHYSICAL', scale: 1.2 },
      { label: 'periodic', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', scale: 0.2, timing: 'PER_SECOND' }] }
  for (const virtualMainAttackType of [undefined, 'PHYSICAL', 'ARTS'] as const) {
    const { output, display } = calculate('char_208_melan', stage, { virtualMainAttackType })
    assert.deepEqual(output.unsupportedReasons, [])
    const attack = Math.floor(output.stats.attack * (1 + 0.08 + 0.5) + 100 + 1e-9)
    const defense = ((300 - 100) * 0.5 - 30) * 0.8 - 10
    close(output.rows[0].perAttack, virtualMainAttackType === 'ARTS' ? attack * 1.2 * 0.2 : attack * 1.2 - defense)
    close(output.rows[0].damageOverTimeDps, attack * 0.2 * 0.2)
    assert.equal(display.find(row => row.item === '攻撃力（最終加算）')?.value, '＋100')
  }
  const zero = calculate('char_208_melan', { ...stage, defenseReductionFinalFixed: 500 }).output
  close(zero.rows[0].perAttack, Math.floor(zero.stats.attack * 1.58 + 100 + 1e-9) * 1.2)
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, { key: 'missing' }]) {
    const output = calculate('char_208_melan', { attackFinalFlat: invalid }).output
    assert.ok(output.unsupportedReasons.length)
    assert.deepEqual(output.rows, [])
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
  for (const field of ['defenseReductionRatio', 'resistanceReductionRatio', 'defenseReductionFixed', 'defenseReductionFinalFixed', 'resistanceReductionFixed', 'damageScale'] as const) {
    for (const value of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, { key: 'missing' },
      ...(field.endsWith('Ratio') ? [1.01] : [])]) {
      const { output } = calculate('char_208_melan', { [field]: value })
      assert.ok(output.unsupportedReasons.length, `${field}: ${String(value)}`)
      assert.deepEqual(output.rows, [])
      assert.equal(output.model, null)
    }
  }
})
