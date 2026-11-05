import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries } from '../src/lib/damageCalculatorThreeComparison.ts'
import { evaluateDamageThreeAttributeComparison, getDamageThreeAttributeEntries,
  getDamageThreeAttributeChangeRate, type DamageThreeAttributeComparisonInput } from '../src/lib/damageCalculatorThreeAttributeComparison.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = ['Melee', 'Ranged', 'Arts'].flatMap(group => JSON.parse(readFileSync(
  new URL(`../src/data/expanded${group}Sources.json`, import.meta.url), 'utf8')) as ExpandedOperatorSource[])
function records(): SkillRecord[] {
  return sources.flatMap(source => source.skills.map(skill => {
    const raw = structuredClone(skill.raw)
    return { id: `${source.operatorId}/${skill.skillIndex}`, operatorId: source.operatorId,
      operatorName: source.operatorName, skillId: skill.skillId, skillIndex: skill.skillIndex,
      skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
      rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
      nameInitial: 'OTHER', description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
      skillType: raw.skillType!, spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
      classification: classifySkill(raw), raw, operatorProfile: structuredClone(source.profile),
      skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    }
  }))
}
const entries = getDamageThreeAttributeEntries(records())
function input(suffix = '_angel', index = 3): DamageThreeAttributeComparisonInput {
  const entry = entries.find(entry => entry.skill.operatorId.endsWith(suffix) && entry.skill.skillIndex === index)!
  assert.ok(entry, `${suffix}/S${index}`)
  return { entry, common: { defense: 123, resistance: 37, enemyCount: 3 }, targetType: 'ARTS', axis: 'defense' }
}
function valid(value: DamageThreeAttributeComparisonInput) {
  const result = evaluateDamageThreeAttributeComparison(value)
  assert.deepEqual(result.errors, [])
  assert.ok(result.changed)
  assert.ok(result.samples.length >= 61)
  return result
}

test('通常DC3と同じ全攻撃段階を列挙し、正確な選択点で同じ基準値を表示する', () => {
  assert.ok(entries.length > 100)
  assert.deepEqual(entries.map(entry => entry.key), getDamageThreeComparisonEntries(records()).map(entry => entry.key))
  assert.ok(entries.some(entry => entry.kind === 'NEXT_ATTACK'))
  assert.ok(entries.some(entry => entry.kind === 'SKILL_ACTION'))
  const value = input()
  const result = valid(value)
  const ordinary = evaluateDamageThreeComparisonEntry(value.entry, value.common)
  assert.deepEqual(result.original, ordinary)
  const point = result.samples.find(point => point.x === 123)!
  assert.equal(point.original.dps, result.original.dps)
  assert.equal(point.changed.dps, result.changed!.dps)
  assert.equal(result.original.actualTargetCount, 1)
  assert.equal(result.changed!.actualTargetCount, 1)
})

test('同じ属性の指定では全サンプル・現在値が一致し、増減率は0になる', () => {
  const result = valid({ ...input(), targetType: 'PHYSICAL' })
  assert.equal(result.original.dps, result.changed!.dps)
  for (const point of result.samples) {
    assert.deepEqual(point.original, point.changed)
    assert.equal(getDamageThreeAttributeChangeRate(point.original.dps, point.changed.dps), 0)
  }
})

test('DEF横軸ではRESを固定し、追加ダメージのない術化された主攻撃は一定になる', () => {
  const result = valid(input())
  const values = result.samples.map(point => point.changed.dps)
  assert.ok(values.every(value => value === result.changed!.dps))
  assert.ok(result.samples[0].original.dps! > result.samples.at(-1)!.original.dps!)
})

test('RES横軸ではDEFを固定し、選択点と最低保証に入る95・100を含める', () => {
  const value = { ...input(), axis: 'resistance' as const }
  const result = valid(value)
  assert.equal(result.axisMaximum, 100)
  assert.ok(result.samples.some(point => point.x === 37))
  assert.ok(result.samples.some(point => point.x === 95))
  assert.ok(result.samples.every(point => point.original.dps === result.original.dps))
  const floor = result.samples.find(point => point.x === 95)!
  assert.ok(Math.abs(floor.changed.dps! - result.samples.at(-1)!.changed.dps!) < 1e-9)
  for (const x of [0, 95, 100]) {
    const expected = evaluateDamageThreeComparisonEntry(value.entry, { ...value.common, resistance: x }, {}, { virtualMainAttackType: 'ARTS' })
    assert.equal(result.samples.find(point => point.x === x)!.changed.dps, expected.dps)
  }
})

