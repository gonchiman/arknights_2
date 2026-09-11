import assert from 'node:assert/strict'
import test from 'node:test'
import { getPanelStorageKey, readPanelOpen, writePanelOpen } from '../src/lib/panelPreferences.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('panels with the same ID keep independent preferences on different pages', () => {
  const storage = memoryStorage()
  const guide = getPanelStorageKey('goldenglow-guide', 'gg-operator-info')
  const performance = getPanelStorageKey('goldenglow-performance', 'gg-operator-info')
  writePanelOpen(guide, false, storage)
  writePanelOpen(performance, true, storage)
  assert.equal(readPanelOpen(guide, true, storage), false)
  assert.equal(readPanelOpen(performance, false, storage), true)
})

test('new and malformed preferences preserve both open and closed defaults', () => {
  const storage = memoryStorage()
  for (const value of [undefined, '', 'invalid', '0', 'null', '{}']) {
    if (value === undefined) storage.values.delete('panel')
    else storage.values.set('panel', value)
    assert.equal(readPanelOpen('panel', true, storage), true)
    assert.equal(readPanelOpen('panel', false, storage), false)
  }
})

test('both saved states are restored independently of the default', () => {
  const storage = memoryStorage()
  for (const open of [true, false]) {
    writePanelOpen('panel', open, storage)
    assert.equal(readPanelOpen('panel', !open, storage), open)
  }
})

test('all five existing target-switch preferences are retained without migration', () => {
  const storage = memoryStorage()
  for (const [panel, legacy] of [
    ['ggs-output', 'conditions'], ['ggs-results-panel', 'results'], ['ggs-grid-panel', 'grid'],
    ['ggs-chart-panel', 'chart'], ['ggs-trial-panel', 'trial'],
  ]) {
    const legacyKey = `arknights-goldenglow-target-switch-panel-${legacy}-open-v1`
    storage.values.set(legacyKey, 'false')
    const key = getPanelStorageKey('goldenglow-target-switch', panel)
    assert.equal(key, legacyKey)
    assert.equal(readPanelOpen(key, true, storage), false)
    writePanelOpen(key, true, storage)
    assert.equal(storage.values.get(legacyKey), 'true')
  }
})

test('separator characters and legacy-like IDs cannot collide across scopes', () => {
  assert.notEqual(getPanelStorageKey('a:b', 'c'), getPanelStorageKey('a', 'b:c'))
  assert.notEqual(getPanelStorageKey('damage', 'ggs-grid-panel'), getPanelStorageKey('goldenglow-target-switch', 'ggs-grid-panel'))
  assert.match(getPanelStorageKey('goldenglow-target-switch', '__proto__'), /^arknights-panel-open-v1:/)
})

test('unavailable storage and read/write failures leave defaults usable', () => {
  const denied = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
  assert.equal(readPanelOpen('panel', false, denied), false)
  assert.equal(readPanelOpen('panel', true, denied), true)
  assert.doesNotThrow(() => writePanelOpen('panel', false, denied))
  assert.equal(readPanelOpen('panel', false), false)
  assert.doesNotThrow(() => writePanelOpen('panel', true))
})
