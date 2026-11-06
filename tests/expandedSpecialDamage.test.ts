import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXPANDED_SPECIAL_DEFINITIONS } from '../src/lib/expandedSpecialDefinitions.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { calculateDamageThreePeriodTotal } from '../src/lib/damageCalculatorThreePeriodTotal.ts'
import { buildExpandedTalentStructures } from '../src/lib/expandedTalentStructure.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedSpecialSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
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
    operatorProfile: structuredClone(source.profile) }
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
function total(id: string, index: number, result: ReturnType<typeof output>) {
  const stage = EXPANDED_SPECIAL_DEFINITIONS.find(definition => definition.operatorId === id)!
    .recipes.find(recipe => recipe.skillIndex === index)!.stages[0]
  return calculateDamageThreePeriodTotal({ stage, attackKind: result.attackKind,
    combinedDps: result.rows[0].combinedDps, allTargetsCombinedDps: result.rows[0].allTargetsCombinedDps })
}

test('特殊イベント5人12技能は全素質を原文から評価し、既定状態で数値を出す', () => {
  assert.equal(EXPANDED_SPECIAL_DEFINITIONS.length, 5)
  assert.equal(EXPANDED_SPECIAL_DEFINITIONS.flatMap(value => value.recipes).length, 12)
  for (const definition of EXPANDED_SPECIAL_DEFINITIONS) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    const registered = [...definition.recipes, ...(definition.deferredSkills ?? [])].map(skill => skill.skillIndex).sort()
    assert.deepEqual(registered, source.skills.map(skill => skill.skillIndex).sort(), source.operatorName)
  }
  for (const definition of EXPANDED_SPECIAL_DEFINITIONS) for (const recipe of definition.recipes) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    const result = output(definition.operatorId, recipe.skillIndex)
    assert.deepEqual(result.unsupportedReasons, [], `${source.operatorName} S${recipe.skillIndex}`)
    assert.ok(result.rows.length > 0)
    const structures = buildExpandedTalentStructures([record(definition.operatorId, recipe.skillIndex)])
    assert.equal(structures.length, getOperatorPassives(source.profile, 2, source.profile.phases[2].maxLevel!, 1).sources.filter(value => value.sourceKind === 'TALENT').length)
    assert.ok(structures.every(value => value.issues.length === 0))
    assert.equal('coverage' in source, false)
    assert.equal('passives' in source, false)
  }
})

test('センシS2は原資料の全技能登録を維持し、既存の対象外分類から保留や対応へ変えない', () => {
  const definition = EXPANDED_SPECIAL_DEFINITIONS.find(value => value.operatorId === 'char_4143_sensi')!
  assert.equal(definition.recipes.some(recipe => recipe.skillIndex === 2), false)
  assert.match(definition.deferredSkills!.find(skill => skill.skillIndex === 2)!.reason, /対象外/)
  const skill = record('char_4143_sensi', 2)
  const coverage = buildDamageCalculatorThreeCoverage([skill])[0]
  assert.equal(coverage.status, 'NOT_APPLICABLE')
  assert.ok(coverage.details.every(detail => detail.status === 'NOT_APPLICABLE'))
  assert.deepEqual(output('char_4143_sensi', 2).rows, [])
})

