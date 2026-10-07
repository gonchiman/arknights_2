import test from 'node:test'
import assert from 'node:assert/strict'
import type { OperatorModuleComparisonColumn } from '../src/lib/operatorModuleComparison.ts'
import { getOperatorModuleComparisonImageFilename } from '../src/lib/operatorModuleComparisonImageFilename.ts'

const options = { operatorName: 'スルト', operatorId: 'char_350_surtr', level: 3 }
const none: OperatorModuleComparisonColumn = {
  id: 'none', name: 'モジュールなし', typeLabel: null, level: null, available: true,
}
const moduleColumn = (type: 'X' | 'Y', level: number): OperatorModuleComparisonColumn => ({
  id: `module-${type.toLowerCase()}:lv${level}`, name: `モジュール${type}`,
  typeLabel: `AFT-${type}`, level, available: true,
})

test('比較列を省略した呼び出しは従来の段階・潜在・比率のファイル名を維持する', () => {
  assert.equal(getOperatorModuleComparisonImageFilename(options), 'スルト_モジュール比較_Lv3_潜在1.png')
  assert.equal(getOperatorModuleComparisonImageFilename({ ...options, level: null }), 'スルト_モジュール比較_潜在1.png')
  assert.equal(getOperatorModuleComparisonImageFilename({
    ...options, potentialRank: 5, aspect: { width: 32, height: 18 },
  }), 'スルト_モジュール比較_Lv3_潜在5_16x9.png')
  assert.equal(getOperatorModuleComparisonImageFilename({ ...options, potentialRank: NaN }),
    getOperatorModuleComparisonImageFilename(options))
})

test('表示中の未装備と各MOD段階を列の順番どおりファイル名に含める', () => {
  const columns = [none, moduleColumn('X', 1), moduleColumn('X', 2), moduleColumn('Y', 3)]
  const filename = getOperatorModuleComparisonImageFilename({ ...options, columns })
  assert.equal(filename, 'スルト_モジュール比較_未装備-AFT-XLv1-AFT-XLv2-AFT-YLv3_潜在1.png')
  assert.equal(filename, getOperatorModuleComparisonImageFilename({ ...options, level: null, columns }))
  assert.doesNotMatch(filename, /module-|:lv/)
})

test('列表示の命名を維持し、行表示は選択段階・潜在・比率を保って識別する', () => {
  const columns = [none, moduleColumn('X', 1), moduleColumn('X', 3), moduleColumn('Y', 2)]
  for (const aspect of [null, { width: 16, height: 9 }]) {
    const conditions = { ...options, columns, potentialRank: 5, aspect }
    const filename = getOperatorModuleComparisonImageFilename(conditions)
    assert.equal(filename, getOperatorModuleComparisonImageFilename({ ...conditions, layout: 'columns' }))
    const rows = getOperatorModuleComparisonImageFilename({ ...conditions, layout: 'rows' })
    assert.equal(rows, filename.replace(/\.png$/, '_レベル行.png'))
    assert.notEqual(rows, getOperatorModuleComparisonImageFilename({
      ...conditions, columns: [none, moduleColumn('X', 2), moduleColumn('Y', 2)], layout: 'rows',
    }))
    assert.notEqual(rows, getOperatorModuleComparisonImageFilename({
      ...conditions, potentialRank: 1, layout: 'rows',
    }))
  }
  assert.equal(getOperatorModuleComparisonImageFilename({ ...options, layout: 'rows' }),
    'スルト_モジュール比較_Lv3_潜在1_レベル行.png')
})

test('段階・MOD種類・未装備の有無・表示順の異なる選択を区別する', () => {
  const selections = [
    [none, moduleColumn('X', 1), moduleColumn('X', 2), moduleColumn('X', 3)],
    [none, moduleColumn('X', 1), moduleColumn('X', 3)],
    [moduleColumn('X', 1), moduleColumn('X', 2), moduleColumn('X', 3)],
    [none, moduleColumn('X', 1)],
    [none, moduleColumn('X', 3)],
    [none, moduleColumn('Y', 1)],
    [none, moduleColumn('X', 3), moduleColumn('X', 1)],
    [none, ...[1, 2, 3].map((level) => moduleColumn('X', level)),
      ...[1, 2, 3].map((level) => moduleColumn('Y', level))],
  ]
  const filenames = selections.map((columns) => getOperatorModuleComparisonImageFilename({ ...options, columns }))
  assert.equal(new Set(filenames).size, filenames.length)
  assert.match(filenames.at(-1)!, /未装備-AFT-XLv1-AFT-XLv2-AFT-XLv3-AFT-YLv1-AFT-YLv2-AFT-YLv3/)
})

test('名前と列の種類にファイル名禁止文字を含めず、名称未設定時の代替名を維持する', () => {
  const columns = [{ ...moduleColumn('X', 2), typeLabel: 'MOD<X>:/Y\\Z|?*' }]
  const filename = getOperatorModuleComparisonImageFilename({
    ...options, operatorName: ' スルト<>:"/\\|?* . ', columns,
  })
  assert.doesNotMatch(filename, /[<>:"/\\|?*\u0000-\u001f\u007f]/)
  assert.match(filename, /MOD_X___Y_Z___Lv2/)
  assert.equal(getOperatorModuleComparisonImageFilename({ ...options, operatorName: ' ', level: null }),
    'char_350_surtr_モジュール比較_潜在1.png')
  assert.equal(getOperatorModuleComparisonImageFilename({ ...options, operatorName: '', operatorId: '', level: null }),
    'オペレーター_モジュール比較_潜在1.png')
  assert.match(getOperatorModuleComparisonImageFilename({
    ...options, columns: [{ ...moduleColumn('X', 1), typeLabel: null, name: '名称なし' }],
  }), /_名称なしLv1_/)
})

test('比較列を指定した場合も名前の文字数制限と比率検証を維持する', () => {
  const columns = [none, moduleColumn('X', 2)]
  const filename = getOperatorModuleComparisonImageFilename({
    ...options, operatorName: '😀'.repeat(90), columns, aspect: { width: 100, height: 50 },
  })
  assert.equal(filename, `${'😀'.repeat(80)}_モジュール比較_未装備-AFT-XLv2_潜在1_2x1.png`)
  assert.doesNotMatch(filename, /�/)
  for (const aspect of [{ width: 0, height: 1 }, { width: NaN, height: 1 }, { width: 11, height: 1 }]) {
    assert.throws(() => getOperatorModuleComparisonImageFilename({ ...options, columns, aspect }),
      /画像の縦横比が正しくありません/)
  }
})
