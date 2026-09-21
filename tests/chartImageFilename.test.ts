import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createChartImageFilename, withChartImageAspect } from '../src/lib/chartImageFilename.ts'

test('設定のキー順と未指定の項目に依存せず、完全なSHA-256を使う', async () => {
  const first = await createChartImageFilename('性能分析', { kind: 'dps', build: { skill: 3, potential: 1 }, unused: undefined })
  const reordered = await createChartImageFilename('性能分析', { build: { potential: 1, skill: 3 }, kind: 'dps' })
  const expectedHash = createHash('sha256').update('{"build":{"potential":1,"skill":3},"kind":"dps"}').digest('hex')
  assert.equal(first, reordered)
  assert.equal(first, `性能分析-${expectedHash}.png`)
})

test('表示設定、ビルド、系列順、細かな数値の差をファイル名で区別する', async () => {
  const options = { kind: 'dps', showValues: true, build: { potential: 1, skill: 3 }, series: ['x', 'y'], speed: 1.0000001 }
  const variants = [
    options,
    { ...options, kind: 'damage' },
    { ...options, showValues: false },
    { ...options, build: { ...options.build, potential: 2 } },
    { ...options, series: ['y', 'x'] },
    { ...options, speed: 1.0000002 },
  ]
  const names = await Promise.all(variants.map((value) => createChartImageFilename('比較', value)))
  assert.equal(new Set(names).size, variants.length)
})

test('値の型、空の構造、負のゼロを区別する', async () => {
  const values = [1, '1', true, 'true', null, 'null', [], {}, 0, -0]
  const names = await Promise.all(values.map((value) => createChartImageFilename('比較', { value })))
  assert.equal(new Set(names).size, values.length)
  assert.notEqual(await createChartImageFilename('比較', {}), await createChartImageFilename('比較', { value: null }))
})

test('JSONで失われる数値や型と循環参照は名前に変換しない', async () => {
  const cycle: { self?: object } = {}
  cycle.self = cycle
  const invalid = [NaN, Infinity, -Infinity, 1n, Symbol('x'), () => 1, new Date(), new Map(), [undefined], Array(1), cycle]
  for (const value of invalid) {
    await assert.rejects(createChartImageFilename('比較', { value }), TypeError)
  }
  await assert.rejects(createChartImageFilename('比較', { [Symbol('x')]: 1 }), TypeError)
})

test('同じオブジェクトの再利用は循環と誤判定せず、入力を変更しない', async () => {
  const build = Object.freeze({ skill: 3, potential: 1 })
  const options = Object.freeze({ series: Object.freeze([build, build]) })
  assert.equal(
    await createChartImageFilename('比較', options),
    await createChartImageFilename('比較', { series: [{ potential: 1, skill: 3 }, { skill: 3, potential: 1 }] }),
  )
})

test('Windowsの禁止文字と予約名を避け、空の接頭辞には既定名を使う', async () => {
  for (const prefix of [' /比較<>:"\\|?*\u0000\u001f\u007f. ', 'CON', 'AUX.png', 'LPT1.txt', 'COM¹.txt']) {
    const filename = await createChartImageFilename(prefix, {})
    assert.doesNotMatch(filename, /[<>:"/\\|?*\u0000-\u001f\u007f]/)
    assert.doesNotMatch(filename, /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i)
    assert.match(filename, /-[0-9a-f]{64}\.png$/)
  }
  for (const prefix of ['', '   ', '...', '<>']) {
    assert.match(await createChartImageFilename(prefix, {}), /^chart-/)
  }
})

test('日本語や絵文字の途中で切らず、縦横比を足しても255バイトに収める', async () => {
  for (const prefix of ['比較'.repeat(100), '😀'.repeat(100), `a${'😀'.repeat(100)}`]) {
    const filename = await createChartImageFilename(prefix, {})
    const readable = filename.slice(0, -69)
    assert.ok(new TextEncoder().encode(readable).length <= 96)
    assert.equal(readable.isWellFormed(), true)
    for (const ratio of [undefined, Number.MIN_VALUE, Number.MAX_VALUE, 16 / 9]) {
      assert.ok(new TextEncoder().encode(withChartImageAspect(filename, ratio)).length < 255)
    }
  }
})

test('日時や乱数が変わっても同じ設定の名前は変わらない', async (context) => {
  context.mock.method(Date, 'now', () => 0)
  context.mock.method(Math, 'random', () => 0)
  const first = await createChartImageFilename('比較', { kind: 'dps' })
  context.mock.method(Date, 'now', () => 9_999_999_999_999)
  context.mock.method(Math, 'random', () => 0.999)
  assert.equal(await createChartImageFilename('比較', { kind: 'dps' }), first)
})

test('縦横比は実効値で区別し、自動と同じ比率の異なる記法を扱う', async () => {
  const filename = await createChartImageFilename('比較', {})
  assert.equal(withChartImageAspect(filename), filename.replace('.png', '-auto.png'))
  assert.equal(withChartImageAspect(filename, 16 / 9), withChartImageAspect(filename, 32 / 18))
  const ratios = [undefined, 1, 4 / 3, 16 / 9, 1.0000001, 1.0000002]
  assert.equal(new Set(ratios.map((ratio) => withChartImageAspect(filename, ratio))).size, ratios.length)
  assert.equal(withChartImageAspect('比較.PNG', 1), '比較-ratio1.png')
  for (const ratio of [0, -0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => withChartImageAspect(filename, ratio), TypeError)
  }
})
