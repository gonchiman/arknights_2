import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXPANDED_CASTER_DEFINITIONS } from '../src/lib/expandedCasterDefinitions.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { calculateDamageThreePeriodTotal } from '../src/lib/damageCalculatorThreePeriodTotal.ts'
import { buildExpandedTalentStructures } from '../src/lib/expandedTalentStructure.ts'
import { buildDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/expandedCasterSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
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
  const stage = EXPANDED_CASTER_DEFINITIONS.find(definition => definition.operatorId === id)!
    .recipes.find(recipe => recipe.skillIndex === index)!.stages[0]
  return calculateDamageThreePeriodTotal({ stage, attackKind: result.attackKind,
    combinedDps: result.rows[0].combinedDps, allTargetsCombinedDps: result.rows[0].allTargetsCombinedDps })
}

test('追加術師・補助25技能の初期条件は原資料に一致し、全素質と特性を評価する', () => {
  assert.equal(EXPANDED_CASTER_DEFINITIONS.length, 9)
  assert.equal(EXPANDED_CASTER_DEFINITIONS.flatMap(definition => definition.recipes).length, 25)
  for (const source of sources) {
    assert.equal('passives' in source, false)
    assert.equal('coverage' in source, false)
    for (const skill of source.skills) {
      const result = output(source.operatorId, skill.skillIndex)
      assert.deepEqual(result.unsupportedReasons, [], `${source.operatorName} S${skill.skillIndex}`)
      assert.ok(result.rows.length > 0)
      const talents = buildExpandedTalentStructures([record(source.operatorId, skill.skillIndex)])
      assert.equal(talents.length, getOperatorPassives(source.profile, 2, source.profile.phases[2].maxLevel!, 1).sources.filter(value => value.sourceKind === 'TALENT').length)
      assert.ok(talents.every(talent => talent.issues.length === 0))
    }
  }
})

test('シーS1/S3は積墨をスキルATKと加算し、小自在を本体へ合算しない', () => {
  for (const stacks of [0, 7, 15]) {
    const first = at('char_2015_dusk', 1, { duskKillStacks: stacks, actualAttackTargetCount: 3 }, 40)
    const expected = attack(first.result.stats.attack, stacks * 0.02) * 2.5 * 0.6
    close(first.row.perAttack, expected)
    close(first.row.allTargetsPerAttack, expected * 3)
    const third = at('char_2015_dusk', 3, { duskKillStacks: stacks, actualAttackTargetCount: 3 }, 40)
    close(third.row.perAttack, attack(third.result.stats.attack, 1.2 + stacks * 0.02) * 0.6)
    close(third.result.attackInterval, 3.3)
    assert.equal(third.row.attackComponents?.length, 1)
    assert.equal(total('char_2015_dusk', 3, third.result).totalDamage, null)
  }
  for (const index of [1, 2, 3]) {
    const freeling = output('char_2015_dusk', index, { duskDamageSource: 'FREELING' })
    assert.ok(freeling.unsupportedReasons.some(reason => reason.includes('小自在')))
    assert.deepEqual(freeling.rows, [])
  }
})

test('シーS2はHP50%境界で術ダメージのみ1.3倍し、仮想物理には掛けない', () => {
  for (const targetHpPercent of [49, 50, 51]) for (const virtualMainAttackType of ['ARTS', 'PHYSICAL'] as const) {
    const result = output('char_2015_dusk', 2, { duskKillStacks: 15, targetHpPercent, actualAttackTargetCount: 4 }, undefined,
      { virtualMainAttackType, enemy: { defense: 300, resistance: 40 } })
    assert.deepEqual(result.unsupportedReasons, [])
    const base = attack(result.stats.attack, 0.85)
    const expected = virtualMainAttackType === 'ARTS' ? base * 0.6 * (targetHpPercent <= 50 ? 1.3 : 1) : base - 300
    close(result.rows[0].perAttack, expected)
    close(result.rows[0].allTargetsPerAttack, expected * 4)
    close(result.attackInterval, 2.9 / 1.55)
  }
})

