import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import {
  STAT_METRIC_COLORS, STAT_METRIC_NEUTRAL_COLOR, STAT_METRIC_BAR_OPACITY,
  STAT_CUMULATIVE_COLOR, STAT_CUMULATIVE_DASH_ARRAY, getStatMetricColor,
} from '../src/lib/statMetricColors.ts'
import { createBarChartDocument } from '../src/lib/barChartDocument.ts'
import { createBarChartFromProvider } from '../src/lib/barChartProviders.ts'
import { ENEMY_STAT_METRICS } from '../src/lib/enemyStatMetrics.ts'
import { buildEnemyRatingComparison } from '../src/lib/enemyRatingComparison.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { createEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'

const palette = {
  maxHp: '#719981', attack: '#9983B9', defense: '#6192A5', magicResistance: '#B97955',
  moveSpeed: '#60A5A2', baseAttackTime: '#BD85A3', massLevel: '#A09164',
}
const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const rows = [0, 1, 2].map(index => ({ id: `color-${index}`, name: `色検証${index}`, code: `C${index}`, levelType: 'NORMAL', stats: {
  maxHp: index * 5000, attack: index * 300, defense: index * 450, magicResistance: index * 30,
  moveSpeed: index * .2, baseAttackTime: index * .5, massLevel: index,
} }))
const counts = { schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(row => [row.id, { mapCount: 1, spawnCount: 1 }])) }
const context = { data: { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }, version, scope: 'main' }
const settings = { values: true, axisBand: true, percent: true, cumulative: true }
const ratingMetrics = ['maxHp', 'attack', 'defense', 'magicResistance']
const inputOf = document => Object.fromEntries([
  'xKind', 'bins', 'layout', 'series', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source',
].map(key => [key, document[key]]))
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const styleOf = tag => Object.fromEntries((tag.style ?? '').split(';').filter(Boolean).map(rule => {
  const index = rule.indexOf(':'); return [rule.slice(0, index), rule.slice(index + 1)]
}))
const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => attributes(tag))
const hasClass = (tag, name) => tag.class?.split(' ').includes(name)
const rootSvg = (markup, className) => tags(markup, 'svg').find(tag => hasClass(tag, className))
const render = (component, props) => renderToStaticMarkup(createElement(component, props))

test('7ステータスの意味に固定した色と不透明度を使い、不明・派生指標は表示名から推測せず中立色にする', () => {
  assert.deepEqual(STAT_METRIC_COLORS, palette)
  assert.ok(Object.isFrozen(STAT_METRIC_COLORS))
  assert.equal(new Set(Object.values(STAT_METRIC_COLORS)).size, 7)
  for (const [metric, color] of Object.entries(palette)) assert.equal(getStatMetricColor(metric), color)
  for (const metric of [undefined, '', 'stageAppearanceCount', 'HP', '防御力', 'maxHp ', 'unknown', '__proto__', 'toString']) {
    assert.equal(getStatMetricColor(metric), STAT_METRIC_NEUTRAL_COLOR)
  }
  assert.equal(STAT_METRIC_NEUTRAL_COLOR, '#777777')
  assert.equal(STAT_METRIC_BAR_OPACITY, 1)
  assert.equal(STAT_CUMULATIVE_COLOR, '#454951')
  assert.equal(STAT_CUMULATIVE_DASH_ARRAY, '6 4')
})

test('単体の7指標と対応防御力はmetricKeyをスナップショットに保持し、表示名の変更で色の意味を変えない', () => {
  for (const metric of ENEMY_STAT_METRICS) {
    const document = createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey: metric.key })
    assert.equal(document.semantics.metricKey, metric.key)
    assert.equal(JSON.parse(JSON.stringify(document)).semantics.metricKey, metric.key)
    assert.ok(Object.isFrozen(document.semantics))
    const input = { ...inputOf(document), semantics: { ...document.semantics, subject: '別の表示名' } }
    const renamed = createBarChartDocument(input)
    input.semantics.metricKey = 'unknown'
    assert.equal(renamed.semantics.metricKey, metric.key)
    assert.equal(getStatMetricColor(renamed.semantics.metricKey), palette[metric.key])
    assert.deepEqual(renamed.bins, document.bins)
  }
  const correspondence = createBarChartFromProvider('enemy-defense-resistance', context)
  assert.equal(correspondence.semantics.metricKey, 'defense', '横軸の術耐性ではなく、棒が表す防御力で色を決める')
})

