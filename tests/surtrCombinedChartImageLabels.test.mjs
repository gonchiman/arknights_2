import assert from 'node:assert/strict'
import { after, before, mock, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let images
let histogram
before(async () => {
  const originalError = console.error
  // Existing histogram SVG titles contain multiple JSX children. Keep unrelated diagnostics visible.
  mock.method(console, 'error', (message, ...args) => {
    if (String(message).startsWith('React expects the `children` prop of <title> tags')) return
    originalError(message, ...args)
  })
  server = await createServer({
    configFile: false, plugins: [react()], resolve: { preserveSymlinks: true },
    cacheDir: 'node_modules/.vite/surtr-combined-label-test', logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  images = await server.ssrLoadModule('/src/components/SurtrCombinedChartImage.tsx')
  const { calculateWeightedHistogram } = await server.ssrLoadModule('/src/lib/enemyWeightedHistogram.ts')
  const { createEnemyHistogramSnapshot } = await server.ssrLoadModule('/src/lib/enemyHistogramSnapshot.ts')
  histogram = createEnemyHistogramSnapshot({
    metric: 'magicResistance', source: { scopeLabel: '全敵 · 地上', enemyIds: ['enemy_a', 'enemy_b', 'enemy_c'], countGeneratedAt: '2026-09-30' },
    countMode: 'SPAWNS', coverage: { mapCount: 5, missingMapCount: 1, spawnMapCount: 4, spawnExcludedMapCount: 1 }, scale: 'LINEAR',
    statistics: calculateWeightedHistogram([{ value: 0, weight: 12 }, { value: 25, weight: 6 }, { value: 100, weight: 2 }, { value: null, weight: 3 }],
      { scale: 'LINEAR', customLinearBinWidth: 10, minimumLinearUpperBound: 100 }),
    ratingBins: null, customLinearUpperBound: null, showPercentages: true, showBinRanges: true,
    referenceVisibility: { mean: false, median: true },
  })
})
after(async () => { mock.restoreAll(); await server?.close() })

const series = [
  { id: 'none', label: '未装備', color: '#737982', lineStyle: 'solid', points: [0, 20, 40, 60, 80, 100].map(x => ({ x, value: 10000 - x * 90 })) },
  { id: 'X:lv2', label: 'MOD X Lv.2', color: '#608dad', lineStyle: 'dashed', points: [0, 20, 40, 60, 80, 100].map(x => ({ x, value: 11000 - x * 95 })) },
]
const blockComparisons = [
  { blocking: false, series, conditions: '特化3・未ブロック' },
  { blocking: true, series: series.map(item => ({ ...item, points: item.points.map(point => ({ ...point, value: point.value * 1.1 })) })),
    conditions: '特化3・自身でブロック' },
]
const labels = { title: '装備によるDPS比較', xAxis: '比較する術耐性', yAxis: '毎秒ダメージ', series: { none: '装備なし', 'X:lv2': 'Xの第2段階' } }
const render = (component, props) => renderToStaticMarkup(createElement(component, {
  series, title: 'スルト S3 DPS', conditions: '特化3・未ブロック', showValues: true, showResistanceRanks: true,
  blockComparisonConditions: '特化3・ブロック状態比較', ...props,
}))
const marks = markup => [...markup.matchAll(/<(?:rect|path)[^>]*class="surtr-dps-chart-(?:bar|line)"[^>]*>/g)].map(match => match[0])
const histogramFigure = markup => markup.match(/<figure[^>]*class="[^"]*enemy-chart-image[^"]*"[^>]*>.*?<\/figure>/)?.[0]

test('combined images and previews rename DPS labels without altering marks, block headings, or the histogram', () => {
  const source = structuredClone({ series, blockComparisons })
  for (const component of [images.SurtrCombinedChartImage, images.SurtrCombinedChartImagePreview]) {
    for (const kind of ['bar', 'line']) {
      for (const aspectRatio of [undefined, 16 / 9]) {
        for (const props of [{ histogram }, { blockComparisons }, { blockComparisons, histogram }]) {
          const ordinary = render(component, { ...props, kind, aspectRatio })
          const edited = render(component, { ...props, kind, aspectRatio, labels })
          for (const text of Object.values(labels).filter(value => typeof value === 'string')) assert.ok(edited.includes(text))
          for (const text of Object.values(labels.series)) assert.ok(edited.includes(text))
          assert.deepEqual(marks(edited), marks(ordinary), `${component.name}/${kind} plot geometry and palette`)
          assert.equal((edited.match(/<strong>装備によるDPS比較<\/strong>/g) ?? []).length, 1)
          assert.doesNotMatch(edited, /MOD X Lv\.2/)
          if (props.blockComparisons) {
            assert.match(edited, /<strong>未ブロック<\/strong>/)
            assert.match(edited, /<strong>対象を自身でブロック<\/strong>/)
            assert.equal((edited.match(/class="chart-image-frame-axis-title">比較する術耐性<\/p>/g) ?? []).length, 2)
            assert.match(edited, /<title>装備によるDPS比較・未ブロック<\/title>/)
            assert.match(edited, /<title>装備によるDPS比較・対象を自身でブロック<\/title>/)
          }
          if (props.histogram) {
            assert.ok(histogramFigure(ordinary))
            assert.equal(histogramFigure(edited), histogramFigure(ordinary), 'histogram names, references, and geometry remain intact')
          }
        }
      }
    }
  }
  assert.deepEqual({ series, blockComparisons }, source)
})

test('blank edits restore the original combined output and metric-specific vertical axis', () => {
  const blank = { title: ' ', xAxis: '', yAxis: '\n', series: { none: '', 'X:lv2': ' ' } }
  for (const component of [images.SurtrCombinedChartImage, images.SurtrCombinedChartImagePreview]) {
    for (const metric of ['total', 'difference', 'percent']) {
      const props = { kind: 'line', metric, blockComparisons, histogram }
      assert.equal(render(component, { ...props, labels: blank }), render(component, props))
    }
  }
})

test('the entire long vertical label reaches both comparison panels without losing plot values', () => {
  const yAxis = '期待値の縦軸名'.repeat(15).slice(0, 100)
  const props = { kind: 'bar', blockComparisons, histogram, labels: { ...labels, yAxis } }
  for (const component of [images.SurtrCombinedChartImage, images.SurtrCombinedChartImagePreview]) {
    const markup = render(component, props)
    const axisTitles = [...markup.matchAll(/<text class="surtr-dps-chart-axis-title"[^>]*>(.*?)<\/text>/g)].map(match => match[1])
    assert.equal(axisTitles.length, 2)
    for (const title of axisTitles) {
      assert.equal(title.replace(/<[^>]+>/g, ''), yAxis)
      assert.ok((title.match(/<tspan/g) ?? []).length > 1)
    }
    assert.equal(marks(markup).length, marks(render(component, { ...props, labels })).length)
    assert.match(markup, /術耐性のヒストグラム/)
  }
})