test('リン3技能は発動状態の範囲攻撃を計算し、盾破壊を通常攻撃へ混ぜない', () => {
  for (const index of [1, 2, 3]) {
    const { result, row } = at('char_4080_lin', index, { actualAttackTargetCount: 3 }, 40)
    const expected = attack(result.stats.attack, index === 1 ? 0.6 : index === 3 ? 2 : 0) * 0.6
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * 3)
    close(result.attackInterval, index === 1 ? 3 : index === 2 ? 2 / 2.3 : 2)
    assert.equal(row.attackComponents?.length, 1)
    assert.equal(total('char_4080_lin', index, result).totalDamage, null)
    const blocked = output('char_4080_lin', index, { linPhase: 'SHIELD' })
    assert.ok(blocked.unsupportedReasons.some(reason => reason.includes('盾破壊')))
    assert.deepEqual(blocked.rows, [])
  }
  const coverage = buildDamageCalculatorThreeCoverage(sources.find(source => source.operatorId === 'char_4080_lin')!.skills.map(skill => record('char_4080_lin', skill.skillIndex)))
  assert.ok(coverage.every(row => row.status === 'CONDITIONAL'))
})

test('ノーシスは凍結済み対象のRES15低下と50%脆弱を各命中へ適用する', () => {
  for (const [index, scale, count] of [[1, 3.4, 1], [2, 2, 3], [3, 1, 2]] as const) {
    const { result, row } = at('char_206_gnosis', index, { actualAttackTargetCount: count }, 40)
    const expected = result.stats.attack * scale * 0.75 * 1.5
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * count)
    assert.equal(row.dps, null)
    const zero = at('char_206_gnosis', index, {}, 0)
    close(zero.row.perAttack, result.stats.attack * scale * 1.5)
    const changing = output('char_206_gnosis', index, { gnosisTargetFrozen: false })
    assert.ok(changing.unsupportedReasons.length > 0)
    assert.deepEqual(changing.rows, [])
  }
  const end = at('char_206_gnosis', 3, { gnosisPhase: 'ENDING', actualAttackTargetCount: 5 }, 40)
  close(end.row.perAttack, end.result.stats.attack * 6 * 0.75 * 1.5)
  close(end.row.allTargetsPerAttack, end.row.perAttack * 5)
  const virtual = output('char_206_gnosis', 1, {}, undefined, { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, (virtual.stats.attack * 1.7 - 500) * 2 * 1.5)
})

