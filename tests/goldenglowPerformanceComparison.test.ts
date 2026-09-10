import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import { calculateDamageBreakdown } from '../src/lib/damageCalculator.ts'
import { buildGoldenglowCombinedAttackTable, summarizeGoldenglowCombinedAttackTable } from '../src/lib/goldenglowCombinedAttackTable.ts'
import { calculateGoldenglowExplosionDamage, GOLDENGLOW_OPERATOR_ID } from '../src/lib/goldenglowExplosion.ts'
import { deriveGoldenglowGuideSkills } from '../src/lib/goldenglowGuideSkill.ts'
import {
  buildGoldenglowPerformanceAtResistance,
  buildGoldenglowPerformanceComparison,
  buildGoldenglowPerformanceCurve,
  buildGoldenglowPerformanceComparisonTsv,
  buildGoldenglowResistanceValues,
  DEFAULT_GOLDENGLOW_RESISTANCE_STEP,
  type GoldenglowComparisonBuild,
} from '../src/lib/goldenglowPerformanceComparison.ts'
import type { OperatorCombatProfile, RawOperatorModule, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const builds: GoldenglowComparisonBuild[] = [
  { id: 'off', moduleId: '', moduleLevel: 3, potential: 1 },
  { id: 'x', moduleId: 'mod_x', moduleLevel: 3, potential: 1 },
  { id: 'y', moduleId: 'mod_y', moduleLevel: 3, potential: 1 },
]

test('潜在省略時の従来値を維持し、全スキル・全MOD・術耐性で爆発分析の合算表に一致する', () => {
  const records = createRecords()
  const before = structuredClone({ records, builds })
  assert.deepEqual(buildGoldenglowResistanceValues(), [0, 20, 40, 60, 80, 100])
  for (const skillIndex of [1, 2, 3]) {
    const columns = buildGoldenglowPerformanceComparison(records, builds, skillIndex)
    assert.deepEqual(columns.map((column) => column.build.id), ['off', 'x', 'y'])
    for (const column of columns) {
      const [legacy] = deriveGoldenglowGuideSkills(
        records.filter((record) => record.skillIndex === skillIndex), column.build.moduleId, column.build.moduleLevel,
      )
      assert.deepEqual(column.skill, legacy)
      assert.equal(column.values.length, 6)
      for (const value of column.values) {
        const explosionDamage = calculateDamageBreakdown(
          legacy.effectiveAttack * legacy.explosionModel.attackScalePercent / 100,
          'ARTS', 0, value.resistance, { resistanceIgnoreFixed: legacy.explosionModel.resistanceIgnoreFixed },
        ).result
        const rows = buildGoldenglowCombinedAttackTable({
          model: legacy.explosionModel,
          skillIndex,
          attack: legacy.effectiveAttack,
          attackInterval: legacy.attackInterval,
          duration: legacy.duration ?? 30,
          resistance: value.resistance,
          resistanceIgnore: legacy.explosionModel.resistanceIgnoreFixed,
          explosionDamage,
        })
        assertClose(value.expectedTotalDamage!, rows.at(-1)!.cumulativeExpectedTotalDamage)
        assertClose(value.expectedBodyDamage!, rows.reduce((sum, row) => sum + row.expectedBodyDamage, 0))
        assertClose(value.expectedDroneNormalDamage!, rows.reduce((sum, row) => sum + row.expectedDroneNormalDamage, 0))
        assertClose(value.expectedExplosionDamage!, rows.reduce((sum, row) => sum + row.expectedExplosionDamage, 0))
        assertClose(value.expectedBodyDamage! + value.expectedDroneNormalDamage! + value.expectedExplosionDamage!, value.expectedTotalDamage!)
        if (skillIndex === 3) assert.equal(value.expectedBodyDamage, 0)
        else assert.ok(value.expectedBodyDamage! > 0)
      }
    }
  }
  assert.deepEqual({ records, builds }, before)
})

test('S3の既知の総ダメージを維持し、本体23回分を加えない', () => {
  const [column] = buildGoldenglowPerformanceComparison(createRecords(), [builds[0]], 3)
  assert.equal(column.skill!.effectiveAttack, 703)
  assertClose(column.values[0].expectedTotalDamage!, 54978.577811492505)
  assertClose(column.values.at(-1)!.expectedTotalDamage!, 54978.577811492505 * 0.15)
})

test('潜在4の固定攻撃力と潜在5の素質強化を個別の比較列へ反映する', () => {
  const columns = buildGoldenglowPerformanceComparison(createRecords(), [1, 3, 4, 5, 6].map((potential) => ({
    ...builds[0], id: `potential-${potential}`, potential,
  })), 3)
  assert.deepEqual(columns.map((column) => column.skill!.attackCalculation.base.potentialAttack), [0, 0, 22, 22, 22])
  assert.deepEqual(columns.map((column) => column.skill!.effectiveAttack), [703, 703, 743, 743, 743])
  assert.deepEqual(columns.map((column) => column.skill!.explosionModel.attackScale), [3, 3, 3, 3.3, 3.3])
  assert.equal(columns[0].values[0].expectedTotalDamage, columns[1].values[0].expectedTotalDamage)
  assert.ok(columns[2].values[0].expectedTotalDamage! > columns[1].values[0].expectedTotalDamage!)
  assert.ok(columns[3].values[0].expectedTotalDamage! > columns[2].values[0].expectedTotalDamage!)
  assert.equal(columns[3].values[0].expectedTotalDamage, columns[4].values[0].expectedTotalDamage)
})

test('モジュールX＋潜在5はモジュールの潜在別候補と固定攻撃力を両方使う', () => {
  const columns = buildGoldenglowPerformanceComparison(createRecords(), [
    builds[1], { ...builds[1], id: 'x-potential-5', potential: 5 },
  ], 3)
  assert.deepEqual(columns.map((column) => column.skill!.explosionModel.attackScale), [3.6, 3.9])
  assert.deepEqual(columns.map((column) => column.skill!.effectiveAttack), [772, 811])
  assert.deepEqual(columns.map((column) => column.skill!.explosionModel.droneInitialAttackScale), [0.35, 0.35])
  assert.ok(columns[1].values[0].expectedTotalDamage! > columns[0].values[0].expectedTotalDamage!)
  assert.equal(columns[1].skill!.basePassives.talents[0].description, '潜在強化後の爆発')
  assert.equal(columns[1].skill!.passives.talents[0].description, 'モジュールと潜在強化後の爆発')
})

test('潜在強化とモジュールを組み合わせた全スキルで、内訳の和が既存の総ダメージと一致する', () => {
  const records = createRecords()
  for (const skillIndex of [1, 2, 3]) {
    const columns = buildGoldenglowPerformanceComparison(records, builds.map((build) => ({ ...build, potential: 5 })), skillIndex)
    for (const column of columns) {
      for (const value of column.values) {
        assertClose(value.expectedBodyDamage! + value.expectedDroneNormalDamage! + value.expectedExplosionDamage!, value.expectedTotalDamage!)
        assert.ok(value.expectedDroneNormalDamage! > 0)
        assert.ok(value.expectedExplosionDamage! > 0)
        if (skillIndex === 3) assert.equal(value.expectedBodyDamage, 0)
        else assert.ok(value.expectedBodyDamage! > 0)
      }
    }
  }
})

test('潜在の攻撃速度をモジュール・スキル攻撃速度と合わせ、潜在別のPRD・術耐性無視も引き継ぐ', () => {
  const records = createRecords()
  for (const record of records) {
    record.operatorProfile.potentialRanks![1] = {
      buff: { attributes: { attributeModifiers: [{ attributeType: 'ATTACK_SPEED', formulaItem: 'ADDITION', value: 5 }] } },
    }
    const talent = record.operatorProfile.talents![0].candidates![1]
    talent.blackboard!.find((entry) => entry.key === 'attack@prob')!.value = 0.02
    record.operatorProfile.talents![1].candidates!.push({
      ...structuredClone(record.operatorProfile.talents![1].candidates![0]), requiredPotentialRank: 4,
      blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 25 }],
    })
  }
  const [column] = buildGoldenglowPerformanceComparison(records, [{ ...builds[2], potential: 5 }], 1)
  assert.equal(column.skill!.operatorStats.attackSpeed, 112)
  assert.equal(column.skill!.attackInterval, 0.802)
  assert.equal(column.skill!.explosionModel.prdStep, 0.02)
  // The selected module overrides the base talent's resistance ignore.
  assert.equal(column.skill!.explosionModel.resistanceIgnoreFixed, 20)
  const [unequipped] = buildGoldenglowPerformanceComparison(records, [{ ...builds[0], potential: 5 }], 1, undefined, 30, 5)
  assert.equal(unequipped.skill!.explosionModel.resistanceIgnoreFixed, 25)
  assert.equal(unequipped.values[0].expectedTotalDamage, unequipped.values[5].expectedTotalDamage)
})

