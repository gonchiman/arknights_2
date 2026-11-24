import assert from 'node:assert/strict'
import test from 'node:test'
import { filterAttributeEffectCatalog, summarizeAttributeEffects, type AttributeEffectRow } from '../src/lib/attributeEffectCatalog.ts'

test('絞り込みは属性・出典・名称の各語をすべて満たす効果を返す', () => {
  const skill: AttributeEffectRow = {
    id: 'skill-example', operatorName: 'テスト', name: '一撃', source: 'skill', sourceLabel: 'S2',
    attribute: 'arts', effect: '術耐性低下', amount: '−10', condition: '命中時', href: '#/skills',
  }
  const talent: AttributeEffectRow = { ...skill, id: 'talent-example', source: 'talent', sourceLabel: '素質1' }
  const physical: AttributeEffectRow = { ...skill, id: 'physical-example', attribute: 'physical' }
  const rows = [skill, talent, physical]
  assert.deepEqual(filterAttributeEffectCatalog(rows, { attribute: 'arts', source: 'skill', query: '一撃　テスト　ｓ２' }), [skill])
  assert.deepEqual(filterAttributeEffectCatalog(rows, { attribute: 'physical', source: 'talent', query: '' }), [])
  assert.deepEqual(filterAttributeEffectCatalog(rows, { attribute: 'all', source: 'all', query: '  ' }), rows)
})

test('効果別集計は同じオペレーターの複数の出典を数え、同じ効果名の物理と術を一行に並べる', () => {
  const base: AttributeEffectRow = {
    id: 'a', operatorName: 'テスト', source: 'talent', sourceLabel: '素質1', name: '素質',
    attribute: 'physical', effect: '与ダメージ増加', amount: '+10%', condition: '攻撃時', href: '#/talents',
  }
  const rows: AttributeEffectRow[] = [
    base,
    { ...base, id: 'b', attribute: 'arts' },
    { ...base, id: 'c', source: 'skill', sourceLabel: 'S1', name: '一撃' },
    { ...base, id: 'd', effect: '新効果10' },
    { ...base, id: 'e', effect: '防御力無視' },
    { ...base, id: 'f', effect: '新効果2' },
  ]
  assert.deepEqual(summarizeAttributeEffects(rows), [
    { effect: '防御力無視', physical: 1, arts: 0 },
    { effect: '与ダメージ増加', physical: 2, arts: 1 },
    { effect: '新効果2', physical: 1, arts: 0 },
    { effect: '新効果10', physical: 1, arts: 0 },
  ])
  const filtered = filterAttributeEffectCatalog(rows, { attribute: 'physical', source: 'skill', query: '一撃' })
  assert.deepEqual(summarizeAttributeEffects(filtered), [{ effect: '与ダメージ増加', physical: 1, arts: 0 }])
  assert.deepEqual(summarizeAttributeEffects([]), [])
})
