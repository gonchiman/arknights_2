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
  const stage = EXPANDED_ARTS_DEFINITIONS.find(definition => definition.operatorId === id)!
    .recipes.find(recipe => recipe.skillIndex === index)!.stages[0]
  return calculateDamageThreePeriodTotal({ stage, attackKind: result.attackKind,
    combinedDps: result.rows[0].combinedDps, allTargetsCombinedDps: result.rows[0].allTargetsCombinedDps })
}

test('ホルハイヤS1は空中対象への素質倍率、S2は9命中の対象配分を反映する', () => {
  const ground = at('char_4027_heyak', 1)
  const airborne = at('char_4027_heyak', 1, { targetAirborne: true })
  close(ground.row.perAttack, ground.result.stats.attack * 3)
  close(airborne.row.perAttack, ground.row.perAttack * 1.2)
  const three = at('char_4027_heyak', 2, { actualAttackTargetCount: 3 })
  close(three.row.perAttack, three.result.stats.attack * 0.45 * 9 / 3)
  close(three.row.allTargetsPerAttack, three.result.stats.attack * 0.45 * 9)
  close(three.row.dps, three.row.perAttack / three.result.attackInterval!)
  assert.equal(total('char_4027_heyak', 2, three.result).totalDamage, null)
})

test('ホルハイヤS2は浮遊が有効な対象を停止し、状態一定の対象だけ条件付きで計算する', () => {
  for (const airborne of [false, true]) {
    const fixed = at('char_4027_heyak', 2, { targetCanBeLevitated: false, targetAirborne: airborne })
    close(fixed.row.perAttack, fixed.result.stats.attack * 0.45 * 9 * (airborne ? 1.2 : 1))
    const dynamic = output('char_4027_heyak', 2, { targetCanBeLevitated: true, targetAirborne: airborne })
    assert.ok(dynamic.unsupportedReasons.some(reason => reason.includes('命中途中の浮遊')))
    assert.deepEqual(dynamic.rows, [])
  }
  const recipes = EXPANDED_ARTS_DEFINITIONS.find(entry => entry.operatorId === 'char_4027_heyak')!.recipes
  assert.ok(!recipes.find(entry => entry.skillIndex === 1)!.inputs.some(input => input.key === 'targetCanBeLevitated'))
  assert.equal(recipes.find(entry => entry.skillIndex === 2)!.inputs.find(input => input.key === 'targetCanBeLevitated')!.defaultValue, false)
  assert.equal(buildDamageCalculatorThreeCoverage([record('char_4027_heyak', 2)])[0].status, 'CONDITIONAL')
})

test('焔影リードS1は付与確率を脆弱倍率に混ぜず、指定した灼痕状態で評価する', () => {
  const clear = at('char_1020_reed2', 1, {}, 40)
  const marked = at('char_1020_reed2', 1, { reedScarActive: true }, 40)
  close(clear.row.perAttack, attack(clear.result.stats.attack, 0.45) * 0.6)
  close(marked.row.perAttack, clear.row.perAttack * 1.3)
  close(marked.result.attackInterval, 1.6 / 1.45)
  assert.equal(total('char_1020_reed2', 1, marked.result).totalDamage, null)
})

test('濯塵ハイビスカスS1は対術脆弱が有効な命中だけ12%増幅する', () => {
  const clear = at('char_1024_hbisc2', 1, {}, 40)
  const weak = at('char_1024_hbisc2', 1, { hibiscusWeaknessActive: true }, 40)
  close(clear.row.perAttack, attack(clear.result.stats.attack, 1) * 0.6)
  close(weak.row.perAttack, clear.row.perAttack * 1.12)
})

test('ヘイズは術耐性低下が有効な命中で残存術耐性を80%にし、攻撃速度と分離する', () => {
  const clear = at('char_141_nights', 2, {}, 80)
  const debuffed = at('char_141_nights', 2, { hazeDebuffActive: true }, 80)
  close(clear.row.perAttack, attack(clear.result.stats.attack, 0.6) * 0.2)
  close(debuffed.row.perAttack, attack(clear.result.stats.attack, 0.6) * 0.36)
  close(debuffed.result.attackInterval, 1.6 / 1.6)
  close(at('char_141_nights', 1, { hazeDebuffActive: true }, 80).row.perAttack,
    attack(clear.result.stats.attack, 0.8) * 0.36)
})

test('プラマニクスS2は術耐性30%低下、2体攻撃、低HP脆弱をそれぞれ反映する', () => {
  const result = at('char_174_slbell', 2, { actualAttackTargetCount: 2, targetHpPercent: 30 }, 80)
  close(result.row.perAttack, result.result.stats.attack * 0.44 * 1.3)
  close(result.row.allTargetsPerAttack, result.row.perAttack * 2)
  assert.equal(result.result.maxTargetCount, 2)
})