test('S2は指定した表示時間の攻撃だけを集計し、0秒は0、術耐性15までは貫通する', () => {
  const records = createRecords()
  const [short] = buildGoldenglowPerformanceComparison(records, [builds[0]], 2, undefined, 13, 5)
  assert.equal(Math.round(short.values[0].expectedTotalDamage! * 1000), 17809451)
  const [threeSeconds] = buildGoldenglowPerformanceComparison(records, [builds[0]], 2, undefined, 3)
  assertClose(threeSeconds.values[0].expectedTotalDamage!, 2088.6296875)
  for (const row of short.values.slice(0, 4)) assert.equal(row.expectedTotalDamage, short.values[0].expectedTotalDamage)
  assertClose(short.values[4].expectedTotalDamage!, short.values[0].expectedTotalDamage! * 0.95)
  const [zero] = buildGoldenglowPerformanceComparison(records, [builds[0]], 2, undefined, 0)
  for (const row of zero.values) assert.deepEqual(row, {
    resistance: row.resistance, expectedTotalDamage: 0, expectedBodyDamage: 0, expectedDroneNormalDamage: 0, expectedExplosionDamage: 0,
  })
  const [beforeFirstAttack] = buildGoldenglowPerformanceComparison(records, [builds[0]], 2, undefined, 1)
  assert.ok(beforeFirstAttack.values.every((row) => row.expectedTotalDamage === 0))
  const [s3] = buildGoldenglowPerformanceComparison(records, [builds[0]], 3, undefined, 0)
  assertClose(s3.values[0].expectedTotalDamage!, 54978.577811492505)
})

