import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSurtrUnequippedTableImageFilename,
  type SurtrUnequippedTableImageMetadata,
} from '../src/lib/surtrUnequippedTableImageFilename.ts'

const metadata: SurtrUnequippedTableImageMetadata = {
  skillLabel: '特化3', level: 90, trust: 100, potential: 1, blocking: false,
}
const options = {
  metadata,
  series: [
    { id: 'none', label: '未装備' },
    { id: 'x:lv3', label: 'MOD X Lv.3' },
    { id: 'y:lv3', label: 'MOD Y Lv.3' },
  ],
  resistances: Array.from({ length: 11 }, (_, index) => index * 10),
  metric: 'difference' as const,
  layout: 'combined' as const,
  precision: 0,
}

test('未装備比較表の計算条件・MOD段階・術耐性・形式・精度・自動比率を読める名前にする', () => {
  assert.equal(getSurtrUnequippedTableImageFilename(options),
    'スルト_S3_未装備比較表_特化3_DPS差_DPS＋比較値_昇進2Lv90_信頼100_潜在1_未ブロック_MODXLv.3-MODYLv.3_術耐性0-100刻み10_小数0桁_比率自動.png')
  assert.doesNotMatch(getSurtrUnequippedTableImageFilename(options), /x-lv|y-lv|:lv|none/)
})

test('未装備基準を明示しても従来の正確な画像名を変更しない', () => {
  const expected = 'スルト_S3_未装備比較表_特化3_DPS差_DPS＋比較値_昇進2Lv90_信頼100_潜在1_未ブロック_MODXLv.3-MODYLv.3_術耐性0-100刻み10_小数0桁_比率自動.png'
  for (const comparisonBase of [undefined, 'unequipped'] as const) {
    assert.equal(getSurtrUnequippedTableImageFilename({ ...options, comparisonBase }), expected)
    assert.equal(getSurtrUnequippedTableImageFilename({ ...options, comparisonBase }, 16 / 9),
      expected.replace('比率自動', '比率16x9'))
  }
})

test('前段階を基準にした比較表は基本名で識別し、選択したMOD段階と条件を保持する', () => {
  const captured = { ...options, comparisonBase: 'previous' as const }
  const before = structuredClone(captured)
  assert.equal(getSurtrUnequippedTableImageFilename(captured),
    'スルト_S3_前段階比較表_特化3_DPS差_DPS＋比較値_昇進2Lv90_信頼100_潜在1_未ブロック_MODXLv.3-MODYLv.3_術耐性0-100刻み10_小数0桁_比率自動.png')
  assert.notEqual(getSurtrUnequippedTableImageFilename(captured), getSurtrUnequippedTableImageFilename(options))
  assert.deepEqual(captured, before)
})

test('前段階比較でも指標・列配置・ランク・色・選択段階と画像比率を識別できる', () => {
  const captured = { ...options, comparisonBase: 'previous' as const, layout: 'comparison' as const,
    series: [{ id: 'y:lv2', label: 'MOD Y Lv.2' }], resistances: [40, 50, 60], precision: 2 }
  const names = (['difference', 'ratio', 'percent'] as const).map(metric => {
    const name = getSurtrUnequippedTableImageFilename({ ...captured, metric }, 16 / 9)
    assert.match(name, /^スルト_S3_前段階比較表_/)
    assert.match(name, /比較値のみ/)
    assert.match(name, /MODYLv\.2_術耐性40-60刻み10_小数2桁/)
    assert.match(name, /_比率16x9\.png$/)
    assert.ok(new TextEncoder().encode(name).length <= 240)
    return name
  })
  assert.equal(new Set(names).size, 3)
  const cases = [
    { blockingComparison: [{ blocking: false }, { blocking: true }], columnOrder: 'blocking' as const },
    { rankMode: 'inline' as const },
    { colorScale: true, colorScaleMode: 'SQRT' as const },
  ]
  const labels = [/ブロック条件比較_ブロック条件別/, /ランク併記/, /カラースケール平方根/]
  for (const [index, change] of cases.entries()) {
    const name = getSurtrUnequippedTableImageFilename({ ...captured, ...change }, 16 / 9)
    assert.match(name, /^スルト_S3_前段階比較表_/)
    assert.match(name, labels[index])
    assert.match(name, /MODYLv\.2_術耐性40-60刻み10_小数2桁/)
    assert.match(name, /_比率16x9\.png$/)
    assert.ok(new TextEncoder().encode(name).length <= 240)
  }
})

