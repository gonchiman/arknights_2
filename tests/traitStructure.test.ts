import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SkillRecord } from '../src/types/skill.ts'
import { SKILL_STRUCTURES } from '../src/lib/skillStructure.ts'
import { evaluateCombatCondition, resolveCombatNumericValue } from '../src/lib/combatEffectStructure.ts'
import {
  buildTraitStructures, findTraitStructure, isTraitStructureOperator, TRAIT_STRUCTURE_JOB_IDS,
  formatTraitStructureCondition, formatTraitStructureEffectValue, getTraitStructureEffectDefinitionRows,
  type TraitStructure, type TraitStructureEffect,
} from '../src/lib/traitStructure.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/traitStructureGuardJobs.json', import.meta.url), 'utf8'))
const rows = fixture.rows as SkillRecord[]
const structures = buildTraitStructures(rows)
function find(id: string, list = structures): TraitStructure {
  const result = findTraitStructure({ operatorId: id }, list)
  assert.ok(result, id)
  return result
}
function effect(id: string, item: TraitStructureEffect['item']): TraitStructureEffect {
  const result = find(id).effects.find(entry => entry.item === item)
  assert.ok(result, `${id}/${item}`)
  return result
}
function changed(id: string, mutate: (row: SkillRecord) => void): TraitStructure {
  const row = structuredClone(rows.find(row => row.operatorId === id)!)
  mutate(row)
  return find(id, buildTraitStructures([row]))
}

test('既存DC3前衛30人の12職分を網羅し、JOBを基準に重複なく構造化する', () => {
  const fixtureIds = new Set(rows.map(row => row.operatorId))
  const ids = new Set(SKILL_STRUCTURES.filter(skill => fixtureIds.has(skill.basicInfo.operatorId)).map(skill => skill.basicInfo.operatorId))
  assert.equal(ids.size, 30)
  assert.ok(['fighter', 'lord', 'crusher', 'hammer', 'sword', 'centurion', 'artsfghter', 'musha', 'instructor', 'fearless', 'reaper', 'librator']
    .every(job => (TRAIT_STRUCTURE_JOB_IDS as readonly string[]).includes(job)))
  assert.equal(new Set([...ids].map(id => find(id).basicInfo.subProfessionId)).size, 12)
  for (const id of ids) {
    const structure = find(id)
    assert.notEqual(structure.status, 'UNREVIEWED', id)
    assert.equal(structure.issues.length, 0, id)
    assert.equal(structure.classificationInfo.definitionScope, 'JOB')
    assert.equal(structure.basicInfo.potentialRank, 1)
    assert.equal(structure.basicInfo.module, 'NONE')
    assert.ok(structure.effects.length > 0)
  }
  assert.equal(buildTraitStructures([...rows, ...rows]).length, structures.length)
  const copy = { ...rows[0], operatorId: 'new-operator-in-same-job', operatorName: '職分共通の確認' }
  assert.ok(find(copy.operatorId, buildTraitStructures([copy])).effects.length)
  assert.equal(isTraitStructureOperator({ profession: 'CASTER', subProfessionId: 'fighter' }), false)
  assert.equal(isTraitStructureOperator({ profession: 'WARRIOR', subProfessionId: 'unknown-job' }), false)
  assert.equal(findTraitStructure({ operatorId: 'missing' }, structures), null)
})

test('基本ブロック数は設定値への参照で、加算ボーナスにしない', () => {
  for (const id of ['char_264_f12yin', 'char_263_skadi']) {
    const entry = effect(id, 'BLOCK_COUNT')
    assert.equal(entry.value, 1)
    assert.equal(entry.operation, 'SET')
    assert.equal(entry.application, 'BASE_ATTRIBUTE')
    assert.equal(entry.calculationRelevance, 'NOT_RELEVANT')
    assert.match(entry.parameterBindings?.baseAttribute ?? '', /blockCnt/)
  }
  const conflict = changed('char_263_skadi', row => {
    row.operatorProfile.phases[2].attributesKeyFrames![0].data!.blockCnt = 2
  })
  assert.equal(conflict.status, 'PARTIAL')
  assert.equal(conflict.effects[0].resolution, 'PARTIAL')
  assert.ok(conflict.issues.length)
})