test('レベルと信頼度を両系列へ同じように渡し、入力を変更しない', () => {
  const value = { ...input(), operatorLevel: 1, trust: 0 }
  const snapshot = structuredClone(value)
  const result = valid(value)
  assert.deepEqual(result.original, evaluateDamageThreeComparisonEntry(value.entry, value.common, {}, { operatorLevel: 1, trust: 0 }))
  assert.deepEqual(result.changed, evaluateDamageThreeComparisonEntry(value.entry, value.common, {}, { operatorLevel: 1, trust: 0, virtualMainAttackType: 'ARTS' }))
  assert.deepEqual(value, snapshot)
  assert.ok(result.original.dps! < valid(input()).original.dps!)
})

test('防御力が既定範囲より大きくても選択点まで表示しサンプル数は増殖しない', () => {
  const value = input()
  value.common.defense = 12345
  const result = valid(value)
  assert.equal(result.axisMaximum, 12345)
  assert.equal(result.samples.at(-1)!.x, 12345)
  assert.ok(result.samples.length <= 63)
})

test('静的対応フラグを偽装しても未確認構造の変更後数値を出さない', () => {
  const value = structuredClone(input())
  delete value.entry.structure.guardRecipe!.stages[0].actions[0].role
  value.entry.capability = { supported: true, reason: null }
  const result = evaluateDamageThreeAttributeComparison(value)
  assert.ok(result.errors.some(error => error.includes('区分が未確認')))
  assert.equal(result.changed, null)
  assert.deepEqual(result.samples, [])
})

test('敵条件の不正値を0へ置換せず、変更後の計算とグラフを止める', () => {
  for (const update of [{ defense: -1 }, { defense: Infinity }, { resistance: -1 }, { resistance: 101 },
    { enemyCount: 0 }, { enemyCount: 1.5 }, { enemyCount: NaN }, { enemyCount: 10001 }]) {
    const value = input()
    const result = evaluateDamageThreeAttributeComparison({ ...value, common: { ...value.common, ...update } })
    assert.ok(result.errors.length)
    assert.equal(result.changed, null)
    assert.deepEqual(result.samples, [])
  }
})

test('スキル出典の不一致があれば片側だけのグラフを描かない', () => {
  const value = structuredClone(input())
  value.entry.skill.skillLevels[value.entry.levelIndex].blackboard = []
  const result = evaluateDamageThreeAttributeComparison(value)
  assert.ok(result.errors.length)
  assert.deepEqual(result.samples, [])
  assert.equal(result.original.dps, null)
  assert.equal(result.changed?.dps, null)
})

test('レベル・信頼度の空欄や範囲外で別の育成条件を代用しない', () => {
  for (const update of [{ operatorLevel: NaN }, { operatorLevel: 0 }, { operatorLevel: 91 },
    { operatorLevel: 1.5 }, { trust: NaN }, { trust: -1 }, { trust: 101 }]) {
    const result = evaluateDamageThreeAttributeComparison({ ...input(), ...update })
    assert.ok(result.errors.length)
    assert.deepEqual(result.samples, [])
    assert.equal(result.original.dps, null)
    assert.equal(result.changed?.dps, null)
  }
})

test('増減率の欠損・ゼロ基準・負数・不正値を明示的に区別する', () => {
  assert.equal(getDamageThreeAttributeChangeRate(100, 150), 50)
  assert.equal(getDamageThreeAttributeChangeRate(100, 0), -100)
  assert.equal(getDamageThreeAttributeChangeRate(0, 0), 0)
  assert.equal(getDamageThreeAttributeChangeRate(0, 1), null)
  assert.equal(getDamageThreeAttributeChangeRate(null, 1), null)
  assert.equal(getDamageThreeAttributeChangeRate(1, null), null)
  assert.equal(getDamageThreeAttributeChangeRate(-1, 1), null)
  assert.equal(getDamageThreeAttributeChangeRate(1, Infinity), null)
  assert.equal(getDamageThreeAttributeChangeRate(NaN, 1), null)
})