test('ルシーラS2は通常敵の撃破数で脆弱効果量だけを増幅し、3倍で頭打ちになる', () => {
  const initial = at('char_4079_haini', 2)
  const four = at('char_4079_haini', 2, { defeatedNormalEnemies: 4 })
  const many = at('char_4079_haini', 2, { defeatedNormalEnemies: 100 })
  const elite = at('char_4079_haini', 2, { defeatedNormalEnemies: 4, targetEliteOrBoss: true })
  const base = attack(initial.result.stats.attack, 0.5)
  close(initial.row.perAttack, base * 1.16)
  close(four.row.perAttack, base * 1.48)
  close(many.row.perAttack, four.row.perAttack)
  close(elite.row.perAttack, base)
  const s1 = at('char_4079_haini', 1, { defeatedNormalEnemies: 100 })
  close(s1.row.perAttack, s1.result.stats.attack * 2 * 1.16)
})

test('プロヴァイゾS2は発動時の全体攻撃と高速化した通常攻撃を合算しない', () => {
  const normal = at('char_4032_provs', 2)
  const start = at('char_4032_provs', 2, { provisoPhase: 'ACTIVATION', actualAttackTargetCount: 3 })
  close(normal.row.perAttack, normal.result.stats.attack)
  close(normal.result.attackInterval, (1.9 - 1.1) / 1.1)
  close(start.row.perAttack, start.result.stats.attack * 3.5)
  close(start.row.allTargetsPerAttack, start.result.stats.attack * 3.5 * 3)
  assert.equal(start.row.dps, null)
})

test('ビーズワクスS2とミントS2は範囲攻撃の異なる段階を一意に選択する', () => {
  const beeswax = at('char_344_beewax', 2)
  const summon = at('char_344_beewax', 2, { beeswaxPhase: 'SUMMON', actualAttackTargetCount: 3 })
  close(beeswax.row.perAttack, beeswax.result.stats.attack)
  close(summon.row.perAttack, summon.result.stats.attack * 3)
  close(summon.row.allTargetsPerAttack, summon.result.stats.attack * 9)
  assert.equal(summon.row.dps, null)
  const mint = at('char_388_mint', 2)
  const end = at('char_388_mint', 2, { mintPhase: 'END' })
  close(mint.row.perAttack, mint.result.stats.attack * 1.3)
  close(end.row.perAttack, end.result.stats.attack * 3)
  assert.equal(end.row.dps, null)
})

test('グレインバッズS2の攻撃停止中はダメージ0、睡眠終了後は3体へ攻撃する', () => {
  const sleeping = at('char_4122_grabds', 2, { grainbudsPhase: 'SLEEP' })
  close(sleeping.row.perAttack, 0)
  assert.equal(sleeping.row.dps, null)
  const awake = at('char_4122_grabds', 2, { actualAttackTargetCount: 3 })
  close(awake.row.perAttack, awake.result.stats.attack)
  close(awake.result.attackInterval, 1.9 / 2.4)
  close(awake.row.allTargetsPerAttack, awake.result.stats.attack * 3)
})

test('ヴァンデラS2の反撃は1被撃分として計算し、通常攻撃に倍率を乗せない', () => {
  const normal = at('char_494_vendla', 2)
  const counter = at('char_494_vendla', 2, { vendelaPhase: 'COUNTER' })
  close(normal.row.perAttack, attack(normal.result.stats.attack, 0.8))
  close(counter.row.perAttack, normal.row.perAttack * 0.5)
  assert.equal(counter.row.dps, null)
})

test('新規術師の仮想物理攻撃は対術脆弱を除外し、防御・術耐性低下を交換しない', () => {
  function physical(id: string, index: number, guard: GuardConditions = {}) {
    const skill = record(id, index)
    const source = sources.find(source => source.operatorId === id)!
    const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
      operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
      conditions: { guard }, enemy: { defense: 100, resistance: 80 }, virtualMainAttackType: 'PHYSICAL' })
    assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
    assert.ok(result.rows[0].attackComponents.every(component => component.role === 'MAIN'))
    return { result, row: result.rows[0] }
  }
  for (const [id, key, ratio] of [
    ['char_1020_reed2', 'reedScarActive', 0.45], ['char_1024_hbisc2', 'hibiscusWeaknessActive', 1],
  ] as const) {
    const clear = physical(id, 1), debuffed = physical(id, 1, { [key]: true })
    close(clear.row.perAttack, attack(clear.result.stats.attack, ratio) - 100)
    close(debuffed.row.perAttack, clear.row.perAttack)
  }
  const hazeClear = physical('char_141_nights', 2), hazeDebuff = physical('char_141_nights', 2, { hazeDebuffActive: true })
  close(hazeDebuff.row.perAttack, hazeClear.row.perAttack)
  const pramanix = physical('char_174_slbell', 2)
  close(pramanix.row.perAttack, pramanix.result.stats.attack - 100 * 0.4)
  const hool = physical('char_4027_heyak', 2)
  close(hool.row.perAttack, (hool.result.stats.attack * 0.45 - 100) * 9)
})

