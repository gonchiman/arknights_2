import test from 'node:test'
import assert from 'node:assert/strict'
import sourcesJson from '../src/data/expandedMeleeSources.json' with { type: 'json' }
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = sourcesJson as unknown as ExpandedOperatorSource[]
function record(suffix: string, skillIndex: number): SkillRecord {
  const source = sources.find(source => source.operatorId.endsWith(`_${suffix}`))!
  const entry = source.skills.find(skill => skill.skillIndex === skillIndex)!, raw = structuredClone(entry.raw)
  return { id: `${source.operatorId}/${skillIndex}`, operatorId: source.operatorId, operatorName: source.operatorName,
    skillId: entry.skillId, skillIndex, skillName: raw.name!, profession: source.profession, professionLabel: source.profession,
    rarity: source.rarity, subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId,
    nameInitial: 'OTHER', description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
    skillType: raw.skillType!, spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    raw, operatorProfile: structuredClone(source.profile) }
}
function output(suffix: string, skillIndex: number, guard: GuardConditions = {}) {
  return outputRecord(record(suffix, skillIndex), guard)
}
function outputRecord(skill: SkillRecord, guard: GuardConditions = {}, options: Partial<DamageCalculatorThreeInput> = {}) {
  const source = sources.find(source => source.operatorId === skill.operatorId)!
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100,
    skillLevelIndex: source.skillLevelIndex, conditions: { guard }, ...options })
}
function at(suffix: string, skillIndex: number, axis = 0, conditions: GuardConditions = {}) {
  const result = output(suffix, skillIndex, conditions)
  assert.deepEqual(result.unsupportedReasons, [], `${suffix} S${skillIndex}`)
  const row = result.rows.find(row => row.axisValue === axis)!
  assert.ok(row, `${suffix} S${skillIndex} axis ${axis}`)
  return { result, row }
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
const buffed = (attack: number, ratio: number) => Math.floor(attack * (1 + ratio) + 1e-9)
const physical = (attack: number, defense: number) => Math.max(attack - defense, attack * 0.05)

test('ウィーディS3は本人の350%術1発と1200/マスの移動創傷を分け、4マス超の更新は0', () => {
  for (const count of [1, 3]) {
    const { result, row } = fixed('weedy', 3, { actualAttackTargetCount: count })
    close(row.perAttack, result.stats.attack * 3.5 * .4)
    close(row.allTargetsPerAttack, row.perAttack * count)
    assert.equal(row.dps, null)
    assert.equal(result.maxTargetCount, null)
  }
  for (const distance of [0, .1, 1, 4, 4.01, 50]) {
    const { row } = fixed('weedy', 3, { damagePhase: 'movement', movementDelta: distance })
    close(row.perAttack, distance > 4 ? 0 : distance * 1200)
    assert.equal(row.dps, null)
  }
  assert.deepEqual(output('weedy', 3, { damagePhase: 'cannon' }).rows, [])
})

function fixed(suffix: string, index: number, guard: GuardConditions = {}, defense = 1000, resistance = 60,
  virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const result = outputRecord(record(suffix, index), guard, { enemy: { defense, resistance }, virtualMainAttackType })
  assert.deepEqual(result.unsupportedReasons, [], `${suffix} S${index}`)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}

test('カフカS1終了時は450%術ダメージに0.7秒残る素質ATK15%を適用する', () => {
  for (const count of [1, 4]) for (const type of ['ARTS', 'PHYSICAL'] as const) {
    const { result, row } = fixed('kafka', 1, { actualAttackTargetCount: count }, 1000, 60, type)
    const atk = buffed(result.stats.attack, .15)
    const damage = type === 'ARTS' ? atk * 4.5 * .4 : physical(atk * 4.5, 1000)
    close(row.perAttack, damage)
    close(row.allTargetsPerAttack, damage * count)
    assert.equal(row.dps, null)
    assert.equal(row.attackComponents.length, 1)
  }
})

test('サーファーS2は命中前に275奪取済みの防御へ固定最終減算し、0未満にしない', () => {
  for (const defense of [0, 100, 275, 1000, 10000]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { result, row } = fixed('surfer', 2, {}, defense, 60, type)
    const expected = type === 'PHYSICAL' ? physical(result.stats.attack, Math.max(0, defense - 275)) : result.stats.attack * .4
    close(row.perAttack, expected)
    close(result.attackInterval, 1 / 1.6)
    close(row.dps, expected / (1 / 1.6))
  }
  const changing = output('surfer', 2, { surferStealAtMaximum: false })
  assert.deepEqual(changing.rows, [])
  assert.ok(changing.unsupportedReasons.some(reason => reason.includes('処理順')))
  assert.equal(EXPANDED_MELEE_DEFINITIONS.find(value => value.operatorId.endsWith('_surfer'))!.recipes.find(value => value.skillIndex === 2)!.stages[0].periodTotal?.kind, 'UNSUPPORTED')
})

test('ライオスS1は固定JP原文のHP50%以上を境界とし、同名撃破時のみ防御40%無視', () => {
  for (const hp of [0, 49.9, 50, 50.1, 100]) for (const known of [false, true]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { result, row } = fixed('laios', 1, { selfHpPercent: hp, hasDefeatedSameEnemy: known }, 1000, 60, type)
    const atk = buffed(result.stats.attack, hp >= 50 ? .7 : 0)
    close(row.perAttack, type === 'PHYSICAL' ? physical(atk, 1000 * (known ? .6 : 1)) : atk * .4)
  }
  const { row } = fixed('laios', 1, { laiosAttackStopped: true, hasDefeatedSameEnemy: true })
  close(row.perAttack, 0)
  assert.equal(row.dps, null)
  for (const hp of [-1, 101, Number.NaN]) assert.deepEqual(output('laios', 1, { selfHpPercent: hp }).rows, [])
})

test('V10近接追加は固定スキル・素質の原文と値の改変を拒否する', () => {
  for (const [suffix, index] of [['kafka', 1], ['surfer', 2], ['laios', 1]] as const) {
    const skill = record(suffix, index)
    skill.raw.blackboard![0].value = 12345
    skill.skillLevels[9] = skill.raw
    const result = outputRecord(skill)
    assert.deepEqual(result.rows, [], suffix)
    assert.ok(result.unsupportedReasons.length > 0, suffix)
  }
})

test('バブルS2は強化後DEFの50%を参照し、ATKと敵ATK低下を混ぜない', () => {
  for (const defense of [0, 100, 1000, 10000]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { row } = fixed('bubble', 2, {}, defense, 60, type)
    // E2 Lv70 DEF645 + trust75 = 720; this is independent of the ATK pipeline.
    const base = Math.floor((645 + 75) * 2.2 + 1e-9) * .5
    close(row.perAttack, type === 'PHYSICAL' ? physical(base, defense) : base * .4)
    assert.equal(row.dps, null)
    assert.equal(row.attackComponents.length, 1)
    assert.equal(row.attackComponents[0].expectedHitCount, 1)
  }
  assert.deepEqual(output('bubble', 2, { actualAttackTargetCount: 2 }).rows, [])
})

test('アーモンドS2は拘束対象1体への180%を1回だけ計算する', () => {
  const { result, row } = fixed('almond', 2)
  close(row.perAttack, physical(result.stats.attack * 1.8, 1000))
  assert.equal(row.dps, null)
  assert.equal(row.attackComponents[0].expectedHitCount, 1)
  assert.deepEqual(output('almond', 2, { actualAttackTargetCount: 2 }).rows, [])
})

test('バイビークS1は主対象180%物理2連撃と別対象180%術1発を区別する', () => {
  for (const count of [1, 2]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { result, row } = fixed('bibeak', 1, { actualAttackTargetCount: count }, 1000, 60, type)
    const primary = 2 * (type === 'PHYSICAL' ? physical(result.stats.attack * 1.8, 1000) : result.stats.attack * 1.8 * .4)
    const extra = (count - 1) * result.stats.attack * 1.8 * .4
    close(row.perAttack, (primary + extra) / count)
    close(row.allTargetsPerAttack, primary + extra)
    assert.equal(row.attackComponents.length, count)
    if (count === 2) assert.equal(row.attackComponents[1].damageType, 'ARTS')
    assert.equal(row.dps, null)
  }
  assert.deepEqual(output('bibeak', 1, { actualAttackTargetCount: 3 }).rows, [])
})

test('ウィンドチャイムS2は確定済み蓄積0〜5回と命中時HP境界を加算して230%斬撃する', () => {
  for (const steps of [0, 1, 4, 5]) for (const hp of [49.9, 50, 100]) {
    const { result, row } = fixed('chimes', 2, { completedChargeSteps: steps, selfHpPercent: hp, actualAttackTargetCount: 4 })
    const atk = buffed(result.stats.attack, .1 * steps + (hp >= 50 ? .2 : 0))
    close(row.perAttack, physical(atk * 2.3, 1000))
    close(row.allTargetsPerAttack, row.perAttack! * 4)
    assert.equal(row.dps, null)
  }
  for (const steps of [-1, 6, Number.NaN]) assert.deepEqual(output('chimes', 2, { completedChargeSteps: steps }).rows, [])
})

test('Blitz S1はスタン時160%・S2は240%で素質のスキル別倍率を分ける', () => {
  for (const index of [1, 2]) for (const stunned of [false, true]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { result, row } = fixed('blitz', index, { targetStunned: stunned }, 1000, 60, type)
    const atk = result.stats.attack * (stunned ? index === 1 ? 1.6 : 2.4 : 1)
    close(row.perAttack, type === 'PHYSICAL' ? physical(atk, 1000) : atk * .4)
    close(result.attackInterval, result.stats.baseAttackTime / (index === 2 ? 3 : 1))
  }
})

test('グレイディーアS3は130%術1判定に重量3以下の130%素質だけを乗せる', () => {
  for (const weight of [0, 3, 4, 10]) {
    const { result, row } = fixed('glady', 3, { targetWeight: weight, actualAttackTargetCount: 3 })
    const expected = result.stats.attack * 1.3 * (weight <= 3 ? 1.3 : 1) * .4
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * 3)
    assert.equal(row.dps, null)
    assert.equal(row.attackComponents[0].expectedHitCount, 1)
  }
})

