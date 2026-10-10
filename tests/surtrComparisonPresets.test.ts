import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SURTR_COMPARISON_PRESETS_KEY, applySurtrComparisonPreset, buildSurtrComparisonPresets,
  captureSurtrModulePresetSelection, isSurtrComparisonPresetAvailable, isSurtrModulePresetSelectionEqual,
  readSavedSurtrComparisonPresets, writeSavedSurtrComparisonPresets, type SurtrComparisonPreset,
} from '../src/lib/surtrComparisonPresets.ts'
import type { SurtrModuleChoice } from '../src/lib/surtrModuleComparison.ts'

const choices: SurtrModuleChoice[] = [
  { id: '', type: null, label: '未装備', levels: [], unlocked: true },
  { id: 'surtr-x', type: 'X', label: 'MOD X', levels: [1, 2, 3], unlocked: true },
  { id: 'surtr-y', type: 'Y', label: 'MOD Y', levels: [1, 2, 3], unlocked: true },
]

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('built-in presets use real module IDs and stages, omitting absent module types', () => {
  const presets = buildSurtrComparisonPresets(choices)
  assert.deepEqual(presets.map(preset => preset.name), ['MOD比較（Lv.3）', 'X段階比較', 'Y段階比較', '全段階'])
  assert.deepEqual(presets.map(preset => preset.selection), [
    { includeNone: true, moduleLevels: { 'surtr-x': [3], 'surtr-y': [3] } },
    { includeNone: true, moduleLevels: { 'surtr-x': [1, 2, 3], 'surtr-y': [] } },
    { includeNone: true, moduleLevels: { 'surtr-x': [], 'surtr-y': [1, 2, 3] } },
    { includeNone: true, moduleLevels: { 'surtr-x': [1, 2, 3], 'surtr-y': [1, 2, 3] } },
  ])
  const partial = buildSurtrComparisonPresets([choices[0], { ...choices[1], id: 'alternate-x', levels: [2, 1] }])
  assert.deepEqual(partial.map(preset => preset.id), ['module-comparison', 'x-stages', 'all-stages'])
  assert.equal(partial[0].name, 'MOD比較（Lv.2）')
  assert.deepEqual(partial[0].selection.moduleLevels, { 'alternate-x': [2] })
  assert.deepEqual(buildSurtrComparisonPresets([choices[0]]), [])
})

test('applying a preset deselects other known modules while preserving unrelated inputs and unknown selections', () => {
  const state = { excluded: ['', 'surtr-x', 'unknown-excluded'], moduleLevels: { 'surtr-x': [2], 'surtr-y': [1, 3], unknown: [2] },
    settings: { level: 70, trust: 82 }, potentials: [1, 6], layout: 'comparison', metric: 'percent', step: 20 }
  const original = structuredClone(state)
  const preset = buildSurtrComparisonPresets(choices).find(preset => preset.id === 'x-stages')!
  const selection = structuredClone(preset.selection)
  const next = applySurtrComparisonPreset(state, selection, choices)
  assert.deepEqual(next, { ...original, excluded: ['unknown-excluded'],
    moduleLevels: { 'surtr-x': [1, 2, 3], 'surtr-y': [], unknown: [2] } })
  assert.deepEqual(state, original)
  assert.deepEqual(selection, preset.selection)
  next.moduleLevels.unknown.push(3)
  assert.deepEqual(state.moduleLevels.unknown, [2])
  assert.equal(next.settings, state.settings)
  assert.equal(next.potentials, state.potentials)
  const withoutNone = applySurtrComparisonPreset(next, { includeNone: false, moduleLevels: { 'surtr-y': [2] } }, choices)
  assert.deepEqual(captureSurtrModulePresetSelection(choices, withoutNone.excluded, withoutNone.moduleLevels),
    { includeNone: false, moduleLevels: { 'surtr-x': [], 'surtr-y': [2] } })
})

test('capture follows shared selection rules, including explicit empty arrays and locked stages', () => {
  assert.deepEqual(captureSurtrModulePresetSelection(choices, [], {}),
    { includeNone: true, moduleLevels: { 'surtr-x': [3], 'surtr-y': [3] } })
  const locked = choices.map(choice => ({ ...choice, unlocked: choice.type !== 'Y' }))
  const stored = { 'surtr-x': [3, 1, 1, 9], 'surtr-y': [2], unknown: [3] }
  assert.deepEqual(captureSurtrModulePresetSelection(locked, [''], stored),
    { includeNone: false, moduleLevels: { 'surtr-x': [1, 3], 'surtr-y': [] } })
  assert.deepEqual(stored, { 'surtr-x': [3, 1, 1, 9], 'surtr-y': [2], unknown: [3] })
})

