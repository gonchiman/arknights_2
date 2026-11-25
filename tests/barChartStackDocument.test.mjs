import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createBarChartDocument, DEFAULT_BAR_CHART_DISPLAY_SETTINGS, getBarChartFilename, toggleBarChartHighlight,
} from '../src/lib/barChartDocument.ts'
import { getBarChartPresentationLabels } from '../src/lib/barChartPresentation.ts'
import { getBarChartNaturalHeight } from '../src/lib/barChartLayout.ts'
import { createBarChartImageSnapshot, getBarChartArchiveFilename } from '../src/lib/barChartImage.ts'

function input() {
  const bins = [0, 10, 100].map(point => ({ id: `condition-${point}`, point, label: String(point), value: null }))
  return {
    layout: 'stacked-percent', xKind: 'point', bins, filenameParts: ['テスト単位'], fractionDigits: 1,
    capabilities: { percentages: false, cumulative: false },
    semantics: { kind: 'composition', subject: '属性別の優勢率', xLabel: '得票率', yLabel: '術耐性' },
    source: {
      providerId: 'example', aggregationVersion: { id: 'v12', label: '集計版 v12', sourceRevision: 'fixture', ruleVersion: 'fixture' },
      aggregationScope: 'main', scopeLabel: 'メインストーリー', countMode: 'SPAWNS', countLabel: '出現回数', countUnit: '体',
      population: null, coverage: { mapCount: 0, missingMapCount: 0, spawnMapCount: 0, spawnExcludedMapCount: 0 },
      coverageLabel: '集計対象 0マップ', parameters: [{ label: '集計単位', value: 'スキル単位' }],
    },
    stack: {
      legendTitle: 'ダメージが高い属性', columns: ['術耐性', '対応防御力', '有効数'],
      series: [{ id: 'physical', label: '物理', color: '#387590' }, { id: 'tie', label: '同じ', color: '#b6b8bb' }, { id: 'arts', label: '術', color: '#a85b2e' }],
      rows: [
        { labels: ['0', '0', '2'], total: 2, values: [0, 2, 0] },
        { labels: ['10', '100', '2'], total: 2, values: [1.5, 0, .5] },
        { labels: ['100', '—', '0'], total: 0, values: null },
      ],
    },
  }
}

test('積み上げは行ごとの分母と分割票・同点・対象なしを区別して固定する', () => {
  const data = input()
  const document = createBarChartDocument(data)
  assert.deepEqual(document.stack.rows, data.stack.rows)
  assert.equal(document.conditions, '集計版 v12 · メインストーリー · 集計単位 スキル単位')
  assert.equal(document.source.population, null)
  assert.equal(document.title, '属性別の優勢率')
  assert.equal(document.xAxisTitle, '得票率')
  assert.deepEqual(JSON.parse(JSON.stringify(document)), document)
  data.stack.rows[1].values[0] = 0
  assert.equal(document.stack.rows[1].values[0], 1.5)
  assert.ok(Object.isFrozen(document.stack.rows[1].values))
})

test('積み上げは系列順・行の整列・値の合計・対象なしと分母の不一致を拒否する', () => {
  const data = input()
  const stack = data.stack
  const variants = [
    { series: [stack.series[0], stack.series[0], stack.series[2]] },
    { rows: stack.rows.slice(1) },
    { columns: stack.columns.slice(1) },
    ...[null, [0, 2], [0, 1, 0], [1, -1, 2], [Infinity, 0, 0]].map(values => ({
      rows: [{ ...stack.rows[0], values }, ...stack.rows.slice(1)],
    })),
    { rows: [...stack.rows.slice(0, 2), { ...stack.rows[2], values: [0, 0, 0] }] },
  ]
  for (const overrides of variants) assert.throws(() => createBarChartDocument({ ...data, stack: { ...stack, ...overrides } }), /積み上げ/)
  assert.throws(() => createBarChartDocument({ ...data, bins: data.bins.map(bin => ({ ...bin, value: 0 })) }), /積み上げ/)
  assert.throws(() => createBarChartDocument({ ...data, bins: data.bins.map(bin => ({ ...bin, point: undefined })) }), /階級と値/)
  assert.throws(() => createBarChartDocument({ ...data, layout: undefined }), /積み上げ/)
})

test('点型の積み上げは行高の60%で、他のレイアウトの表示設定を高さや保存名へ混ぜない', () => {
  const document = createBarChartDocument(input())
  const off = DEFAULT_BAR_CHART_DISPLAY_SETTINGS
  const on = { values: false, axisBand: false, percent: true, cumulative: true, cumulativeBand: true, rankBand: true,
    comparisonBand: 'rank', comparisonSelection: { left: ['condition-10'] } }
  assert.deepEqual(getBarChartPresentationLabels('point', document.layout), {
    type: '100%積み上げ横棒・点型', width: '1項目の高さの60%', limit: '上限48px（PNG拡大前）',
  })
  assert.equal(getBarChartNaturalHeight(document, off), getBarChartNaturalHeight(document, on))
  const selected = toggleBarChartHighlight(on, 'condition-10')
  assert.equal(getBarChartFilename(document, off), getBarChartFilename(document, on))
  assert.match(getBarChartFilename(document, selected), /10強調/)
  assert.equal(getBarChartFilename(document, off), getBarChartFilename(document, toggleBarChartHighlight(selected, 'condition-10')))
  const snapshot = createBarChartImageSnapshot(document, selected)
  const zip = getBarChartArchiveFilename(snapshot, [{ key: 'unit', label: 'テスト単位', snapshot }])
  assert.match(zip, /10強調.*\.zip$/)
  assert.doesNotMatch(zip, /数値表示|階級帯|割合帯|累積割合|評価帯/)
})
