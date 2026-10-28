import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCombatNumericValue, resolveCombatProbability, formatCombatNumericValue, getCombatNumericDefinitionRows,
  type CombatNumericValue, type CombatProbability,
} from '../src/lib/combatEffectStructure.ts'

const calc = (operation: 'ADD' | 'MULTIPLY' | 'DIVIDE' | 'MIN' | 'MAX', ...values: CombatNumericValue[]): CombatNumericValue =>
  ({ type: 'CALC', operation, values })
const metric = (name: string): CombatNumericValue => ({ type: 'METRIC', metric: name })

test('HP減少による速度上昇を共通式で計算し、上限・下限と欠損を区別する', () => {
  const value = calc('MULTIPLY', 100, calc('MIN', 1, calc('MAX', 0,
    calc('DIVIDE', calc('ADD', 1, calc('MULTIPLY', -0.01, metric('selfHpPercent'))), 0.7))))
  for (const [hp, expected] of [[100, 0], [65, 50], [30, 100], [0, 100], [101, 0]]) {
    assert.ok(Math.abs(resolveCombatNumericValue(value, { selfHpPercent: hp })! - expected) < 1e-10)
  }
  for (const invalid of [undefined, null, NaN, Infinity, '65', true]) {
    assert.equal(resolveCombatNumericValue(value, { selfHpPercent: invalid }), null)
  }
})

test('条件分岐は未知条件を逆分岐に置き換えず、使わない側の未解決参照は評価しない', () => {
  const value: CombatNumericValue = {
    type: 'CONDITIONAL', condition: { type: 'COMPARE', metric: 'skill.index', comparison: 'EQ', value: 3 },
    whenTrue: metric('skill.probability'), whenFalse: 0.2,
  }
  assert.equal(resolveCombatNumericValue(value, { 'skill.index': 2 }), 0.2)
  assert.equal(resolveCombatNumericValue(value, { 'skill.index': 3, 'skill.probability': 0.5 }), 0.5)
  assert.equal(resolveCombatNumericValue(value, { 'skill.index': 3 }), null)
  assert.equal(resolveCombatNumericValue(value, {}), null)
})

test('重複数と上限を合成でき、ゼロ値は未確定扱いにならない', () => {
  const chance = calc('MIN', 1, calc('ADD', 0.2, calc('MULTIPLY', 0.05, metric('ammoSpent'))))
  assert.equal(resolveCombatNumericValue(chance, { ammoSpent: 0 }), 0.2)
  assert.equal(resolveCombatNumericValue(chance, { ammoSpent: 6 }), 0.5)
  assert.equal(resolveCombatNumericValue(chance, { ammoSpent: 30 }), 1)
  assert.equal(resolveCombatNumericValue(calc('MULTIPLY', 0, null), {}), null, '未知値をゼロ倍して確定済みにしない')
  assert.equal(resolveCombatNumericValue(calc('MULTIPLY', 0, 100), {}), 0)
})

test('動的な発動確率も共通の数値定義を読み、入力不足や範囲外を確率1に置き換えない', () => {
  const probability: CombatProbability = { rollScope: 'APPLICATION',
    chance: calc('MIN', 1, calc('ADD', 0.2, calc('MULTIPLY', 0.05, metric('ammoSpent')))) }
  assert.equal(resolveCombatProbability(probability), null)
  assert.equal(resolveCombatProbability(probability, { ammoSpent: 6 }), 0.5)
  assert.equal(resolveCombatProbability(probability, { ammoSpent: 30 }), 1)
  const direct: CombatProbability = { chance: metric('chance'), rollScope: 'TICK' }
  assert.equal(resolveCombatProbability(direct, { chance: 0 }), 0)
  assert.equal(resolveCombatProbability(direct, { chance: -0.1 }), null)
  assert.equal(resolveCombatProbability(direct, { chance: 1.1 }), null)
})

test('無効な除算や演算overflowは計算結果へ流さず、数式と参照を定義表へ表示できる', () => {
  for (const value of [calc('DIVIDE', 1, 0), calc('DIVIDE', 1), calc('DIVIDE', 1, 2, 3),
    calc('ADD'), calc('MULTIPLY', 1e308, 1e308), calc('MIN', 1, null), metric('missing')]) {
    assert.equal(resolveCombatNumericValue(value, {}), null)
  }
  const value = calc('ADD', 0.1, calc('MULTIPLY', 0.04, metric('source.blockCount')))
  const text = formatCombatNumericValue(value)
  assert.doesNotMatch(text, /\[object Object\]|undefined|NaN/)
  assert.match(text, /0\.1/)
  assert.match(text, /0\.04/)
  const rows = getCombatNumericDefinitionRows(value)
  assert.ok(rows.length > 0)
  assert.doesNotMatch(JSON.stringify(rows), /\[object Object\]|undefined|NaN/)
})
