import assert from 'node:assert/strict'
import test from 'node:test'
import { filterAttributeEffectCatalog, type AttributeEffectRow } from '../src/lib/attributeEffectCatalog.ts'

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
