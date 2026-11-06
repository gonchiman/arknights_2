import test from 'node:test'
import assert from 'node:assert/strict'
import sourcesJson from '../src/data/expandedMeleeSources.json' with { type: 'json' }
import { EXPANDED_MELEE_DEFINITIONS } from '../src/lib/expandedMeleeDefinitions.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { getDamageThreeComparisonEntries, evaluateDamageThreeComparisonEntry } from '../src/lib/damageCalculatorThreeComparison.ts'
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

function fixed(suffix: string, index: number, guard: GuardConditions = {}, defense = 1000, resistance = 60,
  virtualMainAttackType?: 'PHYSICAL' | 'ARTS') {
  const result = outputRecord(record(suffix, index), guard, { enemy: { defense, resistance }, virtualMainAttackType })
  assert.deepEqual(result.unsupportedReasons, [], `${suffix} S${index}`)
  assert.equal(result.rows.length, 1)
  return { result, row: result.rows[0] }
}

test('フランカは20/50%の無視を軽減後に平均し、高防御でも非発動側の最低保証を残す', () => {
  for (const index of [1, 2]) for (const defense of [0, 1000, 10000]) {
    const { result, row } = fixed('franka', index, {}, defense)
    const power = buffed(result.stats.attack, index === 1 ? 0.45 : 1), chance = index === 1 ? 0.2 : 0.5
    const nonProc = physical(power, defense), proc = power
    close(row.perAttack, nonProc * (1 - chance) + proc * chance)
    const component = row.attackComponents[0]
    close(component.defenseIgnoreChance, chance)
    close(component.defenseIgnoreRatio, 1)
    close(component.branches.find(branch => branch.id === 'NORMAL')!.damage, nonProc)
    close(component.branches.find(branch => branch.id === 'IGNORE')!.damage, proc)
    close(result.attackInterval, index === 1 ? 1.5 / 1.45 : 1.5)
    close(row.dps, row.perAttack / result.attackInterval!)
    if (defense === 10000) assert.notEqual(row.perAttack, physical(power, defense * (1 - chance)))
    const entry = getDamageThreeComparisonEntries([record('franka', index)])[0]
    assert.ok(entry)
    const total = evaluateDamageThreeComparisonEntry(entry, { defense, resistance: 60, enemyCount: 1 })
    close(total.totalDamage, row.dps! * (index === 1 ? 35 : 30))
  }
  assert.deepEqual(output('franka', 2, { actualAttackTargetCount: 2 }).rows, [])
})

test('フランカを仮想術に変えても防御無視をRES無視に変換しない', () => {
  for (const index of [1, 2]) for (const defense of [0, 10000]) {
    const { result, row } = fixed('franka', index, {}, defense, 60, 'ARTS')
    const power = buffed(result.stats.attack, index === 1 ? 0.45 : 1)
    close(row.perAttack, power * 0.4)
    for (const branch of row.attackComponents[0].branches) close(branch.damage, power * 0.4)
  }
})

test('フランカの発動確率やS2素質倍率の欠落・更新は、固定値で補わず計算を止める', () => {
  for (const index of [1, 2]) {
    const changed = record('franka', index)
    for (const talent of changed.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
      candidate.blackboard = candidate.blackboard?.filter(entry => entry.key !== 'prob')
    }
    assert.deepEqual(outputRecord(changed).rows, [])
  }
  const changed = record('franka', 2)
  changed.skillLevels[9].blackboard = changed.skillLevels[9].blackboard?.filter(entry => entry.key !== 'talent_scale')
  assert.deepEqual(outputRecord(changed).rows, [])
})

test('罠師の発動1回は本人の射撃周期を使わず、ロビンの350/380%を個別軽減する', () => {
  for (const index of [1, 2]) for (const defense of [0, 1000, 10000]) {
    const trap = fixed('robin', index, {}, defense)
    close(trap.row.perAttack, physical(trap.result.stats.attack * (index === 1 ? 3.5 : 3.8), defense))
    assert.equal(trap.row.dps, null)
    assert.equal(trap.result.attackInterval, null)
    const shooting = fixed('robin', index, { damagePhase: 'normal' }, defense)
    close(shooting.row.perAttack, physical(shooting.result.stats.attack, defense))
    close(shooting.row.dps, shooting.row.perAttack / 0.85)
  }
  assert.deepEqual(output('robin', 1, { actualAttackTargetCount: 2 }).rows, [])
})

test('Frostの罠と追加通常攻撃はDEFを4回別々に引き、範囲外では追撃しない', () => {
  for (const inRange of [false, true]) for (const defense of [0, 1000, 10000]) {
    const { result, row } = fixed('rfrost', 2, { targetInAttackRange: inRange }, defense)
    const power = result.stats.attack
    close(row.perAttack, physical(power * 2, defense) + (inRange ? physical(power * 1.8, defense) * 3 : 0))
    assert.equal(row.dps, null)
    assert.deepEqual(row.attackComponents.map(component => component.role), inRange ? ['MAIN', 'ADDITIONAL'] : ['MAIN'])
  }
  const first = fixed('rfrost', 1)
  close(first.row.perAttack, physical(first.result.stats.attack * 3.5, 1000))
  const shooting = fixed('rfrost', 2, { damagePhase: 'normal', targetInAttackRange: true })
  close(shooting.row.perAttack, physical(shooting.result.stats.attack, 1000))
  assert.deepEqual(output('rfrost', 2, { actualAttackTargetCount: 2 }).rows, [])
})

test('Frostの仮想属性は罠だけを変換し、追加射撃の物理属性と3ヒットを保持する', () => {
  const { result, row } = fixed('rfrost', 2, { targetInAttackRange: true }, 1000, 60, 'ARTS')
  close(row.perAttack, result.stats.attack * 2 * 0.4 + physical(result.stats.attack * 1.8, 1000) * 3)
  assert.deepEqual(row.attackComponents.map(component => component.damageType), ['ARTS', 'PHYSICAL'])
})

test('ウルフェナイトは罠1個の範囲ダメージを数え、S2初回減防を推測しない', () => {
  const first = fixed('wulfen', 1, { actualAttackTargetCount: 4 })
  close(first.row.allTargetsPerAttack, physical(first.result.stats.attack * 2.5, 1000) * 4)
  const second = fixed('wulfen', 2, { actualAttackTargetCount: 4 })
  close(second.row.allTargetsPerAttack, physical(second.result.stats.attack * 2.5, 750) * 2 * 4)
  assert.equal(second.row.dps, null)
  for (const active of [false, true]) {
    const normal = fixed('wulfen', 2, { damagePhase: 'normal', normalTargetDebuffActive: active })
    close(normal.row.perAttack, physical(normal.result.stats.attack, active ? 750 : 1000))
  }
  const blocked = output('wulfen', 2, { damagePhase: 'first-trap' })
  assert.deepEqual(blocked.rows, [])
  assert.ok(blocked.unsupportedReasons.some(reason => reason.includes('適用順序')))
  const virtual = fixed('wulfen', 2, {}, 1000, 60, 'ARTS')
  close(virtual.row.perAttack, virtual.result.stats.attack * 2.5 * 2 * 0.4)
})

test('Elaの会心30/100%は防御軽減後の期待値で、S2の800無視を一度だけ引く', () => {
  for (const index of [1, 2, 3]) for (const target of ['GROUND', 'MINE', 'AIR']) for (const defense of [0, 800, 1000, 10000]) {
    const count = index === 2 ? 3 : 1
    const { result, row } = fixed('ela', index, { elaTargetState: target, actualAttackTargetCount: count }, defense)
    const power = buffed(result.stats.attack, index === 3 ? 0.9 : 0)
    const appliedDefense = Math.max(0, defense - (index === 2 ? 800 : 0)), chance = target === 'MINE' ? 1 : 0.3
    const expected = (physical(power, appliedDefense) * (1 - chance) + physical(power * 1.5, appliedDefense) * chance)
      * (index === 3 && target === 'MINE' ? 1.35 : 1)
    close(row.perAttack, expected)
    close(row.allTargetsPerAttack, expected * count)
    close(result.attackInterval, index === 3 ? 0.5 : 0.85)
  }
  assert.deepEqual(output('ela', 3, { elaTargetState: 'AIR_MINE' }).rows, [])
  assert.deepEqual(output('ela', 1, { actualAttackTargetCount: 2 }).rows, [])
})

test('Elaの仮想術攻撃に防御800無視を転用せず、会心倍率は保持する', () => {
  for (const target of ['GROUND', 'MINE']) {
    const { result, row } = fixed('ela', 2, { elaTargetState: target }, 1000, 60, 'ARTS')
    close(row.perAttack, result.stats.attack * 0.4 * (target === 'MINE' ? 1.5 : 1.15))
  }
})

test('ウァンの連続配置は碁石にだけ与ダメ10%とRES9無視を適用する', () => {
  for (const stacks of [0, 1, 3]) for (const index of [2, 3]) {
    const { result, row } = fixed('wang', index, { stoneBonusStacks: stacks, actualAttackTargetCount: 4 })
    close(row.allTargetsPerAttack, result.stats.attack * (index === 2 ? 5.8 : 3.8) * (1 - (60 - 9 * stacks) / 100)
      * (1 + 0.1 * stacks) * 4)
    assert.equal(row.dps, null)
    const virtual = fixed('wang', index, { stoneBonusStacks: stacks }, 1000, 60, 'PHYSICAL')
    close(virtual.row.perAttack, physical(virtual.result.stats.attack * (index === 2 ? 5.8 : 3.8), 1000) * (1 + 0.1 * stacks))
  }
  for (const index of [1, 2]) {
    const { result, row } = fixed('wang', index, { damagePhase: 'normal', stoneBonusStacks: 3 })
    close(row.perAttack, physical(result.stats.attack, 1000))
    close(result.resistanceIgnoreFixed, 0)
  }
})

