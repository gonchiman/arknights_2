import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SKILL_STRUCTURES, SKILL_STRUCTURE_RANGES, findSkillStructure, isSkillStructureRecord,
  getSkillStructureLevelIndices, formatSkillStructurePredicate, formatSkillStructureDuration,
  formatSkillStructureEndCondition, formatSkillStructureEffectItem,
  formatSkillStructureEffectOperation, formatSkillStructureEffectValue,
  formatSkillStructureEffectTiming, formatSkillStructureActivationTrigger,
  formatSkillStructureSpRecovery, getSkillStructureEffectValueRows,
  type SkillStructure, type SkillStructureEffect,
} from '../src/lib/skillStructure.ts'
import { SKILL_COARSE_CATEGORY_LABELS } from '../src/lib/skillCoarseClassification.ts'
import { SKILL_STRUCTURE_DEFERRED_CASES, getSkillStructureDeferredCases } from '../src/lib/skillStructureDeferredCases.ts'
import { parseHashRoute } from '../src/lib/routes.ts'

interface SourceSkill {
  skillIndex: number; skillId: string; levelIndex: number; name: string
  description: string; rangeId: string | null; duration: number; skillType: string
  spData: { spType: string | number; initSp: number; spCost: number; maxChargeTime: number }
  blackboard: { key: string; value: number; valueStr: string | null }[]
  range: { id: string; direction: number; grids: { row: number; col: number }[] } | null
}
interface SourceOperator { operatorId: string; operatorName: string; skills: SourceSkill[] }

// Offline JP skill_table/range_table excerpt, independent of the structured records.
const source: SourceOperator[] = JSON.parse(readFileSync(
  new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8',
))
const sourceSkills = source.flatMap(operator => operator.skills.map(entry => ({
  ...entry, operatorId: operator.operatorId, operatorName: operator.operatorName,
})))
const identity = (entry: { operatorId: string; skillId: string; skillIndex: number; levelIndex: number }) =>
  `${entry.operatorId}:${entry.skillId}:${entry.skillIndex}:${entry.levelIndex}`

function skill(operatorId: string, skillIndex: number): SkillStructure {
  const record = SKILL_STRUCTURES.find(entry => entry.basicInfo.operatorId === operatorId
    && entry.basicInfo.skillIndex === skillIndex)
  assert.ok(record, `${operatorId}/S${skillIndex}`)
  return record
}
function effect(record: SkillStructure, stageId: string, item: SkillStructureEffect['item']): SkillStructureEffect {
  const result = record.effectStructure.stages.find(stage => stage.id === stageId)
    ?.effects.find(entry => entry.item === item)
  assert.ok(result, `${record.basicInfo.skillId}/${stageId}/${item}`)
  return result
}
function onlyStage(record: SkillStructure) {
  assert.equal(record.effectStructure.stages.length, 1)
  return record.effectStructure.stages[0]
}

function sourceDescription(record: SourceSkill): string {
  const values = new Map(record.blackboard.map(entry => [entry.key.toLowerCase(), entry.value]))
  return record.description.replace(/\{(-?[^}:]+)(?::([^}]+))?\}/g, (_token, reference: string, format?: string) => {
    const negate = reference.startsWith('-')
    const value = values.get((negate ? reference.slice(1) : reference).toLowerCase())
    assert.notEqual(value, undefined, `${record.skillId}/${reference}`)
    const numeric = (negate ? -1 : 1) * value!
    if (!format) return String(numeric)
    const precision = format.match(/\.(0+)/)?.[1].length ?? 0
    return `${(format.endsWith('%') ? numeric * 100 : numeric).toFixed(precision)}${format.endsWith('%') ? '%' : ''}`
  }).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\\n/g, '\n').trim()
}

