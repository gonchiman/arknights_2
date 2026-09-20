import test from 'node:test'
import assert from 'node:assert/strict'
import { getModuleColor, getModuleComparisonColors } from '../src/lib/moduleColors.ts'

const moduleTypes = [null, 'X', 'Y', 'D', 'A', 'B', undefined] as const
const baseColors = ['#737982', '#3f7699', '#b4763e', '#80659b', '#4f8873', '#b05f6d', '#776d7f']

test('全系列が同じ潜在なら潜在1でも6でもMODの基準色を使う', () => {
  for (const potential of [1, 6]) {
    assert.deepEqual(
      getModuleComparisonColors(moduleTypes.map((moduleType) => ({ moduleType, potential }))),
      baseColors,
    )
  }
})

test('潜在が混在すると全MODで既存の潜在別の濃淡を使う', () => {
  const series = [1, 6].flatMap((potential) => moduleTypes.map((moduleType) => ({ moduleType, potential })))
  assert.deepEqual(
    getModuleComparisonColors(series),
    series.map(({ moduleType, potential }) => getModuleColor(moduleType, potential)),
  )
  assert.deepEqual(getModuleComparisonColors([
    { moduleType: 'X', potential: 1 },
    { moduleType: 'X', potential: 6 },
  ]), ['#8cadc2', '#294d63'])
})

test('並べ替えでは色が変わらず、異なる潜在を除くと基準色に戻る', () => {
  const series = [
    { moduleType: 'X', potential: 1 },
    { moduleType: 'Y', potential: 1 },
    { moduleType: 'X', potential: 6 },
  ]
  const colors = getModuleComparisonColors(series)
  assert.deepEqual(getModuleComparisonColors(series.toReversed()), colors.toReversed())
  assert.deepEqual(getModuleComparisonColors(series.slice(0, 2)), ['#3f7699', '#b4763e'])
  assert.deepEqual(getModuleComparisonColors([series[2]]), ['#3f7699'])
})

test('潜在未指定は別の潜在として数えず、混在時にも基準色を保つ', () => {
  assert.deepEqual(getModuleComparisonColors([
    { moduleType: 'X' },
    { moduleType: 'Y', potential: 6 },
  ]), ['#3f7699', '#b4763e'])
  assert.deepEqual(getModuleComparisonColors([
    { moduleType: 'X' },
    { moduleType: 'Y', potential: 1 },
    { moduleType: 'Y', potential: 6 },
  ]), ['#3f7699', '#d2ad8b', '#754d28'])
})

test('不正な潜在は既存の単色関数と同じく潜在1として判定する', () => {
  for (const potential of [0, 7, -1, 2.5, NaN, Infinity, -Infinity]) {
    assert.equal(getModuleColor('X', potential), '#8cadc2')
    assert.deepEqual(getModuleComparisonColors([
      { moduleType: 'X', potential },
      { moduleType: 'Y', potential: 1 },
    ]), ['#3f7699', '#b4763e'])
    assert.deepEqual(getModuleComparisonColors([
      { moduleType: 'X', potential },
      { moduleType: 'Y', potential: 6 },
    ]), ['#8cadc2', '#754d28'])
  }
})

test('空の比較は空配列、1系列と潜在未指定だけの比較は基準色を返す', () => {
  assert.deepEqual(getModuleComparisonColors([]), [])
  assert.deepEqual(getModuleComparisonColors([{ moduleType: 'X', potential: 1 }]), ['#3f7699'])
  assert.deepEqual(getModuleComparisonColors(moduleTypes.map((moduleType) => ({ moduleType }))), baseColors)
})

test('計算結果がまだない系列も比較条件に含め、点の追加で色を変えない', () => {
  const series = [
    { moduleType: 'X', potential: 1, points: [100] },
    { moduleType: 'Y', potential: 6, points: [] as number[] },
  ]
  assert.deepEqual(getModuleComparisonColors(series), ['#8cadc2', '#754d28'])
  series[1].points.push(200)
  assert.deepEqual(getModuleComparisonColors(series), ['#8cadc2', '#754d28'])
})

test('入力を変更せず、MODの表記揺れと未装備・不明を既存仕様で扱う', () => {
  const series = Object.freeze([
    Object.freeze({ moduleType: ' Ｘ ', potential: 1 }),
    Object.freeze({ moduleType: 'δ', potential: 6 }),
    Object.freeze({ moduleType: null, potential: 1 }),
    Object.freeze({ moduleType: undefined, potential: 6 }),
  ])
  const before = structuredClone(series)
  assert.deepEqual(getModuleComparisonColors(series), ['#8cadc2', '#534265', '#abafb4', '#4d4753'])
  assert.deepEqual(series, before)
})
