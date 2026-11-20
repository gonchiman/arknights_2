import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBarChartPresentation, getBarChartBarWidth, getBarChartPresentationLabels } from '../src/lib/barChartPresentation.ts'

test('点型とカテゴリ型は上限に達するまでは項目幅の60%、以降は拡大前48pxとする', () => {
  for (const kind of ['point', 'category']) {
    assert.equal(getBarChartBarWidth(kind, 40), 24)
    assert.equal(getBarChartBarWidth(kind, 79), 47.4)
    assert.equal(getBarChartBarWidth(kind, 80), 48)
    assert.equal(getBarChartBarWidth(kind, 120), 48)
    assert.equal(getBarChartBarWidth(kind, 400), 48)
  }
})

test('区間型は項目幅の96%を保ち、点型の48px上限を流用しない', () => {
  assert.equal(getBarChartBarWidth('interval', 40), 38.4)
  assert.equal(getBarChartBarWidth('interval', 80), 76.8)
  assert.equal(getBarChartBarWidth('interval', 125), 120)
  assert.equal(getBarChartBarWidth('interval', 400), 384)
})

test('データの型から共通の自動設定名を作り、幅の定義と上限を対応させる', () => {
  for (const [kind, label, widthRatio, maximumWidth] of [
    ['interval', '区間型', .96, null], ['point', '点型', .6, 48], ['category', 'カテゴリ型', .6, 48],
  ]) {
    assert.deepEqual(getBarChartPresentation(kind), { label, widthRatio, maximumWidth })
    const labels = getBarChartPresentationLabels(kind)
    assert.equal(labels.type, label)
    assert.match(labels.width, kind === 'interval' ? /96%/ : /60%/)
    if (maximumWidth === null) assert.equal(labels.limit, null)
    else assert.match(labels.limit, /48\s*px/)
  }
})
