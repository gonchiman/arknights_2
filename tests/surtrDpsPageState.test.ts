import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SURTR_DPS_PAGE_STATE_KEY, createDefaultSurtrDpsPageState, parseSurtrDpsPageState,
  readSurtrDpsPageState, writeSurtrDpsPageState,
  type SurtrDpsPageState,
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
    excluded: ['', 'uniequip_002_surtr'], moduleLevels: { uniequip_002_surtr: [], uniequip_003_surtr: [1, 2, 3] },
    chartKind: 'line', barStep: 'ratings', resistanceRange: { min: 10, max: 90 },
    showValues: true, showResistanceRanks: false, gridStyle: 'dashed', precision: 3, metric: 'percent', differenceMetric: 'percent',
    requestedBaselineId: 'uniequip_003_surtr:lv2', selectedResistance: 37,
    unequippedLayout: 'comparison', unequippedMetric: 'ratio', unequippedStep: 7,
    yAxisMode: 'manual', yAxisDraft: { min: '-10.5', max: '120' },
  })
  writeSurtrDpsPageState(state, storage)
  assert.deepEqual(readSurtrDpsPageState(storage), state)
  assert.deepEqual(JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!), state)
  const restored = readSurtrDpsPageState(storage)
  restored.moduleLevels.uniequip_003_surtr.pop()
  assert.deepEqual(readSurtrDpsPageState(storage).moduleLevels.uniequip_003_surtr, [1, 2, 3])
  assert.deepEqual(readSurtrDpsPageState(storage).moduleLevels.uniequip_002_surtr, [])
})

test('legacy scalar stages and baseline migrate without restoring excluded equipment', () => {
  const storage = memoryStorage()
  const previous = { ...createDefaultSurtrDpsPageState(),
    moduleLevels: { uniequip_002_surtr: 1, uniequip_003_surtr: 2 },
    excluded: ['', 'uniequip_003_surtr'], requestedBaselineId: 'uniequip_003_surtr',
  }
  storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(previous))
  const restored = readSurtrDpsPageState(storage)
  assert.deepEqual(restored.moduleLevels, { uniequip_002_surtr: [1], uniequip_003_surtr: [2] })
  assert.deepEqual(restored.excluded, previous.excluded)
  assert.equal(restored.requestedBaselineId, 'uniequip_003_surtr:lv2')
  writeSurtrDpsPageState(restored, storage)
  assert.deepEqual(JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!), restored)
  assert.deepEqual(readSurtrDpsPageState(storage), restored)
})

test('unequipped comparison options migrate independently of the chart comparison', () => {
  const previous = { ...createDefaultSurtrDpsPageState(), metric: 'percent' }
  Reflect.deleteProperty(previous, 'unequippedLayout')
  Reflect.deleteProperty(previous, 'unequippedMetric')
  Reflect.deleteProperty(previous, 'unequippedStep')
  const restored = parseSurtrDpsPageState(previous)
  assert.equal(restored.unequippedLayout, 'combined')
  assert.equal(restored.unequippedMetric, 'difference')
  assert.equal(restored.unequippedStep, 10)
  assert.equal(restored.metric, 'percent')
  for (const unequippedLayout of ['combined', 'comparison'] as const) {
    for (const unequippedMetric of ['difference', 'ratio', 'percent'] as const) {
      const storage = memoryStorage()
      const state = { ...createDefaultSurtrDpsPageState(), unequippedLayout, unequippedMetric, metric: 'total' as const }
      writeSurtrDpsPageState(state, storage)
      assert.deepEqual(readSurtrDpsPageState(storage), state)
    }
  }
  const partial = parseSurtrDpsPageState({ unequippedLayout: 'invalid', unequippedMetric: 'ratio' })
  assert.equal(partial.unequippedLayout, 'combined')
  assert.equal(partial.unequippedMetric, 'ratio')
  const defaults = parseSurtrDpsPageState({ unequippedLayout: null, unequippedMetric: 'total' })
  assert.equal(defaults.unequippedLayout, 'combined')
  assert.equal(defaults.unequippedMetric, 'difference')
})