test('追加4名の素質数値欠落や未確認のスキル更新は計算を停止する', () => {
  for (const id of ['char_4027_heyak', 'char_1020_reed2', 'char_1024_hbisc2', 'char_141_nights']) {
    const missing = output(id, 1, {}, skill => {
      for (const talent of skill.operatorProfile.talents ?? []) {
        for (const candidate of talent.candidates ?? []) candidate.blackboard = []
      }
    })
    assert.ok(missing.unsupportedReasons.length, id)
    assert.deepEqual(missing.rows, [])
    const changed = output(id, 1, {}, skill => { skill.skillLevels[9].description += '未確認の追加攻撃' })
    assert.ok(changed.unsupportedReasons.length, id)
    assert.deepEqual(changed.rows, [])
  }
})

test('術師・補助・呪癒師49名の108スキルを86レシピ・22保留に分け、全素質を登録する', () => {
  assert.equal(sources.length, 49)
  assert.equal(sources.reduce((sum, source) => sum + source.skills.length, 0), 108)
  assert.equal(EXPANDED_ARTS_DEFINITIONS.reduce((sum, definition) => sum + definition.recipes.length, 0), 86)
  for (const definition of EXPANDED_ARTS_DEFINITIONS) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    const indices = [...definition.recipes.map(recipe => recipe.skillIndex), ...(definition.deferredSkills ?? []).map(skill => skill.skillIndex)]
    assert.deepEqual(indices.sort(), source.skills.map(skill => skill.skillIndex).sort())
    assert.equal(new Set(indices).size, indices.length)
    assert.equal(definition.talents.length, getOperatorPassives(source.profile, source.phaseIndex,
      source.profile.phases[source.phaseIndex].maxLevel!, 1).sources.filter(entry => entry.sourceKind === 'TALENT').length)
    const structures = buildExpandedTalentStructures([record(source.operatorId, 1)])
    for (const structure of structures) {
      assert.deepEqual(structure.issues, [], source.operatorName + structure.basicInfo.talentName)
      assert.ok(structure.effects.length)
    }
  }
})

test('対応レシピの初期条件は有限のダメージを返し、保留スキルは部分結果を出さない', () => {
  for (const definition of EXPANDED_ARTS_DEFINITIONS) {
    for (const recipe of definition.recipes) {
      const result = output(definition.operatorId, recipe.skillIndex)
      assert.deepEqual(result.unsupportedReasons, [], `${definition.operatorId} S${recipe.skillIndex}`)
      assert.ok(result.rows.length)
      const raw = sources.find(source => source.operatorId === definition.operatorId)!.skills.find(skill => skill.skillIndex === recipe.skillIndex)!.raw
      assert.equal(result.model!.duration, definition.operatorId === 'char_258_podego' && recipe.skillIndex === 2 ? 6 : Math.max(0, raw.duration!))
      for (const row of result.rows) assert.ok([row.perAttack, row.allTargetsPerAttack, row.dps ?? 0, row.damageOverTimeDps ?? 0, row.combinedDps ?? 0].every(Number.isFinite))
    }
    for (const deferred of definition.deferredSkills ?? []) {
      const result = output(definition.operatorId, deferred.skillIndex)
      assert.ok(result.unsupportedReasons.some(reason => reason.includes(deferred.reason)))
      assert.deepEqual(result.rows, [])
    }
  }
})

test('星3は昇進1・Lv55・SL7で素質とスキルを適用する', () => {
  const { result: lava, row: lavaRow } = at('char_121_lava', 1, { actualAttackTargetCount: 3 }, 40)
  close(lavaRow.perAttack, lava.stats.attack * 0.6)
  close(lavaRow.dps, lavaRow.perAttack / (2.9 / 1.5))
  close(lavaRow.allTargetsPerAttack, lavaRow.perAttack * 3)
  const { result: steward, row: stewardRow } = at('char_210_stward', 1)
  close(stewardRow.perAttack, attack(steward.stats.attack, 0.06) * 1.9)
  assert.equal(stewardRow.dps, null)
  const { result: orchid, row: orchidRow } = at('char_278_orchid', 1)
  close(orchidRow.perAttack, attack(orchid.stats.attack, 0.25))
  close(orchidRow.dps, orchidRow.perAttack / (1.9 / 1.34))
})

