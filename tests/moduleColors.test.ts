import test from 'node:test'
import assert from 'node:assert/strict'
import { getModuleColor, getModuleColorKey, MODULE_BASE_COLORS } from '../src/lib/moduleColors.ts'
import { getGoldenglowPerformanceColor } from '../src/lib/goldenglowPerformanceColors.ts'

test('承認済みの6色を共通の基準色として使う', () => {
  assert.deepEqual([null, 'X', 'Y', 'D', 'A', 'B'].map((type) => getModuleColor(type)),
    ['#737982', '#3f7699', '#b4763e', '#80659b', '#4f8873', '#b05f6d'])
})

test('ゲームデータの英字と表示用のギリシャ文字は同じMOD色になる', () => {
  const aliases = {
    X: ['X', 'x', ' Ｘ '], Y: ['Y', 'y', 'ｙ'],
    D: ['D', 'd', 'Δ', 'δ', '∆', ' Ｄ '],
    A: ['A', 'a', 'α', 'Α', 'Ａ'], B: ['B', 'b', 'β', 'Β', 'Ｂ'],
  } as const
  for (const [key, values] of Object.entries(aliases)) {
    for (const alias of values) {
      assert.equal(getModuleColorKey(alias), key, alias)
      for (let potential = 1; potential <= 6; potential++) {
        assert.equal(getModuleColor(alias, potential), getModuleColor(key, potential), alias)
      }
    }
  }
})

test('明示した未装備と、型不明の装備を区別する', () => {
  assert.equal(getModuleColorKey(null), 'none')
  for (const value of [undefined, '', ' ', 'Z', 'none', 'MOD X', 'constructor', '__proto__']) {
    assert.equal(getModuleColorKey(value), 'unknown')
    assert.equal(getModuleColor(value), MODULE_BASE_COLORS.unknown)
    assert.notEqual(getModuleColor(value, 1), getModuleColor(null, 1))
  }
})

test('配色見本と同じ潜在の濃淡を描画する', () => {
  assert.deepEqual([null, 'X', 'Y', 'D', 'A', 'B'].map((type) => getModuleColor(type, 1)),
    ['#abafb4', '#8cadc2', '#d2ad8b', '#b3a3c3', '#95b8ab', '#d09fa7'])
  assert.deepEqual([null, 'X', 'Y', 'D', 'A', 'B'].map((type) => getModuleColor(type, 6)),
    ['#4b4f55', '#294d63', '#754d28', '#534265', '#33584b', '#723e47'])
})

test('潜在1から6へ一貫して濃くなり、MOD間も区別できる', () => {
  const types = [null, 'X', 'Y', 'D', 'A', 'B']
  for (let potential = 1; potential <= 6; potential++) {
    assert.equal(new Set(types.map((type) => getModuleColor(type, potential))).size, types.length)
  }
  for (const type of types) {
    const colors = Array.from({ length: 6 }, (_, i) => getModuleColor(type, i + 1))
    for (let i = 1; i < colors.length; i++) {
      for (const offset of [1, 3, 5]) {
        assert.ok(parseInt(colors[i].slice(offset, offset + 2), 16) < parseInt(colors[i - 1].slice(offset, offset + 2), 16))
      }
    }
  }
})

test('潜在未指定は基準色、不正な潜在は潜在1として扱う', () => {
  assert.equal(getModuleColor('X'), MODULE_BASE_COLORS.X)
  for (const potential of [0, 7, -1, 2.5, NaN, Infinity]) {
    assert.equal(getModuleColor('X', potential), getModuleColor('X', 1))
  }
})

test('GGの系列は列順・装備ID・MODレベルによらず共通配色を使う', () => {
  const choices = [{ id: 'first-x', type: 'X' }, { id: 'different-x', type: 'x' }, { id: 'y-module', type: 'Y' }]
  const build = { id: 'one', moduleId: 'first-x', moduleLevel: 1, potential: 3 }
  const originalChoices = structuredClone(choices)
  assert.equal(getGoldenglowPerformanceColor(build, choices), getModuleColor('X', 3))
  assert.equal(getGoldenglowPerformanceColor({ ...build, moduleId: 'different-x', moduleLevel: 3 }, choices.toReversed()), getModuleColor('X', 3))
  assert.equal(getGoldenglowPerformanceColor({ ...build, moduleId: '' }, choices), getModuleColor(null, 3))
  assert.equal(getGoldenglowPerformanceColor({ ...build, moduleId: 'missing' }, choices), getModuleColor(undefined, 3))
  assert.deepEqual(choices, originalChoices)
})
