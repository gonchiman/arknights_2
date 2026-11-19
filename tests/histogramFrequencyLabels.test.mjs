import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { createEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'

let server, Plot
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/histogram-frequency-label-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ EnemyHistogramSnapshotPlot: Plot } = await server.ssrLoadModule('/src/components/EnemyStatisticsPanel.tsx'))
})
after(async () => { await server?.close() })

const attr = (markup, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(markup)?.[1]
const attributes = markup => Object.fromEntries([...markup.matchAll(/([\w:-]+)="([^"]*)"/g)]
  .map(([, key, value]) => [key, value]))
const rectangles = markup => [...markup.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => attributes(tag))
const bars = markup => rectangles(markup).filter(rectangle => rectangle.class?.split(' ').includes('enemy-chart-bar'))
const frame = markup => rectangles(markup).find(rectangle => 'data-chart-image-plot-area' in rectangle)
const height = markup => Number(attr(markup.match(/<svg\b[^>]*>/)?.[0] ?? '', 'height'))
const frequencyLabels = markup => [...markup.matchAll(/<text\b([^>]*data-frequency-index="[^"]*"[^>]*)>([^<]*)<\/text>/g)]
  .map(([, tag, text]) => ({ ...attributes(tag), text }))
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
const percentageStrip = markup => group(markup, 'data-histogram-percentage="strip"')
const cumulativeStrip = markup => group(markup, 'data-histogram-cumulative="strip"')
const rangeStrip = markup => group(markup, 'data-histogram-range-strip="bottom"')
const rankStrip = markup => group(markup, 'data-histogram-rank-strip="bottom"')
const bandBottom = markup => Math.max(...rectangles(markup).map(rectangle => Number(rectangle.y) + Number(rectangle.height)))
const bandTop = markup => Math.min(...rectangles(markup).map(rectangle => Number(rectangle.y)))
const stripLabels = markup => [...markup.matchAll(/<text\b[^>]*class="chart-strip-label"[^>]*>([^<]*)<\/text>/g)].map(([, text]) => text)
const render = (snapshot, dimensions = {}) => renderToStaticMarkup(createElement(Plot, { snapshot, width: 960, height: 334, ...dimensions }))
const observations = [0, 10, 20, 30, null].map((value, index) => ({ value, weight: [2, 3, 1, 2, 84][index] }))
function snapshot(overrides = {}, source = observations) {
  const scale = overrides.scale ?? 'LINEAR'
  return createEnemyHistogramSnapshot({ metric: 'magicResistance',
    source: { scopeLabel: '検証用', enemyIds: source.map((_, index) => `frequency_enemy_${index}`), countGeneratedAt: 'fixture' },
    countMode: 'SPAWNS', coverage: { mapCount: 5, missingMapCount: 0, spawnMapCount: 5, spawnExcludedMapCount: 0 }, scale,
    statistics: calculateWeightedHistogram(source, scale === 'LOG' ? { scale }
      : { customLinearBinWidth: 10, customLinearUpperBound: 20 }),
    ratingBins: null, customLinearUpperBound: scale === 'LOG' ? null : 20,
    showPercentages: false, showBinRanges: false,
    referenceVisibility: { mean: false, median: false }, ...overrides,
  })
}

test('度数設定の省略はONとして描画し、割合帯をOFFにしても実数を棒上に残す', () => {
  const source = snapshot()
  const { showFrequencies: _setting, ...legacy } = source
  const defaults = render(legacy)
  assert.equal(defaults, render({ ...source, showFrequencies: true }))
  assert.deepEqual(frequencyLabels(defaults).map(label => label.text), ['2', '4', '2'])
  assert.equal(percentageStrip(defaults), null)
  assert.doesNotMatch(defaults, /data-percentage-index=|enemy-histogram-percentage-label/)
  assert.deepEqual(frequencyLabels(render({ ...source, showFrequencies: false })), [])
})

test('種類数・登場マップ数・期待出現数は単位に応じた度数を表示し、小数と桁区切りを保つ', () => {
  const cases = [
    { countMode: 'TYPES', unit: '種類', weights: [1, 1, 1, 1, 1], expected: ['1', '2', '1'] },
    { countMode: 'MAPS', unit: '件', weights: [3, 4, 2, 5, 100], expected: ['3', '6', '5'] },
    { countMode: 'SPAWNS', unit: '体', weights: [0.125, 0.3, 0.25, 1200.125, 99], expected: ['0.125', '0.55', '1,200.125'] },
  ]
  for (const { countMode, unit, weights, expected } of cases) {
    const source = snapshot({ countMode }, observations.map((row, index) => ({ ...row, weight: weights[index] })))
    const markup = render(source)
    assert.deepEqual(frequencyLabels(markup).map(label => label.text), expected, countMode)
    const titles = [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"[^>]*><title>([^<]*)<\/title>/g)]
    assert.deepEqual(titles.map(([, title]) => title.split('：').at(-1)), expected.map(value => value + unit), countMode)
    assert.doesNotMatch(frequencyLabels(markup).map(label => label.text).join(' '), /%/)
  }
})

test('対数階級と評価階級でも0件を含む全階級の度数を表示し、割合を有効件数から求める', () => {
  const logarithmic = snapshot({ scale: 'LOG', showPercentages: true },
    observations.map((row, index) => ({ ...row, value: [1, 10, 100, 1000, null][index] })))
  const rated = snapshot({ ratingBins: buildEnemyRatingHistogramBins(observations, 'magicResistance'), showPercentages: true })
  assert.deepEqual(frequencyLabels(render(rated)).map(label => label.text), ['2', '0', '3', '1', '2', '0', '0', '0', '0', '0'])
  assert.deepEqual(stripLabels(percentageStrip(render(rated))), ['25', '0', '37.5', '12.5', '25', '0', '0', '0', '0', '0'])
  for (const source of [logarithmic, rated]) {
    const markup = render(source)
    const bins = source.ratingBins ?? source.statistics.bins
    assert.equal(frequencyLabels(markup).length, bins.length)
    assert.equal(frequencyLabels(markup).reduce((sum, label) => sum + Number(label.text.replaceAll(',', '')), 0), 8)
    assert.equal(source.statistics.missingCount, 84)
    assert.doesNotMatch(markup, /NaN|Infinity/)
  }
})

test('度数・割合帯・累積4形式を独立して切り替えても棒の幅・高さ・階級を保つ', () => {
  for (const display of ['none', 'line', 'strip', 'both']) {
    const source = snapshot({ showCumulative: display !== 'none', cumulativeDisplay: display === 'none' ? 'line' : display })
    const baseline = render({ ...source, showFrequencies: false, showPercentages: false })
    for (const showFrequencies of [false, true]) for (const showPercentages of [false, true]) {
      const markup = render({ ...source, showFrequencies, showPercentages })
      assert.equal(frequencyLabels(markup).length, showFrequencies ? 3 : 0, `${display}: frequency ${showFrequencies}`)
      assert.equal(Boolean(percentageStrip(markup)), showPercentages)
      assert.equal(Boolean(cumulativeStrip(markup)), display === 'strip' || display === 'both')
      assert.equal(/class="enemy-histogram-cumulative-line"/.test(markup), display === 'line' || display === 'both')
      assert.deepEqual(bars(markup).map(({ x, width, height }) => ({ x, width, height })),
        bars(baseline).map(({ x, width, height }) => ({ x, width, height })))
      const translations = bars(markup).map((bar, index) => Number(bar.y) - Number(bars(baseline)[index].y))
      assert.ok(translations.every(offset => Math.abs(offset - translations[0]) < 1e-8), '棒は余白に応じて同じ量だけ移動する')
      assert.equal(frame(markup).x, frame(baseline).x)
      assert.equal(frame(markup).width, frame(baseline).width)
      if (showPercentages) assert.deepEqual(stripLabels(percentageStrip(markup)), ['25', '50', '25'])
    }
  }
})

test('上下の帯名を左に揃え、基準線も収めて予約高さを二重加算しない', () => {
  for (const width of [360, 960]) {
    const source = snapshot({ showCumulative: true, cumulativeDisplay: 'both', showPercentages: true,
      showBinRanges: true, showStatRanks: true, referenceVisibility: { mean: true, median: true },
      percentileReference: { percentage: 75, value: 20 } })
    const markup = render(source, { width })
    assert.equal(bandTop(cumulativeStrip(markup)), 0, '上部見出し専用の空行を残さない')
    assert.equal(bandTop(percentageStrip(markup)), 28, '累積帯の24pxと隙間4pxに続けて割合帯を置く')
    assert.ok(bandBottom(cumulativeStrip(markup)) < bandTop(percentageStrip(markup)))
    assert.ok(bandBottom(percentageStrip(markup)) < Number(frame(markup).y))
    const rowNames = [cumulativeStrip(markup), percentageStrip(markup), rangeStrip(markup), rankStrip(markup)]
      .map(strip => strip.match(/<text\b([^>]*)>([\s\S]*?)<\/text>/))
    assert.deepEqual(rowNames.map(([, , content]) => content.replace(/<[^>]*>/g, '')), ['累積割合（%）', '割合（%）', '階級', '評価'])
    for (const [, tag] of rowNames) {
      assert.equal(Number(attr(tag, 'x')), Number(frame(markup).x) - 8, '上部と下部の帯名の右端を揃える')
      assert.equal(attr(tag, 'text-anchor'), 'end')
    }
    for (const [index, getStrip] of [cumulativeStrip, percentageStrip].entries()) {
      const [, tag, content] = rowNames[index]
      const lines = [...content.matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map(([, text]) => text)
      assert.equal(lines.length, 2)
      assert.ok(Number(attr(tag, 'x')) - Math.max(...lines.map(line => line.length * 10)) >= 0,
        '10pxの共通文字サイズで帯名全体をSVG左端の内側に収める')
      assert.ok(Number(attr(tag, 'y')) - 8 >= bandTop(getStrip(markup)))
      assert.ok(Number(attr(tag, 'y')) + 11 + 2 <= bandBottom(getStrip(markup)))
    }
    const references = [...markup.matchAll(/<text\b([^>]*class="enemy-chart-reference-label (?:mean|median|percentile)"[^>]*)>/g)]
    assert.equal(references.length, 3)
    for (const [, tag] of references) {
      assert.ok(Number(attr(tag, 'y')) > bandBottom(percentageStrip(markup)))
      assert.ok(Number(attr(tag, 'y')) < Number(frame(markup).y))
    }
    assert.ok(bandTop(rangeStrip(markup)) >= Number(frame(markup).y) + Number(frame(markup).height))
    assert.equal(bandTop(rankStrip(markup)) - bandBottom(rangeStrip(markup)), 4)
    assert.ok(bandBottom(rankStrip(markup)) <= height(markup))
    const reserved = height(markup) - 334
    assert.ok(reserved > 0)
    const measured = render(source, { width, height: 334 + reserved, reservedLabelHeight: reserved })
    assert.equal(height(measured), height(markup))
    assert.deepEqual(frame(measured), frame(markup))
    assert.deepEqual(bars(measured), bars(markup))
    for (const getStrip of [cumulativeStrip, percentageStrip, rangeStrip, rankStrip]) assert.equal(getStrip(measured), getStrip(markup))
    assert.deepEqual(frequencyLabels(measured), frequencyLabels(markup))
  }
})

test('度数ラベルは平均・中央値・累積線を避け、移動したラベルに接続線を残す', () => {
  const source = snapshot({ customLinearUpperBound: null, showCumulative: true, cumulativeDisplay: 'both', showPercentages: true,
    referenceVisibility: { mean: true, median: true },
    statistics: calculateWeightedHistogram(Array.from({ length: 10 }, (_, index) => ({ value: index * 10, weight: index === 0 ? 3 : 1 })),
      { customLinearBinWidth: 10, minimumLinearUpperBound: 100 }),
  })
  const markup = render(source)
  const transform = markup.match(/<g\b[^>]*class="enemy-histogram-values"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/)
  assert.ok(transform)
  const boxes = frequencyLabels(markup).map(label => ({
    x: Number(transform[1]) + Number(label.x) - (label.text.length * 8 + 6) / 2,
    y: Number(transform[2]) + Number(label.y) - 19 / 2,
    width: label.text.length * 8 + 6, height: 19,
  }))
  const referenceXs = [...markup.matchAll(/<line\b([^>]*class="enemy-chart-reference (?:mean|median)"[^>]*)>/g)]
    .map(([, tag]) => Number(attr(tag, 'x1')))
  const points = [...markup.matchAll(/<circle\b([^>]*class="enemy-histogram-cumulative-point"[^>]*)>/g)]
    .map(([, tag]) => ({ x: Number(attr(tag, 'cx')), y: Number(attr(tag, 'cy')) }))
  assert.equal(boxes.length, 10)
  assert.match(markup, /class="enemy-histogram-value-connector"/)
  for (const box of boxes) {
    for (const x of referenceXs) assert.ok(box.x + box.width <= x - 5 || box.x >= x + 5)
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1], end = points[index]
      const left = Math.max(box.x - 4, start.x), right = Math.min(box.x + box.width + 4, end.x)
      if (left > right) continue
      const yAt = x => start.y + (end.y - start.y) * (x - start.x) / (end.x - start.x)
      const minimum = Math.min(yAt(left), yAt(right)), maximum = Math.max(yAt(left), yAt(right))
      assert.ok(box.y + box.height + 4 < minimum || box.y > maximum + 4, '度数の文字と累積線の間に隙間を残す')
    }
    assert.ok(box.y > bandBottom(percentageStrip(markup)), '度数を上部帯へ重ねない')
    assert.ok(box.y + box.height < height(markup))
  }
})