test('スキルレベルとモジュールレベルを列条件として適用し、入力を変更しない', () => {
  const records = createRecords()
  const [low] = buildGoldenglowPerformanceComparison(records, [{ ...builds[1], moduleLevel: 1 }], 3, 0)
  const [high] = buildGoldenglowPerformanceComparison(records, [builds[1]], 3, 9)
  assert.equal(low.skill!.skillLevelIndex, 0)
  assert.equal(low.skill!.moduleApplication.moduleLevel, 1)
  assert.equal(low.skill!.effectiveAttack, 578)
  assert.equal(low.skill!.duration, 20)
  assert.equal(high.skill!.effectiveAttack, 772)
  assert.ok(high.values[0].expectedTotalDamage! > low.values[0].expectedTotalDamage!)
})

test('不明なMOD・未取得のレベル・不正な潜在は未装備や潜在1に置き換えない', () => {
  const invalidBuilds: GoldenglowComparisonBuild[] = [
    { ...builds[0], moduleId: 'missing' },
    ...[0, 4, 1.5, NaN, Infinity].map((moduleLevel) => ({ ...builds[1], moduleLevel })),
    ...[0, 7, 1.5, NaN, Infinity].map((potential) => ({ ...builds[0], potential })),
  ]
  for (const column of buildGoldenglowPerformanceComparison(createRecords(), invalidBuilds, 3)) {
    assert.equal(column.skill, null)
    assert.equal(column.values.length, 6)
    for (const row of column.values) assert.deepEqual(row, {
      resistance: row.resistance, expectedTotalDamage: null, expectedBodyDamage: null, expectedDroneNormalDamage: null, expectedExplosionDamage: null,
    })
  }
  const missingLevel = createRecords()
  missingLevel[2].operatorProfile.modules![0].phases!.pop()
  assert.equal(buildGoldenglowPerformanceComparison(missingLevel, [builds[1]], 3)[0].skill, null)
  const locked = createRecords()
  locked[2].operatorProfile.modules![0].unlockLevel = 100
  assert.equal(buildGoldenglowPerformanceComparison(locked, [builds[1]], 3)[0].skill, null)
})

