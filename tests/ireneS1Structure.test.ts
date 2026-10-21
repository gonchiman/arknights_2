import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { findSkillStructure, getSkillStructureLevelIndices, formatSkillStructureEffectItem,
  formatSkillStructureEffectOperation, getSkillStructureEffectValueRows } from '../src/lib/skillStructure.ts'
import { buildTalentStructures } from '../src/lib/talentStructure.ts'
import { evaluateCombatCondition } from '../src/lib/combatEffectStructure.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ireneS1.json', import.meta.url), 'utf8')) as {
  source: { commit: string }; operator: { operatorId: string; operatorName: string; description: string }
  operatorProfile: OperatorCombatProfile; skill: { skillId: string; skillIndex: number; levels: RawSkillLevel[] }
}
const selection = { operatorId: fixture.operator.operatorId, skillId: fixture.skill.skillId, skillIndex: 1, levelIndex: 9 }
function record(): SkillRecord {
  const raw = structuredClone(fixture.skill.levels[9])
  return { id: 'irene-s1', operatorId: fixture.operator.operatorId, operatorName: fixture.operator.operatorName,
    profession: 'WARRIOR', professionLabel: '前衛', rarity: 6, subProfessionId: 'sword', subProfessionName: '剣豪',
    nameInitial: 'A_ROW', skillId: fixture.skill.skillId, skillIndex: 1, skillName: raw.name!,
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: 'INCREASE_WHEN_ATTACK', initSp: 0, spCost: 3, classification: classifySkill(raw),
    skillLevels: structuredClone(fixture.skill.levels), raw, operatorProfile: structuredClone(fixture.operatorProfile) }
}
function skill() {
  const value = findSkillStructure(selection)
  assert.ok(value)
  return value
}

test('アイリーニはS1特化3だけを登録し、別スキル・別段階へ検証済み構造を代用しない', () => {
  const structure = skill()
  assert.equal(structure.basicInfo.operatorName, 'アイリーニ')
  assert.equal(structure.basicInfo.skillName, '舞風')
  assert.deepEqual(getSkillStructureLevelIndices(selection), [9])
  for (const levelIndex of [0, 8, 10]) assert.equal(findSkillStructure({ ...selection, levelIndex }), null)
  for (const skillIndex of [2, 3]) assert.equal(findSkillStructure({ ...selection, skillIndex, skillId: `skchr_irene_${skillIndex}` }), null)
})

test('S1の説明・倍率・浮遊秒数・SP設定を保存済みJP原典と独立に照合する', () => {
  const structure = skill(), source = fixture.skill.levels[9]
  assert.equal(fixture.source.commit, '71b6dc1bbf5d6227a58e649b1f4b4f75c9d7de50')
  assert.equal(fixture.skill.levels.length, 10)
  assert.equal(structure.source.rawDescription, source.description)
  assert.deepEqual(structure.source.blackboard, source.blackboard)
  assert.deepEqual(structure.activationSettings, { spRecovery: 'INCREASE_WHEN_ATTACK', initialSp: 0,
    spCost: 3, maxCharges: 1, activationMethod: 'AUTO', activationTrigger: 'NEXT_NORMAL_ATTACK' })
  assert.ok(structure.classificationInfo.coarseCategories.includes('NEXT_ATTACK'))
  assert.equal(structure.effectStructure.stages.length, 1)
  assert.deepEqual(structure.effectStructure.stages[0].duration, { type: 'SINGLE_ATTACK' })
  assert.deepEqual(structure.effectStructure.stages[0].endCondition, { type: 'ATTACK_RESOLVED' })
})

test('浮遊→初撃→追撃を依存関係で保持し、通常攻撃の2hitへ追加する4hit構造にしない', () => {
  const effects = skill().effectStructure.stages[0].effects
  assert.equal(effects.length, 3)
  const [lift, first, second] = effects
  assert.equal(lift.item, 'APPLY_STATUS')
  assert.equal(lift.operation, 'APPLY_STATUS')
  assert.equal(lift.unit, 'STATUS_APPLICATION')
  assert.deepEqual(lift.value, { statusId: 'LEVITATE', durationSeconds: 1 })
  assert.deepEqual(lift.condition, { metric: 'targetCanBeLevitated', comparison: 'EQ', value: true })
  assert.ok(first.afterEffects?.includes(lift.id))
  assert.ok(second.afterEffects?.includes(first.id))
  for (const effect of [first, second]) {
    assert.equal(effect.item, 'DIRECT_DAMAGE')
    assert.equal(effect.operation, 'DEAL_DAMAGE')
    assert.equal(effect.unit, 'DAMAGE_ACTION')
    assert.deepEqual(effect.value, { damageType: 'PHYSICAL', attackScale: 2, count: 1 })
    assert.equal(effect.condition, null, 'failed lift cannot remove either damage action')
    assert.equal(effect.sourceBinding, 'atk_scale')
    assert.ok(formatSkillStructureEffectItem(effect.item))
    assert.ok(formatSkillStructureEffectOperation(effect))
    assert.ok(getSkillStructureEffectValueRows(effect).length >= 3)
  }
})