test('ティティの直接攻撃は非移動追加15%を別命中とし、睡眠DOTと分ける', () => {
  for (const index of [1, 3]) {
    const { result, row } = at('char_4056_titi', index, { actualAttackTargetCount: index === 3 ? 2 : 1 }, 40)
    const atk = attack(result.stats.attack, index === 1 ? 1 : 1.8)
    close(row.perAttack, atk * 1.15 * 0.6)
    close(row.allTargetsPerAttack, row.perAttack * (index === 3 ? 2 : 1))
    assert.equal(row.damageOverTimeDps, null)
    assert.equal(row.dps, null)
  }
  const virtual = output('char_4056_titi', 1, {}, undefined, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  const atk = attack(virtual.stats.attack, 1)
  close(virtual.rows[0].perAttack, atk - 500 + atk * 0.15 * 0.6)
})

test('ティティS2は攻撃しないままDOTを3.3倍し、S3睡眠終了は5秒で上限となる', () => {
  for (const index of [1, 2, 3]) {
    const { result, row } = at('char_4056_titi', index, { titiPhase: 'DOT' }, 40)
    close(row.damageOverTimeDps, attack(result.stats.attack, index === 1 ? 1 : 1.8) * 0.3 * (index === 2 ? 3.3 : 1) * 0.6)
    assert.equal(row.perAttack, 0)
  }
  for (const seconds of [0, 2.5, 5, 12]) for (const phase of ['WAKE', 'END']) {
    const { result, row } = at('char_4056_titi', 3, { titiPhase: phase, titiSleepSeconds: seconds }, 40)
    close(row.perAttack, attack(result.stats.attack, phase === 'WAKE' ? 1.8 : 0) * (1 + 3.6 * Math.min(5, seconds) / 5) * 0.6)
    assert.equal(row.damageOverTimeDps, null)
    assert.equal(row.attackComponents?.length, 1)
    assert.equal(row.dps, null)
  }
  for (const conditions of [{ titiPhase: 'TRANSITION' }, { titiTargetNonMoving: false },
    { titiTargetOtherwiseInvulnerable: true }, { titiPhase: 'DOT', titiTargetSleeping: false }]) {
    const blocked = output('char_4056_titi', 1, conditions)
    assert.ok(blocked.unsupportedReasons.length > 0)
    assert.deepEqual(blocked.rows, [])
  }
})

test('Ianaの交代爆発は脆弱20%を対象1体だけへ適用し、S2は身替りASPD300を使う', () => {
  for (const marked of [false, true]) for (const index of [1, 2]) {
    const result = output('char_4124_iana', index, { ianaTargetMarked: marked }, undefined, { enemy: { defense: 300, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.rows[0].perAttack, (result.stats.attack * (index === 1 ? 4 : 1) - 300) * (marked ? 1.2 : 1))
    if (index === 2) close(result.attackInterval, 0.3)
  }
  const many = output('char_4124_iana', 1, { actualAttackTargetCount: 3 }, undefined, { enemy: { defense: 300, resistance: 40 } })
  assert.deepEqual(many.unsupportedReasons, [])
  close(many.rows[0].allTargetsPerAttack, (many.stats.attack * 4 - 300) * 3)
  assert.ok(output('char_4124_iana', 1, { ianaTargetMarked: true, actualAttackTargetCount: 2 }).unsupportedReasons.length > 0)
  assert.ok(output('char_4124_iana', 2, { ianaAttackBuffActive: false }).unsupportedReasons.length > 0)
})

test('琳琅スワイヤーはコイン強化・爆弾の成熟・通常2連撃を各命中で軽減する', () => {
  for (const stacks of [0, 4, 8]) {
    for (const index of [1, 2, 3]) {
      const result = output('char_1033_swire2', index, { swireAttackStacks: stacks }, undefined, { enemy: { defense: 500, resistance: 40 } })
      assert.deepEqual(result.unsupportedReasons, [])
      close(result.rows[0].perAttack, (attack(result.stats.attack, stacks * 0.04) - 500) * (index === 3 ? 2 : 1))
    }
    for (const mature of [false, true]) {
      const result = output('char_1033_swire2', 2, { swirePhase: 'BOMB', swireAttackStacks: stacks, swireBombMature: mature }, undefined,
        { enemy: { defense: 500, resistance: 40 } })
      assert.deepEqual(result.unsupportedReasons, [])
      close(result.rows[0].perAttack, (attack(result.stats.attack, stacks * 0.04) * 2 - 500) * (mature ? 2 : 1))
      assert.equal(result.rows[0].dps, null)
    }
  }
  const coin = output('char_1033_swire2', 3, { swirePhase: 'COIN' }, undefined, { enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(coin.unsupportedReasons, [])
  close(coin.rows[0].perAttack, coin.stats.attack * 1.5 - 500)
  for (const [index, conditions] of [[2, { swirePhase: 'CHANGED' }], [3, { swirePhase: 'COIN_BUFF' }], [3, { swirePhase: 'COIN', swireAttackStacks: 1 }]] as const) {
    const blocked = output('char_1033_swire2', index, conditions)
    assert.ok(blocked.unsupportedReasons.length > 0)
    assert.deepEqual(blocked.rows, [])
  }
})

test('センシS1は確定した料理効果を選び、調理・治療時は攻撃ダメージを出さない', () => {
  for (const buff of ['NONE', 'ATK', 'ASPD', 'HP']) {
    const result = output('char_4143_sensi', 1, { senshiBuff: buff }, undefined, { enemy: { defense: 100, resistance: 0 } })
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.rows[0].perAttack, attack(result.stats.attack, buff === 'ATK' ? 0.2 : 0) - 100)
    close(result.attackInterval, 1.2 / (buff === 'ASPD' ? 1.2 : 1))
    assert.equal(total('char_4143_sensi', 1, result).totalDamage, null)
  }
  for (const [id, phaseName, conditions] of [
    ['char_4143_sensi', 'COOKING', { senshiPhase: 'COOKING' }], ['char_4143_sensi', 'HEAL', { senshiPhase: 'HEAL' }],
    ['char_1033_swire2', 'HEAL', { swirePhase: 'HEAL' }],
  ] as const) {
    const result = output(id, 1, conditions)
    assert.deepEqual(result.unsupportedReasons, [], phaseName)
    close(result.rows[0].perAttack, 0)
    assert.equal(result.rows[0].dps, null)
  }
})

test('サンクタ・ミキサーは3連撃と単発を区別し、反撃間隔をDPSへ転用しない', () => {
  for (const stacks of [0, 1, 3]) for (const index of [1, 2, 3]) {
    const result = output('char_4194_rmixer', index, { mixerDamageStacks: stacks, actualAttackTargetCount: index === 3 ? 3 : 1 }, undefined,
      { enemy: { defense: 500, resistance: 0 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const atk = attack(result.stats.attack, index === 2 ? 1.5 : index === 3 ? 2.2 : 0)
    close(result.rows[0].perAttack, (atk * (index === 1 ? 1.9 : 1) - 500) * (index === 1 ? 3 : 1))
    close(result.rows[0].allTargetsPerAttack, result.rows[0].perAttack * (index === 3 ? 3 : 1))
    if (index === 2) close(result.attackInterval, 1.2 / (1 + stacks * 0.03))
    if (index === 3) assert.equal(result.rows[0].dps, null)
    assert.equal(total('char_4194_rmixer', index, result).totalDamage, null)
  }
})

test('未確認の状態遷移を保留に残し、全保存原文の変更を拒否する', () => {
  const coverage = buildDamageCalculatorThreeCoverage(sources.flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex))))
  for (const [id, indices] of [['char_4056_titi', [1, 3]], ['char_1033_swire2', [2, 3]]] as const) {
    for (const index of indices) {
      const row = coverage.find(row => row.skill.operatorId === id && row.skill.skillIndex === index)!
      assert.equal(row.status, 'CONDITIONAL')
      assert.ok(row.deferredReasons.length > 0)
    }
  }
  for (const source of sources) for (const mutate of [
    (skill: SkillRecord) => { skill.skillLevels.at(-1)!.description += '未知の攻撃効果' },
    (skill: SkillRecord) => { skill.operatorProfile.talents!.forEach(talent => talent.candidates!.forEach(value => { value.description += '未知の素質効果' })) },
  ]) {
    const result = output(source.operatorId, 1, {}, mutate)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