test('データ欠落・スキル選択不正・S2の不正時間を合計0として表示しない', () => {
  const records = createRecords()
  for (const skillIndex of [0, 4, 1.5, NaN]) {
    assert.ok(buildGoldenglowPerformanceComparison(records, builds, skillIndex).every((column) => column.skill === null))
  }
  assert.ok(buildGoldenglowPerformanceComparison([], builds, 3).every((column) => column.values.every((row) => row.expectedTotalDamage === null)))
  assert.ok(buildGoldenglowPerformanceComparison(records, builds, 3, 10).every((column) => column.skill === null))
  for (const duration of [-1, NaN, Infinity, 601]) {
    for (const column of buildGoldenglowPerformanceComparison(records, builds, 2, undefined, duration)) {
      for (const row of column.values) assert.deepEqual(row, {
        resistance: row.resistance, expectedTotalDamage: null, expectedBodyDamage: null, expectedDroneNormalDamage: null, expectedExplosionDamage: null,
      })
    }
  }
  const missingTalent = createRecords()
  missingTalent[2].operatorProfile.talents = []
  assert.ok(buildGoldenglowPerformanceComparison(missingTalent, builds, 3).every((column) => column.skill === null))
  assert.deepEqual(buildGoldenglowPerformanceComparison(records, [], 3), [])
})

test('術耐性の刻みは初期値20で、指定間隔と0・100の端点を保つ', () => {
  assert.equal(DEFAULT_GOLDENGLOW_RESISTANCE_STEP, 20)
  assert.deepEqual(buildGoldenglowResistanceValues(), [0, 20, 40, 60, 80, 100])
  assert.deepEqual(buildGoldenglowResistanceValues(25), [0, 25, 50, 75, 100])
  assert.deepEqual(buildGoldenglowResistanceValues(30), [0, 30, 60, 90, 100])
  assert.deepEqual(buildGoldenglowResistanceValues(1), Array.from({ length: 101 }, (_, index) => index))
  assert.deepEqual(buildGoldenglowResistanceValues(100), [0, 100])
  for (const invalid of [0, -1, 101, 0.1, 2.5, NaN, Infinity, -Infinity]) {
    assert.deepEqual(buildGoldenglowResistanceValues(invalid), buildGoldenglowResistanceValues())
  }
})

test('刻みを変えても共通の術耐性の結果は変わらず、無効な列を含め全列の縦軸が揃う', () => {
  const records = createRecords()
  const comparisonBuilds = [...builds, { ...builds[0], id: 'unavailable', moduleId: 'missing' }]
  const dense = buildGoldenglowPerformanceComparison(records, comparisonBuilds, 3, undefined, 30, 1)
  for (const step of [5, 10, 25, 30, 100, NaN]) {
    const columns = buildGoldenglowPerformanceComparison(records, comparisonBuilds, 3, undefined, 30, step)
    for (const [index, column] of columns.entries()) {
      assert.deepEqual(column.values.map((row) => row.resistance), buildGoldenglowResistanceValues(step))
      for (const row of column.values) {
        assert.equal(row.expectedTotalDamage, dense[index].values[row.resistance].expectedTotalDamage)
      }
    }
  }
})

test('単一の術耐性は刻みに丸めず、全スキル・MOD・潜在の各成分を算出する', () => {
  const records = createRecords()
  const comparisonBuilds = builds.flatMap((build) => [1, 4, 5].map((potential) => ({
    ...build, id: `${build.id}-${potential}`, potential,
  })))
  for (const skillIndex of [1, 2, 3]) {
    const dense = buildGoldenglowPerformanceComparison(records, comparisonBuilds, skillIndex, undefined, 30, 1)
    for (const resistance of [0, 37, 100]) {
      const columns = buildGoldenglowPerformanceAtResistance(records, comparisonBuilds, skillIndex, undefined, 30, resistance)
      assert.deepEqual(columns, dense.map((column) => ({ ...column, values: [column.values[resistance]] })))
    }
    const fractional = buildGoldenglowPerformanceAtResistance(records, comparisonBuilds, skillIndex, undefined, 30, 37.5)
    for (const column of fractional) {
      assert.equal(column.values.length, 1)
      assert.equal(column.values[0].resistance, 37.5)
      assertCurveMatchesCombinedTable(column, 37.5)
    }
  }
  assert.deepEqual(
    buildGoldenglowPerformanceAtResistance(records, builds, 3),
    buildGoldenglowPerformanceAtResistance(records, builds, 3, undefined, 30, 0),
  )
})

