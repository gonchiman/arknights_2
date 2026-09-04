import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GOLDENGLOW_OPERATOR_ID,
  buildGoldenglowResistanceDamageRows,
  calculateGoldenglowExplosion,
  calculateGoldenglowExplosionDamage,
  calculateGoldenglowExpectedDps,
  calculateGoldenglowExpectedDpsFromModel,
  buildGoldenglowSkill3Output,
  deriveGoldenglowExplosionModel,
  getGoldenglowDroneAttackScalePercent,
  getGoldenglowNextExplosionChancePercent,
  isGoldenglowSkill3,
  type GoldenglowExplosionModel,
} from '../src/lib/goldenglowExplosion.ts'
import type { OperatorPassives, PassiveSource } from '../src/lib/operatorProfile.ts'
import type { RawSkillLevel } from '../src/types/skill.ts'

test('選択済み素質とスキルから爆発倍率・PRD・浮遊ユニット数を導出する', () => {
  const model = deriveGoldenglowExplosionModel(
    GOLDENGLOW_OPERATOR_ID,
    createPassives({ attackScale: 3, resistanceIgnore: 15 }),
    createSkillLevel(1),
  )

  assert.ok(model)
  assert.deepEqual(model, {
    talentName: '電流暴走',
    talentDescription: 'スキル発動中、浮遊ユニットが攻撃時10%の確率で自爆し、攻撃力の300%の術ダメージを与える',
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
  })
})

test('モジュール適用後の素質blackboardとS3の追加数をそのまま使う', () => {
  const model = deriveGoldenglowExplosionModel(
    GOLDENGLOW_OPERATOR_ID,
    createPassives({ attackScale: 3.6, resistanceIgnore: 20 }),
    createSkillLevel(2),
  )

  assert.ok(model)
  assert.equal(model.attackScalePercent, 360)
  assert.equal(model.activeDroneCount, 3)
  assert.equal(model.resistanceIgnoreFixed, 20)
})

test('追加浮遊ユニット数がないスキルでは基礎1体を使う', () => {
  const model = deriveGoldenglowExplosionModel(
    GOLDENGLOW_OPERATOR_ID,
    createPassives({ attackScale: 2, resistanceIgnore: null }),
    { blackboard: [] },
  )

  assert.ok(model)
  assert.equal(model.additionalDroneCount, 0)
  assert.equal(model.activeDroneCount, 1)
  assert.equal(model.resistanceIgnoreFixed, 0)
})

test('対象外オペレーター・未選択スキル・不完全な素質ではモデルを作らない', () => {
  const passives = createPassives({ attackScale: 3, resistanceIgnore: 15 })
  assert.equal(deriveGoldenglowExplosionModel('char_unknown', passives, createSkillLevel(1)), null)
  assert.equal(deriveGoldenglowExplosionModel(GOLDENGLOW_OPERATOR_ID, passives, null), null)

  const incomplete = createPassives({ attackScale: 3, resistanceIgnore: 15 })
  const explosion = incomplete.sources.find((source) => source.talentIndex === 0)
  assert.ok(explosion)
  explosion.blackboard = explosion.blackboard.filter((entry) => entry.key !== 'attack@prob')
  assert.equal(
    deriveGoldenglowExplosionModel(GOLDENGLOW_OPERATOR_ID, incomplete, createSkillLevel(1)),
    null,
  )
})

test('爆発倍率を掛けた後に術耐性固定無視を適用する', () => {
  const model = requireModel(createPassives({ attackScale: 3, resistanceIgnore: 15 }))
  const result = calculateGoldenglowExplosionDamage(1000, 9999, 20, model)

  assert.equal(result.rawExplosionDamage, 3000)
  assert.equal(result.breakdown.damageType, 'ARTS')
  assert.equal(result.breakdown.appliedDefense, 9999)
  assert.equal(result.breakdown.resistanceIgnoreFixed, 15)
  assert.equal(result.breakdown.appliedResistance, 5)
  assert.equal(result.damageAfterMitigation, 2850)
  assert.equal(result.breakdown.minimumApplied, false)
})

