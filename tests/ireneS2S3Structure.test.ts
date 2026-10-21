import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findSkillStructure, getSkillStructureLevelIndices, getSkillStructureEffectValueRows,
  type SkillStructureEffect } from '../src/lib/skillStructure.ts'
import type { RawSkillLevel } from '../src/types/skill.ts'

// Pinned game data, downloaded independently of the production registry.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/ireneS2S3.json', import.meta.url), 'utf8')) as {
  source: { commit: string }; operatorId: string
  skills: { skillId: string; skillIndex: number; levels: RawSkillLevel[] }[]
}
function skill(skillIndex: number) {
  const source = fixture.skills.find(value => value.skillIndex === skillIndex)!
  const structure = findSkillStructure({ operatorId: fixture.operatorId, skillId: source.skillId, skillIndex, levelIndex: 9 })
  assert.ok(structure, `Irene S${skillIndex}`)
  return { source, structure }
}
const damageEffects = (effects: readonly SkillStructureEffect[]) => effects.filter(effect => effect.item === 'DIRECT_DAMAGE')

test('S2/S3は固定版JPの全10レベルを保存し、特化3の説明・パラメータを独立に照合する', () => {
  assert.equal(fixture.source.commit, '71b6dc1bbf5d6227a58e649b1f4b4f75c9d7de50')
  for (const skillIndex of [2, 3]) {
    const { source, structure } = skill(skillIndex), raw = source.levels[9]
    assert.equal(source.levels.length, 10)
    assert.equal(structure.basicInfo.skillName, raw.name)
    assert.equal(structure.source.rawDescription, raw.description)
    assert.deepEqual(structure.source.blackboard, raw.blackboard)
    assert.equal(structure.source.rangeId, raw.rangeId)
    assert.equal(structure.source.duration, raw.duration)
    assert.ok(structure.classificationInfo.coarseCategories.includes('BURST'))
    assert.deepEqual(structure.activationSettings, {
      spRecovery: 'INCREASE_WHEN_ATTACK', initialSp: raw.spData!.initSp,
      spCost: raw.spData!.spCost, maxCharges: raw.spData!.maxChargeTime,
      activationMethod: 'MANUAL', activationTrigger: 'MANUAL_INPUT',
    })
    assert.equal(structure.effectStructure.targetSelection?.initialState, skillIndex === 2 ? 'GROUND' : 'USER_DEFINED')
    assert.equal(structure.effectStructure.stages.length, 1)
    assert.deepEqual(structure.effectStructure.stages[0].duration, { type: 'SKILL_ACTION' })
    assert.deepEqual(structure.effectStructure.stages[0].endCondition, { type: 'ATTACK_RESOLVED' })
    assert.deepEqual(getSkillStructureLevelIndices(structure.basicInfo), [9])
    for (const levelIndex of [0, 8, 10]) assert.equal(findSkillStructure({ ...structure.basicInfo, levelIndex }), null)
  }
})

test('S2は6体上限・4倍物理の一斉攻撃と、重量3以下かつ浮遊可能の4秒浮遊を保持する', () => {
  const { structure } = skill(2), effects = structure.effectStructure.stages[0].effects
  assert.equal(structure.basicInfo.skillName, '裂潮')
  assert.equal(structure.effectStructure.targetSelection?.maxTargets, 6)
  const lift = effects.find(effect => effect.item === 'APPLY_STATUS')
  assert.ok(lift && lift.item === 'APPLY_STATUS')
  assert.equal(lift.value.statusId, 'LEVITATE')
  assert.equal(lift.value.durationSeconds, 4)
  assert.equal(lift.value.maxWeight, 3)
  assert.deepEqual(lift.condition, { metric: 'targetCanBeLevitated', comparison: 'EQ', value: true })
  const damage = damageEffects(effects)
  assert.equal(damage.length, 1)
  assert.equal(damage[0].timing, 'ON_STAGE_ENTER')
  assert.equal(damage[0].target, 'ENEMIES_IN_ACTION_RANGE')
  assert.equal(damage[0].value.damageType, 'PHYSICAL')
  assert.equal(damage[0].value.attackScale, 4)
  assert.equal(damage[0].value.count, 1)
  assert.equal(damage[0].value.targeting?.selection, 'ALL')
  assert.ok(damage[0].afterEffects?.includes(lift.id), 'lift eligibility must precede the talent roll of the damage')
  assert.ok(structure.effectStructure.inputRequirements?.includes('targetWeight'))
})

test('S3は3倍の全体初撃と、ランダム主対象への2.5倍範囲砲撃12発を別に保持する', () => {
  const { structure } = skill(3), effects = structure.effectStructure.stages[0].effects
  assert.equal(structure.basicInfo.skillName, '判決')
  assert.equal(structure.effectStructure.targetSelection?.maxTargets, null)
  const lift = effects.find(effect => effect.item === 'APPLY_STATUS')
  assert.ok(lift && lift.item === 'APPLY_STATUS')
  assert.equal(lift.value.durationSeconds, 4)
  assert.deepEqual(lift.value.durationWeightScaling, { threshold: 3, multiplier: 0.5 })
  const damages = damageEffects(effects)
  assert.equal(damages.length, 2)
  const initial = damages.find(effect => effect.value.targeting?.selection === 'ALL')!
  const barrage = damages.find(effect => effect.value.targeting?.selection === 'RANDOM')!
  assert.ok(initial && barrage)
  assert.equal(initial.value.attackScale, 3)
  assert.equal(initial.value.count, 1)
  assert.equal(initial.value.damageType, 'PHYSICAL')
  assert.ok(initial.afterEffects?.includes(lift.id))
  assert.equal(barrage.value.attackScale, 2.5)
  assert.equal(barrage.value.count, 12)
  assert.equal(barrage.value.intervalSeconds, 0.25)
  assert.equal(barrage.value.damageType, 'PHYSICAL')
  assert.ok(barrage.afterEffects?.includes(initial.id))
  for (const metric of ['targetWeight', 'splashTargetCount', 'airborneHitCount'] as const) {
    assert.ok(structure.effectStructure.inputRequirements?.includes(metric), metric)
  }
  for (const effect of [lift, initial, barrage]) {
    const rows = getSkillStructureEffectValueRows(effect)
    assert.ok(rows.length >= 3)
    assert.ok(rows.every(([label, value]) => label.length > 0 && value !== undefined))
  }
})
