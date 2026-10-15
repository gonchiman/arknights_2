import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SKILL_STRUCTURES,
  SKILL_STRUCTURE_RANGES,
  findSkillStructure,
  isSkillStructureRecord,
  getSkillStructureLevelIndices,
  formatSkillStructurePredicate,
  formatSkillStructureDuration,
  formatSkillStructureEndCondition,
  formatSkillStructureEffectItem,
  formatSkillStructureEffectOperation,
  formatSkillStructureEffectValue,
  formatSkillStructureSpRecovery,
  type SkillStructure,
  type SkillStructureEffect,
} from '../src/lib/skillStructure.ts'
import { SKILL_COARSE_CATEGORY_LABELS } from '../src/lib/skillCoarseClassification.ts'

function skill(operatorId: string): SkillStructure {
  const record = SKILL_STRUCTURES.find((entry) => entry.basicInfo.operatorId === operatorId)
  assert.ok(record, operatorId)
  return record
}

function effect(record: SkillStructure, stageId: string, effectId: string): SkillStructureEffect {
  const result = record.effectStructure.stages.find((stage) => stage.id === stageId)
    ?.effects.find((entry) => entry.id === effectId)
  assert.ok(result, `${record.basicInfo.skillId}/${stageId}/${effectId}`)
  return result
}

test('公開する構造は合意した4スキル・特化3のみで、5段階19効果を持つ', () => {
  assert.deepEqual(SKILL_STRUCTURES.map(({ basicInfo: info }) => [info.operatorId, info.skillIndex]), [
    ['char_263_skadi', 1],
    ['char_350_surtr', 2],
    ['char_172_svrash', 3],
    ['char_293_thorns', 3],
  ])
  assert.equal(new Set(SKILL_STRUCTURES.map(({ basicInfo }) => basicInfo.skillId)).size, 4)
  assert.ok(SKILL_STRUCTURES.every(({ basicInfo }) => basicInfo.levelIndex === 9 && basicInfo.skillLevel === '特化3'))
  assert.equal(SKILL_STRUCTURES.flatMap((entry) => entry.effectStructure.stages).length, 5)
  assert.equal(SKILL_STRUCTURES.flatMap((entry) => entry.effectStructure.stages.flatMap((stage) => stage.effects)).length, 19)
})

test('オペレーター・スキルID・スキル番号・レベルがすべて一致した構造だけ返す', () => {
  const surtr = skill('char_350_surtr')
  assert.equal(findSkillStructure(surtr.basicInfo), surtr)
  assert.equal(findSkillStructure({ ...surtr.basicInfo, levelIndex: 8 }), null)
  assert.equal(findSkillStructure({ ...surtr.basicInfo, operatorId: 'char_263_skadi' }), null)
  assert.equal(findSkillStructure({ ...surtr.basicInfo, skillId: 'skchr_surtr_3' }), null)
  assert.equal(findSkillStructure({ ...surtr.basicInfo, skillIndex: 3 }), null)
  assert.equal(findSkillStructure({ ...surtr.basicInfo, levelIndex: Number.NaN }), null)
  assert.equal(isSkillStructureRecord(surtr.basicInfo), true)
  assert.equal(isSkillStructureRecord({ ...surtr.basicInfo, skillIndex: 3 }), false)
  assert.deepEqual(getSkillStructureLevelIndices(surtr.basicInfo), [9])
  assert.deepEqual(getSkillStructureLevelIndices({ ...surtr.basicInfo, skillIndex: 3 }), [])
})

test('大分類は複数所属できる配列で保持し、表示名は既存定義から参照する', () => {
  for (const structure of SKILL_STRUCTURES) {
    assert.deepEqual(structure.classificationInfo.coarseCategories, ['SUSTAINED'])
    assert.equal('coarseLabels' in structure.classificationInfo, false)
    assert.equal(SKILL_COARSE_CATEGORY_LABELS[structure.classificationInfo.coarseCategories[0]], '持続強化・攻撃変化')
  }
  const multiCategory: SkillStructure['classificationInfo'] = { coarseCategories: ['SUSTAINED', 'MODE'] }
  assert.deepEqual(multiCategory.coarseCategories.map((category) => SKILL_COARSE_CATEGORY_LABELS[category]), [
    '持続強化・攻撃変化', 'モード切替',
  ])
})