test('術耐性100かつ固定無視なしでは軽減前ダメージの5%を最低保証する', () => {
  const model = requireModel(createPassives({ attackScale: 3, resistanceIgnore: null }))
  const result = calculateGoldenglowExplosionDamage(1000, 0, 100, model)

  assert.equal(result.rawExplosionDamage, 3000)
  assert.equal(result.breakdown.afterResistance, 0)
  assert.equal(result.breakdown.minimumDamage, 150)
  assert.equal(result.breakdown.minimumApplied, true)
  assert.equal(result.damageAfterMitigation, 150)
})

test('術耐性別出力は標準点ごとに爆発単発と有限時間の期待値を再計算する', () => {
  const model = requireModel(createPassives({ attackScale: 3, resistanceIgnore: null }))
  const rows = buildGoldenglowResistanceDamageRows({
    model,
    skillIndex: 1,
    effectiveAttack: 1000,
    attackInterval: 1,
    duration: 10,
    enemyResistances: [0, 20, 40, 60, 80, 95, 100],
  })

  assert.deepEqual(
    rows.map((row) => row.enemyResistance),
    [0, 20, 40, 60, 80, 95, 100],
  )
  assertSequenceClose(
    rows.map((row) => row.explosionDamage),
    [3000, 2400, 1800, 1200, 600, 150, 150],
  )
  assert.deepEqual(
    rows.map((row) => row.minimumReached),
    [false, false, false, false, false, true, true],
  )

  rows.forEach((row) => {
    assert.notEqual(row.expectedDps, null)
    assert.notEqual(row.expectedTotalDamage, null)
    assertClose(row.expectedTotalDamage, (row.expectedDps ?? 0) * 10, 1e-9)
  })
  for (let index = 1; index < rows.length; index += 1) {
    assert.ok((rows[index]?.expectedDps ?? 0) <= (rows[index - 1]?.expectedDps ?? 0))
  }
})

test('S2の術耐性別出力は定常期待DPSだけを返す', () => {
  const model = requireModel(createPassives({ attackScale: 3, resistanceIgnore: 15 }))
  const rows = buildGoldenglowResistanceDamageRows({
    model,
    skillIndex: 2,
    effectiveAttack: 1000,
    attackInterval: 1,
    duration: 0,
    enemyResistances: [0, 100],
  })

  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.expectedDps !== null))
  assert.ok(rows.every((row) => row.expectedTotalDamage === null))
  assertClose(rows[0]?.explosionDamage ?? null, 3000)
  assertClose(rows[1]?.explosionDamage ?? null, 450)
})

test('一括APIはモデル導出と爆発1回の計算を結合する', () => {
  const result = calculateGoldenglowExplosion({
    operatorId: GOLDENGLOW_OPERATOR_ID,
    passives: createPassives({ attackScale: 3.4, resistanceIgnore: 15 }),
    skillLevel: createSkillLevel(1),
    effectiveAttack: 1200,
    enemyDefense: 5000,
    enemyResistance: 30,
  })

  assert.ok(result)
  assert.equal(result.model.attackScalePercent, 340)
  assert.equal(result.rawExplosionDamage, 4080)
  assert.equal(result.breakdown.appliedResistance, 15)
  assert.equal(result.damageAfterMitigation, 3468)
})

test('PRDの次回確率は40スタックまで増え、その攻撃も不発なら次回を確定にする', () => {
  const model = requireModel(createPassives({ attackScale: 3, resistanceIgnore: 15 }))

  assert.equal(getGoldenglowNextExplosionChancePercent(0, model), 1.5)
  assert.equal(getGoldenglowNextExplosionChancePercent(6, model), 10.5)
  assert.equal(getGoldenglowNextExplosionChancePercent(39, model), 60)
  assert.equal(getGoldenglowNextExplosionChancePercent(40, model), 100)
  assert.equal(getGoldenglowNextExplosionChancePercent(999, model), 100)
  assert.equal(getGoldenglowNextExplosionChancePercent(Number.NaN, model), 1.5)
})

