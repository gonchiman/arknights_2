import test from 'node:test'
import assert from 'node:assert/strict'
import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from '../src/lib/chartImageFilename.ts'

test('設定を読める名前にし、ハッシュも保存時刻も付けない', () => {
  const filename = createChartImageFilename('GG', ['S3特化3', '総ダメージ', 'MODなし-X3-Y3', 'HP500-2000-4000', '術耐性0-50刻み10'])
  assert.equal(filename, 'GG_S3特化3_総ダメージ_MODなし-X3-Y3_HP500-2000-4000_術耐性0-50刻み10.png')
  assert.doesNotMatch(filename, /[0-9a-f]{64}/)
})

test('省略項目は入れず、値と比較順序の違いは名前に残す', () => {
  assert.equal(createChartImageFilename('敵', ['HP', null, false, undefined, '', 0]), '敵_HP_0.png')
  assert.notEqual(createChartImageFilename('GG', ['MODX3-Y3']), createChartImageFilename('GG', ['MODY3-X3']))
  assert.notEqual(createChartImageFilename('比較', [1.0000001]), createChartImageFilename('比較', [1.0000002]))
  assert.equal(createChartImageFilename('比較', [-1, 'Y軸-100--10']), '比較_-1_Y軸-100--10.png')
  assert.notEqual(createChartImageFilename('比較', [-1]), createChartImageFilename('比較', [1]))
  const parts = Object.freeze(['HP', '割合表示'])
  assert.equal(createChartImageFilename('敵', parts), '敵_HP_割合表示.png')
  assert.deepEqual(parts, ['HP', '割合表示'])
})

test('数値一覧は全体の等差数列だけをまとめ、不規則な値と順序を保つ', () => {
  assert.equal(formatChartFilenameValues([0, 10, 20, 30, 40, 50]), '0-50刻み10')
  assert.equal(formatChartFilenameValues([30, 20, 10]), '30-10刻み-10')
  assert.equal(formatChartFilenameValues([500, 2000, 4000, 6000, 10000, 20000]), '500-2000-4000-6000-10000-20000')
  assert.equal(formatChartFilenameValues([0, 20, 10]), '0-20-10')
  assert.equal(formatChartFilenameValues([1, 1, 1]), '1-1-1')
  assert.equal(formatChartFilenameValues([0, 50]), '0-50')
  assert.equal(formatChartFilenameValues([0]), '0')
  assert.equal(formatChartFilenameValues([]), '')
})

test('非有限値を名前にしない', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => createChartImageFilename('比較', [value]), TypeError)
    assert.throws(() => formatChartFilenameValues([value]), TypeError)
  }
})

test('Windowsの禁止文字と予約名を避け、空の名前にも既定名を付ける', () => {
  for (const prefix of [' /比較<>:"\\|?*\u0000\u001f\u007f. ', 'CON', 'AUX.png', 'LPT1.txt', 'COM¹.txt']) {
    const filename = createChartImageFilename(prefix)
    assert.doesNotMatch(filename, /[<>:"/\\|?*\u0000-\u001f\u007f]/)
    assert.doesNotMatch(filename, /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i)
    assert.ok(filename.endsWith('.png'))
  }
  for (const prefix of ['', '   ', '...', '<>']) assert.equal(createChartImageFilename(prefix), 'グラフ.png')
  assert.equal(createChartImageFilename('GG', ['S3 特化3', '時間1.5s']), 'GG_S3特化3_時間1.5s.png')
})

test('長い名前は省略を明示し、Unicodeと比率を壊さず240バイト以内に収める', () => {
  for (const prefix of ['比較'.repeat(100), '😀'.repeat(100), 'CON.' + '名'.repeat(100), 'GG']) {
    const filename = createChartImageFilename(prefix, ['S3特化3', 'HP' + '500-'.repeat(100), '割合表示'])
    assert.match(filename, /ほか\d+項目\.png$/)
    assert.equal(filename.isWellFormed(), true)
    for (const ratio of [undefined, Number.MIN_VALUE, Number.MAX_VALUE, 16 / 9]) {
      const withAspect = withChartImageAspect(filename, ratio)
      assert.ok(new TextEncoder().encode(withAspect).length <= 240, withAspect)
      assert.equal(withAspect.isWellFormed(), true)
      assert.equal((withAspect.match(/ほか\d+項目/g) ?? []).length, 1)
      assert.match(withAspect, /_比率.+\.png$/)
    }
  }
  assert.match(createChartImageFilename('GG', ['S3特化3', 'X'.repeat(300)]), /^GG_S3特化3_ほか1項目\.png$/)
})

test('日時や乱数が変わっても同じ条件の名前は変わらない', (context) => {
  context.mock.method(Date, 'now', () => 0)
  context.mock.method(Math, 'random', () => 0)
  const first = createChartImageFilename('比較', ['総ダメージ'])
  context.mock.method(Date, 'now', () => 9_999_999_999_999)
  context.mock.method(Math, 'random', () => 0.999)
  assert.equal(createChartImageFilename('比較', ['総ダメージ']), first)
})

test('比率は自動または整数比で読み取れ、同じ比率は同じ名前になる', () => {
  assert.equal(withChartImageAspect('比較.png'), '比較_比率自動.png')
  assert.equal(withChartImageAspect('比較.PNG', 16 / 9), '比較_比率16x9.png')
  assert.equal(withChartImageAspect('比較.png', 32 / 18), '比較_比率16x9.png')
  assert.equal(withChartImageAspect('比較.png', 1), '比較_比率1x1.png')
  assert.equal(withChartImageAspect('比較.png', 21 / 9), '比較_比率7x3.png')
  assert.equal(withChartImageAspect('比較_比率16x9.png', 2), '比較_比率2x1.png')
  const ratios = [undefined, 1, 4 / 3, 16 / 9, 1.0000001, 1.0000002]
  assert.equal(new Set(ratios.map((ratio) => withChartImageAspect('比較.png', ratio))).size, ratios.length)
  for (const ratio of [0, -0, -1, NaN, Infinity, -Infinity]) assert.throws(() => withChartImageAspect('比較.png', ratio), TypeError)
})