test('ウァンS1は単一の135%毎秒効果だけ、S3本人攻撃停止と不正な重複数を拒否する', () => {
  for (const stacks of [0, 3]) {
    const { result, row } = fixed('wang', 1, { stoneBonusStacks: stacks })
    close(row.perAttack, 0)
    close(row.damageOverTimeDps, result.stats.attack * 1.35 * (1 - (60 - 9 * stacks) / 100) * (1 + 0.1 * stacks))
    close(row.combinedDps, row.damageOverTimeDps!)
    close(result.model!.duration, 6.5)
  }
  assert.deepEqual(output('wang', 1, { actualAttackTargetCount: 2 }).rows, [])
  for (const stacks of [-1, 1.5, 4]) assert.deepEqual(output('wang', 2, { stoneBonusStacks: stacks }).rows, [])
  const blocked = output('wang', 3, { damagePhase: 'normal' })
  assert.deepEqual(blocked.rows, [])
  assert.ok(blocked.unsupportedReasons.length > 0)
})

test('ドロシーの罠は配置時から10回が有効な選択命中に限定し、本体射撃の入力と混同しない', () => {
  for (const index of [1, 2, 3]) for (const normalStacks of [0, 10]) {
    const count = index === 1 ? 1 : 4
    const { result, row } = fixed('doroth', index, { normalAttackTalentStacks: normalStacks, actualAttackTargetCount: count })
    const power = buffed(result.stats.attack, 0.2)
    close(row.allTargetsPerAttack, (index === 3 ? power * 3.5 * 0.4 : physical(power * (index === 1 ? 4.5 : 3), index === 1 ? 650 : 1000)) * count)
    assert.equal(row.dps, null)
    assert.ok(result.activeStageLabel?.includes('配置時から夢想家10回'))
    const shooting = fixed('doroth', index, { damagePhase: 'normal', normalAttackTalentStacks: normalStacks })
    close(shooting.row.perAttack, physical(buffed(shooting.result.stats.attack, 0.02 * normalStacks), 1000))
    const blocked = output('doroth', index, { damagePhase: 'changing-trap' })
    assert.deepEqual(blocked.rows, [])
    assert.ok(blocked.unsupportedReasons.some(reason => reason.includes('攻撃力参照時刻')))
  }
  assert.deepEqual(output('doroth', 1, { actualAttackTargetCount: 2 }).rows, [])
  assert.deepEqual(output('doroth', 2, { normalAttackTalentStacks: 11 }).rows, [])
  const debuffed = fixed('doroth', 1, { damagePhase: 'normal', normalAttackTalentStacks: 5, normalTargetDebuffActive: true })
  close(debuffed.row.perAttack, physical(buffed(debuffed.result.stats.attack, 0.1), 650))
})

test('ティッピの2体ブロックを同時攻撃へ流用せず、S2は3連撃を各々防御軽減する', () => {
  for (const index of [1, 2]) for (const defense of [0, 1000, 10000]) {
    const { result, row } = fixed('tippi', index, {}, defense)
    close(row.perAttack, physical(buffed(result.stats.attack, index === 1 ? 1 : 0.5), defense) * (index === 1 ? 1 : 3))
    close(row.dps, row.perAttack / 1.5)
    assert.equal(result.maxTargetCount, 1)
    assert.deepEqual(output('tippi', index, { actualAttackTargetCount: 2 }).rows, [])
  }
})

test('コントレイルはスキルATKと離陸中の110%を別乗算し、S2の3体目は空中だけ', () => {
  for (const index of [1, 2]) for (const airborne of [false, true]) {
    const count = index === 1 ? 1 : airborne ? 3 : 2
    const { result, row } = fixed('ctrail', index, { targetAirborne: airborne, actualAttackTargetCount: count })
    const power = buffed(result.stats.attack, index === 1 ? 0.8 : 0.9) * 1.1
    close(row.perAttack, physical(power, 1000))
    close(row.allTargetsPerAttack, physical(power, 1000) * count)
    close(row.dps, row.perAttack / 1.5)
  }
  assert.deepEqual(output('ctrail', 2, { targetAirborne: false, actualAttackTargetCount: 3 }).rows, [])
  assert.deepEqual(output('ctrail', 2, { targetAirborne: true, actualAttackTargetCount: 4 }).rows, [])
})

test('ハディヤは支払後の素質4%を一度だけ加算し、換装前後のS1と3体攻撃S2を分ける', () => {
  for (const converted of [false, true]) for (const stacks of [2, 5]) {
    const first = fixed('hadiya', 1, { tacticalReconfiguration: converted, costBuffStacks: stacks })
    close(first.row.perAttack, physical(buffed(first.result.stats.attack, (converted ? 1 : 0) + 0.04 * stacks), 1000))
    const second = fixed('hadiya', 2, { costBuffStacks: stacks, actualAttackTargetCount: 3 })
    close(second.row.allTargetsPerAttack, physical(buffed(second.result.stats.attack, 1.5 + 0.04 * stacks), 1000) * 3)
    close(second.result.attackInterval, 1.25)
  }
  assert.deepEqual(output('hadiya', 1, { costBuffStacks: 0 }).rows, [])
  assert.deepEqual(output('hadiya', 2, { costBuffStacks: 1 }).rows, [])
  assert.deepEqual(output('hadiya', 2, { costBuffStacks: 6 }).rows, [])
})

test('ハディヤS1は配置のみ1回を許可し、戦術換装後は最低2回のコスト消費を要求する', () => {
  const original = fixed('hadiya', 1, { tacticalReconfiguration: false, costBuffStacks: 1 })
  close(original.row.perAttack, physical(buffed(original.result.stats.attack, 0.04), 1000))
  const converted = fixed('hadiya', 1, { tacticalReconfiguration: true, costBuffStacks: 2 })
  close(converted.row.perAttack, physical(buffed(converted.result.stats.attack, 1.08), 1000))
  const invalid = output('hadiya', 1, { tacticalReconfiguration: true, costBuffStacks: 1 })
  assert.deepEqual(invalid.rows, [])
  assert.ok(invalid.unsupportedReasons.some(reason => reason.includes('2回')))
})

test('罠・弾薬・コスト延長へ期間総ダメージを付けず、巡空者の固定4技能だけ積算する', () => {
  for (const suffix of ['robin', 'rfrost', 'wulfen', 'ela', 'wang', 'doroth', 'hadiya']) {
    const source = sources.find(s => s.operatorId.endsWith(`_${suffix}`))!
    for (const skill of source.skills) {
      const entry = getDamageThreeComparisonEntries([record(suffix, skill.skillIndex)])[0]
      const result = evaluateDamageThreeComparisonEntry(entry, { defense: 1000, resistance: 60, enemyCount: 1 })
      assert.deepEqual(result.errors, [], `${suffix} S${skill.skillIndex}`)
      assert.equal(result.totalDamage, null)
    }
  }
  for (const [suffix, index, seconds] of [['tippi', 1, 40], ['tippi', 2, 15], ['ctrail', 1, 40], ['ctrail', 2, 30]] as const) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 1000, resistance: 60, enemyCount: 1 })
    assert.deepEqual(result.errors, [])
    close(result.totalDamage, result.combinedDps! * seconds)
  }
})

test('次の9名も素質/特性/スキルの改変や欠落を検出し、固定sourceで穴埋めしない', () => {
  for (const suffix of ['robin', 'rfrost', 'wulfen', 'ela', 'wang', 'doroth', 'tippi', 'ctrail', 'hadiya']) {
    const changedSkill = record(suffix, 1)
    changedSkill.skillLevels[9].description += '未確認の追加ダメージ'
    assert.deepEqual(outputRecord(changedSkill).rows, [], suffix)
    const changedTrait = record(suffix, 1)
    changedTrait.operatorProfile.traitDescription += '未確認の追加ダメージ'
    assert.deepEqual(outputRecord(changedTrait).rows, [], suffix)
    const changedTalent = record(suffix, 1)
    for (const talent of changedTalent.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) candidate.description += '未確認の追加ダメージ'
    assert.deepEqual(outputRecord(changedTalent).rows, [], suffix)
  }
  for (const suffix of ['ela', 'wang', 'doroth', 'ctrail', 'hadiya']) {
    const missing = record(suffix, 1)
    for (const talent of missing.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) candidate.blackboard = []
    assert.deepEqual(outputRecord(missing).rows, [], suffix)
  }
})

test('帰溟スペクター・ヴァーダント・若葉睦は本体の属性/連撃/HP条件を保ち、身替りを合算しない', () => {
  for (const index of [1, 2, 3]) {
    const { result, row } = at('ghost2', index, 1000, { targetHpAtLeastSelf: true, actualAttackTargetCount: index === 3 ? 2 : 1 })
    const power = buffed(result.stats.attack, [0, 1.5, 1.3, 2.6][index])
    close(row.perAttack, physical(power, 1000) + (index === 3 ? physical(power * 0.7, 1000) : 0))
    close(result.attackInterval, (result.stats.baseAttackTime + (index === 3 ? 1 : 0)) / (index === 2 ? 1.5 : 1))
  }
  const verdant = at('vrdant', 2, 60)
  close(verdant.row.perAttack, verdant.result.stats.attack * 0.4)
  close(verdant.result.attackInterval, verdant.result.stats.baseAttackTime / 1.8)
  const mortis = at('mortis', 2, 60, { actualAttackTargetCount: 5 })
  close(mortis.row.allTargetsPerAttack, mortis.result.stats.attack * 1.2 * 3 * 0.4)
  close(mortis.row.perAttack, mortis.row.allTargetsPerAttack / 5)
  close(mortis.result.attackInterval, mortis.result.stats.baseAttackTime - 0.3)
})

test('ブレミシャインの睡眠140%は物理と追加術に一度乗り、治療をダメージに含めない', () => {
  for (const sleeping of [false, true]) for (const index of [1, 2, 3]) {
    const { result, row } = at('blemsh', index, 1000, { targetSleeping: sleeping, enemyResistance: 60 })
    const atk = buffed(result.stats.attack, index === 1 ? 0 : 1.1) * (sleeping ? 1.4 : 1)
    close(row.perAttack, physical(atk * (index === 1 ? 2.6 : 1), 1000) + (index === 3 ? atk * 0.4 : 0))
  }
})