test('Tachanka S1の燃焼は70%術1判定、射撃は2連撃でエリア内のみDEF200無視', () => {
  const { result, row } = fixed('tachak', 1, { actualAttackTargetCount: 4 })
  close(row.perAttack, result.stats.attack * .7 * .4)
  close(row.allTargetsPerAttack, row.perAttack! * 4)
  assert.equal(row.attackComponents[0].expectedHitCount, 1)
  assert.equal(row.dps, null)
  for (const inside of [false, true]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { result, row } = fixed('tachak', 1, { damagePhase: 'normal', targetInBurningArea: inside }, 1000, 60, type)
    close(row.perAttack, 2 * (type === 'PHYSICAL' ? physical(result.stats.attack, inside ? 800 : 1000) : result.stats.attack * .4))
    assert.equal(row.attackComponents[0].expectedHitCount, 2)
  }
})

test('パズルS2は累積術15%×1〜10で満HPへの120%攻撃倍率を継承しない', () => {
  for (const stacks of [1, 5, 10]) for (const full of [false, true]) {
    const { result, row } = fixed('puzzle', 2, { damagePhase: 'poison', poisonStacks: stacks, targetFullHp: full })
    close(row.perAttack, result.stats.attack * .15 * stacks * .4)
    assert.equal(row.dps, null)
    assert.equal(row.attackComponents[0].expectedHitCount, 1)
  }
  for (const full of [false, true]) {
    const { result, row } = fixed('puzzle', 2, { targetFullHp: full })
    close(row.perAttack, physical(result.stats.attack * (full ? 1.2 : 1), 1000))
    close(result.attackInterval, result.stats.baseAttackTime / 1.7)
  }
  for (const stacks of [0, 11]) assert.deepEqual(output('puzzle', 2, { poisonStacks: stacks }).rows, [])
})

