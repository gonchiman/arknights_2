import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildTalentStructures } from '../src/lib/talentStructure.ts'
import type { TalentStructure, TalentStructureEffect } from '../src/lib/talentStructure.ts'
import { applyGuardTalentStructure } from '../src/lib/guardTalentEvaluation.ts'
import { evaluateCombatCondition, resolveCombatNumericValue, resolveCombatProbability } from '../src/lib/combatEffectStructure.ts'
import { buildDamageCalculatorThreeOutput } from '../src/lib/damageCalculatorThree.ts'
import type { GuardConditions, GuardPassiveModifiers } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const data = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]

function record(id: string, index = 1): SkillRecord {
  const operator = data.guards.find(value => value.id === id)!
  const entry = operator.skills.find(value => value.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: operator.name, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === id)!.operatorProfile) }
}

function source(skill: SkillRecord, talentIndex: number) {
  const selected = skill.operatorProfile.talents![talentIndex].candidates!
    .find(candidate => candidate.unlockCondition?.phase === 'PHASE_2' && candidate.requiredPotentialRank === 0)
  assert.ok(selected)
  return selected
}

function structure(skill: SkillRecord, talentIndex: number) {
  const selected = buildTalentStructures([skill]).find(item => item.basicInfo.talentIndex === talentIndex)
  assert.ok(selected)
  return selected
}

function calculate(skill: SkillRecord, guard: GuardConditions = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill,
    phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, conditions: { guard } })
}

function emptyModifiers(): GuardPassiveModifiers {
  return { attackRatio: 0, attackFlat: 0, attackScale: 1, attackSpeed: 0, damageScale: 1,
    defenseIgnoreRatio: 0, defenseIgnoreFixed: 0, resistanceIgnoreFixed: 0, resistanceIgnoreRatio: 0,
    defenseReductionRatio: 0, critChance: 0, critScale: 1, additionalActions: [], evaluations: [], blockers: [], notes: [] }
}

function apply(structure: TalentStructure, metrics: Record<string, number | string | boolean> = {}) {
  const output = emptyModifiers()
  applyGuardTalentStructure(output, structure, { actionKind: 'NORMAL', skillIndex: 1, ...metrics })
  return output
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-10, `${actual} != ${expected}`)
}

test('構造化済み効果の値だけを変更すると共通評価結果も変わる', () => {
  const original = structure(record('char_010_chen'), 1)
  const attack = original.effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  assert.ok(attack)
  assert.equal('value' in attack && attack.value, 0.05)
  const changed: TalentStructure = { ...original, effects: original.effects.map(effect => effect === attack
    ? { ...effect, value: 0.35 } as TalentStructureEffect : effect) }
  const before = apply(original)
  const after = apply(changed)
  assert.deepEqual(before.blockers, [])
  assert.deepEqual(after.blockers, [])
  close(before.attackRatio, 0.05)
  close(after.attackRatio, 0.35)
  // Neither the original blackboard nor an operator-specific formula changed.
  assert.deepEqual(changed.source.blackboard, original.source.blackboard)
})

test('構造化効果の条件と対象が計算を制御し、未知の条件をfalseとして扱わない', () => {
  const original = structure(record('char_010_chen'), 1)
  const attack = original.effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  const conditional: TalentStructure = { ...original, effects: [{ ...attack,
    condition: { type: 'COMPARE', metric: 'testCondition', comparison: 'EQ', value: true },
  }] }
  close(apply(conditional, { testCondition: true }).attackRatio, 0.05)
  close(apply(conditional, { testCondition: false }).attackRatio, 0)
  const missing = apply(conditional)
  assert.ok(missing.blockers.length > 0)
  assert.ok(missing.evaluations.some(effect => effect.status === 'UNSUPPORTED'))
  const alliesOnly: TalentStructure = { ...original, effects: [{ ...attack,
    target: { ...attack.target, side: 'ALLY', includeSelf: false },
  }] }
  const excluded = apply(alliesOnly)
  assert.deepEqual(excluded.blockers, [])
  close(excluded.attackRatio, 0)
  assert.ok(excluded.evaluations.every(effect => effect.status === 'NOT_RELEVANT'))
})

