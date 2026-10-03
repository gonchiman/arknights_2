import assert from 'node:assert/strict'
import test from 'node:test'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'
import { getSurtrRemnantDamageImageFilename, type SurtrRemnantDamageImageConditions } from '../src/lib/surtrRemnantDamageImageFilename.ts'

const settings: SurtrRemnantDamageImageConditions = {
  potential: 1, blocking: false, modules: ['未装備', 'MOD X Lv.3', 'MOD Y Lv.3'],
  cts: [0, 0.5, 1], resistances: [0, 20, 50, 100], windup: 0,
  ctCarry: 'time', includeRetreatHit: false,
}

test('remnant damage names describe selected CT and resistance values and assumptions', () => {
  const name = getSurtrRemnantDamageImageFilename(settings)
  for (const part of ['スルト_余燼総ダメージ', '潜在1', '未装備-MODXLv.3-MODYLv.3', '非ブロック',
    '単体', 'CT0-1刻み0.5秒', '術耐性0-20-50-100', '予備動作0秒', 'CT秒数維持', '退場時除外', '集合棒']) {
    assert.ok(name.includes(part), part)
  }
  assert.equal(name, getSurtrRemnantDamageImageFilename({ ...settings }))
  assert.match(getSurtrRemnantDamageImageFilename({ ...settings, cts: [0, 0.2, 0.75] }), /CT0-0.2-0.75秒/)
})

test('every effective remnant damage condition and comparison order changes the name', () => {
  const name = getSurtrRemnantDamageImageFilename(settings)
  const changes: Partial<SurtrRemnantDamageImageConditions>[] = [
    { potential: 6 }, { blocking: true }, { modules: ['MOD Y Lv.2'] }, { modules: [...settings.modules].reverse() },
    { cts: [0, 0.25, 1] }, { cts: [...settings.cts].reverse() },
    { resistances: [0, 30, 50, 100] }, { resistances: [...settings.resistances].reverse() },
    { windup: 0.2 }, { ctCarry: 'ratio' }, { includeRetreatHit: true },
  ]
  for (const change of changes) assert.notEqual(name, getSurtrRemnantDamageImageFilename({ ...settings, ...change }))
})

test('calculated values and selection state do not enter remnant damage filenames', () => {
  const snapshot = { ...settings, id: 'snapshot-a', series: [{ value: 1000 }], selectedCt: 0.5, page: 2 }
  assert.equal(getSurtrRemnantDamageImageFilename(snapshot),
    getSurtrRemnantDamageImageFilename({ ...snapshot, id: 'snapshot-b', series: [{ value: 1200 }], selectedCt: 1, page: 3 }))
})

test('remnant damage names reuse safe truncation and shared aspect ratio suffixes', () => {
  const name = getSurtrRemnantDamageImageFilename(settings)
  assert.match(withChartImageAspect(name), /_比率自動\.png$/)
  assert.match(withChartImageAspect(name, 16 / 9), /_比率16x9\.png$/)
  assert.equal(withChartImageAspect(name, 16 / 9), withChartImageAspect(name, 32 / 18))
  const unsafe = getSurtrRemnantDamageImageFilename({ ...settings, modules: ['MOD<X>:Y/Z\\?*'] })
  assert.ok(!/[<>:"/\\|?*]/.test(unsafe))
  const longName = withChartImageAspect(getSurtrRemnantDamageImageFilename({ ...settings,
    modules: ['長い比較名😀'.repeat(80)] }), 16 / 9)
  assert.ok(new TextEncoder().encode(longName).length <= 240)
  assert.match(longName, /ほか\d+項目_比率16x9\.png$/)
  assert.ok(!longName.includes('�'))
  assert.doesNotMatch(longName, /_[a-f0-9]{8,}/)
})
