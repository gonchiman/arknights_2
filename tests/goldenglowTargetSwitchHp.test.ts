import test from 'node:test'
import assert from 'node:assert/strict'
import { simulateGoldenglowTargetSwitch } from '../src/lib/goldenglowTargetSwitch.ts'
import { simulateGoldenglowTargetSwitchGrid } from '../src/lib/goldenglowTargetSwitchGrid.ts'
import {
  GOLDENGLOW_TARGET_SWITCH_HP_LIMITS,
  createGoldenglowTargetSwitchHpValues,
  simulateGoldenglowTargetSwitchHp,
  type GoldenglowTargetSwitchHpInput,
  type GoldenglowTargetSwitchHpPoint,
} from '../src/lib/goldenglowTargetSwitchHp.ts'
import type { GoldenglowExplosionModel } from '../src/lib/goldenglowExplosion.ts'

const model: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
  attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
  prdStep: 0.015, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
  resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}

function input(overrides: Partial<GoldenglowTargetSwitchHpInput> = {}): GoldenglowTargetSwitchHpInput {
  return {
    model, skillIndex: 3, effectiveAttack: 703, attackInterval: 1.3, duration: 30,
    enemyHps: [1_000, 10_000, 20_000], enemyResistance: 30, enemyDefense: 0,
    switchDelay: 0.1, retargetRemainingDrones: true, trials: 37, seed: 20260908,
    ...overrides,
  }
}

test('HPは正の整数を等間隔で取り、端数の終了HPを追加しない', () => {
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(1_000, 20_000, 1_000),
    Array.from({ length: 20 }, (_, index) => (index + 1) * 1_000))
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(1_000, 3_500, 1_000), [1_000, 2_000, 3_000])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(1_000, 1_000, 5_000), [1_000])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(999_999_990, 1_000_000_000, 6), [999_999_990, 999_999_996])
  assert.equal(createGoldenglowTargetSwitchHpValues(1, 100, 1).length, GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxPoints)
})

test('開始HPが0なら最初だけ1に置き換え、以降の刻みと終了範囲を保つ', () => {
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(0, 3_000, 1_000), [1, 1_000, 2_000, 3_000])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(0, 3_500, 1_000), [1, 1_000, 2_000, 3_000])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(0, 1, 1_000), [1])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(0, 3, 1), [1, 2, 3])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(0, 1, 1), [1])
  assert.deepEqual(createGoldenglowTargetSwitchHpValues(0, 100, 1), createGoldenglowTargetSwitchHpValues(1, 100, 1))
  assert.equal(createGoldenglowTargetSwitchHpValues(0, 99_000, 1_000).length, GOLDENGLOW_TARGET_SWITCH_HP_LIMITS.maxPoints)
  assert.throws(() => createGoldenglowTargetSwitchHpValues(0, 101, 1), /100点/)
  assert.throws(() => createGoldenglowTargetSwitchHpValues(0, 100_000, 1_000), /100点/)
})

test('HP範囲は負数・小数・非有限値・逆順・上限超過と終了HP・刻みの0を拒否する', () => {
  for (const bad of [-1, 0.5, NaN, Infinity, 1_000_000_001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createGoldenglowTargetSwitchHpValues(bad, 20_000, 1_000), RangeError)
    assert.throws(() => createGoldenglowTargetSwitchHpValues(1_000, bad, 1_000), RangeError)
    assert.throws(() => createGoldenglowTargetSwitchHpValues(1_000, 20_000, bad), RangeError)
  }
  assert.throws(() => createGoldenglowTargetSwitchHpValues(0, 0, 1_000), /終了HP/)
  assert.throws(() => createGoldenglowTargetSwitchHpValues(0, 20_000, 0), /HPの刻み/)
  assert.throws(() => createGoldenglowTargetSwitchHpValues(2_000, 1_000, 1_000), /終了HP/)
  assert.throws(() => createGoldenglowTargetSwitchHpValues(1, 101, 1), /100点/)
})

