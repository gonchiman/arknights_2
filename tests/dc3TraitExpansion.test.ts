import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTraitStructures, formatTraitStructureEffectValue, getTraitStructureEffectValueRows } from '../src/lib/traitStructure.ts'
import { evaluateGuardTraits } from '../src/lib/guardTraitEvaluation.ts'
import { resolveGuardValue } from '../src/lib/guardCombatValues.ts'
import type { GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/dc3TraitExpansionSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
const operator = (id: string) => {
  const source = sources.find(source => source.operatorId === id)!
  return { operatorId: id, operatorName: source.operatorName, profession: source.profession, professionLabel: source.profession,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, operatorProfile: structuredClone(source.profile) }
}
function evaluate(id: string, extra: Partial<GuardStage> = {}, sourceIsBlocking = false) {
  const source = sources.find(source => source.operatorId === id)!, row = operator(id)
  return evaluateGuardTraits(row, { id: 'active', label: 'test', kind: 'NORMAL',
    actions: [{ label: 'main', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }], ...extra },
  { actualAttackTargetCount: 3, sourceIsBlocking }, new Map(), { phaseIndex: source.phaseIndex, operatorLevel: source.profile.phases[source.phaseIndex].maxLevel! })
}
test('保持した原文と数値に一致する10職分の特性を構造化し、表示値も解決する', () => {
  for (const source of sources) {
    const structure = buildTraitStructures([operator(source.operatorId)])[0]
    assert.ok(structure, source.operatorId)
    assert.notEqual(structure.status, 'UNREVIEWED', source.operatorId)
    assert.deepEqual(structure.issues, [], source.operatorId)
    for (const effect of structure.effects) {
      assert.ok(formatTraitStructureEffectValue(effect))
      assert.ok(getTraitStructureEffectValueRows(effect).length > 1)
    }
    assert.deepEqual(evaluate(source.operatorId).evaluation.blockers, [], source.operatorId)
  }
})
test('堅城砲手は未ブロックの範囲攻撃とブロック中の単体攻撃を切り替える', () => {
  assert.equal(evaluate('char_4039_horn', {}, false).maxTargets, null)
  assert.equal(evaluate('char_4039_horn', {}, true).maxTargets, 1)
  assert.equal(evaluate('char_4039_horn', { attackTreatment: 'RANGED' }, true).maxTargets, null)
  assert.equal(evaluate('char_4039_horn', { attackTreatment: 'MELEE' }, false).maxTargets, 1)
  for (const id of ['char_202_demkni', 'char_1045_svash2']) {
    assert.deepEqual(evaluate(id).evaluation.blockers, [])
    assert.equal(evaluate(id).evaluation.attackScale, 1)
  }
})
test('狩人は装填済み通常攻撃と強化通常攻撃へ120%を適用し、独立した発動動作には掛けない', () => {
  for (const kind of ['NORMAL', 'NEXT_ATTACK', 'SKILL_ACTION'] as const) {
    const result = evaluate('char_4104_coldst', { kind })
    assert.deepEqual(result.evaluation.blockers, [])
    assert.equal(resolveGuardValue(result.actions[0].scale, new Map(), {}), kind === 'SKILL_ACTION' ? 1 : 1.2)
  }
})
test('投擲手の主攻撃と50%余震を分離し、倍率上書きや独立動作へ二重付与しない', () => {
  const result = evaluate('char_391_rosmon')
  assert.equal(result.maxTargets, null)
  assert.deepEqual(result.actions.map(action => resolveGuardValue(action.scale, new Map(), {})), [1, 0.5])
  assert.ok(result.actions.every(action => action.role === 'MAIN' && action.damageType === 'PHYSICAL'))
  assert.equal(evaluate('char_391_rosmon', { traitOverrides: ['AFTERSHOCK'] }).actions.length, 1)
  assert.equal(evaluate('char_391_rosmon', { kind: 'SKILL_ACTION' }).actions.length, 1)
  assert.equal(evaluate('char_391_rosmon', { actions: [
    { label: 'dot', role: 'ADDITIONAL', damageType: 'ARTS', basis: 'ATK_STAT', timing: 'PER_SECOND', scale: 0.2 },
  ] }).actions.length, 1)
})
test('飛巡のスキル中は範囲攻撃、工匠・行商人・本体の傀儡師は攻撃倍率を増やさない', () => {
  assert.equal(evaluate('char_4213_skybx').maxTargets, null)
  for (const id of ['char_484_robrta', 'char_322_lmlee', 'char_369_bena', 'char_4016_kazema']) {
    const result = evaluate(id)
    assert.equal(result.actions.length, 1)
    assert.equal(resolveGuardValue(result.actions[0].scale, new Map(), {}), 1)
  }
  const merchant = buildTraitStructures([operator('char_322_lmlee')])[0]
  assert.equal(formatTraitStructureEffectValue(merchant.effects.find(effect => effect.item === 'RETREAT_COST_REFUND')!), '返却なし')
})
test('余震回数・身替り範囲・説明に未確認の差分がある場合は特性を代用しない', () => {
  const bombarder = operator('char_391_rosmon')
  bombarder.operatorProfile.trait!.candidates![0].blackboard!.find(entry => entry.key === 'attack@times')!.value = 3
  const changed = buildTraitStructures([bombarder])[0]
  assert.ok(changed.issues.length)
  const doll = operator('char_4016_kazema')
  doll.operatorProfile.trait!.candidates![0].rangeId = 'unreviewed'
  assert.equal(buildTraitStructures([doll])[0].status, 'UNREVIEWED')
  const loop = operator('char_4100_caper')
  loop.operatorProfile.traitDescription += ' 攻撃力+100%'
  assert.equal(buildTraitStructures([loop])[0].status, 'UNREVIEWED')
})
