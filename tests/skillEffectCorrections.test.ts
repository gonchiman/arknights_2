import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SKILL_EFFECT_CORRECTIONS_STORAGE_KEY, findSkillEffectCorrection, getSkillEffectDisplayFields,
  loadSkillEffectCorrections, saveSkillEffectCorrections, updateSkillEffectCorrections,
} from '../src/lib/skillEffectCorrections.ts'
import type { SkillEffectBreakdownRow } from '../src/lib/skillEffectBreakdown.ts'

const row: SkillEffectBreakdownRow = {
  id: 'attack:0', sourceStart: 0, sourceEnd: 9, sourceText: '攻撃力+330%',
  timing: 'スキル中', condition: '—', target: '自身', label: '攻撃力', operation: '加算',
  valueText: '+330%', status: 'parsed',
  effect: { key: 'attackPowerBonusRatio', label: '攻撃力', value: 3.3, unit: 'ratio',
    sourceKey: 'atk', sourceText: '攻撃力+330%', context: null },
}
const context = { operatorId: 'char_350_surtr', skillId: 'skchr_surtr_3', levelIndex: 9,
  sourceDescription: '攻撃力+{atk:0%}', description: '攻撃力+330%' }
const fields = { ...getSkillEffectDisplayFields(row), label: '攻撃力上昇' }
const entries = () => updateSkillEffectCorrections([], context, row, fields)
function memoryStorage() {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) } }
}

test('修正は表示フィールドに留まり、元の型付き値・単位・キーを変更しない', () => {
  const original = structuredClone(row)
  const saved = entries()
  assert.deepEqual(findSkillEffectCorrection(saved, context, row)?.fields, fields)
  assert.deepEqual(row, original)
  assert.equal(saved[0].fields.valueText, '+330%')
})

test('別スキル・別レベル・原文変更・値変更では古い修正を適用しない', () => {
  for (const changed of [
    { ...context, skillId: 'other' }, { ...context, operatorId: 'other' },
    { ...context, levelIndex: 0 }, { ...context, sourceDescription: '説明変更' },
    { ...context, description: '攻撃力+240%' },
  ]) assert.equal(findSkillEffectCorrection(entries(), changed, row), undefined)
})

test('解析規則や同文の位置・意味が変わった時も修正を別行へ移さない', () => {
  for (const changed of [
    { ...row, id: 'attack:1' }, { ...row, sourceStart: 12, sourceEnd: 21 },
    { ...row, condition: '対象がスタン中' }, { ...row, operation: '乗算' },
    { ...row, effect: { ...row.effect!, value: 2.4 } },
    { ...row, effect: { ...row.effect!, key: 'other' } },
    { ...row, effect: { ...row.effect!, unit: 'multiplier' } },
    { ...row, effect: { ...row.effect!, sourceKey: 'other' } },
  ]) assert.equal(findSkillEffectCorrection(entries(), context, changed), undefined)
})

test('修正の更新・解除はその行だけに作用する', () => {
  const other = { ...context, skillId: 'other' }
  const original = updateSkillEffectCorrections(entries(), other, row, fields)
  const updated = updateSkillEffectCorrections(original, context, row, { ...fields, target: '自身の攻撃' })
  assert.equal(updated.length, 2)
  assert.equal(findSkillEffectCorrection(updated, context, row)?.fields.target, '自身の攻撃')
  const reset = updateSkillEffectCorrections(updated, context, row, null)
  assert.equal(findSkillEffectCorrection(reset, context, row), undefined)
  assert.ok(findSkillEffectCorrection(reset, other, row))
  assert.equal(updateSkillEffectCorrections(original, context, row, getSkillEffectDisplayFields(row)).length, 1)
})

test('空欄を条件なしと扱わず入力エラーにする', () => {
  assert.throws(() => updateSkillEffectCorrections([], context, row, { ...fields, condition: ' ' }), /未解析/)
})

test('保存して読み直しても同じ原文にだけ修正を復元する', () => {
  const storage = memoryStorage()
  assert.deepEqual(saveSkillEffectCorrections(entries(), storage), { ok: true })
  const loaded = loadSkillEffectCorrections(storage)
  assert.equal(loaded.error, null)
  assert.deepEqual(findSkillEffectCorrection(loaded.entries, context, row)?.fields, fields)
})

test('壊れた保存形式や別versionを正常な修正として適用しない', () => {
  const storage = memoryStorage()
  for (const text of ['{', 'null', '{"version":2,"entries":[]}',
    '{"version":1,"entries":[{"contextKey":"x","rowFingerprint":"x","fields":{}}]}']) {
    storage.data.set(SKILL_EFFECT_CORRECTIONS_STORAGE_KEY, text)
    const loaded = loadSkillEffectCorrections(storage)
    assert.deepEqual(loaded.entries, [])
    assert.ok(loaded.error)
    assert.equal(storage.data.get(SKILL_EFFECT_CORRECTIONS_STORAGE_KEY), text)
  }
})

test('保存拒否・容量不足・読込拒否を成功として返さない', () => {
  const blocked = { getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('quota') } }
  assert.ok(loadSkillEffectCorrections(blocked).error)
  assert.equal(saveSkillEffectCorrections(entries(), blocked).ok, false)
  assert.equal(saveSkillEffectCorrections(entries(), null).ok, false)
  assert.deepEqual(loadSkillEffectCorrections(null), { entries: [], error: null })
})