test('ギターノの占いは一つの効果だけを適用し、三効果を合算しない', () => {
  const atk = at('char_109_fmout', 2, { fortuneResult: 'ATK' })
  const speed = at('char_109_fmout', 2, { fortuneResult: 'ASPD' })
  const hp = at('char_109_fmout', 2, { fortuneResult: 'HP' })
  close(atk.row.perAttack, attack(atk.result.stats.attack, 1.13))
  close(speed.row.perAttack, attack(speed.result.stats.attack, 1))
  close(speed.result.attackInterval, 2.9 / 1.13)
  close(hp.row.perAttack, speed.row.perAttack)
  close(hp.result.attackInterval, 2.9)
})

test('アーミヤS2は8発の総量を対象数で分配し、S3は術耐性で減衰しない', () => {
  const one = at('char_002_amiya', 2)
  const four = at('char_002_amiya', 2, { actualAttackTargetCount: 4 })
  close(one.row.perAttack, one.result.stats.attack * 0.6 * 8)
  close(four.row.perAttack, one.row.perAttack / 4)
  close(four.row.allTargetsPerAttack, one.row.perAttack)
  const trueDamage = output('char_002_amiya', 3)
  assert.deepEqual(trueDamage.unsupportedReasons, [])
  for (const row of trueDamage.rows) close(row.perAttack, attack(trueDamage.stats.attack, 2.3))
})

test('アブサントの40%未満の素質とS2の50%未満の対象制限を別々に守る', () => {
  const low = at('char_405_absin', 2, { targetHpPercent: 39 })
  const edge = at('char_405_absin', 2, { targetHpPercent: 40 })
  close(edge.row.perAttack, edge.result.stats.attack * 0.9 * 4)
  close(low.row.perAttack, edge.row.perAttack * 1.24)
  assert.ok(output('char_405_absin', 2, { targetHpPercent: 50 }).unsupportedReasons.length)
  assert.deepEqual(output('char_405_absin', 2, { targetHpPercent: 50 }).rows, [])
})

test('トミミのスキル中は攻撃力100%強化と物理変換を一度だけ適用する', () => {
  const { result, row } = at('char_411_tomimi', 1, {}, 1000)
  const a = attack(result.stats.attack, 1)
  assert.equal(result.damageType, 'PHYSICAL')
  close(row.perAttack, Math.max(a - 1000, a * 0.05))
  close(result.attackInterval, 1.6 / 1.9)
})

test('カニパラートとスカイフレアの対術脆弱は対象条件が成立する時だけ適用する', () => {
  for (const [id, condition, multiplier] of [
    ['char_466_qanik', 'targetAirborne', 1.2], ['char_166_skfire', 'targetBlocked', 1.15],
  ] as const) {
    const off = at(id, 1, { [condition]: false }, 40)
    const on = at(id, 1, { [condition]: true }, 40)
    close(on.row.perAttack, off.row.perAttack * multiplier)
  }
})

test('レオンハルトの敵数加算は5体で上限、リプレーザの範囲条件は3体から発動する', () => {
  const lion = at('char_373_lionhd', 1, { nearbyEnemyCount: 100 })
  close(lion.row.perAttack, attack(lion.result.stats.attack, 1.2))
  const two = at('char_4031_liesel', 1, { actualAttackTargetCount: 2 })
  const three = at('char_4031_liesel', 1, { actualAttackTargetCount: 3 })
  close(two.row.perAttack, two.result.stats.attack * 2.1)
  close(three.row.perAttack, two.row.perAttack * 1.2)
  close(three.row.allTargetsPerAttack, three.row.perAttack * 3)
})

test('シャマレS1は脆弱の増分30%を1.8倍にし、全倍率1.3を1.8倍にしない', () => {
  const high = at('char_254_vodfox', 1, { targetHpPercent: 40 })
  const low = at('char_254_vodfox', 1, { targetHpPercent: 39 })
  close(high.row.perAttack, attack(high.result.stats.attack, 0.6))
  close(low.row.perAttack, high.row.perAttack * 1.54)
})

test('エイヤS1は2回目から攻撃力を追加し、S3は6対象上限と短縮間隔を適用する', () => {
  const first = at('char_180_amgoat', 1, { skillActivationCount: 1 })
  const second = at('char_180_amgoat', 1, { skillActivationCount: 2 })
  close(first.row.perAttack, attack(first.result.stats.attack, 0.14))
  close(second.row.perAttack, attack(second.result.stats.attack, 0.74))
  const volcano = at('char_180_amgoat', 3, { actualAttackTargetCount: 6 })
  close(volcano.row.perAttack, attack(volcano.result.stats.attack, 1.44))
  close(volcano.row.allTargetsPerAttack, volcano.row.perAttack * 6)
  close(volcano.result.attackInterval, 0.5)
  assert.ok(output('char_180_amgoat', 3, { actualAttackTargetCount: 7 }).unsupportedReasons.length)
})