test('前段階比較の長い名前も共通の省略・Unicode・禁止文字・240バイト制限を守る', () => {
  const captured = { ...options, comparisonBase: 'previous' as const,
    series: [{ id: 'x:lv1', label: 'MOD X Lv.1 長い名前😀<>:"/\\|?*'.repeat(80) }] }
  const before = structuredClone(captured)
  for (const ratio of [undefined, 16 / 9, 9 / 16]) {
    const name = getSurtrUnequippedTableImageFilename(captured, ratio)
    assert.match(name, /^スルト_S3_前段階比較表_/)
    assert.match(name, /ほか\d+項目_比率.+\.png$/)
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.equal(name.isWellFormed(), true)
    assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f\u007f�]/)
  }
  assert.deepEqual(captured, before)
})

test('保存時のメタデータ各項目を名前に反映する', () => {
  const original = getSurtrUnequippedTableImageFilename(options)
  for (const change of [
    { skillLabel: 'ランク7' }, { level: 60 }, { trust: 0 }, { potential: 6 }, { blocking: true },
  ]) {
    assert.notEqual(original, getSurtrUnequippedTableImageFilename({ ...options, metadata: { ...metadata, ...change } }))
  }
  const blocked = getSurtrUnequippedTableImageFilename({ ...options, metadata: { ...metadata, blocking: true } })
  assert.match(blocked, /_ブロック中_/)
  assert.doesNotMatch(blocked, /未ブロック/)
})

test('B/C形式とDPS差・比率・増加率の6通りを識別する', () => {
  const names: string[] = []
  for (const layout of ['combined', 'comparison'] as const) {
    for (const metric of ['difference', 'ratio', 'percent'] as const) {
      const name = getSurtrUnequippedTableImageFilename({ ...options, layout, metric })
      assert.ok(name.includes(layout === 'combined' ? 'DPS＋比較値' : '比較値のみ'))
      assert.ok(name.includes(metric === 'difference' ? '_DPS差_' : metric === 'ratio' ? '_比率_' : '_増加率_'))
      names.push(name)
    }
  }
  assert.equal(new Set(names).size, 6)
})

test('未装備の表示選択に影響されず、同MODの複数段階と表示順を保持する', () => {
  const stages = ['X', 'Y'].flatMap(type => [1, 2, 3].map(level => ({ id: `${type.toLowerCase()}:lv${level}`, label: `MOD ${type} Lv.${level}` })))
  const staged = { ...options, series: stages }
  const name = getSurtrUnequippedTableImageFilename(staged)
  assert.match(name, /MODXLv\.1-MODXLv\.2-MODXLv\.3-MODYLv\.1-MODYLv\.2-MODYLv\.3/)
  assert.equal(name, getSurtrUnequippedTableImageFilename({ ...staged, series: [{ id: 'none', label: '未装備' }, ...stages] }))
  assert.notEqual(name, getSurtrUnequippedTableImageFilename({ ...staged, series: stages.slice(1) }))
  assert.notEqual(name, getSurtrUnequippedTableImageFilename({ ...staged, series: [...stages].reverse() }))
  assert.match(getSurtrUnequippedTableImageFilename({ ...options, series: [{ id: 'none', label: '未装備' }] }), /MOD選択なし/)
})

test('実際の術耐性行を使い、等差数列だけ圧縮し、追加点・範囲・順序の違いを残す', () => {
  const original = getSurtrUnequippedTableImageFilename(options)
  assert.match(getSurtrUnequippedTableImageFilename({ ...options, resistances: [15, 25, 35, 45, 55] }), /術耐性15-55刻み10/)
  const limited = getSurtrUnequippedTableImageFilename({ ...options, resistances: [0, 10, 20, 30, 40, 50] })
  assert.match(limited, /術耐性0-50刻み10/)
  assert.notEqual(original, limited)
  const added = getSurtrUnequippedTableImageFilename({ ...options, resistances: [0, 10, 20, 25, 30] })
  assert.match(added, /術耐性0-10-20-25-30/)
  assert.notEqual(added, getSurtrUnequippedTableImageFilename({ ...options, resistances: [0, 10, 20, 27, 30] }))
  assert.match(getSurtrUnequippedTableImageFilename({ ...options, resistances: [30, 20, 10] }), /術耐性30-10刻み-10/)
  assert.match(getSurtrUnequippedTableImageFilename({ ...options, resistances: [37] }), /術耐性37_/)
  assert.match(getSurtrUnequippedTableImageFilename({ ...options, resistances: [] }), /術耐性なし/)
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => getSurtrUnequippedTableImageFilename({ ...options, resistances: [value] }), TypeError)
  }
})

