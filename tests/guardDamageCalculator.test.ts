import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures } from '../src/lib/damageCalculatorThree.ts'
import { GUARD_SKILL_RECIPES } from '../src/lib/guardSkillRecipes.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { SkillRecord, OperatorCombatProfile, RawSkillLevel } from '../src/types/skill.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'

const data = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; supported: boolean; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function record(id: string, index: number): SkillRecord {
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
function output(id: string, index: number, guard: GuardConditions = {}) {
  const skill = record(id, index)
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, conditions: { guard } })
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
}
function at(id: string, index: number, axis: number, conditions: GuardConditions = {}) {
  const result = output(id, index, conditions)
  assert.deepEqual(result.unsupportedReasons, [])
  return { result, row: result.rows.find(row => row.axisValue === axis)! }
}

test('独立したJP fixtureの全30人90スキルを欠落・重複なく表示対象にする', () => {
  const actual = getDamageCalculatorThreeStructures().map(s => `${s.basicInfo.operatorId}/${s.basicInfo.skillId}/${s.basicInfo.skillIndex}`).sort()
  const expected = data.guards.flatMap(operator => operator.skills.map(skill => `${operator.id}/${skill.skillId}/${skill.skillIndex}`)).sort()
  assert.equal(actual.length, 90)
  assert.deepEqual(actual, expected)
})

test('全追加スキルの全段階で、有限の結果または具体的な保留理由を返し例外・部分結果を漏らさない', () => {
  for (const recipe of GUARD_SKILL_RECIPES) for (const stage of recipe.stages) {
    const conditions: Record<string, number | boolean | string> = {}
    if (stage.when) conditions[stage.when.input] = stage.when.value
    const result = output(recipe.operatorId, recipe.skillIndex, conditions)
    assert.ok(result.guard)
    if (result.unsupportedReasons.length) assert.deepEqual(result.rows, [])
    else {
      assert.ok(result.rows.length)
      for (const row of result.rows) assert.ok([row.perAttack, row.allTargetsPerAttack, row.dps ?? 0].every(Number.isFinite))
    }
  }
})

test('ブレイズS2: 攻撃力2倍と群攻3体を一度だけ適用し、永続を有限時間の総量へ変換しない', () => {
  const { result, row } = at('char_017_huang', 2, 1000, { actualAttackTargetCount: 3 })
  const attack = result.stats.attack * 2
  close(row.perAttack, Math.max(attack - 1000, attack * 0.05))
  close(row.allTargetsPerAttack, row.perAttack * 3)
  close(row.dps, row.perAttack / result.stats.baseAttackTime)
  assert.equal(result.model!.duration, 0)
})

test('百錬ガヴィルS3: ブロック数5の素質とATK140%・ASPD100を併用し対象上限5を守る', () => {
  const { result, row } = at('char_1026_gvial2', 3, 0, { blockedEnemyCount: 5, actualAttackTargetCount: 5 })
  close(row.perAttack, Math.floor(result.stats.attack * (1 + 1.4 + 0.1 + 0.04 * 5) + 1e-9))
  close(row.allTargetsPerAttack, row.perAttack * 5)
  close(result.attackInterval, result.stats.baseAttackTime / 2)
  assert.ok(output('char_1026_gvial2', 3, { actualAttackTargetCount: 6 }).unsupportedReasons.length)
})

test('耀騎士ニアールS1: 攻撃力70%とASPD50、防御力20%無視を通常攻撃へ適用する', () => {
  const { result, row } = at('char_1014_nearl2', 1, 1000)
  const attack = Math.floor(result.stats.attack * 1.7 + 1e-9)
  close(row.perAttack, Math.max(attack - 800, attack * 0.05))
  close(result.attackInterval, result.stats.baseAttackTime / 1.5)
})

test('チェンS2: 物理500%と術500%を別軽減し、通常2hitや7対象を二重に掛けない', () => {
  const { result, row } = at('char_010_chen', 2, 1000, { enemyResistance: 40, actualAttackTargetCount: 7 })
  const attack = Math.floor(result.stats.attack * 1.05 + 1e-9) * 5
  close(row.perAttack, Math.max(attack - 1000, attack * 0.05) + attack * 0.6)
  close(row.allTargetsPerAttack, row.perAttack * 7)
  assert.equal(row.dps, null)
  assert.deepEqual(row.attackComponents.map(component => component.damageType), ['PHYSICAL', 'ARTS'])
})