test('術戦士の術攻撃と剣豪の2ヒットは通常攻撃規則として保持する', () => {
  const arts = effect('char_350_surtr', 'DAMAGE_TYPE')
  assert.equal(arts.value, 'ARTS')
  assert.deepEqual(arts.timing, { type: 'EVENT', event: 'NORMAL_ATTACK' })
  const hits = effect('char_4009_irene', 'HIT_COUNT')
  assert.equal(hits.value, 2)
  assert.equal(hits.operation, 'SET')
  assert.equal(hits.application, 'ATTACK_RULE')
  assert.equal(hits.calculationRelevance, 'RELEVANT')
})

test('領主と教官は最終ダメージ倍率ではなく、条件付き攻撃力倍率を保持する', () => {
  const lord = effect('char_172_svrash', 'ATTACK_SCALE')
  assert.equal(lord.value, 0.8)
  assert.equal(lord.sourceBinding, 'atk_scale')
  assert.equal(evaluateCombatCondition(lord.condition, { 'attack.distanceType': 'RANGED' }), true)
  assert.equal(evaluateCombatCondition(lord.condition, { 'attack.distanceType': 'MELEE' }), false)
  assert.equal(evaluateCombatCondition(lord.condition, {}), null)
  const instructor = effect('char_485_pallas', 'ATTACK_SCALE')
  assert.equal(instructor.value, 1.2)
  assert.equal(evaluateCombatCondition(instructor.condition, { 'target.blockedBySource': false, 'target.isBlocked': true }), true)
  assert.equal(evaluateCombatCondition(instructor.condition, { 'target.isBlocked': false }), null)
  assert.equal(formatTraitStructureCondition(instructor.condition), '自身が対象をブロック＝いいえ')
  const range = effect('char_485_pallas', 'ATTACK_RANGE')
  assert.equal(range.application, 'BASE_ATTRIBUTE')
  assert.equal(formatTraitStructureEffectValue(range), '基本範囲を参照')
})

test('強襲者・重剣士の対象上限は現在のブロック数を参照する', () => {
  for (const id of ['char_017_huang', 'char_4088_hodrer']) {
    const cap = effect(id, 'MAX_TARGETS')
    assert.equal(cap.item, 'MAX_TARGETS')
    if (cap.item !== 'MAX_TARGETS') return
    assert.equal(resolveCombatNumericValue(cap.value, { 'source.blockCount': 3 }), 3)
    assert.equal(resolveCombatNumericValue(cap.value, { 'source.blockCount': 0 }), 0)
    assert.equal(resolveCombatNumericValue(cap.value, {}), null)
    assert.equal(cap.parameterBindings?.['value.metric'], 'source.blockCount')
  }
})

test('槌撃士は周囲への物理攻撃力倍率・半径・主対象除外を独立に保持する', () => {
  const splash = effect('char_4058_pepe', 'SPLASH_DAMAGE')
  if (splash.item !== 'SPLASH_DAMAGE') return
  assert.deepEqual(splash.value, { damageType: 'PHYSICAL', attackScale: 0.5, radiusTiles: 1, center: 'ATTACK_TARGET', includeMainTarget: false })
  assert.equal(formatTraitStructureEffectValue(splash), '攻撃力×0.5')
  assert.ok(getTraitStructureEffectDefinitionRows(splash).some(([key, value]) => key === '半径（マス）' && value === 1))
  const dynamic = changed('char_4058_pepe', row => {
    row.operatorProfile.trait!.candidates![0].blackboard!.find(entry => entry.key === 'attack@atk_scale_2')!.value = 0.6
  })
  const updated = dynamic.effects.find(entry => entry.item === 'SPLASH_DAMAGE')!
  assert.equal(updated.item === 'SPLASH_DAMAGE' && updated.value.attackScale, 0.6)
  assert.match(dynamic.source.description, /60%/)
})

