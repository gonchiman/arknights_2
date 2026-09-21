import test from 'node:test'
import assert from 'node:assert/strict'
import { simulateGoldenglowTargetSwitch } from '../src/lib/goldenglowTargetSwitch.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS,
  simulateGoldenglowTargetSwitchGrid,
  type GoldenglowTargetSwitchGridRow,
} from '../src/lib/goldenglowTargetSwitchGrid.ts'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'

type GridInput = Parameters<typeof simulateGoldenglowTargetSwitchGrid>[0]

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走',
  talentDescription: '',
  damageType: 'ARTS',
  attackScale: 3,
  attackScalePercent: 300,
  nominalChancePercent: 10,
  prdStep: 0.015,
  prdMaxStack: 40,
  additionalDroneCount: 0,
  activeDroneCount: 3,
  resistanceIgnoreFixed: 15,
  droneInitialAttackScale: 0.2,
  droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15,
  droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1,
  droneMaxAttackScalePercent: 110,
  droneMaxStack: 6,
}

function input(overrides: Partial<GridInput> = {}): GridInput {
  return {
    model,
    skillIndex: 3,
    effectiveAttack: 703,
    attackInterval: 1.3,
    duration: 30,
    enemyHps: [500, 5_000, 100_000],
    enemyResistances: [0, 30, 100],
    enemyDefense: 0,
    switchDelay: 0,
    trials: 40,
    seed: 42,
    ...overrides,
  }
}

function close(actual: number, expected: number, label: string): void {
  assert.ok(Number.isFinite(actual), `${label}: result must be finite`)
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    `${label}: expected ${expected}, received ${actual}`)
}

function checkAgainstSingleCells(setup: GridInput): ReturnType<typeof simulateGoldenglowTargetSwitchGrid> {
  const result = simulateGoldenglowTargetSwitchGrid(setup)
  assert.equal(result.trials, setup.trials)
  assert.equal(result.seed, setup.seed)
  assert.equal(result.duration, setup.duration)
  assert.deepEqual(result.rows.map((row) => row.enemyResistance), setup.enemyResistances)
  const { enemyHps, enemyResistances, ...shared } = setup
  result.rows.forEach((row, rowIndex) => {
    assert.equal(row.expectedDamages.length, enemyHps.length)
    assert.equal(row.damageBreakdowns.length, enemyHps.length)
    row.expectedDamages.forEach((actual, columnIndex) => {
      const expected = simulateGoldenglowTargetSwitch({
        ...shared,
        enemyHp: enemyHps[columnIndex],
        enemyResistance: enemyResistances[rowIndex],
      }).mean
      const label = `S${setup.skillIndex}, HP ${enemyHps[columnIndex]}, RES ${row.enemyResistance}`
      close(actual, expected.rawDamage, label)
      const breakdown = row.damageBreakdowns[columnIndex]
      for (const component of ['normalDamage', 'explosionDamage', 'bodyDamage'] as const) {
        close(breakdown[component], expected[component], `${label}, ${component}`)
        assert.ok(breakdown[component] >= 0)
      }
      close(breakdown.normalDamage + breakdown.explosionDamage + breakdown.bodyDamage, actual, `${label}, total`)
    })
  })
  return result
}

test('表の各セルはS1・S2・S3とモジュール相当の倍率・速度・耐性無視で単独計算の総ダメージに一致する', () => {
  const variants: Partial<GridInput>[] = [
    { skillIndex: 1, model: { ...model, activeDroneCount: 2 }, attackInterval: 1.3 / 1.7 },
    {
      skillIndex: 2,
      model: {
        ...model, activeDroneCount: 2, droneInitialAttackScale: 0.35,
        droneInitialAttackScalePercent: 35, droneMaxAttackScale: 1.25,
        droneMaxAttackScalePercent: 125, attackScale: 3.5, attackScalePercent: 350,
      },
      effectiveAttack: 912.75, attackInterval: 1.3 / 1.08,
    },
    {
      skillIndex: 3,
      model: {
        ...model, resistanceIgnoreFixed: 25, droneMaxAttackScale: 1.4,
        droneMaxAttackScalePercent: 140, droneMaxStack: 8,
      },
      effectiveAttack: 821.25, attackInterval: 1.3 / 1.1,
    },
  ]
  for (const retargetRemainingDrones of [false, true]) {
    variants.forEach((variant) => checkAgainstSingleCells(input({ ...variant, retargetRemainingDrones })))
  }
})