test('クラウンスレイヤーは自身未被弾対象への物理120%を適用し、S3周期を捏造しない', () => {
  for (const dealt of [false, true]) for (const index of [1, 2, 3]) {
    const { result, row } = at('crosly', index, 1000, { targetHasDamagedSelf: dealt })
    close(row.perAttack, physical(buffed(result.stats.attack, index === 1 ? 1 : 0) * (index === 2 ? 5 : index === 3 ? 2.5 : 1), 1000)
      * (index === 3 ? 2 : 1) * (dealt ? 1 : 1.2))
    if (index !== 1) assert.equal(row.dps, null)
  }
})

test('斬業ホシグマは不屈35%上限と通常/反撃/盾/退場前の段階を分離する', () => {
  for (const health of [100, 65, 30, 0]) {
    const ratio = 0.35 * Math.min(1, (100 - health) / 70)
    const normal = at('hsgma2', 1, 60, { selfHpPercent: health })
    close(normal.row.perAttack, buffed(normal.result.stats.attack, 0.7 + ratio) * 0.4)
    const counter = at('hsgma2', 1, 60, { selfHpPercent: health, damagePhase: 'counter' })
    close(counter.row.perAttack, buffed(counter.result.stats.attack, 0.7 + ratio) * 1.75 * 0.4)
    assert.equal(counter.row.dps, null)
  }
  const strike = at('hsgma2', 2, 60, { actualAttackTargetCount: 3 })
  close(strike.row.allTargetsPerAttack, strike.result.stats.attack * 0.9 * 3 * 0.4 * 3)
  const shield = at('hsgma2', 2, 60, { damagePhase: 'shield', actualAttackTargetCount: 5 })
  close(shield.row.allTargetsPerAttack, shield.result.stats.attack * 1.3 * 0.4 * 5)
  assert.equal(shield.row.dps, null)
  for (const last of [false, true]) {
    const { result, row } = at('hsgma2', 3, 60, { finalStand: last, actualAttackTargetCount: 3 })
    close(row.allTargetsPerAttack, buffed(result.stats.attack, 2.3) * (last ? 4 : 2) * 0.4 * 3)
    assert.equal(result.model?.duration, last ? 11 : 32)
  }
})

test('血掟テキサスS1はATK加算90%と固定400毒を分け、初撃破後だけASPD8を失う', () => {
  for (const killed of [false, true]) {
    const { result, row } = at('texas2', 1, 1000, { firstKillDone: killed, enemyResistance: 60 })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.9), 1000))
    close(row.damageOverTimeDps, 160)
    close(result.attackInterval, result.stats.baseAttackTime / (killed ? 1 : 1.08))
  }
  close(at('texas2', 1, 0, { dotActive: false }).row.damageOverTimeDps, 0)
})

test('血掟テキサスS2は付与済みRES30%低下の2連撃だけ評価し、未確認の配置時段階を停止する', () => {
  const { result, row } = at('texas2', 2, 60)
  close(row.perAttack, buffed(result.stats.attack, 0.75) * 2 * (1 - 60 * 0.7 / 100))
  const deploy = output('texas2', 2, { damagePhase: 'deploy' })
  assert.deepEqual(deploy.rows, [])
  assert.ok(deploy.unsupportedReasons.some(reason => reason.includes('適用順序')))
})

test('血掟テキサスS3は通常物理1体と毎秒術4体を区別し、配置時165%2連を別段階にする', () => {
  const { result, row } = at('texas2', 3, 1000, { actualAttackTargetCount: 4, enemyResistance: 60 })
  const atk = buffed(result.stats.attack, 0.2)
  close(row.allTargetsPerAttack, physical(atk, 1000))
  close(row.damageOverTimeDps, atk * 1.3 * 0.4)
  close(row.allTargetsCombinedDps, physical(atk, 1000) / result.attackInterval! + atk * 1.3 * 0.4 * 4)
  const deploy = at('texas2', 3, 60, { damagePhase: 'deploy', actualAttackTargetCount: 6 })
  close(deploy.row.allTargetsPerAttack, buffed(deploy.result.stats.attack, 0.2) * 1.65 * 2 * 0.4 * 6)
})

test('キリンRヤトウは2/6/16連撃とS3接触1回の追加術を対応させ、未検証の動作DPSを出さない', () => {
  for (const combo of [false, true]) {
    const { result, row } = at('yato2', 1, 1000, { comboThirdAttack: combo, enemyResistance: 60 })
    const atk = buffed(result.stats.attack, 0.13)
    close(row.perAttack, (physical(atk, 1000) + atk * 0.2 * 0.4) * (combo ? 6 : 2))
    assert.equal(row.dps, null)
    assert.equal(result.attackInterval, null)
  }
  const second = at('yato2', 2, 1000, { actualAttackTargetCount: 3, enemyResistance: 60 })
  const atk = buffed(second.result.stats.attack, 0.13)
  close(second.row.allTargetsPerAttack, (physical(atk * 1.5, 1000) + atk * 0.2 * 3.75 * 0.4) * 16 * 3)
  const third = at('yato2', 3, 1000, { enemyResistance: 60 })
  close(third.row.perAttack, physical(atk * 3, 1000) + atk * 0.2 * 3 * 0.4)
  assert.equal(third.row.dps, null)
})

test('Docは防御120無視と教官120%を別演算し、弾薬を固定時間に置き換えない', () => {
  for (const blocked of [false, true]) {
    const { result, row } = at('rdoc', 1, 1000, { targetBlockedBySelf: blocked })
    close(row.perAttack, physical(result.stats.attack * (blocked ? 1 : 1.2), 880))
    close(result.attackInterval, result.stats.baseAttackTime - 0.7)
  }
})

test('ホルンは近接単体と遠距離範囲を分け、S2のみ近接でも範囲、OD時の追加術を保持する', () => {
  const blocked = at('horn', 1, 1000, { sourceIsBlocking: true })
  close(blocked.row.perAttack, physical(buffed(blocked.result.stats.attack, 0.2) * 2.8, 1000))
  assert.equal(blocked.result.maxTargetCount, 1)
  assert.ok(output('horn', 1, { sourceIsBlocking: true, actualAttackTargetCount: 2 }).unsupportedReasons.length)
  const ranged = at('horn', 1, 1000, { sourceIsBlocking: false, actualAttackTargetCount: 4 })
  close(ranged.row.allTargetsPerAttack, physical(buffed(ranged.result.stats.attack, 0.2) * 2.8, 1000) * 4)
  for (const stage of ['normal', 'overdrive']) {
    const { result, row } = at('horn', 2, 1000, { sourceIsBlocking: true, damagePhase: stage, actualAttackTargetCount: 4, enemyResistance: 60 })
    const atk = buffed(result.stats.attack, 0.2)
    close(row.allTargetsPerAttack, (physical(atk * 2.4, 1000) + (stage === 'overdrive' ? atk * 0.6 * 0.4 : 0)) * 4)
  }
  assert.deepEqual(output('horn', 2, { damagePhase: 'discharge' }).rows, [])
  for (const overdrive of [false, true]) for (const revived of [false, true]) {
    const { result, row } = at('horn', 3, 1000, { overdrive, revived })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.2 + (overdrive ? 1.4 : 0.7)), 1000))
    close(result.attackInterval, (result.stats.baseAttackTime - 1.8) / (revived ? 1.18 : 1))
  }
})

test('アッシュロックS2は65%の割合短縮とブロック不可を固定し、素質8/16%を加算する', () => {
  for (const ground of [false, true]) for (const index of [1, 2]) {
    const { result, row } = at('ashlok', index, 1000, { allAdjacentGround: ground, sourceIsBlocking: true, actualAttackTargetCount: index === 2 ? 3 : 1 })
    close(row.perAttack, physical(buffed(result.stats.attack, (ground ? 0.16 : 0.08) + (index === 1 ? 1 : 0.55)), 1000))
    close(result.attackInterval, result.stats.baseAttackTime * (index === 1 ? 1 : 0.35))
    assert.equal(result.maxTargetCount, index === 1 ? 1 : null)
  }
})

test('ファイヤーホイッスルの未ブロックATK12%と燃焼50/85%は強撃185%と独立する', () => {
  for (const blocking of [false, true]) for (const index of [1, 2]) {
    const { result, row } = at('firwhl', index, 1000, { sourceIsBlocking: blocking, enemyResistance: 60 })
    const atk = buffed(result.stats.attack, blocking ? 0 : 0.12)
    close(row.perAttack, physical(atk * (index === 1 ? 1.85 : 1), 1000))
    close(row.damageOverTimeDps, atk * (index === 1 ? 0.5 : 0.85) * 0.4)
    assert.equal(result.maxTargetCount, blocking ? 1 : null)
  }
  close(at('firwhl', 2, 0, { burnActive: false }).row.damageOverTimeDps, 0)
})

test('マツキリの重装・補助向け10%を自身に誤適用せず、グラベルは1動作合計を返す', () => {
  const makiri = at('makiri', 2, 1000)
  close(makiri.row.perAttack, physical(buffed(makiri.result.stats.attack, 0.7), 1000))
  for (const index of [1, 2]) {
    const { result, row } = at('gravel', index, 1000)
    close(row.perAttack, physical(result.stats.attack, 1000))
    assert.equal(result.model?.duration, index === 1 ? 12 : 10)
  }
})

test('第2群の未検証段階/状態変化に期間総ダメージを付けず、属性限定素質を再評価する', () => {
  for (const [id, index] of [['yato2', 1], ['horn', 2], ['ghost2', 3], ['texas2', 3], ['mortis', 2], ['hsgma2', 3]] as const) {
    const [entry] = getDamageThreeComparisonEntries([record(id, index)])
    const evaluated = evaluateDamageThreeComparisonEntry(entry, { defense: 1000, resistance: 60, enemyCount: 1 })
    assert.equal(evaluated.totalDamage, null)
  }
  const skill = record('crosly', 1), source = sources.find(s => s.operatorId === skill.operatorId)!
  const virtual = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
    virtualMainAttackType: 'ARTS', enemy: { defense: 1000, resistance: 60 }, conditions: { guard: { targetHasDamagedSelf: false } } })
  assert.deepEqual(virtual.unsupportedReasons, [])
  close(virtual.rows[0].perAttack, buffed(virtual.stats.attack, 1) * 0.4)
})