test('単一の術耐性は範囲外を拒否し、データ不足の列を指定した術耐性のnullとして残す', () => {
  const records = createRecords()
  for (const resistance of [-0.01, 100.01, NaN, Infinity, -Infinity]) {
    assert.deepEqual(buildGoldenglowPerformanceAtResistance(records, builds, 3, undefined, 30, resistance), [])
  }
  assert.deepEqual(buildGoldenglowPerformanceAtResistance(records, [], 3, undefined, 30, 37), [])
  const missingCases = [
    buildGoldenglowPerformanceAtResistance([], builds, 3, undefined, 30, 37),
    buildGoldenglowPerformanceAtResistance(records, [{ ...builds[0], moduleId: 'missing' }], 3, undefined, 30, 37),
    buildGoldenglowPerformanceAtResistance(records, builds, 4, undefined, 30, 37),
    buildGoldenglowPerformanceAtResistance(records, builds, 2, undefined, NaN, 37),
  ]
  for (const columns of missingCases) {
    assert.ok(columns.length > 0)
    for (const column of columns) {
      assert.deepEqual(column.values, [{
        resistance: 37, expectedTotalDamage: null, expectedBodyDamage: null,
        expectedDroneNormalDamage: null, expectedExplosionDamage: null,
      }])
    }
  }
  for (const column of buildGoldenglowPerformanceAtResistance(records, builds, 2, undefined, 0, 37)) {
    assert.deepEqual(column.values, [{
      resistance: 37, expectedTotalDamage: 0, expectedBodyDamage: 0,
      expectedDroneNormalDamage: 0, expectedExplosionDamage: 0,
    }])
  }
})

test('連続グラフはMODごとの折れ点を持ち、その間の小数術耐性でも既存の全ダメージ成分に一致する', () => {
  const records = createRecords()
  for (const skillIndex of [1, 2, 3]) {
    const columns = buildGoldenglowPerformanceCurve(records, builds, skillIndex)
    assert.deepEqual(columns.map((column) => column.values.map((value) => value.resistance)), [
      [0, 15, 100], [0, 15, 100], [0, 20, 100],
    ])
    for (const column of columns) {
      for (const resistance of [0, 7.25, 14.999, 15, 15.001, 17.75, 20, 20.001, 40.375, 99.75, 100]) {
        assertCurveMatchesCombinedTable(column, resistance)
      }
    }
  }
})

test('連続グラフは小数の術耐性無視と最低保証の折れ点を含め、範囲外の折れ点を重複させない', () => {
  const expectedAxes = [
    { ignore: 0, axis: [0, 95, 100] },
    { ignore: 2.5, axis: [0, 2.5, 97.5, 100] },
    { ignore: 100, axis: [0, 100] },
    { ignore: 150, axis: [0, 100] },
  ]
  for (const { ignore, axis } of expectedAxes) {
    const records = createRecords()
    for (const record of records) record.operatorProfile.talents![1].candidates![0].blackboard![0].value = ignore
    for (const skillIndex of [1, 2, 3]) {
      const [column] = buildGoldenglowPerformanceCurve(records, [{ ...builds[0], potential: 5 }], skillIndex)
      assert.deepEqual(column.values.map((value) => value.resistance), axis)
      for (const resistance of [0, 0.75, 2.499, 2.5, 2.501, 20.25, 94.999, 95, 95.001, 97.499, 97.5, 97.501, 99.5, 100]) {
        assertCurveMatchesCombinedTable(column, resistance)
      }
    }
  }
})

test('連続グラフの0秒は全成分0、不正な条件は端点だけのnullでNaNを含まない', () => {
  const records = createRecords()
  for (const column of buildGoldenglowPerformanceCurve(records, builds, 2, undefined, 0)) {
    for (const row of column.values) assert.deepEqual(row, {
      resistance: row.resistance, expectedTotalDamage: 0, expectedBodyDamage: 0, expectedDroneNormalDamage: 0, expectedExplosionDamage: 0,
    })
  }
  const invalidCases = [
    buildGoldenglowPerformanceCurve([], builds, 3),
    buildGoldenglowPerformanceCurve(records, [{ ...builds[0], moduleId: 'missing' }], 3),
    buildGoldenglowPerformanceCurve(records, builds, 4),
    buildGoldenglowPerformanceCurve(records, builds, 2, undefined, NaN),
    buildGoldenglowPerformanceCurve(records, builds, 2, undefined, -1),
    buildGoldenglowPerformanceCurve(records, builds, 2, undefined, Infinity),
  ]
  for (const columns of invalidCases) {
    for (const column of columns) {
      assert.deepEqual(column.values, [0, 100].map((resistance) => ({
        resistance, expectedTotalDamage: null, expectedBodyDamage: null, expectedDroneNormalDamage: null, expectedExplosionDamage: null,
      })))
    }
  }
})