let server, Plot, createSnapshot, imageFrame, LegacyPanel, useLegacyControls, LegacySnapshotPlot, LegacyComparisonPlot, LegacyComparisonImage
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/stat-metric-colors-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ BarChartPlot: Plot } = await server.ssrLoadModule('/src/components/BarChartPlot.tsx'))
  ;({ createBarChartImageSnapshot: createSnapshot, getBarChartImageFrame: imageFrame }
    = await server.ssrLoadModule('/src/components/BarChartImageDialog.tsx'))
  ;({ EnemyStatisticsPanel: LegacyPanel, useEnemyStatisticsControls: useLegacyControls, EnemyHistogramSnapshotPlot: LegacySnapshotPlot }
    = await server.ssrLoadModule('/src/components/EnemyStatisticsPanel.tsx'))
  ;({ EnemyRatingComparisonPlot: LegacyComparisonPlot } = await server.ssrLoadModule('/src/components/EnemyRatingComparisonPlot.tsx'))
  ;({ EnemyRatingComparisonImage: LegacyComparisonImage } = await server.ssrLoadModule('/src/components/EnemyRatingComparisonImage.tsx'))
})
after(async () => { await server?.close() })

test('単体の棒と補助累積線は画面とPNGで同じ色を使い、集計値・階級・配置を保持する', () => {
  for (const metric of ENEMY_STAT_METRICS) {
    const document = createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey: metric.key })
    const before = JSON.stringify(document)
    const snapshot = createSnapshot(document, settings)
    const screen = render(Plot, { document, settings, width: 928, height: 334 })
    const image = renderToStaticMarkup(imageFrame(snapshot).children({ width: 928, height: 334 }))
    for (const markup of [screen, image]) {
      const svg = rootSvg(markup, 'bar-chart-plot'), style = styleOf(svg)
      assert.equal(svg['data-bar-chart-metric'], metric.key)
      assert.equal(style['--bar-chart-bar'], palette[metric.key])
      assert.equal(style['--bar-chart-bar-opacity'], '1')
      assert.equal(style['--bar-chart-cumulative'], STAT_CUMULATIVE_COLOR)
      assert.equal(style['--bar-chart-cumulative-dash'], STAT_CUMULATIVE_DASH_ARRAY)
      assert.ok(tags(markup, 'polyline').some(tag => hasClass(tag, 'bar-chart-cumulative')))
    }
    assert.deepEqual(tags(screen, 'rect'), tags(image, 'rect'))
    assert.equal(JSON.stringify(document), before)
  }
})

test('左右16通りで色を配置から独立させ、同一指標は同色、左右交換は指標に追従してPNGにも保持する', () => {
  for (const leftStatKey of ratingMetrics) for (const rightStatKey of ratingMetrics) {
    const document = createBarChartFromProvider('enemy-stat-rating-comparison', { ...context, leftStatKey, rightStatKey })
    const snapshot = createSnapshot(document, settings)
    const screen = render(Plot, { document, settings, width: 928 })
    const image = renderToStaticMarkup(imageFrame(snapshot).children({ width: 928, height: 384 }))
    for (const markup of [screen, image]) {
      const style = styleOf(rootSvg(markup, 'bar-chart-comparison'))
      assert.equal(style['--bar-chart-left'], palette[leftStatKey])
      assert.equal(style['--bar-chart-right'], palette[rightStatKey])
      assert.equal(style['--bar-chart-bar-opacity'], '1')
      const sides = tags(markup, 'g').filter(tag => tag['data-bar-chart-side'])
      assert.deepEqual(sides.map(side => [side['data-bar-chart-side'], side['data-bar-chart-metric']]),
        [['left', leftStatKey], ['right', rightStatKey]])
    }
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot.document)).series.map(series => series.metricKey), [leftStatKey, rightStatKey])
    if (leftStatKey === rightStatKey) {
      const style = styleOf(rootSvg(screen, 'bar-chart-comparison'))
      assert.equal(style['--bar-chart-left'], style['--bar-chart-right'])
    }
  }
})