test('4人の全12スキル・特化3を一意に公開し、14段階40効果を持つ', () => {
  assert.equal(SKILL_STRUCTURES.length, 12)
  assert.equal(new Set(SKILL_STRUCTURES.map(({ basicInfo }) => identity(basicInfo))).size, 12)
  assert.deepEqual(SKILL_STRUCTURES.map(({ basicInfo }) => identity(basicInfo)).sort(), sourceSkills.map(identity).sort())
  for (const operator of source) assert.deepEqual(SKILL_STRUCTURES
    .filter(({ basicInfo }) => basicInfo.operatorId === operator.operatorId)
    .map(({ basicInfo }) => basicInfo.skillIndex).sort(), [1, 2, 3])
  assert.ok(SKILL_STRUCTURES.every(({ basicInfo }) => basicInfo.levelIndex === 9 && basicInfo.skillLevel === '特化3'))
  assert.equal(SKILL_STRUCTURES.flatMap(entry => entry.effectStructure.stages).length, 14)
  assert.equal(SKILL_STRUCTURES.flatMap(entry => entry.effectStructure.stages.flatMap(stage => stage.effects)).length, 40)
})

test('12件の発動設定・原文・blackboard・範囲を元データとキーで照合する', () => {
  for (const expected of sourceSkills) {
    const actual = findSkillStructure(expected)
    assert.ok(actual, identity(expected))
    assert.equal(actual.basicInfo.operatorName, expected.operatorName)
    assert.equal(actual.basicInfo.skillName, expected.name)
    assert.equal(actual.source.rawDescription, expected.description)
    assert.deepEqual(actual.source.blackboard, expected.blackboard)
    assert.equal(actual.source.rangeId, expected.rangeId)
    assert.equal(actual.source.duration, expected.duration)
    assert.equal(actual.source.description, sourceDescription(expected), `${expected.skillId} description`)
    assert.deepEqual(actual.activationSettings, {
      spRecovery: expected.spData.spType === 8 ? 'NO_SP' : expected.spData.spType,
      initialSp: expected.spData.initSp, spCost: expected.spData.spCost,
      maxCharges: expected.spData.maxChargeTime, activationMethod: expected.skillType,
      activationTrigger: expected.skillType === 'PASSIVE' ? 'ON_DEPLOY'
        : expected.skillType === 'AUTO' ? 'NEXT_NORMAL_ATTACK' : 'MANUAL_INPUT',
    }, `${expected.skillId} activation`)
    if (expected.range) assert.deepEqual(SKILL_STRUCTURE_RANGES[expected.range.id], expected.range)
  }
})

test('全12件でレベルを完全一致させ、他レベル・異なるIDの構造を代用しない', () => {
  for (const record of SKILL_STRUCTURES) {
    assert.equal(findSkillStructure(record.basicInfo), record)
    assert.equal(isSkillStructureRecord(record.basicInfo), true)
    assert.deepEqual(getSkillStructureLevelIndices(record.basicInfo), [9])
    for (const levelIndex of [0, 8, 10, -1, Number.NaN]) {
      assert.equal(findSkillStructure({ ...record.basicInfo, levelIndex }), null)
    }
    for (const selection of [
      { ...record.basicInfo, operatorId: 'char_unsupported' },
      { ...record.basicInfo, skillId: 'skchr_unsupported' },
      { ...record.basicInfo, skillIndex: 4 },
    ]) {
      assert.equal(findSkillStructure(selection), null)
      assert.equal(isSkillStructureRecord(selection), false)
      assert.deepEqual(getSkillStructureLevelIndices(selection), [])
    }
  }
})

test('分類は確認済み所属を持ち、表示名は既存定義を使う', () => {
  for (const record of SKILL_STRUCTURES) {
    assert.ok(record.classificationInfo.coarseCategories.length > 0)
    assert.equal('coarseLabels' in record.classificationInfo, false)
    assert.ok(record.classificationInfo.coarseCategories.every(category => SKILL_COARSE_CATEGORY_LABELS[category]))
  }
  assert.deepEqual(skill('char_263_skadi', 2).classificationInfo.coarseCategories, ['PASSIVE'])
  for (const id of ['char_350_surtr', 'char_172_svrash']) {
    assert.deepEqual(skill(id, 1).classificationInfo.coarseCategories, ['NEXT_ATTACK'])
  }
  assert.ok(skill('char_172_svrash', 2).classificationInfo.coarseCategories.includes('MODE'))
  for (const [operatorId, index] of [
    ['char_263_skadi', 1], ['char_263_skadi', 3], ['char_350_surtr', 2],
    ['char_350_surtr', 3], ['char_172_svrash', 3], ['char_293_thorns', 1],
    ['char_293_thorns', 2], ['char_293_thorns', 3],
  ] as const) assert.ok(skill(operatorId, index).classificationInfo.coarseCategories.includes('SUSTAINED'))
})

