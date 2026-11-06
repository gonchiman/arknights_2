import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { buildTraitStructures } from '../src/lib/traitStructure.ts'
import { EXPANDED_SUPPORT_DEFINITIONS } from '../src/lib/expandedSupportDefinitions.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedSupportSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function record(id: string, index: number): SkillRecord {
  const source = sources.find(source => source.operatorId === id)!, entry = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: entry.skillId, skillIndex: index,
    skillName: raw.name!, profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw), raw,
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), operatorProfile: structuredClone(source.profile) }
}
function output(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}, mutate?: (record: SkillRecord) => void) {
  const skill = record(id, index); mutate?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: skill.operatorProfile.phases[2].maxLevel!,
    trust: 100, skillLevelIndex: 9, conditions: { guard }, enemy: { defense: 500, resistance: 40 }, ...options })
}
function valid(value: ReturnType<typeof output>) {
  assert.deepEqual(value.unsupportedReasons, [])
  assert.equal(value.rows.length, 1)
  return value.rows[0]
}
function close(actual: number | null | undefined, expected: number) {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}

test('支援系7技能の数値と対象外5技能を区別し、全特性の原文を厳密に照合する', () => {
  assert.equal(EXPANDED_SUPPORT_DEFINITIONS.length, 5)
  assert.equal(EXPANDED_SUPPORT_DEFINITIONS.reduce((sum, source) => sum + source.recipes.length, 0), 7)
  for (const definition of EXPANDED_SUPPORT_DEFINITIONS) for (const recipe of definition.recipes) {
    const result = output(definition.operatorId, recipe.skillIndex)
    valid(result)
    assert.equal(buildTraitStructures([record(definition.operatorId, recipe.skillIndex)])[0].status, 'STRUCTURED')
  }
  const coverage = buildDamageCalculatorThreeCoverage(sources.flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex))))
  assert.equal(coverage.filter(row => row.status === 'NOT_APPLICABLE').length, 5)
  assert.equal(coverage.filter(row => row.status === 'SUPPORTED' || row.status === 'CONDITIONAL').length, 7)
  for (const source of sources) {
    const result = output(source.operatorId, EXPANDED_SUPPORT_DEFINITIONS.find(item => item.operatorId === source.operatorId)!.recipes[0].skillIndex,
      {}, {}, skill => { const board = skill.operatorProfile.trait?.candidates?.[0].blackboard; if (board?.length) board[0].value! += 0.01; else skill.operatorProfile.traitDescription += ' 未確認効果' })
    assert.ok(result.unsupportedReasons.length)
    assert.deepEqual(result.rows, [])
  }
})

test('濁心スカジS3は鼓舞110%を自身へ加算せず、本人の攻撃力70%を範囲ごとに独立して計算する', () => {
  for (const [skadiAlly, ratio] of [['NONE', 0], ['OTHER', 0.06], ['ABYSSAL', 0.15]] as const) {
    for (const skadiSeabornOverlap of [false, true]) {
      const result = output('char_1012_skadi2', 3, { skadiAlly, skadiSeabornOverlap, actualAttackTargetCount: 3 })
      const row = valid(result), expected = Math.floor(result.stats.attack * (1 + ratio) + 1e-9) * 0.7 * (skadiSeabornOverlap ? 2 : 1)
      close(row.damageOverTimeDps, expected)
      assert.equal(result.actualTargetCount, 3)
      assert.equal(row.perAttack, 0)
      assert.equal(row.dps, null)
      assert.equal(result.attackInterval, null)
    }
  }
})

test('濁心スカジの仮想属性は本人とシーボーンの同じS3効果へ等しく適用する', () => {
  const result = output('char_1012_skadi2', 3, { skadiSeabornOverlap: true }, { virtualMainAttackType: 'ARTS' })
  close(valid(result).damageOverTimeDps, result.stats.attack * 0.7 * 2 * 0.6)
})

test('微塵は1個1命中の275%確定ダメージで、6個生成や鼓舞100%を総量へ混ぜない', () => {
  const result = output('char_4134_cetsyr', 2), row = valid(result)
  close(row.perAttack, result.stats.attack * 2.75)
  assert.equal(row.dps, null)
  assert.equal(result.attackInterval, null)
  const excessive = output('char_4134_cetsyr', 2, { actualAttackTargetCount: 2 })
  assert.ok(excessive.unsupportedReasons.length)
  assert.deepEqual(excessive.rows, [])
})

