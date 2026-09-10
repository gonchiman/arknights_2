import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoldenglowPerformancePresets } from '../src/lib/goldenglowPerformancePresets.ts'

const choices = [
  { id: 'module-y', label: 'MOD Y', levels: [1, 2, 3], unlocked: true },
  { id: 'module-x', label: 'MOD X', levels: [1, 2], unlocked: true },
] as const

test('モジュール比較は既存のデフォルト列・ID・潜在1を維持し、入力順と利用可能な最終レベルを使う', () => {
  const preset = buildGoldenglowPerformancePresets(choices)[0]
  assert.equal(preset.id, 'modules')
  assert.equal(preset.label, 'モジュール比較（潜在1）')
  assert.deepEqual(preset.builds, [
    { id: 'default-off', moduleId: '', moduleLevel: 3, potential: 1 },
    { id: 'default-module-y', moduleId: 'module-y', moduleLevel: 3, potential: 1 },
    { id: 'default-module-x', moduleId: 'module-x', moduleLevel: 2, potential: 1 },
  ])
})

test('未装備と各モジュールで潜在1〜6を揃え、モジュールとレベルを固定する', () => {
  const presets = buildGoldenglowPerformancePresets(choices).slice(1)
  assert.deepEqual(presets.map(({ id, label }) => ({ id, label })), [
    { id: 'potential-off', label: '潜在比較：未装備' },
    { id: 'potential-module-y', label: '潜在比較：MOD Y（Lv.3）' },
    { id: 'potential-module-x', label: '潜在比較：MOD X（Lv.2）' },
  ])
  presets.forEach((preset, index) => {
    assert.deepEqual(preset.builds.map((build) => build.potential), [1, 2, 3, 4, 5, 6])
    assert.ok(preset.builds.every((build) => build.moduleId === ['', 'module-y', 'module-x'][index]))
    assert.ok(preset.builds.every((build) => build.moduleLevel === [3, 3, 2][index]))
  })
})

test('プリセットと比較列のIDは一意で、モジュール順や表示名が変わっても安定する', () => {
  const original = buildGoldenglowPerformancePresets(choices)
  const reordered = buildGoldenglowPerformancePresets([
    { ...choices[1], label: '別名のモジュール' }, choices[0],
  ])
  const ids = original.flatMap((preset) => preset.builds.map((build) => build.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(original.map((preset) => preset.id)).size, original.length)
  for (const preset of original.slice(1)) {
    assert.deepEqual(reordered.find((candidate) => candidate.id === preset.id)?.builds, preset.builds)
    assert.deepEqual(preset.builds.map((build) => build.id), [1, 2, 3, 4, 5, 6].map((potential) => `${preset.id}-${potential}`))
  }
  assert.equal(reordered[2].label, '潜在比較：別名のモジュール（Lv.2）')
})

test('未解放またはレベル未取得のモジュールには潜在プリセットを作らず、既存モジュール比較には残す', () => {
  const presets = buildGoldenglowPerformancePresets([
    { id: 'locked', label: 'MOD A', levels: [1, 2], unlocked: false },
    { id: 'empty', label: 'MOD B', levels: [], unlocked: true },
    { id: 'ready', label: 'MOD C', levels: [1], unlocked: true },
  ])
  assert.deepEqual(presets.map((preset) => preset.id), ['modules', 'potential-off', 'potential-ready'])
  assert.deepEqual(presets[0].builds, [
    { id: 'default-off', moduleId: '', moduleLevel: 3, potential: 1 },
    { id: 'default-locked', moduleId: 'locked', moduleLevel: 2, potential: 1 },
    { id: 'default-empty', moduleId: 'empty', moduleLevel: 3, potential: 1 },
    { id: 'default-ready', moduleId: 'ready', moduleLevel: 1, potential: 1 },
  ])
  assert.deepEqual(buildGoldenglowPerformancePresets([]).map((preset) => preset.id), ['modules', 'potential-off'])
})

test('入力を変更せず、列の編集が別のプリセットや次の生成結果に漏れない', () => {
  const input = structuredClone(choices)
  const before = structuredClone(input)
  const presets = buildGoldenglowPerformancePresets(input)
  presets[0].builds[1].potential = 6
  presets[0].builds[1].moduleLevel = 1
  assert.deepEqual(input, before)
  assert.equal(presets[2].builds[0].potential, 1)
  assert.equal(presets[2].builds[0].moduleLevel, 3)
  assert.equal(buildGoldenglowPerformancePresets(input)[0].builds[1].potential, 1)
})
