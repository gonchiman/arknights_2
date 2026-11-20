import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { getEnemyRatingNumericRanges } from '../src/lib/enemyStatRatings.ts'
import { getHistogramBinRangeStripLayout } from '../src/lib/histogramBinRangeStrip.ts'
import { formatHistogramRatingRangeLines } from '../src/lib/histogramRatingRangeStrip.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { createEnemyHistogramSnapshot, parseEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'

let server, RatingStrips, Plot, CombinedImage, CombinedPreview
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/histogram-rating-strips-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ HistogramRatingStrips: RatingStrips } = await server.ssrLoadModule('/src/components/HistogramRatingStrips.tsx'))
  ;({ EnemyHistogramSnapshotPlot: Plot } = await server.ssrLoadModule('/src/components/EnemyStatisticsPanel.tsx'))
  ;({ SurtrCombinedChartImage: CombinedImage, SurtrCombinedChartImagePreview: CombinedPreview }
    = await server.ssrLoadModule('/src/components/SurtrCombinedChartImage.tsx'))
})
after(async () => { await server?.close() })

const RATINGS = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const tags = (markup, tag, className) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))]
  .filter(([element]) => !className || (attributes(element).class ?? '').split(' ').includes(className))
  .map(([element]) => attributes(element))
const texts = markup => [...markup.matchAll(/<text\b([^>]*class="chart-strip-label"[^>]*)>([^<]*)<\/text>/g)]
  .map(([, tag, value]) => ({ ...attributes(tag), value }))