test('アンダーフローは同時対象数と固定80/160の毎秒術ダメージを分けて計算する', () => {
  for (const sea of [false, true]) for (const index of [1, 2]) {
    const count = index === 2 ? 4 : 1
    const { result, row } = at('udflow', index, 1000, { targetSeaMonster: sea, actualAttackTargetCount: count, enemyResistance: 60 })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.5), 1000))
    close(row.damageOverTimeDps, (sea ? 160 : 80) * 0.4)
    close(row.allTargetsCombinedDps, (row.perAttack / result.attackInterval! + row.damageOverTimeDps!) * count)
    close(result.attackInterval, result.stats.baseAttackTime / (index === 2 ? 1.5 : 1))
  }
  assert.equal(at('udflow', 1, 0, { dotActive: false }).row.damageOverTimeDps, null)
  assert.ok(output('udflow', 2, { actualAttackTargetCount: 5 }).unsupportedReasons.length)
})

test('オッダは30回到達のATK15%と主対象/周囲50%を防御軽減前に適用する', () => {
  for (const hits of [29, 30]) for (const index of [1, 2]) {
    const { result, row } = at('odda', index, 1000, { physicalDamageCount: hits, actualAttackTargetCount: 3 })
    const atk = buffed(result.stats.attack, (hits >= 30 ? 0.15 : 0) + (index === 2 ? 1 : 0))
    const power = atk * (index === 1 ? 2.4 : 1)
    close(row.allTargetsPerAttack, physical(power, 1000) + 2 * physical(power * 0.5, 1000))
    close(row.perAttack, row.allTargetsPerAttack / 3)
  }
})

test('オーロラは凍結330%を選択した命中にだけ適用し、ブロック3でも単体攻撃を保つ', () => {
  for (const frozen of [false, true]) {
    const { result, row } = at('aurora', 2, 1000, { targetFrozen: frozen })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.75) * (frozen ? 3.3 : 1), 1000))
    close(result.attackInterval, result.stats.baseAttackTime + 0.25)
  }
  assert.equal(at('aurora', 1).result.maxTargetCount, 1)
  assert.ok(output('aurora', 1, { actualAttackTargetCount: 2 }).unsupportedReasons.length)
})

test('キララS1は主物理1回と追加術150%を区別して全対象に適用する', () => {
  const { result, row } = at('kirara', 1, 1000, { actualAttackTargetCount: 4, enemyResistance: 60 })
  close(row.perAttack, physical(result.stats.attack, 1000) + result.stats.attack * 1.5 * 0.4)
  close(row.allTargetsPerAttack, row.perAttack * 4)
  assert.deepEqual(row.attackComponents.map(component => component.role), ['MAIN', 'ADDITIONAL'])
})

test('スワイヤーの周囲味方用素質を自身に加えず、教官の非ブロック120%を一度適用する', () => {
  for (const blocked of [false, true]) {
    const { result, row } = at('swire', 2, 1000, { targetBlockedBySelf: blocked })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.8) * (blocked ? 1 : 1.2), 1000))
  }
})

test('ファントムの強化は攻撃前残数で200%から0%へ変わり、虚影を二重加算しない', () => {
  for (const stacks of [0, 1, 10]) {
    const { result, row } = at('phatom', 2, 1000, { remainingStacks: stacks })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.2 * stacks), 1000))
  }
  const blast = at('phatom', 3, 1000, { actualAttackTargetCount: 4 })
  close(blast.row.allTargetsPerAttack, physical(blast.result.stats.attack * 3, 1000) * 4)
  assert.equal(blast.row.dps, null)
  assert.ok(output('phatom', 2, { remainingStacks: 11 }).unsupportedReasons.length)
})

test('カフカS2の配置時400%範囲攻撃と15秒の単体通常術攻撃に素質15%を適用する', () => {
  const normal = at('kafka', 2, 60)
  close(normal.row.perAttack, buffed(normal.result.stats.attack, 0.15) * 0.4)
  assert.equal(normal.result.model?.duration, 15)
  assert.ok(output('kafka', 2, { actualAttackTargetCount: 2 }).unsupportedReasons.length)
  const blast = at('kafka', 2, 60, { damagePhase: 'deploy', actualAttackTargetCount: 3 })
  close(blast.row.allTargetsPerAttack, buffed(blast.result.stats.attack, 0.15) * 4 * 0.4 * 3)
  assert.equal(blast.row.dps, null)
})

test('アスカロンは毒0..3重複を現在ATKで評価し、S1倍率と2ヒットを毒に重ねない', () => {
  for (const stacks of [0, 1, 3]) for (const index of [1, 2, 3]) {
    const { result, row } = at('ascln', index, 1000, { dotStacks: stacks, adjacentHighTile: true, enemyResistance: 60 })
    const atk = buffed(result.stats.attack, index === 2 ? 1.3 : index === 3 ? 0.5 : 0)
    close(row.perAttack, physical(atk * (index === 1 ? 2.1 : 1), 1000) * (index === 1 ? 2 : 1))
    close(row.damageOverTimeDps, atk * 0.1 * stacks * 0.4)
    if (index !== 1) close(result.attackInterval, (result.stats.baseAttackTime - (index === 3 ? 1.5 : 0)) / 1.14)
  }
  const noHigh = at('ascln', 2)
  close(noHigh.result.attackInterval, noHigh.result.stats.baseAttackTime / 1.08)
  assert.ok(output('ascln', 1, { dotStacks: 4 }).unsupportedReasons.length)
})

test('リーは周囲1体時だけ速度倍増し、マーク爆発300%から900%までを独立して評価する', () => {
  for (const count of [0, 1, 2]) for (const index of [1, 2, 3]) {
    const { result, row } = at('lmlee', index, 1000, { nearbyEnemyCount: count })
    close(row.perAttack, physical(buffed(result.stats.attack, index === 1 ? 0.6 : index === 3 ? 0.5 : 0), 1000))
    close(result.attackInterval, result.stats.baseAttackTime / (1 + (count === 1 ? 28 : 14) / 100 + (index === 2 ? 0.3 : 0)))
  }
  for (const hits of [0, 15, 30]) {
    const { result, row } = at('lmlee', 2, 60, { damagePhase: 'explosion', markHits: hits, actualAttackTargetCount: 5 })
    close(row.allTargetsPerAttack, result.stats.attack * (3 + 0.2 * hits) * 0.4 * 5)
    assert.equal(row.dps, null)
  }
})

test('ベナとカゼマルは本体の物理攻撃を計算し、身替りの術攻撃を混ぜない', () => {
  const first = at('bena', 1, 1000)
  close(first.row.perAttack, physical(buffed(first.result.stats.attack, 1), 650))
  const second = at('bena', 2, 1000)
  close(second.row.perAttack, physical(buffed(second.result.stats.attack, 0.9), 1000))
  close(second.result.attackInterval, second.result.stats.baseAttackTime / 1.8)
  const kazemaru = at('kazema', 1, 1000)
  close(kazemaru.row.perAttack, physical(kazemaru.result.stats.attack * 3.5, 1000))
  assert.deepEqual(kazemaru.row.attackComponents.map(component => component.damageType), ['PHYSICAL'])
})

test('ミヅキは範囲全員への物理攻撃と低HPの1/2/3体への術攻撃を別々に集計する', () => {
  for (const count of [1, 2, 5]) for (const index of [1, 2, 3]) {
    const { result, row } = at('mizuki', index, 1000, { actualAttackTargetCount: count, lowHpEnemyInRange: true, enemyResistance: 60 })
    const atk = buffed(result.stats.attack, 0.1 + (index === 2 ? 0.3 : index === 3 ? 1.5 : 0))
    const main = physical(atk * (index === 1 ? 3 : 1), 1000) * count
    const additional = atk * 0.5 * (index === 1 ? 3 : 1) * 0.4 * Math.min(count, index)
    close(row.allTargetsPerAttack, main + additional)
    close(row.perAttack, (main + additional) / count)
  }
  const noLow = at('mizuki', 2)
  close(noLow.row.perAttack, buffed(noLow.result.stats.attack, 0.3) * 1.5)
})

test('滌火ジェシカの通常射撃と防盾砲弾は倍率・対象数・時間を分離する', () => {
  for (const index of [1, 2, 3]) {
    const { result, row } = at('jesca2', index, 1000)
    close(row.perAttack, physical(buffed(result.stats.attack, [0, 0.7, 0.75, 3.1][index]), 1000))
    close(result.attackInterval, result.stats.baseAttackTime + (index === 2 ? -0.9 : index === 3 ? 0.6 : 0))
  }
  const shell = at('jesca2', 3, 1000, { damagePhase: 'shell', actualAttackTargetCount: 3 })
  close(shell.row.allTargetsPerAttack, physical(buffed(shell.result.stats.attack, 3.1) * 2.5, 1000) * 3)
  assert.equal(shell.row.dps, null)
})

test('ヴェトチキはブロック中の3体まで、ツェルニーはスキル中術変換とATK80%のみ', () => {
  const branch = at('branch', 2, 1000, { actualAttackTargetCount: 3 })
  close(branch.row.allTargetsPerAttack, physical(buffed(branch.result.stats.attack, 1.5), 1000) * 3)
  assert.ok(output('branch', 2, { actualAttackTargetCount: 4 }).unsupportedReasons.length)
  const czerny = at('pianst', 1, 60)
  close(czerny.row.perAttack, buffed(czerny.result.stats.attack, 0.8) * 0.4)
  assert.equal(czerny.row.attackComponents.length, 1)
})

test('ウユウは選んだランダム効果のASPD28と次の不意打ち150%を別適用する', () => {
  for (const random of ['speed', 'enemySpeed', 'dodge', 'block']) for (const ready of [false, true]) {
    const { result, row } = at('nothin', 2, 1000, { randomEffect: random, ambushReady: ready })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.6) * (ready ? 1.5 : 1), 1000))
    close(result.attackInterval, result.stats.baseAttackTime / (random === 'speed' ? 1.28 : 1))
    assert.equal(result.maxTargetCount, 1)
  }
})