test('独立原典の育成・通常特性を保持し、素質はE2潜在1MODなしの2枠だけを抽出する', () => {
  assert.match(fixture.operator.description, /2回/)
  const rows = buildTalentStructures([record()])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => row.basicInfo.talentName), ['審判の灯火', '浄化の剣'])
  for (const row of rows) {
    assert.equal(row.basicInfo.operatorId, 'char_4009_irene')
    assert.equal(row.basicInfo.phaseIndex, 2)
    assert.equal(row.basicInfo.potentialRank, 1)
    assert.equal(row.basicInfo.module, 'NONE')
    assert.equal(row.source.requiredPotentialRank, 0)
    const source = fixture.operatorProfile.talents![row.basicInfo.talentIndex].candidates!
      .find(candidate => candidate.unlockCondition?.phase === 'PHASE_2' && candidate.requiredPotentialRank === 0)!
    assert.equal(row.source.description, source.description)
    assert.deepEqual(row.source.blackboard, source.blackboard)
  }
})

test('防御無視は地上50%と空中100%の排他確率であり、防御無視率そのものは両方50%とする', () => {
  const talent = buildTalentStructures([record()]).find(row => row.basicInfo.talentIndex === 0)!
  assert.ok(talent)
  assert.equal(talent.effects.length, 2)
  for (const targetAirborne of [false, true]) {
    const matching = talent.effects.filter(effect => evaluateCombatCondition(effect.condition, { 'target.isAirborne': targetAirborne }) === true)
    assert.equal(matching.length, 1)
    const effect = matching[0]
    assert.equal(effect.item, 'DEFENSE_IGNORE_RATIO')
    assert.equal(effect.operation, 'IGNORE_RATIO')
    assert.equal(effect.unit, 'RATIO')
    assert.equal(effect.value, 0.5)
    assert.equal(effect.probability.chance, targetAirborne ? 1 : 0.5)
    assert.equal(effect.sourceBinding, 'def_penetrate')
  }
})

test('海の怪物の存在は自己ASPD18/36の排他条件であり、攻撃対象が怪物かどうかではない', () => {
  const talent = buildTalentStructures([record()]).find(row => row.basicInfo.talentIndex === 1)!
  assert.ok(talent)
  assert.equal(talent.effects.length, 2)
  for (const hasSeaMonster of [false, true]) {
    const matching = talent.effects.filter(effect => evaluateCombatCondition(effect.condition, { 'battlefield.hasSeaMonster': hasSeaMonster }) === true)
    assert.equal(matching.length, 1)
    const effect = matching[0]
    assert.equal(effect.item, 'ATTACK_SPEED')
    assert.equal(effect.operation, 'ADD_VALUE')
    assert.equal(effect.unit, 'POINT')
    assert.equal(effect.value, hasSeaMonster ? 36 : 18)
    assert.equal(effect.target.side, 'SELF')
    assert.equal(effect.probability.chance, 1)
  }
})

test('原典prob・def_penetrate・attack_speedの値は名前ごとの固定係数へ置き換えず構造へ伝える', () => {
  const input = record()
  const first = input.operatorProfile.talents![0].candidates!.find(candidate => candidate.unlockCondition?.phase === 'PHASE_2')!
  const second = input.operatorProfile.talents![1].candidates!.find(candidate => candidate.requiredPotentialRank === 0)!
  first.blackboard!.find(entry => entry.key === 'prob')!.value = 0.2
  first.blackboard!.find(entry => entry.key === 'def_penetrate')!.value = 0.3
  second.blackboard!.find(entry => entry.key === 'attack_speed')!.value = 27
  const rows = buildTalentStructures([input])
  const ignore = rows[0].effects
  assert.ok(ignore.every(effect => effect.item === 'DEFENSE_IGNORE_RATIO' && effect.value === 0.3))
  assert.deepEqual(ignore.map(effect => effect.probability.chance).sort(), [0.2, 1])
  assert.deepEqual(rows[1].effects.map(effect => effect.value).sort(), [27, 54])
})