test('切り替え待ちがある場合もHPごとの撃破時刻と抽選回数を単独計算と揃える', () => {
  for (const retargetRemainingDrones of [false, true]) {
    for (const switchDelay of [0.15, 5]) {
      checkAgainstSingleCells(input({
        model: { ...model, prdStep: 0.2 },
        skillIndex: 1, switchDelay, enemyHps: [1, 601.7, 1_000_000],
        attackInterval: 0.867, duration: 12.35, retargetRemainingDrones,
      }))
    }
  }
})

test('個別切り替えでは計測終了までに着弾した浮遊だけを数え、次周期にも時刻のずれを保つ', () => {
  const boundaries = [
    [1, 20], [1.249999, 20], [1.25, 40], [1.499999, 40],
    [1.5, 60], [1.999999, 60], [2, 80], [2.25, 100], [2.5, 120],
  ]
  for (const [duration, expectedDamage] of boundaries) {
    const result = checkAgainstSingleCells(input({
      model: { ...model, prdStep: 0, prdMaxStack: 1_000, resistanceIgnoreFixed: 0 },
      effectiveAttack: 100, attackInterval: 1, duration, switchDelay: 0.25,
      enemyHps: [20, 1_000_000], enemyResistances: [0], trials: 1,
      retargetRemainingDrones: true,
    }))
    assert.equal(result.rows[0].expectedDamages[0], expectedDamage, `duration ${duration}`)
    assert.equal(result.rows[0].expectedDamages[1], duration < 2 ? 60 : 165)
  }
})

test('本体撃破で未着弾の浮遊が終了時刻を越えたセルは本体だけのダメージを返す', () => {
  for (const skillIndex of [1, 2]) {
    for (const [duration, expectedDamage] of [[1.249999, 100], [1.25, 160], [2, 260]]) {
      const result = checkAgainstSingleCells(input({
        model: { ...model, prdStep: 0, prdMaxStack: 1_000, resistanceIgnoreFixed: 0 },
        skillIndex, effectiveAttack: 100, attackInterval: 1, duration, switchDelay: 0.25,
        enemyHps: [80, 1_000_000], enemyResistances: [0], trials: 1,
        retargetRemainingDrones: true,
      }))
      assert.equal(result.rows[0].expectedDamages[0], expectedDamage, `S${skillIndex}, duration ${duration}`)
    }
  }
})

test('撃破のない個別切り替えセルは待ち時間を変えても同一シードの出力が変わらない', () => {
  for (const skillIndex of [1, 2, 3]) {
    const setup = input({
      skillIndex, enemyHps: [1_000_000, 1_000_000_000], retargetRemainingDrones: true,
    })
    const withoutDelay = checkAgainstSingleCells(setup)
    for (const switchDelay of [0.15, 5]) {
      assert.deepEqual(checkAgainstSingleCells({ ...setup, switchDelay }), withoutDelay)
    }
  }
})

test('1試行でもHPで制限する前の総ダメージを返し、余剰ダメージを切り捨てない', () => {
  const result = checkAgainstSingleCells(input({
    model: { ...model, activeDroneCount: 1, prdStep: 1, resistanceIgnoreFixed: 0 },
    skillIndex: 1, effectiveAttack: 100, attackInterval: 1, duration: 2,
    enemyHps: [1, 1_000], enemyResistances: [0, 100], trials: 1,
  }))
  assert.deepEqual(result.rows.map((row) => row.expectedDamages), [[800, 800], [40, 40]])
})

test('攻撃力0・攻撃できない時間窓・初撃と終撃の丸め境界を単独計算と揃える', () => {
  for (const retargetRemainingDrones of [false, true]) {
    const zero = checkAgainstSingleCells(input({
      effectiveAttack: 0, enemyHps: [Number.MIN_VALUE, 500], retargetRemainingDrones,
    }))
    assert.ok(zero.rows.every((row) => row.expectedDamages.every((damage) => damage === 0)))
    for (const duration of [0.05, 0.1 - 1e-15, 0.1, 0.299999, 0.3]) {
      checkAgainstSingleCells(input({
        model: { ...model, prdStep: 0, prdMaxStack: 1_000 },
        attackInterval: 0.1, duration, enemyHps: [10, 1_000], enemyResistances: [0], trials: 1,
        retargetRemainingDrones,
      }))
    }
  }
})