test('発動設定は効果の持続時間から独立し、SP回復方法と初期SP・必要SPを保持する', () => {
  assert.deepEqual(SKILL_STRUCTURES.map(({ activationSettings: settings }) => [
    settings.spRecovery, settings.initialSp, settings.spCost, settings.maxCharges,
    settings.activationMethod, settings.activationTrigger,
  ]), [
    ['INCREASE_WITH_TIME', 15, 35, 1, 'MANUAL', 'MANUAL_INPUT'],
    ['INCREASE_WITH_TIME', 12, 18, 1, 'MANUAL', 'MANUAL_INPUT'],
    ['INCREASE_WITH_TIME', 75, 90, 1, 'MANUAL', 'MANUAL_INPUT'],
    ['INCREASE_WHEN_ATTACK', 0, 15, 1, 'MANUAL', 'MANUAL_INPUT'],
  ])
  assert.equal(formatSkillStructureSpRecovery('INCREASE_WHEN_ATTACK'), '攻撃回復')
  assert.equal(formatSkillStructureSpRecovery('INCREASE_WITH_TIME'), '自然回復')
})

test('スルトS2は攻撃力120%加算と単体時1.6倍を別の効果として保持する', () => {
  const surtr = skill('char_350_surtr')
  const atk = effect(surtr, 'active', 'atk')
  const conditional = effect(surtr, 'active', 'single_target')
  assert.equal(atk.item, 'ATK_BUFF_RATIO')
  assert.equal(atk.operation, 'ADD_RATIO')
  assert.equal(atk.value, 1.2)
  assert.equal(atk.condition, null)
  assert.equal(conditional.item, 'ATTACK_SCALE')
  assert.equal(conditional.operation, 'MULTIPLY')
  assert.equal(conditional.value, 1.6)
  assert.equal(conditional.timing, 'ON_ATTACK')
  assert.deepEqual(conditional.condition, { metric: 'actualAttackTargetCount', comparison: 'EQ', value: 1 })
  assert.equal(effect(surtr, 'active', 'targets').value, 2)
  assert.equal(effect(surtr, 'active', 'range').operation, 'EXTEND_FORWARD')
  assert.equal(effect(surtr, 'active', 'range').value, 1)
  assert.deepEqual(surtr.effectStructure.stages[0].duration, { type: 'FIXED_SECONDS', seconds: 18 })
  assert.equal(formatSkillStructureEffectValue(atk), '＋120％')
  assert.equal(formatSkillStructureEffectValue(conditional), '×1.6')
  assert.equal(formatSkillStructurePredicate(conditional.condition), '攻撃対象数＝1')
})