test('stage arrays normalize valid levels while explicit empty selections remain distinct from invalid data', () => {
  const value = {
    moduleLevels: {
      uniequip_002_surtr: [3, 1, 3, '2', 0, 4, NaN, Infinity, false, {}, null, 2],
      uniequip_003_surtr: [],
      invalidArray: [0, 4, 1.5, '1', null, [2]], invalidScalar: 4, invalidObject: { level: 2 },
      ' bad ': [1], constructor: [2], prototype: [3],
    },
    excluded: ['uniequip_003_surtr'],
  }
  const before = structuredClone(value)
  const restored = parseSurtrDpsPageState(value)
  assert.deepEqual(restored.moduleLevels, { uniequip_002_surtr: [1, 2, 3], uniequip_003_surtr: [] })
  assert.deepEqual(restored.excluded, ['uniequip_003_surtr'])
  assert.deepEqual(value, before)
  restored.moduleLevels.uniequip_002_surtr.push(1)
  assert.deepEqual(value, before)
  assert.deepEqual(parseSurtrDpsPageState(JSON.parse('{"moduleLevels":{"__proto__":[1]}}')).moduleLevels, {})
  for (const moduleLevels of [null, 2, '1', [], [1, 2, 3]]) {
    assert.deepEqual(parseSurtrDpsPageState({ moduleLevels }).moduleLevels, {})
  }
})

test('baseline migration selects the saved stage, preserves staged IDs and remains stable on repeated parsing', () => {
  const id = 'uniequip_002_surtr'
  for (const [levels, expected] of [
    [1, 1], [2, 2], [3, 3], [[3, 1, 3], 3], [[1, 2], 2], [[], 3], [[4], 3], [undefined, 3],
  ] as const) {
    const restored = parseSurtrDpsPageState({ moduleLevels: { [id]: levels }, requestedBaselineId: id })
    assert.equal(restored.requestedBaselineId, `${id}:lv${expected}`)
    assert.deepEqual(parseSurtrDpsPageState(restored), restored)
  }
  for (const requestedBaselineId of ['none', `${id}:lv1`, `${id}:lv2`, `${id}:lv3`]) {
    assert.equal(parseSurtrDpsPageState({ moduleLevels: { [id]: [1, 3] }, requestedBaselineId }).requestedBaselineId,
      requestedBaselineId)
  }
  for (const requestedBaselineId of [`${id}:lv0`, `${id}:lv4`, `${id}:lv2.5`, `${id}:lv`,
    `${id}:lv2\n`, `${id}\n:lv2`, '__proto__', ' bad ', '\n']) {
    assert.equal(parseSurtrDpsPageState({ requestedBaselineId }).requestedBaselineId, 'none')
  }
  const longId = 'x'.repeat(256)
  const restored = parseSurtrDpsPageState({ moduleLevels: { [longId]: 2 }, requestedBaselineId: longId })
  assert.equal(restored.requestedBaselineId, `${longId}:lv2`)
  assert.deepEqual(parseSurtrDpsPageState(restored), restored)
})

test('custom integer spacing and existing presets survive storage without narrowing the range', () => {
  const storage = memoryStorage()
  for (const barStep of [1, 7, 10, 20, 30, 100, 'ratings'] as const) {
    const state = { ...createDefaultSurtrDpsPageState(), barStep, resistanceRange: { min: 15, max: 55 } }
    writeSurtrDpsPageState(state, storage)
    assert.equal(JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!).barStep, barStep)
    assert.deepEqual(readSurtrDpsPageState(storage), state)
  }
})

test('previous v1 saved state restores table spacing to 10 while retaining the chart spacing', () => {
  const storage = memoryStorage()
  const defaults = createDefaultSurtrDpsPageState()
  assert.equal(defaults.unequippedStep, 10)
  assert.equal(defaults.barStep, 20)
  const previous = { ...defaults, barStep: 'ratings' as const, precision: 2 }
  Reflect.deleteProperty(previous, 'unequippedStep')
  storage.setItem('arknights-surtr-dps-page-state-v1', JSON.stringify(previous))
  const restored = readSurtrDpsPageState(storage)
  assert.deepEqual(restored, { ...previous, unequippedStep: 10 })
  writeSurtrDpsPageState(restored, storage)
  assert.deepEqual(readSurtrDpsPageState(storage), restored)
  assert.deepEqual([...storage.values.keys()], ['arknights-surtr-dps-page-state-v1'])
})

test('table custom integer spacing and ratings survive storage independently of chart spacing', () => {
  const storage = memoryStorage()
  for (const unequippedStep of [1, 7, 10, 20, 30, 100, 'ratings'] as const) {
    const barStep = unequippedStep === 'ratings' ? 7 : 'ratings'
    const state: SurtrDpsPageState = { ...createDefaultSurtrDpsPageState(), unequippedStep, barStep,
      resistanceRange: { min: 15, max: 55 } }
    writeSurtrDpsPageState(state, storage)
    const saved = JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!)
    assert.equal(saved.unequippedStep, unequippedStep)
    assert.equal(saved.barStep, barStep)
    assert.deepEqual(readSurtrDpsPageState(storage), state)
    assert.equal(parseSurtrDpsPageState({ ...state, barStep: 100 }).unequippedStep, unequippedStep)
  }
})