test('スカジS2はraw duration=-1でも配置後30秒で終了し、SPや永続効果へ誤変換しない', () => {
  const record = skill('char_263_skadi', 2), stage = onlyStage(record)
  assert.equal(record.source.duration, -1)
  assert.deepEqual(stage.duration, { type: 'FIXED_SECONDS', seconds: 30 })
  assert.deepEqual(stage.endCondition, { type: 'SECONDS_ELAPSED', seconds: 30 })
  assert.equal(record.activationSettings.spRecovery, 'NO_SP')
  assert.equal(record.activationSettings.activationTrigger, 'ON_DEPLOY')
  assert.equal(record.activationSettings.maxCharges, 0)
  assert.equal(effect(record, stage.id, 'ATK_BUFF_RATIO').value, 1.7)
  assert.equal(formatSkillStructureSpRecovery(record.activationSettings.spRecovery), 'SPなし')
})

test('スカジS3の攻撃力・防御力・最大HPの130%は独立した割合加算であり固定HPではない', () => {
  const record = skill('char_263_skadi', 3), stage = onlyStage(record)
  assert.deepEqual(stage.duration, { type: 'FIXED_SECONDS', seconds: 50 })
  assert.equal(stage.effects.length, 3)
  for (const item of ['ATK_BUFF_RATIO', 'DEF_BUFF_RATIO', 'MAX_HP_BUFF_RATIO'] as const) {
    const entry = effect(record, stage.id, item)
    assert.equal(entry.operation, 'ADD_RATIO')
    assert.equal(entry.unit, 'RATIO')
    assert.equal(entry.value, 1.3)
  }
})

test('次の通常攻撃は倍率と1攻撃の終了を持ち、撃破時SP回復はスルトS1だけに適用する', () => {
  for (const [operatorId, multiplier] of [['char_350_surtr', 3.1], ['char_172_svrash', 2.9]] as const) {
    const record = skill(operatorId, 1), stage = onlyStage(record)
    assert.equal(record.source.duration, 0)
    assert.deepEqual(stage.duration, { type: 'SINGLE_ATTACK' })
    assert.deepEqual(stage.endCondition, { type: 'ATTACK_RESOLVED' })
    assert.equal(record.activationSettings.activationTrigger, 'NEXT_NORMAL_ATTACK')
    const attack = effect(record, stage.id, 'ATTACK_SCALE')
    assert.equal(attack.operation, 'MULTIPLY')
    assert.equal(attack.value, multiplier)
    assert.equal(attack.condition, null)
    assert.equal(attack.timing, 'ON_NEXT_NORMAL_ATTACK')
    const recovery = stage.effects.find(entry => entry.item === 'SP')
    if (operatorId === 'char_350_surtr') {
      assert.ok(recovery)
      assert.equal(recovery.operation, 'FILL_RESOURCE')
      assert.equal(recovery.value, 'MAXIMUM')
      assert.equal(recovery.timing, 'ON_ATTACK_DEFEAT')
      assert.equal(recovery.target, 'SELF')
    } else assert.equal(recovery, undefined)
  }
  assert.equal(formatSkillStructureDuration({ type: 'SINGLE_ATTACK' }), '通常攻撃1回')
  assert.equal(formatSkillStructureEndCondition({ type: 'ATTACK_RESOLVED' }), '当該攻撃の処理完了')
  assert.match(formatSkillStructureActivationTrigger('NEXT_NORMAL_ATTACK'), /次の通常攻撃/)
})

test('スルトS2の攻撃力120%加算と単体時1.6倍を合算せず、実際の攻撃対象数で条件分岐する', () => {
  const record = skill('char_350_surtr', 2), stage = onlyStage(record)
  const atk = effect(record, stage.id, 'ATK_BUFF_RATIO'), conditional = effect(record, stage.id, 'ATTACK_SCALE')
  assert.equal(atk.operation, 'ADD_RATIO')
  assert.equal(atk.value, 1.2)
  assert.equal(atk.condition, null)
  assert.equal(conditional.operation, 'MULTIPLY')
  assert.equal(conditional.value, 1.6)
  assert.deepEqual(conditional.condition, { metric: 'actualAttackTargetCount', comparison: 'EQ', value: 1 })
  assert.equal(effect(record, stage.id, 'MAX_TARGETS').value, 2)
  assert.equal(formatSkillStructureEffectValue(atk), '＋120％')
  assert.equal(formatSkillStructureEffectValue(conditional), '×1.6')
})