test('武者は昇進ごとの候補を選択し、回復をダメージ計算対応と混同しない', () => {
  const row = rows.find(row => row.operatorId === 'char_188_helage')!
  for (const [phaseIndex, expected] of [[0, 30], [1, 50], [2, 70]]) {
    const value = find(row.operatorId, buildTraitStructures([row], { phaseIndex, operatorLevel: 1 }))
    const healing = value.effects.find(entry => entry.item === 'HP')!
    assert.equal(healing.value, expected)
    assert.equal(healing.relevance, 'SURVIVAL')
    assert.equal(healing.calculationRelevance, 'NOT_RELEVANT')
    assert.equal(healing.resolution, 'PARTIAL')
    assert.equal(healing.item === 'HP' && healing.applications.basis, 'UNSPECIFIED')
    assert.equal(value.status, 'PARTIAL')
  }
  assert.deepEqual(buildTraitStructures([row], { phaseIndex: 2, operatorLevel: 91 }), [])
  assert.deepEqual(buildTraitStructures([row], { phaseIndex: 99 }), [])
})

test('鎌撃士は回復回数上限と範囲攻撃を分離し、攻撃の上限・範囲を推定しない', () => {
  const healing = effect('char_1032_excu2', 'HP')
  if (healing.item !== 'HP') return
  assert.equal(healing.value, 50)
  assert.equal(healing.applications.basis, 'ENEMIES_HIT')
  assert.equal(resolveCombatNumericValue(healing.applications.perAttackLimit, { 'source.blockCount': 4 }), 4)
  const targeting = effect('char_1032_excu2', 'ATTACK_TARGETING')
  assert.deepEqual(targeting.value, { mode: 'AREA', maxTargets: null, rangeId: null })
  assert.equal(targeting.resolution, 'PARTIAL')
  assert.equal(targeting.calculationRelevance, 'RELEVANT')
  assert.equal(find('char_1032_excu2').effects.some(entry => entry.item === 'MAX_TARGETS'), false)
})

test('解放者は待機条件・蓄積上限・到達時間・特性分リセットを分離する', () => {
  const lib = find('char_4064_mlynar')
  const charge = lib.effects.find(entry => entry.operation === 'INCREASE_TO_CAP')!
  if (charge.operation !== 'INCREASE_TO_CAP') return
  assert.deepEqual(charge.value.maxRatio, 2)
  assert.equal(charge.value.secondsToCap, 40)
  assert.equal(charge.value.curve, 'UNSPECIFIED')
  assert.equal(charge.condition, null, 'スキル開始で既存の蓄積分を消さない')
  assert.equal(evaluateCombatCondition(charge.value.accumulateWhile, { 'source.skillActive': false }), true)
  assert.equal(evaluateCombatCondition(charge.value.accumulateWhile, { 'source.skillActive': true }), false)
  assert.equal(charge.calculationRelevance, 'RELEVANT')
  assert.equal(charge.resolution, 'PARTIAL')
  assert.equal(formatTraitStructureEffectValue(charge), '最大+200％')
  const reset = lib.effects.find(entry => entry.operation === 'RESET_SOURCE_VALUE')!
  assert.equal(reset.operation === 'RESET_SOURCE_VALUE' && reset.resetEffectId, charge.id)
  assert.deepEqual(reset.timing, { type: 'EVENT', event: 'SKILL_END' })
  const block = lib.effects.find(entry => entry.item === 'BLOCK_COUNT')!
  assert.equal(block.application, 'DYNAMIC_RULE')
  assert.equal(block.value, 0)
  assert.equal(lib.basicInfo.phaseIndex, 2)
})

