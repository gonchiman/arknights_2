import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMechAccordDamageRows,
  calculateMechAccordResistanceTable,
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

test('選択した攻撃回数について術耐性別の本体・浮遊・合計を返す', () => {
  const table = calculateMechAccordResistanceTable(1000, 9999, 1)
  const values = table.rows.map((row) => [
    row.resistance,
    roundForTest(row.mainDamage),
    roundForTest(row.droneDamage),
    roundForTest(row.combinedDamage),
  ])

  assert.equal(table.attackCount, 1)
  assert.equal(table.attackCountLabel, '1回目')
  assert.equal(table.multiplierPercent, 20)
  assert.deepEqual(values, [
    [0, 1000, 200, 1200],
    [20, 800, 160, 960],
    [40, 600, 120, 720],
    [60, 400, 80, 480],
    [80, 200, 40, 240],
    [95, 50, 10, 60],
    [100, 50, 10, 60],
  ])
  assert.equal(table.rows[5].mainBreakdown.minimumApplied, false)
  assert.equal(table.rows[5].droneBreakdown.minimumApplied, false)
  assert.equal(table.rows[5].mainMinimumReached, true)
  assert.equal(table.rows[5].droneMinimumReached, true)
  assert.equal(table.rows[5].combinedMinimumReached, true)
  assert.equal(table.rows[6].mainBreakdown.minimumApplied, true)
  assert.equal(table.rows[6].droneBreakdown.minimumApplied, true)
})

test('術耐性別出力で選択回数の倍率と8回目以降への正規化を適用する', () => {
  const fourth = calculateMechAccordResistanceTable(1000, 0, 4)
  const eighth = calculateMechAccordResistanceTable(1000, 0, 99)

  assert.equal(fourth.attackCount, 4)
  assert.equal(fourth.attackCountLabel, '4回目')
  assert.equal(fourth.multiplierPercent, 65)
  assert.equal(fourth.rows[0].mainDamage, 1000)
  assert.equal(fourth.rows[0].droneDamage, 650)
  assert.equal(fourth.rows[0].combinedDamage, 1650)
  const ignored = calculateMechAccordResistanceTable(1000, 0, 1, {
    resistanceIgnoreFixed: 20,
  })
  const resistance100 = ignored.rows.at(-1)

  assert.equal(eighth.attackCount, 8)
  assert.equal(eighth.attackCountLabel, '8回目以降')
  assert.equal(eighth.multiplierPercent, 110)
  assert.equal(eighth.rows[0].mainDamage, 1000)
  assert.equal(eighth.rows[0].droneDamage, 1100)
  assert.equal(eighth.rows[0].combinedDamage, 2100)
  assert.equal(calculateMechAccordResistanceTable(1000, 0, Number.NaN).attackCount, 1)
  assert.ok(resistance100)
  assert.equal(resistance100.mainBreakdown.appliedResistance, 80)
  assert.equal(resistance100.droneBreakdown.appliedResistance, 80)
  assert.equal(roundForTest(resistance100.mainDamage), 200)
  assert.equal(roundForTest(resistance100.droneDamage), 40)
  assert.equal(roundForTest(resistance100.combinedDamage), 240)
  assert.equal(resistance100.combinedMinimumReached, false)
})

test('操機術師の実データ職分ID funnelだけを対象とする', () => {
  assert.equal(isMechAccordSubProfession('funnel'), true)
  assert.equal(isMechAccordSubProfession('core_caster'), false)
  assert.equal(isMechAccordSubProfession('mech_accord'), false)
  assert.equal(isMechAccordSubProfession(''), false)
})

function roundForTest(value: number): number {
  return Math.round(value * 1e9) / 1e9
}
