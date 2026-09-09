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

test('敵選択ではHPと0の術耐性を入力へ反映し、防御力は含めない', () => {
  assert.deepEqual(getEnemyCombatInputValues(enemy), { hp: '5000', resistance: '0' })
  for (const defense of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const withoutDefense = { ...enemy, stats: { ...enemy.stats, defense } }
    assert.deepEqual(getEnemyCombatInputValues(withoutDefense), { hp: '5000', resistance: '0' })
    assert.equal(hasEnemyCombatInputChanges(withoutDefense, { hp: '5000', resistance: '0' }), false)
  }
})

test('未取得・不正な値は空欄にし、前の敵の数値を流用しない', () => {
  const missing = { ...enemy, stats: { ...enemy.stats, maxHp: null, magicResistance: Number.NaN } }
  assert.deepEqual(getEnemyCombatInputValues(missing), { hp: '', resistance: '' })
  const nonfinite = { ...enemy, stats: { ...enemy.stats, maxHp: Number.POSITIVE_INFINITY, magicResistance: null } }
  assert.deepEqual(getEnemyCombatInputValues(nonfinite), { hp: '', resistance: '' })
})

test('表記だけの変更と実際の数値調整・未入力を区別する', () => {
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '5000.0', resistance: ' 0.0 ' }), false)
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '5000', resistance: '15' }), true)
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '6000', resistance: '0' }), true)
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '', resistance: '0' }), true)
  assert.equal(hasEnemyCombatInputChanges(enemy, { hp: '5000', resistance: '' }), true)
  const missing = { ...enemy, stats: { ...enemy.stats, magicResistance: null } }
  assert.equal(hasEnemyCombatInputChanges(missing, { hp: '5000', resistance: '' }), false)
  assert.equal(hasEnemyCombatInputChanges(missing, { hp: '5000', resistance: '0' }), true)
})