test('フレイムテイルS1の回避後・S3の回避状態を主攻撃の2連撃と対象上限へ反映する', () => {
  for (const index of [1, 3]) for (const dodge of [false, true]) {
    if (index === 1 && !dodge) {
      assert.deepEqual(output('flamtl', 1, { dodgeAttackReady: false }).rows, [])
      continue
    }
    const max = dodge ? index === 1 ? 2 : 3 : 1
    for (const type of ['PHYSICAL', 'ARTS'] as const) {
      const { result, row } = fixed('flamtl', index, { dodgeAttackReady: dodge, actualAttackTargetCount: max }, 500, 60, type)
      const atk = buffed(result.stats.attack, index === 3 ? .9 : 0)
      const perHit = type === 'PHYSICAL' ? physical(atk, 500) : atk * .4
      close(row.perAttack, perHit * (dodge ? 2 : 1))
      close(row.allTargetsPerAttack, perHit * (dodge ? 2 : 1) * max)
      assert.equal(row.dps, null)
      assert.equal(row.attackComponents.length, 1)
      assert.deepEqual(output('flamtl', index, { dodgeAttackReady: dodge, actualAttackTargetCount: max + 1 }).rows, [])
    }
  }
  const { result, row } = fixed('flamtl', 2, { dodgeAttackReady: true, actualAttackTargetCount: 6 })
  close(row.perAttack, physical(result.stats.attack * 2.4, 1000) * 2)
  assert.equal(row.attackComponents.length, 1)
})

