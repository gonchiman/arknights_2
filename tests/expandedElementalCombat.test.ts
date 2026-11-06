import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SkillRecord } from '../src/types/skill.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { calculateElementalDamageBreakdown } from '../src/lib/elementalDamage.ts'
import { EXPANDED_ELEMENTAL_DEFINITIONS } from '../src/lib/expandedElementalDefinitions.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { getSkillStructureEffectValueRows, findSkillStructure } from '../src/lib/skillStructure.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedElementalSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function record(id: string): SkillRecord {
  const source = sources.find(source => source.operatorId === id)!, skill = source.skills[0], raw = structuredClone(skill.raw)
  return { id: `${id}/${skill.skillIndex}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: skill.skillIndex, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(source.profile) }
}
function output(id: string, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}, mutate?: (skill: SkillRecord) => void) {
  const skill = record(id), source = sources.find(source => source.operatorId === id)!
  mutate?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
    conditions: { guard }, ...options })
}
function one(id: string, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  const result = output(id, guard, { enemy: { defense: 500, resistance: 60 }, ...options })
  assert.deepEqual(result.unsupportedReasons, [], id)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
const arts = (a: number, r: number) => a * Math.max(0.05, 1 - r / 100)
const physical = (a: number, d: number) => Math.max(a * 0.05, a - d)

test('元素HPダメージは元素耐性だけを使用し、元素損傷・未定義の属性を拒否する', () => {
  for (const elementId of ['necrosis', 'burn', 'neural', 'corrosion']) for (const resistance of [0, 20, 95, 100]) {
    const result = calculateElementalDamageBreakdown(1000, { type: 'ELEMENTAL_DAMAGE', elementId }, resistance)
    close(result.result, arts(1000, resistance))
    assert.equal(result.damageType, 'ELEMENTAL')
    assert.equal(result.afterResistance, null)
    assert.equal(result.afterDefense, null)
    assert.equal(result.appliedElementalResistance, resistance)
  }
  for (const resistance of [-1, 101, NaN, Infinity]) assert.throws(() => calculateElementalDamageBreakdown(100, { type: 'ELEMENTAL_DAMAGE', elementId: 'burn' }, resistance))
  assert.throws(() => calculateElementalDamageBreakdown(100, { type: 'ELEMENTAL_BUILDUP', elementId: 'burn' } as never, 0))
  assert.throws(() => calculateElementalDamageBreakdown(100, { type: 'ELEMENTAL_DAMAGE', elementId: 'unknown' }, 0))
})

test('確認済み38技能だけを登録し、残りを保留へ移さない', () => {
  assert.equal(sources.length, 16)
  assert.equal(sources.reduce((n, source) => n + source.skills.length, 0), 38)
  assert.equal(EXPANDED_ELEMENTAL_DEFINITIONS.reduce((n, definition) => n + definition.recipes.length, 0), 38)
  assert.ok(EXPANDED_ELEMENTAL_DEFINITIONS.every(definition => !definition.deferredSkills?.length))
  for (const source of sources) {
    const skill = record(source.operatorId), coverage = buildDamageCalculatorThreeCoverage([skill])[0]
    assert.ok(['SUPPORTED', 'CONDITIONAL'].includes(coverage.status), `${source.operatorName}: ${coverage.status}`)
    assert.ok(output(source.operatorId).rows.length)
  }
})

test('クラックボーンとフィラエのS1は通常物理攻撃を継続し、HP・元素回復をATKへ混ぜない', () => {
  for (const [id, attack] of [['char_4225_tanya', 632], ['char_4148_philae', 643]] as const) {
    const { result, row } = one(id)
    close(result.effectiveAttack, attack)
    close(row.perAttack, attack - 500)
    close(row.dps, (attack - 500) / 1.6)
    assert.equal(result.maxTargetCount, 1)
    const virtual = one(id, {}, { virtualMainAttackType: 'ARTS' })
    close(virtual.row.perAttack, arts(attack, 60))
  }
})

test('ディアマンテS2は範囲内存在条件を導出し、術と追加75%元素を独立に軽減する', () => {
  for (const burst of [false, true]) for (const other of [false, true]) for (const resistance of [0, 40, 100]) {
    const { result, row } = one('char_499_kaitou', { targetNecrosisState: burst ? 'BURST' : 'NONE',
      otherNecrosisBurstInRange: other, enemyElementalResistance: resistance, actualAttackTargetCount: 2 })
    const attack = Math.floor(643 * (burst || other ? 1.18 : 1))
    close(row.perAttack, arts(attack, 60) + (burst ? arts(attack * 0.75, resistance) : 0))
    close(row.allTargetsPerAttack, row.perAttack * 2)
    close(result.attackInterval, 1.6 / 1.9)
    assert.ok(result.guard!.inputs.some(input => input.key === 'enemyElementalResistance'))
  }
})

test('ウォーミーS2は通常/OCの対象数と術耐性20低下を適用し、素質300%を毎攻撃に足さない', () => {
  for (const warmyPhase of ['NORMAL', 'OVERCHARGE']) for (const burst of [false, true]) {
    const { result, row } = one('char_4081_warmy', { warmyPhase, targetBurnState: burst ? 'BURST' : 'NONE', enemyElementalResistance: 50 })
    close(result.effectiveAttack, 1938)
    close(result.attackInterval, 2.5)
    close(row.perAttack, arts(1938, burst ? 40 : 60) + (burst && warmyPhase === 'OVERCHARGE' ? 1938 * 0.5 * 0.5 : 0))
    assert.equal(result.maxTargetCount, warmyPhase === 'OVERCHARGE' ? 3 : 2)
    assert.equal(row.attackComponents.some(component => component.label.includes('爆発開始時')), false)
  }
  const event = one('char_4081_warmy', { warmyPhase: 'BURST_EVENT', targetBurnState: 'BURST', enemyElementalResistance: 50 })
  close(event.row.perAttack, 1938 * 3 * 0.5)
  assert.equal(event.result.damageType, 'ELEMENTAL')
  assert.equal(event.row.attackComponents.length, 1)
  assert.equal(event.row.dps, null)
  assert.equal(output('char_4081_warmy', { warmyPhase: 'BURST_EVENT' }).rows.length, 0)
})

test('グレースベアラーS2は3連撃を元素に置換し、撃破後の素質は25%でなく15%にする', () => {
  for (const defeated of [false, true]) for (const burst of [false, true]) {
    const { result, row } = one('char_4187_graceb', { targetNeuralState: burst ? 'BURST' : 'NONE',
      neuralBurstEnemyDefeated: defeated, enemyElementalResistance: 40, actualAttackTargetCount: 6 })
    const attack = defeated ? 1035 : 990
    close(result.effectiveAttack, attack)
    close(row.perAttack, 3 * (burst ? arts(attack * 2.5, 40) : physical(attack * 2.5, 500)))
    close(row.allTargetsPerAttack, row.perAttack * 6)
    assert.equal(result.mainAttackType, burst ? 'ELEMENTAL' : 'PHYSICAL')
    assert.equal(row.dps, null)
  }
  const table = output('char_4187_graceb', { targetNeuralState: 'BURST' })
  assert.equal(table.axisLabel, '敵の元素耐性')
  for (const row of table.rows) close(row.perAttack, 990 * 2.5 * 3 * Math.max(0.05, 1 - row.axisValue / 100))
})

test('元素の追加攻撃は仮想MAINに追随せず、純元素MAINは仮想属性へ明示的に置換する', () => {
  for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const mixed = one('char_499_kaitou', { targetNecrosisState: 'BURST', enemyElementalResistance: 40 }, { virtualMainAttackType: type })
    close(mixed.row.perAttack, (type === 'PHYSICAL' ? 758 - 500 : arts(758, 60)) + 758 * 0.75 * 0.6)
    assert.equal(mixed.row.attackComponents.find(component => component.role === 'ADDITIONAL')!.damageType, 'ELEMENTAL')
    const pure = one('char_4187_graceb', { targetNeuralState: 'BURST', enemyElementalResistance: 40 }, { virtualMainAttackType: type })
    close(pure.row.perAttack, 3 * (type === 'PHYSICAL' ? 2475 - 500 : arts(2475, 60)))
    assert.equal(pure.result.mainAttackType, 'ELEMENTAL')
    assert.ok(pure.row.attackComponents.every(component => component.damageType === type))
  }
  assert.equal(output('char_4081_warmy', { warmyPhase: 'BURST_EVENT', targetBurnState: 'BURST' }, { virtualMainAttackType: 'PHYSICAL' }).rows.length, 0)
})

test('構造化・表示でも元素を術や確定として表示しない', () => {
  const skill = record('char_4187_graceb')
  const structure = findSkillStructure({ operatorId: skill.operatorId, skillId: skill.skillId, skillIndex: 2, levelIndex: 9 })!
  const effect = structure.effectStructure.stages.find(stage => stage.id === 'elemental')!.effects.find(effect => effect.item === 'DIRECT_DAMAGE')!
  assert.ok(getSkillStructureEffectValueRows(effect).some(([label, value]) => label === 'ダメージ種別' && value === '元素'))
})

test('元素耐性・データ欠落・未確認のsource変更は無視せず計算を停止する', () => {
  for (const resistance of [-1, 101, NaN, Infinity]) {
    assert.equal(output('char_499_kaitou', { enemyElementalResistance: resistance }).rows.length, 0)
    assert.equal(output('char_4187_graceb', { targetNeuralState: 'BURST' }, { enemy: { defense: 0, resistance: 0, elementalResistance: resistance } }).rows.length, 0)
  }
  for (const source of sources) {
    assert.equal(output(source.operatorId, {}, {}, skill => { skill.skillLevels[9].description += '未確認の追加効果' }).rows.length, 0)
    assert.equal(output(source.operatorId, {}, {}, skill => {
      for (const candidate of skill.operatorProfile.talents![0].candidates ?? []) candidate.blackboard = []
    }).rows.length, 0)
  }
})
