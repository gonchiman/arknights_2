import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures,
  getDamageCalculatorThreeVirtualAttackCapability, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { getGuardVirtualAttackCapability } from '../src/lib/damageCalculatorThreeVirtualAttack.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const expanded = ['Arts', 'Melee', 'Ranged'].flatMap(group =>
  json<ExpandedOperatorSource[]>(`../src/data/expanded${group}Sources.json`))
const guards = json<{ guards: { id: string; name: string; subProfessionId: string;
  skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[] }>('./fixtures/sixStarGuardSources.json').guards
const profiles = json<{ operatorId: string; operatorProfile: OperatorCombatProfile }[]>('./fixtures/sixStarGuardProfiles.json')

function input(id: string, index: number, guard: GuardConditions = {}): DamageCalculatorThreeInput {
  const source = expanded.find(source => source.operatorId === id)
  const operator = guards.find(source => source.id === id)
  const skill = (source?.skills ?? operator?.skills ?? []).find(skill => skill.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  const phaseIndex = source?.phaseIndex ?? 2
  const levelIndex = source?.skillLevelIndex ?? 9
  const profile = structuredClone(source?.profile ?? profiles.find(profile => profile.operatorId === id)!.operatorProfile)
  const record: SkillRecord = {
    id: `${id}/${index}`, operatorId: id, operatorName: source?.operatorName ?? operator!.name,
    skillId: skill.skillId, skillIndex: index, skillName: raw.name!,
    profession: source?.profession ?? 'WARRIOR', professionLabel: source?.profession ?? '前衛',
    rarity: source?.rarity ?? 6, subProfessionId: source?.subProfessionId ?? operator!.subProfessionId,
    subProfessionName: source?.subProfessionId ?? operator!.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: levelIndex + 1 }, () => structuredClone(raw)), raw, operatorProfile: profile,
  }
  return { operator: record, skill: record, phaseIndex, operatorLevel: profile.phases[phaseIndex].maxLevel!,
    trust: 100, skillLevelIndex: levelIndex, conditions: { guard }, enemy: { defense: 500, resistance: 30 } }
}

