import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reviewedTraitProfile } from './legacyTraitFixture.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeInput, type DamageCalculatorThreeConditions } from '../src/lib/damageCalculatorThree.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const sources = json<{ operatorId: string; operatorName: string;
  skills: (RawSkillLevel & { skillId: string; skillIndex: number })[] }[]>('./fixtures/skillStructureFourOperators.json')
const talents = json<{ operatorId: string; operatorProfile: OperatorCombatProfile }[]>('./fixtures/talentStructureFourOperators.json')
const irene = json<{ operator: { operatorId: string; operatorName: string }; operatorProfile: OperatorCombatProfile;
  skill: { skillId: string; skillIndex: number; levels: RawSkillLevel[] } }>('./fixtures/ireneS1.json')
const ireneOther = json<{ skills: { skillId: string; skillIndex: number; levels: RawSkillLevel[] }[] }>('./fixtures/ireneS2S3.json')
const growth: Record<string, { low: number; high: number; trust: number; interval: number; subclass: string }> = {
  char_350_surtr: { low: 544, high: 672, trust: 100, interval: 1.25, subclass: 'artsfghter' },
  char_263_skadi: { low: 842, high: 1015, trust: 80, interval: 1.5, subclass: 'fearless' },
  char_172_svrash: { low: 577, high: 713, trust: 50, interval: 1.3, subclass: 'lord' },
  char_293_thorns: { low: 575, high: 711, trust: 30, interval: 1.3, subclass: 'lord' },
}

function input(operatorId: string, skillIndex: number, conditions: DamageCalculatorThreeConditions = {}): DamageCalculatorThreeInput {
  const source = sources.find(source => source.operatorId === operatorId)
  const sourceSkill = source?.skills.find(skill => skill.skillIndex === skillIndex)
  const ireneSkill = skillIndex === 1 ? irene.skill : ireneOther.skills.find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(sourceSkill ?? ireneSkill.levels[9])
  const stats = growth[operatorId]
  const profile = stats ? {
    ...structuredClone(talents.find(talent => talent.operatorId === operatorId)!.operatorProfile),
    affiliationIds: { nationId: null, groupId: operatorId === 'char_263_skadi' ? 'abyssal' : null, teamId: null },
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { atk: stats.low, baseAttackTime: stats.interval, attackSpeed: 100 } },
      { level: 90, data: { atk: stats.high, baseAttackTime: stats.interval, attackSpeed: 100 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: stats.trust } }],
  } : structuredClone(irene.operatorProfile)
  const skill: SkillRecord = {
    id: `${operatorId}/${skillIndex}`, operatorId, operatorName: source?.operatorName ?? irene.operator.operatorName,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: stats?.subclass ?? 'sword',
    subProfessionName: stats?.subclass ?? '剣豪', nameInitial: 'OTHER',
    skillId: sourceSkill?.skillId ?? ireneSkill.skillId, skillIndex, skillName: raw.name!,
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: sourceSkill ? Array.from({ length: 10 }, () => structuredClone(raw)) : structuredClone(ireneSkill.levels), raw,
    operatorProfile: { ...profile, ...reviewedTraitProfile(operatorId) },
  }
  return { operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9,
    conditions, enemy: { defense: 1000, resistance: 60 } }
}

