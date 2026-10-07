import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyChartImageSeriesLabels, resolveChartImageLabels, withChartImageLabelFilename } from '../src/lib/chartImageLabels.ts'

const defaults = {
  title: '余燼中の命中回数', xAxis: '発動直前の残りCT（s）', yAxis: '命中回数（回）',
  series: [{ id: 'none', label: '未装備' }, { id: 'X', label: 'MOD X Lv.3' }],
}

test('empty edited names restore their captured defaults and hidden series are not introduced', () => {
  const labels = resolveChartImageLabels(defaults, {
    title: ' 比較結果 ', xAxis: '', yAxis: ' \n ', series: { none: '', X: ' AFT-X ', Y: '非表示' },
  })
  assert.deepEqual(labels, {
    title: '比較結果', xAxis: defaults.xAxis, yAxis: defaults.yAxis,
    seriesLabels: { none: '未装備', X: 'AFT-X' },
  })
})

test('renaming duplicate labels keeps each series id, color, point data and source intact', () => {
  const points = Object.freeze([{ x: 0, value: 7 }])
  const original = Object.freeze([
    Object.freeze({ id: 'none', label: '同じ名前', color: '#747982', points }),
    Object.freeze({ id: 'X', label: '同じ名前', color: '#407b9d', points }),
  ])
  const edited = applyChartImageSeriesLabels(original, { series: { X: '<AFT-X>' } })
  assert.equal(edited[0].label, '同じ名前')
  assert.equal(edited[1].label, '<AFT-X>')
  for (const [index, item] of edited.entries()) {
    assert.equal(item.id, original[index].id)
    assert.equal(item.color, original[index].color)
    assert.equal(item.points, original[index].points)
    assert.notEqual(item, original[index])
  }
  assert.equal(original[1].label, '同じ名前')
})

test('automatic filenames retain conditions and identify active text edits with safe readable parts', () => {
  const original = 'スルト_潜在1_非ブロック.png'
  assert.equal(withChartImageLabelFilename(original, defaults), original)
  assert.equal(withChartImageLabelFilename(original, defaults, { title: '  ', series: { Y: '非表示' } }), original)
  assert.equal(withChartImageLabelFilename(original, defaults, { title: defaults.title }), original)
  assert.equal(withChartImageLabelFilename(original, defaults, { title: '比較結果', series: { X: 'AFT-X' } }),
    'スルト_潜在1_非ブロック_タイトル比較結果_凡例MODXLv.3-AFT-X.png')
  const long = withChartImageLabelFilename(original, defaults, { title: '長いタイトル<>'.repeat(20), xAxis: 'CT' })
  assert.ok(new TextEncoder().encode(long).length <= 240)
  assert.doesNotMatch(long, /[<>:"/\\|?*]/)
  assert.match(long, /ほか\d+項目/)
})