test('同じ素質データの変更が構造表示とDC3のATK計算へ反映される', () => {
  const original = record('char_010_chen')
  const changed = structuredClone(original)
  source(changed, 1).blackboard!.find(entry => entry.key === 'atk')!.value = 0.15
  const effect = structure(changed, 1).effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  assert.equal('value' in effect && effect.value, 0.15)
  const before = calculate(original), after = calculate(changed)
  assert.deepEqual(before.unsupportedReasons, [])
  assert.deepEqual(after.unsupportedReasons, [])
  close(after.talentAttackRatio - before.talentAttackRatio, 0.1)
  close(after.effectiveAttack! - before.effectiveAttack!, before.stats.attack * 0.1)
  assert.ok(after.rows[0].perAttack > before.rows[0].perAttack)
})

test('防御無視は構造表示とDC3で同じ値を参照し、防御0ではダメージを増やさない', () => {
  const original = record('char_1014_nearl2')
  const changed = structuredClone(original)
  source(changed, 1).blackboard!.find(entry => entry.key === 'def_penetrate')!.value = 0.4
  const effect = structure(changed, 1).effects.find(effect => effect.item === 'DEFENSE_IGNORE_RATIO')!
  assert.equal('value' in effect && effect.value, 0.4)
  const before = calculate(original), after = calculate(changed)
  assert.deepEqual(before.unsupportedReasons, [])
  assert.deepEqual(after.unsupportedReasons, [])
  close(before.rows[0].perAttack, after.rows[0].perAttack)
  const index = before.rows.findIndex(row => row.axisValue === 500)
  assert.ok(index >= 0)
  close(after.rows[index].perAttack - before.rows[index].perAttack, 100)
})

test('必要な参照値の欠落や非有限値を0として計算を続行しない', () => {
  for (const value of [undefined, NaN, Infinity]) {
    const skill = record('char_010_chen')
    const candidate = source(skill, 1)
    if (value === undefined) candidate.blackboard = candidate.blackboard!.filter(entry => entry.key !== 'atk')
    else candidate.blackboard!.find(entry => entry.key === 'atk')!.value = value
    assert.ok(structure(skill, 1).issues.length > 0)
    const result = calculate(skill)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
    assert.equal(result.effectiveAttack, null)
  }
})

test('構造に必要な入力が未解決なら適用数値を確定しない', () => {
  const original = structure(record('char_010_chen'), 1)
  const attack = original.effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  const dynamic: TalentStructure = { ...original, effects: [{ ...attack,
    value: { type: 'METRIC', metric: 'missingMultiplier' },
  } as TalentStructureEffect] }
  assert.ok(apply(dynamic).blockers.length > 0)
  const resolved = apply(dynamic, { missingMultiplier: 0.27 })
  assert.deepEqual(resolved.blockers, [])
  close(resolved.attackRatio, 0.27)
})

test('未対応の有効期間条件を無視して常時バフへ置き換えない', () => {
  const original = structure(record('char_010_chen'), 1)
  const attack = original.effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  const conditionalLifetime: TalentStructure = { ...original, effects: [{ ...attack,
    lifetime: { type: 'WHILE_CONDITION', condition: { type: 'COMPARE', metric: 'active', comparison: 'EQ', value: true } },
  }] }
  const result = apply(conditionalLifetime, { active: false })
  assert.ok(result.blockers.length > 0)
  close(result.attackRatio, 0)
})

test('被ダメージ後の持続バフと、被ダメージを起点とする追加攻撃を区別する', () => {
  const buff = structure(record('char_4011_lessng'), 1)
  const inactive = apply(buff, { recentDamageTaken: false })
  const active = apply(buff, { recentDamageTaken: true })
  assert.deepEqual(active.blockers, [])
  assert.equal(inactive.attackRatio, 0)
  assert.ok(active.attackRatio > 0)

  // A maintained buff affects later attacks. A separate reaction does not occur
  // once per normal attack, even if the ally's faction condition is fulfilled.
  const counter = structure(record('char_4064_mlynar'), 1)
  const output = apply(counter, { 'damagedAlly.isKazimierz': true })
  assert.deepEqual(output.blockers, [])
  assert.deepEqual(output.additionalActions, [])
  assert.ok(output.evaluations.every(effect => effect.status === 'NOT_RELEVANT'))
})

