import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { createEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'
import { getHistogramStatRankBands } from '../src/lib/histogramStatRankBands.ts'

const values = [0, 5, 10, 15, 20, 30, 60, 90, null]
const weights = [12, 3, 4, 2, 3, 1, 1, 1, 4]
const observations = values.map((value, index) => ({ value, weight: weights[index] }))
const counts = {
  schemaVersion: 1, generatedAt: 'rank-strip-fixture', sourceGeneratedAt: null,
  summary: { mapCount: 2, missingMapCount: 0, spawnMapCount: 2, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(weights.map((spawnCount, index) => [`rank_enemy_${index}`, { mapCount: 1, spawnCount }])),
}
const enemies = values.map((magicResistance, index) => ({
  id: `rank_enemy_${index}`, index: String(index), sortId: index, name: `ランク帯確認${index}`,
  levelType: 'NORMAL', description: '', abilities: [], damageTypes: ['PHYSIC'], attackWay: 'MELEE',
  lifePointReduce: 1, databaseLevel: 0, databaseLevelCount: 1, stageAppearanceCount: 1, statusImmunities: [],
  ratings: { endurance: null, attack: null, defense: null, resistance: null },
  stats: { maxHp: 1000 + index * 1000, attack: 100 + index * 100, defense: index * 150, magicResistance,
    moveSpeed: 1, attackSpeed: 100, baseAttackTime: 2, massLevel: 1 },
}))

let server, Plot, Panel, useControls, RankStrip
before(async () => {
  server = await createServer({ configFile: false, plugins: [react(), {
    name: 'histogram-rank-strip-fixture-counts', enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.endsWith('/EnemyStatisticsPanel.tsx') && source === '../lib/useEnemyHistogramCounts') {
        return '\0histogram-rank-strip-fixture-counts'
      }
    },
    load(id) {
      if (id === '\0histogram-rank-strip-fixture-counts') {
        return `export function useEnemyHistogramCounts() { return { data: ${JSON.stringify(counts)}, error: false, loading: false, retry() {} } }`
      }
    },
  }], cacheDir: 'node_modules/.vite/histogram-stat-rank-strip-test',
  resolve: { preserveSymlinks: true }, logLevel: 'error',
  server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ EnemyHistogramSnapshotPlot: Plot, EnemyStatisticsPanel: Panel, useEnemyStatisticsControls: useControls }
    = await server.ssrLoadModule('/src/components/EnemyStatisticsPanel.tsx'))
  ;({ StatRankStrip: RankStrip } = await server.ssrLoadModule('/src/components/StatRankStrip.tsx'))
})
after(async () => { await server?.close() })