test('未知の特性・追加文・未知キーは元データを残して未確認にする', () => {
  const castle = find('char_286_cast3')
  assert.equal(castle.status, 'UNREVIEWED')
  assert.deepEqual(castle.effects, [])
  assert.match(castle.source.rawDescription, /配置可能数/)
  const appended = changed('char_350_surtr', row => { row.operatorProfile.traitDescription += '、追加で物理ダメージを与える' })
  assert.equal(appended.status, 'UNREVIEWED')
  assert.deepEqual(appended.effects, [])
  const unknown = changed('char_172_svrash', row => { row.operatorProfile.trait!.candidates![0].blackboard!.push({ key: 'future_effect', value: 2 }) })
  assert.equal(unknown.status, 'UNREVIEWED')
  assert.deepEqual(unknown.effects, [])
  assert.ok(unknown.source.blackboard.some(entry => entry.key === 'future_effect'))
  const badUnlock = changed('char_172_svrash', row => { row.operatorProfile.trait!.candidates![0].unlockCondition!.phase = 'UNKNOWN' })
  assert.equal(badUnlock.status, 'UNREVIEWED')
  const rangeOverride = changed('char_485_pallas', row => { row.operatorProfile.trait!.candidates![0].rangeId = 'new-trait-range' })
  assert.equal(rangeOverride.status, 'UNREVIEWED')
  assert.deepEqual(rangeOverride.effects, [])
  assert.equal(rangeOverride.source.rangeId, 'new-trait-range')
  const namedClause = changed('char_350_surtr', row => { row.operatorProfile.traitDescription += '<追加効果>' })
  assert.equal(namedClause.status, 'UNREVIEWED')
})

test('不足・重複・非有限・静的説明文と不一致の値は既定値や0へ置き換えない', () => {
  for (const value of [undefined, Number.NaN, Infinity, -1, 0.9]) {
    const invalid = changed('char_172_svrash', row => { row.operatorProfile.trait!.candidates![0].blackboard![0].value = value })
    const scale = invalid.effects.find(entry => entry.item === 'ATTACK_SCALE')!
    assert.equal(scale.value, null)
    assert.equal(scale.resolution, 'PARTIAL')
    assert.equal(invalid.status, 'PARTIAL')
    assert.ok(invalid.issues.length)
  }
  const duplicate = changed('char_188_helage', row => { row.operatorProfile.trait!.candidates![2].blackboard!.push({ key: 'value', value: 70 }) })
  assert.equal(duplicate.effects.find(entry => entry.item === 'HP')!.value, null)
  const absent = changed('char_4058_pepe', row => { row.operatorProfile.trait!.candidates![0].blackboard = [] })
  assert.equal(absent.status, 'PARTIAL')
  assert.match(absent.source.description, /未確認/)
  assert.doesNotMatch(absent.source.description, /\{attack@/)
  for (const [id, key, value, item] of [
    ['char_4058_pepe', 'attack@atk_scale_2', 0.9, 'SPLASH_DAMAGE'],
    ['char_1032_excu2', 'value', 100, 'HP'],
  ] as const) {
    const conflict = changed(id, row => {
      const candidate = row.operatorProfile.trait!.candidates![0]
      candidate.overrideDescripton = null
      candidate.blackboard!.find(entry => entry.key === key)!.value = value
    })
    const entry = conflict.effects.find(entry => entry.item === item)!
    assert.equal(entry.item === 'SPLASH_DAMAGE' ? entry.value.attackScale : entry.value, null)
    assert.ok(conflict.issues.length)
    assert.equal(entry.resolution, 'PARTIAL')
  }
})

test('元の説明文を保存し、入力・既存スキル構造を変更しない', () => {
  const before = JSON.stringify(rows), skillsBefore = JSON.stringify(SKILL_STRUCTURES)
  buildTraitStructures(rows)
  assert.equal(JSON.stringify(rows), before)
  assert.equal(JSON.stringify(SKILL_STRUCTURES), skillsBefore)
  const musha = rows.find(row => row.operatorId === 'char_188_helage')!
  assert.equal(find(musha.operatorId).source.rawDescription, musha.operatorProfile.trait!.candidates![2].overrideDescripton)
  for (const value of structures.flatMap(structure => structure.effects)) {
    assert.equal('calculatorSupported' in value, false)
    assert.ok(getTraitStructureEffectDefinitionRows(value).length > 10)
  }
})
