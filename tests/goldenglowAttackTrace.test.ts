import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoldenglowAttackTrace,
  buildGoldenglowCycleTrace,
  GOLDENGLOW_ATTACK_TRACE_LIMIT,
} from '../src/lib/goldenglowAttackTrace.ts'
import {
  calculateGoldenglowExpectedDpsFromModel,
  type GoldenglowExplosionModel,
} from '../src/lib/goldenglowExplosion.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走',
  talentDescription: '',
  damageType: 'ARTS',
  attackScale: 3,
  attackScalePercent: 300,
  nominalChancePercent: 10,
  prdStep: 0.015,
  prdMaxStack: 40,
  additionalDroneCount: 1,
  activeDroneCount: 2,
  resistanceIgnoreFixed: 15,
  droneInitialAttackScale: 0.2,
  droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15,
  droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1,
  droneMaxAttackScalePercent: 110,
  droneMaxStack: 6,
}

test('初回と2回目は爆発・不発の分岐をそれぞれの確率で重み付けする', () => {
  const rows = buildGoldenglowAttackTrace({ model, effectiveAttack: 547, attackCount: 2 })
  const first = 0.985 * 109.4 + 0.015 * 1641
  const afterMiss = 0.97 * 191.45 + 0.03 * 1641
  const second = 0.015 * first + 0.985 * afterMiss

  assert.deepEqual(rows.map((row) => row.attackNumber), [1, 2])
  assertClose(rows[0].expectedDamage, 132.374)
  assertClose(rows[1].expectedDamage, second)
  assertClose(rows[1].cumulativeDamage, first + second)
  assertClose(rows[0].explosionChancePercent, 1.5)
  assertClose(rows[1].explosionChancePercent, (0.015 * 0.015 + 0.985 * 0.03) * 100)
})

for (const skill of [
  { skillIndex: 1, effectiveAttack: 547, attackInterval: 0.867, duration: 25, activeDroneCount: 2 },
  { skillIndex: 3, effectiveAttack: 703, attackInterval: 1.3, duration: 30, activeDroneCount: 3 },
]) {
  for (const enemyResistance of [0, 40, 100]) {
    test(`S${skill.skillIndex}・術耐性${enemyResistance}の各攻撃と端数の合計が計算機の浮遊1体と一致する`, () => {
      const skillModel = { ...model, activeDroneCount: skill.activeDroneCount }
      const expected = calculateGoldenglowExpectedDpsFromModel({
        ...skill,
        model: skillModel,
        enemyResistance,
      })
      assert.ok(expected)
      assert.notEqual(expected.fullAttackCount, null)
      assert.notEqual(expected.fractionalAttackWeight, null)
      assert.notEqual(expected.perDrone.expectedTotalDamage, null)

      const fullCount = expected.fullAttackCount!
      const fractionalWeight = expected.fractionalAttackWeight!
      const rows = buildGoldenglowAttackTrace({
        model: skillModel,
        effectiveAttack: skill.effectiveAttack,
        enemyResistance,
        attackCount: fullCount + 1,
      })
      const fullDamage = rows[fullCount - 1].cumulativeDamage
      const fractionalDamage = rows[fullCount].expectedDamage * fractionalWeight
      assertClose(fullDamage + fractionalDamage, expected.perDrone.expectedTotalDamage!)

      const fullWindow = calculateGoldenglowExpectedDpsFromModel({
        ...skill,
        model: skillModel,
        enemyResistance,
        duration: fullCount * skill.attackInterval,
      })
      assert.ok(fullWindow)
      assertClose(fullDamage, fullWindow.perDrone.expectedTotalDamage!)
    })
  }
}

test('確定爆発の次はm0から再開し、通常倍率も計算機のモデルどおり初期化する', () => {
  const rows = buildGoldenglowAttackTrace({
    model: { ...model, prdStep: 0, prdMaxStack: 2 },
    effectiveAttack: 1000,
    attackCount: 7,
  })

  assert.deepEqual(rows.map((row) => row.explosionChancePercent), [0, 0, 100, 0, 0, 100, 0])
  const expectedDamage = [200, 350, 3000, 200, 350, 3000, 200]
  rows.forEach((row, index) => assertClose(row.expectedDamage, expectedDamage[index]))
  assertClose(rows[6].cumulativeDamage, 7300)
})