function pair(value: DamageCalculatorThreeInput, type: 'PHYSICAL' | 'ARTS') {
  const native = buildDamageCalculatorThreeOutput(value)
  const changed = buildDamageCalculatorThreeOutput({ ...value, virtualMainAttackType: type })
  assert.deepEqual(native.unsupportedReasons, [])
  assert.deepEqual(changed.unsupportedReasons, [])
  assert.equal(native.rows.length, 1)
  assert.equal(changed.rows.length, 1)
  return { native, changed, before: native.rows[0], after: changed.rows[0] }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('確認済みの通常攻撃型は同属性指定で本来の結果を完全に保ち、元の構造定義を変更しない', () => {
  const structures = getDamageCalculatorThreeStructures()
  const snapshot = JSON.stringify(structures)
  let compared = 0
  for (const structure of structures) {
    const recipe = structure.guardRecipe
    if (!recipe) continue
    for (const stage of recipe.stages) {
      if (!getDamageCalculatorThreeVirtualAttackCapability(structure, stage.id).supported) continue
      const conditions: Record<string, number | string | boolean> = {}
      if (stage.when) conditions[stage.when.input] = stage.when.value
      const value = input(recipe.operatorId, recipe.skillIndex, conditions)
      const native = buildDamageCalculatorThreeOutput(value)
      if (native.unsupportedReasons.length || !['PHYSICAL', 'ARTS'].includes(native.mainAttackType ?? '')) continue
      const unchanged = buildDamageCalculatorThreeOutput({ ...value,
        virtualMainAttackType: native.mainAttackType as 'PHYSICAL' | 'ARTS' })
      assert.deepEqual(unchanged, native, `${recipe.operatorId} S${recipe.skillIndex} ${stage.id}`)
      compared++
    }
  }
  assert.ok(compared > 100, `確認した通常攻撃段階: ${compared}`)
  assert.equal(JSON.stringify(structures), snapshot)
})

test('エクシアS3の全主攻撃を術へ変更し、攻撃力・5連撃・攻撃間隔と対象数を保持する', () => {
  const value = input('char_103_angel', 3)
  const { native, changed, before, after } = pair(value, 'ARTS')
  assert.equal(native.mainAttackType, 'PHYSICAL')
  assert.equal(changed.mainAttackType, 'PHYSICAL')
  assert.equal(changed.damageType, 'ARTS')
  assert.equal(changed.attackInterval, native.attackInterval)
  assert.equal(changed.effectiveAttack, native.effectiveAttack)
  assert.equal(changed.actualTargetCount, native.actualTargetCount)
  assert.equal(after.attackComponents[0].count, 5)
  close(after.perAttack, before.attackComponents[0].attackPipeline.finalAttack * 0.7 * 5)
  close(after.dps, after.perAttack / native.attackInterval!)
  const floor = buildDamageCalculatorThreeOutput({ ...value, enemy: { defense: 1e6, resistance: 100 }, virtualMainAttackType: 'ARTS' })
  close(floor.rows[0].perAttack, before.attackComponents[0].attackPipeline.finalAttack * 0.05 * 5)
})

test('ケオベS2は主攻撃だけ物理化し、敵防御力由来の追加術ダメージを保持する', () => {
  const { native, changed, before, after } = pair(input('char_2013_cerber', 2), 'PHYSICAL')
  assert.equal(native.mainAttackType, 'ARTS')
  assert.equal(changed.damageType, null)
  assert.equal(after.attackComponents[0].role, 'MAIN')
  assert.equal(after.attackComponents[0].damageType, 'PHYSICAL')
  const originalExtra = before.attackComponents.find(component => component.role === 'ADDITIONAL')!
  const changedExtra = after.attackComponents.find(component => component.role === 'ADDITIONAL')!
  assert.equal(changedExtra.damageType, 'ARTS')
  close(changedExtra.expectedDamage, originalExtra.expectedDamage)
  close(after.attackComponents[0].expectedDamage,
    Math.max(before.attackComponents[0].attackPipeline.finalAttack - 500, before.attackComponents[0].attackPipeline.finalAttack * 0.05))
})

test('イーサンの継続術ダメージとムリナールの追加確定ダメージは変更しない', () => {
  const ethan = expanded.find(source => source.operatorId.endsWith('_ethan'))!
  const poison = pair(input(ethan.operatorId, 1), 'ARTS')
  close(poison.after.damageOverTimeDps, poison.before.damageOverTimeDps!)
  close(poison.after.combinedDps, poison.after.dps! + poison.before.damageOverTimeDps!)
  const mlynar = pair(input('char_4064_mlynar', 3), 'ARTS')
  const before = mlynar.before.attackComponents.find(component => component.damageType === 'TRUE')!
  const after = mlynar.after.attackComponents.find(component => component.damageType === 'TRUE')!
  assert.equal(after.role, 'ADDITIONAL')
  close(after.expectedDamage, before.expectedDamage)
})

test('スカイフレアの術限定被ダメージ増加とヴィヴィアナの術限定与ダメージ増加を再評価する', () => {
  const skyfire = pair({ ...input('char_166_skfire', 1, { targetBlocked: true }), enemy: { defense: 0, resistance: 0 } }, 'PHYSICAL')
  const raw = skyfire.before.attackComponents[0].attackPipeline.finalAttack
  assert.ok(skyfire.before.perAttack > raw)
  close(skyfire.after.perAttack, raw)
  assert.ok(skyfire.changed.guard!.evaluations.some(row => row.status === 'NOT_RELEVANT'))
  const viviana = pair({ ...input('char_4098_vvana', 3), enemy: { defense: 0, resistance: 0 } }, 'PHYSICAL')
  assert.ok(viviana.before.perAttack > viviana.after.perAttack)
  assert.equal(viviana.native.attackInterval, viviana.changed.attackInterval)
})

test('防御無視と術耐性低下を相互変換せず、それぞれ該当する属性だけに適用する', () => {
  const executor = pair(input('char_279_excu', 2, { targetInFrontalTiles: false }), 'ARTS')
  close(executor.after.perAttack, executor.before.attackComponents[0].attackPipeline.finalAttack * 0.7 * 2)
  const ifrit = pair(input('char_134_ifrit', 1), 'PHYSICAL')
  const attack = ifrit.before.attackComponents[0].attackPipeline.finalAttack
  close(ifrit.after.perAttack, Math.max(attack - 500, attack * 0.05))
})

test('主攻撃不明・確定主攻撃・非通常攻撃型・不正属性は結果を代用せず停止する', () => {
  const structures = getDamageCalculatorThreeStructures()
  const find = (id: string, index: number) => structures.find(structure => structure.basicInfo.operatorId === id && structure.basicInfo.skillIndex === index)!
  assert.equal(getDamageCalculatorThreeVirtualAttackCapability(find('char_002_amiya', 3), 'active').supported, false)
  assert.equal(getDamageCalculatorThreeVirtualAttackCapability(find('char_210_stward', 1), 'active').supported, false)
  assert.equal(getDamageCalculatorThreeVirtualAttackCapability(find('char_350_surtr', 3), 'active').supported, false)
  assert.equal(getGuardVirtualAttackCapability({ id: 'x', label: 'x', kind: 'NORMAL',
    actions: [{ label: '攻撃', damageType: 'ARTS', scale: 1 }] }).supported, false)
  const original = find('char_103_angel', 3)
  const unknown = structuredClone(original)
  delete unknown.guardRecipe!.stages[0].actions[0].role
  const blocked = buildGuardDamageOutput({ ...input('char_103_angel', 3), virtualMainAttackType: 'ARTS' }, unknown)
  assert.deepEqual(blocked.rows, [])
  assert.match(blocked.unsupportedReasons.join(), /区分が未確認/)
  for (const value of [
    { ...input('char_002_amiya', 3), virtualMainAttackType: 'PHYSICAL' as const },
    { ...input('char_210_stward', 1), virtualMainAttackType: 'PHYSICAL' as const },
    { ...input('char_103_angel', 3), virtualMainAttackType: 'TRUE' as 'PHYSICAL' },
  ]) {
    const result = buildDamageCalculatorThreeOutput(value)
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.length)
  }
})

test('属性限定効果と追加ダメージが混在する未確認の組合せは部分結果を出さない', () => {
  const value = input('char_4098_vvana', 3)
  const structure = structuredClone(getDamageCalculatorThreeStructures().find(structure =>
    structure.basicInfo.operatorId === value.skill.operatorId && structure.basicInfo.skillIndex === 3)!)
  const stage = structure.guardRecipe!.stages[0]
  stage.actions = [...stage.actions, { role: 'ADDITIONAL', label: '追加術攻撃', damageType: 'ARTS', scale: 0.1 }]
  const result = buildGuardDamageOutput({ ...value, virtualMainAttackType: 'PHYSICAL' }, structure)
  assert.deepEqual(result.rows, [])
  assert.match(result.unsupportedReasons.join(), /属性限定効果を伴う追加・継続ダメージ/)
})