test('ソーンズS3は初回30秒と2回目以降退場までの段階を分け、独立した加算値を持つ', () => {
  const thorns = skill('char_293_thorns')
  const [first, later] = thorns.effectStructure.stages
  assert.deepEqual(first.applicability, { metric: 'skillActivationCount', comparison: 'EQ', value: 1 })
  assert.deepEqual(later.applicability, { metric: 'skillActivationCount', comparison: 'GTE', value: 2 })
  assert.deepEqual(first.duration, { type: 'FIXED_SECONDS', seconds: 30 })
  assert.deepEqual(first.endCondition, { type: 'SECONDS_ELAPSED', seconds: 30 })
  assert.deepEqual(later.duration, { type: 'UNTIL_EXIT' })
  assert.deepEqual(later.endCondition, { type: 'OPERATOR_EXIT' })
  assert.equal(effect(thorns, 'first', 'atk').value, 0.6)
  assert.equal(effect(thorns, 'second_and_later', 'atk').value, 1.2)
  assert.equal(effect(thorns, 'first', 'aspd').value, 25)
  assert.equal(effect(thorns, 'second_and_later', 'aspd').value, 50)
  for (const stage of [first, later]) {
    const ranged = effect(thorns, stage.id, 'ranged_penalty')
    assert.equal(ranged.item, 'TRAIT_RANGED_ATK_PENALTY')
    assert.equal(ranged.value, false)
    assert.deepEqual(ranged.condition, { metric: 'attackDistanceType', comparison: 'EQ', value: 'RANGED' })
    assert.deepEqual(effect(thorns, stage.id, 'range').value, { rangeId: '3-3' })
  }
  assert.deepEqual(thorns.effectStructure.inputRequirements, ['skillActivationCount'])
  assert.deepEqual(thorns.effectStructure.relations, [{
    type: 'BONUS_VALUE_RELATION', firstStage: 'first', laterStage: 'second_and_later',
    items: ['ATK_BUFF_RATIO', 'ATTACK_SPEED'], multiplier: 2,
  }])
  assert.equal(formatSkillStructurePredicate(later.applicability), '発動回数≧2')
  assert.equal(formatSkillStructureDuration(later.duration), '時間制限なし')
  assert.equal(formatSkillStructureEndCondition(later.endCondition), '本人の退場')
})

test('真銀斬は防御力減少・攻撃範囲・同時対象数・近接扱いを別々に保持する', () => {
  const silverash = skill('char_172_svrash')
  assert.equal(effect(silverash, 'active', 'def').value, -0.7)
  assert.equal(effect(silverash, 'active', 'atk').value, 2)
  assert.equal(effect(silverash, 'active', 'targets').value, 6)
  assert.equal(effect(silverash, 'active', 'attack_mode').value, 'MELEE')
  assert.deepEqual(effect(silverash, 'active', 'range').value, { rangeId: '3-7' })
  assert.equal(formatSkillStructureEffectValue(effect(silverash, 'active', 'def')), '－70％')
  assert.equal(formatSkillStructureEffectValue(effect(silverash, 'active', 'attack_mode')), '近接攻撃')
  assert.equal(formatSkillStructureEffectOperation(effect(silverash, 'active', 'targets')), '上限設定')
  assert.equal(formatSkillStructureEffectValue(effect(silverash, 'active', 'range')), '範囲3-7')
})

test('参照範囲は形を失わず12セル・16セルを保持し、全ての置換効果が存在する範囲を参照する', () => {
  assert.equal(SKILL_STRUCTURE_RANGES['3-3'].grids.length, 12)
  assert.equal(SKILL_STRUCTURE_RANGES['3-7'].grids.length, 16)
  for (const range of Object.values(SKILL_STRUCTURE_RANGES)) {
    assert.equal(new Set(range.grids.map(({ row, col }) => `${row}:${col}`)).size, range.grids.length)
  }
  for (const entry of SKILL_STRUCTURES.flatMap((record) => record.effectStructure.stages.flatMap((stage) => stage.effects))) {
    if (entry.unit === 'RANGE_DEFINITION') assert.ok(SKILL_STRUCTURE_RANGES[entry.value.rangeId])
  }
})

test('原文とblackboardの根拠を保持し、表示配列は構造化データへ混入させない', () => {
  for (const structure of SKILL_STRUCTURES) {
    assert.ok(structure.source.description)
    assert.ok(structure.source.rawDescription)
    assert.ok(structure.source.blackboard.length > 0)
    for (const stage of structure.effectStructure.stages) {
      assert.equal('display' in stage, false)
      for (const entry of stage.effects) {
        assert.equal('display' in entry, false)
        assert.ok(formatSkillStructureEffectItem(entry.item))
        assert.ok(formatSkillStructureEffectOperation(entry))
        assert.ok(formatSkillStructureEffectValue(entry))
        if (typeof entry.value === 'number') {
          const binding = structure.source.blackboard.find(({ key }) => key === entry.sourceBinding)
          assert.ok(binding, entry.sourceBinding)
          assert.equal(binding.value, entry.value)
        }
      }
    }
  }
})
