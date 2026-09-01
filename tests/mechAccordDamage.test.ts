import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMechAccordDamageRows,
  getMechAccordMultiplierPercent,
  isMechAccordSubProfession,
} from '../src/lib/mechAccordDamage.ts'

test('基礎職分特性の倍率を8段階で返す', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 0)

  assert.deepEqual(sequence.rows.map((row) => row.attackCountLabel), [
    '1', '2', '3', '4', '5', '6', '7', '8以上',
  ])
  assert.deepEqual(sequence.rows.map((row) => row.multiplierPercent), [
    20, 35, 50, 65, 80, 95, 110, 110,
  ])
})

test('8回以上の攻撃は基礎職分特性の最終倍率で固定する', () => {
  assert.equal(getMechAccordMultiplierPercent(8), 110)
  assert.equal(getMechAccordMultiplierPercent(99), 110)
})

test('浮遊ユニット倍率を軽減前攻撃力へ掛け、術耐性を適用する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 9999, 20)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(sequence.mainDamage.damageType, 'ARTS')
  assert.equal(sequence.mainDamage.result, 800)
  assert.equal(first.rawDroneAttack, 200)
  assert.equal(first.droneDamage, 160)
  assert.equal(eighth.rawDroneAttack, 1100)
  assert.equal(eighth.droneDamage, 880)
})

test('本体100%と浮遊ユニット1体の軽減後ダメージを合算する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 20)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(first.combinedDamage, 960)
  assert.equal(eighth.combinedDamage, 1680)
})

test('本体と浮遊ユニットそれぞれの術最低保証情報を保持する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 100)
  const threshold = calculateMechAccordDamageRows(1000, 0, 95)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(sequence.mainDamage.minimumApplied, true)
  assert.equal(sequence.mainDamage.minimumDamage, 50)
  assert.equal(sequence.mainDamage.result, 50)
  assert.equal(first.minimumReached, true)
  assert.equal(first.droneBreakdown.minimumDamage, 10)
  assert.equal(first.droneDamage, 10)
  assert.equal(eighth.droneBreakdown.minimumDamage, 55)
  assert.equal(eighth.droneDamage, 55)
  assert.equal(threshold.rows[0].droneBreakdown.minimumApplied, false)
  assert.equal(threshold.rows[0].minimumReached, true)
})

test('術耐性固定無視を本体と全ての浮遊ユニット出力へ適用する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 50, {
    resistanceIgnoreFixed: 20,
  })
  const first = sequence.rows[0]

  assert.equal(sequence.mainDamage.appliedResistance, 30)
  assert.equal(sequence.mainDamage.result, 700)
  assert.equal(first.droneBreakdown.appliedResistance, 30)
  assert.equal(first.droneDamage, 140)
  assert.equal(first.combinedDamage, 840)
})

test('操機術師の実データ職分ID funnelだけを対象とする', () => {
  assert.equal(isMechAccordSubProfession('funnel'), true)
  assert.equal(isMechAccordSubProfession('core_caster'), false)
  assert.equal(isMechAccordSubProfession('mech_accord'), false)
  assert.equal(isMechAccordSubProfession(''), false)
})
