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
const remnantAssumptions = { windup: 0.3, ctCarry: 'time' as const, includeRetreatHit: false }
const remnantOptions = { ...options, quantity: 'expected-damage' as const,
  metadata: { ...metadata, remnantAssumptions } }

test('画像の配置と分割段階を区別し、現在の配置と無効な段階指定は従来名を保つ', () => {
  const original = getSurtrUnequippedTableImageFilename(options)
  assert.equal(getSurtrUnequippedTableImageFilename({ ...options, imageLayout: 'current', moduleLevel: 2 }), original)
  const names = [original]
  for (const [imageLayout, text] of [['transpose', '術耐性を列に'], ['stacked', 'ブロック条件を上下に']] as const) {
    const name = getSurtrUnequippedTableImageFilename({ ...options, imageLayout }, 16 / 9)
    assert.ok(name.includes(text))
    names.push(name)
  }
  for (const moduleLevel of [1, 2, 3]) {
    const name = getSurtrUnequippedTableImageFilename({ ...options, imageLayout: 'split', moduleLevel,
      series: [{ id: 'x:lv3', label: '長いMOD名😀'.repeat(80) }] }, 16 / 9)
    assert.ok(name.includes(`段階別Lv${moduleLevel}`))
    assert.ok(new TextEncoder().encode(name).length <= 240)
    names.push(name)
  }
  assert.equal(new Set(names).size, 6)
  assert.match(getSurtrUnequippedTableImageFilename({ ...options, imageLayout: 'split' }), /_段階別_/)
})

test('数値サイズの省略と100%はDPS・期待値と各画像配置の従来名を保つ', () => {
  for (const source of [options, remnantOptions]) {
    for (const imageLayout of ['current', 'transpose', 'stacked', 'split'] as const) {
      for (const aspectRatio of [undefined, 16 / 9]) {
        const snapshot = { ...source, imageLayout, moduleLevel: 3 }
        const original = getSurtrUnequippedTableImageFilename(snapshot, aspectRatio)
        assert.equal(getSurtrUnequippedTableImageFilename({ ...snapshot, numberSize: undefined }, aspectRatio), original)
        assert.equal(getSurtrUnequippedTableImageFilename({ ...snapshot, numberSize: '100' }, aspectRatio), original)
      }
    }
  }
})

test('自動・150%・200%の数値サイズを配置の直後に記録し、個別画像と段階一括名を区別する', () => {
  for (const [imageLayout, descriptor] of [['current', '特化3'], ['transpose', '術耐性を列に'],
    ['stacked', 'ブロック条件を上下に'], ['split', '段階別Lv2']] as const) {
    const snapshot = { ...options, imageLayout, moduleLevel: 2 }
    const names = [getSurtrUnequippedTableImageFilename(snapshot, 16 / 9)]
    for (const [numberSize, label] of [['auto', '数値自動'], ['150', '数値150%'], ['200', '数値200%']] as const) {
      const captured = { ...snapshot, numberSize }
      const before = structuredClone(captured)
      const name = getSurtrUnequippedTableImageFilename(captured, 16 / 9)
      assert.ok(name.includes(`_${descriptor}_${label}_`), name)
      assert.match(name, /_比率16x9\.png$/)
      assert.deepEqual(captured, before)
      names.push(name)
    }
    assert.equal(new Set(names).size, 4)
  }
  const batchName = getSurtrUnequippedTableImageFilename({ ...options, imageLayout: 'split', numberSize: 'auto' })
  assert.match(batchName, /_段階別_数値自動_/)
  assert.notEqual(batchName, getSurtrUnequippedTableImageFilename({ ...options,
    imageLayout: 'split', moduleLevel: 2, numberSize: 'auto' }))
})

test('数値サイズを含む長い画像名も共通のUnicode・禁止文字・240バイト制限を守る', () => {
  const source = { ...options, imageLayout: 'split' as const, moduleLevel: 3,
    series: [{ id: 'x:lv3', label: '長いMOD名😀<>:"/\\|?*'.repeat(80) }] }
  for (const [numberSize, label] of [['auto', '数値自動'], ['150', '数値150%'], ['200', '数値200%']] as const) {
    const name = getSurtrUnequippedTableImageFilename({ ...source, numberSize }, 16 / 9)
    assert.ok(name.includes(`_段階別Lv3_${label}_`), name)
    assert.match(name, /ほか\d+項目_比率16x9\.png$/)
    assert.ok(new TextEncoder().encode(name).length <= 240)
    assert.equal(name.isWellFormed(), true)
    assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f\u007f�]/)
  }
})