test('S1・S2・S3の各点は待ち時間0秒・0.1秒とも既存の表と単独計算に一致する', () => {
  for (const skillIndex of [1, 2, 3]) {
    for (const switchDelay of [0, 0.1]) {
      const setup = input({
        skillIndex, switchDelay, enemyHps: [1, 80, 1_000, 10_000, 20_000],
        model: { ...model, activeDroneCount: skillIndex === 3 ? 3 : 2 },
        attackInterval: skillIndex === 1 ? 1.3 / 1.7 : 1.3,
      })
      const actual = simulateGoldenglowTargetSwitchHp(setup)
      const grid = simulateGoldenglowTargetSwitchGrid({ ...setup, enemyResistances: [setup.enemyResistance] })
      assert.deepEqual(actual.points.map((point) => point.expectedDamage), grid.rows[0].expectedDamages)
      assert.deepEqual(actual.points.map((point) => point.damageBreakdown), grid.rows[0].damageBreakdowns)
      assert.equal(actual.trials, setup.trials)
      assert.equal(actual.seed, setup.seed)
      assert.equal(actual.duration, setup.duration)
      for (const point of actual.points) {
        const single = simulateGoldenglowTargetSwitch({ ...setup, enemyHp: point.enemyHp })
        const tolerance = Math.max(1, single.mean.rawDamage) * 1e-10
        assert.ok(Math.abs(point.expectedDamage - single.mean.rawDamage) <= tolerance,
          `S${skillIndex}, delay ${switchDelay}, HP ${point.enemyHp}`)
        assert.ok(point.damageBreakdown)
        for (const component of ['normalDamage', 'explosionDamage', 'bodyDamage'] as const) {
          assert.ok(Math.abs(point.damageBreakdown[component] - single.mean[component]) <= tolerance,
            `S${skillIndex}, delay ${switchDelay}, HP ${point.enemyHp}, ${component}`)
        }
      }
    }
  }
})

test('平均ダメージは残りHPで切り捨てず、術耐性適用後の余剰ダメージを含む', () => {
  const setup = input({
    model: { ...model, activeDroneCount: 1, prdStep: 1, resistanceIgnoreFixed: 0 },
    effectiveAttack: 100, duration: 1, attackInterval: 1, enemyHps: [1],
    enemyResistance: 50, switchDelay: 0, trials: 1,
  })
  assert.deepEqual(simulateGoldenglowTargetSwitchHp(setup).points, [{
    enemyHp: 1, expectedDamage: 150,
    damageBreakdown: { normalDamage: 0, explosionDamage: 150, bodyDamage: 0 },
  }])
})

test('点の進捗は入力順に届き、重複HPを含めて通知して結果を再現する', () => {
  const setup = input({ enemyHps: [20_000, 1_000, 20_000, 10_000] })
  const notifications: { point: GoldenglowTargetSwitchHpPoint; completed: number; total: number }[] = []
  const result = simulateGoldenglowTargetSwitchHp(setup, (point, completed, total) => {
    notifications.push({ point: structuredClone(point), completed, total })
    point.enemyHp = -1
    point.expectedDamage = -1
    assert.ok(point.damageBreakdown)
    point.damageBreakdown.normalDamage = -1
    point.damageBreakdown.explosionDamage = -1
    point.damageBreakdown.bodyDamage = -1
  })
  assert.deepEqual(notifications, result.points.map((point, index) => ({
    point, completed: index + 1, total: setup.enemyHps.length,
  })))
  assert.deepEqual(result, simulateGoldenglowTargetSwitchHp(setup))
  assert.equal(result.points[0].expectedDamage, result.points[2].expectedDamage)
  result.points[0].damageBreakdown!.normalDamage = -2
  assert.notEqual(result.points[2].damageBreakdown!.normalDamage, -2)
})