test('長い攻撃列も確率を失わず、同じダメージしかないモデルでは期待値が一定になる', () => {
  const rows = buildGoldenglowAttackTrace({
    model: {
      ...model,
      attackScale: 1,
      droneInitialAttackScale: 1,
      droneAttackScaleStep: 0,
      droneMaxAttackScale: 1,
    },
    effectiveAttack: 1000,
    attackCount: 500,
  })

  rows.forEach((row) => {
    assertClose(row.expectedDamage, 1000)
    assert.ok(row.explosionChancePercent >= 0 && row.explosionChancePercent <= 100)
  })
  assertClose(rows[499].cumulativeDamage, 500000)
})

test('攻撃数は有限の整数に制限し、無効な攻撃力や術耐性を計算機と同じように扱う', () => {
  for (const attackCount of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(buildGoldenglowAttackTrace({ model, effectiveAttack: 547, attackCount }), [])
  }
  assert.equal(buildGoldenglowAttackTrace({ model, effectiveAttack: 547, attackCount: 2.9 }).length, 2)
  assert.equal(
    buildGoldenglowAttackTrace({ model, effectiveAttack: 547, attackCount: 100000 }).length,
    GOLDENGLOW_ATTACK_TRACE_LIMIT,
  )
  const rows = buildGoldenglowAttackTrace({
    model,
    effectiveAttack: Number.NaN,
    enemyResistance: Number.NaN,
    attackCount: 2,
  })
  assert.deepEqual(rows.map((row) => row.expectedDamage), [0, 0])
})

test('1周期の各行は初回爆発まで到達する確率を含む寄与を返す', () => {
  const rows = buildGoldenglowCycleTrace({ model, effectiveAttack: 625 })

  assert.equal(rows.length, 41)
  assert.equal(rows[0].reachProbability, 1)
  assertClose(rows[0].expectedNormalDamage, 0.985 * 125)
  assertClose(rows[0].expectedExplosionDamage, 0.015 * 1875)
  assertClose(rows[1].reachProbability, 0.985)
  assertClose(rows[1].expectedNormalDamage, 0.985 * 0.97 * 218.75)
  assertClose(rows[1].expectedExplosionDamage, 0.985 * 0.03 * 1875)
  assertClose(rows[2].reachProbability, 0.985 * 0.97)
  assert.equal(rows[40].attackNumber, 41)
  assert.equal(rows[40].expectedNormalDamage, 0)
  assertClose(rows[40].expectedExplosionDamage, rows[40].reachProbability * 1875)
  assertClose(rows.reduce((sum, row) => sum + row.expectedExplosionDamage, 0), 1875)
  rows.forEach((row) => {
    assert.ok(row.reachProbability >= 0 && row.reachProbability <= 1)
    assertClose(row.expectedDamage, row.expectedNormalDamage + row.expectedExplosionDamage)
  })
})

for (const enemyResistance of [0, 40]) {
  test(`術耐性${enemyResistance}の周期合計からS2の平均爆発間隔・浮遊DPSを再現できる`, () => {
    const attackInterval = 1.3
    const rows = buildGoldenglowCycleTrace({ model, effectiveAttack: 625, enemyResistance })
    const total = rows[rows.length - 1]
    const expected = calculateGoldenglowExpectedDpsFromModel({
      model,
      effectiveAttack: 625,
      enemyResistance,
      skillIndex: 2,
      attackInterval,
      duration: 0,
    })
    assert.ok(expected)
    assertClose(
      rows.reduce((sum, row) => sum + row.reachProbability, 0),
      total.cumulativeExpectedAttacks,
    )
    assertClose(
      rows.reduce((sum, row) => sum + row.expectedDamage, 0),
      total.cumulativeExpectedDamage,
    )
    assertClose(total.cumulativeExpectedAttacks, expected.meanAttacksPerExplosion)
    assertClose(
      total.cumulativeExpectedDamage / (total.cumulativeExpectedAttacks * attackInterval),
      expected.perDrone.dps,
    )
  })
}

test('確定爆発で周期を終了し、次周期の通常攻撃を含めない', () => {
  const rows = buildGoldenglowCycleTrace({
    model: { ...model, prdStep: 0, prdMaxStack: 2 },
    effectiveAttack: 1000,
  })
  assert.deepEqual(rows.map((row) => row.reachProbability), [1, 1, 1])
  assert.equal(rows[2].cumulativeExpectedAttacks, 3)
  assertClose(rows[2].cumulativeExpectedDamage, 3550)
  const alwaysExplodes = buildGoldenglowCycleTrace({
    model: { ...model, prdStep: 1 },
    effectiveAttack: 1000,
  })
  assert.equal(alwaysExplodes.length, 1)
  assert.equal(alwaysExplodes[0].cumulativeExpectedAttacks, 1)
  assert.equal(alwaysExplodes[0].cumulativeExpectedDamage, 3000)
})

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)
}