test('ノイルコーンS1は練気上限なら150%4連撃、途中の素質付与順を推測しない', () => {
  for (const hp of [10, 100]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
    const { result, row } = fixed('noirc2', 1, { spiritStacks: 3, selfHpPercent: hp }, 1000, 60, type)
    const atk = buffed(result.stats.attack, .21)
    close(row.perAttack, 4 * (type === 'PHYSICAL' ? physical(atk * 1.5, 1000) : atk * 1.5 * .4))
    assert.equal(row.dps, null)
  }
  for (const stacks of [0, 1, 2]) {
    const result = output('noirc2', 1, { spiritStacks: stacks })
    assert.deepEqual(result.rows, [])
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('付与順')))
  }
  assert.ok(output('noirc2', 1).rows.length > 0)
})

test('推撃手のS1は次の通常攻撃の倍率と、ブロック数を参照する共通特性を適用する', () => {
  for (const [suffix, scale] of [['panda', 1], ['weedy', 1.5], ['sqrrel', 1.5]] as const) {
    for (const count of [1, 2]) for (const type of ['PHYSICAL', 'ARTS'] as const) {
      const { result, row } = fixed(suffix, 1, { actualAttackTargetCount: count }, 500, 60, type)
      const attack = result.stats.attack * scale
      const expected = type === 'PHYSICAL' ? physical(attack, 500) : attack * .4
      close(row.perAttack, expected)
      close(row.allTargetsPerAttack, expected * count)
      assert.equal(result.maxTargetCount, 2)
      assert.equal(row.dps, null)
      assert.equal(result.traitEvaluation?.evaluations.find(effect => effect.effectId === 'block-count-target-limit')?.status, 'APPLIED')
    }
    assert.deepEqual(output(suffix, 1, { actualAttackTargetCount: 3 }).rows, [])
  }
})

test('推撃手のS2の範囲攻撃には通常攻撃のブロック上限を重ねない', () => {
  for (const suffix of ['panda', 'weedy', 'sqrrel']) {
    const { result, row } = fixed(suffix, 2, { actualAttackTargetCount: 3 })
    assert.equal(result.maxTargetCount, null)
    assert.equal(result.traitEvaluation?.evaluations.find(effect => effect.effectId === 'block-count-target-limit')?.status, 'NOT_RELEVANT')
    close(row.allTargetsPerAttack, row.perAttack * 3)
  }
})