test('スルトS3は最大HPを5000増加した後で全回復し、退場までの強化とHP減少を分ける', () => {
  const record = skill('char_350_surtr', 3), stage = onlyStage(record)
  assert.deepEqual(stage.duration, { type: 'UNTIL_EXIT' })
  assert.deepEqual(stage.endCondition, { type: 'OPERATOR_EXIT' })
  assert.equal(effect(record, stage.id, 'ATK_BUFF_RATIO').value, 3.3)
  assert.equal(effect(record, stage.id, 'MAX_TARGETS').value, 4)
  assert.equal(effect(record, stage.id, 'ATTACK_RANGE').value, 2)
  const hp = effect(record, stage.id, 'MAX_HP'), heal = effect(record, stage.id, 'HP')
  assert.equal(hp.operation, 'ADD_VALUE')
  assert.equal(hp.value, 5000)
  assert.equal(heal.timing, 'ON_STAGE_ENTER')
  assert.equal(heal.operation, 'FILL_RESOURCE')
  assert.equal(heal.value, 'MAXIMUM')
  assert.deepEqual(heal.afterEffects, [hp.id])
  const loss = effect(record, stage.id, 'HP_LOSS_RATE')
  assert.equal(loss.operation, 'INCREASE_TO_CAP')
  assert.equal(loss.unit, 'HP_LOSS_PROFILE')
  assert.deepEqual(loss.value, {
    basis: 'MAX_HP', maxRatioPerSecond: 0.2, rampDurationSeconds: 60,
    tickIntervalSeconds: 0.2, curve: 'UNSPECIFIED',
  })
  assert.deepEqual(getSkillStructureEffectValueRows(loss), [
    ['基準', '最大HP'], ['減少率の上限（毎秒）', 0.2], ['上限到達まで（秒）', 60],
    ['処理間隔（秒）', 0.2], ['増加曲線', '未確定'],
  ])
})

test('SA S2は初期状態と切替後を往復し、初期状態へ追加効果を引き継がない', () => {
  const record = skill('char_172_svrash', 2)
  assert.equal(record.source.duration, 0)
  const initial = record.effectStructure.stages.find(stage => stage.applicability?.value === 'INITIAL')
  const alternate = record.effectStructure.stages.find(stage => stage.applicability?.value === 'ALTERNATE')
  assert.ok(initial)
  assert.ok(alternate)
  assert.deepEqual(initial.effects, [])
  for (const [stage, mode] of [[initial, 'INITIAL'], [alternate, 'ALTERNATE']] as const) {
    assert.deepEqual(stage.applicability, { metric: 'skillMode', comparison: 'EQ', value: mode })
    assert.deepEqual(stage.duration, { type: 'UNTIL_MODE_CHANGE' })
    assert.deepEqual(stage.endCondition, { type: 'MODE_CHANGE_OR_EXIT' })
  }
  assert.deepEqual(record.effectStructure.modeTransitions, [
    { trigger: 'SKILL_ACTIVATION', from: 'INITIAL', to: 'ALTERNATE' },
    { trigger: 'SKILL_ACTIVATION', from: 'ALTERNATE', to: 'INITIAL' },
  ])
  assert.ok(record.effectStructure.inputRequirements?.includes('skillMode'))
  assert.deepEqual(effect(record, alternate.id, 'ATTACK_RANGE').value, { rangeId: '1-2' })
  assert.equal(effect(record, alternate.id, 'DEF_BUFF_RATIO').value, 1)
  const heal = effect(record, alternate.id, 'HP_RESTORE_RATIO')
  assert.deepEqual(heal.timing, { type: 'PERIODIC', intervalSeconds: 1 })
  assert.equal(heal.operation, 'RESTORE')
  assert.equal(heal.unit, 'MAX_HP_RATIO')
  assert.equal(heal.value, 0.06)
  assert.equal(formatSkillStructureEffectTiming(heal.timing), '1秒ごと')
  assert.equal(formatSkillStructureEffectValue(heal), '最大HPの6％')
})