test('フィグリーノS2とペナンスS2の毎秒攻撃は通常攻撃を足さず固定1秒で評価する', () => {
  for (const blocked of [false, true]) {
    const { result, row } = at('talr', 2, 1000, { targetBlockedBySelf: blocked, actualAttackTargetCount: 4 })
    close(row.perAttack, physical(result.stats.attack * 1.6, 1000) * (blocked ? 1 : 1.2))
    close(row.allTargetsDps, row.perAttack * 4)
    assert.equal(result.attackInterval, 1)
  }
  const penance = at('judge', 2, 60, { actualAttackTargetCount: 5 })
  close(penance.row.perAttack, penance.result.stats.attack * 1.4 * 0.4)
  close(penance.row.allTargetsDps, penance.row.perAttack * 5)
  assert.equal(penance.result.attackInterval, 1)
})

test('ペナンスは過充電時に物理と追加術の両方を200%にし、反撃は通常攻撃に含めない', () => {
  for (const overcharged of [false, true]) {
    const { result, row } = at('judge', 1, 1000, { overcharged, enemyResistance: 60 })
    const power = result.stats.attack * (overcharged ? 2 : 1)
    close(row.perAttack, physical(power, 1000) + power * 2 * 0.4)
    assert.equal(row.attackComponents.length, 2)
  }
  const third = at('judge', 3, 1000)
  close(third.row.perAttack, physical(buffed(third.result.stats.attack, 4), 1000))
  close(third.result.attackInterval, third.result.stats.baseAttackTime + 0.9)
})

test('防御型スキルでも継続する通常攻撃を基礎ATKで計算し、防御をATKへ誤加算しない', () => {
  for (const [id, index] of [['blackd', 2], ['bison', 1], ['snakek', 1], ['bubble', 1], ['yak', 1], ['yak', 2], ['beagle', 1],
    ['aurora', 1], ['phatom', 1], ['branch', 1]] as const) {
    const { result, row } = at(id, index, 1000)
    close(row.perAttack, physical(result.stats.attack, 1000))
    close(row.dps, row.perAttack / result.stats.baseAttackTime)
    assert.equal(result.maxTargetCount, 1)
  }
})

test('追加24人の元資料は完全スキルを保持し、未確認入力・特性変更・数値欠落で閉じる', () => {
  const ids = ['blackd', 'bison', 'snakek', 'bubble', 'yak', 'beagle', 'udflow', 'odda', 'aurora', 'kirara', 'swire',
    'phatom', 'kafka', 'ascln', 'lmlee', 'bena', 'kazema', 'mizuki', 'jesca2', 'branch', 'pianst', 'nothin', 'talr', 'judge']
  const additions = EXPANDED_MELEE_DEFINITIONS.filter(d => ids.includes(d.operatorId.split('_').at(-1)!))
  assert.equal(additions.length, 24)
  assert.equal(additions.reduce((sum, d) => sum + d.recipes.length, 0), 43)
  for (const d of additions) {
    const src = sources.find(s => s.operatorId === d.operatorId)!
    assert.equal('passives' in src || 'coverage' in src, false)
    assert.equal(d.recipes.length + d.deferredSkills!.length, src.skills.length)
  }
  assert.ok(output('kafka', 2, { damagePhase: 'unknown' }).unsupportedReasons.length)
  assert.ok(output('lmlee', 2, { markHits: 31 }).unsupportedReasons.length)
  const missing = record('mizuki', 1)
  for (const candidate of missing.operatorProfile!.talents![0].candidates!) {
    candidate.blackboard = candidate.blackboard!.filter(value => value.key !== 'attack@mizuki_t_1.atk_scale')
  }
  assert.ok(outputRecord(missing).unsupportedReasons.length)
  const changed = record('ascln', 2)
  changed.skillLevels!.at(-1)!.blackboard![0].value = 20
  assert.deepEqual(outputRecord(changed).rows, [])
})

test('新技能の属性比較は主攻撃だけ変換し、ミヅキの限定対象追加術を保持する', () => {
  const skill = record('mizuki', 1), source = sources.find(s => s.operatorId === skill.operatorId)!
  const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
    operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
    virtualMainAttackType: 'ARTS', enemy: { defense: 1000, resistance: 60 },
    conditions: { guard: { actualAttackTargetCount: 4, lowHpEnemyInRange: false } } })
  assert.deepEqual(result.unsupportedReasons, [])
  close(result.rows[0].allTargetsPerAttack, result.stats.attack * 3 * 0.4 * 4 + result.stats.attack * 1.5 * 0.4)
  assert.equal(result.rows[0].attackComponents.filter(c => c.role === 'ADDITIONAL').length, 1)
})

const bulkSuffixes = ['weedy', 'glady', 'flamtl', 'zumama', 'fuze', 'tachak', 'almond', 'varkis', 'sophia',
  'snsant', 'cement', 'dagda', 'takila', 'mantic', 'morgan', 'laios', 'noirc2', 'red', 'wscoot']

test('大幅拡張の近接19人42技能は32対応・10保留で、元資料に調査用フィールドを混入しない', () => {
  const additions = EXPANDED_MELEE_DEFINITIONS.filter(definition => bulkSuffixes.includes(definition.operatorId.split('_').at(-1)!))
  assert.equal(additions.length, 19)
  assert.equal(additions.reduce((sum, definition) => sum + definition.recipes.length, 0), 32)
  assert.equal(additions.reduce((sum, definition) => sum + definition.deferredSkills!.length, 0), 10)
  for (const definition of additions) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    assert.equal('coverage' in source || 'passives' in source, false)
    for (const deferred of definition.deferredSkills ?? []) {
      const result = output(definition.operatorId.split('_').at(-1)!, deferred.skillIndex)
      assert.deepEqual(result.rows, [])
      assert.ok(result.unsupportedReasons.length)
    }
  }
})