test('アステジーニは単体で1本、2〜4体で2本の各跳躍を個別軽減する', () => {
  for (const index of [1, 2]) for (const count of [1, 2, 3, 4]) for (const stacks of [0, 5]) {
    const { result, row } = at('char_135_halo', index, { actualAttackTargetCount: count, astgenneSpeedStacks: stacks }, 40)
    const base = attack(result.stats.attack, index === 2 ? 0.4 : 0)
    const expected = base * (index === 1 ? 1.25 : 1) * 0.6
      * Array.from({ length: count }, (_, i) => 0.85 ** i).reduce((a, b) => a + b, 0) * (count === 1 ? 1 : 2)
    close(row.allTargetsPerAttack, expected)
    close(row.perAttack, expected / count)
    if (index === 2) close(result.attackInterval, 2.3 / (1 + stacks * 0.04))
  }
  const physical = output('char_135_halo', 2, { actualAttackTargetCount: 4 }, undefined,
    { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(physical.unsupportedReasons, [])
  const base = attack(physical.stats.attack, 0.4)
  const expected = [0, 1, 2, 3].reduce((value, jump) => value + Math.max(base * 0.85 ** jump - 500, base * 0.85 ** jump * 0.05) * 2, 0)
  close(physical.rows[0].allTargetsPerAttack, expected)
  const unreachable = output('char_135_halo', 1, { astgenneAllTargetsReachable: false })
  assert.ok(unreachable.unsupportedReasons.length > 0)
})

test('アロマS1は既攻撃対象の空中追加を別軽減し、初撃倍率の適用範囲を推測しない', () => {
  for (const airborne of [false, true]) {
    const { result, row } = at('char_446_aroma', 1, { aromaTargetAirborne: airborne }, 40)
    const expected = result.stats.attack * (2.1 + (airborne ? 0.9 : 0)) * 0.6
    close(row.perAttack, expected)
  }
  const virtual = output('char_446_aroma', 1, { aromaTargetAirborne: true }, undefined,
    { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 1000, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, virtual.stats.attack * 2.1 - 1000 + virtual.stats.attack * 0.9 * 0.6)
  assert.equal(virtual.rows[0].attackComponents![0].damageType, 'PHYSICAL')
  assert.equal(virtual.rows[0].attackComponents![1].damageType, 'ARTS')
  for (const airborne of [false, true]) {
    const first = output('char_446_aroma', 1, { aromaFirstHit: true, aromaTargetAirborne: airborne })
    assert.ok(first.unsupportedReasons.some(reason => reason.includes('初撃')))
    assert.deepEqual(first.rows, [])
  }
})

test('アロマS2は通常攻撃と浮遊終了を分離し、初撃未確認の落下を拒否する', () => {
  for (const first of [false, true]) {
    const normal = at('char_446_aroma', 2, { aromaFirstHit: first }, 40)
    close(normal.row.perAttack, attack(normal.result.stats.attack, 1) * (first ? 1.1 : 1) * 0.6)
    assert.equal(normal.row.dps, null)
  }
  const fall = at('char_446_aroma', 2, { aromaPhase: 'LANDING' }, 40)
  close(fall.row.perAttack, attack(fall.result.stats.attack, 1) * 1.1 * 0.6)
  assert.equal(fall.result.maxTargetCount, 1)
  assert.equal(fall.row.dps, null)
  assert.ok(output('char_446_aroma', 2, { aromaPhase: 'LANDING', aromaFirstHit: true }).unsupportedReasons.length > 0)
  assert.ok(output('char_446_aroma', 2, { aromaPhase: 'LANDING', aromaSkillActive: false }).unsupportedReasons.length > 0)
})

test('未対応の召喚・状態移行・配置・初撃を実装状況に残す', () => {
  const coverage = buildDamageCalculatorThreeCoverage(sources.flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex))))
  const previousIds = ['char_2015_dusk', 'char_4080_lin', 'char_206_gnosis', 'char_135_halo', 'char_446_aroma']
  for (const row of coverage.filter(row => previousIds.includes(row.skill.operatorId) && !(row.skill.operatorId === 'char_446_aroma' && row.skill.skillIndex === 2))) {
    assert.equal(row.status, 'CONDITIONAL', `${row.skill.operatorName} S${row.skill.skillIndex}`)
    assert.ok(row.deferredReasons.length > 0)
  }
})

test('追加術師のスキル・特性・素質の原資料が変更されたら停止する', () => {
  for (const source of sources) for (const change of [
    (skill: SkillRecord) => { skill.skillLevels.at(-1)!.description += '未知の攻撃効果' },
    (skill: SkillRecord) => { skill.operatorProfile.talents!.forEach(talent => talent.candidates!.forEach(candidate => { candidate.description += '未知の素質効果' })) },
  ]) {
    const result = output(source.operatorId, 1, {}, change)
    assert.ok(result.unsupportedReasons.length > 0, source.operatorName)
    assert.deepEqual(result.rows, [])
  }
  for (const id of ['char_2015_dusk', 'char_135_halo']) {
    const result = output(id, 1, {}, skill => {
      skill.operatorProfile.talents!.forEach(talent => talent.candidates!.forEach(candidate => {
        const limit = candidate.blackboard?.find(entry => entry.key === 'max_stack_cnt')
        if (limit) limit.value = 1
      }))
    })
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('累積上限')))
    assert.deepEqual(result.rows, [])
  }
})