test('真銀斬は防御力減少・対象数・近接扱いを別効果にし、攻撃範囲の形を残す', () => {
  const record = skill('char_172_svrash', 3), stage = onlyStage(record)
  assert.equal(effect(record, stage.id, 'DEF_BUFF_RATIO').value, -0.7)
  assert.equal(effect(record, stage.id, 'ATK_BUFF_RATIO').value, 2)
  assert.equal(effect(record, stage.id, 'MAX_TARGETS').value, 6)
  assert.equal(effect(record, stage.id, 'ATTACK_TREATMENT').value, 'MELEE')
  assert.deepEqual(effect(record, stage.id, 'ATTACK_RANGE').value, { rangeId: '3-7' })
  assert.equal(SKILL_STRUCTURE_RANGES['3-7'].grids.length, 16)
})

test('ソーンズS1は30秒の攻撃力100%加算を持つ', () => {
  const record = skill('char_293_thorns', 1), stage = onlyStage(record)
  assert.deepEqual(stage.duration, { type: 'FIXED_SECONDS', seconds: 30 })
  assert.equal(effect(record, stage.id, 'ATK_BUFF_RATIO').operation, 'ADD_RATIO')
  assert.equal(effect(record, stage.id, 'ATK_BUFF_RATIO').value, 1)
})

test('ソーンズS2は通常攻撃停止と被通常攻撃による反撃を別の仕組みとして保持する', () => {
  const record = skill('char_293_thorns', 2), stage = onlyStage(record)
  assert.deepEqual(stage.duration, { type: 'FIXED_SECONDS', seconds: 40 })
  assert.equal(effect(record, stage.id, 'NORMAL_ATTACK_ENABLED').value, false)
  assert.equal(effect(record, stage.id, 'ATK_BUFF_RATIO').value, 0.6)
  assert.equal(effect(record, stage.id, 'DEF_BUFF_RATIO').value, 1.1)
  const attack = effect(record, stage.id, 'TRIGGERED_ATTACK')
  assert.equal(attack.timing, 'ON_INCOMING_NORMAL_ATTACK')
  assert.equal(attack.operation, 'EXECUTE_ATTACK')
  assert.equal(attack.target, 'ENEMIES_IN_ACTION_RANGE')
  assert.deepEqual(attack.value, {
    count: 1, treatment: 'RANGED', rangeId: '3-1', maxTargets: 4, cooldownSeconds: 0.6,
  })
  assert.deepEqual(getSkillStructureEffectValueRows(attack), [
    ['攻撃回数', 1], ['攻撃の扱い', '遠距離攻撃'], ['攻撃範囲', '3-1'], ['対象数上限', 4],
    ['再発動までの最短時間（秒）', 0.6],
  ])
  assert.ok(!stage.effects.some(entry => entry.item === 'MAX_TARGETS'))
})

test('ソーンズS3の初回と2回目以降は加算せず、それぞれの段階の値を使用する', () => {
  const record = skill('char_293_thorns', 3), [first, later] = record.effectStructure.stages
  assert.deepEqual(first.applicability, { metric: 'skillActivationCount', comparison: 'EQ', value: 1 })
  assert.deepEqual(later.applicability, { metric: 'skillActivationCount', comparison: 'GTE', value: 2 })
  assert.deepEqual(first.duration, { type: 'FIXED_SECONDS', seconds: 30 })
  assert.deepEqual(later.duration, { type: 'UNTIL_EXIT' })
  assert.equal(effect(record, first.id, 'ATK_BUFF_RATIO').value, 0.6)
  assert.equal(effect(record, later.id, 'ATK_BUFF_RATIO').value, 1.2)
  assert.equal(effect(record, first.id, 'ATTACK_SPEED').value, 25)
  assert.equal(effect(record, later.id, 'ATTACK_SPEED').value, 50)
  for (const stage of [first, later]) {
    assert.equal(effect(record, stage.id, 'TRAIT_RANGED_ATK_PENALTY').value, false)
    assert.deepEqual(effect(record, stage.id, 'ATTACK_RANGE').value, { rangeId: '3-3' })
  }
  assert.equal(formatSkillStructurePredicate(later.applicability), '発動回数≧2')
  assert.equal(formatSkillStructureDuration(later.duration), '時間制限なし')
})

