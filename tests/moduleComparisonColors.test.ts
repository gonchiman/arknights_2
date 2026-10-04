import test from 'node:test'
import assert from 'node:assert/strict'
import { getModuleColor, getModuleComparisonColors, MODULE_LEVEL_SHADES } from '../src/lib/moduleColors.ts'

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

test('段階モードはLv1からLv3へ濃くなり、白との混合後に既存と同じRGB丸めを使う', () => {
  const options = { shadeBy: 'moduleLevel' as const }
  assert.deepEqual(MODULE_LEVEL_SHADES, [0.35, 0.17, 0])
  assert.equal(Object.isFrozen(MODULE_LEVEL_SHADES), true)
  assert.deepEqual(getModuleComparisonColors([1, 2, 3].map(moduleLevel => ({ moduleType: 'X', moduleLevel })), options),
    ['#82a6bd', '#608daa', '#3f7699'])
  assert.deepEqual(getModuleComparisonColors([1, 2, 3].map(moduleLevel => ({ moduleType: 'Y', moduleLevel })), options),
    ['#cea682', '#c18d5f', '#b4763e'])
  for (const moduleType of moduleTypes.slice(1)) {
    const colors = getModuleComparisonColors([1, 2, 3].map(moduleLevel => ({ moduleType, moduleLevel })), options)
    assert.equal(colors[2], getModuleColor(moduleType))
    for (const offset of [1, 3, 5]) {
      const channels = colors.map(color => Number.parseInt(color.slice(offset, offset + 2), 16))
      assert.ok(channels[0] > channels[1] && channels[1] > channels[2])
    }
  }
})

test('段階色は並べ替え・除外・1系列だけの表示でも変わらない', () => {
  const options = { shadeBy: 'moduleLevel' as const }
  const series = [
    { moduleType: 'X', moduleLevel: 1 },
    { moduleType: 'Y', moduleLevel: 2 },
    { moduleType: 'X', moduleLevel: 3 },
    { moduleType: null, moduleLevel: 1 },
    { moduleType: 'X', moduleLevel: 2 },
  ]
  const colors = ['#82a6bd', '#c18d5f', '#3f7699', '#737982', '#608daa']
  assert.deepEqual(getModuleComparisonColors(series, options), colors)
  assert.deepEqual(getModuleComparisonColors(series.toReversed(), options), colors.toReversed())
  assert.deepEqual(getModuleComparisonColors([series[4], series[0]], options), [colors[4], colors[0]])
  for (const [index, item] of series.entries()) assert.deepEqual(getModuleComparisonColors([item], options), [colors[index]])
  assert.deepEqual(getModuleComparisonColors([], options), [])
})

test('段階モードだけが潜在を無視し、既定と明示した潜在モードは従来の配色を保つ', () => {
  const series = [
    { moduleType: 'X', moduleLevel: 1, potential: 1 },
    { moduleType: 'X', moduleLevel: 1, potential: 6 },
    { moduleType: 'Y', moduleLevel: 3, potential: 6 },
    { moduleType: null, moduleLevel: 2, potential: 1 },
  ]
  for (const options of [undefined, {}, { shadeBy: 'potential' as const }]) {
    assert.deepEqual(getModuleComparisonColors(series, options), ['#8cadc2', '#294d63', '#754d28', '#abafb4'])
  }
  assert.deepEqual(getModuleComparisonColors(series, { shadeBy: 'moduleLevel' }),
    ['#82a6bd', '#82a6bd', '#b4763e', '#737982'])
  for (const potential of [undefined, 1, 6, 0, NaN, Infinity]) {
    assert.deepEqual(getModuleComparisonColors(series.map(item => ({ ...item, potential })), { shadeBy: 'moduleLevel' }),
      ['#82a6bd', '#82a6bd', '#b4763e', '#737982'])
  }
  assert.deepEqual(getModuleComparisonColors(series.map(item => ({ ...item, potential: 1 }))),
    ['#3f7699', '#3f7699', '#b4763e', '#737982'])
  assert.equal(getModuleColor('X', 1), '#8cadc2')
  assert.equal(getModuleColor('X', 6), '#294d63')
})

test('段階未指定・不正はLv3の基準色になり、明示した未装備だけは常に基準灰を保つ', () => {
  const options = { shadeBy: 'moduleLevel' as const }
  const invalid = [undefined, 0, 4, -1, 2.5, NaN, Infinity, -Infinity, '1', null, true]
  for (const moduleLevel of invalid) {
    assert.deepEqual(getModuleComparisonColors(moduleTypes.map(moduleType => ({ moduleType,
      moduleLevel: moduleLevel as number, potential: 1 })), options), baseColors)
  }
  for (const moduleLevel of [1, 2, 3]) {
    assert.deepEqual(getModuleComparisonColors([{ moduleType: null, moduleLevel, potential: 6 }], options), ['#737982'])
  }
  assert.deepEqual(getModuleComparisonColors([{ moduleType: 'none', moduleLevel: 1 }, { moduleLevel: 1 }], options),
    ['#a7a0ac', '#a7a0ac'])
})

test('段階色もMODの表記揺れを共通判定し、入力・設定・返却配列を共有しない', () => {
  const options = Object.freeze({ shadeBy: 'moduleLevel' as const })
  const series = Object.freeze([
    Object.freeze({ moduleType: ' Ｘ ', moduleLevel: 1, potential: 6 }),
    Object.freeze({ moduleType: 'δ', moduleLevel: 2, potential: 1 }),
    Object.freeze({ moduleType: 'α', moduleLevel: 1 }),
    Object.freeze({ moduleType: 'β', moduleLevel: 2 }),
    Object.freeze({ moduleType: null, moduleLevel: 1 }),
    Object.freeze({ moduleType: undefined, moduleLevel: 1 }),
  ])
  const before = structuredClone({ series, options })
  const expected = ['#82a6bd', '#967fac', '#8db2a4', '#bd7a86', '#737982', '#a7a0ac']
  const colors = getModuleComparisonColors(series, options)
  assert.deepEqual(colors, expected)
  assert.deepEqual({ series, options }, before)
  colors[0] = '#000000'
  assert.deepEqual(getModuleComparisonColors(series, options), expected)
})
