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

test('特殊イベント14人32技能は全素質を原文から評価し、既定状態で数値を出す', () => {
  assert.equal(EXPANDED_SPECIAL_DEFINITIONS.length, 14)
  assert.equal(EXPANDED_SPECIAL_DEFINITIONS.flatMap(value => value.recipes).length, 32)
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
    const index = EXPANDED_SPECIAL_DEFINITIONS.find(definition => definition.operatorId === source.operatorId)!.recipes[0].skillIndex
    const result = output(source.operatorId, index, {}, mutate)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('錬金ユニットは投擲時ATKの毎秒値を計算し、術耐性低下と継続ダメージ増加を1回だけ適用する', () => {
  for (const id of ['char_1039_thorn2', 'char_4151_tinman']) for (const index of id === 'char_1039_thorn2' ? [2, 3] : [1, 2]) {
    for (const mature of [false, true]) for (const res of [0, 40, 100]) {
      const { result, row } = at(id, index, { actualAttackTargetCount: 3, thornRegionMature: mature }, res)
      const isThorn = id === 'char_1039_thorn2', isRegion = isThorn && index === 3
      const atk = attack(result.stats.attack, isThorn ? 0.1 : 0)
      const scale = isRegion ? mature ? 3.9 : 2.1 : isThorn ? 1.8 : index === 1 ? 0.75 : 1.1
      const reduction = isRegion ? mature ? 0.5 : 0.35 : 0
      close(row.damageOverTimeDps, atk * scale * Math.max(0.05, 1 - res * (1 - reduction) / 100) * (isThorn ? 1 : 1.2))
      assert.equal(row.perAttack, 0)
      assert.equal(row.dps, null)
      assert.equal(row.combinedDps, null)
      assert.equal(result.attackInterval, null)
      assert.equal(total(id, index, result).totalDamage, null)
    }
  }
  const a = at('char_1039_thorn2', 2, { thornLongPath: false }).row.damageOverTimeDps
  const b = at('char_1039_thorn2', 2, { thornLongPath: true }).row.damageOverTimeDps
  close(a, b!) // ASPD changes do not increase an alchemy unit's tick rate.
})

test('錬金ユニットの仮想物理属性でもDEF低下を先に適用し、地上・投擲時ATK・範囲の条件を検査する', () => {
  const virtual = output('char_1039_thorn2', 3, { thornRegionMature: true }, undefined,
    { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].damageOverTimeDps, attack(virtual.stats.attack, 0.1) * 3.9 - 250)
  for (const id of ['char_1039_thorn2', 'char_4151_tinman']) for (const key of ['alchemyAttackUnchanged', 'alchemyTargetsInArea', 'alchemyTargetsGround']) {
    const result = output(id, 2, { [key]: false })
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
  assert.ok(at('char_1039_thorn2', 3, { alchemyTargetsGround: false }).row.damageOverTimeDps! > 0)
  assert.deepEqual(output('char_1039_thorn2', 3, { thornReductionApplied: false }).rows, [])
})

test('テクノは本人のATK50%とASPD100を分離し、パペットのHP/DEF/ブロックを転用しない', () => {
  for (const index of [1, 2]) {
    const { result, row } = at('char_4164_tecno', index, {}, 40)
    const atk = attack(result.stats.attack, index === 1 ? 0.5 : 0)
    close(row.perAttack, atk * 0.6)
    close(result.attackInterval, result.stats.baseAttackTime / (index === 2 ? 2 : 1))
    close(row.dps, row.perAttack / result.attackInterval!)
    assert.equal(result.maxTargetCount, 1)
    assert.equal(total('char_4164_tecno', index, result).totalDamage, null)
    assert.deepEqual(output('char_4164_tecno', index, { tecnoPhase: 'TOKEN' }).rows, [])
  }
  const virtual = output('char_4164_tecno', 1, {}, undefined, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 300, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, attack(virtual.stats.attack, 0.5) - 300)
})

test('凛御シルバーアッシュは本人斬撃6対象とS3付与済み脆弱を分け、別起点の攻撃を加算しない', () => {
  const slash = output('char_1045_svash2', 2, { actualAttackTargetCount: 6 }, undefined, { enemy: { defense: 350, resistance: 40 } })
  assert.deepEqual(slash.unsupportedReasons, [])
  close(slash.rows[0].perAttack, slash.stats.attack * 3.8 - 350)
  close(slash.rows[0].allTargetsPerAttack, (slash.stats.attack * 3.8 - 350) * 6)
  assert.equal(slash.rows[0].dps, null)
  assert.deepEqual(output('char_1045_svash2', 2, { actualAttackTargetCount: 7 }).rows, [])
  const line = output('char_1045_svash2', 3, { actualAttackTargetCount: 4 }, undefined, { enemy: { defense: 350, resistance: 40 } })
  assert.deepEqual(line.unsupportedReasons, [])
  close(line.rows[0].perAttack, (line.stats.attack * 2 - 350) * 1.3)
  close(line.rows[0].allTargetsPerAttack, line.rows[0].perAttack * 4)
  close(line.rows[0].dps, line.rows[0].perAttack / 1.2)
  assert.equal(total('char_1045_svash2', 3, line).totalDamage, null)
  assert.deepEqual(output('char_1045_svash2', 3, { silverashFragileActive: false }).rows, [])
  for (const phase of ['FIRST', 'ALLY']) assert.deepEqual(output('char_1045_svash2', 3, { silverashPhase: phase }).rows, [])
  const virtual = output('char_1045_svash2', 3, {}, undefined, { virtualMainAttackType: 'ARTS', enemy: { defense: 350, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, virtual.stats.attack * 2 * 0.6 * 1.3)
})

test('V9の本人限定・付与順未対応は条件付きに残り、対象外2技能の分類を保つ', () => {
  const rows = buildDamageCalculatorThreeCoverage(sources.flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex))))
  for (const [id, index] of [['char_4164_tecno', 1], ['char_4164_tecno', 2], ['char_1045_svash2', 2], ['char_1045_svash2', 3], ['char_1039_thorn2', 3],
    ['char_450_necras', 1], ['char_450_necras', 2], ['char_450_necras', 3], ['char_4015_spuria', 1], ['char_4015_spuria', 2]] as const) {
    const row = rows.find(row => row.skill.operatorId === id && row.skill.skillIndex === index)!
    assert.equal(row.status, 'CONDITIONAL', `${id} S${index}`)
    assert.ok(row.deferredReasons.length > 0)
  }
  for (const id of ['char_1039_thorn2', 'char_1045_svash2']) assert.equal(rows.find(row => row.skill.operatorId === id && row.skill.skillIndex === 1)!.status, 'NOT_APPLICABLE')
})

test('ネクラスは本人由来の爆発・拘束・範囲攻撃1回にHP50%未満の140%を適用する', () => {
  for (const index of [1, 2, 3]) for (const hp of [0, 49.99, 50, 100]) for (const res of [0, 40, 100]) {
    const count = index === 2 ? 2 : 4
    const { result, row } = at('char_450_necras', index, { targetHpPercent: hp, actualAttackTargetCount: count }, res)
    const scale = index === 1 ? 4.5 : index === 2 ? 1.6 : 8
    close(row.perAttack, result.stats.attack * scale * (hp < 50 ? 1.4 : 1) * Math.max(0.05, 1 - res / 100))
    close(row.allTargetsPerAttack, row.perAttack * count)
    assert.equal(row.dps, null)
    assert.equal(row.damageOverTimeDps, null)
    assert.equal(row.attackComponents?.[0].count, 1)
    assert.equal(total('char_450_necras', index, result).totalDamage, null)
    assert.deepEqual(output('char_450_necras', index, { necrasPhase: 'TOKEN' }).rows, [])
  }
  assert.deepEqual(output('char_450_necras', 2, { necrasLinkActive: false }).rows, [])
  assert.deepEqual(output('char_450_necras', 2, { actualAttackTargetCount: 3 }).rows, [])
  const virtual = output('char_450_necras', 1, { targetHpPercent: 49.99 }, undefined, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 600, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, virtual.stats.attack * 4.5 * 1.4 - 600)
})

test('スプリアの不発・2連撃・スタン・80%無視は排他的な実現値で、抽選期待値を仮定しない', () => {
  for (const index of [1, 2]) for (const outcome of ['NONE', 'DOUBLE', 'STUN', 'IGNORE']) for (const defense of [0, 600, 10000]) {
    const result = output('char_4015_spuria', index, { spuriaOutcome: outcome }, undefined, { enemy: { defense, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const atk = attack(result.stats.attack, index === 2 ? 0.3 : 0), hits = outcome === 'DOUBLE' ? 2 : 1
    const def = defense * (outcome === 'IGNORE' ? 0.2 : 1)
    close(result.rows[0].perAttack, Math.max(atk - def, atk * 0.05) * hits)
    assert.equal(result.rows[0].attackComponents?.[0].count, hits)
    assert.equal(result.rows[0].dps, null)
    assert.equal(result.attackInterval, null)
    assert.equal(result.hasProbabilisticDamage, false)
    assert.equal(total('char_4015_spuria', index, result).totalDamage, null)
  }
  for (const index of [1, 2]) for (const outcome of ['DOUBLE', 'IGNORE']) {
    const result = output('char_4015_spuria', index, { spuriaOutcome: outcome }, undefined,
      { virtualMainAttackType: 'ARTS', enemy: { defense: 600, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    close(result.rows[0].perAttack, attack(result.stats.attack, index === 2 ? 0.3 : 0) * 0.6 * (outcome === 'DOUBLE' ? 2 : 1))
    assert.deepEqual(output('char_4015_spuria', index, { spuriaMode: 'EXPECTED' }).rows, [])
  }
  assert.deepEqual(output('char_4015_spuria', 2, { spuriaSelfStunAbsent: false }).rows, [])
  assert.deepEqual(output('char_4015_spuria', 2, { spuriaMode: 'INTERRUPTED' }).rows, [])
})



test('新約エクシアS1/S2は本人ATK18%と250%/300%射撃、実現した150%爆撃を独立に軽減する', () => {
  const physical = (value: number, defense: number) => Math.max(value - defense, value * .05)
  for (const index of [1, 2]) for (const bombs of [0, 1]) for (const defense of [0, 1000, 10000]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const result = output('char_1041_angel2', index, { angelBombCount: bombs }, undefined, { enemy: { defense, resistance: 60 }, virtualMainAttackType: type })
    assert.deepEqual(result.unsupportedReasons, [])
    const atk = attack(result.stats.attack, .18), mainScale = index === 1 ? 2.5 : 3
    const main = type === 'PHYSICAL' ? physical(atk * mainScale, defense) : atk * mainScale * .4
    close(result.rows[0].perAttack, main + bombs * physical(atk * 1.5, defense))
    assert.equal(result.rows[0].dps, null)
    assert.equal(result.rows[0].attackComponents.filter(value => value.role === 'ADDITIONAL').length, bombs ? 1 : 0)
    assert.equal(total('char_1041_angel2', index, result).totalDamage, null)
  }
})

test('新約エクシアS3の爆撃は弾薬5発に対する0〜5回で、5連撃数をさらに掛けない', () => {
  const physical = (value: number, defense: number) => Math.max(value - defense, value * .05)
  for (const bombs of [0, 1, 3, 5]) for (const defense of [0, 1000, 10000]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const result = output('char_1041_angel2', 3, { angelBombCount: bombs }, undefined, { enemy: { defense, resistance: 60 }, virtualMainAttackType: type })
    assert.deepEqual(result.unsupportedReasons, [])
    const atk = attack(result.stats.attack, .18 + .3)
    const shot = type === 'PHYSICAL' ? physical(atk * 1.6, defense) : atk * 1.6 * .4
    close(result.rows[0].perAttack, 5 * shot + bombs * physical(atk * 1.5, defense))
    close(result.rows[0].allTargetsPerAttack, result.rows[0].perAttack!)
    assert.equal(result.rows[0].dps, null)
  }
  for (const count of [1, 4]) {
    const result = output('char_1041_angel2', 3, { angelPhase: 'DELIVERY', angelBombCount: 5, actualAttackTargetCount: count }, undefined, { enemy: { defense: 1000, resistance: 60 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const expected = physical(attack(result.stats.attack, .48) * 2.5, 1000)
    close(result.rows[0].perAttack, expected)
    close(result.rows[0].allTargetsPerAttack, expected * count)
    assert.equal(result.rows[0].attackComponents.length, 1)
    assert.equal(result.rows[0].dps, null)
  }
})

test('新約エクシアは孤立条件・爆撃回数・未対応起点を検証し、素質のlive数値を参照する', () => {
  for (const index of [1, 2, 3]) for (const guard of [
    { angelIsolatedTarget: false }, { actualAttackTargetCount: 2 }, { angelBombCount: -1 },
    { angelBombCount: index === 3 ? 6 : 2 }, { angelBombCount: .5 }, { angelBombCount: Number.NaN }, { angelPhase: 'OTHER' },
  ]) {
    const result = output('char_1041_angel2', index, guard)
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.length > 0)
  }
  const result = output('char_1041_angel2', 1, { angelBombCount: 1 }, skill => {
    for (const candidate of skill.operatorProfile.talents[0].candidates) {
      const entry = candidate.blackboard?.find(value => value.key === 'aoe_atk_scale')
      if (entry) entry.value = 2
    }
  }, { enemy: { defense: 0, resistance: 0 } })
  assert.deepEqual(result.unsupportedReasons, [])
  close(result.rows[0].perAttack, attack(result.stats.attack, .18) * 4.5)
})

test('溯光アステジーニは素質識別子の順を保持し、脆弱を軽減後1回だけ掛ける', () => {
  const physical = (value: number, defense: number) => Math.max(value - defense, value * .05)
  for (const index of [1, 2, 3]) for (const state of ['EARLY', 'MATURE']) for (const type of ['ARTS', 'PHYSICAL'] as const) {
    const result = output('char_1047_halo2', index, { haloFragile: state }, undefined, { enemy: { defense: 1000, resistance: 60 }, virtualMainAttackType: type })
    assert.deepEqual(result.unsupportedReasons, [])
    const atk = attack(result.stats.attack, index === 1 ? 1 : index === 3 ? .7 : 0), scale = index === 2 ? 1.45 : 1
    const main = type === 'ARTS' ? atk * scale * .4 : physical(atk * scale, 1000)
    close(result.rows[0].perAttack, main * (state === 'EARLY' ? 1.1 : 1.14))
    assert.equal(result.rows[0].attackComponents.length, 1)
    assert.equal(result.rows[0].dps, null)
  }
  const structures = buildExpandedTalentStructures([record('char_1047_halo2', 1)])
  assert.deepEqual(structures.map(value => value.source.prefabKey), ['2', '1'])
  assert.ok(structures.every(value => value.issues.length === 0))
})

test('溯光アステジーニS2の直撃2体と1か所からの引き寄せ3体を別イベントとして計算する', () => {
  for (const [phase, count] of [['DIRECT', 2], ['LINK', 3]] as const) for (const state of ['EARLY', 'MATURE']) {
    const result = output('char_1047_halo2', 2, { haloPhase: phase, haloFragile: state, actualAttackTargetCount: count }, undefined, { enemy: { defense: 0, resistance: 60 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const expected = result.stats.attack * 1.45 * .4 * (state === 'EARLY' ? 1.1 : 1.14)
    close(result.rows[0].perAttack, expected)
    close(result.rows[0].allTargetsPerAttack, expected * count)
  }
  const outside = output('char_1047_halo2', 2, { haloPhase: 'LINK', haloFragile: 'NONE', actualAttackTargetCount: 3 }, undefined, { enemy: { defense: 0, resistance: 60 } })
  assert.deepEqual(outside.unsupportedReasons, [])
  close(outside.rows[0].perAttack, outside.stats.attack * 1.45 * .4)
  assert.deepEqual(output('char_1047_halo2', 2, { haloPhase: 'DIRECT', haloFragile: 'NONE' }).rows, [])
  for (const [phase, count] of [['DIRECT', 3], ['LINK', 4]] as const) assert.deepEqual(output('char_1047_halo2', 2, { haloPhase: phase, actualAttackTargetCount: count }).rows, [])
})

test('溯光アステジーニは再跳躍・重複命中・2体伝導を未対応に残し、ASPD累積の値と境界を検証する', () => {
  for (const index of [1, 2, 3]) {
    const phase = index === 3 ? 'LINKED' : 'ALL'
    assert.deepEqual(output('char_1047_halo2', index, { haloPhase: phase }).rows, [])
    const skill = record('char_1047_halo2', index)
    const coverage = buildDamageCalculatorThreeCoverage([skill])[0]
    assert.equal(coverage.status, 'CONDITIONAL')
  }
  for (const guard of [{ haloSingleLock: false }, { actualAttackTargetCount: 2 }, { haloFragile: 'NONE' }, { haloSlowStacks: -1 }, { haloSlowStacks: 19 }])
    assert.deepEqual(output('char_1047_halo2', 3, guard).rows, [])
  for (const stacks of [0, 9, 18]) {
    const result = output('char_1047_halo2', 3, { haloSlowStacks: stacks })
    assert.deepEqual(result.unsupportedReasons, [])
    const speed = result.guard!.evaluations.find(value => value.source === 'データモデリング' && value.item === '攻撃速度')
    assert.ok(speed, 'ASPD talent remains structurally applied even though a single event has no DPS')
    assert.equal(speed.status, 'APPLIED')
  }
})

test('エンフォーサーS1は倍率100%の通常攻撃、重量3以上のみ防御180無視、S2は対象外を維持', () => {
  for (const weight of [0, 2, 3, 10]) for (const count of [1, 2]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const result = output('char_4036_forcer', 1, { targetWeight: weight, actualAttackTargetCount: count }, undefined,
      { enemy: { defense: 500, resistance: 60 }, virtualMainAttackType: type })
    assert.deepEqual(result.unsupportedReasons, [])
    const damage = type === 'PHYSICAL' ? Math.max(result.stats.attack - (500 - (weight >= 3 ? 180 : 0)), result.stats.attack * .05) : result.stats.attack * .4
    close(result.rows[0].perAttack, damage)
    close(result.rows[0].allTargetsPerAttack, damage * count)
    assert.equal(result.rows[0].dps, null)
  }
  assert.deepEqual(output('char_4036_forcer', 1, { actualAttackTargetCount: 3 }).rows, [])
  assert.equal(buildDamageCalculatorThreeCoverage([record('char_4036_forcer', 2)])[0].status, 'NOT_APPLICABLE')
})
