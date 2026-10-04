import assert from 'node:assert/strict'
import test from 'node:test'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'
import { getSurtrRemnantExpectationImageFilename, type SurtrRemnantExpectationImageConditions } from '../src/lib/surtrRemnantExpectationImageFilename.ts'

const settings: SurtrRemnantExpectationImageConditions = {
  potential: 1, blocking: false, modules: ['未装備', 'MOD X Lv.3', 'MOD Y Lv.3'],
  resistances: [0, 20, 40, 60, 80, 100], windup: 0, ctCarry: 'time', includeRetreatHit: false,
  kind: 'bar', showValues: true, digits: 0,
}

test('expectation filenames describe CT distribution, selected resistances and assumptions', () => {
  const name = getSurtrRemnantExpectationImageFilename(settings)
  for (const part of ['スルト_余燼総ダメージ期待値', '潜在1', '未装備-MODXLv.3-MODYLv.3', '非ブロック',
    'CT一様', '術耐性0-100刻み20', '予備動作0秒', 'CT秒数維持', '退場時除外', '集合棒', '数値あり', '小数0桁']) {
    assert.ok(name.includes(part), part)
  }
  assert.equal(name, getSurtrRemnantExpectationImageFilename({ ...settings }))
  assert.match(getSurtrRemnantExpectationImageFilename({ ...settings, resistances: [0, 10, 30, 100] }), /術耐性0-10-30-100/)
})

test('all effective expectation calculation and display conditions change the name', () => {
  const name = getSurtrRemnantExpectationImageFilename(settings)
  const changes: Partial<SurtrRemnantExpectationImageConditions>[] = [
    { potential: 6 }, { blocking: true }, { modules: ['MOD Y Lv.2'] }, { modules: [...settings.modules].reverse() },
    { resistances: [0, 25, 50, 75, 100] }, { resistances: [...settings.resistances].reverse() },
    { windup: 0.2 }, { ctCarry: 'ratio' }, { includeRetreatHit: true }, { kind: 'line' },
    { showValues: false }, { digits: 1 }, { digits: 2 },
  ]
  for (const change of changes) {
    const changed = getSurtrRemnantExpectationImageFilename({ ...settings, ...change })
    assert.notEqual(name, changed)
    assert.notEqual(withChartImageAspect(name, 16 / 9), withChartImageAspect(changed, 16 / 9))
  }
})

test('line names ignore inactive bar labels and all names ignore result and selection state', () => {
  const line = getSurtrRemnantExpectationImageFilename({ ...settings, kind: 'line', showValues: true })
  assert.doesNotMatch(line, /数値あり/)
  assert.equal(line, getSurtrRemnantExpectationImageFilename({ ...settings, kind: 'line', showValues: false }))
  const snapshot = { ...settings, id: 'snapshot-a', series: [{ value: 1000 }], selectedResistance: 20, page: 2 }
  const updated = { ...snapshot, id: 'snapshot-b', series: [{ value: 1200 }], selectedResistance: 60, page: 3 }
  assert.equal(getSurtrRemnantExpectationImageFilename(snapshot), getSurtrRemnantExpectationImageFilename(updated))
})

test('expectation names reuse shared ratio suffixes and safe readable truncation', () => {
  const name = getSurtrRemnantExpectationImageFilename(settings)
  assert.match(withChartImageAspect(name), /_比率自動\.png$/)
  assert.match(withChartImageAspect(name, 16 / 9), /_比率16x9\.png$/)
  assert.equal(withChartImageAspect(name, 16 / 9), withChartImageAspect(name, 32 / 18))
  const unsafe = getSurtrRemnantExpectationImageFilename({ ...settings, modules: ['MOD<X>:Y/Z\\?*'] })
  assert.ok(!/[<>:"/\\|?*]/.test(unsafe))
  const longName = withChartImageAspect(getSurtrRemnantExpectationImageFilename({ ...settings,
    modules: ['長い比較名😀'.repeat(80)] }), 16 / 9)
  assert.ok(new TextEncoder().encode(longName).length <= 240)
  assert.match(longName, /ほか\d+項目_比率16x9\.png$/)
  assert.ok(!longName.includes('�'))
  assert.doesNotMatch(longName, /_[a-f0-9]{8,}/)
})
