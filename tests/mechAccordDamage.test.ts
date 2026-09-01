import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMechAccordDamageRows,
  getMechAccordMultiplierPercent,
  isMechAccordSubProfession,
} from '../src/lib/mechAccordDamage.ts'

test('文書で定義された無MD・XMD・YMDの倍率を8段階で返す', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 0)

  assert.deepEqual(sequence.rows.map((row) => row.attackCountLabel), [
    '1', '2', '3', '4', '5', '6', '7', '8以上',
  ])
  assert.deepEqual(sequence.rows.map((row) => row.variants.NONE.multiplierPercent), [
    20, 35, 50, 65, 80, 95, 110, 110,
  ])
  assert.deepEqual(sequence.rows.map((row) => row.variants.X.multiplierPercent), [
    35, 50, 65, 80, 95, 110, 110, 110,
  ])
  assert.deepEqual(sequence.rows.map((row) => row.variants.Y.multiplierPercent), [
    20, 35, 50, 65, 80, 95, 110, 120,
  ])
})

test('8回以上の攻撃は各モジュールの最終倍率で固定する', () => {
  assert.equal(getMechAccordMultiplierPercent(8, 'NONE'), 110)
  assert.equal(getMechAccordMultiplierPercent(99, 'NONE'), 110)
  assert.equal(getMechAccordMultiplierPercent(8, 'X'), 110)
  assert.equal(getMechAccordMultiplierPercent(99, 'X'), 110)
  assert.equal(getMechAccordMultiplierPercent(8, 'Y'), 120)
  assert.equal(getMechAccordMultiplierPercent(99, 'Y'), 120)
})

test('浮遊ユニット倍率を軽減前攻撃力へ掛け、術耐性を適用する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 9999, 20)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(sequence.mainDamage.damageType, 'ARTS')
  assert.equal(sequence.mainDamage.result, 800)
  assert.equal(first.variants.NONE.rawDroneAttack, 200)
  assert.equal(first.variants.NONE.droneDamage, 160)
  assert.equal(first.variants.X.rawDroneAttack, 350)
  assert.equal(first.variants.X.droneDamage, 280)
  assert.equal(eighth.variants.Y.rawDroneAttack, 1200)
  assert.equal(eighth.variants.Y.droneDamage, 960)
})

test('本体100%と浮遊ユニット1体の軽減後ダメージを合算する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 20)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(first.variants.NONE.combinedDamage, 960)
  assert.equal(first.variants.X.combinedDamage, 1080)
  assert.equal(eighth.variants.Y.combinedDamage, 1760)
})

test('本体と浮遊ユニットそれぞれの術最低保証情報を保持する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 100)
  const threshold = calculateMechAccordDamageRows(1000, 0, 95)
  const first = sequence.rows[0]
  const eighth = sequence.rows[7]

  assert.equal(sequence.mainDamage.minimumApplied, true)
  assert.equal(sequence.mainDamage.minimumDamage, 50)
  assert.equal(sequence.mainDamage.result, 50)
  assert.equal(first.variants.NONE.minimumReached, true)
  assert.equal(first.variants.NONE.droneBreakdown.minimumDamage, 10)
  assert.equal(first.variants.NONE.droneDamage, 10)
  assert.equal(first.variants.X.droneBreakdown.minimumDamage, 17.5)
  assert.equal(first.variants.X.droneDamage, 17.5)
  assert.equal(eighth.variants.Y.droneBreakdown.minimumDamage, 60)
  assert.equal(eighth.variants.Y.droneDamage, 60)
  assert.equal(threshold.rows[0].variants.NONE.droneBreakdown.minimumApplied, false)
  assert.equal(threshold.rows[0].variants.NONE.minimumReached, true)
})

test('術耐性固定無視を本体と全ての浮遊ユニット出力へ適用する', () => {
  const sequence = calculateMechAccordDamageRows(1000, 0, 50, {
    resistanceIgnoreFixed: 20,
  })
  const first = sequence.rows[0]

  assert.equal(sequence.mainDamage.appliedResistance, 30)
  assert.equal(sequence.mainDamage.result, 700)
  assert.equal(first.variants.NONE.droneBreakdown.appliedResistance, 30)
  assert.equal(first.variants.NONE.droneDamage, 140)
  assert.equal(first.variants.NONE.combinedDamage, 840)
})

test('操機術師の実データ職分ID funnelだけを対象とする', () => {
  assert.equal(isMechAccordSubProfession('funnel'), true)
  assert.equal(isMechAccordSubProfession('core_caster'), false)
  assert.equal(isMechAccordSubProfession('mech_accord'), false)
  assert.equal(isMechAccordSubProfession(''), false)
})
