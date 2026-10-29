import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SkillRecord } from '../src/types/skill.ts'
import { buildTraitStructures, type TraitStructure, type TraitStructureEffect } from '../src/lib/traitStructure.ts'
import { evaluateTraitStructure, type TraitCombatContext } from '../src/lib/traitCombatEvaluation.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/traitStructureGuardJobs.json', import.meta.url), 'utf8'))
const structures = buildTraitStructures(fixture.rows as SkillRecord[])
const defaults: TraitCombatContext = { kind: 'NORMAL', metrics: {
  'source.skillActive': true, 'source.blockCount': 3, 'attack.targetCount': 1,
  'attack.distanceType': 'MELEE', 'target.blockedBySource': false, 'target.inFrontalTiles': true,
  traitChargePercent: 100,
} }
function structure(job: string): TraitStructure {
  const result = structures.find(entry => entry.basicInfo.subProfessionId === job)
  assert.ok(result, job)
  return result
}
function evaluate(job: string, context: Partial<TraitCombatContext> = {}) {
  return evaluateTraitStructure(structure(job), { ...defaults, ...context,
    metrics: { ...defaults.metrics, ...context.metrics } })
}
function replace(job: string, item: TraitStructureEffect['item'], mutate: (effect: TraitStructureEffect) => TraitStructureEffect) {
  const original = structure(job)
  return { ...original, effects: original.effects.map(effect => effect.item === item ? mutate(effect) : effect) }
}

test('構造化された術攻撃・ヒット数を評価し、構造の値を変えると計算用の値も変わる', () => {
  assert.equal(evaluate('artsfghter').damageType, 'ARTS')
  const physical = replace('artsfghter', 'DAMAGE_TYPE', effect => effect.item === 'DAMAGE_TYPE'
    ? { ...effect, value: 'PHYSICAL' } : effect)
  assert.equal(evaluateTraitStructure(physical, defaults).damageType, 'PHYSICAL')
  assert.equal(evaluate('sword').hitCount, 2)
  const triple = replace('sword', 'HIT_COUNT', effect => effect.item === 'HIT_COUNT' ? { ...effect, value: 3 } : effect)
  assert.equal(evaluateTraitStructure(triple, defaults).hitCount, 3)
})

test('同時攻撃対象数は構造の基本ステータス参照を解決する', () => {
  assert.equal(evaluate('centurion').maxTargets, 3)
  assert.equal(evaluate('centurion', { metrics: { 'source.blockCount': 2 } }).maxTargets, 2)
  assert.ok(evaluate('crusher', { metrics: { 'source.blockCount': undefined } }).blockers.length)
  assert.ok(evaluate('crusher', { metrics: { 'source.blockCount': 1.5 } }).blockers.length)
  assert.equal(evaluate('fearless').maxTargets, undefined, 'ブロック数の基本値を攻撃対象数や加算値に流用しない')
})

test('遠距離倍率は構造の値・条件を使い、反撃にも条件が一致すれば適用する', () => {
  assert.equal(evaluate('lord').attackScale, 1)
  assert.equal(evaluate('lord', { metrics: { 'attack.distanceType': 'RANGED' } }).attackScale, 0.8)
  assert.equal(evaluate('lord', { kind: 'COUNTER', metrics: { 'attack.distanceType': 'RANGED' } }).attackScale, 0.8)
  const changed = replace('lord', 'ATTACK_SCALE', effect => effect.item === 'ATTACK_SCALE' ? { ...effect, value: 0.7 } : effect)
  const output = evaluateTraitStructure(changed, { ...defaults, metrics: { ...defaults.metrics, 'attack.distanceType': 'RANGED' } })
  assert.equal(output.attackScale, 0.7)
  assert.ok(evaluate('lord', { metrics: { 'attack.distanceType': undefined } }).blockers.length)
})

test('教官の条件と倍率も共通の条件評価で計算する', () => {
  assert.equal(evaluate('instructor').attackScale, 1.2)
  const blocked = evaluate('instructor', { metrics: { 'target.blockedBySource': true } })
  assert.equal(blocked.attackScale, 1)
  assert.equal(blocked.evaluations.find(row => row.effectId === 'unblocked-by-source-scale')?.status, 'CONDITION_FALSE')
})

test('スキルによる上書き・無効化は特性を再適用しない', () => {
  assert.equal(evaluate('sword', { overriddenItems: ['HIT_COUNT'] }).hitCount, undefined)
  assert.equal(evaluate('sword', { kind: 'SKILL_ACTION' }).hitCount, undefined)
  assert.equal(evaluate('sword', { kind: 'COUNTER' }).hitCount, undefined)
  assert.equal(evaluate('sword', { kind: 'NEXT_ATTACK' }).hitCount, 2)
  assert.equal(evaluate('artsfghter', { overriddenItems: ['DAMAGE_TYPE'] }).damageType, undefined)
  assert.equal(evaluate('centurion', { overriddenItems: ['MAX_TARGETS'] }).maxTargets, undefined)
  const lord = evaluate('lord', { metrics: { 'attack.distanceType': 'RANGED' }, disabledEffectIds: ['ranged-attack-scale'] })
  assert.equal(lord.attackScale, 1)
  assert.equal(lord.evaluations.find(row => row.effectId === 'ranged-attack-scale')?.status, 'NOT_RELEVANT')
})