test('invalid table spacing defaults to 10 without changing a valid chart spacing or comparison option', () => {
  for (const unequippedStep of [undefined, null, '10', '', 'custom', 'rating', 0, 101, -20, 1.5,
    NaN, Infinity, -Infinity, true, {}, [], [10]]) {
    const restored = parseSurtrDpsPageState({ unequippedStep, barStep: 7,
      unequippedLayout: 'comparison', unequippedMetric: 'ratio' })
    assert.equal(restored.unequippedStep, 10)
    assert.equal(restored.barStep, 7)
    assert.equal(restored.unequippedLayout, 'comparison')
    assert.equal(restored.unequippedMetric, 'ratio')
  }
  const restored = parseSurtrDpsPageState({ unequippedStep: 7, barStep: 101 })
  assert.equal(restored.unequippedStep, 7)
  assert.equal(restored.barStep, 20)
})

test('rank display defaults on for previous saved state and preserves explicit on or off for both charts', () => {
  const storage = memoryStorage()
  const previousState = { ...createDefaultSurtrDpsPageState(), chartKind: 'line', precision: 2 }
  Reflect.deleteProperty(previousState, 'showResistanceRanks')
  storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(previousState))
  assert.deepEqual(readSurtrDpsPageState(storage), { ...previousState, showResistanceRanks: true })
  for (const chartKind of ['bar', 'line'] as const) {
    for (const showResistanceRanks of [true, false]) {
      const state = { ...createDefaultSurtrDpsPageState(), chartKind, showResistanceRanks }
      writeSurtrDpsPageState(state, storage)
      assert.deepEqual(readSurtrDpsPageState(storage), state)
    }
  }
  for (const showResistanceRanks of [undefined, null, 'false', 0, 1, {}]) {
    assert.equal(parseSurtrDpsPageState({ showResistanceRanks }).showResistanceRanks, true)
  }
})

test('comparison-table rank display defaults off and does not inherit chart rank visibility', () => {
  assert.equal(createDefaultSurtrDpsPageState().unequippedRankMode, 'none')
  const storage = memoryStorage()
  for (const showResistanceRanks of [true, false]) {
    const previous = { ...createDefaultSurtrDpsPageState(), showResistanceRanks, unequippedMetric: 'ratio' as const }
    Reflect.deleteProperty(previous, 'unequippedRankMode')
    storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(previous))
    assert.deepEqual(readSurtrDpsPageState(storage), { ...previous, unequippedRankMode: 'none' })
    for (const unequippedRankMode of ['none', 'inline', 'merged'] as const) {
      const state = { ...createDefaultSurtrDpsPageState(), showResistanceRanks, unequippedRankMode,
        unequippedStep: 7, unequippedMetric: 'ratio' as const }
      writeSurtrDpsPageState(state, storage)
      assert.deepEqual(readSurtrDpsPageState(storage), state)
      assert.equal(JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!).unequippedRankMode, unequippedRankMode)
    }
  }
  for (const unequippedRankMode of [undefined, null, '', 'ratings', 'INLINE', false, true, 0, 1, [], {}]) {
    const state = parseSurtrDpsPageState({ unequippedRankMode, showResistanceRanks: false, unequippedStep: 'ratings' })
    assert.equal(state.unequippedRankMode, 'none')
    assert.equal(state.showResistanceRanks, false)
    assert.equal(state.unequippedStep, 'ratings')
  }
})

test('comparison column order preserves the previous MOD-first default and restores independently of rank and metric settings', () => {
  assert.equal(createDefaultSurtrDpsPageState().unequippedColumnOrder, 'module')
  const storage = memoryStorage()
  const previous = { ...createDefaultSurtrDpsPageState(), unequippedRankMode: 'merged' as const,
    unequippedMetric: 'ratio' as const, showResistanceRanks: false }
  Reflect.deleteProperty(previous, 'unequippedColumnOrder')
  storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(previous))
  assert.deepEqual(readSurtrDpsPageState(storage), { ...previous, unequippedColumnOrder: 'module' })
  for (const unequippedColumnOrder of ['module', 'blocking'] as const) {
    const state = { ...createDefaultSurtrDpsPageState(), unequippedColumnOrder, unequippedRankMode: 'inline' as const,
      unequippedLayout: 'comparison' as const, unequippedMetric: 'percent' as const, unequippedStep: 7 }
    writeSurtrDpsPageState(state, storage)
    assert.deepEqual(readSurtrDpsPageState(storage), state)
  }
  for (const unequippedColumnOrder of [undefined, null, '', 'conditions', 'BLOCKING', false, true, 0, [], {}]) {
    const restored = parseSurtrDpsPageState({ ...previous, unequippedColumnOrder })
    assert.deepEqual(restored, { ...previous, unequippedColumnOrder: 'module' })
  }
})