function group(markup, marker) {
  const opening = [...markup.matchAll(/<g\b[^>]*>/g)].find(([tag]) => tag.includes(marker))
  if (!opening) return null
  const content = markup.slice(opening.index)
  let depth = 0
  for (const tag of content.matchAll(/<\/?g\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (depth === 0) return content.slice(0, tag.index + tag[0].length)
  }
  assert.fail(`Unclosed group ${marker}`)
}
const evaluation = markup => group(markup, 'data-histogram-evaluation-strip="bottom"')
const ranges = markup => group(markup, 'data-histogram-range-strip="bottom"')
const entireStrip = markup => group(markup, 'data-histogram-rating-strips="bottom"')
const fills = markup => tags(markup, 'rect', 'chart-strip-fill')
const bars = markup => tags(markup, 'rect', 'enemy-chart-bar')
const frame = markup => tags(markup, 'rect').find(tag => 'data-chart-image-plot-area' in tag)
const svgHeight = markup => +tags(markup, 'svg')[0].height

for (const stat of ['maxHp', 'attack', 'defense', 'magicResistance']) {
  test(`${stat}: 0件を含む評価10列と範囲を同じ幅の2段帯へ配置する`, () => {
    const bins = buildEnemyRatingHistogramBins([], stat)
    const originals = structuredClone(bins)
    const labels = bins.map(formatHistogramRatingRangeLines)
    const layout = getHistogramBinRangeStripLayout(labels, 820, undefined, true)
    assert.ok(layout)
    assert.equal(layout.height, 40)
    const markup = renderToStaticMarkup(createElement('svg', null, createElement(RatingStrips,
      { bins, rangeLayout: layout, plotLeft: 60, plotRight: 880, top: 20 })))
    const upper = evaluation(markup), lower = ranges(markup)
    assert.ok(upper)
    assert.ok(lower)
    assert.deepEqual(texts(upper).map(label => label.value), RATINGS)
    assert.equal(fills(upper).length, 10)
    assert.equal(fills(lower).length, 10)
    assert.ok(fills(upper).every(fill => +fill.height === 24))
    assert.ok(fills(lower).every(fill => +fill.height === 40))
    assert.equal(+fills(lower)[0].y - (+fills(upper)[0].y + 24), 4)
    assert.match(lower, />範囲<\/text>/)
    assert.deepEqual(texts(lower).map(label => label.value), layout.labels.flat())
    const cells = tags(upper, 'g').filter(tag => 'data-rating-index' in tag)
    assert.deepEqual(cells.map(cell => cell['data-rating']), RATINGS)
    cells.forEach((cell, index) => {
      assert.equal(cell['data-rating-index'], String(index))
      assert.ok(cell['aria-label']?.includes(bins[index].label), '読み上げには省略前の正確な境界を残す')
    })
    texts(upper).forEach((label, index) => assert.equal(+label.x, 60 + (index + .5) * 82))
    for (const strip of [upper, lower]) {
      assert.doesNotMatch(strip, /<title|tooltip|tabindex|role="button"|onClick|onclick|rotate\(/)
    }
    assert.deepEqual(bins, originals, '帯の書式変更が集計範囲や件数を変更しない')
    const onlyEvaluation = renderToStaticMarkup(createElement('svg', null, createElement(RatingStrips,
      { bins, rangeLayout: null, plotLeft: 60, plotRight: 880, top: 20 })))
    assert.equal(ranges(onlyEvaluation), null)
    assert.equal(evaluation(onlyEvaluation), upper, '範囲OFFや不適合時にも評価10列を残す')
  })
}

const values = [0, .25, 9.75, 10, 79.75, 80, 90, 90.25, null]
const observations = values.map((value, index) => ({ value, weight: [2, 3, 5, 7, 11, 13, 17, 19, 23][index] }))
function snapshot(overrides = {}) {
  return createEnemyHistogramSnapshot({ metric: 'magicResistance',
    source: { scopeLabel: '評価帯検証', enemyIds: values.map((_, index) => `rating_enemy_${index}`), countGeneratedAt: 'fixture' },
    countMode: 'SPAWNS', coverage: { mapCount: 2, missingMapCount: 0, spawnMapCount: 2, spawnExcludedMapCount: 0 },
    scale: 'LINEAR', statistics: calculateWeightedHistogram(observations, { scale: 'LINEAR', customLinearBinWidth: 10 }),
    ratingBins: buildEnemyRatingHistogramBins(observations, 'magicResistance'), customLinearUpperBound: null,
    showBinRanges: true, showFrequencies: true, showPercentages: true, showCumulative: true, cumulativeDisplay: 'both',
    referenceVisibility: { mean: false, median: false }, ...overrides,
  })
}
const renderPlot = (snapshot, dimensions = {}) => renderToStaticMarkup(createElement(Plot,
  { snapshot, width: 960, height: 334, ...dimensions }))

test('保存済み評価ヒストグラムの棒・上部帯を保持し、範囲だけを切り替える', () => {
  const source = snapshot()
  const on = renderPlot(source), off = renderPlot({ ...source, showBinRanges: false })
  assert.match(on, /data-histogram-axis="rating-ranges"/)
  assert.match(off, /data-histogram-axis="ratings"/)
  assert.equal(bars(on).length, 10)
  assert.deepEqual(bars(on), bars(off))
  assert.deepEqual(frame(on), frame(off))
  assert.equal(evaluation(on), evaluation(off))
  assert.equal(ranges(off), null)
  assert.ok(ranges(on))
  assert.equal(svgHeight(on) - svgHeight(off), 44)
  for (const marker of ['data-histogram-cumulative="strip"', 'data-histogram-percentage="strip"']) {
    assert.equal(group(on, marker), group(off, marker))
  }
  assert.doesNotMatch(on, /data-histogram-rank-strip=/, '数値階級用の評価帯を重ねない')
  assert.deepEqual(texts(ranges(on)).map(label => label.value), [
    '0以下', '0〜', '10', '10〜', '20', '20〜', '30', '30〜', '50', '50〜', '60', '60〜', '70', '70〜', '80', '80〜', '90', '90超',
  ])
  const cells = tags(evaluation(on), 'g').filter(tag => 'data-rating-index' in tag)
  assert.ok(cells[1]['aria-label'].includes('0 超 10 未満'))
  assert.ok(cells[8]['aria-label'].includes('80 以上 90 以下'))
  const zeroIndices = source.ratingBins.flatMap((bin, index) => bin.count === 0 ? [index] : [])
  assert.ok(zeroIndices.length > 0)
  zeroIndices.forEach(index => assert.equal(+bars(on)[index].height, 0))
  const plot = frame(on), slot = +plot.width / 10
  texts(evaluation(on)).forEach((label, index) => {
    assert.ok(Math.abs(+label.x - (+bars(on)[index].x + +bars(on)[index].width / 2)) < 1e-8)
    assert.ok(Math.abs(+label.x - (+plot.x + (index + .5) * slot)) < 1e-8)
  })
  const reserved = svgHeight(on) - 334
  const measured = renderPlot(source, { height: 334 + reserved, reservedLabelHeight: reserved })
  assert.equal(svgHeight(measured), svgHeight(on))
  assert.deepEqual(frame(measured), plot)
  assert.deepEqual(bars(measured), bars(on))
  assert.equal(entireStrip(measured), entireStrip(on))
  assert.equal(entireStrip(renderPlot(parseEnemyHistogramSnapshot(source))), entireStrip(on))
})

test('狭い画像では3行へ折り返し、数値自体が収まらない幅でも評価帯を維持する', () => {
  const source = snapshot({ showCumulative: false, showFrequencies: false })
  const baseline = renderPlot({ ...source, showBinRanges: false }, { width: 400 })
  const narrow = renderPlot(source, { width: 400 })
  assert.ok(ranges(narrow))
  assert.ok(fills(ranges(narrow)).every(fill => +fill.height === 56))
  assert.deepEqual(bars(narrow), bars(baseline))
  assert.deepEqual(frame(narrow), frame(baseline))
  assert.equal(evaluation(narrow), evaluation(baseline))
  assert.doesNotMatch(ranges(narrow), /rotate\(|font-size=|textLength=|lengthAdjust=/)
  const tiny = renderPlot(source, { width: 160 })
  assert.equal(ranges(tiny), null)
  assert.equal(fills(evaluation(tiny)).length, 10)
  assert.match(tiny, /data-histogram-axis="ratings"/)
})

test('術耐性の包含境界と重み付き集計を表示形式から独立して保つ', () => {
  const source = snapshot()
  assert.deepEqual(source.ratingBins.map(({ count }) => count), [2, 8, 7, 0, 0, 0, 0, 11, 30, 19])
  assert.deepEqual(source.ratingBins.map(({ count: _count, ...range }) => range), getEnemyRatingNumericRanges('magicResistance'))
  const before = JSON.stringify(source)
  const markup = renderPlot(source)
  assert.match(markup, /<title>D（0 超 10 未満）/)
  assert.match(markup, /<title>S\+（80 以上 90 以下）/)
  assert.equal(JSON.stringify(source), before)
  assert.equal(source.statistics.count, 77)
  assert.equal(source.statistics.missingCount, 23)
})

test('スルト合成と保存プレビューにも同じ評価帯と簡略範囲を渡す', () => {
  const source = snapshot()
  const props = { kind: 'bar', metric: 'total', title: 'スルト検証', conditions: '条件', selectedResistance: 0,
    series: [{ id: 'none', label: '未装備', color: '#777', lineStyle: 'solid', points: [{ x: 0, value: 100 }, { x: 100, value: 5 }] }],
    histogram: source,
  }
  for (const component of [CombinedImage, CombinedPreview]) {
    const on = renderToStaticMarkup(createElement(component, props))
    const off = renderToStaticMarkup(createElement(component, { ...props, histogram: { ...source, showBinRanges: false } }))
    assert.equal(fills(evaluation(on)).length, 10)
    assert.equal(evaluation(on), evaluation(off))
    assert.ok(ranges(on))
    assert.equal(ranges(off), null)
    assert.deepEqual(texts(ranges(on)).map(label => label.value), texts(ranges(renderPlot(source))).map(label => label.value))
    assert.deepEqual(bars(on), bars(off))
    assert.doesNotMatch(entireStrip(on), /<title|tooltip|tabindex|role="button"|onClick|onclick/)
  }
})