test('アンジェリーナS2は基礎間隔15%と攻撃力45%を使い、素質ASPD7を含める', () => {
  const { result, row } = at('char_291_aglina', 2)
  close(row.perAttack, result.stats.attack * 0.45)
  close(result.attackInterval, 1.9 * 0.15 / 1.07)
  close(row.dps, row.perAttack / (1.9 * 0.15 / 1.07))
})

test('スズランの脆弱を初回命中に無条件適用せず、命中前の足止め状態を指定する', () => {
  const first = at('char_358_lisa', 2, { targetAlreadySlowed: false })
  const slowed = at('char_358_lisa', 2, { targetAlreadySlowed: true })
  close(slowed.row.perAttack, first.row.perAttack * 1.2)
})

test('陣術師のスキル中は全対象へ攻撃し、カーネリアンS2のOC時だけ攻撃力を増す', () => {
  const beewax = at('char_344_beewax', 1, { actualAttackTargetCount: 4 })
  close(beewax.row.perAttack, attack(beewax.result.stats.attack, 0.6))
  close(beewax.row.allTargetsPerAttack, beewax.row.perAttack * 4)
  const mint = at('char_388_mint', 1)
  close(mint.row.perAttack, mint.result.stats.attack * 1.6)
  const normal = at('char_426_billro', 2, { overcharged: false })
  const charged = at('char_426_billro', 2, { overcharged: true })
  close(normal.row.perAttack, normal.result.stats.attack)
  close(charged.row.perAttack, attack(charged.result.stats.attack, 0.2))
  close(normal.result.attackInterval, 0.9)
  close(charged.result.attackInterval, normal.result.attackInterval!)
})

test('未確認のデータ変化や素質数値欠落ではsnapshot値を流用せず結果を止める', () => {
  const changedSkill = output('char_180_amgoat', 1, {}, skill => { skill.skillLevels[9].blackboard![0].value = 61 })
  assert.ok(changedSkill.unsupportedReasons.length)
  assert.deepEqual(changedSkill.rows, [])
  const missingTalent = output('char_405_absin', 1, {}, skill => {
    for (const candidate of skill.operatorProfile.talents![0].candidates!) candidate.blackboard = candidate.blackboard!.filter(entry => entry.key !== 'hp_ratio')
  })
  assert.ok(missingTalent.unsupportedReasons.some(reason => reason.includes('hp_ratio')))
  assert.deepEqual(missingTalent.rows, [])
})

