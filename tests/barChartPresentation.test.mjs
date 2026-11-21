import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getBarChartItemKind, getBarChartPresentation, getBarChartBarWidth, getBarChartPresentationLabels,
} from '../src/lib/barChartPresentation.ts'

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

test('左右の横棒でも区間96%・独立項目60%上限48pxの同じ規則を使い、配置だけで間隔を変えない', () => {
  for (const kind of ['interval', 'point', 'category']) {
    const normal = getBarChartPresentation(kind)
    const mirrored = getBarChartPresentation(kind, 'mirrored')
    assert.equal(mirrored.widthRatio, normal.widthRatio)
    assert.equal(mirrored.maximumWidth, normal.maximumWidth)
    for (const slot of [20, 70, 80, 125, 300]) {
      assert.equal(getBarChartBarWidth(kind, slot, 'mirrored'), getBarChartBarWidth(kind, slot))
    }
    const labels = getBarChartPresentationLabels(kind, 'mirrored')
    assert.equal(labels.type, `左右の横棒・${normal.label}`)
    assert.equal(labels.width, `1項目の高さの${kind === 'interval' ? 96 : 60}%`)
    assert.equal(labels.limit, getBarChartPresentationLabels(kind).limit)
  }
})

test('項目の意味は明示されたitemKindを優先し、省略時だけ旧xKindを使う', () => {
  const document = {
    xKind: 'category', layout: 'mirrored', semantics: { itemKind: 'interval' },
    source: { providerId: 'independent-groups' },
    bins: [{ id: 'first', label: '独立した名前', value: 0 }, { id: 'last', label: '任意', value: null }],
  }
  assert.equal(getBarChartItemKind(document), 'interval', 'カテゴリの行合わせと数値区間の意味を分離する')
  for (const itemKind of ['interval', 'point', 'category']) {
    const selected = { ...document, semantics: { itemKind } }
    assert.equal(getBarChartItemKind(selected), itemKind)
    assert.equal(getBarChartItemKind({ ...selected,
      source: { providerId: 'enemy-stat-rating-comparison' },
      bins: [{ id: 'rating-E', label: 'E', value: 1000 }, { id: 'rating-SS', label: 'SS', value: 0 }],
    }), itemKind, '提供元・評価名・数値・欠損から型を推測しない')
  }
  for (const xKind of ['interval', 'point', 'category']) {
    assert.equal(getBarChartItemKind({ ...document, xKind, semantics: {} }), xKind)
  }
})
