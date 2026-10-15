import test from 'node:test'
import assert from 'node:assert/strict'
import { getSurtrDurationImageFilename, type SurtrDurationImageConditions } from '../src/lib/surtrDurationImageFilename.ts'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'

const settings: SurtrDurationImageConditions = { level: 90, trust: 100, potential: 1, skillLevelLabel: '特化3',
  modules: ['未装備'] }

test('duration filenames describe the calculation and selected module for HP curves', () => {
  const name = getSurtrDurationImageFilename(settings)
  assert.match(name, /スルト_S3_継続時間_特化3/)
  assert.match(name, /外部回復なし_被ダメージなし_外部HPバフなし/)
  assert.match(name, /HP推移/)
  assert.doesNotMatch(name, /時間内訳棒|数値あり/)
  assert.equal(name, getSurtrDurationImageFilename({ ...settings }))
  for (const patch of [ {potential: 3}, {skillLevelLabel:'ランク7'}, {modules:['MOD X Lv.3']},
    {modules:['MOD Y Lv.3']}, {modules:['MOD Y Lv.2']} ]) {
    assert.notEqual(name, getSurtrDurationImageFilename({ ...settings, ...patch }))
  }
})

test('duration images use the shared aspect ratio filename suffix', () => {
  const name = getSurtrDurationImageFilename(settings)
  assert.match(withChartImageAspect(name), /_比率自動\.png$/)
  assert.match(withChartImageAspect(name, 16 / 9), /_比率16x9\.png$/)
})

test('duration graph filenames distinguish the selected visible range', () => {
  const remnant = getSurtrDurationImageFilename({ ...settings, chartRange: 'remnant' })
  const retreat = getSurtrDurationImageFilename({ ...settings, chartRange: 'retreat' })
  assert.match(remnant, /継続時間_素質2発動まで_特化3/)
  assert.match(retreat, /継続時間_退場まで_特化3/)
  assert.notEqual(remnant, retreat)
  assert.equal(remnant, getSurtrDurationImageFilename({ ...settings, chartRange: 'remnant' }))
  assert.doesNotMatch(getSurtrDurationImageFilename(settings), /素質2発動まで|退場まで/)
})

test('duration graph range remains identifiable when long conditions are shortened', () => {
  const comparisonConditions = Array.from({ length: 16 }, (_, index) => `比較${index + 1}・アンセルS1発動0秒・サルカズ大剣士初回2秒`)
  for (const chartRange of ['remnant', 'retreat'] as const) {
    const name = withChartImageAspect(getSurtrDurationImageFilename({ ...settings, comparisonConditions, chartRange }), 16 / 9)
    assert.match(name, chartRange === 'remnant' ? /継続時間_素質2発動まで_/ : /継続時間_退場まで_/)
    assert.match(name, /ほか\d+項目_比率16x9\.png$/)
  }
})