test('表示中の列順・術耐性順でTSVを作り、欠測を空セル、ゼロを数値として保持する', () => {
  const columns = [
    { label: '未装備（潜在1）', values: [
      { resistance: 0, expectedTotalDamage: 54978.577811492505 },
      { resistance: 90, expectedTotalDamage: 0 },
      { resistance: 30, expectedTotalDamage: null },
      { resistance: 100, expectedTotalDamage: NaN },
    ] },
    { label: 'MOD X（Lv.3・潜在5）', values: [
      { resistance: 30, expectedTotalDamage: 1234.5 },
      { resistance: 0, expectedTotalDamage: 76543.21049 },
      { resistance: 100, expectedTotalDamage: Infinity },
      { resistance: 60, expectedTotalDamage: 999 },
    ] },
    { label: 'MOD Y（Lv.1・潜在6）', values: [
      { resistance: 0, expectedTotalDamage: 2000 },
      { resistance: 90, expectedTotalDamage: 0.00049 },
      { resistance: 30, expectedTotalDamage: 1.2345 },
      { resistance: 100, expectedTotalDamage: -Infinity },
    ] },
  ]
  const before = structuredClone(columns)
  assert.equal(buildGoldenglowPerformanceComparisonTsv(columns), [
    '敵の術耐性\t未装備（潜在1）\tMOD X（Lv.3・潜在5）\tMOD Y（Lv.1・潜在6）',
    '0\t=54978578/1000\t=7654321/100\t2000',
    '90\t0\t\t0',
    '30\t\t=12345/10\t=1235/1000',
    '100\t\t\t',
  ].join('\r\n'))
  assert.deepEqual(columns, before)
  assert.equal(buildGoldenglowPerformanceComparisonTsv(columns, true), buildGoldenglowPerformanceComparisonTsv(columns))
})

test('Excelが小数点を桁区切りと誤解釈しないよう、小数を整数の割り算でコピーする', () => {
  const values = [8246.787, 9770.324, 13588.75, 54978.577811492505, 0.015]
  const tsv = buildGoldenglowPerformanceComparisonTsv([{ label: 'MOD X（Lv.3・潜在5）', values: values.map((value, index) => ({
    resistance: index * 25, expectedTotalDamage: value,
  })) }])
  assert.equal(tsv, [
    '敵の術耐性\tMOD X（Lv.3・潜在5）',
    '0\t=8246787/1000',
    '25\t=9770324/1000',
    '50\t=1358875/100',
    '75\t=54978578/1000',
    '100\t=15/1000',
  ].join('\r\n'))
  const expected = [8246.787, 9770.324, 13588.75, 54978.578, 0.015]
  tsv.split('\r\n').slice(1).forEach((row, index) => {
    const expression = row.split('\t')[1]
    const parts = /^=(\d+)\/(10|100|1000)$/.exec(expression)
    assert.ok(parts)
    assert.equal(Number(parts[1]) / Number(parts[2]), expected[index])
  })
})

test('整数割り算は表示用の小数3桁丸めを保ち、負数・負の0・欠測を安全に出力する', () => {
  const cases: Array<{ value: number | null; text: string; rounded: number | null }> = [
    { value: 0.1, text: '=1/10', rounded: 0.1 },
    { value: 0.005, text: '=5/1000', rounded: 0.005 },
    { value: 0.0005, text: '=1/1000', rounded: 0.001 },
    { value: 1.23449, text: '=1234/1000', rounded: 1.234 },
    { value: 1.2345, text: '=1235/1000', rounded: 1.235 },
    { value: -1.2345, text: '=-1235/1000', rounded: -1.235 },
    { value: -0.015, text: '=-15/1000', rounded: -0.015 },
    { value: -0.00049, text: '0', rounded: 0 },
    { value: -0, text: '0', rounded: 0 },
    { value: 999.9995, text: '1000', rounded: 1000 },
    { value: null, text: '', rounded: null },
    { value: NaN, text: '', rounded: null },
    { value: Infinity, text: '', rounded: null },
    { value: -Infinity, text: '', rounded: null },
  ]
  const rows = buildGoldenglowPerformanceComparisonTsv([{ label: '結果', values: cases.map(({ value }, resistance) => ({
    resistance, expectedTotalDamage: value,
  })) }]).split('\r\n').slice(1)
  rows.forEach((row, index) => {
    const cell = row.split('\t')[1]
    assert.equal(cell, cases[index].text)
    if (cell.startsWith('=')) {
      const parts = /^=(-?[1-9]\d*)\/(10|100|1000)$/.exec(cell)
      assert.ok(parts)
      assert.equal(Number(parts[1]) / Number(parts[2]), cases[index].rounded)
    } else if (cell !== '') assert.equal(Number(cell), cases[index].rounded)
  })
})