test('preset matching ignores stage order, duplicate stages and empty key differences', () => {
  const selection = { includeNone: true, moduleLevels: { 'surtr-x': [3, 1, 1], 'surtr-y': [] } }
  assert.equal(isSurtrModulePresetSelectionEqual(selection, { includeNone: true, moduleLevels: { 'surtr-x': [1, 3] } }), true)
  assert.equal(isSurtrModulePresetSelectionEqual(selection, { includeNone: false, moduleLevels: { 'surtr-x': [1, 3] } }), false)
  assert.equal(isSurtrModulePresetSelectionEqual(selection, { includeNone: true, moduleLevels: { 'surtr-x': [1, 2, 3] } }), false)
})

test('unavailable saved presets cannot apply partially when a module is locked or a requested stage is missing', () => {
  const preset = buildSurtrComparisonPresets(choices)[0]
  assert.equal(isSurtrComparisonPresetAvailable(preset, choices), true)
  assert.equal(isSurtrComparisonPresetAvailable(preset, choices.map(choice => ({ ...choice, unlocked: choice.type !== 'Y' }))), false)
  assert.equal(isSurtrComparisonPresetAvailable(preset, choices.filter(choice => choice.type !== 'Y')), false)
  assert.equal(isSurtrComparisonPresetAvailable(preset, choices.map(choice => ({ ...choice, levels: choice.type === 'Y' ? [1, 2] : choice.levels }))), false)
  assert.equal(isSurtrComparisonPresetAvailable({ ...preset, selection: { includeNone: false, moduleLevels: {} } }, choices), false)
  assert.equal(isSurtrComparisonPresetAvailable({ ...preset, selection: { includeNone: true, moduleLevels: { 'surtr-x': [1], 'surtr-y': [] } } },
    choices.map(choice => ({ ...choice, unlocked: choice.type !== 'Y' }))), true)
})

test('saved custom presets reload independently of the input and returned objects', () => {
  const storage = memoryStorage()
  const presets: SurtrComparisonPreset[] = [{ id: 'saved-1', name: ' Xの比較 ',
    selection: { includeNone: true, moduleLevels: { 'surtr-x': [3, 1, 3], 'surtr-y': [] } } }]
  assert.equal(writeSavedSurtrComparisonPresets(presets, storage), true)
  assert.deepEqual(presets[0].selection.moduleLevels['surtr-x'], [3, 1, 3])
  presets[0].selection.moduleLevels['surtr-x'].push(2)
  const restored = readSavedSurtrComparisonPresets(storage)
  assert.deepEqual(restored, [{ id: 'saved-1', name: 'Xの比較', selection: { includeNone: true, moduleLevels: { 'surtr-x': [1, 3], 'surtr-y': [] } } }])
  restored[0].selection.moduleLevels['surtr-x'].push(2)
  assert.deepEqual(readSavedSurtrComparisonPresets(storage)[0].selection.moduleLevels['surtr-x'], [1, 3])
  assert.equal(writeSavedSurtrComparisonPresets([], storage), true)
  assert.deepEqual(readSavedSurtrComparisonPresets(storage), [])
})

test('malformed saved JSON is rejected or normalized and storage failure never throws', () => {
  const storage = memoryStorage()
  for (const value of ['broken JSON', 'null', '{}', '[null, 1, "invalid"]']) {
    storage.setItem(SURTR_COMPARISON_PRESETS_KEY, value)
    assert.deepEqual(readSavedSurtrComparisonPresets(storage), [])
  }
  storage.setItem(SURTR_COMPARISON_PRESETS_KEY, JSON.stringify([
    { id: ' valid ', name: ' 比較 ', selection: { includeNone: true, moduleLevels: { 'surtr-x': [3, 1, '2', 0, 4, 1.5], 'surtr-y': [] } } },
    { id: 'valid', name: '重複', selection: { includeNone: true, moduleLevels: {} } },
    { id: 'empty', name: '空', selection: { includeNone: false, moduleLevels: { 'surtr-x': [] } } },
    { id: 'bad-selection', name: '不正', selection: { includeNone: 'true', moduleLevels: {} } },
  ]))
  assert.deepEqual(readSavedSurtrComparisonPresets(storage), [{ id: 'valid', name: '比較',
    selection: { includeNone: true, moduleLevels: { 'surtr-x': [1, 3], 'surtr-y': [] } } }])
  assert.deepEqual(readSavedSurtrComparisonPresets({ getItem: () => { throw new Error('blocked') } }), [])
  assert.equal(writeSavedSurtrComparisonPresets(buildSurtrComparisonPresets(choices), { setItem: () => { throw new Error('quota') } }), false)
  assert.equal(writeSavedSurtrComparisonPresets([{ id: '', name: '', selection: { includeNone: false, moduleLevels: {} } }], storage), false)
})