test('ウィーディはS1の2対象とS2の範囲全体・攻撃間隔2.2秒加算を区別する', () => {
  const first = at('weedy', 1, 1000, { actualAttackTargetCount: 2 })
  close(first.row.perAttack, physical(first.result.stats.attack * 1.5, 1000))
  close(first.row.allTargetsPerAttack, first.row.perAttack * 2)
  assert.ok(output('weedy', 1, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
  const second = at('weedy', 2, 1000, { actualAttackTargetCount: 7 })
  close(second.row.perAttack, physical(buffed(second.result.stats.attack, 2), 1000))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 7)
  close(second.result.attackInterval, second.result.stats.baseAttackTime + 2.2)
  assert.equal(second.result.maxTargetCount, null)
})

test('グレイディーアは重量3まで130%を適用し、S2は2対象と延長間隔を維持する', () => {
  for (const weight of [3, 4]) {
    const first = at('glady', 1, 1000, { targetWeight: weight })
    close(first.row.perAttack, physical(first.result.stats.attack * 2.1 * (weight === 3 ? 1.3 : 1), 1000))
    const second = at('glady', 2, 1000, { targetWeight: weight, actualAttackTargetCount: 2 })
    close(second.row.perAttack, physical(second.result.stats.attack * 1.8 * (weight === 3 ? 1.3 : 1), 1000))
    close(second.row.allTargetsPerAttack, second.row.perAttack * 2)
    close(second.result.attackInterval, second.result.stats.baseAttackTime + 0.5)
  }
})

test('フレイムテイルS2の2連撃は回避後の通常攻撃素質を追加せず最大6対象', () => {
  for (const ready of [false, true]) {
    const { result, row } = at('flamtl', 2, 1000, { dodgeAttackReady: ready, actualAttackTargetCount: 6 })
    close(row.perAttack, physical(result.stats.attack * 2.4, 1000) * 2)
    close(row.allTargetsPerAttack, row.perAttack * 6)
    assert.equal(row.dps, null)
  }
  assert.deepEqual(output('flamtl', 2, { actualAttackTargetCount: 7 }).rows, [])
})

test('ユーネクテスはHP50%超の与ダメージ115%を防御軽減後に適用しブロック増でも単体攻撃', () => {
  for (const health of [50, 50.1]) for (const index of [1, 2, 3]) {
    const { result, row } = at('zumama', index, 1000, { selfHpPercent: health })
    close(row.perAttack, physical(buffed(result.stats.attack, [0, 0.25, 1.8, 2.3][index]), 1000) * (health > 50 ? 1.15 : 1))
    close(result.attackInterval, result.stats.baseAttackTime + (index === 2 ? 0.4 : 0))
    assert.equal(result.maxTargetCount, 1)
  }
  assert.deepEqual(output('zumama', 3, { actualAttackTargetCount: 2 }).rows, [])
})

test('Fuzeの弾薬中の通常攻撃と5回の範囲爆発はヒット数と同時対象数を区別する', () => {
  const first = at('fuze', 1, 1000, { actualAttackTargetCount: 3 })
  close(first.row.perAttack, physical(buffed(first.result.stats.attack, 0.3), 1000))
  close(first.row.allTargetsPerAttack, first.row.perAttack * 3)
  close(first.result.attackInterval, first.result.stats.baseAttackTime / 1.9)
  const second = at('fuze', 2, 1000, { actualAttackTargetCount: 5 })
  close(second.row.perAttack, physical(second.result.stats.attack * 4.8, 1000) * 5)
  close(second.row.allTargetsPerAttack, second.row.perAttack * 5)
  assert.equal(second.row.dps, null)
})

test('Tachankaは15%の倍率を防御軽減後に平均し、剣豪2ヒットをランダム対象へ配分する', () => {
  for (const count of [1, 4]) {
    const { result, row } = at('tachak', 2, 1000, { actualAttackTargetCount: count })
    const total = 2 * (physical(result.stats.attack, 1000) * 0.85 + physical(result.stats.attack * 2, 1000) * 0.15)
    close(row.allTargetsPerAttack, total)
    close(row.perAttack, total / count)
    close(result.attackInterval, result.stats.baseAttackTime - 0.85)
  }
})

test('アーモンド・スノーズント・セメントの発動ダメージは制御効果や複数対象と分離する', () => {
  for (const suffix of ['almond', 'snsant']) {
    const { result, row } = at(suffix, 1, 1000)
    close(row.perAttack, physical(result.stats.attack * 1.7, 1000))
    assert.equal(row.dps, null)
  }
  const net = at('snsant', 2, 60, { actualAttackTargetCount: 5 })
  close(net.row.allTargetsPerAttack, net.result.stats.attack * 2 * 0.4 * 5)
  const cement = at('cement', 1, 1000, { actualAttackTargetCount: 5 })
  close(cement.row.allTargetsPerAttack, physical(cement.result.stats.attack * 2.8, 1000) * 5)
})

test('ヴァルカリスはHP割合条件の110%と3連撃を別適用し、回復をダメージに足さない', () => {
  for (const ready of [false, true]) for (const index of [1, 2]) {
    const { result, row } = at('varkis', index, 1000, { targetHpNotAboveSelf: ready, actualAttackTargetCount: 3 })
    close(row.perAttack, physical(result.stats.attack * (index === 1 ? 1.35 : 2) * (ready ? 1.1 : 1), 1000) * (index === 1 ? 3 : 1))
    close(row.allTargetsPerAttack, row.perAttack * 3)
  }
})

test('ウィスラッシュはS1の半素質9ASPDとS2の全素質12ASPD・3ブロックを使う', () => {
  for (const blocked of [false, true]) for (const index of [1, 2]) {
    const { result, row } = at('sophia', index, 1000, { targetBlockedBySelf: blocked, actualAttackTargetCount: index === 1 ? 1 : 3 })
    close(row.perAttack, physical(buffed(result.stats.attack, index === 1 ? 0 : 0.6) * (blocked ? 1 : 1.2), 1000))
    close(result.attackInterval, result.stats.baseAttackTime / (index === 1 ? 1.09 : 1.12))
    assert.equal(result.maxTargetCount, index === 1 ? 1 : 3)
  }
})

test('ダグザは素質倍率の上限240%とS1の30%・S2の60%発動を防御軽減後に平均する', () => {
  for (const index of [1, 2]) for (const kills of [0, 18]) {
    const { result, row } = at('dagda', index, 1000, { killStacks: kills })
    const attack = buffed(result.stats.attack, index === 1 ? 0 : 0.35) * (index === 1 ? 2.1 : 1)
    const chance = index === 1 ? 0.3 : 0.6
    close(row.perAttack, ((1 - chance) * physical(attack, 1000) + chance * physical(attack * (kills === 0 ? 1.5 : 2.4), 1000)) * (index === 1 ? 1 : 2))
  }
  assert.deepEqual(output('dagda', 2, { killStacks: 19 }).rows, [])
})

test('解放者の蓄積を通常攻撃倍率と分離し、テキーラの過充電と追加攻撃を独立処理する', () => {
  for (const charged of [0, 100]) {
    const first = at('takila', 1, 1000, { traitChargePercent: charged })
    close(first.row.perAttack, physical(buffed(first.result.stats.attack, charged === 0 ? 0 : 2) * 1.7, 1000))
    close(first.result.attackInterval, first.result.stats.baseAttackTime / 1.5)
    for (const overcharged of [false, true]) {
      const second = at('takila', 2, 1000, { traitChargePercent: charged, overcharged, actualAttackTargetCount: overcharged ? 3 : 2 })
      close(second.row.perAttack, physical(buffed(second.result.stats.attack, charged === 0 ? 0 : 2) * 2.3, 1000))
      assert.equal(second.result.maxTargetCount, overcharged ? 3 : 2)
      assert.equal(second.result.model!.duration, overcharged ? 30 : 15)
    }
    const wind = at('wscoot', 2, 1000, { traitChargePercent: charged, actualAttackTargetCount: 2 })
    const attack = buffed(wind.result.stats.attack, charged === 0 ? 0 : 2)
    close(wind.row.perAttack, physical(attack * 2, 1000) + (charged === 100 ? physical(attack * 0.4, 1000) : 0))
    close(wind.row.allTargetsPerAttack, wind.row.perAttack * 2)
  }
})

test('マンティコアのステルスとモーガンの不屈は指定した状態で評価しHP推移を捏造しない', () => {
  for (const ready of [false, true]) {
    const { result, row } = at('mantic', 2, 1000, { stealthAttackReady: ready, actualAttackTargetCount: 5 })
    close(row.perAttack, physical(buffed(result.stats.attack, 0.9 + (ready ? 0.5 : 0)), 1000))
    close(result.attackInterval, result.stats.baseAttackTime + 1.7)
    close(row.allTargetsPerAttack, row.perAttack * 5)
  }
  for (const health of [100, 65, 30, 0]) {
    const { result, row } = at('morgan', 1, 1000, { selfHpPercent: health })
    const ratio = health === 100 ? 0 : health === 65 ? 0.25 : 0.5
    close(row.perAttack, physical(buffed(result.stats.attack, ratio) * 1.9, 1000))
  }
})

test('ライオスの防御40%無視・レウスSノイルホーンの発動前練気・レッドの下限30%を適用する', () => {
  for (const defeated of [false, true]) {
    const { result, row } = at('laios', 2, 1000, { hasDefeatedSameEnemy: defeated })
    close(row.perAttack, physical(result.stats.attack * 4.5, defeated ? 600 : 1000))
  }
  for (const stacks of [0, 3]) {
    const { result, row } = at('noirc2', 2, 1000, { spiritStacks: stacks })
    close(row.perAttack, physical(buffed(result.stats.attack, stacks * 0.07) * 1.8, 1000) * 7)
    assert.equal(row.dps, null)
  }
  const red = at('red', 1, 2000)
  close(red.row.perAttack, buffed(red.result.stats.attack, 0.8) * 0.3)
})

test('新しい近接定義も素質・特性の欠落とスキル数値変更では部分的な計算結果を返さない', () => {
  for (const suffix of ['glady', 'zumama', 'varkis', 'sophia', 'dagda', 'morgan', 'laios', 'noirc2', 'red', 'wscoot']) {
    const source = sources.find(source => source.operatorId.endsWith(`_${suffix}`))!
    const index = EXPANDED_MELEE_DEFINITIONS.find(definition => definition.operatorId === source.operatorId)!.recipes[0].skillIndex
    const skill = record(suffix, index)
    for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) candidate.blackboard = []
    const result = outputRecord(skill)
    assert.ok(result.unsupportedReasons.length, suffix)
    assert.deepEqual(result.rows, [], suffix)
  }
  const changed = record('fuze', 2)
  changed.skillLevels[9].blackboard![0].value! += 1
  assert.deepEqual(outputRecord(changed).rows, [])
  const traitChanged = record('takila', 1)
  traitChanged.operatorProfile.trait!.candidates![0].overrideDescripton += '追加攻撃'
  assert.deepEqual(outputRecord(traitChanged).rows, [])
  for (const [suffix, input] of [['morgan', { selfHpPercent: 101 }], ['glady', { targetWeight: -1 }],
    ['noirc2', { spiritStacks: 4 }], ['wscoot', { traitChargePercent: 101 }]] as const) {
    const index = suffix === 'noirc2' ? 2 : 1
    assert.deepEqual(output(suffix, index, input).rows, [])
  }
})

test('新規の一定期間だけ総ダメージを返し、状態変化・弾薬・永続の期間を代用しない', () => {
  for (const [suffix, index, seconds] of [['glady', 2, 20], ['sophia', 1, 20], ['sophia', 2, 25],
    ['tachak', 2, 4], ['takila', 1, 20], ['takila', 2, 15], ['red', 1, 10]] as const) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 500, resistance: 60, enemyCount: 1 })
    assert.deepEqual(result.errors, [], `${suffix} S${index}`)
    assert.equal(result.durationSeconds, seconds)
    close(result.totalDamage, result.combinedDps! * seconds)
  }
  for (const [suffix, index] of [['fuze', 1], ['morgan', 1], ['mantic', 2], ['zumama', 2], ['varkis', 2],
    ['dagda', 2], ['weedy', 2]] as const) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 500, resistance: 60, enemyCount: 1 })
    assert.deepEqual(result.errors, [], `${suffix} S${index}`)
    assert.equal(result.totalDamage, null, `${suffix} S${index}`)
    assert.ok(result.totalDamageReason)
  }
})

test('属性比較は新規の主攻撃の全ヒットを術化し、ウィンドスクートの追加物理攻撃を保持する', () => {
  for (const suffix of ['tachak', 'wscoot']) {
    const skill = record(suffix, 2), source = sources.find(source => source.operatorId === skill.operatorId)!
    const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
      operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
      enemy: { defense: 1000, resistance: 60 }, virtualMainAttackType: 'ARTS', conditions: { guard: { traitChargePercent: 100 } } })
    assert.deepEqual(result.unsupportedReasons, [])
    const row = result.rows[0]
    const main = row.attackComponents.filter(component => component.role === 'MAIN')
    assert.ok(main.length > 0 && main.every(component => component.damageType === 'ARTS'))
    if (suffix === 'tachak') close(row.perAttack, result.stats.attack * 0.4 * 2 * (0.85 + 0.15 * 2))
    else {
      const attack = buffed(result.stats.attack, 2)
      close(row.perAttack, attack * 2 * 0.4 + physical(attack * 0.4, 1000))
      assert.equal(row.attackComponents.find(component => component.role === 'ADDITIONAL')?.damageType, 'PHYSICAL')
    }
  }
})

test('近接追加133人の233技能が実データから有限結果を返し、残り51技能は理由付き保留', () => {
  assert.equal(sources.length, 133)
  assert.equal(EXPANDED_MELEE_DEFINITIONS.reduce((sum, definition) => sum + definition.recipes.length, 0), 233)
  for (const definition of EXPANDED_MELEE_DEFINITIONS) {
    const source = sources.find(source => source.operatorId === definition.operatorId)!
    assert.equal(definition.recipes.length + (definition.deferredSkills?.length ?? 0), source.skills.length)
    for (const recipe of definition.recipes) {
      const result = output(definition.operatorId.split('_').at(-1)!, recipe.skillIndex)
      assert.deepEqual(result.unsupportedReasons, [], `${source.operatorName} S${recipe.skillIndex}`)
      assert.ok(result.rows.length > 0)
      for (const row of result.rows) assert.ok([row.perAttack, row.allTargetsPerAttack, row.dps ?? 0].every(Number.isFinite))
    }
    for (const deferred of definition.deferredSkills ?? []) assert.ok(deferred.reason.length > 0)
  }
})

