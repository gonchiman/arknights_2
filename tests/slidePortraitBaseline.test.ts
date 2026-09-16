import assert from 'node:assert/strict'
import test from 'node:test'
import {
  containRect,
  legacyPortraitImageRect,
  portraitImageRect,
  slideLayout,
  transformPortraitRect,
} from '../src/lib/slideComposer.ts'
import {
  DEFAULT_PORTRAIT_BASELINE,
  readPortraitBaseline,
  writePortraitBaseline,
  type PortraitBaseline,
} from '../src/lib/slidePortraitBaseline.ts'

const STORAGE_KEY = 'arknights-slide-portrait-baseline-v2'
const LEGACY_STORAGE_KEY = 'arknights-slide-portrait-baseline-v1'

function memoryStorage(initial?: string, key = STORAGE_KEY) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(key, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

test('the observed portrait layout is returned as a fresh legacy default when no baseline is saved', () => {
  const storage = memoryStorage()
  const first = readPortraitBaseline(storage)
  assert.deepEqual(first, { scale: 165, x: 100, y: 100, behindCaption: true, coordinateSpace: 'legacy' })
  first.x = 0
  assert.deepEqual(readPortraitBaseline(storage), DEFAULT_PORTRAIT_BASELINE)
  assert.equal(DEFAULT_PORTRAIT_BASELINE.x, 100)
  assert.equal(storage.values.size, 0)
})

test('version 1 saved positions retain their original coordinate space and values without modifying storage', () => {
  const legacy = { version: 1, scale: 132.5, x: 24, y: 67, behindCaption: false }
  const stored = JSON.stringify(legacy)
  const storage = memoryStorage(stored, LEGACY_STORAGE_KEY)
  assert.deepEqual(readPortraitBaseline(storage), {
    scale: 132.5, x: 24, y: 67, behindCaption: false, coordinateSpace: 'legacy',
  })
  assert.equal(storage.values.size, 1)
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), stored)
  assert.equal(storage.getItem(STORAGE_KEY), null)
})

test('large slide coordinates and scale round trip without persisting images, URLs or modifying old settings', () => {
  const legacyStored = JSON.stringify({ version: 1, scale: 165, x: 100, y: 100, behindCaption: true })
  const storage = memoryStorage(legacyStored, LEGACY_STORAGE_KEY)
  storage.setItem('unrelated-setting', 'keep')
  const baseline = {
    scale: 495, x: -125.5, y: 1234, behindCaption: false, coordinateSpace: 'slide' as const,
    image: 'data:image/png;base64,example', url: 'blob:example',
  }
  assert.equal(writePortraitBaseline(baseline, storage), true)
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)!), {
    version: 2, scale: 495, x: -125.5, y: 1234, behindCaption: false, coordinateSpace: 'slide',
  })
  const restored = readPortraitBaseline(storage)
  assert.deepEqual(restored, {
    scale: 495, x: -125.5, y: 1234, behindCaption: false, coordinateSpace: 'slide',
  })
  restored.scale = 50
  assert.equal(readPortraitBaseline(storage).scale, 495)
  assert.equal(storage.getItem('unrelated-setting'), 'keep')
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), legacyStored)
  assert.equal(storage.values.size, 3)
})

test('both coordinate spaces accept valid baselines without imposing slide scale or position limits', () => {
  const storage = memoryStorage()
  const baselines: PortraitBaseline[] = [
    { scale: 50, x: 0, y: 0, behindCaption: false, coordinateSpace: 'legacy' },
    { scale: 200, x: 100, y: 100, behindCaption: true, coordinateSpace: 'legacy' },
    { scale: 0.25, x: -1920, y: -1080, behindCaption: false, coordinateSpace: 'slide' },
    { scale: 330, x: 2000, y: 1500, behindCaption: true, coordinateSpace: 'slide' },
  ]
  for (const baseline of baselines) {
    assert.equal(writePortraitBaseline(baseline, storage), true)
    assert.deepEqual(readPortraitBaseline(storage), baseline)
  }
})

test('an enlarged and moved legacy portrait remains unchanged after capture and supports further independent transforms', () => {
  const storage = memoryStorage(JSON.stringify({
    version: 1, scale: 165, x: 100, y: 100, behindCaption: true,
  }), LEGACY_STORAGE_KEY)
  const legacy = readPortraitBaseline(storage)
  const box = slideLayout().portrait
  const fitted = containRect(530, 930, box, 'bottom')
  const original = legacyPortraitImageRect(530, 930, box, legacy.scale, legacy.x, legacy.y)
  const transformed = transformPortraitRect(original, 150, -200, 200)
  const captured: PortraitBaseline = {
    scale: transformed.height / fitted.height * 100,
    x: transformed.x,
    y: transformed.y,
    behindCaption: true,
    coordinateSpace: 'slide',
  }
  assert.equal(writePortraitBaseline(captured, storage), true)
  const restoredBaseline = readPortraitBaseline(storage)
  assert.equal(restoredBaseline.coordinateSpace, 'slide')
  const restored = portraitImageRect(
    530, 930, box, restoredBaseline.scale, restoredBaseline.x, restoredBaseline.y,
  )
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    assert.ok(Math.abs(restored[key] - transformed[key]) < 1e-9, `${key} must survive baseline capture`)
  }
  const enlargedAgain = transformPortraitRect(restored, 200, 0, 200)
  assert.equal(enlargedAgain.width, restored.width * 2)
  assert.equal(enlargedAgain.height, restored.height * 2)
  assert.ok(Math.abs(enlargedAgain.y - restored.y - 200) < 1e-9)
  assert.ok(Math.abs(enlargedAgain.x + enlargedAgain.width / 2 - (restored.x + restored.width / 2)) < 1e-9)
})

