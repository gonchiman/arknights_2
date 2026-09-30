import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SURTR_DPS_PAGE_STATE_KEY, createDefaultSurtrDpsPageState, parseSurtrDpsPageState,
  readSurtrDpsPageState, writeSurtrDpsPageState,
} from '../src/lib/surtrDpsPageState.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('DPS settings survive a route remount or reload through session storage', () => {
  const storage = memoryStorage()
  const state = createDefaultSurtrDpsPageState()
  Object.assign(state, {
    settings: { level: 60, trust: 75, potential: 6, skillLevelIndex: 7, blocking: true },
    excluded: ['', 'uniequip_002_surtr'], moduleLevels: { uniequip_003_surtr: 2 },
    chartKind: 'line', barStep: 'ratings', resistanceRange: { min: 10, max: 90 },
    showValues: true, gridStyle: 'dashed', precision: 3, metric: 'percent', differenceMetric: 'percent',
    requestedBaselineId: 'uniequip_003_surtr', selectedResistance: 37,
    yAxisMode: 'manual', yAxisDraft: { min: '-10.5', max: '120' },
  })
  writeSurtrDpsPageState(state, storage)
  assert.deepEqual(readSurtrDpsPageState(storage), state)
  assert.deepEqual(JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!), state)
  const restored = readSurtrDpsPageState(storage)
  restored.moduleLevels.uniequip_003_surtr = 1
  assert.equal(readSurtrDpsPageState(storage).moduleLevels.uniequip_003_surtr, 2)
})

test('valid fields in a partial or damaged record are retained independently', () => {
  const restored = parseSurtrDpsPageState({
    settings: { level: 80, trust: '50', potential: 0, skillLevelIndex: 1.5, blocking: true },
    excluded: ['', '', 'uniequip_002_surtr', 3, null, ' bad ', '__proto__'],
    moduleLevels: { uniequip_002_surtr: 1, uniequip_003_surtr: 4, bad: '3' },
    chartKind: 'line', barStep: 10, showValues: 'true', gridStyle: 'none', precision: 2,
    metric: 'difference', differenceMetric: 'percent', requestedBaselineId: 'none',
    yAxisMode: 'auto', yAxisDraft: { min: ' -25 ', max: '200.5' },
  })
  assert.deepEqual(restored.settings, { level: 80, trust: 100, potential: 1, skillLevelIndex: 9, blocking: true })
  assert.deepEqual(restored.excluded, ['', 'uniequip_002_surtr'])
  assert.deepEqual(restored.moduleLevels, { uniequip_002_surtr: 1 })
  assert.equal(restored.chartKind, 'line')
  assert.equal(restored.barStep, 10)
  assert.equal(restored.precision, 2)
  assert.equal(restored.showValues, false)
  assert.equal(restored.metric, 'difference')
  assert.equal(restored.yAxisMode, 'auto')
  assert.deepEqual(restored.yAxisDraft, { min: '-25', max: '200.5' })
})

test('invalid or UI-inaccessible enum and numeric values fall back safely', () => {
  const defaults = createDefaultSurtrDpsPageState()
  for (const value of [null, undefined, [], true, 7, 'text']) assert.deepEqual(parseSurtrDpsPageState(value), defaults)
  assert.deepEqual(parseSurtrDpsPageState({
    settings: { level: Infinity, trust: -1, potential: 7, skillLevelIndex: 10, blocking: 1 },
    chartKind: 'pie', barStep: 1, precision: 20, gridStyle: 'dots', metric: 'ratio',
    differenceMetric: 'total', requestedBaselineId: '\n', yAxisMode: 'custom',
    resistanceRange: { min: 90, max: 10 }, selectedResistance: NaN,
    yAxisDraft: { min: '100', max: '20' },
  }), defaults)
  for (const barStep of ['10', 0, 30, -20, NaN]) assert.equal(parseSurtrDpsPageState({ barStep }).barStep, 20)
  for (const precision of [-1, 4, 0.5, '2', NaN]) assert.equal(parseSurtrDpsPageState({ precision }).precision, 0)
})

test('selected resistance is retained only inside the restored integer range', () => {
  for (const selectedResistance of [10, 50, 80]) {
    assert.equal(parseSurtrDpsPageState({ resistanceRange: { min: 10, max: 80 }, selectedResistance }).selectedResistance, selectedResistance)
  }
  for (const selectedResistance of [9, 81, 30.5, '30', Infinity, null]) {
    assert.equal(parseSurtrDpsPageState({ resistanceRange: { min: 10, max: 80 }, selectedResistance }).selectedResistance, null)
  }
  for (const resistanceRange of [{ min: -1, max: 100 }, { min: 0, max: 101 }, { min: 2.5, max: 50 }, { min: 10, max: 10 }]) {
    assert.deepEqual(parseSurtrDpsPageState({ resistanceRange }).resistanceRange, { min: 0, max: 100 })
  }
})

test('manual axis inputs must be finite and ordered, while partial input uses defaults', () => {
  assert.deepEqual(parseSurtrDpsPageState({ yAxisDraft: { min: '-20' } }).yAxisDraft, { min: '-20', max: '4000' })
  for (const yAxisDraft of [{ min: '', max: 'oops' }, { min: 'Infinity', max: 'NaN' },
    { min: '1', max: '1' }, { min: '-1e308', max: '1e308' }]) {
    assert.deepEqual(parseSurtrDpsPageState({ yAxisDraft }).yAxisDraft, { min: '0', max: '4000' })
  }
})

test('malformed JSON, missing storage and denied reads or writes do not break the page', () => {
  const storage = memoryStorage()
  const defaults = createDefaultSurtrDpsPageState()
  for (const value of ['', '{', 'null', '[]', 'false', '"text"']) {
    storage.values.set(SURTR_DPS_PAGE_STATE_KEY, value)
    assert.deepEqual(readSurtrDpsPageState(storage), defaults)
  }
  const denied = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
  assert.deepEqual(readSurtrDpsPageState(denied), defaults)
  assert.doesNotThrow(() => writeSurtrDpsPageState(defaults, denied))
  assert.deepEqual(readSurtrDpsPageState(), defaults)
  assert.doesNotThrow(() => writeSurtrDpsPageState(defaults))
})

test('default objects are independent and transient properties are never persisted', () => {
  const changed = createDefaultSurtrDpsPageState()
  changed.settings.level = 1
  changed.excluded.push('')
  changed.resistanceRange.max = 10
  assert.equal(createDefaultSurtrDpsPageState().settings.level, 90)
  assert.deepEqual(createDefaultSurtrDpsPageState().excluded, [])
  assert.equal(createDefaultSurtrDpsPageState().resistanceRange.max, 100)
  const storage = memoryStorage()
  writeSurtrDpsPageState(Object.assign(createDefaultSurtrDpsPageState(), { image: {}, saving: true, aspect: '16:9' }), storage)
  const saved = JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!)
  assert.equal('image' in saved, false)
  assert.equal('saving' in saved, false)
  assert.equal('aspect' in saved, false)
})
