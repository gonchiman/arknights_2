import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SkillRecord } from '../src/types/skill.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { applyGuardTalentStructure } from '../src/lib/guardTalentEvaluation.ts'
import { buildTalentStructures, type TalentStructure } from '../src/lib/talentStructure.ts'
import type { GuardPassiveModifiers } from '../src/lib/guardCombatTypes.ts'
import { formatCombatTiming } from '../src/lib/combatEffectStructure.ts'
import { guardConditionMatches, resolveGuardValue } from '../src/lib/guardCombatValues.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { findSkillStructure, getSkillStructureEffectValueRows } from '../src/lib/skillStructure.ts'
import { buildSkillEffectFlow } from '../src/lib/skillEffectFlow.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedElementalSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
const ids = { cello: 'char_245_cello', yu: 'char_2026_yu', cairn: 'char_4214_cairn', christ: 'char_4198_christ', mantra: 'char_4204_mantra', blaze: 'char_1040_blaze2', bobb: 'char_487_bobb', nymph: 'char_4146_nymph' }
function input(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}): DamageCalculatorThreeInput {
  const source = sources.find(source => source.operatorId === id)!, skill = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(skill.raw)
  const record: SkillRecord = { id: `${id}/${index}`, operatorId: id, operatorName: source.operatorName, skillId: skill.skillId,
    skillIndex: index, skillName: raw.name!, profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(source.profile) }
  return { operator: record, skill: record, phaseIndex: source.phaseIndex, operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!,
    trust: 100, skillLevelIndex: source.skillLevelIndex, conditions: { guard }, enemy: { defense: 500, resistance: 60 }, ...options }
}
function output(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput(input(id, index, guard, options))
}
function one(id: string, index: number, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  const result = output(id, index, guard, options)
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}
const close = (actual: number | null | undefined, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
const total = (row: ReturnType<typeof one>['row']) => (row.elementalBuildups ?? []).reduce((sum, item) => sum + item.perApplication, 0)
const arts = (a: number, r = 60) => a * Math.max(0.05, 1 - r / 100)
const physical = (a: number, d = 500) => Math.max(a * 0.05, a - d)

const additions = [[ids.cello, 1], [ids.cello, 2], [ids.cello, 3], [ids.yu, 1], [ids.yu, 2], [ids.yu, 3],
  [ids.cairn, 1], [ids.cairn, 2], [ids.christ, 1], [ids.christ, 2], [ids.mantra, 1], [ids.blaze, 3],
  [ids.bobb, 1], [ids.bobb, 2], [ids.nymph, 1], [ids.nymph, 3], [ids.nymph, 2],
  [ids.mantra, 2], [ids.mantra, 3], [ids.blaze, 1], [ids.blaze, 2]] as const
test('21技能の初期条件と全イベントは計算でき、1回の値からDPSや期間総量を推定しない', () => {
  for (const [id, index] of additions) {
    const { result, row } = one(id, index)
    assert.ok(row.perAttack > 0 || total(row) > 0, `${id} S${index}`)
    const choices = result.guard!.inputs.find(input => input.key === 'elementalEvent')!.options!
    for (const option of choices) {
      const guard = { elementalEvent: option.value, ...(option.value === 'BURST_EVENT' ? { targetElementalBurst: 'BURN' } : {}),
        ...(id === ids.nymph && ['TALENT_TICK', 'EMPOWERED_TICK', 'ATTACK_NECROSIS'].includes(String(option.value)) ? { targetElementalBurst: 'NECROSIS' } : {}) }
      const current = one(id, index, guard)
      assert.equal(current.row.dps, null)
      assert.equal(current.row.combinedDps, null)
      assert.equal(current.result.canShowDps, false)
      assert.ok(current.result.structure!.guardRecipe!.stages.every(stage => stage.periodTotal?.kind === 'UNSUPPORTED'))
    }
    assert.ok(['SUPPORTED', 'CONDITIONAL'].includes(buildDamageCalculatorThreeCoverage([input(id, index).skill])[0].status))
  }
})

test('ヴィルトゥオーサはS1/S2の1.2倍・S3の1.5倍を蓄積だけへ適用、周期を攻撃に足さない', () => {
  const s1 = one(ids.cello, 1).row
  close(s1.perAttack, arts(525 * 3)); close(total(s1), 525 * 1.1 * 1.2)
  for (const resistance of [0, 50, 100]) {
    const tick = one(ids.cello, 1, { elementalEvent: 'TALENT_TICK', elementalBuildupResistance: resistance }).row
    close(tick.perAttack, 0); close(total(tick), 525 * 0.1 * 1.2 * (1 - resistance / 100))
    const s3 = one(ids.cello, 3, { actualAttackTargetCount: 3, elementalBuildupResistance: resistance })
    close(s3.result.effectiveAttack, 1470); close(total(s3.row), 1470 * 0.1 * 1.5 * (1 - resistance / 100))
    close(s3.row.elementalBuildups![0].allTargetsPerApplication, total(s3.row) * 3)
  }
  const s2 = one(ids.cello, 2, { actualAttackTargetCount: 2 }).row
  close(s2.perAttack, arts(525)); close(total(s2), 525 * 0.25 * 1.2); close(s2.allTargetsPerAttack, s2.perAttack * 2)
  const ally = one(ids.cello, 2, { elementalEvent: 'ALLY_DAMAGE' }).row
  close(ally.perAttack, 0); close(total(ally), total(s2))
  // An active non-necrosis burst can be attacked, but suppresses all buildup.
  close(one(ids.cello, 1, { targetElementalBurst: 'BURN' }).row.perAttack, arts(525 * 3, 40))
  assert.equal(output(ids.cello, 1, { targetElementalBurst: 'NECROSIS' }).rows.length, 0)
  close(total(one(ids.cello, 1, { targetElementalBurst: 'NECROSIS', elementalEvent: 'TALENT_TICK' }).row), 0)
  const virtual = one(ids.cello, 1, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(525 * 3)); close(total(virtual), total(s1))
  assert.equal(output(ids.cello, 1, { elementalGaugeRemaining: 693 }).rows.length, 0)
})

test('ユーの通常攻撃・ブロック周期・被攻撃・炎の壁は別イベントで、発動時範囲術は強化後ATK', () => {
  for (const [index, attack] of [[1, 715], [2, 2788], [3, 1501]] as const) {
    const normal = one(ids.yu, index, { elementalEvent: 'ATTACK' }).row
    close(normal.perAttack, index === 2 ? arts(attack) : physical(attack)); close(total(normal), 0)
    const tick = one(ids.yu, index, { elementalEvent: 'TALENT_TICK', actualAttackTargetCount: index === 2 ? 5 : 3 }).row
    close(tick.perAttack, arts(attack * 0.4)); close(total(tick), attack * 0.12)
    close(tick.allTargetsPerAttack, tick.perAttack * (index === 2 ? 5 : 3))
    close(tick.elementalBuildups![0].allTargetsPerApplication, total(tick) * (index === 2 ? 5 : 3))
  }
  close(total(one(ids.yu, 1).row), 715 * 0.5)
  close(total(one(ids.yu, 3).row), 1501 * 0.1)
  const initial = one(ids.yu, 2, { elementalEvent: 'START', actualAttackTargetCount: 4 }).row
  close(initial.perAttack, arts(2788)); close(initial.allTargetsPerAttack, arts(2788) * 4)
  close(total(one(ids.yu, 2, { elementalEvent: 'TALENT_TICK', targetElementalBurst: 'BURN' }).row), 0)
  assert.equal(output(ids.yu, 1, { elementalEvent: 'TALENT_TICK' }, { virtualMainAttackType: 'PHYSICAL' }).rows.length, 0)
})

test('ケルンは素質9%とスキル10%を異なる時計で評価し、8マスの術80%へ防御を適用しない', () => {
  for (const index of [1, 2]) {
    const tick = one(ids.cairn, index, { elementalEvent: 'TALENT_TICK' }).row
    close(tick.perAttack, 0); close(total(tick), 606 * 0.09)
    close(one(ids.cairn, index, { elementalEvent: 'ATTACK' }).row.perAttack, 106)
  }
  const area = one(ids.cairn, 2, { actualAttackTargetCount: 4 }).row
  close(area.perAttack, arts(606 * 0.8)); close(total(area), 60.6)
  close(area.allTargetsPerAttack, area.perAttack * 4)
  const virtual = one(ids.cairn, 2, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(606 * 0.8)); close(total(virtual), 60.6)
})

test('ミス・クリスティーンの神経損傷15%、霊体115%と麻痺中断120%は独立したイベント', () => {
  const attack = one(ids.christ, 1, { actualAttackTargetCount: 2 }).row
  close(attack.perAttack, arts(960)); close(total(attack), arts(960) * 0.15)
  const physicalAttack = one(ids.christ, 1, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(physicalAttack.perAttack, physical(960)); close(total(physicalAttack), 0)
  for (const state of ['NONE', 'NEURAL']) {
    const tick = one(ids.christ, 2, { targetElementalBurst: state, enemyElementalResistance: 40 }).row
    close(tick.perAttack, arts(640 * 1.15) + (state === 'NEURAL' ? 640 * 1.15 * 0.6 : 0))
    assert.equal(tick.attackComponents.filter(item => item.expectedDamage > 0).length, state === 'NEURAL' ? 2 : 1)
  }
  for (const [index, attack] of [[1, 960], [2, 640]] as const) {
    const event = one(ids.christ, index, { elementalEvent: 'PALSY_TRIGGER', enemyElementalResistance: 30 }).row
    close(event.perAttack, attack * 1.2 * 0.7); close(total(event), 0)
    assert.ok(event.attackComponents.every(component => component.role === 'ADDITIONAL'))
  }
})

test('マントラS1の325%攻撃・与ダメージ30%・追加元素200%と確定麻痺中断135%を分離', () => {
  const attack = one(ids.mantra, 1).row
  close(attack.perAttack, arts(755 * 3.25)); close(total(attack), attack.perAttack * 0.3)
  const burst = one(ids.mantra, 1, { targetElementalBurst: 'NEURAL', enemyElementalResistance: 50 }).row
  close(burst.perAttack, arts(755 * 3.25) + 755); close(total(burst), 0)
  const event = one(ids.mantra, 1, { elementalEvent: 'PALSY_TRIGGER', enemyElementalResistance: 50 }).row
  close(event.perAttack, 755 * 1.35 * 0.5)
  assert.equal(event.attackComponents[0].expectedHitCount, 1)
  const virtual = one(ids.mantra, 1, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(755 * 3.25)); close(total(virtual), virtual.perAttack * 0.3)
})

test('熾炎ブレイズS3はスキル中ATK、爆発中追加80%と爆発開始350%を重複させない', () => {
  const attack = 1616
  close(one(ids.blaze, 3).row.perAttack, arts(attack))
  const burning = one(ids.blaze, 3, { targetElementalBurst: 'BURN', enemyElementalResistance: 50 }).row
  close(burning.perAttack, arts(attack, 40) + attack * 0.8 * 0.5)
  const event = one(ids.blaze, 3, { elementalEvent: 'BURST_EVENT', targetElementalBurst: 'BURN', enemyElementalResistance: 50 }).row
  close(event.perAttack, attack * 3.5 * 0.5); assert.equal(event.attackComponents.length, 1)
  for (const conditions of [{ blazeState: 'DOWN' }, { remainingAmmo: 0 }, { elementalEvent: 'BURST_EVENT' }])
    assert.equal(output(ids.blaze, 3, conditions).rows.length, 0)
  const virtual = one(ids.blaze, 3, { targetElementalBurst: 'BURN', enemyElementalResistance: 50 }, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(attack) + attack * 0.8 * 0.5)
})

test('ボビングは初回だけ即時16%を加え、後続周期を5回または6回の総量にしない', () => {
  const attack = 486
  for (const [index, damageScale, buildupScale] of [[1, 2, 1.2], [2, 1.4, 0.2]] as const) {
    for (const first of [true, false]) for (const resistance of [0, 40, 100]) {
      const current = one(ids.bobb, index, { bobbTargetHistory: first ? 'FIRST' : 'REPEAT', elementalBuildupResistance: resistance }).row
      close(current.perAttack, arts(attack * damageScale))
      close(total(current), attack * (buildupScale + (first ? 0.16 : 0)) * (1 - resistance / 100))
    }
    const tick = one(ids.bobb, index, { elementalEvent: 'TALENT_TICK' }).row
    close(tick.perAttack, 0); close(total(tick), attack * 0.16)
    const active = one(ids.bobb, index, { targetElementalBurst: 'BURN' }).row
    close(active.perAttack, arts(attack * damageScale, 40)); close(total(active), 0)
    // Skill-only buildup fits, but the immediate first talent tick crosses.
    const remaining = attack * (buildupScale + 0.08)
    assert.equal(output(ids.bobb, index, { elementalGaugeRemaining: remaining }).rows.length, 0)
    assert.ok(output(ids.bobb, index, { elementalGaugeRemaining: remaining, bobbTargetHistory: 'REPEAT' }).rows.length)
    const virtual = one(ids.bobb, index, {}, { virtualMainAttackType: 'PHYSICAL' }).row
    close(virtual.perAttack, physical(attack * damageScale)); close(total(virtual), attack * (buildupScale + 0.16))
  }
  const changed = input(ids.bobb, 1)
  for (const candidate of changed.operator.operatorProfile.talents![0].candidates ?? []) for (const entry of candidate.blackboard ?? [])
    if (entry.key === 'attack@ep_damage_ratio_talent') entry.value = 0.18
  assert.equal(buildDamageCalculatorThreeOutput(changed).rows.length, 0)
})

test('ニンフのATK累積はスキル加算と合成、主攻撃・追加元素・素質の元素周期を分ける', () => {
  for (const stacks of [0, 10]) {
    const a1 = Math.floor(745 * (1 + 1.1 + stacks * 0.02)), a3 = Math.floor(745 * (1 + 2.2 + stacks * 0.02))
    const skill1 = one(ids.nymph, 1, { nymphNecrosisStacks: stacks }).row
    close(skill1.perAttack, arts(a1)); close(total(skill1), arts(a1) * 0.15)
    const burst = one(ids.nymph, 1, { nymphNecrosisStacks: stacks, targetElementalBurst: 'NECROSIS', enemyElementalResistance: 50 }).row
    close(burst.perAttack, arts(a1) + a1 * 0.5 * 0.5); close(total(burst), 0)
    assert.equal(burst.attackComponents[0].damageType, 'ELEMENTAL')
    const skill3 = one(ids.nymph, 3, { nymphNecrosisStacks: stacks, actualAttackTargetCount: 2 }).row
    close(skill3.perAttack, arts(a3)); close(skill3.allTargetsPerAttack, arts(a3) * 2)
    const pure = one(ids.nymph, 3, { nymphNecrosisStacks: stacks, elementalEvent: 'ATTACK_NECROSIS', targetElementalBurst: 'NECROSIS', enemyElementalResistance: 50 }).row
    close(pure.perAttack, a3 * 0.5); assert.equal(pure.attackComponents.length, 1)
    for (const [index, attack] of [[1, a1], [3, a3]] as const) {
      const tick = one(ids.nymph, index, { nymphNecrosisStacks: stacks, elementalEvent: 'TALENT_TICK', targetElementalBurst: 'NECROSIS', enemyElementalResistance: 50 }).row
      close(tick.perAttack, attack * 0.4 * 0.5); assert.equal(tick.attackComponents.length, 1)
      assert.equal(output(ids.nymph, index, { elementalEvent: 'TALENT_TICK' }).rows.length, 0)
    }
    const virtual = one(ids.nymph, 3, { nymphNecrosisStacks: stacks, elementalEvent: 'ATTACK_NECROSIS', targetElementalBurst: 'NECROSIS' }, { virtualMainAttackType: 'ARTS' }).row
    close(virtual.perAttack, arts(a3))
  }
  assert.equal(output(ids.nymph, 3, { targetElementalBurst: 'NECROSIS' }).rows.length, 0)
  assert.equal(output(ids.nymph, 3, { elementalEvent: 'ATTACK_NECROSIS' }).rows.length, 0)
  assert.equal(output(ids.nymph, 1, { nymphNecrosisStacks: 11 }).rows.length, 0)
  for (const state of ['BURN', 'NEURAL', 'CORROSION']) {
    const row = one(ids.nymph, 3, { targetElementalBurst: state, previousCorrosionBursts: state === 'CORROSION' ? 1 : 0 }).row
    close(row.perAttack, arts(2384, state === 'BURN' ? 40 : 60))
  }
})

test('NE条件は文字列・真偽・数値の不一致を判定し、未知の入力は一致扱いしない', () => {
  for (const [actual, expected, result] of [['NONE', 'NECROSIS', true], ['NECROSIS', 'NECROSIS', false],
    [true, false, true], [2, 2, false], [3, 2, true]] as const) {
    const condition = { input: 'state', comparison: 'NE' as const, value: expected }
    assert.equal(guardConditionMatches(condition, { state: actual }), result)
    assert.equal(resolveGuardValue({ ...condition, op: 'if', yes: 10, no: 20 }, new Map(), { state: actual }), result ? 10 : 20)
  }
  assert.throws(() => guardConditionMatches({ input: 'state', comparison: 'NE', value: 'NECROSIS' }, {}))
})

test('マントラS2は主240%・跳躍120%を別対象として計算、S3は溢れ1層と麻痺中断を混ぜない', () => {
  for (const [event, scale, targets] of [['PRIMARY', 2.4, 1], ['BOUNCE', 1.2, 3]] as const) {
    const hit = one(ids.mantra, 2, { elementalEvent: event, actualAttackTargetCount: targets }).row
    close(hit.perAttack, arts(755 * scale)); close(total(hit), hit.perAttack * 0.18)
    close(hit.allTargetsPerAttack, hit.perAttack * targets)
    close(hit.elementalBuildups![0].allTargetsPerApplication, total(hit) * targets)
    const burst = one(ids.mantra, 2, { elementalEvent: event, targetElementalBurst: 'NEURAL', enemyElementalResistance: 20 }).row
    close(burst.perAttack, arts(755 * scale) + 755 * 0.25 * 0.8); close(total(burst), 0)
    assert.equal(output(ids.mantra, 2, { elementalEvent: event, elementalGaugeRemaining: arts(755 * scale) * 0.18 }).rows.length, 0)
  }
  const attack = 2831
  close(one(ids.mantra, 3).row.perAttack, arts(attack))
  const overflow = one(ids.mantra, 3, { elementalEvent: 'OVERFLOW', actualAttackTargetCount: 2, enemyElementalResistance: 50 }).row
  close(overflow.perAttack, attack * 1.85 * 0.5); close(overflow.allTargetsPerAttack, attack * 1.85)
  close(one(ids.mantra, 3, { elementalEvent: 'PALSY_TRIGGER', enemyElementalResistance: 50 }).row.perAttack, attack * 1.35 * 0.5)
})

test('ニンフS2は命中直前HPによる実減少量を参照し、初撃・遅延命中・通常/強化素質の周期を分離する', () => {
  for (const event of ['FIRST_HIT', 'AREA_HIT']) for (const hpBefore of [1, 100, 1192, 10000]) {
    const { row } = one(ids.nymph, 2, { elementalEvent: event, targetHpBeforeHit: hpBefore })
    close(row.perAttack, arts(745 * 4)); close(total(row), Math.min(hpBefore, arts(745 * 4)) * 0.25)
    assert.equal(row.elementalBuildups![0].basis, 'HP_LOST')
    close(row.elementalBuildups![0].remainingGaugeAfter, 1000 - total(row))
  }
  const weak = one(ids.nymph, 2, { elementalEvent: 'TALENT_TICK', targetElementalBurst: 'NECROSIS' }).row
  const strong = one(ids.nymph, 2, { elementalEvent: 'EMPOWERED_TICK', targetElementalBurst: 'NECROSIS' }).row
  close(weak.perAttack, 745 * 0.4); close(strong.perAttack, 745)
  assert.equal(output(ids.nymph, 2, { targetHpBeforeHit: 0 }).rows.length, 0)
  assert.equal(output(ids.nymph, 2, { targetHpSpecialState: 'OTHER' }).rows.length, 0)
  assert.equal(output(ids.nymph, 2, { elementalGaugeRemaining: 25, targetHpBeforeHit: 100 }).rows.length, 0)
  const virtual = one(ids.nymph, 2, { targetHpBeforeHit: 100 }, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(745 * 4)); close(total(virtual), 0)
})

test('熾炎ブレイズS1は付与時ATK固定、S2は現在ATK、実HP減少と攻撃前のHP消費を評価する', () => {
  for (const level of [1, 90]) for (const snapshot of [752, 1000]) {
    const aura = one(ids.blaze, 1, { appliedAuraAttack: snapshot, targetHpBeforeHit: 100 }, { operatorLevel: level }).row
    close(aura.perAttack, arts(snapshot * 0.7)); close(total(aura), 100 * 0.3)
  }
  close(one(ids.blaze, 1, { elementalEvent: 'ATTACK' }).row.perAttack, arts(752))
  close(one(ids.blaze, 1, { elementalEvent: 'BURST_EVENT', targetElementalBurst: 'BURN', enemyElementalResistance: 50 }).row.perAttack, 752 * 3.5 * 0.5)
  for (const hpBefore of [1, 100, 10000]) {
    const area = one(ids.blaze, 2, { targetHpBeforeHit: hpBefore, actualAttackTargetCount: 3 }).row
    close(area.perAttack, arts(1880 * 0.35)); close(total(area), Math.min(hpBefore, arts(1880 * 0.35)) * 0.3)
    close(area.allTargetsPerAttack, area.perAttack * 3)
  }
  const normal = one(ids.blaze, 2, { elementalEvent: 'ATTACK', selfHpBeforeAttackPercent: 5.1 }).row
  close(normal.perAttack, arts(1880)); close(total(normal), 0)
  for (const hp of [0.1, 5]) assert.equal(output(ids.blaze, 2, { elementalEvent: 'ATTACK', selfHpBeforeAttackPercent: hp }).rows.length, 0)
  for (const index of [1, 2]) {
    assert.equal(output(ids.blaze, index, { targetHpSpecialState: 'OTHER' }).rows.length, 0)
    assert.equal(output(ids.blaze, index, { blazeState: 'DOWN' }).rows.length, 0)
  }
})

test('HP_LOSTは単一確定命中だけに制限、FIXEDはATKに依存せず損傷耐性と境界を適用する', () => {
  const base = input(ids.nymph, 2), original = findSkillStructure({ operatorId: ids.nymph, skillId: base.skill.skillId, skillIndex: 2, levelIndex: 9 })!
  for (const change of ['multiple', 'probability', 'missingHp', 'missingAction']) {
    const changed = structuredClone(original), stage = changed.guardRecipe!.stages[0]
    if (change === 'multiple') stage.actions[0].hits = 2
    if (change === 'probability') stage.actions[0].probability = 0.5
    if (change === 'missingHp') (stage.elementalBuildups![0].basis as { hpBefore: number }).hpBefore = NaN
    if (change === 'missingAction') (stage.elementalBuildups![0].basis as { actionId: string }).actionId = 'unknown'
    assert.equal(buildGuardDamageOutput(base, changed).rows.length, 0, change)
  }
  for (const level of [1, 90]) for (const resistance of [0, 40, 100]) {
    const fixed = structuredClone(original), stage = fixed.guardRecipe!.stages[0]
    stage.elementalBuildups![0].basis = { type: 'FIXED' }; stage.elementalBuildups![0].scale = 70
    const current = input(ids.nymph, 2, { elementalBuildupResistance: resistance }, { operatorLevel: level })
    const result = buildGuardDamageOutput(current, fixed)
    assert.deepEqual(result.unsupportedReasons, []); close(total(result.rows[0]), 70 * (1 - resistance / 100))
  }
  const fixed = structuredClone(original), stage = fixed.guardRecipe!.stages[0]
  stage.elementalBuildups![0].basis = { type: 'FIXED' }; stage.elementalBuildups![0].scale = 70
  assert.equal(buildGuardDamageOutput(input(ids.nymph, 2, { elementalGaugeRemaining: 70 }), fixed).rows.length, 0)
  for (const invalid of [-1, NaN]) {
    stage.elementalBuildups![0].scale = invalid
    assert.equal(buildGuardDamageOutput(base, fixed).rows.length, 0)
  }
  const effect = original.effectStructure.stages[0].effects.find(effect => effect.item === 'ELEMENTAL_BUILDUP')!
  assert.ok(getSkillStructureEffectValueRows(effect).some(([label, value]) => label === '基準' && value === '実HP減少量'))
  const flow = buildSkillEffectFlow(original).stages[0].groups.flatMap(group => group.layers.flat())
  assert.ok(flow.some(step => step.fields.some(field => field.label === '基準' && field.value === '実HP減少量')))
})

test('有限周期・麻痺イベントは無条件・確率・攻撃倍率・秒レート・異なるscopeを拒否する', () => {
  const original = buildTalentStructures([input(ids.christ, 1).skill]).find(item => item.basicInfo.talentIndex === 0)!
  function evaluate(structure: TalentStructure, actionKind = 'SKILL_ACTION') {
    const modifiers: GuardPassiveModifiers = { attackRatio: 0, attackFlat: 0, attackScale: 1, attackSpeed: 0, damageScale: 1,
      defenseIgnoreRatio: 0, defenseIgnoreFixed: 0, resistanceIgnoreFixed: 0, resistanceIgnoreRatio: 0,
      defenseReductionRatio: 0, critChance: 0, critScale: 1, additionalActions: [], evaluations: [], blockers: [], notes: [] }
    applyGuardTalentStructure(modifiers, structure, { actionKind, elementalEvent: 'PALSY_TRIGGER' })
    return modifiers
  }
  assert.equal(evaluate(original).additionalActions.length, 1)
  for (const change of ['condition', 'basis', 'rate', 'probability', 'scope', 'lifetime']) {
    const mutated = structuredClone(original), effect = mutated.effects[0] as unknown as Record<string, unknown>
    if (change === 'condition') effect.condition = null
    if (change === 'basis') effect.basis = 'ATK'
    if (change === 'rate') effect.rate = 'PER_SECOND'
    if (change === 'probability') effect.probability = { chance: 0.5, rollScope: 'APPLICATION' }
    if (change === 'scope') effect.target = { ...effect.target as object, scope: 'DAMAGE_SOURCE' }
    if (change === 'lifetime') effect.lifetime = { type: 'WHILE_SOURCE_ACTIVE' }
    assert.ok(evaluate(mutated).blockers.length, change)
    assert.equal(evaluate(mutated).additionalActions.length, 0)
  }
  assert.ok(evaluate(original, 'NORMAL').blockers.length)
})

test('周期・麻痺イベントは意味のある表示名を持ち、ライブ素質・スキル差異を無視しない', () => {
  assert.equal(formatCombatTiming({ type: 'EVENT', event: 'PERIODIC_TICK' }), '周期効果1回時')
  assert.equal(formatCombatTiming({ type: 'EVENT', event: 'PALSY_TRIGGER' }), '麻痺による攻撃中断1回時')
  for (const [id, index] of additions) {
    const changed = input(id, index)
    changed.skill.skillLevels[9].description += '未確認'
    assert.equal(buildDamageCalculatorThreeOutput(changed).rows.length, 0)
    const missing = input(id, index)
    for (const talent of missing.operator.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) candidate.blackboard = []
    assert.equal(buildDamageCalculatorThreeOutput(missing).rows.length, 0)
  }
  const changedMultiplier = input(ids.cello, 1)
  for (const candidate of changedMultiplier.operator.operatorProfile.talents![1].candidates ?? [])
    for (const entry of candidate.blackboard ?? []) if (entry.key === 'ep_damage_scale') entry.value = 1.4
  assert.equal(buildDamageCalculatorThreeOutput(changedMultiplier).rows.length, 0)
})