test('小数非表示のTSVはダメージだけを直接整数に丸め、術耐性・欠測・見出し保護を維持する', () => {
  const cases: Array<{ value: number | null; text: string }> = [
    { value: 54978.577811492505, text: '54979' },
    { value: 0.4999, text: '0' },
    { value: 0.5, text: '1' },
    { value: -0.4999, text: '0' },
    { value: -0.5, text: '-1' },
    { value: -0, text: '0' },
    { value: 999.4999, text: '999' },
    { value: 999.5, text: '1000' },
    { value: null, text: '' },
    { value: NaN, text: '' },
    { value: Infinity, text: '' },
    { value: -Infinity, text: '' },
  ]
  const columns = [
    { label: '=結果\t一覧', values: cases.map(({ value }, index) => ({
      resistance: index === 0 ? 0.25 : index, expectedTotalDamage: value,
    })) },
    { label: '一部のみ', values: [{ resistance: 0.25, expectedTotalDamage: 1.5 }] },
  ]
  const before = structuredClone(columns)
  const decimalRows = buildGoldenglowPerformanceComparisonTsv(columns).split('\r\n')
  const rows = buildGoldenglowPerformanceComparisonTsv(columns, false).split('\r\n')
  assert.equal(rows[0], "敵の術耐性\t'=結果 一覧\t一部のみ")
  assert.equal(rows[1], '=25/100\t54979\t2')
  rows.slice(1).forEach((row, index) => {
    const [resistance, damage, optionalDamage] = row.split('\t')
    assert.equal(resistance, decimalRows[index + 1].split('\t')[0])
    assert.equal(damage, cases[index].text)
    assert.equal(optionalDamage, index === 0 ? '2' : '')
  })
  assert.deepEqual(columns, before)
})

test('TSVの見出しは1行だけで、制御文字や数式化するラベルを文字列として扱う', () => {
  const labels = ['MOD\tX\r\n潜在5', '=1+2', '+SUM(A1)', '-1+2', ' @test']
  const columns = labels.map((label) => ({ label, values: [{ resistance: 100, expectedTotalDamage: 0 }] }))
  const tsv = buildGoldenglowPerformanceComparisonTsv(columns)
  assert.equal(tsv, [
    "敵の術耐性\tMOD X 潜在5\t'=1+2\t'+SUM(A1)\t'-1+2\t' @test",
    '100\t0\t0\t0\t0\t0',
  ].join('\r\n'))
  assert.equal(buildGoldenglowPerformanceComparisonTsv([]), '')
  assert.equal(buildGoldenglowPerformanceComparisonTsv([{ label: '未装備（潜在1）', values: [] }]), '敵の術耐性\t未装備（潜在1）')
})

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `expected ${actual} to be close to ${expected}`)
}

function assertCurveMatchesCombinedTable(
  column: ReturnType<typeof buildGoldenglowPerformanceCurve>[number],
  resistance: number,
): void {
  const skill = column.skill!
  const duration = skill.duration ?? 30
  const rows = buildGoldenglowCombinedAttackTable({
    model: skill.explosionModel, skillIndex: skill.skillIndex, attack: skill.effectiveAttack,
    attackInterval: skill.attackInterval, duration, resistance,
    resistanceIgnore: skill.explosionModel.resistanceIgnoreFixed,
    explosionDamage: calculateGoldenglowExplosionDamage(skill.effectiveAttack, 0, resistance, skill.explosionModel).damageAfterMitigation,
  })
  const direct = summarizeGoldenglowCombinedAttackTable(rows, duration)
  const lower = column.values.findLast((value) => value.resistance <= resistance)!
  const upper = column.values.find((value) => value.resistance >= resistance)!
  const weight = lower === upper ? 0 : (resistance - lower.resistance) / (upper.resistance - lower.resistance)
  for (const key of ['expectedTotalDamage', 'expectedBodyDamage', 'expectedDroneNormalDamage', 'expectedExplosionDamage'] as const) {
    const interpolated = lower[key]! + (upper[key]! - lower[key]!) * weight
    assertClose(interpolated, direct[key])
  }
}