test('範囲攻撃は入力した対象数で計算し、回復回数の上限を流用しない', () => {
  const output = evaluate('reaper', { metrics: { 'attack.targetCount': 5, 'source.blockCount': 2 } })
  assert.equal(output.maxTargets, null)
  assert.equal(output.damageType, 'PHYSICAL')
  assert.deepEqual(output.blockers, [])
  assert.match(output.evaluations.find(row => row.effectId === 'area-attack-targets')!.value, /5体/)
  assert.ok(evaluate('reaper', { metrics: { 'attack.targetCount': undefined } }).blockers.length)
  assert.equal(evaluate('reaper', { kind: 'SKILL_ACTION' }).maxTargets, undefined)
})

test('周囲へのダメージ倍率を構造から取得する', () => {
  assert.equal(evaluate('hammer').splashScale, 0.5)
  assert.equal(evaluate('hammer').evaluations.find(row => row.effectId === 'surrounding-splash')?.status, 'CONDITION_FALSE')
  assert.equal(evaluate('hammer', { metrics: { 'attack.targetCount': 2 } }).evaluations
    .find(row => row.effectId === 'surrounding-splash')?.status, 'APPLIED')
  const changed = replace('hammer', 'SPLASH_DAMAGE', effect => effect.item === 'SPLASH_DAMAGE'
    ? { ...effect, value: { ...effect.value, attackScale: 0.75 } } : effect)
  assert.equal(evaluateTraitStructure(changed, defaults).splashScale, 0.75)
  assert.equal(evaluate('hammer', { kind: 'SKILL_ACTION' }).splashScale, undefined)
})

test('解放者は構造の上限と指定した蓄積率を使い、経過時間の曲線を仮定しない', () => {
  const charged = evaluate('librator', { metrics: { traitChargePercent: 50 }, attackRatioScale: 1.5 })
  assert.equal(charged.attackRatio, 1.5)
  assert.deepEqual(charged.blockers, [])
  const changed = replace('librator', 'ATK_BUFF_RATIO', effect => effect.operation === 'INCREASE_TO_CAP'
    ? { ...effect, value: { ...effect.value, maxRatio: 4, secondsToCap: 99 } } : effect)
  assert.equal(evaluateTraitStructure(changed, defaults).attackRatio, 4)
  for (const charge of [-1, 101, NaN, undefined]) assert.ok(evaluate('librator', { metrics: { traitChargePercent: charge } }).blockers.length)
  assert.ok(evaluate('librator', { attackRatioScale: -1 }).blockers.length)
})

test('通常攻撃停止中の条件では通常攻撃の結果を出さない', () => {
  assert.ok(evaluate('librator', { metrics: { 'source.skillActive': false } }).blockers.some(reason => reason.includes('通常攻撃を行いません')))
})

test('不明な数値・発動条件・確率や重複効果は未適用のまま通さない', () => {
  const unknown = replace('sword', 'HIT_COUNT', effect => effect.item === 'HIT_COUNT' ? { ...effect, value: null } : effect)
  assert.ok(evaluateTraitStructure(unknown, defaults).blockers.length)
  const random = replace('sword', 'HIT_COUNT', effect => ({ ...effect, probability: { chance: 0.5, rollScope: 'APPLICATION' } }))
  assert.ok(evaluateTraitStructure(random, defaults).blockers.length)
  const original = structure('sword')
  assert.ok(evaluateTraitStructure({ ...original, effects: [...original.effects, ...original.effects] }, defaults).blockers.length)
  assert.ok(evaluateTraitStructure({ ...original, status: 'UNREVIEWED' }, defaults).blockers.length)
})

test('ダメージに関わらない回復・基本ステータスは追加補正せず、未構造化職分の対応を捏造しない', () => {
  const musha = evaluate('musha')
  assert.equal(musha.attackScale, 1)
  assert.equal(musha.attackRatio, 0)
  assert.ok(musha.evaluations.every(row => row.status === 'NOT_RELEVANT'))
  const absent = evaluateTraitStructure(null, defaults)
  assert.deepEqual(absent, { attackScale: 1, attackRatio: 0, evaluations: [], blockers: [] })
  for (const entry of structures.filter(entry => entry.status !== 'UNREVIEWED'))
    assert.deepEqual(evaluateTraitStructure(entry, defaults).blockers, [], entry.basicInfo.operatorName)
})