test('comparison color scale is optional and preserves its own boolean independently of layout, order and chart settings', () => {
  assert.equal(createDefaultSurtrDpsPageState().unequippedColorScale, false)
  const storage = memoryStorage()
  const previous = { ...createDefaultSurtrDpsPageState(), unequippedColumnOrder: 'blocking' as const,
    unequippedRankMode: 'merged' as const, unequippedMetric: 'ratio' as const, showValues: true }
  Reflect.deleteProperty(previous, 'unequippedColorScale')
  storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(previous))
  assert.deepEqual(readSurtrDpsPageState(storage), { ...previous, unequippedColorScale: false })
  for (const unequippedColorScale of [true, false]) {
    const state = { ...createDefaultSurtrDpsPageState(), unequippedColorScale,
      unequippedColumnOrder: 'blocking' as const, unequippedLayout: 'comparison' as const, showValues: true }
    writeSurtrDpsPageState(state, storage)
    assert.deepEqual(readSurtrDpsPageState(storage), state)
  }
  for (const unequippedColorScale of [undefined, null, '', 'true', 'false', 0, 1, [], {}]) {
    assert.deepEqual(parseSurtrDpsPageState({ ...previous, unequippedColorScale }), { ...previous, unequippedColorScale: false })
  }
})

test('comparison color scale mode migrates to LINEAR and persists independently of its enabled state', () => {
  assert.equal(createDefaultSurtrDpsPageState().unequippedColorScaleMode, 'LINEAR')
  const storage = memoryStorage()
  for (const unequippedColorScale of [true, false]) {
    const previous = { ...createDefaultSurtrDpsPageState(), unequippedColorScale,
      unequippedColumnOrder: 'blocking' as const, unequippedRankMode: 'merged' as const }
    Reflect.deleteProperty(previous, 'unequippedColorScaleMode')
    storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(previous))
    assert.deepEqual(readSurtrDpsPageState(storage), { ...previous, unequippedColorScaleMode: 'LINEAR' })
    for (const unequippedColorScaleMode of ['LINEAR', 'SQRT'] as const) {
      const state = { ...createDefaultSurtrDpsPageState(), unequippedColorScale, unequippedColorScaleMode,
        unequippedMetric: 'ratio' as const }
      writeSurtrDpsPageState(state, storage)
      assert.deepEqual(readSurtrDpsPageState(storage), state)
    }
    for (const unequippedColorScaleMode of [undefined, null, '', 'linear', 'sqrt', 'LOG', false, true, 0, [], {}]) {
      assert.deepEqual(parseSurtrDpsPageState({ ...previous, unequippedColorScaleMode }),
        { ...previous, unequippedColorScaleMode: 'LINEAR' })
    }
  }
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
  assert.deepEqual(restored.moduleLevels, { uniequip_002_surtr: [1] })
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
    chartKind: 'pie', barStep: 101, precision: 20, gridStyle: 'dots', metric: 'ratio',
    differenceMetric: 'total', requestedBaselineId: '\n', yAxisMode: 'custom',
    resistanceRange: { min: 90, max: 10 }, selectedResistance: NaN,
    yAxisDraft: { min: '100', max: '20' },
  }), defaults)
  for (const barStep of ['10', '', 'custom', 0, 101, -20, 1.5, NaN, Infinity, null, true]) {
    assert.equal(parseSurtrDpsPageState({ barStep }).barStep, 20)
  }
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
  changed.moduleLevels.uniequip_002_surtr = [1]
  changed.resistanceRange.max = 10
  assert.equal(createDefaultSurtrDpsPageState().settings.level, 90)
  assert.deepEqual(createDefaultSurtrDpsPageState().excluded, [])
  assert.deepEqual(createDefaultSurtrDpsPageState().moduleLevels, {})
  assert.equal(createDefaultSurtrDpsPageState().resistanceRange.max, 100)
  const storage = memoryStorage()
  writeSurtrDpsPageState(Object.assign(createDefaultSurtrDpsPageState(), { image: {}, saving: true, aspect: '16:9' }), storage)
  const saved = JSON.parse(storage.values.get(SURTR_DPS_PAGE_STATE_KEY)!)
  assert.equal('image' in saved, false)
  assert.equal('saving' in saved, false)
  assert.equal('aspect' in saved, false)
})
