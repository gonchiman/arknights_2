import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSurtrRemnantCountEndpoints,
  buildSurtrRemnantCountIntervals,
} from '../src/lib/surtrRemnantChart.ts'
import {
  calculateSurtrRemnantAttacks,
  type SurtrRemnantAttackAssumptions,
  type SurtrRemnantAttackModel,
} from '../src/lib/surtrRemnantAttacks.ts'

const assumptions: SurtrRemnantAttackAssumptions = { windup: 0.2, ctCarry: 'time', includeRetreatHit: false }
const none: SurtrRemnantAttackModel = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  attackIntervalBefore: 1.25, attackIntervalAfter: 1.25, remnantDuration: 8,
  attackSpeedBefore: 100, attackSpeedAfter: 100,
}
const x: SurtrRemnantAttackModel = {
  ...none, moduleId: 'uniequip_002_surtr', moduleType: 'X', moduleLevel: 3,
  attackIntervalBefore: 1.25 / 1.08, attackIntervalAfter: 1.25 / 1.08,
  attackSpeedBefore: 108, attackSpeedAfter: 108,
}
const y: SurtrRemnantAttackModel = {
  ...none, moduleId: 'uniequip_003_surtr', moduleType: 'Y', moduleLevel: 3,
  attackIntervalAfter: 1.25 / 1.3, remnantDuration: 9, attackSpeedAfter: 130,
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`)
}

test('標準条件の未装備・X・Yを刻みに丸めず、それぞれの有効なCT範囲で分ける', () => {
  const expected = [[7, 6], [7, 6], [10, 9, 8]]
  const thresholds = [[0.3], [0.8555555555555556], [0.14615384615384616, 1.1076923076923078]]
  for (const [modelIndex, model] of [none, x, y].entries()) {
    const intervals = buildSurtrRemnantCountIntervals(model, assumptions)
    assert.deepEqual(intervals.map(interval => interval.count), expected[modelIndex])
    assert.equal(intervals[0].from, 0)
    assert.equal(intervals.at(-1)!.to, model.attackIntervalBefore)
    for (const [index, interval] of intervals.entries()) {
      assert.ok(interval.to > interval.from)
      assert.equal(interval.includeFrom, true)
      assert.equal(interval.includeTo, index === intervals.length - 1)
      if (index < thresholds[modelIndex].length) close(interval.to, thresholds[modelIndex][index])
      const result = calculateSurtrRemnantAttacks(model, (interval.from + interval.to) / 2, assumptions)!
      assert.equal(interval.count, result.hitCount)
    }
  }
  const xIntervals = buildSurtrRemnantCountIntervals(x, assumptions)
  assert.ok(xIntervals.at(-1)!.to < 1.2)
  assert.equal(calculateSurtrRemnantAttacks(x, 1.2, assumptions), null)
  assert.deepEqual(buildSurtrRemnantCountEndpoints(y, assumptions), [{ ct: 0, count: 10 }, { ct: 1.25, count: 8 }])
})

test('退場と同時の命中を含むかどうかにより境界の開閉を反転する', () => {
  for (const includeRetreatHit of [false, true]) {
    const selected = { ...assumptions, includeRetreatHit }
    const intervals = buildSurtrRemnantCountIntervals(none, selected)
    const boundary = intervals[0].to
    assert.equal(intervals[0].includeTo, includeRetreatHit)
    assert.equal(intervals[1].includeFrom, !includeRetreatHit)
    assert.equal(calculateSurtrRemnantAttacks(none, boundary, selected)!.hitCount, includeRetreatHit ? 7 : 6)
    // Retain the calculator's existing equality tolerance around an exact boundary.
    for (const offset of [-5e-10, 0, 5e-10]) {
      assert.equal(calculateSurtrRemnantAttacks(none, boundary + offset, selected)!.hitCount, includeRetreatHit ? 7 : 6)
    }
    assert.equal(calculateSurtrRemnantAttacks(none, boundary - 2e-9, selected)!.hitCount, 7)
    assert.equal(calculateSurtrRemnantAttacks(none, boundary + 2e-9, selected)!.hitCount, 6)
  }
})

test('CTゼロだけに現れる回数と上限だけに現れる回数を正幅区間と分けて取得する', () => {
  const model = { ...none, attackIntervalBefore: 1, attackIntervalAfter: 1, remnantDuration: 2 }
  const included = { ...assumptions, windup: 0, includeRetreatHit: true }
  assert.deepEqual(buildSurtrRemnantCountIntervals(model, included), [
    { from: 0, to: 1, count: 2, includeFrom: false, includeTo: true },
  ])
  assert.deepEqual(buildSurtrRemnantCountEndpoints(model, included), [{ ct: 0, count: 3 }, { ct: 1, count: 2 }])
  const excluded = { ...included, includeRetreatHit: false }
  assert.deepEqual(buildSurtrRemnantCountIntervals(model, excluded), [
    { from: 0, to: 1, count: 2, includeFrom: true, includeTo: false },
  ])
  assert.deepEqual(buildSurtrRemnantCountEndpoints(model, excluded), [{ ct: 0, count: 2 }, { ct: 1, count: 1 }])
})

test('割合維持ではCTの境界だけを変換し、発動後の命中準備時間は変換しない', () => {
  const ratio = { ...assumptions, ctCarry: 'ratio' as const }
  const intervals = buildSurtrRemnantCountIntervals(y, ratio)
  assert.deepEqual(intervals.map(interval => interval.count), [10, 9])
  close(intervals[0].to, 0.19)
  assert.equal(intervals[1].to, 1.25)
  assert.equal(intervals[0].includeTo, false)
  assert.equal(intervals[1].includeFrom, true)
  const changed = { ...none, attackIntervalBefore: 2, attackIntervalAfter: 1, remnantDuration: 3 }
  const selected = { ...ratio, windup: 0.25 }
  assert.deepEqual(buildSurtrRemnantCountIntervals(changed, selected), [
    { from: 0, to: 1.5, count: 3, includeFrom: true, includeTo: false },
    { from: 1.5, to: 2, count: 2, includeFrom: true, includeTo: true },
  ])
})

test('全区間で命中しない条件も0回の有効区間として扱う', () => {
  const model = { ...none, remnantDuration: 0.1 }
  assert.deepEqual(buildSurtrRemnantCountIntervals(model, assumptions), [
    { from: 0, to: 1.25, count: 0, includeFrom: true, includeTo: true },
  ])
  assert.deepEqual(buildSurtrRemnantCountEndpoints(model, assumptions), [{ ct: 0, count: 0 }, { ct: 1.25, count: 0 }])
})

test('上限付近の命中準備時間を既存計算と同じ1ns許容・クランプで評価する', () => {
  const model = { ...none, attackIntervalBefore: 1, attackIntervalAfter: 1, remnantDuration: 2 }
  const accepted = { ...assumptions, windup: 1 + 5e-10 }
  assert.deepEqual(buildSurtrRemnantCountIntervals(model, accepted), [
    { from: 0, to: 1, count: 1, includeFrom: true, includeTo: false },
  ])
  assert.deepEqual(buildSurtrRemnantCountEndpoints(model, accepted), [{ ct: 0, count: 1 }, { ct: 1, count: 0 }])
  assert.deepEqual(buildSurtrRemnantCountIntervals(model, { ...accepted, windup: 1 + 2e-9 }), [])
})

test('不正なモデル・仮定と既存の件数上限を超える計算は空配列にする', () => {
  const check = (model: SurtrRemnantAttackModel, selected = assumptions) => {
    assert.deepEqual(buildSurtrRemnantCountIntervals(model, selected), [])
    assert.deepEqual(buildSurtrRemnantCountEndpoints(model, selected), [])
  }
  for (const key of ['attackIntervalBefore', 'attackIntervalAfter', 'remnantDuration', 'attackSpeedBefore', 'attackSpeedAfter']) {
    for (const value of [0, -1, NaN, Infinity]) check({ ...none, [key]: value })
  }
  for (const windup of [-0.01, NaN, Infinity, 1]) check(y, { ...assumptions, windup })
  check(y, { ...assumptions, ctCarry: 'reset' as 'time' })
  check(y, { ...assumptions, includeRetreatHit: 1 as unknown as boolean })
  check({ ...none, attackIntervalAfter: 1e-10 }, { ...assumptions, windup: 0 })
})
