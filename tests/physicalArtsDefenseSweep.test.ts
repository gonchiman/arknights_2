import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPhysicalArtsDefenseRowCount, getPhysicalArtsDefenseRows, toDamageReductionPercent,
} from '../src/lib/physicalArtsDefenseSweep.ts'

test('防御力と術耐性を別々に刻み、刻みの倍数でない上限も含める', () => {
  const defense = getPhysicalArtsDefenseRows(1000, 'defense', { min: 550, max: 1200, step: 400 })
  const resistance = getPhysicalArtsDefenseRows(1000, 'resistance', { min: 60, max: 100, step: 35 })
  assert.deepEqual(defense, [{ stat: 550, damage: 450 }, { stat: 950, damage: 50 }, { stat: 1200, damage: 50 }])
  assert.deepEqual(resistance.map(({ stat }) => stat), [60, 95, 100])
  assert.ok(Math.abs(toDamageReductionPercent(1000, defense[0].damage) - 55) < 1e-10)
  assert.equal(toDamageReductionPercent(1000, defense[1].damage), 95)
  assert.equal(toDamageReductionPercent(1000, resistance[0].damage), 60)
  for (const { damage } of resistance.slice(1)) {
    assert.ok(Math.abs(toDamageReductionPercent(1000, damage) - 95) < 1e-10)
  }
  assert.deepEqual(getPhysicalArtsDefenseRows(4000, 'defense', { min: 1200, max: 1200, step: 1 }), [{ stat: 1200, damage: 2800 }])
})

test('最後の端数行を含めて行数上限を判定する', () => {
  const range = { min: 0, max: 999, step: 2 }
  assert.equal(getPhysicalArtsDefenseRowCount(range), 501)
  assert.deepEqual(getPhysicalArtsDefenseRows(1000, 'defense', range), [])
  assert.equal(getPhysicalArtsDefenseRows(1000, 'defense', { ...range, max: 998 }).length, 500)
  assert.equal(getPhysicalArtsDefenseRowCount({ ...range, step: 0 }), 0)
})