test('特性blackboardから基礎・モジュールX・モジュールYの浮遊ユニット倍率列を導出する', () => {
  const base = requireModel(createPassives({ attackScale: 3, resistanceIgnore: 15 }))
  const moduleX = requireModel(createPassives({
    attackScale: 3.6,
    resistanceIgnore: 15,
    droneRamp: {
      initialScale: 0.35,
      scaleStep: 0.15,
      maximumScale: 1.1,
      maximumStack: 5,
    },
  }))
  const moduleY = requireModel(createPassives({
    attackScale: 3,
    resistanceIgnore: 20,
    droneRamp: {
      initialScale: 0.2,
      scaleStep: 0.15,
      maximumScale: 1.2,
      maximumStack: 7,
    },
  }))

  assertSequenceClose(readDroneScaleSequence(base, 8), [20, 35, 50, 65, 80, 95, 110, 110])
  assertSequenceClose(readDroneScaleSequence(moduleX, 7), [35, 50, 65, 80, 95, 110, 110])
  assertSequenceClose(readDroneScaleSequence(moduleY, 9), [20, 35, 50, 65, 80, 95, 110, 120, 120])
  assert.deepEqual(
    {
      initial: moduleX.droneInitialAttackScalePercent,
      step: moduleX.droneAttackScaleStepPercent,
      maximum: moduleX.droneMaxAttackScalePercent,
      stack: moduleX.droneMaxStack,
    },
    { initial: 35, step: 15, maximum: 110, stack: 5 },
  )
  assert.deepEqual(
    {
      initial: moduleY.droneInitialAttackScalePercent,
      step: moduleY.droneAttackScaleStepPercent,
      maximum: moduleY.droneMaxAttackScalePercent,
      stack: moduleY.droneMaxStack,
    },
    { initial: 20, step: 15, maximum: 120, stack: 7 },
  )
})

test('有限窓DPは爆発を通常攻撃への加算ではなく置換として1・2・10攻撃の期待値を求める', () => {
  const model = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: null }),
    0,
  )
  const cases = [
    {
      attacks: 1,
      expectedNormalDamage: 0.197,
      expectedExplosionDamage: 0.045,
      expectedTotalDamage: 0.242,
      expectedExplosionCount: 0.015,
    },
    {
      attacks: 2,
      expectedNormalDamage: 0.5343625,
      expectedExplosionDamage: 0.134325,
      expectedTotalDamage: 0.6686875,
      expectedExplosionCount: 0.044775,
    },
    {
      attacks: 10,
      expectedNormalDamage: 6.144928836915193,
      expectedExplosionDamage: 2.016972796160515,
      expectedTotalDamage: 8.161901633075708,
      expectedExplosionCount: 0.6723242653868384,
    },
  ]

  for (const expected of cases) {
    const result = calculateGoldenglowExpectedDpsFromModel({
      model,
      skillIndex: 1,
      effectiveAttack: 1,
      attackInterval: 1,
      duration: expected.attacks,
    })

    assert.ok(result)
    assert.equal(result.mode, 'FINITE_WINDOW')
    assert.equal(result.fullAttackCount, expected.attacks)
    assert.equal(result.fractionalAttackWeight, 0)
    assertClose(result.perDrone.expectedNormalDamage, expected.expectedNormalDamage)
    assertClose(result.perDrone.expectedExplosionDamage, expected.expectedExplosionDamage)
    assertClose(result.perDrone.expectedTotalDamage, expected.expectedTotalDamage)
    assertClose(result.perDrone.expectedExplosionCount, expected.expectedExplosionCount)
  }
})

test('S1は端数攻撃を位相平均し、2体の浮遊ユニットと本体を合算する', () => {
  const model = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: null }),
    1,
  )
  const result = calculateGoldenglowExpectedDpsFromModel({
    model,
    skillIndex: 1,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 1.5,
  })

  assert.ok(result)
  assert.equal(result.mode, 'FINITE_WINDOW')
  assert.equal(result.theoreticalAttackCount, 1.5)
  assert.equal(result.fullAttackCount, 1)
  assert.equal(result.fractionalAttackWeight, 0.5)
  assert.equal(result.model.activeDroneCount, 2)
  assertClose(result.perDrone.expectedTotalDamage, 0.45534375)
  assertClose(result.perDrone.expectedExplosionCount, 0.0298875)
  assertClose(result.allDrones.expectedTotalDamage, 0.9106875)
  assertClose(result.allDrones.expectedExplosionCount, 0.059775)
  assert.deepEqual(result.body, {
    active: true,
    damagePerAttack: 1,
    expectedTotalDamage: 1.5,
    dps: 1,
  })
  assertClose(result.combinedExpectedTotalDamage, 2.4106875)
  assertClose(result.expectedDps, 1.607125)
})