test('三角初華の素質は1ダメージ発生につき30%を1回付随し、味方本人の攻撃と鼓舞を混ぜない', () => {
  const first = output('char_4184_dolris', 1), firstRow = valid(first)
  close(firstRow.perAttack, first.stats.attack * 0.3 * 0.6)
  assert.equal(firstRow.attackComponents!.length, 1)
  const second = output('char_4184_dolris', 2), secondRow = valid(second)
  close(secondRow.perAttack, second.stats.attack * 1.3 * 0.6)
  assert.equal(secondRow.attackComponents!.length, 2)
  const ally = output('char_4184_dolris', 2, { dolrisDamageSource: 'ALLY' })
  close(valid(ally).perAttack, second.stats.attack * 0.3 * 0.6)
  for (const value of [first, second, ally]) {
    assert.equal(value.rows[0].dps, null)
    assert.equal(value.attackInterval, null)
  }
  const changedTalent = output('char_4184_dolris', 2, {}, {}, skill => {
    skill.operatorProfile.talents![1].candidates!.find(candidate => candidate.unlockCondition?.phase === 'PHASE_2')!.blackboard!.find(entry => entry.key === 'atk_scale')!.value = 0.4
  })
  assert.match(changedTalent.unsupportedReasons.join(), /30%/)
  assert.deepEqual(changedTalent.rows, [])
})

test('三角初華の仮想属性はS2本体だけ変更し、素質の術ダメージを変えない', () => {
  const result = output('char_4184_dolris', 2, {}, { virtualMainAttackType: 'PHYSICAL' }), row = valid(result)
  close(row.perAttack, Math.max(result.stats.attack - 500, result.stats.attack * 0.05) + result.stats.attack * 0.3 * 0.6)
  const first = output('char_4184_dolris', 1, {}, { virtualMainAttackType: 'ARTS' })
  assert.match(first.unsupportedReasons.join(), /主攻撃がありません/)
  assert.deepEqual(first.rows, [])
})

test('ハルカS2は実回復量だけを200%へ変換し、0回復・術耐性・3体上限を保つ', () => {
  for (const harukaActualHealing of [0, 0.5, 100, 1000]) for (const resistance of [0, 40, 100]) {
    const result = output('char_4202_haruka', 2, { harukaActualHealing, actualAttackTargetCount: 3 }, { enemy: { defense: 10000, resistance } })
    const row = valid(result), expected = harukaActualHealing * 2 * Math.max(0.05, 1 - resistance / 100)
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * 3)
    assert.equal(row.dps, null)
  }
  for (const guard of [{ harukaActualHealing: -1 }, { harukaActualHealing: Number.NaN }, { actualAttackTargetCount: 4 }, { harukaHealingSource: 'AUTOMATIC' }]) {
    const value = output('char_4202_haruka', 2, guard)
    assert.ok(value.unsupportedReasons.length)
    assert.deepEqual(value.rows, [])
  }
})

test('ハルカS3は浮遊効果中の毎秒80%で、治療速度や4秒全量へ変換しない', () => {
  const result = output('char_4202_haruka', 3, { actualAttackTargetCount: 4 }), row = valid(result)
  const expected = Math.floor(result.stats.attack * 1.55 + 1e-9) * 0.8 * 0.6
  close(row.damageOverTimeDps, expected)
  assert.equal(result.actualTargetCount, 4)
  assert.equal(row.perAttack, 0)
  assert.equal(row.dps, null)
  assert.equal(result.attackInterval, null)
  const inactive = output('char_4202_haruka', 3, { harukaLevitateActive: false })
  assert.ok(inactive.unsupportedReasons.length)
  assert.deepEqual(inactive.rows, [])
})


test('サイラッハS3は着弾前の30%脆弱を個別軽減後に適用し、継続通常攻撃は加算しない', () => {
  for (const defense of [0, 500, 3000]) for (const count of [1, 3, 5]) {
    const result = output('char_479_sleach', 3, { actualAttackTargetCount: count }, { enemy: { defense, resistance: 60 } })
    const row = valid(result)
    close(row.perAttack, Math.max(586 * 3 - defense, 586 * 3 * 0.05) * 1.3)
    close(row.allTargetsPerAttack, row.perAttack * count)
    assert.equal(row.dps, null)
    assert.equal(result.attackInterval, null)
    assert.equal(row.attackComponents?.length, 1)
  }
  const virtual = output('char_479_sleach', 3, {}, { virtualMainAttackType: 'ARTS' })
  close(valid(virtual).perAttack, 586 * 3 * 0.6 * 1.3)
  const changed = output('char_479_sleach', 3, {}, {}, skill => { skill.skillLevels[9].description += ' 未確認効果' })
  assert.deepEqual(changed.rows, [])
  assert.ok(changed.unsupportedReasons.length)
})