test('小数HPの同値撃破と実際の不足を区別し、撃破後の通常倍率を正しく初期化する', () => {
  for (const retargetRemainingDrones of [false, true]) {
    for (const scale of [1e-6, 1, 1_000]) {
      const result = checkAgainstSingleCells(input({
        model: { ...model, activeDroneCount: 2, prdStep: 0, prdMaxStack: 1_000, resistanceIgnoreFixed: 0 },
        effectiveAttack: 547 * scale, attackInterval: 1, duration: 3,
        enemyHps: [601.7 * scale, (601.7 + 1e-10) * scale], enemyResistances: [0, 37.5], trials: 1,
        retargetRemainingDrones,
      }))
      assert.ok(result.rows[0].expectedDamages[0] < result.rows[0].expectedDamages[1])
    }
  }
})

test('最大16浮遊の最上位ビットを含む爆発と通常攻撃を欠落させない', () => {
  for (const retargetRemainingDrones of [false, true]) {
    for (const prdStep of [0.15, 1]) {
      checkAgainstSingleCells(input({
        model: { ...model, activeDroneCount: 16, prdStep },
        duration: 8, enemyHps: [100, 100_000], enemyResistances: [0, 80], trials: 12,
        retargetRemainingDrones,
      }))
    }
  }
})

test('同一シードの結果を再現し、入力配列・モデル・設定を変更しない', () => {
  for (const retargetRemainingDrones of [false, true]) {
    const setup = input({ model: { ...model, prdStep: 0.2 }, switchDelay: 0.15, retargetRemainingDrones, trials: 31 })
    const original = structuredClone(setup)
    Object.freeze(setup.enemyHps)
    Object.freeze(setup.enemyResistances)
    Object.freeze(setup.model)
    Object.freeze(setup)
    const result = simulateGoldenglowTargetSwitchGrid(setup)
    assert.deepEqual(simulateGoldenglowTargetSwitchGrid(setup), result)
    assert.deepEqual(setup, original)
    assert.notDeepEqual(simulateGoldenglowTargetSwitchGrid({ ...setup, seed: setup.seed + 1 }).rows, result.rows)
  }
})

test('行の進捗通知は入力順に1回ずつ届き、同じ実効術耐性の行も省略しない', () => {
  const setup = input({
    enemyHps: [5_000, 500, 5_000], enemyResistances: [50, 15, 0, 5, 15, 100], trials: 20,
  })
  const notifications: (GoldenglowTargetSwitchGridRow & { completed: number; total: number })[] = []
  const result = simulateGoldenglowTargetSwitchGrid(setup, (row, completedRows, totalRows) => {
    notifications.push({
      ...structuredClone(row), completed: completedRows, total: totalRows,
    })
  })
  assert.deepEqual(notifications, result.rows.map((row, index) => ({
    ...row, completed: index + 1, total: setup.enemyResistances.length,
  })))
  for (const rowIndex of [2, 3, 4]) {
    assert.deepEqual(result.rows[rowIndex].expectedDamages, result.rows[1].expectedDamages)
  }
  for (const row of result.rows) assert.equal(row.expectedDamages[0], row.expectedDamages[2])
  assert.deepEqual(result, checkAgainstSingleCells(setup))
})

test('空配列・非有限値・範囲外のHPと術耐性・不正な共通設定を計算前に拒否する', () => {
  const invalid: Partial<GridInput>[] = [
    { enemyHps: [] }, { enemyResistances: [] },
    { enemyHps: [500, 0] }, { enemyHps: [-1] }, { enemyHps: [NaN] },
    { enemyHps: [Infinity] }, { enemyHps: [1_000_000_001] },
    { enemyResistances: [-1] }, { enemyResistances: [101] },
    { enemyResistances: [NaN] }, { enemyResistances: [0, Infinity] },
    { trials: 0 }, { trials: 1.5 }, { seed: -1 }, { effectiveAttack: NaN },
    { duration: 0 }, { attackInterval: 0 }, { switchDelay: -1 },
    { model: { ...model, activeDroneCount: 17 } },
  ]
  for (const override of invalid) {
    let notified = false
    assert.throws(() => simulateGoldenglowTargetSwitchGrid(input(override), () => { notified = true }), RangeError)
    assert.equal(notified, false, 'invalid input must not publish partial results')
  }
})