test('S2は無限総量ではなく定常DPSと平均爆発間隔を返す', () => {
  const result = calculateGoldenglowExpectedDps({
    operatorId: GOLDENGLOW_OPERATOR_ID,
    passives: createPassives({ attackScale: 3, resistanceIgnore: null }),
    skillLevel: createSkillLevel(1),
    skillIndex: 2,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 0,
  })

  assert.ok(result)
  assert.equal(result.mode, 'STEADY_STATE')
  assert.equal(result.duration, null)
  assert.equal(result.theoreticalAttackCount, null)
  assert.equal(result.fullAttackCount, null)
  assert.equal(result.fractionalAttackWeight, null)
  assertClose(result.meanAttacksPerExplosion, 9.91228936262148)
  assertClose(result.effectiveExplosionRatePercent, 10.0884867603939)
  assertClose(result.expectedExplosionsPerSecondPerDrone, 0.100884867603939)
  assert.equal(result.perDrone.expectedTotalDamage, null)
  assert.equal(result.perDrone.expectedExplosionCount, null)
  assertClose(result.perDrone.dps, 1.0008464358099474)
  assertClose(result.allDrones.dps, 2.001692871619895)
  assert.deepEqual(result.body, {
    active: true,
    damagePerAttack: 1,
    expectedTotalDamage: null,
    dps: 1,
  })
  assert.equal(result.combinedExpectedTotalDamage, null)
  assertClose(result.expectedDps, 3.001692871619895)
})

test('S3は本体攻撃を0にし、3体の浮遊ユニットだけを有限窓で合算する', () => {
  const model = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: null }),
    2,
  )
  const result = calculateGoldenglowExpectedDpsFromModel({
    model,
    skillIndex: 3,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 10,
  })

  assert.ok(result)
  assert.equal(result.mode, 'FINITE_WINDOW')
  assert.equal(result.model.activeDroneCount, 3)
  assert.deepEqual(result.body, {
    active: false,
    damagePerAttack: 1,
    expectedTotalDamage: 0,
    dps: 0,
  })
  assertClose(result.allDrones.expectedTotalDamage, 24.485704899227123)
  assertClose(result.allDrones.expectedExplosionCount, 2.016972796160515)
  assertClose(result.combinedExpectedTotalDamage, result.allDrones.expectedTotalDamage)
  assertClose(result.expectedDps, 2.4485704899227124)
})

test('S3固有出力は同一対象へ集中する浮遊ユニット1〜3体の期待値を返す', () => {
  const model = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: null }),
    2,
  )
  const expectation = calculateGoldenglowExpectedDpsFromModel({
    model,
    skillIndex: 3,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 10,
  })
  const output = buildGoldenglowSkill3Output(
    GOLDENGLOW_OPERATOR_ID,
    3,
    expectation,
  )

  assert.ok(expectation)
  assert.ok(output)
  assert.equal(output.duration, 10)
  assert.equal(output.activeDroneCount, 3)
  assert.equal(output.attackOpportunitiesPerDrone, 10)
  assert.deepEqual(output.rows.map((row) => row.droneCount), [1, 2, 3])

  const first = output.rows[0]
  const second = output.rows[1]
  const all = output.rows[2]
  assertClose(first.expectedNormalDamage, expectation.perDrone.expectedNormalDamage ?? 0)
  assertClose(first.expectedExplosionDamage, expectation.perDrone.expectedExplosionDamage ?? 0)
  assertClose(first.expectedTotalDamage, expectation.perDrone.expectedTotalDamage ?? 0)
  assertClose(first.expectedDps, expectation.perDrone.dps)
  assertClose(first.expectedExplosionCount, expectation.perDrone.expectedExplosionCount ?? 0)
  assertClose(second.expectedNormalDamage, (expectation.perDrone.expectedNormalDamage ?? 0) * 2)
  assertClose(second.expectedExplosionDamage, (expectation.perDrone.expectedExplosionDamage ?? 0) * 2)
  assertClose(second.expectedTotalDamage, (expectation.perDrone.expectedTotalDamage ?? 0) * 2)
  assertClose(second.expectedDps, expectation.perDrone.dps * 2)
  assertClose(second.expectedExplosionCount, (expectation.perDrone.expectedExplosionCount ?? 0) * 2)
  assertClose(all.expectedNormalDamage, expectation.allDrones.expectedNormalDamage ?? 0)
  assertClose(all.expectedExplosionDamage, expectation.allDrones.expectedExplosionDamage ?? 0)
  assertClose(all.expectedTotalDamage, expectation.allDrones.expectedTotalDamage ?? 0)
  assertClose(all.expectedDps, expectation.expectedDps)
  assertClose(all.expectedExplosionCount, expectation.allDrones.expectedExplosionCount ?? 0)
})