test('星3は昇進1・SL7で素質とスキルのATKを加算する', () => {
  for (const [id, ratio] of [['melan', 0.58], ['popka', 0.56], ['wyvern', 0.43], ['falco', 0.33]] as const) {
    const { result, row } = at(id, 1)
    close(row.perAttack, buffed(result.stats.attack, ratio))
  }
  const plume = at('falco', 1)
  close(plume.result.attackInterval, plume.result.stats.baseAttackTime / 1.25)
  assert.ok(output('popka', 1, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
})

test('ミッドナイトの術変換・遠距離倍率・20%会心を一度ずつ適用する', () => {
  const { result, row } = at('midn', 1, 60, { attackDistanceType: 'RANGED' })
  close(row.perAttack, buffed(result.stats.attack, 0.35) * 0.8 * (0.8 + 0.2 * 1.5) * 0.4)
})

test('カッターS1は4投を敵数で配分し、S2は飛行2倍を防御軽減前に適用する', () => {
  const first = at('cutter', 1, 1000, { actualAttackTargetCount: 4 })
  close(first.row.perAttack, physical(first.result.stats.attack * 3.4, 1000))
  close(first.row.allTargetsPerAttack, first.row.perAttack * 4)
  assert.equal(first.row.dps, null)
  const second = at('cutter', 2, 1000, { targetAirborne: true, actualAttackTargetCount: 6 })
  close(second.row.perAttack, physical(second.result.stats.attack * 9, 1000))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 6)
})

test('アレーンはS1遠距離減衰・2連撃、S2減衰なし・2対象に分ける', () => {
  const first = at('spikes', 1, 1000, { targetDrone: true })
  close(first.row.perAttack, physical(first.result.stats.attack * 1.5 * 0.8 * 1.4, 1000) * 2)
  const second = at('spikes', 2, 60, { targetDrone: true, actualAttackTargetCount: 2 })
  close(second.row.perAttack, second.result.stats.attack * 1.6 * 1.4 * 0.4)
  close(second.row.allTargetsPerAttack, second.row.perAttack * 2)
})

test('ドーベルマンは星3向け素質を自己に加算せず、教官特性のみ乗算する', () => {
  const free = at('doberm', 2, 1000), blocked = at('doberm', 2, 1000, { targetBlockedBySelf: true })
  const attack = buffed(free.result.stats.attack, 0.8)
  close(free.row.perAttack, physical(attack * 1.2, 1000))
  close(blocked.row.perAttack, physical(attack, 1000))
})

test('不屈・累積ASPD・勇猛HP境界を指定条件で反映する', () => {
  for (const id of ['utage', 'akafyu']) {
    const low = at(id, 2, 0, { selfHpPercent: 30 }), full = at(id, 2, 0, { selfHpPercent: 100 })
    close(low.result.attackInterval, low.result.stats.baseAttackTime / 2)
    close(full.result.attackInterval, full.result.stats.baseAttackTime)
  }
  const astesia = at('astesi', 2, 0, { talentStacks: 5, actualAttackTargetCount: 2 })
  close(astesia.result.attackInterval, astesia.result.stats.baseAttackTime / 1.25)
  for (const [selfHpPercent, ratio] of [[49.9, 0], [50, 0.45], [79.9, 0.45], [80, 0.9]]) {
    const { result, row } = at('humus', 2, 0, { selfHpPercent })
    close(row.perAttack, buffed(result.stats.attack, ratio))
  }
})

test('ラ・プルマの低HP増加は50%未満、ハイモアの統合戦略ASPDは条件付き', () => {
  const low = at('crow', 2, 0, { targetHpPercent: 49.9, killStacks: 12 })
  const half = at('crow', 2, 0, { targetHpPercent: 50 })
  close(low.row.perAttack, buffed(low.result.stats.attack, 1.2))
  close(half.row.perAttack, buffed(half.result.stats.attack, 0.7))
  close(low.result.attackInterval, (low.result.stats.baseAttackTime - 0.5) / 1.36)
  const highmore = at('highmo', 2, 0, { mizukiMode: true })
  close(highmore.result.attackInterval, highmore.result.stats.baseAttackTime / 1.25)
})

test('フリントS2のブロック0は素質を必ず有効化し、インドラは回避後ATKを加算する', () => {
  const flint = at('flint', 2, 1000, { targetBlockedBySelf: true })
  close(flint.row.perAttack, physical(buffed(flint.result.stats.attack, 0.55), 1000) * 1.4)
  const indra = at('tiger', 1, 1000, { dodgeAttackReady: true })
  close(indra.row.perAttack, physical(buffed(indra.result.stats.attack, 2.4), 400))
})

test('テキサス2連術・シージATK素質・リード追加術を別軽減で計算する', () => {
  const texas = at('texas', 2, 60, { actualAttackTargetCount: 5 })
  close(texas.row.perAttack, texas.result.stats.attack * 1.7 * 2 * 0.4)
  close(texas.row.allTargetsPerAttack, texas.row.perAttack * 5)
  const siege = at('siege', 3, 1000)
  close(siege.row.perAttack, physical(buffed(siege.result.stats.attack, 0.08) * 3.8, 1000))
  close(siege.result.attackInterval, siege.result.stats.baseAttackTime + 1)
  const reed = at('sddrag', 2, 1000, { enemyResistance: 60 })
  const attack = buffed(reed.result.stats.attack, 0.8)
  close(reed.row.perAttack, physical(attack, 1000) + attack * 0.35 * 0.4)
})

test('カンタービレは未ブロックASPDとブロックATKを排他的に反映する', () => {
  const free = at('ctable', 2), blocked = at('ctable', 2, 0, { selfBlocking: true })
  close(free.row.perAttack, buffed(free.result.stats.attack, 0.4))
  close(free.result.attackInterval, free.result.stats.baseAttackTime / 1.62)
  close(blocked.row.perAttack, buffed(blocked.result.stats.attack, 0.52))
  close(blocked.result.attackInterval, blocked.result.stats.baseAttackTime / 1.5)
})

test('重装のスキル術変換・多対象化・間隔増減を重複なく反映する', () => {
  const durnar = at('durnar', 2, 60, { actualAttackTargetCount: 3 })
  close(durnar.row.perAttack, buffed(durnar.result.stats.attack, 0.87) * 0.4)
  const mudrock = at('mudrok', 3, 1000, { actualAttackTargetCount: 3 })
  close(mudrock.row.perAttack, physical(buffed(mudrock.result.stats.attack, 1.4), 1000))
  close(mudrock.result.attackInterval, mudrock.result.stats.baseAttackTime - 0.3)
  const liskarm = at('liskam', 2, 60, { actualAttackTargetCount: 4 })
  close(liskarm.row.perAttack, buffed(liskarm.result.stats.attack, 2) * 0.4)
  close(liskarm.result.attackInterval, liskarm.result.stats.baseAttackTime + 0.7)
  assert.ok(output('hpsts', 2, { actualAttackTargetCount: 3 }).unsupportedReasons.length)
})

test('特殊の確定ダメージ・感染生物倍率・確率会心を別々に扱う', () => {
  const cliff = at('slchan', 2, 0, { selfBlocking: false, actualAttackTargetCount: 3 })
  close(cliff.row.perAttack, buffed(cliff.result.stats.attack, 0.12) * 2)
  close(cliff.row.allTargetsPerAttack, cliff.row.perAttack * 3)
  const jaye = at('strong', 2, 1000, { targetInfectedCreature: true })
  close(jaye.row.perAttack, physical(buffed(jaye.result.stats.attack, 0.6) * 1.45, 1000))
  const waai = at('waaifu', 1, 1000), attack = buffed(waai.result.stats.attack, 0.7)
  close(waai.row.perAttack, physical(attack, 1000) * 0.8 + physical(attack * 1.5, 1000) * 0.2)
})

test('特性・技能・素質のliveデータが欠落または変更された場合にsnapshotで補完しない', () => {
  const mutations: ((skill: SkillRecord) => void)[] = [
    skill => { skill.operatorProfile.traitDescription += '攻撃時に追加の確定ダメージを与える' },
    skill => { skill.operatorProfile.talents = [] },
    skill => { skill.skillLevels[6].blackboard![0].value = 99 },
    skill => { skill.skillLevels[6].description += '追加の確定ダメージを与える' },
    skill => {
      for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
        candidate.description += '攻撃時に追加の確定ダメージを与える'
      }
    },
    skill => {
      for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
        candidate.blackboard = []
      }
    },
  ]
  for (const mutate of mutations) {
    const skill = record('melan', 1)
    mutate(skill)
    const result = outputRecord(skill)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('会心キー重複や条件上限を越える値は結果を出さず、低レアも未確認昇進を拒否する', () => {
  const skill = record('midn', 1)
  for (const talent of skill.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    const entry = candidate.blackboard?.find(entry => entry.key === 'prob')
    if (entry) candidate.blackboard!.push({ ...entry })
  }
  assert.deepEqual(outputRecord(skill).rows, [])
  for (const [suffix, index, condition] of [
    ['astesi', 2, { talentStacks: 6 }], ['broca', 2, { blockedEnemyCount: 4 }],
    ['crow', 2, { killStacks: 13 }], ['utage', 2, { selfHpPercent: -1 }],
    ['ctable', 2, { selfBlocking: 'true' }], ['highmo', 2, { mizukiMode: 'true' }],
  ] as const) {
    const result = output(suffix, index, condition)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
  const melon = record('melan', 1)
  const result = buildDamageCalculatorThreeOutput({ operator: melon, skill: melon, phaseIndex: 0,
    operatorLevel: 30, trust: 100, skillLevelIndex: 6 })
  assert.ok(result.unsupportedReasons.length > 0)
  assert.deepEqual(result.rows, [])
})

test('スネグーラチカは配置後未被弾時だけ速度10を加算し、S1の280%を1回に適用する', () => {
  const fresh = at('wintim', 2), damaged = at('wintim', 2, 0, { hasTakenDamage: true })
  close(fresh.result.attackInterval, fresh.result.stats.baseAttackTime / 1.5)
  close(damaged.result.attackInterval, damaged.result.stats.baseAttackTime / 1.4)
  const first = at('wintim', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 2.8, 1000))
  assert.equal(first.row.dps, null)
})

test('フロストリーフは素質の0.15秒を速度補正前に足し、遠距離80%を一度だけ適用する', () => {
  const ranged = at('frostl', 2, 500, { attackDistanceType: 'RANGED' })
  close(ranged.result.attackInterval, (ranged.result.stats.baseAttackTime + 0.15) / 1.5)
  close(ranged.row.perAttack, physical(ranged.result.stats.attack * 0.8, 500))
  const melee = at('frostl', 1, 500), first = at('frostl', 1, 500, { attackDistanceType: 'RANGED' })
  close(melee.row.perAttack, physical(melee.result.stats.attack * 1.5, 500))
  close(first.row.perAttack, physical(first.result.stats.attack * 1.5 * 0.8, 500))
})

test('ヴィグナの30%発動は攻撃力加算枠を分岐し、防御軽減後に期待値を求める', () => {
  for (const [index, ratio] of [[1, 0.8], [2, 2]] as const) {
    const { result, row } = at('vigna', index, 1000)
    const ordinary = buffed(result.stats.attack, ratio), proc = buffed(result.stats.attack, ratio + 1)
    close(row.perAttack, physical(ordinary, 1000) * 0.7 + physical(proc, 1000) * 0.3)
    close(result.attackInterval, result.stats.baseAttackTime + (index === 2 ? 0.5 : 0))
    assert.ok(result.hasProbabilisticDamage)
  }
})

test('ムースS2の素質は20%の追加術攻撃で、未確定のS1では部分結果を出さない', () => {
  const { result, row } = at('frncat', 2, 60)
  close(row.perAttack, buffed(result.stats.attack, 0.75) * 0.4 * 1.2)
  const pending = output('frncat', 1)
  assert.deepEqual(pending.rows, [])
  assert.ok(pending.unsupportedReasons.some(reason => reason.includes('2撃目')))
})

test('コンビクションはS1の200%と800%を別軽減し、S2は成功率50%を反映する', () => {
  const first = at('peacok', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 2, 1000) * 0.95
    + physical(first.result.stats.attack * 8, 1000) * 0.05)
  assert.equal(first.row.dps, null)
  const second = at('peacok', 2, 60, { actualAttackTargetCount: 3 })
  close(second.row.perAttack, second.result.stats.attack * 3.5 * 0.4 * 0.5)
  close(second.row.allTargetsPerAttack, second.row.perAttack * 3)
  assert.equal(second.row.dps, null)
})

test('歴陣鋭槍フェンの2連撃と2体攻撃を区別し、ブライオファイタの教官特性を適用する', () => {
  const first = at('fang2', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 1.8, 1000) * 2)
  const second = at('fang2', 2, 1000, { actualAttackTargetCount: 2 })
  close(second.row.perAttack, physical(buffed(second.result.stats.attack, 1.2), 1000))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 2)
  assert.deepEqual(output('fang2', 2, { actualAttackTargetCount: 3 }).rows, [])
  const free = at('bryota', 2, 1000), blocked = at('bryota', 2, 1000, { targetBlockedBySelf: true })
  close(free.row.perAttack, physical(buffed(free.result.stats.attack, 0.8) * 1.2, 1000))
  close(blocked.row.perAttack, physical(buffed(blocked.result.stats.attack, 0.8), 1000))
})