test('列数・行数・セル数・抽選列の容量・単一条件と表全体の計算量上限を計算前に検証する', () => {
  const limits = GOLDENGLOW_TARGET_SWITCH_GRID_LIMITS
  const hpColumns = Array.from({ length: limits.maxHpColumns }, (_, index) => (index + 1) * 100)
  const invalid: Partial<GridInput>[] = [
    { enemyHps: [...hpColumns, 1_000_000], enemyResistances: [0] },
    { enemyHps: [100], enemyResistances: Array.from({ length: limits.maxResistanceRows + 1 }, () => 0) },
    {
      enemyHps: hpColumns,
      enemyResistances: Array.from({ length: Math.floor(limits.maxCells / hpColumns.length) + 1 }, (_, index) => index),
    },
    {
      duration: 300, attackInterval: 0.05, trials: 20_000,
      enemyHps: [100], enemyResistances: [0],
    },
    {
      model: { ...model, activeDroneCount: 1 },
      duration: 300, attackInterval: 0.05, trials: 1_000,
      enemyHps: [100], enemyResistances: [0],
    },
    {
      model: { ...model, activeDroneCount: 16, resistanceIgnoreFixed: 0 },
      duration: 300, attackInterval: 0.05, trials: 100,
      enemyHps: hpColumns, enemyResistances: Array.from({ length: 10 }, (_, index) => index * 10),
    },
  ]
  for (const override of invalid) {
    let notified = false
    assert.throws(() => simulateGoldenglowTargetSwitchGrid(input(override), () => { notified = true }), RangeError)
    assert.equal(notified, false, 'excessive work must be rejected before rows are calculated')
  }
})

test('即時切り替えの有無を省略した表は無効指定と一致し、有効指定では撃破後の倍率低下を反映する', () => {
  const setup = input({
    model: { ...model, prdStep: 0, prdMaxStack: 1_000, resistanceIgnoreFixed: 0 },
    effectiveAttack: 100, attackInterval: 1, duration: 2,
    enemyHps: [80, 1_000_000], enemyResistances: [0], trials: 1,
  })
  const defaultResult = simulateGoldenglowTargetSwitchGrid(setup)
  assert.deepEqual(simulateGoldenglowTargetSwitchGrid({ ...setup, retargetRemainingDrones: false }), defaultResult)
  assert.deepEqual(defaultResult.rows[0].expectedDamages, [165, 165])
  const enabled = checkAgainstSingleCells({ ...setup, retargetRemainingDrones: true })
  assert.deepEqual(enabled.rows[0].expectedDamages, [135, 165])
})

test('即時切り替えでも重複HP・実効耐性の等しい行・入力順の進捗通知を保つ', () => {
  const setup = input({
    enemyHps: [80, 5_000, 80], enemyResistances: [50, 15, 0, 5, 15, 100],
    effectiveAttack: 100, attackInterval: 0.3, duration: 4.5, switchDelay: 0.15,
    retargetRemainingDrones: true, trials: 17,
  })
  const notifications: (GoldenglowTargetSwitchGridRow & { completed: number; total: number })[] = []
  const result = simulateGoldenglowTargetSwitchGrid(setup, (row, completed, total) => {
    notifications.push({ ...structuredClone(row), completed, total })
  })
  assert.deepEqual(notifications, result.rows.map((row, index) => ({
    ...row, completed: index + 1, total: setup.enemyResistances.length,
  })))
  for (const rowIndex of [2, 3, 4]) {
    assert.deepEqual(result.rows[rowIndex].expectedDamages, result.rows[1].expectedDamages)
  }
  for (const row of result.rows) assert.equal(row.expectedDamages[0], row.expectedDamages[2])
  assert.deepEqual(result, checkAgainstSingleCells(setup))
})

test('小数の独自倍率・爆発ダメージ・時間・耐性を使う即時切り替えでも単独計算と一致する', () => {
  for (const skillIndex of [1, 2, 3]) {
    for (const switchDelay of [0, 0.137]) {
      checkAgainstSingleCells(input({
        model: {
          ...model, activeDroneCount: 5, prdStep: 0.13, prdMaxStack: 7,
          attackScale: 2.731, attackScalePercent: 273.1,
          droneInitialAttackScale: 0.217, droneInitialAttackScalePercent: 21.7,
          droneAttackScaleStep: 0.137, droneAttackScaleStepPercent: 13.7,
          droneMaxAttackScale: 1.317, droneMaxAttackScalePercent: 131.7, droneMaxStack: 9,
          resistanceIgnoreFixed: 13.7,
        },
        skillIndex, effectiveAttack: 703.217, attackInterval: 0.867, duration: 14.781,
        enemyHps: [Number.MIN_VALUE, 121.631, 703.217, 5_000.000000001, 1_000_000],
        enemyResistances: [0, 37.217, 99.9], switchDelay, retargetRemainingDrones: true,
        trials: 19, seed: 20260911,
      }))
    }
  }
})

