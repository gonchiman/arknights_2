import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SkillRecord } from '../src/types/skill.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { calculateElementalBuildup } from '../src/lib/elementalBuildup.ts'
import { findSkillStructure, getSkillStructureEffectValueRows } from '../src/lib/skillStructure.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { buildSkillEffectFlow } from '../src/lib/skillEffectFlow.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedElementalSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
const ids = { val: 'char_4102_threye', bot: 'char_4223_botany', philae: 'char_4148_philae', crack: 'char_4225_tanya',
  diam: 'char_499_kaitou', warmy: 'char_4081_warmy', grace: 'char_4187_graceb' }
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
const total = (row: ReturnType<typeof one>['row']) => row.elementalBuildups!.reduce((sum, item) => sum + item.perApplication, 0)
const arts = (a: number, r = 60) => a * Math.max(0.05, 1 - r / 100)
const physical = (a: number, d = 500) => Math.max(a * 0.05, a - d)
const additions = [[ids.val, 1], [ids.val, 2], [ids.bot, 1], [ids.bot, 2], [ids.philae, 2], [ids.crack, 2],
  [ids.diam, 1], [ids.warmy, 1], [ids.grace, 1]] as const

test('蓄積量はHPダメージ式とは独立し100%耐性では0、閾値一致と越境を拒否する', () => {
  const kind = { type: 'ELEMENTAL_BUILDUP', elementId: 'burn' } as const
  for (const resistance of [0, 30, 95, 100]) {
    const result = calculateElementalBuildup(600, kind, resistance, 1000, 'NONE', false)
    close(result.amount, 600 * (1 - resistance / 100))
    close(result.remaining, 1000 - result.amount)
  }
  for (const remaining of [0, 599, 600]) assert.throws(() => calculateElementalBuildup(600, kind, 0, remaining, 'NONE', false))
  for (const state of ['NECROSIS', 'BURN', 'NEURAL', 'CORROSION']) {
    const result = calculateElementalBuildup(600, kind, 0, 0, state, false)
    assert.equal(result.amount, 0); assert.equal(result.status, 'BURST_ACTIVE'); assert.equal(result.remaining, null)
  }
  assert.equal(calculateElementalBuildup(600, kind, 0, 100, 'NONE', true).status, 'IMMUNE')
  for (const resistance of [-1, 101, NaN, Infinity]) assert.throws(() => calculateElementalBuildup(600, kind, resistance, 1000, 'NONE', false))
  assert.throws(() => calculateElementalBuildup(600, { type: 'ELEMENTAL_DAMAGE', elementId: 'burn' } as never, 0, 1000, 'NONE', false))
  assert.throws(() => calculateElementalBuildup(600, { type: 'ELEMENTAL_BUILDUP', elementId: 'constructor' }, 0, 1000, 'NONE', false))
})

test('新規9技能は初期条件で計算可能、HPと蓄積を分離し期間総量を未対応とする', () => {
  for (const [id, index] of additions) {
    const { result, row } = one(id, index)
    assert.ok(total(row) > 0, `${id} S${index}`)
    close(row.perAttack, row.attackComponents.reduce((sum, component) => sum + component.expectedDamage, 0))
    assert.equal(row.dps, null)
    assert.equal(row.combinedDps, null)
    assert.equal(result.canShowDps, false)
    assert.ok(result.structure!.guardRecipe!.stages.every(stage => stage.periodTotal?.kind === 'UNSUPPORTED'))
    const coverage = buildDamageCalculatorThreeCoverage([input(id, index).skill])[0]
    assert.ok(['SUPPORTED', 'CONDITIONAL'].includes(coverage.status), `${id}: ${coverage.status}`)
  }
})

test('ヴァラルクビンはATK素質・ASPDと統合戦略30%を適用し、130%攻撃倍率を蓄積に掛けない', () => {
  for (const index of [1, 2]) for (const is4 of [false, true]) for (const resistance of [0, 25, 100]) {
    const { result, row } = one(ids.val, index, { inExplorersSilverfrost: is4, elementalBuildupResistance: resistance,
      actualAttackTargetCount: index === 2 ? 2 : 1 })
    close(result.effectiveAttack, 505)
    close(row.perAttack, arts(505 * (index === 1 ? 1.3 : 1)))
    close(total(row), 505 * ((index === 1 ? 0.8 : 0.35) + (is4 ? 0.3 : 0)) * (1 - resistance / 100))
    close(result.attackSpeed, index === 1 ? 106 : 156)
    close(row.elementalBuildups!.reduce((sum, item) => sum + item.allTargetsPerApplication, 0), total(row) * (index === 2 ? 2 : 1))
  }
  const exact = 505 * 0.8
  for (const remaining of [exact, exact - 1]) assert.equal(output(ids.val, 1, { elementalGaugeRemaining: remaining }).rows.length, 0)
  // The skill fits but the additive talent pushes the same target across the boundary.
  assert.equal(output(ids.val, 1, { inExplorersSilverfrost: true, elementalGaugeRemaining: 500 }).rows.length, 0)
  close(total(one(ids.val, 1, {}, { virtualMainAttackType: 'PHYSICAL' }).row), 404)
})

