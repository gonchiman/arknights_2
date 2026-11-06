import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTraitStructures } from '../src/lib/traitStructure.ts'
import { evaluateGuardTraits } from '../src/lib/guardTraitEvaluation.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/dc3TraitAdditionalSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function operator(id: string) {
  const source = sources.find(source => source.operatorId === id)!
  return { operatorId: id, operatorName: source.operatorName, profession: source.profession, professionLabel: source.profession,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, operatorProfile: structuredClone(source.profile) }
}
function evaluate(id: string, overrides: Partial<GuardStage> = {}) {
  const source = sources.find(source => source.operatorId === id)!
  return evaluateGuardTraits(operator(id), { id: 'reviewed', label: '確認済みの動作', kind: 'NORMAL',
    actions: [{ role: 'MAIN', label: '敵への攻撃', damageType: 'ARTS', scale: 1 }], ...overrides },
  { actualAttackTargetCount: 3, sourceIsAirborne: true }, new Map(),
  { phaseIndex: source.phaseIndex, operatorLevel: source.profile.phases[source.phaseIndex].maxLevel! })
}

test('罠師・巡空者・傭兵・医師・療養師・連鎖癒師の原文を独立した資料で照合する', () => {
  assert.equal(sources.length, 7)
  assert.equal(new Set(sources.map(source => source.subProfessionId)).size, 6)
  for (const source of sources) {
    const trait = buildTraitStructures([operator(source.operatorId)])[0]
    assert.ok(trait, source.operatorId)
    assert.equal(trait.status, 'STRUCTURED', source.operatorId)
    assert.deepEqual(trait.issues, [], source.operatorId)
  }
})

test('治療職の基本行動から敵への通常ダメージを生成せず、確認済みの攻撃スキルだけで上書きする', () => {
  for (const id of ['char_345_folnic', 'char_1052_kalts2', 'char_4179_monstr']) {
    for (const kind of ['NORMAL', 'NEXT_ATTACK'] as const) {
      assert.ok(evaluate(id, { kind }).evaluation.blockers.length, id)
      const attack = evaluate(id, { kind, traitOverrides: ['NORMAL_ATTACK_ENABLED'] })
      assert.deepEqual(attack.evaluation.blockers, [], id)
      assert.equal(attack.actions.length, 1)
      assert.equal(attack.actions[0].damageType, 'ARTS')
      assert.equal(attack.actions[0].scale, 1)
      assert.equal(attack.maxTargets, 1, '味方への連鎖治療を敵への跳躍攻撃へ変換しない')
      assert.equal(attack.evaluation.evaluations.find(row => row.effectId === 'healing-normal-action')!.status, 'NOT_RELEVANT')
    }
  }
})

test('罠の設置・離陸時のブロック・コスト消費を攻撃倍率や複数対象へ置き換えない', () => {
  for (const id of ['char_451_robin', 'char_4191_tippi', 'char_4165_ctrail', 'char_394_hadiya']) {
    const result = evaluate(id)
    assert.deepEqual(result.evaluation.blockers, [])
    assert.equal(result.actions.length, 1)
    assert.equal(result.actions[0].scale, 1)
    assert.equal(result.maxTargets, 1)
  }
  const trait = buildTraitStructures([operator('char_4191_tippi')])[0]
  const block = trait.effects.find(effect => effect.item === 'BLOCK_COUNT')!
  assert.equal(block.value, 2)
  assert.deepEqual(block.condition, { type: 'COMPARE', metric: 'source.isAirborne', comparison: 'EQ', value: true,
    sourceBinding: 'description:source.isAirborne' })
})

test('未確認の職業・治療跳躍・説明へ変化した特性を上書きで黙認しない', () => {
  const wrong = operator('char_4191_tippi')
  wrong.profession = 'WARRIOR'
  assert.deepEqual(buildTraitStructures([wrong]), [])
  for (const key of ['attack@chain.max_target', 'attack@chain.atk_scale']) {
    const changed = operator('char_4179_monstr')
    changed.operatorProfile.trait!.candidates![0].blackboard!.find(entry => entry.key === key)!.value! += 1
    assert.equal(buildTraitStructures([changed])[0].status, 'UNREVIEWED')
  }
  const changed = operator('char_451_robin')
  changed.operatorProfile.traitDescription += ' 攻撃力+100%'
  assert.equal(buildTraitStructures([changed])[0].status, 'UNREVIEWED')
})
