import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateEmpiricalCdf } from '../src/lib/enemyStatistics.ts'
import { calculateEcdfGuideReadings, parseEcdfGuideInput } from '../src/lib/enemyEcdfGuides.ts'

test('補助線の空欄は解除し、有限の入力値を丸めずに扱う', () => {
  for (const axis of ['x', 'y'] as const) {
    assert.deepEqual(parseEcdfGuideInput(' \t ', axis), { value: null, error: null })
    assert.deepEqual(parseEcdfGuideInput('0', axis), { value: 0, error: null })
    assert.deepEqual(parseEcdfGuideInput('12.3456789', axis), { value: 12.3456789, error: null })
  }
  assert.deepEqual(parseEcdfGuideInput('100', 'y'), { value: 100, error: null })
  assert.deepEqual(parseEcdfGuideInput('100000', 'x'), { value: 100000, error: null })
})

test('補助線の数値入力は有限値と軸ごとの範囲を検証する', () => {
  for (const input of ['abc', 'NaN', 'Infinity', '-Infinity', '1e999', '-0.001']) {
    for (const axis of ['x', 'y'] as const) {
      const result = parseEcdfGuideInput(input, axis)
      assert.equal(result.value, null)
      assert.ok(result.error)
    }
  }
  assert.ok(parseEcdfGuideInput('100.000001', 'y').error)
  assert.equal(parseEcdfGuideInput('100.000001', 'x').error, null)
})

test('横軸の値以下に含まれる敵を同値も含めて数え、欠損値は除外する', () => {
  const points = calculateEmpiricalCdf([30, 10, 10, 20, null, undefined, Number.NaN, Infinity])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 10, yPercent: null }), {
    x: { value: 10, cumulativeCount: 2, proportion: 0.5, inRange: true },
    y: null,
  })
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 19.999999999, yPercent: null }).x, {
    value: 19.999999999, cumulativeCount: 2, proportion: 0.5, inRange: true,
  })
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 20, yPercent: null }).x, {
    value: 20, cumulativeCount: 3, proportion: 0.75, inRange: true,
  })
})

test('横軸の範囲外も0%・100%を返し、端点は範囲内として扱う', () => {
  const points = calculateEmpiricalCdf([10, 20, 30])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 0, yPercent: null }).x, {
    value: 0, cumulativeCount: 0, proportion: 0, inRange: false,
  })
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 31, yPercent: null }).x, {
    value: 31, cumulativeCount: 3, proportion: 1, inRange: false,
  })
  assert.equal(calculateEcdfGuideReadings(points, { x: 10, yPercent: null }).x?.inRange, true)
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 30, yPercent: null }).x, {
    value: 30, cumulativeCount: 3, proportion: 1, inRange: true,
  })
})

test('縦軸の割合へ初めて達する最小の実測値を補間せずに返す', () => {
  const points = calculateEmpiricalCdf([10, 10, 20, 50])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: null, yPercent: 50 }).y, {
    percentage: 50, value: 10, proportion: 0.5, cumulativeCount: 2,
  })
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: null, yPercent: 50.000000001 }).y, {
    percentage: 50.000000001, value: 20, proportion: 0.75, cumulativeCount: 3,
  })
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: null, yPercent: 80 }).y, {
    percentage: 80, value: 50, proportion: 1, cumulativeCount: 4,
  })
})

test('縦軸0%には最小実測値を割り当てず、100%は最大値を返す', () => {
  const points = calculateEmpiricalCdf([10, 20, 30])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: null, yPercent: 0 }).y, {
    percentage: 0, value: null, proportion: 0, cumulativeCount: 0,
  })
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: null, yPercent: 100 }).y, {
    percentage: 100, value: 30, proportion: 1, cumulativeCount: 3,
  })
})

test('割合の境界は小数演算で百分率を再計算せずに判定する', () => {
  const points = calculateEmpiricalCdf(Array.from({ length: 100 }, (_, index) => index + 1))
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: null, yPercent: 57 }).y, {
    percentage: 57, value: 57, proportion: 0.57, cumulativeCount: 57,
  })
})

test('すべて同値のときも両方の補助線を独立して計算する', () => {
  const points = calculateEmpiricalCdf([7, 7, 7])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 7, yPercent: 30 }), {
    x: { value: 7, cumulativeCount: 3, proportion: 1, inRange: true },
    y: { percentage: 30, value: 7, proportion: 1, cumulativeCount: 3 },
  })
  assert.equal(calculateEcdfGuideReadings(points, { x: 6, yPercent: null }).x?.proportion, 0)
})

test('0のみの分布でも横軸の0と縦軸の0%を区別する', () => {
  const points = calculateEmpiricalCdf([0])
  assert.deepEqual(calculateEcdfGuideReadings(points, { x: 0, yPercent: 0 }), {
    x: { value: 0, cumulativeCount: 1, proportion: 1, inRange: true },
    y: { percentage: 0, value: null, proportion: 0, cumulativeCount: 0 },
  })
})

test('空データ・欠損値のみでは補助線の読み取り結果を表示しない', () => {
  for (const source of [[], [null, undefined, Number.NaN, Infinity]]) {
    assert.deepEqual(calculateEcdfGuideReadings(calculateEmpiricalCdf(source), { x: 10, yPercent: 50 }), {
      x: null, y: null,
    })
  }
})

test('無効な数値は補助線を作らず、もう一方の有効な補助線を維持する', () => {
  const points = calculateEmpiricalCdf([10, 20])
  for (const x of [null, -1, Number.NaN, Infinity, -Infinity]) {
    const result = calculateEcdfGuideReadings(points, { x, yPercent: 50 })
    assert.equal(result.x, null)
    assert.equal(result.y?.value, 10)
  }
  for (const yPercent of [null, -1, 101, Number.NaN, Infinity, -Infinity]) {
    const result = calculateEcdfGuideReadings(points, { x: 10, yPercent })
    assert.equal(result.y, null)
    assert.equal(result.x?.cumulativeCount, 1)
  }
})