test('マウンテンS1: 確率倍率は軽減後に加重し、対象2体へ1回ずつ与える', () => {
  const { result, row } = at('char_264_f12yin', 1, 1000, { actualAttackTargetCount: 2 })
  const normal = result.stats.attack * 2.3, critical = normal * 1.6
  const expected = Math.max(normal - 1000, normal * 0.05) * 0.8 + Math.max(critical - 1000, critical * 0.05) * 0.2
  close(row.perAttack, expected)
  close(row.allTargetsPerAttack, expected * 2)
  assert.notEqual(row.perAttack, Math.max(normal * 1.12 - 1000, normal * 1.12 * 0.05))
})

test('ヘラグS2: HP30%時のASPD100と通常2打撃を両方適用する', () => {
  const { result, row } = at('char_188_helage', 2, 0, { selfHpPercent: 30 })
  close(row.perAttack, Math.floor(result.stats.attack * 1.8 + 1e-9) * 2)
  close(result.attackInterval, result.stats.baseAttackTime / 2)
})

test('ペペS1: 周囲50%は軽減前の攻撃倍率で、全員へ主対象ダメージを複製しない', () => {
  const { result, row } = at('char_4058_pepe', 1, 1000, { actualAttackTargetCount: 3 })
  const attack = Math.floor(result.stats.attack * 1.16 + 1e-9) * 2.9
  const main = Math.max(attack - 1000, attack * 0.05), splash = Math.max(attack * 0.5 - 1000, attack * 0.025)
  close(row.allTargetsPerAttack, main + splash * 2)
  close(row.perAttack, (main + splash * 2) / 3)
})

test('ズオ・ラウS3: 6通常斬撃と倍率2倍の終撃を別々に軽減する', () => {
  const { result, row } = at('char_4121_zuole', 3, 1000)
  const attack = result.stats.attack * 2.45
  close(row.perAttack, Math.max(attack - 1000, attack * 0.05) * 6 + Math.max(attack * 2 - 1000, attack * 0.1))
  assert.deepEqual(row.attackComponents.map(component => component.count), [6, 1])
})

test('不正な入力・不明な素質と時間挙動は既定値へ置換せず数値出力を止める', () => {
  for (const conditions of [{ actualAttackTargetCount: NaN }, { actualAttackTargetCount: 1.1 }, { actualAttackTargetCount: 0 }]) {
    const result = output('char_017_huang', 2, conditions)
    assert.ok(result.unsupportedReasons.length)
    assert.deepEqual(result.rows, [])
  }
  const music = output('char_4182_oblvns', 2)
  assert.ok(music.unsupportedReasons.some(reason => /音符/.test(reason)))
  const missing = record('char_1014_nearl2', 1)
  missing.operatorProfile.talents = []
  assert.deepEqual(buildDamageCalculatorThreeOutput({ operator: missing, skill: missing, phaseIndex: 2,
    operatorLevel: 90, trust: 100, skillLevelIndex: 9 }).rows, [])
  for (const patch of [{ trust: NaN }, { operatorLevel: NaN }, { phaseIndex: NaN }]) {
    const skill = record('char_017_huang', 2)
    const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2,
      operatorLevel: 90, trust: 100, skillLevelIndex: 9, ...patch })
    assert.ok(result.unsupportedReasons.length)
    assert.deepEqual(result.rows, [])
  }
})

test('特化3データの欠落や重複した数値キーは定数recipeでも出力を止める', () => {
  for (const corrupt of [
    (skill: SkillRecord) => { skill.skillLevels = [] },
    (skill: SkillRecord) => { skill.skillLevels[9].blackboard!.push({ ...skill.skillLevels[9].blackboard![0] }) },
    (skill: SkillRecord) => { skill.skillLevels[9].blackboard![0].value = NaN },
  ]) {
    const skill = record('char_017_huang', 2)
    corrupt(skill)
    const result = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2,
      operatorLevel: 90, trust: 100, skillLevelIndex: 9 })
    assert.ok(result.unsupportedReasons.length)
    assert.deepEqual(result.rows, [])
  }
})