test('小数0〜3桁の名前を区別し、不正な精度は表示処理と同じ0桁にする', () => {
  const names = [0, 1, 2, 3].map(precision => {
    const name = getSurtrUnequippedTableImageFilename({ ...options, precision })
    assert.match(name, new RegExp(`小数${precision}桁`))
    return name
  })
  assert.equal(new Set(names).size, 4)
  for (const precision of [-1, 4, 0.5, NaN]) {
    assert.equal(names[0], getSurtrUnequippedTableImageFilename({ ...options, precision }))
  }
})

test('自動・整数の指定比率を共通ルールで記録し、等価な比率を同じ名前にする', () => {
  assert.match(getSurtrUnequippedTableImageFilename(options), /比率自動\.png$/)
  assert.match(getSurtrUnequippedTableImageFilename(options, 16 / 9), /比率16x9\.png$/)
  assert.equal(getSurtrUnequippedTableImageFilename(options, 16 / 9), getSurtrUnequippedTableImageFilename(options, 32 / 18))
  assert.match(getSurtrUnequippedTableImageFilename(options, 9 / 16), /比率9x16\.png$/)
  assert.match(getSurtrUnequippedTableImageFilename(options, 1), /比率1x1\.png$/)
  for (const aspectRatio of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => getSurtrUnequippedTableImageFilename(options, aspectRatio), TypeError)
  }
})

test('長い名前と禁止文字は共通規則で処理し、Unicodeと縦横比を壊さず240バイト以内に収める', () => {
  const long = { ...options, series: [{ id: 'x:lv3', label: '長いMOD名😀'.repeat(80) }] }
  for (const ratio of [undefined, 16 / 9, 1 / 10, 10]) {
    const name = getSurtrUnequippedTableImageFilename(long, ratio)
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.equal(name.isWellFormed(), true)
    assert.doesNotMatch(name, /�/)
    assert.match(name, /ほか\d+項目_比率.+\.png$/)
    assert.equal((name.match(/ほか\d+項目/g) ?? []).length, 1)
  }
  const sanitized = getSurtrUnequippedTableImageFilename({
    ...options, metadata: { ...metadata, skillLabel: '特化<>:"/\\|?*3' }, series: [{ id: 'x', label: 'MOD<X>:Y/Z' }],
  })
  assert.doesNotMatch(sanitized, /[<>:"/\\|?*\u0000-\u001f\u007f]/)
})

test('命名は入力を変更せず、日時や乱数が変わっても設定の名前を保つ', context => {
  const captured = structuredClone(options)
  const before = structuredClone(captured)
  context.mock.method(Date, 'now', () => 0)
  context.mock.method(Math, 'random', () => 0)
  const original = getSurtrUnequippedTableImageFilename(captured)
  context.mock.method(Date, 'now', () => 9_999_999_999_999)
  context.mock.method(Math, 'random', () => 0.99)
  assert.equal(original, getSurtrUnequippedTableImageFilename(captured))
  assert.deepEqual(captured, before)
})

test('ランク表示なしは既存名を保ち、併記と結合の保存画像を区別する', () => {
  const original = getSurtrUnequippedTableImageFilename(options)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...options, rankMode: 'none' }), original)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...options, rankMode: undefined }), original)
  const names = [original]
  for (const [rankMode, label] of [['inline', 'ランク併記'], ['merged', 'ランク結合']] as const) {
    const ranked = { ...options, rankMode }
    const before = structuredClone(ranked)
    const name = getSurtrUnequippedTableImageFilename(ranked, 16 / 9)
    assert.ok(name.includes(label), name)
    assert.match(name, /術耐性0-100刻み10/)
    assert.match(name, /比率16x9\.png$/)
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.deepEqual(ranked, before)
    names.push(getSurtrUnequippedTableImageFilename(ranked))
  }
  assert.equal(new Set(names).size, 3)
})

test('ブロック条件別の列配置は両条件比較の画像名だけを区別し、従来のMOD別を変えない', () => {
  const blockingComparison = [{ blocking: true }, { blocking: false }]
  const compared = { ...options, blockingComparison }
  assert.equal(getSurtrUnequippedTableImageFilename({ ...compared, columnOrder: 'module' }), getSurtrUnequippedTableImageFilename(compared))
  assert.equal(getSurtrUnequippedTableImageFilename({ ...options, columnOrder: 'blocking' }), getSurtrUnequippedTableImageFilename(options))
  for (const layout of ['combined', 'comparison'] as const) {
    const alternative = { ...compared, layout, rankMode: 'merged' as const, columnOrder: 'blocking' as const }
    const before = structuredClone(alternative)
    const name = getSurtrUnequippedTableImageFilename(alternative, 16 / 9)
    assert.match(name, /ブロック条件別/)
    assert.match(name, /ランク結合/)
    assert.match(name, /比率16x9\.png$/)
    assert.notEqual(name, getSurtrUnequippedTableImageFilename({ ...alternative, columnOrder: 'module' }, 16 / 9))
    assert.equal(name, getSurtrUnequippedTableImageFilename({ ...alternative, metadata: { ...metadata, blocking: true },
      blockingComparison: [...blockingComparison].reverse() }, 16 / 9))
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.deepEqual(alternative, before)
  }
})