test('S3固有出力はゴールデングローS3の有限期待値だけを受け付ける', () => {
  const model = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: null }),
    2,
  )
  const s3 = calculateGoldenglowExpectedDpsFromModel({
    model,
    skillIndex: 3,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 10,
  })
  const steady = calculateGoldenglowExpectedDpsFromModel({
    model,
    skillIndex: 2,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 0,
  })

  assert.equal(buildGoldenglowSkill3Output('char_unknown', 3, s3), null)
  assert.equal(buildGoldenglowSkill3Output(GOLDENGLOW_OPERATOR_ID, 1, s3), null)
  assert.equal(buildGoldenglowSkill3Output(GOLDENGLOW_OPERATOR_ID, 3, steady), null)
  assert.equal(buildGoldenglowSkill3Output(GOLDENGLOW_OPERATOR_ID, 3, null), null)
  assert.equal(isGoldenglowSkill3(GOLDENGLOW_OPERATOR_ID, 3), true)
  assert.equal(isGoldenglowSkill3(GOLDENGLOW_OPERATOR_ID, 3.5), false)
  assert.equal(isGoldenglowSkill3(GOLDENGLOW_OPERATOR_ID, 2), false)
  assert.equal(isGoldenglowSkill3('char_unknown', 3), false)
})

test('本体・通常浮遊・爆発へ術耐性固定無視と最低保証をそれぞれ適用する', () => {
  const ignoreModel = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: 15 }),
    0,
  )
  const ignored = calculateGoldenglowExpectedDpsFromModel({
    model: ignoreModel,
    skillIndex: 1,
    effectiveAttack: 1000,
    attackInterval: 1,
    duration: 1,
    enemyResistance: 20,
  })

  assert.ok(ignored)
  assert.equal(ignored.body.damagePerAttack, 950)
  assertClose(ignored.perDrone.expectedNormalDamage, 187.15)
  assertClose(ignored.perDrone.expectedExplosionDamage, 42.75)
  assertClose(ignored.expectedDps, 1179.9)

  const noIgnoreModel = requireModel(
    createPassives({ attackScale: 3, resistanceIgnore: null }),
    0,
  )
  const minimum = calculateGoldenglowExpectedDpsFromModel({
    model: noIgnoreModel,
    skillIndex: 1,
    effectiveAttack: 1000,
    attackInterval: 1,
    duration: 1,
    enemyResistance: 100,
  })

  assert.ok(minimum)
  assert.equal(minimum.body.damagePerAttack, 50)
  assertClose(minimum.perDrone.expectedNormalDamage, 9.85)
  assertClose(minimum.perDrone.expectedExplosionDamage, 2.25)
  assertClose(minimum.expectedDps, 62.1)
})