function against(id: string, index: number, defense: number, resistance: number, guard: GuardConditions = {}) {
  const skill = record(id, index), source = sources.find(source => source.operatorId === id)!
  const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard }, enemy: { defense, resistance } })
  assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}: ${result.unsupportedReasons.join(' / ')}`)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}

test('イフリータは範囲内術耐性40%低下を先に適用し、S2の直撃と付与中のやけどを分離する', () => {
  const first = against('char_134_ifrit', 1, 900, 50, { actualAttackTargetCount: 3 })
  const scaled = attack(first.result.stats.attack, 0.2)
  close(first.row.perAttack, scaled * 0.7)
  close(first.row.allTargetsPerAttack, scaled * 0.7 * 3)
  close(first.result.attackInterval, first.result.stats.baseAttackTime / 1.8)
  const second = against('char_134_ifrit', 2, 900, 50)
  close(second.row.perAttack, second.result.stats.attack * 2.5 * 0.7)
  close(second.row.damageOverTimeDps!, second.result.stats.attack * 0.33 * 0.7)
  assert.equal(second.row.dps, null)
  assert.equal(second.row.combinedDps, null)
})

test('ケオベのそぎおとしは敵の防御力を独立参照し、スキル倍率やひとりたびを掛けない', () => {
  for (const adjacent of [false, true]) {
    const { result, row } = against('char_2013_cerber', 1, 1000, 40, { adjacentAllyPresent: adjacent })
    const a = attack(result.stats.attack, adjacent ? 0 : 0.08)
    close(row.perAttack, (a * 2.1 + 1000 * 0.4) * 0.6)
    assert.equal(row.dps, null)
  }
  const zero = against('char_2013_cerber', 2, 0, 40)
  const armored = against('char_2013_cerber', 2, 1000, 40)
  close(armored.row.perAttack - zero.row.perAttack, 1000 * 0.4 * 0.6)
  close(armored.result.attackInterval, armored.result.stats.baseAttackTime * 0.33 / 1.08)
  close(armored.row.dps, armored.row.perAttack / armored.result.attackInterval!)
})

test('ケオベS3は通常攻撃を物理化しても、そぎおとしだけは術耐性で軽減する', () => {
  const { result, row } = against('char_2013_cerber', 3, 1000, 60)
  const a = attack(result.stats.attack, 2.18)
  close(row.perAttack, Math.max(a - 1000, a * 0.05) + 1000 * 0.4 * 0.4)
  assert.equal(result.damageType, null)
  assert.deepEqual(new Set(row.attackComponents.map(component => component.damageType)), new Set(['PHYSICAL', 'ARTS']))
})

test('プリンS1の連鎖は各跳躍で15%ずつ乗算減衰し、全体と1体あたりの平均を区別する', () => {
  for (const count of [1, 2, 4]) {
    const { result, row } = against('char_4004_pudd', 1, 0, 50, { actualAttackTargetCount: count })
    const total = attack(result.stats.attack, 0.1) * 0.5
      * Array.from({ length: count }, (_, index) => 0.85 ** index).reduce((sum, scale) => sum + scale, 0)
    close(row.allTargetsPerAttack, total)
    close(row.perAttack, total / count)
    close(result.attackInterval, result.stats.baseAttackTime / 1.75)
    assert.equal(result.maxTargetCount, 4)
  }
  assert.deepEqual(output('char_4004_pudd', 1, { actualAttackTargetCount: 5 }).rows, [])
})

test('レイズS2は連鎖の減衰だけを無効にし、非ブロック素質と4体上限を維持する', () => {
  for (const targetBlocked of [false, true]) {
    const { result, row } = against('char_306_leizi', 2, 0, 40, { actualAttackTargetCount: 4, targetBlocked })
    const damage = attack(result.stats.attack, 1.5) * (targetBlocked ? 1 : 1.2) * 0.6
    close(row.perAttack, damage)
    close(row.allTargetsPerAttack, damage * 4)
    assert.equal(result.maxTargetCount, 4)
  }
  const first = against('char_306_leizi', 1, 0, 0, { actualAttackTargetCount: 2 })
  close(first.row.allTargetsPerAttack, attack(first.result.stats.attack, 1) * 1.2 * 1.85)
})

test('パッセンジャーは命中時の増幅状態を独立指定し、S2の5体連鎖と隣接条件を適用する', () => {
  for (const amplified of [false, true]) {
    for (const adjacent of [false, true]) {
      const { result, row } = against('char_472_pasngr', 2, 0, 20, {
        actualAttackTargetCount: 5, analysisAmplificationActive: amplified, adjacentEnemyPresent: adjacent,
      })
      const total = attack(result.stats.attack, adjacent ? 0.3 : 0.38) * 0.8 * (amplified ? 1.2 : 1)
        * (1 + 0.85 + 0.85 ** 2 + 0.85 ** 3 + 0.85 ** 4)
      close(row.allTargetsPerAttack, total)
      close(row.perAttack, total / 5)
      close(result.attackInterval, result.stats.baseAttackTime * 0.5)
      assert.equal(result.maxTargetCount, 5)
    }
  }
  const first = against('char_472_pasngr', 1, 0, 0)
  close(first.row.perAttack, attack(first.result.stats.attack, 0.08) * 2.5)
  assert.equal(first.row.dps, null)
})

test('追加術師でも素質の数値欠落、スキル更新、連鎖特性の変更は計算を止める', () => {
  const missing = output('char_2013_cerber', 2, {}, skill => {
    for (const candidate of skill.operatorProfile.talents![0].candidates!) candidate.blackboard = []
  })
  assert.deepEqual(missing.rows, [])
  assert.ok(missing.unsupportedReasons.some(reason => reason.includes('atk_scale')))
  const changed = output('char_134_ifrit', 2, {}, skill => {
    skill.skillLevels[9].blackboard!.find(entry => entry.key === 'burn.atk_scale')!.value = 0.4
  })
  assert.deepEqual(changed.rows, [])
  const trait = output('char_4004_pudd', 1, {}, skill => {
    skill.operatorProfile.trait!.candidates!.at(-1)!.blackboard!.find(entry => entry.key === 'attack@max_target')!.value = 6
  })
  assert.deepEqual(trait.rows, [])
})

test('アコルトS2はブームが命中するなら範囲内の他OPと素質15%を必ず反映する', () => {
  for (const ally of [false, true]) for (const hits of [0, 1, 3]) {
    const { result, row } = at('char_4051_akkord', 2, { allyInAttackRange: ally, sonicBoomHits: hits, actualAttackTargetCount: 2 }, 40)
    const atk = attack(result.stats.attack, 0.6 + (ally || hits > 0 ? 0.15 : 0))
    close(row.perAttack, atk * (1 + 0.25 * hits) * 0.6)
    close(row.allTargetsPerAttack, row.perAttack * 2)
    close(row.dps, row.perAttack / result.attackInterval!)
    assert.deepEqual(row.attackComponents!.map(component => component.role), hits ? ['MAIN', 'ADDITIONAL'] : ['MAIN'])
    assert.equal(total('char_4051_akkord', 2, result).totalDamage, null)
  }
  assert.ok(output('char_4051_akkord', 2, { sonicBoomHits: 1.5 }).unsupportedReasons.length)
  for (const ally of [false, true]) {
    const { result, row } = at('char_4051_akkord', 1, { allyInAttackRange: ally }, 40)
    close(row.perAttack, attack(result.stats.attack, ally ? 0.15 : 0) * 2 * 0.6)
  }
})

test('カーネリアンS3はダメージ前に今回の刻印を付与し、OC初撃1.2倍・4刻印以上は2倍にする', () => {
  const hitMultipliers = [1.2, 1.4, 1.6, 1.8, 2, 2]
  for (const overcharged of [false, true]) for (const progress of [0, 50, 100]) for (const stacks of [0, 1, 2, 3, 4, 5]) {
    const { result, row } = at('char_426_billro', 3, { overcharged, currentAttackRisePercent: progress, existingMarkStacks: stacks }, 40)
    const atk = attack(result.stats.attack, 2.8 * progress / 100)
    close(row.perAttack, atk * 0.6 * (overcharged ? hitMultipliers[stacks] : 1))
    close(row.dps, row.perAttack / result.attackInterval!)
    assert.equal(total('char_426_billro', 3, result).totalDamage, null)
  }
  for (const guard of [{ currentAttackRisePercent: 101 }, { existingMarkStacks: 6 }]) {
    assert.deepEqual(output('char_426_billro', 3, guard).rows, [])
  }
})

test('シャマレS2は人形の防御半減と元の30%脆弱を適用し、S1の増幅を継承しない', () => {
  for (const inRange of [false, true]) for (const hp of [39, 40]) for (const virtual of [undefined, 'PHYSICAL'] as const) {
    const result = output('char_254_vodfox', 2, { targetInDollRange: inRange, targetHpPercent: hp }, undefined,
      { enemy: { defense: 500, resistance: 40 }, virtualMainAttackType: virtual })
    assert.deepEqual(result.unsupportedReasons, [])
    const raw = virtual ? Math.max(result.stats.attack - (inRange ? 250 : 500), result.stats.attack * 0.05)
      : result.stats.attack * 0.6
    close(result.rows[0].perAttack, raw * (hp < 40 ? 1.3 : 1))
  }
})

test('レオンハルトS2は既存の術耐性低下だけを扱い、未付与時の推測値を出さない', () => {
  const { result, row } = at('char_373_lionhd', 2, { nearbyEnemyCount: 5, lionhardtDebuffActive: true, actualAttackTargetCount: 3 }, 80)
  close(row.perAttack, attack(result.stats.attack, 0.2) * 2.3 * (1 - 80 * 0.85 / 100))
  close(row.allTargetsPerAttack, row.perAttack * 3)
  assert.equal(row.dps, null)
  const blocked = output('char_373_lionhd', 2, { lionhardtDebuffActive: false })
  assert.ok(blocked.unsupportedReasons.some(reason => reason.includes('処理順序')))
  assert.deepEqual(blocked.rows, [])
  assert.equal(buildDamageCalculatorThreeCoverage([record('char_373_lionhd', 2)])[0].status, 'CONDITIONAL')
})

test('モスティマS2・ポデンコS2は通常攻撃を混ぜず、毎秒値と全対象値を返す', () => {
  for (const [id, scale, buff] of [['char_213_mostma', 1.4, 0], ['char_258_podego', 0.8, 0.09]] as const) {
    const { result, row } = at(id, 2, { actualAttackTargetCount: 4 }, 40)
    const expected = attack(result.stats.attack, buff) * scale * 0.6
    close(row.perAttack, 0)
    close(row.dps, 0)
    close(row.damageOverTimeDps, expected)
    close(row.combinedDps, expected)
    close(row.allTargetsCombinedDps, expected * 4)
    assert.equal(total(id, 2, result).totalDamage, null)
    if (id === 'char_258_podego') assert.equal(result.model!.duration, 6)
  }
})

test('炎獄ラヴァの二重範囲は指定命中数を使い、S2に通常攻撃やS1の強化を加算しない', () => {
  for (const count of [1, 2]) {
    const first = at('char_1011_lava2', 1, { lavaBlastHits: count, actualAttackTargetCount: 3 }, 40)
    close(first.row.perAttack, attack(first.result.stats.attack, 0.2) * count * 0.6)
    close(first.row.allTargetsPerAttack, first.row.perAttack * 3)
    const second = at('char_1011_lava2', 2, { lavaRingHits: count, actualAttackTargetCount: 3 }, 40)
    close(second.row.perAttack, 0)
    close(second.row.combinedDps, second.result.stats.attack * 0.5 * count * 0.6)
    close(second.row.allTargetsCombinedDps, second.row.combinedDps! * 3)
    assert.equal(total('char_1011_lava2', 2, second.result).totalDamage, null)
  }
})

test('工匠の防御・バリア・SPを攻撃力へ混ぜず、本体の物理攻撃を計算する', () => {
  for (const [id, index, atkRatio] of [['char_484_robrta', 1, 0.5], ['char_4162_cathy', 1, 0.15],
    ['char_4212_nasti', 1, 0.8], ['char_4212_nasti', 3, 1.6], ['char_4072_ironmn', 2, 0.6]] as const) {
    const result = output(id, index, {}, undefined, { enemy: { defense: 500, resistance: 80 } })
    assert.deepEqual(result.unsupportedReasons, [], `${id} S${index}`)
    const atk = attack(result.stats.attack, atkRatio)
    close(result.rows[0].perAttack, Math.max(atk - 500, atk * 0.05))
    close(result.rows[0].dps, result.rows[0].perAttack / result.attackInterval!)
  }
  const buffed = output('char_4212_nasti', 1, { selfDeviceActive: true, actualAttackTargetCount: 3 })
  assert.deepEqual(buffed.unsupportedReasons, [])
  assert.equal(buffed.maxTargetCount, 3)
  close(buffed.rows[0].allTargetsPerAttack, buffed.rows[0].perAttack * 3)
  assert.deepEqual(output('char_4212_nasti', 1, { actualAttackTargetCount: 3 }).rows, [])
  assert.deepEqual(output('char_4072_ironmn', 2, { actualAttackTargetCount: 3 }).rows, [])
})

test('アランナは自己への装置効果だけを計算し、S2の防御無視80×2.7と攻撃速度を分ける', () => {
  for (const index of [1, 2]) for (const active of [false, true]) {
    const result = output('char_4178_alanna', index, { selfDeviceActive: active }, undefined,
      { enemy: { defense: 500, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const atk = attack(result.stats.attack, index === 2 ? 0.5 : 0)
    const ignore = active ? 80 * (index === 2 ? 2.7 : 1) : 0
    close(result.rows[0].perAttack, Math.max(atk - (500 - ignore), atk * 0.05))
    close(result.attackInterval, result.stats.baseAttackTime / (1 + (index === 2 ? 50 : active ? 23 : 0) / 100))
    const virtual = output('char_4178_alanna', index, { selfDeviceActive: active }, undefined,
      { enemy: { defense: 500, resistance: 40 }, virtualMainAttackType: 'ARTS' })
    close(virtual.rows[0].perAttack, atk * 0.6)
  }
})

test('工匠の自己支援は1基の効果を加算し、未確認の2基重複では停止する', () => {
  for (const id of ['char_433_windft', 'char_4072_ironmn']) for (const devices of [0, 1]) {
    for (const index of id === 'char_433_windft' ? [1, 2] : [1]) {
      const result = output(id, index, { selfDeviceCount: devices }, undefined, { enemy: { defense: 500, resistance: 40 } })
      assert.deepEqual(result.unsupportedReasons, [])
      const ratio = id === 'char_4072_ironmn' ? devices * 0.48 : index === 1 ? devices * 0.15 : 1.6 + devices * 0.3
      const scale = id === 'char_4072_ironmn' ? 2 : index === 1 ? 2.5 : 1
      const raw = attack(result.stats.attack, ratio) * scale
      close(result.rows[0].perAttack, Math.max(raw - 500, raw * 0.05))
      if (id === 'char_433_windft' && index === 2) close(result.attackInterval, result.stats.baseAttackTime + 0.5)
      if (id === 'char_433_windft' && index === 1) assert.equal(result.rows[0].dps, null)
      assert.deepEqual(output(id, index, { selfDeviceCount: 2 }).rows, [])
      assert.equal(buildDamageCalculatorThreeCoverage([record(id, index)])[0].status, 'CONDITIONAL')
    }
  }
})

test('追加8名も未確認のスキル・特性・素質説明へ変更されたら結果を停止する', () => {
  for (const id of ['char_1011_lava2', 'char_258_podego', 'char_484_robrta', 'char_4162_cathy',
    'char_4212_nasti', 'char_4178_alanna', 'char_433_windft', 'char_4072_ironmn']) {
    const index = id === 'char_258_podego' ? 2 : 1
    for (const change of [
      (skill: SkillRecord) => { skill.skillLevels[9].description += '未確認のダメージ' },
      (skill: SkillRecord) => { skill.operatorProfile.traitDescription += '未確認のダメージ' },
      (skill: SkillRecord) => { for (const candidate of skill.operatorProfile.talents[0].candidates ?? []) candidate.description += '未確認のダメージ' },
    ]) assert.deepEqual(output(id, index, {}, change).rows, [], id)
  }
})