test('カラースケール画像は保存条件で識別し、無効時は既存の画像名を保つ', () => {
  const base = { ...options, rankMode: 'merged' as const, columnOrder: 'blocking' as const,
    blockingComparison: [{ blocking: false }, { blocking: true }] }
  const original = getSurtrUnequippedTableImageFilename(base)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...base, colorScale: false }), original)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...base, colorScale: undefined }), original)
  const colored = { ...base, colorScale: true }
  const before = structuredClone(colored)
  const name = getSurtrUnequippedTableImageFilename(colored, 16 / 9)
  assert.match(name, /カラースケール/)
  assert.match(name, /ブロック条件別/)
  assert.match(name, /比率16x9\.png$/)
  assert.notEqual(name, getSurtrUnequippedTableImageFilename({ ...colored, colorScale: false }, 16 / 9))
  assert.ok(new TextEncoder().encode(name).length <= 240)
  assert.deepEqual(colored, before)
})

test('平方根カラースケールは有効時だけ画像名を変え、線形と無効時の従来名を保つ', () => {
  const colored = { ...options, colorScale: true }
  const before = structuredClone(colored)
  const old = getSurtrUnequippedTableImageFilename(colored, 16 / 9)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...colored, colorScaleMode: 'LINEAR' }, 16 / 9), old)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...colored, colorScaleMode: undefined }, 16 / 9), old)
  const squareRoot = getSurtrUnequippedTableImageFilename({ ...colored, colorScaleMode: 'SQRT' }, 16 / 9)
  assert.match(squareRoot, /カラースケール平方根/)
  assert.notEqual(squareRoot, old)
  assert.match(squareRoot, /比率16x9\.png$/)
  assert.ok(new TextEncoder().encode(squareRoot).length <= 240)
  for (const colorScale of [false, undefined]) {
    assert.equal(getSurtrUnequippedTableImageFilename({ ...options, colorScale, colorScaleMode: 'SQRT' }),
      getSurtrUnequippedTableImageFilename(options))
  }
  assert.deepEqual(colored, before)
})

test('ブロック条件比較の画像名は通常の単一条件と区別し、現在のblocking選択に依存しない', () => {
  const blockingComparison = [{ blocking: true }, { blocking: false }]
  const compared = { ...options, blockingComparison }
  const before = structuredClone(compared)
  const name = getSurtrUnequippedTableImageFilename(compared)
  assert.match(name, /_ブロック条件比較_/)
  assert.doesNotMatch(name, /_未ブロック_|_ブロック中_/)
  assert.notEqual(name, getSurtrUnequippedTableImageFilename(options))
  assert.equal(name, getSurtrUnequippedTableImageFilename({ ...compared, metadata: { ...metadata, blocking: true } }))
  assert.equal(name, getSurtrUnequippedTableImageFilename({ ...compared, blockingComparison: [...blockingComparison].reverse() }))
  assert.equal(name, getSurtrUnequippedTableImageFilename({ ...compared, blockingComparison: [] }))
  assert.equal(getSurtrUnequippedTableImageFilename({ ...options, blockingComparison: undefined }),
    getSurtrUnequippedTableImageFilename(options))
  assert.deepEqual(compared, before)
})

test('ブロック条件比較でも指標・形式・画像比率を記録し、長い名前は共通上限を守る', () => {
  const blockingComparison = [{ blocking: false }, { blocking: true }]
  const names: string[] = []
  for (const layout of ['combined', 'comparison'] as const) {
    for (const metric of ['difference', 'ratio', 'percent'] as const) {
      const name = getSurtrUnequippedTableImageFilename({ ...options, blockingComparison, layout, metric }, 16 / 9)
      assert.match(name, /_ブロック条件比較_/)
      assert.match(name, /_比率16x9\.png$/)
      names.push(name)
    }
  }
  assert.equal(new Set(names).size, 6)
  const long = getSurtrUnequippedTableImageFilename({
    ...options, blockingComparison, series: [{ id: 'x:lv3', label: '長いMOD名😀'.repeat(80) }],
  }, 9 / 16)
  assert.match(long, /_ブロック条件比較_/)
  assert.match(long, /ほか\d+項目_比率9x16\.png$/)
  assert.ok(new TextEncoder().encode(long).length <= 240)
  assert.equal(long.isWellFormed(), true)
})