test('モジュールX3・Y3のランプと爆発倍率を定常期待DPSに反映する', () => {
  const moduleX = requireModel(createPassives({
    attackScale: 3.6,
    resistanceIgnore: null,
    droneRamp: {
      initialScale: 0.35,
      scaleStep: 0.15,
      maximumScale: 1.1,
      maximumStack: 5,
    },
  }), 0)
  const moduleY = requireModel(createPassives({
    attackScale: 3,
    resistanceIgnore: null,
    droneRamp: {
      initialScale: 0.2,
      scaleStep: 0.15,
      maximumScale: 1.2,
      maximumStack: 7,
    },
  }), 0)
  const xResult = calculateGoldenglowExpectedDpsFromModel({
    model: moduleX,
    skillIndex: 2,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 0,
  })
  const yResult = calculateGoldenglowExpectedDpsFromModel({
    model: moduleY,
    skillIndex: 2,
    effectiveAttack: 1,
    attackInterval: 1,
    duration: 0,
  })

  assert.ok(xResult)
  assert.ok(yResult)
  assertClose(xResult.perDrone.dps, 1.1404605028726866)
  assertClose(yResult.perDrone.dps, 1.0315169955173027)
})

function requireModel(
  passives: OperatorPassives,
  additionalDroneCount = 1,
): GoldenglowExplosionModel {
  const model = deriveGoldenglowExplosionModel(
    GOLDENGLOW_OPERATOR_ID,
    passives,
    createSkillLevel(additionalDroneCount),
  )
  assert.ok(model)
  return model
}

function readDroneScaleSequence(model: GoldenglowExplosionModel, length: number): number[] {
  return Array.from(
    { length },
    (_, index) => getGoldenglowDroneAttackScalePercent(index + 1, model),
  )
}

function assertClose(
  actual: number | null,
  expected: number,
  tolerance = 1e-12,
): void {
  assert.notEqual(actual, null)
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${String(actual)} to be within ${tolerance} of ${expected}`,
  )
}

function assertSequenceClose(actual: number[], expected: number[]): void {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => assertClose(value, expected[index]))
}

function createSkillLevel(additionalDroneCount: number): RawSkillLevel {
  return {
    name: 'テストスキル',
    blackboard: [{ key: 'attack@cnt', value: additionalDroneCount }],
  }
}

function createPassives({
  attackScale,
  resistanceIgnore,
  droneRamp,
}: {
  attackScale: number
  resistanceIgnore: number | null
  droneRamp?: {
    initialScale: number
    scaleStep: number
    maximumScale: number
    maximumStack: number
  }
}): OperatorPassives {
  const explosionTalent: PassiveSource = {
    sourceKind: 'TALENT',
    sourceName: '電流暴走',
    talentIndex: 0,
    description: 'スキル発動中、浮遊ユニットが攻撃時10%の確率で自爆し、攻撃力の300%の術ダメージを与える',
    blackboard: [
      { key: 'attack@prob', value: 0.015 },
      { key: 'attack@atk_scale_2', value: attackScale },
      { key: 'attack@max_stack_cnt', value: 40 },
    ],
    requiredPotentialRank: 0,
    prefabKey: '1',
    tokenKey: null,
  }
  const sources: PassiveSource[] = []

  if (droneRamp) {
    sources.push({
      sourceKind: 'TRAIT',
      sourceName: '特性',
      talentIndex: null,
      description: '浮遊ユニットを操作して敵に術ダメージを与える',
      blackboard: [
        { key: 'init_atk_scale', value: droneRamp.initialScale },
        { key: 'delta_atk_scale', value: droneRamp.scaleStep },
        { key: 'max_atk_scale', value: droneRamp.maximumScale },
        { key: 'max_stack_cnt', value: droneRamp.maximumStack },
      ],
      requiredPotentialRank: 0,
      prefabKey: 'trait',
      tokenKey: null,
    })
  }

  sources.push(explosionTalent)

  if (resistanceIgnore !== null) {
    sources.push({
      sourceKind: 'TALENT',
      sourceName: '精密誘電',
      talentIndex: 1,
      description: `自身と浮遊ユニットの攻撃時、敵の術耐性を${resistanceIgnore}無視`,
      blackboard: [{ key: 'magic_resist_penetrate_fixed', value: resistanceIgnore }],
      requiredPotentialRank: 0,
      prefabKey: '2',
      tokenKey: null,
    })
  }

  return {
    traitDescription: '浮遊ユニットを操作して敵に術ダメージを与える',
    talents: sources.map((source) => ({
      name: source.sourceName,
      description: source.description,
    })),
    sources,
  }
}