function pair(value: DamageCalculatorThreeInput, type: 'PHYSICAL' | 'ARTS') {
  const native = buildDamageCalculatorThreeOutput(value)
  const changed = buildDamageCalculatorThreeOutput({ ...value, virtualMainAttackType: type })
  assert.deepEqual(native.unsupportedReasons, [])
  assert.deepEqual(changed.unsupportedReasons, [])
  return { native, changed, before: native.rows[0], after: changed.rows[0] }
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('旧形式5人15スキルの全段階で元属性は完全一致し、物理・術の両方を計算できる', () => {
  const structures = getDamageCalculatorThreeStructures().filter(structure => !structure.guardRecipe)
  assert.equal(structures.length, 15)
  const snapshot = JSON.stringify(structures)
  let checked = 0
  const kinds = new Set<string>()
  for (const structure of structures) for (const stage of structure.effectStructure.stages) {
    const conditions: DamageCalculatorThreeConditions = {}
    if (stage.applicability) Object.assign(conditions, { [stage.applicability.metric]: stage.applicability.value })
    const value = input(structure.basicInfo.operatorId, structure.basicInfo.skillIndex, conditions)
    const native = buildDamageCalculatorThreeOutput(value)
    assert.deepEqual(native.unsupportedReasons, [], `${value.skill.operatorName} S${value.skill.skillIndex}/${stage.id}`)
    assert.ok(native.mainAttackType === 'PHYSICAL' || native.mainAttackType === 'ARTS')
    assert.deepEqual(buildDamageCalculatorThreeOutput({ ...value, virtualMainAttackType: native.mainAttackType }), native)
    for (const virtualMainAttackType of ['PHYSICAL', 'ARTS'] as const) {
      const result = buildDamageCalculatorThreeOutput({ ...value, virtualMainAttackType })
      assert.deepEqual(result.unsupportedReasons, [])
      assert.equal(result.rows.length, 1)
      assert.equal(result.damageType, virtualMainAttackType)
      assert.equal(result.mainAttackType, native.mainAttackType)
      assert.equal(result.attackKind, native.attackKind)
      assert.equal(result.attackInterval, native.attackInterval)
      assert.equal(result.model!.hitCount, native.model!.hitCount)
      assert.equal(result.actualTargetCount, native.actualTargetCount)
      assert.ok(Number.isFinite(result.rows[0].perAttack))
      if (!native.canShowDps) assert.equal(result.rows[0].dps, null)
    }
    kinds.add(native.attackKind)
    checked++
  }
  assert.ok(checked >= 17)
  assert.deepEqual([...kinds].sort(), ['COUNTER', 'NEXT_ATTACK', 'NORMAL', 'SKILL_ACTION'].sort())
  assert.equal(JSON.stringify(structures), snapshot)
})

test('スルトの主攻撃を物理に変更し、術耐性無視を防御無視へ変換しない', () => {
  const { native, changed, before, after } = pair(input('char_350_surtr', 2), 'PHYSICAL')
  assert.equal(native.mainAttackType, 'ARTS')
  assert.equal(changed.mainAttackType, 'ARTS')
  assert.equal(changed.resistanceIgnoreFixed, 20)
  close(before.perAttack, native.effectiveAttack! * 0.6)
  close(after.perAttack, native.effectiveAttack! - 1000)
  close(after.dps, after.perAttack / native.attackInterval!)
  assert.equal(after.breakdown!.mitigation.defenseIgnoreFixed, 0)
})

test('スカジの物理攻撃を術に変更しても能力値・連撃数・倍率・間隔は変わらない', () => {
  const { native, changed, after } = pair(input('char_263_skadi', 1), 'ARTS')
  assert.equal(changed.effectiveAttack, native.effectiveAttack)
  assert.equal(changed.attackSpeed, native.attackSpeed)
  close(after.perAttack, native.effectiveAttack! * 0.4)
  close(after.dps, after.perAttack / native.attackInterval!)
  const floor = buildDamageCalculatorThreeOutput({ ...input('char_263_skadi', 1), virtualMainAttackType: 'ARTS',
    enemy: { defense: 1000, resistance: 100 } })
  close(floor.rows[0].perAttack, native.effectiveAttack! * 0.05)
})

test('ソーンズの術毒は主攻撃の属性を変えても維持し、反撃のDPSを作らない', () => {
  for (const skillIndex of [1, 2, 3]) {
    const { native, changed, before, after } = pair(input('char_293_thorns', skillIndex,
      { enemyAttackCapability: 'RANGED_CAPABLE' }), 'ARTS')
    assert.deepEqual(changed.damageOverTime, native.damageOverTime)
    close(changed.damageOverTime!.damagePerSecond, 250 * 0.4)
    assert.equal(after.damageOverTimeDps, before.damageOverTimeDps)
    if (native.attackKind === 'COUNTER') {
      assert.equal(after.dps, null)
      assert.equal(after.combinedDps, null)
      assert.equal(changed.damageOverTime!.steadyDps, null)
    } else close(after.combinedDps, after.dps! + before.damageOverTimeDps!)
  }
})

test('術属性に変えたソーンズの感度表では毒も同じ敵の術耐性で減衰する', () => {
  const value = input('char_293_thorns', 1)
  const result = buildDamageCalculatorThreeOutput({ ...value, enemy: undefined, virtualMainAttackType: 'ARTS' })
  assert.deepEqual(result.unsupportedReasons, [])
  close(result.rows.find(row => row.axisValue === 0)!.damageOverTimeDps, 125)
  close(result.rows.find(row => row.axisValue === 60)!.damageOverTimeDps, 50)
  close(result.rows.find(row => row.axisValue === 100)!.damageOverTimeDps, 6.25)
})

test('アイリーニS1〜S3の全打撃を術化し、防御無視の抽選を術耐性無視へ転用しない', () => {
  for (const skillIndex of [1, 2, 3]) {
    const { native, changed, before, after } = pair(input('char_4009_irene', skillIndex,
      { targetCanBeLevitated: false }), 'ARTS')
    assert.equal(changed.hasAttackSequence, true)
    assert.equal(after.attackComponents.length, before.attackComponents.length)
    for (const [index, component] of after.attackComponents.entries()) {
      const original = before.attackComponents[index]
      assert.equal(component.role, 'MAIN')
      assert.equal(component.damageType, 'ARTS')
      assert.equal(component.count, original.count)
      assert.equal(component.defenseIgnoreChance, original.defenseIgnoreChance)
      assert.equal(component.defenseIgnoreRatio, original.defenseIgnoreRatio)
      assert.equal(component.targetAirborne, original.targetAirborne)
      close(component.expectedDamage, original.attackPipeline.finalAttack * 0.4 * component.expectedHitCount)
      for (const branch of component.branches) assert.equal(branch.mitigation.resistanceIgnoreFixed, 0)
    }
    close(after.perAttack, after.attackComponents.reduce((sum, component) => sum + component.expectedDamage, 0))
    assert.equal(after.dps, null)
    assert.equal(changed.canShowDps, native.canShowDps)
  }
})

test('アイリーニS3の浮遊中・地上・ランダム命中配分と全対象値を保持する', () => {
  const { native, changed, before, after } = pair(input('char_4009_irene', 3,
    { actualAttackTargetCount: 3, splashTargetCount: 2, targetWeight: 5, airborneHitCount: 4 }), 'ARTS')
  assert.deepEqual(after.attackComponents.map(component => [component.id, component.count, component.expectedHitCount, component.targetAirborne]),
    before.attackComponents.map(component => [component.id, component.count, component.expectedHitCount, component.targetAirborne]))
  close(after.allTargetsPerAttack, after.perAttack * 3)
  assert.equal(changed.hasRandomTargets, native.hasRandomTargets)
})

test('通常計算の不正条件・不足データを属性変更で解消せず、不正属性も拒否する', () => {
  const cases: DamageCalculatorThreeInput[] = [
    { ...input('char_350_surtr', 2), trust: 101 },
    { ...input('char_263_skadi', 1), enemy: { defense: -1, resistance: 0 } },
    input('char_4009_irene', 3, { targetWeight: 5 }),
    input('char_4009_irene', 2, { actualAttackTargetCount: 7 }),
  ]
  for (const value of cases) {
    const native = buildDamageCalculatorThreeOutput(value)
    assert.ok(native.unsupportedReasons.length)
    for (const virtualMainAttackType of ['PHYSICAL', 'ARTS'] as const) {
      const changed = buildDamageCalculatorThreeOutput({ ...value, virtualMainAttackType })
      assert.deepEqual(changed.rows, [])
      assert.deepEqual(changed.unsupportedReasons, native.unsupportedReasons)
    }
  }
  for (const invalid of ['TRUE', '', null]) {
    const result = buildDamageCalculatorThreeOutput({ ...input('char_350_surtr', 2),
      virtualMainAttackType: invalid as 'PHYSICAL' })
    assert.deepEqual(result.rows, [])
    assert.match(result.unsupportedReasons.join(), /仮想攻撃属性/)
  }
})