const attr = (markup, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(markup)?.[1]
const attrs = markup => Object.fromEntries([...markup.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
const rectangleAttributes = (markup, className) => [...markup.matchAll(/<rect\b[^>]*>/g)]
  .filter(([tag]) => (attr(tag, 'class') ?? '').split(' ').includes(className))
  .map(([tag]) => attrs(tag))
const bars = markup => rectangleAttributes(markup, 'enemy-chart-bar')
const frame = markup => attrs(markup.match(/<rect\b[^>]*data-chart-image-plot-area=""[^>]*>/)?.[0] ?? '')
const svgHeight = markup => Number(attr(markup.match(/<svg\b[^>]*>/)?.[0] ?? '', 'height'))
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
const strip = markup => group(markup, 'data-histogram-rank-strip="bottom"')
function snapshot(overrides = {}, source = observations) {
  const scale = overrides.scale ?? 'LINEAR'
  return createEnemyHistogramSnapshot({
    metric: 'magicResistance', source: { scopeLabel: '全敵', enemyIds: enemies.map(enemy => enemy.id), countGeneratedAt: counts.generatedAt },
    countMode: 'SPAWNS', coverage: counts.summary, scale,
    statistics: calculateWeightedHistogram(source, scale === 'LOG' ? { scale }
      : { scale, customLinearBinWidth: 10, customLinearUpperBound: 20 }),
    ratingBins: null, customLinearUpperBound: scale === 'LOG' ? null : 20,
    showPercentages: false, showBinRanges: true, referenceVisibility: { mean: false, median: false },
    ...overrides,
  })
}
const renderPlot = (source, dimensions = {}) => renderToStaticMarkup(createElement(Plot, { snapshot: source, width: 960, height: 334, ...dimensions }))

test('旧スナップショットと初期OFFにはランク帯を追加しない', () => {
  const current = snapshot()
  const { showStatRanks: _rankStrip, ...legacy } = current
  for (const source of [current, legacy, { ...current, showStatRanks: false }]) {
    const markup = renderPlot(source)
    assert.equal(strip(markup), null)
    assert.doesNotMatch(markup, /stat-rank-strip-band|data-rank-point=/)
    assert.equal(bars(markup).length, source.statistics.bins.length)
    assert.ok(group(markup, 'data-histogram-range-strip="bottom"'))
    assert.equal(svgHeight(markup), 352, '数値範囲の帯に必要な高さはランク帯OFFでも確保する')
  }
})

test('数値階級の下に共通ランク帯を表示し、棒・件数・軸と累積表示を変えない', () => {
  for (const scale of ['LINEAR', 'LOG']) for (const cumulativeDisplay of ['line', 'strip', 'both']) {
    const off = snapshot({ scale, showCumulative: true, cumulativeDisplay })
    const on = snapshot({ scale, showCumulative: true, cumulativeDisplay, showStatRanks: true })
    const original = renderPlot(off), markup = renderPlot(on)
    const rankStrip = strip(markup)
    assert.ok(rankStrip)
    assert.match(rankStrip, /class="stat-rank-strip"/)
    assert.match(rankStrip, /class="stat-rank-strip-fill"/)
    assert.match(rankStrip, /data-rank="E・D"/)
    assert.match(rankStrip, />E・D<\/text>/)
    assert.doesNotMatch(rankStrip, /stat-rank-strip-point|data-rank-point=|<line|[A-Z]\+?·\d/)
    assert.doesNotMatch(rankStrip, /<title|tabindex|role="button"|tooltip|onClick/)
    assert.deepEqual(bars(markup), bars(original))
    assert.deepEqual(frame(markup), frame(original))
    assert.deepEqual(on.statistics, off.statistics)
    assert.equal(bars(markup).length, on.statistics.bins.length)
    for (const display of ['line', 'strip']) {
      assert.equal(group(markup, `data-histogram-cumulative="${display}"`), group(original, `data-histogram-cumulative="${display}"`))
    }
    const plotBottom = Number(frame(markup).y) + Number(frame(markup).height)
    const rankFills = rectangleAttributes(rankStrip, 'stat-rank-strip-fill')
    assert.ok(rankFills.length > 0)
    for (const fill of rankFills) {
      assert.ok(Number(fill.y) > plotBottom + 19, '帯を軸の数値ラベルより下に置く')
      assert.ok(Number(fill.y) + Number(fill.height) <= svgHeight(markup), '帯をSVGの下端に収める')
    }
    const hasRangeStrip = group(markup, 'data-histogram-range-strip="bottom"') !== null
    assert.equal(svgHeight(markup) - svgHeight(original), hasRangeStrip ? 28 : 36,
      '数値範囲の帯には4px、通常の目盛りには従来の間隔を確保して評価帯を追加する')
  }
})

test('階級の数値範囲を棒と同じ幅のセルにし、評価帯を4px下に配置する', () => {
  const source = snapshot({ showStatRanks: true })
  const markup = renderPlot(source)
  const ranges = group(markup, 'data-histogram-range-strip="bottom"')
  assert.ok(ranges)
  assert.match(markup, /data-histogram-axis="ranges"/)
  for (const label of ['0〜10', '10〜20', '20超']) assert.ok(ranges.includes(`>${label}</text>`))
  assert.doesNotMatch(ranges, /<title|tabindex|role="button"|tooltip|onClick/)
  const cells = rectangleAttributes(ranges, 'chart-strip-fill')
  const plottedBars = bars(markup)
  assert.equal(cells.length, plottedBars.length)
  const plot = frame(markup)
  const cellWidth = Number(plot.width) / cells.length
  cells.forEach((cell, index) => {
    const center = Number(plot.x) + (index + .5) * cellWidth
    assert.ok(Math.abs(Number(plottedBars[index].x) + Number(plottedBars[index].width) / 2 - center) < 1e-8)
    assert.ok(Number(cell.x) >= Number(plot.x) + index * cellWidth)
    assert.ok(Number(cell.x) + Number(cell.width) <= Number(plot.x) + (index + 1) * cellWidth + 1e-8)
  })
  const rangeBottom = Number(cells[0].y) + Number(cells[0].height)
  const rankTop = Number(rectangleAttributes(strip(markup), 'stat-rank-strip-fill')[0].y)
  assert.equal(rankTop - rangeBottom, 4)
  const off = renderPlot(snapshot({ showStatRanks: true, showBinRanges: false }))
  assert.equal(group(off, 'data-histogram-range-strip="bottom"'), null)
  assert.ok(strip(off), '階級範囲と評価の表示設定を独立させる')
  assert.deepEqual(bars(off), plottedBars)
  assert.deepEqual(frame(off), plot)
})

test('幅に応じて範囲を2行にし、収まらないときは通常の目盛りへ戻す', () => {
  const source = snapshot({ showStatRanks: true })
  const narrow = renderPlot(source, { width: 170 })
  const ranges = group(narrow, 'data-histogram-range-strip="bottom"')
  assert.ok(ranges)
  assert.match(ranges, />0〜<\/text>/)
  assert.equal(Number(rectangleAttributes(ranges, 'chart-strip-fill')[0].height), 40)
  const dense = snapshot({ showStatRanks: true,
    statistics: calculateWeightedHistogram(Array.from({ length: 101 }, (_, value) => ({ value, weight: 1 })),
      { scale: 'LINEAR', customLinearBinWidth: 1 }),
  })
  const crowded = renderPlot(dense, { width: 320 })
  assert.equal(group(crowded, 'data-histogram-range-strip="bottom"'), null)
  assert.match(crowded, /data-histogram-axis="ticks"/)
  assert.ok(strip(crowded))
})

test('合成出力の予約高を引いても帯と棒の位置に高さを重複加算しない', () => {
  const source = snapshot({ showStatRanks: true })
  const original = renderPlot(source)
  const reserved = svgHeight(original) - 334
  const measured = renderPlot(source, { height: 334 + reserved, reservedLabelHeight: reserved })
  assert.equal(svgHeight(measured), svgHeight(original))
  assert.deepEqual(frame(measured), frame(original))
  assert.deepEqual(bars(measured), bars(original))
  assert.equal(group(measured, 'data-histogram-range-strip="bottom"'), group(original, 'data-histogram-range-strip="bottom"'))
  assert.equal(strip(measured), strip(original))
})

test('上限超過は全スロットで評価範囲を示し、ゲーム内評価別区分では帯を抑制する', () => {
  const source = snapshot({ showStatRanks: true })
  const rankStrip = strip(renderPlot(source))
  assert.match(rankStrip, /data-rank="B〜SS"/)
  assert.match(rankStrip, />B〜SS<\/text>/)
  const rated = { ...source, ratingBins: buildEnemyRatingHistogramBins(observations, 'magicResistance') }
  const markup = renderPlot(rated)
  assert.equal(strip(markup), null)
  assert.doesNotMatch(markup, /class="stat-rank-strip"/)
  assert.equal(bars(markup).length, 10)
  assert.match(markup, /data-histogram-axis="ratings"/)
})

test('含まれる上限の評価は隣接する帯のラベルにまとめ、画像右端へ独立ラベルを出さない', () => {
  const sourceObservations = observations.filter(({value}) => value !== null && value <= 20)
  const source = snapshot({ showStatRanks: true, customLinearUpperBound: null,
    statistics: calculateWeightedHistogram(sourceObservations, { scale: 'LINEAR', customLinearBinWidth: 10 }),
  }, sourceObservations)
  const markup = renderPlot(source, { width: 420 })
  const rankStrip = strip(markup)
  assert.match(rankStrip, /data-rank="C・B"/)
  assert.match(rankStrip, />C・B<\/text>/)
  assert.doesNotMatch(rankStrip, /stat-rank-strip-point|data-rank-point=|<line|[A-Z]\+?·\d/)
  const plotRight = Number(frame(markup).x) + Number(frame(markup).width)
  for (const fill of rectangleAttributes(rankStrip, 'stat-rank-strip-fill')) {
    assert.ok(Number(fill.x) + Number(fill.width) <= plotRight)
    assert.ok(Number(fill.y) + Number(fill.height) < svgHeight(markup))
  }
})

test('境界の異なる複数評価も共通部品の同じ1段に描画し、独立した端点行を作らない', () => {
  const examples = [
    { stat: 'magicResistance', bins: [{ start: 90, end: 100, count: 1, includesMaximum: true }], labels: ['S+・SS'] },
    { stat: 'defense', bins: [{ start: 900, end: 1000, count: 1, includesMaximum: true },
      { start: 1000, end: 1100, count: 0, includesMaximum: true, isOverflow: true }], labels: ['B+・A', 'A〜SS'] },
  ]
  for (const { stat, bins, labels } of examples) {
    const bands = getHistogramStatRankBands(stat, bins)
    const markup = renderToStaticMarkup(createElement('svg', null,
      createElement(RankStrip, { bands, left: 50, right: 350, top: 40, showTooltips: false })))
    for (const label of labels) {
      assert.ok(markup.includes(`data-rank="${label}"`))
      assert.ok(markup.includes(`>${label}</text>`))
    }
    assert.doesNotMatch(markup, /stat-rank-strip-point|data-rank-point=|<line|<title|[A-Z]\+?·\d/)
    for (const fill of rectangleAttributes(markup, 'stat-rank-strip-fill')) {
      assert.equal(Number(fill.y), 40)
      assert.equal(Number(fill.height), 24)
    }
  }
})

function PanelWrapper({ initialSnapshot, metric = 'maxHp', editor = false }) {
  const controls = useControls(initialSnapshot)
  const labels = { maxHp: 'HP', attack: '攻撃力', defense: '防御力', magicResistance: '術耐性', moveSpeed: '移動速度' }
  const selectedMetric = { ...controls.selectedMetric, key: metric, label: labels[metric], axisLabel: labels[metric] }
  return createElement(Panel, { rows: enemies, allRows: enemies, scopeLabel: '全敵', controls: { ...controls, selectedMetric },
    filterControls: null, aggregationCounts: counts,
    ...(editor ? { histogramEditor: { initialSnapshot: initialSnapshot ?? null, onChange() {} } } : {}),
  })
}
const rankControl = markup => [...markup.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)]
  .find(([tag]) => tag.includes('ステータスランク帯'))?.[0]

test('ランク対応指標に初期OFFのチェックを置き、非対応指標では表示しない', () => {
  for (const metric of ['maxHp', 'attack', 'defense', 'magicResistance']) {
    const markup = renderToStaticMarkup(createElement(PanelWrapper, { metric }))
    const control = rankControl(markup)
    assert.ok(control, metric)
    assert.doesNotMatch(control, /checked=""/)
    assert.equal(strip(markup), null)
  }
  assert.equal(rankControl(renderToStaticMarkup(createElement(PanelWrapper, { metric: 'moveSpeed' }))), undefined)
})

test('編集パネルは保存したランク帯ONを復元し、公開プロットも同じ帯を表示する', () => {
  const source = snapshot({ showStatRanks: true })
  const markup = renderToStaticMarkup(createElement(PanelWrapper, { initialSnapshot: source, editor: true }))
  assert.match(rankControl(markup), /checked=""/)
  assert.ok(strip(renderPlot(source)))
  const rated = snapshot({ ratingBins: buildEnemyRatingHistogramBins(observations, 'magicResistance'), showStatRanks: true })
  const ratedMarkup = renderToStaticMarkup(createElement(PanelWrapper, { initialSnapshot: rated, editor: true }))
  assert.equal(rankControl(ratedMarkup), undefined)
  assert.equal(strip(ratedMarkup), null)
})