test('ケストレルS2は素質発動率を20%から50%へ上げ、攻撃力と速度を一度ずつ反映する', () => {
  const { result, row } = at('rfalcn', 2, 1000)
  const attack = buffed(result.stats.attack, 0.4)
  close(row.perAttack, physical(attack, 1000) * 0.5 + physical(attack * 1.4, 1000) * 0.5)
  close(result.attackInterval, result.stats.baseAttackTime / 1.4)
})

test('ポンシラスS2は初回15秒と2回目以降の永続を別段階で登録する', () => {
  const first = at('buildr', 2), permanent = at('buildr', 2, 0, { skillActivationCount: 2 })
  assert.equal(first.result.activeStageLabel, '初回')
  assert.equal(first.result.model?.duration, 15)
  assert.equal(permanent.result.activeStageLabel, '2回目以降')
  assert.equal(permanent.result.model?.duration, 0)
  close(first.row.perAttack, buffed(first.result.stats.attack, 0.35))
  close(permanent.row.perAttack, first.row.perAttack)
  assert.deepEqual(output('buildr', 2, { skillActivationCount: 0 }).rows, [])
})

test('ルトナダとジャッキーの強化攻撃倍率、回避後速度条件を保持する', () => {
  const luton = at('luton', 1, 1000), jackie = at('jaksel', 1, 1000, { dodgeSpeedActive: true })
  close(luton.row.perAttack, physical(luton.result.stats.attack * 2.3, 1000))
  close(jackie.row.perAttack, physical(jackie.result.stats.attack * 2.5, 1000))
  close(jackie.result.attackSpeed, jackie.result.stats.attackSpeed + 12)
  assert.equal(jackie.row.dps, null)
  assert.deepEqual(output('luton', 2).rows, [])
  assert.deepEqual(output('jaksel', 2).rows, [])
})

test('イーサンは全対象への物理攻撃と付与中の毎秒100術ダメージを分離する', () => {
  const { result, row } = at('ethan', 1, 500, { actualAttackTargetCount: 4, enemyResistance: 60 })
  close(row.perAttack, physical(result.stats.attack, 500))
  close(row.allTargetsPerAttack, row.perAttack * 4)
  close(row.damageOverTimeDps, 40)
  close(row.combinedDps, row.perAttack / result.attackInterval! + 40)
  close(row.allTargetsCombinedDps, row.combinedDps! * 4)
  const absent = at('ethan', 1, 500, { poisonActive: false, enemyResistance: 60 })
  close(absent.row.damageOverTimeDps, 0)
  const second = at('ethan', 2, 500, { actualAttackTargetCount: 5 })
  close(second.row.perAttack, physical(buffed(second.result.stats.attack, 0.7), 500))
  close(second.row.allTargetsPerAttack, second.row.perAttack * 5)
})

test('追加オペレーターの素質値欠落・未確認入力・技能データ変更でも停止する', () => {
  const frost = record('frostl', 2)
  for (const talent of frost.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    candidate.blackboard = []
  }
  assert.deepEqual(outputRecord(frost).rows, [])
  for (const [suffix, index, inputs] of [
    ['wintim', 2, { hasTakenDamage: 'false' }], ['jaksel', 1, { dodgeSpeedActive: 1 }],
    ['ethan', 1, { poisonActive: 'true' }], ['frostl', 2, { attackDistanceType: 'UNKNOWN' }],
  ] as const) assert.deepEqual(output(suffix, index, inputs).rows, [])
  const altered = record('peacok', 1)
  altered.skillLevels[9].blackboard!.find(entry => entry.key === 'peacok_s_1[crit].prob')!.value = 0.8
  assert.deepEqual(outputRecord(altered).rows, [])
})

test('エンカクは強撃220%と永続ATK70%・速度45、サーファーは配置後ATK100%を反映する', () => {
  const first = at('flameb', 1, 1000), permanent = at('flameb', 2, 1000), surfer = at('surfer', 1, 1000)
  close(first.row.perAttack, physical(first.result.stats.attack * 2.2, 1000))
  close(permanent.row.perAttack, physical(buffed(permanent.result.stats.attack, 0.7), 1000))
  close(permanent.result.attackInterval, permanent.result.stats.baseAttackTime / 1.45)
  assert.equal(permanent.result.model?.duration, 0)
  close(surfer.row.perAttack, physical(buffed(surfer.result.stats.attack, 1), 1000))
  assert.deepEqual(output('surfer', 2).rows, [])
})

test('ウィンドチャイムはHP50%以上で20%を加算し、破壊者のブロック対象数を使う', () => {
  const low = at('chimes', 1, 1000, { selfHpPercent: 49.9, actualAttackTargetCount: 2 })
  const half = at('chimes', 1, 1000, { selfHpPercent: 50, actualAttackTargetCount: 2 })
  close(low.row.perAttack, physical(buffed(low.result.stats.attack, 1), 1000))
  close(half.row.perAttack, physical(buffed(half.result.stats.attack, 1.2), 1000))
  close(half.row.allTargetsPerAttack, half.row.perAttack * 2)
  assert.deepEqual(output('chimes', 1, { actualAttackTargetCount: 3 }).rows, [])
  assert.deepEqual(output('chimes', 2).rows, [])
})

test('追加の固定期間10技能のみ期間総ダメージを返し、被弾・HP変化・永続・DOTを区別する', () => {
  const finite = [
    ['frostl', 2, 25], ['vigna', 1, 25], ['vigna', 2, 30], ['frncat', 2, 40], ['fang2', 2, 20],
    ['bryota', 2, 30], ['rfalcn', 2, 15], ['buildr', 2, 15], ['ethan', 2, 30], ['surfer', 1, 20],
  ] as const
  for (const [suffix, index, seconds] of finite) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 500, resistance: 60, enemyCount: 1 })
    assert.deepEqual(result.errors, [], suffix)
    assert.equal(result.durationSeconds, seconds, suffix)
    assert.equal(result.totalDamageReason, null, suffix)
    close(result.totalDamage, result.combinedDps! * seconds)
  }
  for (const [suffix, index] of [['wintim', 2], ['ethan', 1], ['flameb', 2], ['chimes', 1]] as const) {
    const entry = getDamageThreeComparisonEntries([record(suffix, index)])[0]
    const result = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount: 1 })
    assert.deepEqual(result.errors, [], suffix)
    assert.equal(result.totalDamage, null, suffix)
    assert.ok(result.totalDamageReason, suffix)
  }
  const permanent = getDamageThreeComparisonEntries([record('buildr', 2)]).find(entry => entry.stageId === 'permanent')!
  assert.equal(evaluateDamageThreeComparisonEntry(permanent, { defense: 0, resistance: 0, enemyCount: 1 }).totalDamage, null)
})