test('ボタニS1は全元素爆発なし・侵蝕ゲージ満タンだけ先行追加を適用、過去爆発は条件を失わせない', () => {
  for (const [kind, maximum] of [['NORMAL', 1000], ['BOSS', 2000]] as const) for (const full of [true, false]) {
    const { row } = one(ids.bot, 1, { botanyGaugeKind: kind, elementalGaugeRemaining: full ? maximum : maximum - 1 })
    close(row.perAttack, arts(501 * 1.1) + (full ? arts(501 * 0.5) : 0))
    close(total(row), 501 * (full ? 1.35 : 1))
    close(row.elementalBuildups![0].remainingGaugeAfter, (full ? maximum : maximum - 1) - (full ? 501 * 0.35 : 0))
    close(row.elementalBuildups![1].remainingGaugeAfter, (full ? maximum : maximum - 1) - 501 * (full ? 1.35 : 1))
    assert.equal(new Set(row.elementalBuildups!.map(item => item.label)).size, 2)
  }
  close(total(one(ids.bot, 1, { previousCorrosionBursts: 2 }).row), 501 * 1.35)
  for (const state of ['NECROSIS', 'BURN', 'NEURAL', 'CORROSION']) {
    const { row } = one(ids.bot, 1, { targetElementalBurst: state, previousCorrosionBursts: state === 'CORROSION' ? 1 : 0 })
    close(row.perAttack, arts(501 * 1.1, state === 'BURN' ? 40 : 60))
    close(total(row), 0)
    assert.ok(row.elementalBuildups!.every(item => item.status === 'BURST_ACTIVE'))
  }
  const native = one(ids.bot, 1).row, virtual = one(ids.bot, 1, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, arts(501 * 0.5) + physical(501 * 1.1))
  close(total(virtual), total(native))
  assert.equal(output(ids.bot, 1, { elementalGaugeRemaining: 1001 }).rows.length, 0)
  assert.equal(output(ids.bot, 1, { elementalGaugeRemaining: 501 }).rows.length, 0)
})

test('ボタニS2は追加物理・術本体・侵蝕を独立に評価し、永久防御低下と素質速度を適用する', () => {
  for (const stacks of [0, 3]) for (const previous of [0, 2]) {
    const { result, row } = one(ids.bot, 2, { corrosionBurstsInRange: stacks, previousCorrosionBursts: previous, actualAttackTargetCount: 2 })
    close(row.perAttack, arts(501) + physical(501 * 1.5, 500 - 120 * previous))
    close(total(row), 501 * 0.65)
    close(row.allTargetsPerAttack, row.perAttack * 2)
    close(result.attackSpeed, 100 + stacks * 6)
  }
  const virtual = one(ids.bot, 2, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(501) + physical(501 * 1.5))
  assert.equal(output(ids.bot, 2, { targetElementalBurst: 'CORROSION' }).rows.length, 0)
})

test('フィラエS2は発動可能な反撃だけを計算し、200%術と25%ATK壊死を混ぜない', () => {
  for (const received of [false, true]) {
    const { result, row } = one(ids.philae, 2, { selfElementalDamageReceived: received, actualAttackTargetCount: 3 })
    const attack = received ? 1286 : 643
    close(result.effectiveAttack, attack)
    close(row.perAttack, arts(attack * 2))
    close(total(row), attack * 0.25)
    close(row.elementalBuildups![0].allTargetsPerApplication, attack * 0.25 * 3)
    assert.equal(row.attackComponents.length, 1)
    assert.equal(result.attackInterval, null)
  }
  const virtual = one(ids.philae, 2, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(643 * 2))
  close(total(virtual), 643 * 0.25)
})

test('クラックボーンS2の被ダメージ時イベントはHP0と侵蝕221.2、通常攻撃を合算しない', () => {
  const { result, row } = one(ids.crack, 2, { actualAttackTargetCount: 4, crackboneStacks: 1 })
  close(row.perAttack, 0); close(total(row), 632 * 0.35)
  close(row.elementalBuildups![0].allTargetsPerApplication, 632 * 0.35 * 4)
  assert.equal(result.mainAttackType, null)
  assert.equal(output(ids.crack, 2, { crackboneStacks: 0 }).rows.length, 0)
  const normal = one(ids.crack, 2, { crackboneAction: 'ATTACK' }).row
  close(normal.perAttack, 132); assert.equal(normal.elementalBuildups, undefined)
})

test('ディアマンテS1は実際の術ダメージ15%を参照、元素耐性と損傷耐性を取り違えない', () => {
  for (const other of [false, true]) for (const resistance of [0, 25, 100]) {
    const attack = Math.floor(643 * (2.1 + (other ? 0.18 : 0)))
    const { row } = one(ids.diam, 1, { otherNecrosisBurstInRange: other, elementalBuildupResistance: resistance })
    close(row.perAttack, arts(attack)); close(total(row), arts(attack) * 0.15 * (1 - resistance / 100))
  }
  const burst = one(ids.diam, 1, { targetElementalBurst: 'NECROSIS', enemyElementalResistance: 40 }).row
  close(burst.perAttack, arts(1466) + 1466 * 0.5 * 0.6); close(total(burst), 0)
  assert.equal(burst.elementalBuildups![0].status, 'BURST_ACTIVE')
  const virtual = one(ids.diam, 1, {}, { virtualMainAttackType: 'PHYSICAL' }).row
  close(virtual.perAttack, physical(1350)); close(total(virtual), 0)
})