test('古い単体データや未知のmetricKeyは、術耐性という表示名が残っていても中立色にする', () => {
  const document = createBarChartFromProvider('enemy-stat-histogram', context)
  const { metricKey: _, ...legacySemantics } = document.semantics
  for (const semantics of [legacySemantics, { ...legacySemantics, metricKey: 'derived-resistance-score' }]) {
    const legacy = createBarChartDocument({ ...inputOf(document), semantics })
    const markup = render(Plot, { document: legacy, settings, width: 928 })
    assert.equal(styleOf(rootSvg(markup, 'bar-chart-plot'))['--bar-chart-bar'], STAT_METRIC_NEUTRAL_COLOR)
    assert.deepEqual(legacy.bins, document.bins)
  }
})

function LegacyPanelFixture({ metric }) {
  const controls = useLegacyControls()
  return createElement(LegacyPanel, { rows, allRows: rows, scopeLabel: '検証用', aggregationCounts: counts,
    controls: { ...controls, selectedMetric: metric }, filterControls: null })
}

test('既存の敵分析の7ヒストグラムもステータス固定色を使い、術耐性の保存用描画へ同じ設定を渡す', () => {
  for (const metric of ENEMY_STAT_METRICS) {
    const markup = render(LegacyPanelFixture, { metric })
    const svg = rootSvg(markup, 'enemy-stat-histogram')
    assert.ok(svg, metric.label)
    assert.equal(styleOf(svg)['--enemy-histogram-stat-color'], palette[metric.key])
    assert.equal(styleOf(svg)['--enemy-histogram-bar-opacity'], '1')
  }
  const statistics = calculateWeightedHistogram([{ value: 0, weight: 2 }, { value: 20, weight: 1 }], { customLinearBinWidth: 10 })
  const snapshot = createEnemyHistogramSnapshot({ metric: 'magicResistance', source: { scopeLabel: '検証用', enemyIds: ['a', 'b'], countGeneratedAt: 'fixture' },
    countMode: 'SPAWNS', coverage: counts.summary, scale: 'LINEAR', statistics, ratingBins: null, customLinearUpperBound: null,
    showPercentages: false, showBinRanges: false, showCumulative: true, referenceVisibility: { mean: false, median: false } })
  const markup = render(LegacySnapshotPlot, { snapshot, width: 928, height: 334 })
  const svg = rootSvg(markup, 'enemy-stat-histogram')
  assert.equal(styleOf(svg)['--enemy-histogram-stat-color'], palette.magicResistance)
  assert.equal(styleOf(svg)['--enemy-histogram-bar-opacity'], '1')
  const path = tags(markup, 'path').find(tag => hasClass(tag, 'enemy-histogram-cumulative-line'))
  assert.ok(path, '保存用SVGには補助累積線を保持する')
  assert.equal(path['stroke-dasharray'], STAT_CUMULATIVE_DASH_ARRAY)
  const cumulative = tags(markup, 'g').find(tag => tag['data-histogram-cumulative'] === 'true')
  assert.equal(styleOf(cumulative)['--histogram-cumulative-color'], STAT_CUMULATIVE_COLOR)
})

test('既存の評価別比較は画面・PNG・動画の元SVGで防御力と術耐性の固定色を共有する', () => {
  const data = buildEnemyRatingComparison(rows, 'SPAWNS', counts)
  for (const layout of ['GROUPED', 'MIRRORED', 'CUMULATIVE']) {
    const screen = render(LegacyComparisonPlot, { data, layout, width: 928, height: 352 })
    const image = render(LegacyComparisonImage, { snapshot: { data, layout, scopeLabel: '検証用', countMode: 'SPAWNS', countLabel: '出現回数' } })
    for (const markup of [screen, image]) {
      const marks = ['rect', 'path', 'polyline', 'line', 'g'].flatMap(tag => tags(markup, tag)).filter(tag => hasClass(tag, 'enemy-rating-comparison-series'))
      assert.ok(marks.length > 0, layout)
      for (const metric of ['defense', 'magicResistance']) {
        const series = marks.filter(tag => hasClass(tag, metric))
        assert.ok(series.length > 0, `${layout}: ${metric}`)
        assert.ok(series.every(tag => styleOf(tag).color === palette[metric]), `${layout}: ${metric}`)
        assert.ok(series.filter(tag => tag['fill-opacity'] !== undefined).every(tag => tag['fill-opacity'] === '1'))
      }
    }
    if (layout === 'MIRRORED') {
      const bars = tags(image, 'rect').filter(tag => tag['data-rating-video-bar'] !== undefined)
      assert.ok(bars.length > 0, '動画は固定配色済みの同じSVGを入力にする')
      assert.ok(bars.every(tag => Object.values(palette).includes(styleOf(tag).color)))
    }
  }
})