test('全効果の依存・範囲参照・数値の元データ対応が解決し、表示文字列を計算用値に混入させない', () => {
  for (const record of SKILL_STRUCTURES) for (const stage of record.effectStructure.stages) {
    assert.equal(new Set(stage.effects.map(entry => entry.id)).size, stage.effects.length)
    for (const entry of stage.effects) {
      assert.equal('display' in entry, false)
      assert.ok(formatSkillStructureEffectItem(entry.item))
      assert.ok(formatSkillStructureEffectOperation(entry))
      assert.ok(formatSkillStructureEffectValue(entry))
      for (const dependency of entry.afterEffects ?? []) {
        assert.notEqual(dependency, entry.id)
        assert.ok(stage.effects.some(other => other.id === dependency))
      }
      if (typeof entry.value === 'number') {
        const binding = record.source.blackboard.find(({ key }) => key === entry.sourceBinding)
        assert.ok(binding, `${record.basicInfo.skillId}/${entry.sourceBinding}`)
        assert.equal(binding.value, entry.value)
      }
      if (entry.unit === 'RANGE_DEFINITION' || entry.unit === 'ATTACK_ACTION') {
        assert.ok(SKILL_STRUCTURE_RANGES[entry.value.rangeId])
      }
    }
  }
  for (const range of Object.values(SKILL_STRUCTURE_RANGES)) {
    assert.equal(new Set(range.grids.map(({ row, col }) => `${row}:${col}`)).size, range.grids.length)
  }
})

test('保留レジストリは実在する2スキルへ紐付き、重複せず再開に必要な内容と参照先を保持する', () => {
  assert.equal(SKILL_STRUCTURE_DEFERRED_CASES.length, 2)
  assert.equal(new Set(SKILL_STRUCTURE_DEFERRED_CASES.map(entry => entry.id)).size, 2)
  assert.deepEqual(SKILL_STRUCTURE_DEFERRED_CASES.map(entry => identity(entry.selection)).sort(), [
    identity(skill('char_350_surtr', 3).basicInfo), identity(skill('char_293_thorns', 3).basicInfo),
  ].sort())
  for (const entry of SKILL_STRUCTURE_DEFERRED_CASES) {
    assert.ok(findSkillStructure(entry.selection), entry.id)
    assert.equal(entry.status, 'DEFERRED')
    for (const field of ['id', 'title', 'unresolved', 'currentTreatment', 'reason', 'impact', 'resumeWhen'] as const) {
      assert.ok(entry[field].trim(), `${entry.id}/${field}`)
    }
    assert.ok(entry.references.length > 0, `${entry.id} references`)
    assert.equal(new Set(entry.references.map(reference => reference.href)).size, entry.references.length)
    for (const reference of entry.references) {
      assert.ok(reference.label.trim())
      if (reference.external) assert.equal(new URL(reference.href).protocol, 'https:')
      else {
        assert.match(reference.href, /^#\//)
        assert.notEqual(parseHashRoute(reference.href).view, 'operators', reference.href)
      }
    }
  }
})

test('保留の検索は4つの選択キーを完全一致させ、他スキルや他レベルへ流用しない', () => {
  for (const entry of SKILL_STRUCTURE_DEFERRED_CASES) {
    assert.deepEqual(getSkillStructureDeferredCases({ ...entry.selection }), [entry])
    for (const selection of [
      { ...entry.selection, operatorId: 'char_unsupported' },
      { ...entry.selection, skillId: 'skchr_unsupported' },
      { ...entry.selection, skillIndex: 2 },
      ...[0, 8, 10, -1, Number.NaN].map(levelIndex => ({ ...entry.selection, levelIndex })),
    ]) assert.deepEqual(getSkillStructureDeferredCases(selection), [], `${entry.id}/${identity(selection)}`)
  }
  for (const record of SKILL_STRUCTURES) {
    const expected = SKILL_STRUCTURE_DEFERRED_CASES.filter(entry => identity(entry.selection) === identity(record.basicInfo))
    assert.deepEqual(getSkillStructureDeferredCases(record.basicInfo), expected)
  }
})