function createRecords(): SkillRecord[] {
  return [1, 2, 3].map((skillIndex) => {
    const level: RawSkillLevel = {
      name: `テストS${skillIndex}`,
      description: skillIndex === 2 ? '攻撃力+{atk:0%}、退場まで効果継続' : '攻撃力+{atk:0%}',
      duration: skillIndex === 1 ? 25 : skillIndex === 2 ? -1 : 30,
      durationType: 'NONE', skillType: 'MANUAL',
      blackboard: [
        { key: 'atk', value: skillIndex === 1 ? 0.4 : skillIndex === 2 ? 0.6 : 0.8 },
        { key: 'attack_speed', value: skillIndex === 1 ? 50 : 0 },
        { key: 'attack@cnt', value: skillIndex === 3 ? 2 : 1 },
      ],
    }
    const levels = Array.from({ length: 10 }, () => structuredClone(level))
    levels[0].blackboard![0].value = 0.4
    if (skillIndex === 3) levels[0].duration = 20
    return {
      id: `${GOLDENGLOW_OPERATOR_ID}:test_${skillIndex}`, operatorId: GOLDENGLOW_OPERATOR_ID,
      operatorName: 'ゴールデングロー', profession: 'CASTER', professionLabel: '術師',
      subProfessionId: 'funnel', subProfessionName: '操機術師', nameInitial: 'K_ROW', rarity: 6,
      skillIndex, skillId: `test_${skillIndex}`, skillName: level.name!, description: level.description!,
      duration: level.duration!, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
      initSp: 0, spCost: 30, classification: classifySkill(level), skillLevels: levels,
      operatorProfile: createProfile(), raw: level,
    }
  })
}

function createProfile(): OperatorCombatProfile {
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, {
      maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: 200, attackSpeed: 100, baseAttackTime: 1.3 } },
        { level: 90, data: { atk: 341, attackSpeed: 100, baseAttackTime: 1.3 } },
      ],
    }],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 100, data: { atk: 50 } }],
    potentialRanks: [{}, {}, {
      buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 22 }] } },
    }, {}, {}],
    talents: [
      { candidates: [3, 3.3].map((scale, index) => ({
        name: '爆発', description: index ? '潜在強化後の爆発' : 'スキル中10%の確率で爆発',
        unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: index * 4,
        blackboard: [
          { key: 'attack@atk_scale_2', value: scale },
          { key: 'attack@prob', value: 0.015 },
          { key: 'attack@max_stack_cnt', value: 40 },
        ],
      })) },
      { candidates: [{
        name: '術耐性無視', requiredPotentialRank: 0, unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 15 }],
      }] },
    ],
    modules: [createModule('x'), createModule('y')],
  }
}

function createModule(type: 'x' | 'y'): RawOperatorModule {
  return {
    uniEquipId: `mod_${type}`, uniEquipName: `MOD ${type.toUpperCase()}`, type: 'ADVANCED',
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: type === 'x' ? { atk: [22, 32, 38][index] }
        : { atk: [30, 40, 45][index], attack_speed: [5, 6, 7][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{
          blackboard: type === 'x'
            ? { init_atk_scale: 0.35, delta_atk_scale: 0.15, max_atk_scale: 1.1, max_stack_cnt: 5 }
            : { init_atk_scale: 0.2, delta_atk_scale: 0.15, max_atk_scale: 1.2, max_stack_cnt: 7 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: type === 'x' ? [
          { talentIndex: 0, requiredPotentialRank: 0, blackboard: { 'attack@atk_scale_2': [3, 3.4, 3.6][index] } },
          { talentIndex: 0, requiredPotentialRank: 4, upgradeDescription: 'モジュールと潜在強化後の爆発',
            blackboard: { 'attack@atk_scale_2': [3.3, 3.7, 3.9][index] } },
        ] : [{ talentIndex: 1, blackboard: { magic_resist_penetrate_fixed: [15, 18, 20][index] } }] } },
      ],
    })),
  }
}
