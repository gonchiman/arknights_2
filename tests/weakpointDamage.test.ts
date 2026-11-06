import test from 'node:test'
import assert from 'node:assert/strict'
import { selectWeakpointDamageType } from '../src/lib/weakpointDamage.ts'

test('弱点は防御と術耐性を別々に計算し、有利な属性へ変換する', () => {
  for (const originalType of ['PHYSICAL', 'ARTS'] as const) {
    assert.equal(selectWeakpointDamageType({ attack: 1000, originalType, defense: 200, resistance: 50 }), 'PHYSICAL')
    assert.equal(selectWeakpointDamageType({ attack: 1000, originalType, defense: 800, resistance: 20 }), 'ARTS')
    assert.equal(selectWeakpointDamageType({ attack: 1000, originalType, defense: 500, resistance: 50 }), originalType)
    assert.equal(selectWeakpointDamageType({ attack: 1000, originalType, defense: 10000, resistance: 100 }), originalType)
    assert.equal(selectWeakpointDamageType({ attack: 0, originalType, defense: 100, resistance: 50 }), originalType)
  }
})

test('弱点判定は各属性の貫通を使い、固定弱点は有利不利を上書きする', () => {
  const input = { attack: 1000, originalType: 'ARTS' as const, defense: 800, resistance: 50 }
  assert.equal(selectWeakpointDamageType({ ...input, penetration: { defenseIgnoreFixed: 600 } }), 'PHYSICAL')
  assert.equal(selectWeakpointDamageType({ ...input, defense: 200, penetration: { resistanceIgnoreFixed: 40 } }), 'ARTS')
  assert.equal(selectWeakpointDamageType({ ...input, fixedWeakpoint: 'PHYSICAL' }), 'PHYSICAL')
  assert.equal(selectWeakpointDamageType({ ...input, defense: 0, fixedWeakpoint: 'ARTS' }), 'ARTS')
  assert.equal(selectWeakpointDamageType({ ...input, originalType: 'TRUE', fixedWeakpoint: 'ARTS' }), 'TRUE')
})

test('弱点の未定義条件や不正な敵属性を有利な属性へ丸めない', () => {
  const input = { attack: 1000, originalType: 'ARTS' as const, defense: 800, resistance: 50 }
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const key of ['attack', 'defense', 'resistance'] as const) {
      assert.throws(() => selectWeakpointDamageType({ ...input, [key]: value }))
    }
    assert.throws(() => selectWeakpointDamageType({ ...input, penetration: { defenseIgnoreFixed: value } }))
  }
  assert.throws(() => selectWeakpointDamageType({ ...input, resistance: 101 }))
  assert.throws(() => selectWeakpointDamageType({ ...input, fixedWeakpoint: 'TRUE' as 'ARTS' }))
})
