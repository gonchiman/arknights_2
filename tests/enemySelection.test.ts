import test from 'node:test'
import assert from 'node:assert/strict'
import { getEnemyCombatInputValues, hasEnemyCombatInputChanges } from '../src/lib/enemySelection.ts'
import { buildEnemyRecords } from '../src/lib/enemyData.ts'

const [enemy] = buildEnemyRecords({ enemyData: { test: { enemyId: 'test', name: 'テスト敵' } } }, {
  test: [{ level: 0, enemyData: { attributes: {
    maxHp: { m_defined: true, m_value: 5000 },
    def: { m_defined: true, m_value: 0 },
    magicResistance: { m_defined: true, m_value: 0 },
  } } }],
})

test('敵選択では0の防御力・術耐性も入力へ反映する', () => {
  assert.deepEqual(getEnemyCombatInputValues(enemy), { hp: '5000', defense: '0', resistance: '0' })
})

test('未取得・不正な値は空欄にし、前の敵の数値を流用しない', () => {
  const missing = { ...enemy, stats: { ...enemy.stats, maxHp: null, defense: Number.NaN } }
  assert.deepEqual(getEnemyCombatInputValues(missing), { hp: '', defense: '', resistance: '0' })
})

test('表記だけの変更と実際の数値調整・未入力を区別する', () => {
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '5000.0', defense: '0', resistance: '0' }), false)
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '5000', defense: '0', resistance: '15' }), true)
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '5000', defense: '', resistance: '0' }), true)
  const missing = { ...enemy, stats: { ...enemy.stats, magicResistance: null } }
  assert.equal(hasEnemyCombatInputChanges(missing, { hp: '5000', defense: '0', resistance: '' }), false)
  assert.equal(hasEnemyCombatInputChanges(missing, { hp: '5000', defense: '0', resistance: '0' }), true)
})