test('即時切り替えに不正な真偽値を渡した表は進捗を出さずに拒否する', () => {
  for (const value of [null, 0, 1, 'false', 'true', {}, []]) {
    let notified = false
    assert.throws(() => simulateGoldenglowTargetSwitchGrid(input({
      retargetRemainingDrones: value as unknown as boolean,
    }), () => { notified = true }), RangeError)
    assert.equal(notified, false)
  }
})

test('内訳追加前の同一シードの総量を丸めまで完全に保つ', () => {
  // Captured before adding component aggregation; keep total accumulation independent.
  const expected = [
    [
      [32288.79, 43158.927500000005, 70663.80249999999],
      [27445.471500000007, 36642.51293750001, 60064.23212499998],
      [6126.249562499999, 9114.570750000003, 10599.570375],
    ],
    [
      [22104.956250000003, 29622.6625, 54494.80249999999],
      [18789.2128125, 26976.39475, 46320.582125000015],
      [4153.939125000002, 6814.838062500002, 8174.220374999997],
    ],
    [
      [36570.059999999976, 42346.08375, 70663.80249999999],
      [31084.55099999997, 36964.44300000001, 60064.23212499998],
      [6091.846500000001, 9451.747125, 10599.570375],
    ],
    [
      [21956.447499999987, 30257.119999999995, 54494.80249999999],
      [18662.980374999996, 26590.228062500006, 46320.582125000015],
      [4145.371312499999, 7115.766000000003, 8174.220374999997],
    ],
  ]
  for (const retargetRemainingDrones of [false, true]) {
    for (const skillIndex of [1, 2, 3]) {
      const result = simulateGoldenglowTargetSwitchGrid(input({ skillIndex, switchDelay: 0.15, retargetRemainingDrones }))
      assert.deepEqual(result.rows.map((row) => row.expectedDamages),
        expected[Number(retargetRemainingDrones) * 2 + Number(skillIndex === 3)])
    }
  }
})

test('内訳は攻撃なし・通常のみ・爆発のみ・本体のみもゼロ成分を保つ', () => {
  for (const retargetRemainingDrones of [false, true]) {
    const base = input({
      model: { ...model, activeDroneCount: 1, resistanceIgnoreFixed: 0, prdStep: 1 },
      effectiveAttack: 100, attackInterval: 1, duration: 1, enemyHps: [1],
      enemyResistances: [0], trials: 1, retargetRemainingDrones,
    })
    const cases: [Partial<GridInput>, { normalDamage: number; explosionDamage: number; bodyDamage: number }][] = [
      [{ duration: 0.5 }, { normalDamage: 0, explosionDamage: 0, bodyDamage: 0 }],
      [{ effectiveAttack: 0 }, { normalDamage: 0, explosionDamage: 0, bodyDamage: 0 }],
      [{}, { normalDamage: 0, explosionDamage: 300, bodyDamage: 0 }],
      [{ model: { ...base.model, prdStep: 0 } }, { normalDamage: 20, explosionDamage: 0, bodyDamage: 0 }],
    ]
    if (retargetRemainingDrones) {
      cases.push([{ skillIndex: 1, switchDelay: 0.1 }, { normalDamage: 0, explosionDamage: 0, bodyDamage: 100 }])
    }
    for (const [override, expected] of cases) {
      const result = checkAgainstSingleCells({ ...base, ...override })
      assert.deepEqual(result.rows[0].damageBreakdowns[0], expected)
    }
  }
})

test('進捗コールバックと重複セルの内訳を変更してもキャッシュや他の結果に伝わらない', () => {
  for (const retargetRemainingDrones of [false, true]) {
    const setup = input({ enemyHps: [500, 5_000, 500], enemyResistances: [0, 15, 0], retargetRemainingDrones })
    const expected = simulateGoldenglowTargetSwitchGrid(setup)
    const result = simulateGoldenglowTargetSwitchGrid(setup, (row) => {
      row.damageBreakdowns[0].normalDamage = -1
      row.damageBreakdowns[1].explosionDamage = -1
      row.damageBreakdowns.push({ normalDamage: -1, explosionDamage: -1, bodyDamage: -1 })
      row.expectedDamages[0] = -1
    }, (cell) => {
      cell.damageBreakdown.normalDamage = -2
      cell.damageBreakdown.explosionDamage = -2
      cell.damageBreakdown.bodyDamage = -2
      cell.expectedDamage = -2
    })
    assert.deepEqual(result, expected)
    result.rows[0].damageBreakdowns[0].normalDamage = -3
    assert.deepEqual(result.rows[0].damageBreakdowns[2], expected.rows[0].damageBreakdowns[2])
    assert.deepEqual(result.rows[1], expected.rows[1])
  }
})