test('ヴィイの斉射は転置・主攻撃・通常貯蔵の順に生成し、S2の強化を各弾ごとに進める', () => {
  for (const merged of [0, 1, 2, 3]) for (const stored of merged === 3 ? [0] : [0, 1, 2]) {
    const guard = { veenMergedCharges: merged, veenNormalCharges: stored }
    const first = at('char_4226_veen', 1, guard, 40)
    const base = first.result.stats.attack
    const talent = merged > 0 ? 0.1 : 0
    close(first.row.perAttack, attack(base, talent) * (1 + 3 * merged + stored) * 0.6)
    for (const starting of [0, 4, 9]) {
      const second = at('char_4226_veen', 2, { ...guard, veenAttackStacks: starting }, 40)
      const buffed = (previous: number) => attack(base, talent + 0.15 * Math.min(9, starting + previous))
      const expected = Array.from({ length: merged }, (_, i) => buffed(i * 3) * 3).reduce((a, b) => a + b, 0)
        + buffed(merged * 3)
        + Array.from({ length: stored }, (_, i) => buffed(merged * 3 + i + 1)).reduce((a, b) => a + b, 0)
      close(second.row.perAttack, expected * 0.6)
      assert.equal(second.row.combinedDps, null)
    }
    const third = at('char_4226_veen', 3, guard, 40)
    close(third.row.perAttack, attack(base, talent) * (1 + 1.65 * (3 * merged + stored)) * 0.6)
    assert.equal(third.result.attackInterval, null)
  }
  const virtual = output('char_4226_veen', 2, { veenMergedCharges: 1, veenNormalCharges: 2 }, undefined,
    { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  const base = virtual.stats.attack
  close(virtual.rows[0].perAttack, attack(base, 0.1) * 3 - 500 + attack(base, 0.55) - 500
    + attack(base, 0.7) - 500 + attack(base, 0.85) - 500)
})

test('ヴィイのDOTは90×重複数の固定術ダメージで、斉射の直撃とは合算しない', () => {
  for (const index of [1, 2, 3]) for (const stacks of [1, 2, 3]) {
    const { result, row } = at('char_4226_veen', index, { veenPhase: 'DOT', veenDotStacks: stacks, veenTargetAlreadyAffected: true }, 40)
    close(row.damageOverTimeDps, 90 * stacks * 0.6)
    assert.equal(row.perAttack, 0)
    assert.equal(row.combinedDps, null)
    assert.equal(total('char_4226_veen', index, result).totalDamage, null)
  }
  for (const invalid of [{ veenMergedCharges: 3, veenNormalCharges: 1 }, { veenTargetAlreadyAffected: true }]) {
    const result = output('char_4226_veen', 1, invalid)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('マルシルは魔力保持時のATK20%を加算し、使い魔2段階とパーティーASPDを区別する', () => {
  const first = at('char_4141_marcil', 1, { marcilleManaAfterCost: 78 }, 40)
  close(first.row.perAttack, attack(first.result.stats.attack, 1.6) * 0.6)
  assert.equal(first.row.dps, null)
  for (const mana of [0, 1, 80]) for (const upgraded of [false, true]) for (const party of [false, true]) {
    const second = at('char_4141_marcil', 2, { marcilleManaAfterCost: mana,
      marcilleFamiliarStage: upgraded ? 'UPGRADED' : 'FIRST', marcilleFullParty: party }, 40)
    close(second.row.perAttack, attack(second.result.stats.attack, 1 + (mana > 0 ? 0.2 : 0)) * 0.6)
    close(second.result.attackInterval, 2.9 / (1 + (upgraded ? 0.6 : 0) + (party ? 0.25 : 0)))
  }
  const third = at('char_4141_marcil', 3, { marcilleManaAfterCost: 72, actualAttackTargetCount: 4 }, 40)
  close(third.row.perAttack, attack(third.result.stats.attack, 0.2) * 3.9 * 0.6)
  close(third.row.allTargetsPerAttack, third.row.perAttack * 4)
  assert.equal(total('char_4141_marcil', 3, third.result).totalDamage, null)
  for (const [index, mana] of [[1, 0], [3, 0], [1, 79], [3, 73]]) {
    const invalid = output('char_4141_marcil', index, { marcilleManaAfterCost: mana })
    assert.ok(invalid.unsupportedReasons.length > 0)
    assert.deepEqual(invalid.rows, [])
  }
})

test('ロゴスは各対象への攻撃ごとに追加攻撃40%を抽選し、各術ダメージへ軽減前150を加える', () => {
  for (const [index, bonus, count] of [[1, 1, 1], [3, 3, 1], [3, 3, 4]] as const) {
    const { result, row } = at('char_4133_logos', index, { actualAttackTargetCount: count }, 40)
    const atk = attack(result.stats.attack, bonus)
    const expected = (atk + 150 + 0.4 * (atk * 0.6 + 150)) * 0.7
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * count)
  }
  for (const stacks of [0, 5, 10]) {
    const { result, row } = at('char_4133_logos', 2, { logosLockStacks: stacks }, 40)
    close(row.perAttack, (result.stats.attack * (0.75 + stacks * 0.15) + 150
      + 0.4 * (result.stats.attack * 0.6 + 150)) * 0.7)
    close(result.attackInterval, 0.5)
    close(row.dps, row.perAttack / 0.5)
    assert.equal(total('char_4133_logos', 2, result).totalDamage, null)
  }
  const virtual = output('char_4133_logos', 3, { actualAttackTargetCount: 4 }, undefined,
    { virtualMainAttackType: 'PHYSICAL', enemy: { defense: 500, resistance: 40 } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  const atk = attack(virtual.stats.attack, 3)
  close(virtual.rows[0].perAttack, atk - 500 + 0.4 * (atk * 0.6 + 150) * 0.7)
  close(virtual.rows[0].allTargetsPerAttack, virtual.rows[0].perAttack * 4)
})

test('ロゴスの初回付与・即死転移と、異なる抽選対象の混在は数値を出さない', () => {
  for (const index of [1, 2, 3]) for (const conditions of [
    { logosPhase: 'INITIAL' }, { logosAllDebuffed: false }, { logosWholePoolSelected: false },
  ]) {
    const result = output('char_4133_logos', index, conditions)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
  const execution = output('char_4133_logos', 1, { logosPhase: 'EXECUTION' })
  assert.ok(execution.unsupportedReasons.some(reason => reason.includes('斬殺')))
  assert.deepEqual(execution.rows, [])
})

test('聖聆プラマニクスは直接攻撃と積雪毎秒値を分離し、凍結RES低下の後に無視を適用する', () => {
  for (const frozen of [false, true]) for (const [index, scale, buff] of [[1, 5.2, 0], [2, 3.8, 0], [3, 2.6, 1]] as const) {
    const { result, row } = at('char_1046_sbell2', index, { sbellTargetFrozen: frozen, actualAttackTargetCount: 3 }, 40)
    const res = 40 - (frozen ? 15 : 0) - (index === 3 ? 10 : 0)
    close(row.perAttack, attack(result.stats.attack, buff) * scale * (1 - res / 100))
    close(row.allTargetsPerAttack, row.perAttack * 3)
    if (index === 3) close(result.attackInterval, 2 / 1.3)
  }
  const snow = at('char_1046_sbell2', 2, { sbellPhase: 'SNOW_DOT', sbellTargetFrozen: true, actualAttackTargetCount: 3 }, 40)
  close(snow.row.damageOverTimeDps, snow.result.stats.attack * 0.2 * 0.75)
  assert.equal(snow.row.perAttack, 0)
  close(snow.row.allTargetsCombinedDps, snow.row.damageOverTimeDps! * 3)
  for (const index of [1, 2, 3]) for (const conditions of [
    { sbellPhase: 'SNOW_ENTRY' }, { sbellTargetChangingFreeze: true }, { sbellSelfFrozen: true },
  ]) {
    const result = output('char_1046_sbell2', index, conditions)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('追加4人の未確認イベントは実装状況の保留理由へ残す', () => {
  const conditional = ['char_4141_marcil', 'char_4133_logos', 'char_1046_sbell2']
  const coverage = buildDamageCalculatorThreeCoverage(sources.filter(source => conditional.includes(source.operatorId))
    .flatMap(source => source.skills.map(skill => record(source.operatorId, skill.skillIndex))))
  for (const row of coverage.filter(row => !(row.skill.operatorId === 'char_4141_marcil' && row.skill.skillIndex === 2))) {
    assert.equal(row.status, 'CONDITIONAL', `${row.skill.operatorName} S${row.skill.skillIndex}`)
    assert.ok(row.deferredReasons.length > 0)
  }
})