test('ウォーミーS1は術15%だけ蓄積し、外部爆発イベント300%を各攻撃に足さない', () => {
  const normal = one(ids.warmy, 1)
  close(normal.row.perAttack, arts(646)); close(total(normal.row), arts(646) * 0.15)
  close(normal.result.attackSpeed, 200)
  const burn = one(ids.warmy, 1, { targetElementalBurst: 'BURN' }).row
  close(burn.perAttack, arts(646, 40)); close(total(burn), 0)
  const event = one(ids.warmy, 1, { warmyPhase: 'BURST_EVENT', targetElementalBurst: 'BURN', enemyElementalResistance: 50 }).row
  close(event.perAttack, 646 * 3 * 0.5); assert.equal(event.elementalBuildups, undefined)
  assert.equal(output(ids.warmy, 1, { warmyPhase: 'BURST_EVENT' }).rows.length, 0)
  assert.equal(output(ids.warmy, 1, { elementalGaugeRemaining: arts(646) * 0.15 }).rows.length, 0)
})

test('グレースベアラーS1は各2命中の軽減後値10%、仮想属性でも与ダメージ参照を保持', () => {
  for (const defeated of [false, true]) for (const type of [undefined, 'ARTS'] as const) {
    const attack = defeated ? 1035 : 990
    const damage = 2 * (type ? arts(attack * 1.5) : physical(attack * 1.5))
    const { row } = one(ids.grace, 1, { neuralBurstEnemyDefeated: defeated }, { virtualMainAttackType: type })
    close(row.perAttack, damage); close(total(row), damage * 0.1)
  }
  assert.equal(output(ids.grace, 1, { elementalGaugeRemaining: 150 }).rows.length, 0)
  const immune = one(ids.grace, 1, { elementalGaugeRemaining: 1, targetElementalImmune: true }).row
  close(immune.perAttack, 1970); close(total(immune), 0)
  assert.equal(immune.elementalBuildups![0].status, 'IMMUNE')
})

test('不正な参照・確率命中・数値欠損は蓄積を0扱いにせず出力全体を停止する', () => {
  const base = input(ids.diam, 1), original = findSkillStructure({ operatorId: ids.diam, skillId: base.skill.skillId, skillIndex: 1, levelIndex: 9 })!
  for (const change of ['missing', 'duplicate', 'probability', 'periodic', 'kind']) {
    const structure = structuredClone(original), stage = structure.guardRecipe!.stages[0]
    if (change === 'missing') (stage.elementalBuildups![0].basis as { actionId: string }).actionId = 'unknown'
    if (change === 'duplicate') (stage.actions as unknown[]).push(structuredClone(stage.actions[0]))
    if (change === 'probability') stage.actions[0].probability = 0.5
    if (change === 'periodic') stage.actions[0].timing = 'PER_SECOND'
    if (change === 'kind') (stage.elementalBuildups![0].damageKind as { type: string }).type = 'ELEMENTAL_DAMAGE'
    assert.equal(buildGuardDamageOutput(base, structure).rows.length, 0, change)
  }
  for (const [id, index] of additions) {
    const altered = input(id, index)
    altered.skill.skillLevels[9].description += '未確認の変更'
    assert.equal(buildDamageCalculatorThreeOutput(altered).rows.length, 0)
    for (const invalid of [-1, 101, NaN]) assert.equal(output(id, index, { elementalBuildupResistance: invalid }).rows.length, 0)
  }
  const changedTalent = input(ids.val, 1, { inExplorersSilverfrost: true })
  for (const candidate of changedTalent.operator.operatorProfile.talents![0].candidates ?? []) candidate.blackboard = []
  assert.equal(buildDamageCalculatorThreeOutput(changedTalent).rows.length, 0)
})

test('構造化の元素損傷は直接HPダメージから分離される', () => {
  const base = input(ids.diam, 1)
  const structure = findSkillStructure({ operatorId: ids.diam, skillId: base.skill.skillId, skillIndex: 1, levelIndex: 9 })!
  const effect = structure.effectStructure.stages[0].effects.find(effect => effect.item === 'ELEMENTAL_BUILDUP')!
  assert.ok(getSkillStructureEffectValueRows(effect).some(([label, value]) => label === '元素損傷' && value === '壊死'))
  assert.ok(getSkillStructureEffectValueRows(effect).some(([label, value]) => label === '参照属性' && value === '術'))
  const flow = buildSkillEffectFlow(structure)
  const steps = flow.stages[0].groups.flatMap(group => group.layers.flat())
  assert.equal(steps.filter(step => step.id.includes('-buildup-')).length, 1)
  assert.ok(steps.find(step => step.id.includes('-buildup-'))!.fields.some(field => field.label === '基準' && field.value === '術ダメージ'))
})