test('確率攻撃は共通の確率定義を使い、その攻撃だけに効果を限定する', () => {
  const talent = structure(record('char_264_f12yin'), 0)
  const critical = talent.effects.find(effect => effect.item === 'CRITICAL_ATTACK')!
  assert.ok(critical)
  assert.deepEqual(critical.lifetime, { type: 'CURRENT_EVENT' })
  assert.equal('chance' in critical, false)
  const ordinary = { skillIndex: 1 }, skillThree = { skillIndex: 3, 'skill.talent@prob': 0.73 }
  close(resolveCombatProbability(critical.probability, ordinary)!, 0.2)
  close(resolveCombatProbability(critical.probability, skillThree)!, 0.73)
  close(apply(talent, ordinary).critChance, 0.2)
  close(apply(talent, skillThree).critChance, 0.73)
  assert.ok(apply(talent, { skillIndex: 3 }).blockers.length > 0)
  const debuff = talent.effects.find(effect => effect.item === 'ATK_BUFF_RATIO' && effect.target.side === 'ENEMY')!
  assert.ok(debuff)
  assert.ok(critical.probability.sharedRollId)
  assert.equal(critical.probability.sharedRollId, debuff.probability.sharedRollId)
  close(resolveCombatProbability(debuff.probability, skillThree)!, 0.73)
})

test('通常のATKバフへ未対応の確率や計算操作を与えても全量適用しない', () => {
  const talent = structure(record('char_010_chen'), 1)
  const attack = talent.effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  const probabilistic: TalentStructure = { ...talent, effects: [{ ...attack,
    probability: { ...attack.probability, chance: 0.5 },
  }] }
  const chance = apply(probabilistic)
  assert.ok(chance.blockers.length > 0)
  assert.equal(chance.attackRatio, 0)
  const badOperation: TalentStructure = { ...talent, effects: [{ ...attack,
    operation: 'MULTIPLY',
  } as unknown as TalentStructureEffect] }
  assert.ok(apply(badOperation).blockers.length > 0)
})

test('パラスのHP条件は効果を受ける味方のHPを参照する', () => {
  const talent = structure(record('char_485_pallas'), 0)
  const attack = talent.effects.find(effect => effect.item === 'ATK_BUFF_RATIO')!
  assert.ok(attack)
  assert.equal(evaluateCombatCondition(attack.condition, { 'source.hpRatio': 0.1, 'recipient.hpRatio': 1 }), true)
  assert.equal(evaluateCombatCondition(attack.condition, { 'source.hpRatio': 1, 'recipient.hpRatio': 0.1 }), false)
  assert.equal(evaluateCombatCondition(attack.condition, { 'source.hpRatio': 1 }), null)
  const minos = apply(talent, { 'recipient.hpRatio': 1, 'source.faction.minos': true })
  const other = apply(talent, { 'recipient.hpRatio': 1, 'source.faction.minos': false })
  assert.deepEqual(minos.blockers, [])
  assert.deepEqual(other.blockers, [])
  assert.ok(minos.attackRatio > 0)
  assert.equal(other.attackRatio, 0)
  assert.ok(apply(talent, { 'recipient.hpRatio': 1 }).blockers.length > 0)
})

test('怒潮ズィマーのスキル中バフは自身と味方の陣営条件を区別する', () => {
  const talent = structure(record('char_1051_headb2'), 1)
  const buffs = talent.effects.filter(effect => effect.item === 'ATK_BUFF_RATIO' || effect.item === 'DEFENSE_BUFF_RATIO')
  assert.equal(buffs.length, 4)
  for (const effect of buffs) {
    assert.equal(evaluateCombatCondition(effect.condition, { 'source.skillActive': true }), true)
    assert.equal(evaluateCombatCondition(effect.condition, { 'source.skillActive': false }), false)
    assert.ok('value' in effect && typeof effect.value !== 'boolean' && effect.value !== undefined)
    if (!('value' in effect) || typeof effect.value === 'boolean' || effect.value === undefined) continue
    if (effect.target.side === 'SELF') close(resolveCombatNumericValue(effect.value, {})!, 0.28)
    else {
      assert.equal(effect.target.side, 'ALLY')
      assert.equal(effect.target.includeSelf, false)
      close(resolveCombatNumericValue(effect.value, { 'recipient.isUrsusStudent': true })!, 0.28)
      close(resolveCombatNumericValue(effect.value, { 'recipient.isUrsusStudent': false })!, 0.14)
      assert.equal(resolveCombatNumericValue(effect.value, {}), null)
    }
  }
})

test('司霆レイズの攻撃倍率はスキル中の条件を保持する', () => {
  const talent = structure(record('char_1043_leizi2'), 0)
  const multiplier = talent.effects.find(effect => effect.item === 'ATTACK_SCALE')!
  assert.ok(multiplier)
  assert.equal(evaluateCombatCondition(multiplier.condition, { 'source.skillActive': true }), true)
  assert.equal(evaluateCombatCondition(multiplier.condition, { 'source.skillActive': false }), false)
  assert.equal(evaluateCombatCondition(multiplier.condition, {}), null)
})
