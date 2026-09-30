import assert from 'node:assert/strict'
import test from 'node:test'
import { getSurtrDpsImageFilename } from '../src/lib/surtrDpsImageFilename.ts'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'

const settings = { level: 90, trust: 100, potential: 1, skillLevelLabel: '特化3', blocking: false, modules: ['未装備', 'MOD X Lv.3', 'MOD Y Lv.3'] }
test('Surtr filename records all effective DPS conditions and no synthetic identifiers', () => {
  const name = getSurtrDpsImageFilename(settings)
  for (const text of ['スルト', 'S3', 'DPS', '特化3', '昇進2Lv90', '信頼100', '潜在1', '未装備-MODXLv.3-MODYLv.3', '未ブロック', '余燼なし', '術耐性0-100']) assert.ok(name.includes(text), text)
  assert.equal(name, getSurtrDpsImageFilename({ ...settings }))
  for (const change of [{ level: 60 }, { trust: 0 }, { potential: 5 }, { skillLevelLabel: 'ランク7' }, { blocking: true }, { modules: [...settings.modules].reverse() }]) {
    assert.notEqual(name, getSurtrDpsImageFilename({ ...settings, ...change }))
  }
})
test('Surtr image filenames use shared automatic and explicit ratio naming', () => {
  const name = getSurtrDpsImageFilename(settings)
  assert.match(withChartImageAspect(name), /比率自動\.png$/)
  assert.match(withChartImageAspect(name, 16 / 9), /比率16x9\.png$/)
})
test('Surtr filename distinguishes chart kind and only active bar spacing', () => {
  const line = getSurtrDpsImageFilename({ ...settings, kind: 'line', barStep: 20 })
  assert.equal(line, getSurtrDpsImageFilename({ ...settings, kind: 'line', barStep: 10 }))
  const bars = getSurtrDpsImageFilename({ ...settings, kind: 'bar', barStep: 20 })
  assert.match(bars, /術耐性0-100刻み20_集合棒/)
  assert.notEqual(bars, line)
  assert.notEqual(bars, getSurtrDpsImageFilename({ ...settings, kind: 'bar', barStep: 10 }))
})

test('Surtr rank sampling filenames record active rank mode and only additional points', () => {
  const ranked = getSurtrDpsImageFilename({ ...settings, barStep: 'ratings' })
  assert.match(ranked, /術耐性ランク代表値_集合棒/)
  assert.notEqual(ranked, getSurtrDpsImageFilename(settings))
  assert.equal(ranked, getSurtrDpsImageFilename({ ...settings, barStep: 'ratings', selectedResistance: 5 }))
  assert.match(getSurtrDpsImageFilename({ ...settings, barStep: 'ratings', selectedResistance: 10 }), /追加術耐性10/)
  assert.match(getSurtrDpsImageFilename({ ...settings, barStep: 'ratings', selectedResistance: 100 }), /追加術耐性100/)
  assert.equal(getSurtrDpsImageFilename({ ...settings, kind: 'line', barStep: 'ratings' }), getSurtrDpsImageFilename({ ...settings, kind: 'line', barStep: 20 }))
})

test('Surtr image filenames record the range for bars, ranks and lines', () => {
  assert.equal(getSurtrDpsImageFilename(settings), getSurtrDpsImageFilename({ ...settings, resistanceRange: { min: 0, max: 100 } }))
  const resistanceRange = { min: 0, max: 50 }
  assert.match(getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange }), /術耐性0-50刻み10/)
  assert.match(getSurtrDpsImageFilename({ ...settings, barStep: 'ratings', resistanceRange }), /術耐性0-50ランク代表値/)
  assert.match(getSurtrDpsImageFilename({ ...settings, kind: 'line', resistanceRange }), /術耐性0-50_折れ線/)
  const limited = getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange })
  assert.equal(limited, getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange, selectedResistance: 75 }))
  assert.match(getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange, selectedResistance: 45 }), /追加術耐性45/)
  const shifted = { min: 15, max: 55 }
  assert.equal(getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange: shifted }),
    getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange: shifted, selectedResistance: 25 }))
  assert.match(getSurtrDpsImageFilename({ ...settings, barStep: 10, resistanceRange: shifted, selectedResistance: 20 }), /追加術耐性20/)
})

test('Surtr filename defaults match the visible initial chart settings', () => {
  assert.equal(getSurtrDpsImageFilename(settings), getSurtrDpsImageFilename({
    ...settings, kind: 'bar', barStep: 20, showValues: false, metric: 'total', precision: 0, gridStyle: 'solid', yAxis: { mode: 'zero' },
  }))
})

