import assert from 'node:assert/strict'
import test from 'node:test'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'
import { getSurtrRemnantAttackImageFilename, type SurtrRemnantAttackImageConditions } from '../src/lib/surtrRemnantAttackImageFilename.ts'

const settings: SurtrRemnantAttackImageConditions = {
  potential: 1, blocking: false, modules: ['未装備', 'MOD X Lv.3', 'MOD Y Lv.3'],
  windup: 0, ctCarry: 'time', includeRetreatHit: false,
  kind: 'grouped-bar', step: 0.05, showValues: true, showBoundaries: false,
}

test('remnant filenames describe effective calculation conditions in comparison order', () => {
  const name = getSurtrRemnantAttackImageFilename(settings)
  for (const text of ['スルト_余燼命中回数', '潜在1', '未装備-MODXLv.3-MODYLv.3', '非ブロック',
    '予備動作0秒', 'CT秒数維持', '退場時除外', '集合棒', 'CT刻み0.05秒', '数値あり']) {
    assert.ok(name.includes(text), text)
  }
  assert.equal(name, getSurtrRemnantAttackImageFilename({ ...settings }))
  for (const patch of [{ potential: 5 }, { blocking: true }, { windup: 0.2 }, { ctCarry: 'ratio' as const },
    { includeRetreatHit: true }, { modules: [...settings.modules].reverse() }, { modules: ['MOD Y Lv.2'] }]) {
    assert.notEqual(name, getSurtrRemnantAttackImageFilename({ ...settings, ...patch }))
  }
})

test('remnant filenames include CT sampling only for grouped bars', () => {
  const bars = getSurtrRemnantAttackImageFilename(settings)
  assert.notEqual(bars, getSurtrRemnantAttackImageFilename({ ...settings, step: 0.1 }))
  const names = new Set<string>([bars])
  for (const kind of ['step', 'bands'] as const) {
    const name = getSurtrRemnantAttackImageFilename({ ...settings, kind })
    names.add(name)
    assert.doesNotMatch(name, /CT刻み/)
    assert.equal(name, getSurtrRemnantAttackImageFilename({ ...settings, kind, step: 0.01 }))
  }
  assert.equal(names.size, 3)
})

test('value and boundary labels alter only the chart kinds where they are visible', () => {
  for (const kind of ['grouped-bar', 'bands'] as const) {
    const values = getSurtrRemnantAttackImageFilename({ ...settings, kind, showValues: true })
    assert.match(values, /数値あり/)
    assert.notEqual(values, getSurtrRemnantAttackImageFilename({ ...settings, kind, showValues: false }))
  }
  assert.equal(getSurtrRemnantAttackImageFilename({ ...settings, kind: 'step', showValues: true }),
    getSurtrRemnantAttackImageFilename({ ...settings, kind: 'step', showValues: false }))
  for (const kind of ['step', 'bands'] as const) {
    const boundaries = getSurtrRemnantAttackImageFilename({ ...settings, kind, showBoundaries: true })
    assert.match(boundaries, /境界CT表示/)
    assert.notEqual(boundaries, getSurtrRemnantAttackImageFilename({ ...settings, kind, showBoundaries: false }))
  }
  assert.equal(getSurtrRemnantAttackImageFilename({ ...settings, showBoundaries: true }),
    getSurtrRemnantAttackImageFilename({ ...settings, showBoundaries: false }))
})

test('remnant filenames use shared aspect ratios and safe readable truncation', () => {
  const name = getSurtrRemnantAttackImageFilename(settings)
  assert.match(withChartImageAspect(name), /_比率自動\.png$/)
  assert.match(withChartImageAspect(name, 16 / 9), /_比率16x9\.png$/)
  assert.equal(withChartImageAspect(name, 16 / 9), withChartImageAspect(name, 32 / 18))
  assert.ok(!/[<>:"/\\|?*]/.test(getSurtrRemnantAttackImageFilename({ ...settings, modules: ['MOD<X>:Y/Z\\?*'] })))
  const longName = withChartImageAspect(getSurtrRemnantAttackImageFilename({ ...settings,
    modules: ['長い比較名😀'.repeat(80)], kind: 'bands', showBoundaries: true }), 16 / 9)
  assert.ok(new TextEncoder().encode(longName).length <= 240)
  assert.match(longName, /ほか\d+項目_比率16x9\.png$/)
  assert.ok(!longName.includes('�'))
  assert.doesNotMatch(longName, /_[a-f0-9]{8,}/)
})