test('余燼ONの比較表画像は状態を記録し、OFFと未指定の従来名を保つ', () => {
  for (const comparisonBase of ['unequipped', 'previous'] as const) {
    for (const layout of ['combined', 'comparison'] as const) {
      for (const blockingComparison of [undefined, [{ blocking: false }, { blocking: true }]]) {
        const snapshot = { ...options, comparisonBase, layout, blockingComparison }
        const before = structuredClone(snapshot)
        for (const aspectRatio of [undefined, 16 / 9]) {
          const legacy = getSurtrUnequippedTableImageFilename(snapshot, aspectRatio)
          const off = getSurtrUnequippedTableImageFilename({ ...snapshot, metadata: { ...metadata, remnantActive: false } }, aspectRatio)
          const on = getSurtrUnequippedTableImageFilename({ ...snapshot, metadata: { ...metadata, remnantActive: true } }, aspectRatio)
          assert.equal(off, legacy)
          assert.match(on, /_余燼中_/)
          assert.doesNotMatch(off, /余燼中|余燼なし/)
          assert.notEqual(on, off)
          assert.ok(new TextEncoder().encode(on).length <= 240)
        }
        assert.deepEqual(snapshot, before)
      }
    }
  }
})

test('余燼ONでも非有効な比較表設定は画像名を変えず、長い名前には状態を残す', () => {
  const active = { ...options, metadata: { ...metadata, remnantActive: true }, colorScale: false }
  assert.equal(getSurtrUnequippedTableImageFilename(active), getSurtrUnequippedTableImageFilename({ ...active,
    columnOrder: 'blocking', colorScaleMode: 'SQRT',
  }))
  const compared = { ...active, blockingComparison: [{ blocking: false }, { blocking: true }] }
  assert.equal(getSurtrUnequippedTableImageFilename(compared), getSurtrUnequippedTableImageFilename({ ...compared,
    metadata: { ...compared.metadata, blocking: true },
  }))
  const long = getSurtrUnequippedTableImageFilename({ ...compared,
    series: [{ id: 'x:lv3', label: '長いMOD名😀<>:"/\\|?*'.repeat(80) }],
  }, 9 / 16)
  assert.match(long, /_余燼中_/)
  assert.match(long, /ほか\d+項目_比率9x16\.png$/)
  assert.ok(new TextEncoder().encode(long).length <= 240)
  assert.equal(long.isWellFormed(), true)
  assert.doesNotMatch(long, /[<>:"/\\|?*\u0000-\u001f\u007f�]/)
})

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

test('DPS表はquantity未指定・dpsで旧名を完全に保持し、余燼の非有効な仮定を名前に含めない', () => {
  for (const comparisonBase of [undefined, 'unequipped', 'previous'] as const) {
    const old = getSurtrUnequippedTableImageFilename({ ...options, comparisonBase }, 16 / 9)
    for (const quantity of [undefined, 'dps'] as const) {
      const name = getSurtrUnequippedTableImageFilename({ ...options, comparisonBase, quantity,
        metadata: { ...metadata, remnantAssumptions } }, 16 / 9)
      assert.equal(name, old)
      assert.doesNotMatch(name, /余燼|CT一様|予備動作|CT秒数維持|退場時/)
    }
  }
})

test('余燼総ダメージ期待値表は両基準と6通りの形式・指標、計算の仮定を識別する', () => {
  const names: string[] = []
  for (const comparisonBase of ['unequipped', 'previous'] as const) {
    for (const layout of ['combined', 'comparison'] as const) {
      for (const metric of ['difference', 'ratio', 'percent'] as const) {
        const name = getSurtrUnequippedTableImageFilename({ ...remnantOptions, comparisonBase, layout, metric })
        assert.ok(name.startsWith(`スルト_余燼_総ダメージ期待値_${comparisonBase === 'previous' ? '前段階比較表' : '未装備比較表'}_`))
        assert.ok(name.includes(metric === 'difference' ? '_ダメージ差_' : metric === 'ratio' ? '_比率_' : '_増加率_'))
        assert.ok(name.includes(layout === 'combined' ? '_期待値＋比較値_' : '_比較値のみ_'))
        assert.match(name, /_CT一様_予備動作0\.3秒_CT秒数維持_退場時除外_/)
        assert.doesNotMatch(name, /DPS/)
        for (const remnantActive of [false, true]) {
          assert.equal(getSurtrUnequippedTableImageFilename({ ...remnantOptions, comparisonBase, layout, metric,
            metadata: { ...remnantOptions.metadata, remnantActive } }), name)
        }
        assert.ok(new TextEncoder().encode(name).length <= 240)
        names.push(name)
      }
    }
  }
  assert.equal(new Set(names).size, 12)
  assert.equal(getSurtrUnequippedTableImageFilename(remnantOptions),
    getSurtrUnequippedTableImageFilename({ ...remnantOptions, comparisonBase: 'unequipped' }))
})

test('余燼の仮定は画像名へ反映し、未指定時には具体的な仮定を捏造しない', () => {
  const variations = [remnantAssumptions, { ...remnantAssumptions, windup: 0 },
    { ...remnantAssumptions, windup: 0.2 }, { ...remnantAssumptions, ctCarry: 'ratio' as const },
    { ...remnantAssumptions, includeRetreatHit: true }]
  const names = variations.map(assumptions => getSurtrUnequippedTableImageFilename({ ...remnantOptions,
    metadata: { ...metadata, remnantAssumptions: assumptions } }))
  assert.equal(new Set(names).size, 5)
  assert.match(names[1], /予備動作0秒/)
  assert.match(names[2], /予備動作0\.2秒/)
  assert.match(names[3], /CT割合維持/)
  assert.match(names[4], /退場時含む/)
  const unspecified = getSurtrUnequippedTableImageFilename({ ...remnantOptions, metadata })
  assert.match(unspecified, /^スルト_余燼_総ダメージ期待値_未装備比較表_/)
  assert.doesNotMatch(unspecified, /予備動作|CT秒数維持|CT割合維持|退場時/)
})

test('期待値表の長名を省略しても両基準・仮定・指標・形式と比率を保持し、Unicodeと240バイト制限を守る', () => {
  const captured = { ...remnantOptions, metadata: { ...remnantOptions.metadata, skillLabel: '特化3 長い見出し😀'.repeat(80) },
    series: [{ id: 'x:lv3', label: 'MOD X Lv.3 長い名前😀<>:"/\\|?*'.repeat(80) }] }
  const before = structuredClone(captured)
  const names: string[] = []
  for (const comparisonBase of ['unequipped', 'previous'] as const) {
    for (const ratio of [undefined, 16 / 9, 9 / 16]) {
      for (const assumptions of [remnantAssumptions, { ...remnantAssumptions, windup: 0.2 },
        { ...remnantAssumptions, ctCarry: 'ratio' as const }, { ...remnantAssumptions, includeRetreatHit: true }]) {
        const name = getSurtrUnequippedTableImageFilename({ ...captured, comparisonBase,
          metadata: { ...captured.metadata, remnantAssumptions: assumptions } }, ratio)
        assert.ok(name.startsWith(`スルト_余燼_総ダメージ期待値_${comparisonBase === 'previous' ? '前段階比較表' : '未装備比較表'}_`))
        assert.match(name, /_ダメージ差_期待値＋比較値_CT一様_/)
        assert.ok(name.includes(`予備動作${assumptions.windup}秒`))
        assert.ok(name.includes(assumptions.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持'))
        assert.ok(name.includes(assumptions.includeRetreatHit ? '退場時含む' : '退場時除外'))
        assert.match(name, /ほか\d+項目_比率.+\.png$/)
        assert.match(name, ratio === undefined ? /_比率自動\.png$/ : ratio === 16 / 9 ? /_比率16x9\.png$/ : /_比率9x16\.png$/)
        assert.ok(new TextEncoder().encode(name).length <= 240)
        assert.equal(name.isWellFormed(), true)
        assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f\u007f�]/)
        names.push(name)
      }
    }
  }
  assert.equal(new Set(names).size, 24)
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

test('複数潜在の比較表画像名は潜在の組と基準を保持し、MOD段階名を重複させない', () => {
  const captured = { ...options, metadata: { ...metadata, potentials: [6, 1, 6] },
    series: [1, 6].flatMap(potential => [{ id: `none:pot${potential}`, moduleStageId: 'none', potential, label: `未装備 潜在${potential}` },
      { id: `x:lv3:pot${potential}`, moduleStageId: 'x:lv3', potential, label: `MOD X Lv.3 潜在${potential}` }]) }
  const before = structuredClone(captured)
  for (const comparisonBase of ['unequipped', 'previous', 'potential-1', 'potential-6'] as const) {
    const name = getSurtrUnequippedTableImageFilename({ ...captured, comparisonBase })
    assert.match(name, /_潜在1・6_/)
    assert.match(name, /_MODXLv\.3_/)
    assert.doesNotMatch(name, /MODXLv\.3-MODXLv\.3|未装備潜在|:pot/)
    assert.match(name, new RegExp(`^スルト_S3_${comparisonBase === 'unequipped' ? '未装備' : comparisonBase === 'previous' ? '前段階' : `潜在${comparisonBase.slice(-1)}`}比較表_`))
  }
  assert.notEqual(getSurtrUnequippedTableImageFilename(captured), getSurtrUnequippedTableImageFilename({ ...captured,
    metadata: { ...metadata, potentials: [1] } }))
  assert.deepEqual(captured, before)
})
