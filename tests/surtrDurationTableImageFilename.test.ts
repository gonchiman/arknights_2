import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSurtrDurationTableImageFilename,
  type SurtrDurationTableImageConditions,
} from '../src/lib/surtrDurationTableImageFilename.ts'

const settings: SurtrDurationTableImageConditions = {
  level: 90, trust: 100, potential: 1, skillLevelLabel: '特化3',
  modules: ['MOD Y Lv.3'], step: 1, precision: 2,
}

test('HP table filenames retain calculation conditions and distinguish table settings', () => {
  const original = structuredClone(settings)
  const name = getSurtrDurationTableImageFilename(settings)
  assert.match(name, /スルト_S3_継続時間_特化3_昇進2Lv90_信頼100_潜在1_MODYLv\.3/)
  assert.match(name, /外部回復なし_被ダメージなし_外部HPバフなし/)
  assert.match(name, /HP推移_テーブル_1秒間隔_残HP率小数2桁_比率自動\.png$/)
  const alternatives = [
    { ...settings, step: 5 as const }, { ...settings, precision: 0 },
    { ...settings, modules: ['MOD Y Lv.2'] }, { ...settings, potential: 6 },
  ].map(value => getSurtrDurationTableImageFilename(value))
  assert.equal(new Set([name, ...alternatives]).size, alternatives.length + 1)
  assert.deepEqual(settings, original)
})

test('HP table image names normalize ratios and fit the shared filename limit', () => {
  const name = getSurtrDurationTableImageFilename(settings, 16 / 9)
  assert.match(name, /_比率16x9\.png$/)
  assert.equal(name, getSurtrDurationTableImageFilename(settings, 32 / 18))
  assert.notEqual(name, getSurtrDurationTableImageFilename(settings, 9 / 16))
  assert.ok(new TextEncoder().encode(name).length <= 240)
  assert.doesNotMatch(name, /[<>:"/\\|?*]/)
})
