import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SURTR_COMPARISON_PAGE_STATE_KEY, createDefaultSurtrComparisonPageState, parseSurtrComparisonPageState,
  readSurtrComparisonPageState, writeSurtrComparisonPageState,
} from '../src/lib/surtrComparisonPageState.ts'
import { SURTR_DPS_PAGE_STATE_KEY, createDefaultSurtrDpsPageState, writeSurtrDpsPageState } from '../src/lib/surtrDpsPageState.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('new comparison defaults keep the previous panel 5 table settings', () => {
  const old = createDefaultSurtrDpsPageState()
  const state = createDefaultSurtrComparisonPageState()
  assert.deepEqual(state.unequippedPotentials, [1])
  for (const key of ['unequippedLayout', 'unequippedMetric', 'unequippedComparisonBase', 'unequippedStep',
    'unequippedRankMode', 'unequippedColumnOrder', 'unequippedColorScale', 'unequippedColorScaleMode', 'precision'] as const) {
    assert.equal(state[key], old[key])
  }
  assert.deepEqual(state.resistanceRange, old.resistanceRange)
})

test('first visit migrates validated panel 5 settings, resolves common potential and preserves hidden selections', () => {
  const storage = memoryStorage()
  const legacy = { ...createDefaultSurtrDpsPageState(), settings: {
    level: 65, trust: 82, potential: 5, skillLevelIndex: 8, blocking: true, remnantActive: true,
  }, excluded: ['', 'uniequip_002_surtr'], moduleLevels: { uniequip_002_surtr: [1, 3], uniequip_003_surtr: [] },
    resistanceRange: { min: 20, max: 90 }, precision: 2, unequippedLayout: 'comparison' as const,
    unequippedMetric: 'percent' as const, unequippedComparisonBase: 'potential-2' as const,
    unequippedStep: 20, unequippedRankMode: 'merged' as const, unequippedColumnOrder: 'blocking' as const,
    unequippedColorScale: true, unequippedColorScaleMode: 'SQRT' as const, selectedResistance: 80 }
  writeSurtrDpsPageState(legacy, storage)
  const migrated = readSurtrComparisonPageState(storage)
  assert.deepEqual(migrated, parseSurtrComparisonPageState(legacy))
  assert.deepEqual(migrated.unequippedPotentials, [5])
  assert.equal(migrated.settings.blocking, false)
  assert.equal(migrated.settings.remnantActive, true)
  assert.deepEqual(migrated.moduleLevels, legacy.moduleLevels)
  assert.equal(storage.values.has(SURTR_COMPARISON_PAGE_STATE_KEY), false)
  storage.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify({ ...legacy, unequippedPotentials: [] }))
  assert.deepEqual(readSurtrComparisonPageState(storage).unequippedPotentials, [])
})

test('comparison and graph settings remain independent after the migration is saved', () => {
  const storage = memoryStorage()
  const graph = { ...createDefaultSurtrDpsPageState(), settings: {
    ...createDefaultSurtrDpsPageState().settings, potential: 6,
  }, unequippedPotentials: [2, 6] }
  writeSurtrDpsPageState(graph, storage)
  const originalGraph = storage.getItem(SURTR_DPS_PAGE_STATE_KEY)
  const comparison = readSurtrComparisonPageState(storage)
  comparison.settings.level = 70
  comparison.unequippedPotentials = []
  comparison.unequippedStep = 7
  writeSurtrComparisonPageState(comparison, storage)
  assert.equal(storage.getItem(SURTR_DPS_PAGE_STATE_KEY), originalGraph)
  writeSurtrDpsPageState({ ...graph, precision: 3, unequippedPotentials: [1], unequippedStep: 20 }, storage)
  assert.deepEqual(readSurtrComparisonPageState(storage), comparison)
  const reread = readSurtrComparisonPageState(storage)
  reread.settings.level = 2
  assert.equal(readSurtrComparisonPageState(storage).settings.level, 70)
})

test('invalid new storage falls back safely without resurrecting legacy selections', () => {
  const storage = memoryStorage()
  writeSurtrDpsPageState({ ...createDefaultSurtrDpsPageState(), unequippedPotentials: [6], unequippedStep: 50 }, storage)
  for (const saved of ['broken json', '', 'null', '{}']) {
    storage.setItem(SURTR_COMPARISON_PAGE_STATE_KEY, saved)
    assert.deepEqual(readSurtrComparisonPageState(storage), createDefaultSurtrComparisonPageState())
  }
  assert.deepEqual(parseSurtrComparisonPageState({ settings: { potential: 8 }, unequippedPotentials: [6, 1, 6, '2', 9],
    resistanceRange: { min: 40, max: 20 }, unequippedStep: 0 }).unequippedPotentials, [1, 6])
  assert.doesNotThrow(() => readSurtrComparisonPageState({ getItem: () => { throw new Error('unavailable') } }))
  assert.doesNotThrow(() => writeSurtrComparisonPageState(createDefaultSurtrComparisonPageState(), {
    setItem: () => { throw new Error('quota') },
  }))
})
