import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXPANDED_ARTS_DEFINITIONS } from '../src/lib/expandedArtsDefinitions.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { calculateDamageThreePeriodTotal } from '../src/lib/damageCalculatorThreePeriodTotal.ts'
import { buildExpandedTalentStructures } from '../src/lib/expandedTalentStructure.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildTraitStructures } from '../src/lib/traitStructure.ts'
import { evaluateTraitStructure } from '../src/lib/traitCombatEvaluation.ts'
import { evaluateGuardTraits } from '../src/lib/guardTraitEvaluation.ts'
import { applyGuardTalentStructure } from '../src/lib/guardTalentEvaluation.ts'
import type { TalentStructure } from '../src/lib/talentStructure.ts'
import type { GuardPassiveModifiers } from '../src/lib/guardCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedArtsSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function record(id: string, index: number): SkillRecord {
  const source = sources.find(source => source.operatorId === id)!
  const skill = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(source.profile), overrideTokenKey: source.profile.summonSkillTokenKeys?.[index - 1] ?? undefined }
}
function output(id: string, index: number, guard: GuardConditions = {}, change?: (record: SkillRecord) => void,
  options: Partial<DamageCalculatorThreeInput> = {}) {
  const skill = record(id, index), source = sources.find(source => source.operatorId === id)!
  change?.(skill)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard }, ...options })
}
function at(id: string, index: number, guard: GuardConditions = {}, resistance = 0) {
  const result = output(id, index, guard)
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
  return { result, row: result.rows.find(row => row.axisValue === resistance)! }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const attack = (base: number, ratio = 0) => Math.floor(base * (1 + ratio) + 1e-9)
const mystics = ['char_338_iris', 'char_4046_ebnhlz', 'char_4110_delphn', 'char_297_hamoni', 'char_469_indigo']
test('秘術師の全実装段階は既定値で計算でき、有限期間総量を推定しない', () => {
  for (const id of mystics) for (const recipe of EXPANDED_ARTS_DEFINITIONS.find(definition => definition.operatorId === id)!.recipes) {
    for (const stage of recipe.stages) {
      if (stage.unresolved?.length) continue
      const guard: Record<string, string | number | boolean> = {}
      if (stage.when) guard[stage.when.input] = stage.when.comparison === 'LT' ? Number(stage.when.value) - 1 : stage.when.value
      const result = output(id, recipe.skillIndex, guard)
      assert.deepEqual(result.unsupportedReasons, [], id + ' S' + recipe.skillIndex + ' ' + stage.id)
      assert.ok(result.rows.length)
      const capability = calculateDamageThreePeriodTotal({ stage, attackKind: result.attackKind,
        combinedDps: result.rows[0].combinedDps, allTargetsCombinedDps: result.rows[0].allTargetsCombinedDps })
      assert.equal(capability.totalDamage, null)
    }
  }
})

test('アイリスS1は通常弾50%と貯蔵弾65%を分け、各弾を個別に軽減する', () => {
  for (const count of [0, 1, 3]) for (const type of ['ARTS', 'PHYSICAL'] as const) {
    const result = output('char_338_iris', 1, { storedChargeCount: count }, undefined,
      { virtualMainAttackType: type, enemy: { defense: 600, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const base = result.stats.attack, mitigate = (scale: number) => type === 'ARTS' ? base * scale * .6 : Math.max(base * scale - 600, base * scale * .05)
    close(result.rows[0].perAttack, mitigate(.5) + count * mitigate(.65))
    assert.deepEqual(result.rows[0].attackComponents?.map(component => component.count), count ? [1, count] : [1])
    assert.ok(result.rows[0].attackComponents?.every(component => component.role === 'MAIN' && component.damageType === type))
    assert.equal(result.rows[0].dps, null)
    assert.equal(result.attackInterval, null)
  }
})

test('アイリスS2睡眠終了時の爆発には貯蔵弾と貯蔵倍率を重ねない', () => {
  for (const stored of [0, 3]) for (const hits of [1, 2]) {
    const { result, row } = at('char_338_iris', 2, { storedChargeCount: stored, sleepExplosionHits: hits, actualAttackTargetCount: 4 }, 40)
    close(row.perAttack, result.stats.attack * 3 * hits * .6)
    close(row.allTargetsPerAttack, row.perAttack * 4)
    assert.equal(row.attackComponents?.length, 1)
    assert.equal(row.dps, null)
  }
})

test('エーベンホルツはエリート限定の追加弾と通常貯蔵弾を分け、孤立追加攻撃は各弾で発生する', () => {
  for (const stored of [0, 3]) for (const held of [false, true]) for (const elite of [false, true]) for (const isolated of [false, true]) {
    const result = output('char_4046_ebnhlz', 1, { storedChargeCount: stored, extraStoredChargeHeld: held, targetEliteOrBoss: elite, targetIsolated: isolated }, undefined,
      { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 300, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const base = result.stats.attack, count = stored + (held && elite ? 1 : 0)
    const physical = (scale: number) => Math.max(base * scale - 300, base * scale * .05)
    close(result.rows[0].perAttack, physical(.5) + count * physical(.675) + (isolated ? base * .15 * (1 + count) * .6 : 0))
    const additional = result.rows[0].attackComponents?.filter(component => component.role === 'ADDITIONAL') ?? []
    assert.equal(additional.length, isolated ? 1 : 0)
    if (isolated) { assert.equal(additional[0].damageType, 'ARTS'); assert.equal(additional[0].count, 1 + count) }
  }
})

test('エーベンホルツS3の第一素質倍率140%は貯蔵弾だけを強化し、通常弾と孤立追加攻撃は強化しない', () => {
  const { result, row } = at('char_4046_ebnhlz', 3, { storedChargeCount: 3, extraStoredChargeHeld: true, targetIsolated: true }, 40)
  const base = attack(result.stats.attack, .65)
  close(row.perAttack, base * (1 + 4 * 1.35 * 1.4 + 5 * .15) * .6)
  assert.equal(result.attackInterval, null)
  const invalid = output('char_4046_ebnhlz', 3, { targetEliteOrBoss: false })
  assert.equal(invalid.rows.length, 0)
  assert.ok(invalid.unsupportedReasons.some(reason => reason.includes('エリート')))
})

test('デルフィーンはHP80%以上と第13章の限定効果を分け、追加弾は条件成立時だけ放つ', () => {
  for (const hp of [79, 80, 100]) for (const chapter of [false, true]) for (const held of [false, true]) {
    const { result, row } = at('char_4110_delphn', 1, { targetHpPercent: hp, chapter13Sarkaz: chapter, extraStoredChargeHeld: held, storedChargeCount: 3 }, 40)
    close(row.perAttack, result.stats.attack * .5 * (4 + (chapter && held ? 1 : 0)) * (chapter ? 1.2 : 1) * (hp >= 80 ? 1.18 : 1) * .6)
  }
})

test('デルフィーンS2は付与済みDOTのATK参照を保持し、HP50%未満では斉射しない', () => {
  for (const hp of [49, 50, 80]) for (const stacks of [0, 4]) {
    const result = output('char_4110_delphn', 2, { storedChargeCount: 3, targetHpPercent: hp, delphineDotStacks: stacks, chapter13Sarkaz: true, extraStoredChargeHeld: true }, undefined,
      { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const base = attack(result.stats.attack, 1), amp = hp >= 80 ? 1.18 : 1
    close(result.rows[0].perAttack, hp < 50 ? 0 : Math.max(base * 1.2 - 500, base * 1.2 * .05) * 5 * amp)
    // DOT retains native arts when it is additional to a main volley; a DOT-only selected MAIN follows the virtual type.
    const dotAmount = base * .06 * stacks
    close(result.rows[0].damageOverTimeDps, (hp < 50 ? Math.max(dotAmount - 500, dotAmount * .05) : dotAmount * .6) * amp)
  }
})

test('ハーモニーの素質は軽減前の攻撃倍率、水域250は固定ダメージとして計算する', () => {
  for (const blocked of [false, true]) {
    const result = output('char_297_hamoni', 1, { storedChargeCount: 2, targetBlocked: blocked }, undefined,
      { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 600, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const amount = result.stats.attack * .5 * (blocked ? 1.17 : 1)
    close(result.rows[0].perAttack, Math.max(amount - 600, amount * .05) * 3)
  }
  const { result, row } = at('char_297_hamoni', 2, { storedChargeCount: 3, harmoniePhase: 'VOLLEY', targetBlocked: false }, 40)
  close(row.perAttack, result.stats.attack * 1.17 * 4 * .6)
  const water = at('char_297_hamoni', 2, { storedChargeCount: 3, harmoniePhase: 'WATER', targetBlocked: true, actualAttackTargetCount: 3 }, 40)
  close(water.row.perAttack, 0)
  close(water.row.damageOverTimeDps, 250 * .6)
  close(water.row.allTargetsCombinedDps, 250 * .6 * 3)
})

test('インディゴは発射時バインド前の1斉射と現在バインド中の毎秒ダメージを混ぜない', () => {
  const s1 = at('char_469_indigo', 1, { storedChargeCount: 3 }, 40)
  close(s1.row.perAttack, s1.result.stats.attack * .5 * 4 * .6)
  assert.equal(s1.result.attackInterval, null)
  const shot = at('char_469_indigo', 2, { storedChargeCount: 3, indigoPhase: 'VOLLEY' }, 40)
  close(shot.row.perAttack, shot.result.stats.attack * 4 * .6)
  assert.equal(shot.row.damageOverTimeDps, null)
  const dot = at('char_469_indigo', 2, { storedChargeCount: 3, indigoPhase: 'BIND', actualAttackTargetCount: 3 }, 40)
  close(dot.row.perAttack, 0)
  close(dot.row.damageOverTimeDps, dot.result.stats.attack * .2 / .5 * .6)
  assert.equal(dot.row.attackComponents?.length, 0)
})

test('インディゴS2の毎秒2回の継続ダメージは各回に防御と最低ダメージを適用する', () => {
  for (const type of ['ARTS', 'PHYSICAL'] as const) for (const defense of [0, 100, 300, 1000]) {
    const result = output('char_469_indigo', 2,
      { storedChargeCount: 3, indigoPhase: 'BIND', actualAttackTargetCount: 3 }, undefined,
      { virtualMainAttackType: type, enemy: { defense, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const tickAttack = result.stats.attack * .2
    const tickDamage = type === 'ARTS' ? tickAttack * .6 : Math.max(tickAttack - defense, tickAttack * .05)
    close(result.rows[0].damageOverTimeDps, tickDamage / .5)
    close(result.rows[0].allTargetsCombinedDps, tickDamage / .5 * 3)
    close(result.rows[0].perAttack, 0)
    if (type === 'PHYSICAL' && defense === 1000) close(result.rows[0].damageOverTimeDps, tickAttack * .05 * 2)
  }
})

test('未確認の貯蔵数と変更された特性・素質・スキル原文を拒否する', () => {
  for (const id of mystics) {
    for (const count of [-1, .5, 4]) assert.equal(output(id, 1, { storedChargeCount: count }).rows.length, 0)
    const trait = output(id, 1, {}, skill => { skill.operatorProfile.trait!.candidates![0].blackboard![0].value = 4 })
    assert.equal(trait.rows.length, 0)
    const skillChanged = output(id, 1, {}, skill => { skill.skillLevels[9].description += ' 未確認' })
    assert.equal(skillChanged.rows.length, 0)
    const talentChanged = output(id, 1, {}, skill => {
      for (const candidate of skill.operatorProfile.talents![0].candidates!) candidate.description += ' 未確認'
    })
    assert.equal(talentChanged.rows.length, 0)
  }
})


test('共通特性は未指定・範囲外の貯蔵数を拒否し、スキル動作に通常貯蔵を展開しない', () => {
  const skill = record('char_338_iris', 1), structure = buildTraitStructures([skill])[0]
  for (const count of [undefined, -1, .1, 4, NaN, Infinity]) {
    assert.ok(evaluateTraitStructure(structure, { kind: 'NORMAL', metrics: { storedChargeCount: count } }).blockers.length)
  }
  for (const kind of ['SKILL_ACTION', 'NEXT_ATTACK', 'COUNTER'] as const) {
    const result = evaluateTraitStructure(structure, { kind, metrics: {} })
    assert.equal(result.storedChargeCount, undefined)
    assert.deepEqual(result.blockers, [])
  }
  const stage = { id: 'test', label: 'test', kind: 'NORMAL' as const, actions: [
    { label: 'main', role: 'MAIN' as const, damageType: 'ARTS' as const, scale: .5 },
    { label: 'extra', role: 'ADDITIONAL' as const, damageType: 'ARTS' as const, scale: .15 },
    { label: 'dot', role: 'MAIN' as const, damageType: 'ARTS' as const, basis: 'ATK_STAT' as const, timing: 'PER_SECOND' as const, scale: .1 },
  ] }
  const result = evaluateGuardTraits(skill, stage, { storedChargeCount: 3 }, new Map(), { phaseIndex: 2, operatorLevel: 80 })
  assert.deepEqual(result.evaluation.blockers, [])
  assert.equal(result.actions.length, 4)
  assert.deepEqual(result.actions.filter(action => action.isStoredCharge).map(action => [action.role, action.hits, action.scale]), [['MAIN', 3, .5]])
})

test('共通貯蔵素質の負倍率・非整数追加数を拒否し、スキル動作では無関係として評価する', () => {
  const original = buildExpandedTalentStructures([record('char_338_iris', 1)])[0]
  function apply(value: number, extra: boolean, kind = 'NORMAL') {
    const output: GuardPassiveModifiers = { attackRatio: 0, attackFlat: 0, attackScale: 1, attackSpeed: 0, damageScale: 1,
      defenseIgnoreRatio: 0, defenseIgnoreFixed: 0, resistanceIgnoreFixed: 0, resistanceIgnoreRatio: 0, defenseReductionRatio: 0,
      critChance: 0, critScale: 1, additionalActions: [], evaluations: [], blockers: [], notes: [] }
    const structure = { ...original, effects: [{ ...original.effects[0], value,
      ...(extra ? { item: 'EXTRA_STORED_CHARGES', operation: 'ADD_VALUE', unit: 'POINT' } : {}) }] } as TalentStructure
    applyGuardTalentStructure(output, structure, { actionKind: kind })
    return output
  }
  assert.equal(apply(1.3, false).storedChargeScale, 1.3)
  assert.equal(apply(1, true).extraStoredCharges, 1)
  assert.ok(apply(-1, false).blockers.length)
  assert.ok(apply(.5, true).blockers.length)
  assert.ok(apply(-1, true).blockers.length)
  for (const extra of [false, true]) {
    const result = apply(2, extra, 'SKILL_ACTION')
    assert.deepEqual(result.blockers, [])
    assert.equal(result.storedChargeScale, undefined)
    assert.equal(result.extraStoredCharges, undefined)
    assert.equal(result.evaluations[0].status, 'NOT_RELEVANT')
  }
})