test('malformed or unsupported version 2 settings fall back to the default without reviving stale version 1 settings', () => {
  const valid = { version: 2, scale: 330, x: -50, y: 150, behindCaption: true, coordinateSpace: 'slide' }
  const invalidValues = [
    '', '{invalid', 'null', '[]', 'true',
    JSON.stringify({ ...valid, version: 1 }),
    JSON.stringify({ ...valid, version: '2' }),
    JSON.stringify({ ...valid, version: undefined }),
    JSON.stringify({ ...valid, scale: 0 }),
    JSON.stringify({ ...valid, scale: -1 }),
    JSON.stringify({ ...valid, scale: '330' }),
    JSON.stringify({ ...valid, x: null }),
    JSON.stringify({ ...valid, y: '0' }),
    JSON.stringify({ ...valid, behindCaption: 1 }),
    JSON.stringify({ ...valid, coordinateSpace: undefined }),
    JSON.stringify({ ...valid, coordinateSpace: 'other' }),
    JSON.stringify({ ...valid, coordinateSpace: 'legacy' }),
    '{"version":2,"scale":1e999,"x":100,"y":100,"behindCaption":true,"coordinateSpace":"slide"}',
  ]
  for (const value of invalidValues) {
    const storage = memoryStorage(value)
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, scale: 100, x: 10, y: 20, behindCaption: false }))
    assert.deepEqual(readPortraitBaseline(storage), DEFAULT_PORTRAIT_BASELINE, value)
  }
})

test('invalid version 1 settings cannot migrate to the new coordinate model', () => {
  const valid = { version: 1, scale: 165, x: 100, y: 100, behindCaption: true }
  const invalidValues = [
    '', '{invalid', 'null', '[]',
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, scale: 49 }),
    JSON.stringify({ ...valid, scale: 201 }),
    JSON.stringify({ ...valid, x: -1 }),
    JSON.stringify({ ...valid, y: 101 }),
    JSON.stringify({ ...valid, behindCaption: 'true' }),
  ]
  for (const value of invalidValues) {
    assert.deepEqual(readPortraitBaseline(memoryStorage(value, LEGACY_STORAGE_KEY)), DEFAULT_PORTRAIT_BASELINE, value)
  }
})

test('invalid writes preserve the existing saved baseline', () => {
  const storage = memoryStorage()
  assert.equal(writePortraitBaseline({ ...DEFAULT_PORTRAIT_BASELINE }, storage), true)
  const saved = storage.getItem(STORAGE_KEY)
  for (const invalid of [
    { ...DEFAULT_PORTRAIT_BASELINE, scale: NaN },
    { ...DEFAULT_PORTRAIT_BASELINE, scale: Infinity },
    { ...DEFAULT_PORTRAIT_BASELINE, scale: 201 },
    { ...DEFAULT_PORTRAIT_BASELINE, x: -0.1 },
    { ...DEFAULT_PORTRAIT_BASELINE, y: 100.1 },
    { ...DEFAULT_PORTRAIT_BASELINE, coordinateSpace: 'slide', scale: 0 },
    { ...DEFAULT_PORTRAIT_BASELINE, coordinateSpace: 'slide', x: Infinity },
    { ...DEFAULT_PORTRAIT_BASELINE, coordinateSpace: 'slide', y: NaN },
    { ...DEFAULT_PORTRAIT_BASELINE, behindCaption: 'true' },
    null,
  ]) {
    assert.equal(writePortraitBaseline(invalid as PortraitBaseline, storage), false)
    assert.equal(storage.getItem(STORAGE_KEY), saved)
  }
})

test('unavailable, blocked or full storage does not throw or claim to have saved a baseline', () => {
  assert.deepEqual(readPortraitBaseline(), DEFAULT_PORTRAIT_BASELINE)
  assert.equal(writePortraitBaseline({ ...DEFAULT_PORTRAIT_BASELINE }), false)
  const blocked = {
    getItem: () => { throw new Error('Blocked') },
    setItem: () => { throw new Error('Quota exceeded') },
  }
  assert.deepEqual(readPortraitBaseline(blocked), DEFAULT_PORTRAIT_BASELINE)
  assert.equal(writePortraitBaseline({ ...DEFAULT_PORTRAIT_BASELINE }, blocked), false)
})