test('点ごとの通知は行の完了を待たず、キャッシュ済みの行・列も通知する', () => {
  const setup = { ...input({ enemyHps: [1_000, 10_000, 1_000] }), enemyResistances: [0, 15] }
  const events: string[] = []
  const result = simulateGoldenglowTargetSwitchGrid(setup, (row, completed, total) => {
    events.push(`row:${row.enemyResistance}:${completed}/${total}`)
  }, (cell, completed, total) => {
    events.push(`cell:${cell.enemyResistance}:${cell.enemyHp}:${completed}/${total}`)
    cell.expectedDamage = -1
    cell.damageBreakdown.normalDamage = -1
  })
  assert.deepEqual(events, [
    'cell:0:1000:1/6', 'cell:0:10000:2/6', 'cell:0:1000:3/6', 'row:0:1/2',
    'cell:15:1000:4/6', 'cell:15:10000:5/6', 'cell:15:1000:6/6', 'row:15:2/2',
  ])
  assert.deepEqual(result, simulateGoldenglowTargetSwitchGrid(setup))
  assert.deepEqual(result.rows[0].expectedDamages, result.rows[1].expectedDamages)
})

test('空配列・不正HP・不正耐性と共通設定を進捗通知前に拒否する', () => {
  const invalid: Partial<GoldenglowTargetSwitchHpInput>[] = [
    { enemyHps: [] }, { enemyHps: [1_000, 0] }, { enemyHps: [1_000, 0.5] },
    { enemyHps: [-1] }, { enemyHps: [NaN] }, { enemyHps: [Infinity] },
    { enemyHps: [1_000_000_001] }, { enemyHps: Array.from({ length: 101 }, (_, index) => index + 1) },
    { enemyResistance: NaN }, { enemyResistance: -1 }, { enemyResistance: 101 },
    { trials: 0 }, { trials: 1.5 }, { trials: 20_001 }, { seed: -1 },
    { effectiveAttack: NaN }, { duration: 0 }, { switchDelay: -1 },
    { retargetRemainingDrones: 'true' as unknown as boolean },
  ]
  for (const override of invalid) {
    let notified = false
    assert.throws(() => simulateGoldenglowTargetSwitchHp(input(override), () => { notified = true }), RangeError)
    assert.equal(notified, false)
  }
  for (const bad of [null, undefined, {}, { enemyHps: null }]) {
    assert.throws(() => simulateGoldenglowTargetSwitchHp(bad as GoldenglowTargetSwitchHpInput), RangeError)
  }
})

test('抽選データ容量とHP全体の計算量を最初の点を計算する前に検証する', () => {
  const invalid: Partial<GoldenglowTargetSwitchHpInput>[] = [
    {
      model: { ...model, activeDroneCount: 1 }, duration: 300, attackInterval: 0.05,
      trials: 1_000, enemyHps: [1_000],
    },
    {
      model: { ...model, activeDroneCount: 16 }, duration: 300, attackInterval: 0.05,
      trials: 100, enemyHps: createGoldenglowTargetSwitchHpValues(100, 10_000, 100),
    },
  ]
  for (const override of invalid) {
    let notified = false
    assert.throws(() => simulateGoldenglowTargetSwitchHp(input(override), () => { notified = true }), RangeError)
    assert.equal(notified, false)
  }
})

test('入力を変更せず、通知中の呼び出し元の変更も進行中の計算には混ぜない', () => {
  const setup = input({ model: { ...model }, enemyHps: [1_000, 10_000, 20_000] })
  const expected = simulateGoldenglowTargetSwitchHp(setup)
  const actual = simulateGoldenglowTargetSwitchHp(setup, (_, completed) => {
    if (completed !== 1) return
    ;(setup.enemyHps as number[])[1] = 0
    setup.model.prdStep = 1
    setup.switchDelay = 5
  })
  assert.deepEqual(actual, expected)
  const frozen = input({ model: { ...model }, enemyHps: [1_000, 10_000] })
  Object.freeze(frozen.enemyHps)
  Object.freeze(frozen.model)
  Object.freeze(frozen)
  const original = structuredClone(frozen)
  simulateGoldenglowTargetSwitchHp(frozen)
  assert.deepEqual(frozen, original)
})
