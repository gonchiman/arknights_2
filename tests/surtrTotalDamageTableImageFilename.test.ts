import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSurtrTotalDamageTableImageFilename,
  type SurtrTotalDamageTableImageFilenameOptions,
} from '../src/lib/surtrTotalDamageTableImageFilename.ts'

const options: SurtrTotalDamageTableImageFilenameOptions = {
  metadata: { skillLabel: '特化3', level: 90, trust: 100, potential: 1, blocking: false },
  times: [25, 35, 45], resistances: [0, 20, 40, 60, 80, 100],
  series: [{ id: 'none', label: '未装備' }, { id: 'x:lv3', label: 'MOD X Lv.3' }, { id: 'y:lv3', label: 'MOD Y Lv.3' }],
  assumptions: { firstAttackStart: 0.6, hitDelay: 0.3, ctCarry: 'time', includeRetreatHit: false },
  layout: 'time', precision: 1, colorScale: 'none',
}

test('readable total-damage table name records matrix axes, module stages and assumptions', () => {
  const before = structuredClone(options)
  const name = getSurtrTotalDamageTableImageFilename(options)
  assert.match(name, /スルト_S3総ダメージ表_時間別_特化3_術耐性0-100刻み20_時刻25-45刻み10s_未装備-XLv3-YLv3/)
  assert.match(name, /E2Lv90-信頼100-潜在1_未ブロック_初攻0.6s-命中0.3s_CT秒維持_退場時除外_1桁-色なし_比率自動\.png$/)
  assert.doesNotMatch(name, /[a-f0-9]{32,}/)
  assert.deepEqual(options, before)
})

test('selected layouts, matrix axes, precision, scale and timings create distinct names', () => {
  const variations: SurtrTotalDamageTableImageFilenameOptions[] = [
    options, { ...options, layout: 'module' }, { ...options, layout: 'resistance' },
    { ...options, times: [25, 30, 35] }, { ...options, resistances: [0, 40, 80] },
    { ...options, series: [{ id: 'x:lv2', label: 'MOD X Lv.2' }] },
    { ...options, metadata: { ...options.metadata, blocking: true } },
    { ...options, metadata: { ...options.metadata, potential: 6 } },
    { ...options, precision: 3 }, { ...options, colorScale: 'LINEAR' }, { ...options, colorScale: 'SQRT' },
    { ...options, assumptions: { ...options.assumptions, hitDelay: 0 } },
    { ...options, assumptions: { ...options.assumptions, firstAttackStart: 0 } },
    { ...options, assumptions: { ...options.assumptions, ctCarry: 'ratio' } },
    { ...options, assumptions: { ...options.assumptions, includeRetreatHit: true } },
  ]
  const names = variations.map(value => getSurtrTotalDamageTableImageFilename(value))
  assert.equal(new Set(names).size, variations.length)
  assert.ok(names.every(name => new TextEncoder().encode(name).length <= 240))
})

test('aspect is readable and long combinations remain within Windows filename limits', () => {
  const name = getSurtrTotalDamageTableImageFilename(options, 16 / 9)
  assert.match(name, /_比率16x9\.png$/)
  const many = { ...options, series: [{ id: 'x', label: '非常に長いMODの名前😀'.repeat(40) }] }
  const longName = getSurtrTotalDamageTableImageFilename(many, 9 / 16)
  assert.match(longName, /_ほか\d+項目_比率9x16\.png$/)
  assert.ok(new TextEncoder().encode(longName).length <= 240)
  assert.doesNotMatch(longName, /[<>:"/\\|?*]/)
})

test('winner output has its own name, identity colors and selected stages without irrelevant precision', () => {
  const winner = { ...options, layout: 'resistance' as const, displayMode: 'winner' as const, winnerColor: 'module' as const }
  const name = getSurtrTotalDamageTableImageFilename(winner)
  assert.match(name, /スルト_S3最大ダメージMOD表_術耐性別/)
  assert.match(name, /未装備-XLv3-YLv3/)
  assert.match(name, /退場時除外_MOD色_比率自動\.png$/)
  assert.doesNotMatch(name, /桁|線形色|平方根色/)
  assert.equal(getSurtrTotalDamageTableImageFilename({ ...winner, precision: 3, colorScale: 'SQRT' }), name)
  assert.notEqual(getSurtrTotalDamageTableImageFilename({ ...winner, winnerColor: 'none' }), name)
  assert.match(getSurtrTotalDamageTableImageFilename({ ...winner, winnerColor: 'none' }), /_色なし_比率自動\.png$/)
  assert.notEqual(getSurtrTotalDamageTableImageFilename({ ...winner, layout: 'time' }), name)
  assert.equal(getSurtrTotalDamageTableImageFilename({ ...winner, layout: 'module' }), name)
  assert.equal(getSurtrTotalDamageTableImageFilename({ ...options, displayMode: 'total' }), getSurtrTotalDamageTableImageFilename(options))
})