test('Surtr filename includes value labels only for bar charts', () => {
  const bars = getSurtrDpsImageFilename(settings)
  const labeled = getSurtrDpsImageFilename({ ...settings, showValues: true })
  assert.match(labeled, /集合棒_数値あり/)
  assert.notEqual(bars, labeled)
  assert.equal(getSurtrDpsImageFilename({ ...settings, kind: 'line' }),
    getSurtrDpsImageFilename({ ...settings, kind: 'line', showValues: true }))
})

test('Surtr filename distinguishes output metric and active baseline only', () => {
  const base = getSurtrDpsImageFilename(settings)
  assert.equal(base, getSurtrDpsImageFilename({ ...settings, metric: 'total', baselineLabel: 'MOD X Lv.3' }))
  const difference = getSurtrDpsImageFilename({ ...settings, metric: 'difference', baselineLabel: '未装備' })
  const percent = getSurtrDpsImageFilename({ ...settings, metric: 'percent', baselineLabel: '未装備' })
  assert.match(difference, /基準との差分_基準未装備/)
  assert.match(percent, /増減率_基準未装備/)
  assert.notEqual(base, difference)
  assert.notEqual(difference, percent)
  assert.notEqual(percent, getSurtrDpsImageFilename({ ...settings, metric: 'percent', baselineLabel: 'MOD X Lv.3' }))
})

test('Surtr filename records active precision, grid style and y axis range', () => {
  const base = getSurtrDpsImageFilename(settings)
  assert.notEqual(base, getSurtrDpsImageFilename({ ...settings, precision: 2 }))
  assert.match(getSurtrDpsImageFilename({ ...settings, precision: 2 }), /小数2桁/)
  assert.notEqual(base, getSurtrDpsImageFilename({ ...settings, gridStyle: 'dashed' }))
  assert.notEqual(base, getSurtrDpsImageFilename({ ...settings, gridStyle: 'none' }))
  assert.notEqual(getSurtrDpsImageFilename({ ...settings, gridStyle: 'dashed' }), getSurtrDpsImageFilename({ ...settings, gridStyle: 'none' }))
  assert.equal(base, getSurtrDpsImageFilename({ ...settings, yAxis: { mode: 'zero', min: -20, max: 5000 } }))
  const automatic = getSurtrDpsImageFilename({ ...settings, yAxis: { mode: 'auto' } })
  assert.notEqual(base, automatic)
  assert.equal(automatic, getSurtrDpsImageFilename({ ...settings, yAxis: { mode: 'auto', min: -20, max: 5000 } }))
  const manual = getSurtrDpsImageFilename({ ...settings, yAxis: { mode: 'manual', min: -20, max: 5000 } })
  assert.match(manual, /Y軸-20-5000/)
  assert.notEqual(manual, getSurtrDpsImageFilename({ ...settings, yAxis: { mode: 'manual', min: 0, max: 5000 } }))
  assert.notEqual(manual, getSurtrDpsImageFilename({ ...settings, yAxis: { mode: 'manual', min: -20, max: 4000 } }))
})

test('Surtr filename includes selected resistance only when it adds a bar group', () => {
  const bars = getSurtrDpsImageFilename({ ...settings, kind: 'bar', barStep: 20 })
  for (const selectedResistance of [null, 0, 20, 100, -1, 101, NaN]) {
    assert.equal(bars, getSurtrDpsImageFilename({ ...settings, kind: 'bar', barStep: 20, selectedResistance }))
  }
  const added = getSurtrDpsImageFilename({ ...settings, kind: 'bar', barStep: 20, selectedResistance: 35 })
  assert.match(added, /追加術耐性35/)
  assert.notEqual(added, bars)
  assert.notEqual(added, getSurtrDpsImageFilename({ ...settings, kind: 'bar', barStep: 20, selectedResistance: 37 }))
  const line = getSurtrDpsImageFilename({ ...settings, kind: 'line' })
  assert.equal(line, getSurtrDpsImageFilename({ ...settings, kind: 'line', selectedResistance: 35 }))
})

test('Surtr filename uses shared safe readable truncation for long output settings', () => {
  const filename = getSurtrDpsImageFilename({ ...settings, metric: 'percent', baselineLabel: '長い比較名'.repeat(60), precision: 3, gridStyle: 'none' })
  assert.ok(new TextEncoder().encode(filename).length <= 240)
  assert.match(filename, /ほか\d+項目\.png$/)
  assert.ok(!filename.includes('�'))
  assert.ok(!/[<>:"/\\|?*]/.test(getSurtrDpsImageFilename({ ...settings, metric: 'difference', baselineLabel: 'MOD<X>:Y/Z' })))
})
