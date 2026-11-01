import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { createEnemyHistogramSnapshot, parseEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'

const fixtureCounts = {
  schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 5, missingMapCount: 0, spawnMapCount: 5, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries([2, 3, 1, 2, 84].map((spawnCount, index) => [`enemy_${index}`, { mapCount: 1, spawnCount }])),
}
const observations = [0, 10, 20, 30, null].map((value, index) => ({
  value, weight: fixtureCounts.enemies[`enemy_${index}`].spawnCount,
}))
const enemies = observations.map(({ value }, index) => ({
  id: `enemy_${index}`, index: String(index), sortId: index, name: `検証用の敵${index}`,
  levelType: 'ELITE', description: '', abilities: [], damageTypes: ['PHYSIC'],
  attackWay: 'MELEE', lifePointReduce: 1, databaseLevel: 0, databaseLevelCount: 1,
  stageAppearanceCount: 1, statusImmunities: [],
  ratings: { endurance: null, attack: null, defense: null, resistance: null },
  stats: { maxHp: 1000, attack: 200, defense: 100, magicResistance: value,
    moveSpeed: 1, attackSpeed: 100, baseAttackTime: 2, massLevel: 1 },
}))

let server, Plot, Panel, useControls
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react(), {
      name: 'enemy-histogram-cumulative-fixture-counts', enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.endsWith('/EnemyStatisticsPanel.tsx') && source === '../lib/useEnemyHistogramCounts') {
          return '\0enemy-histogram-cumulative-fixture-counts'
        }
      },
      load(id) {
        if (id === '\0enemy-histogram-cumulative-fixture-counts') {
          return `export function useEnemyHistogramCounts() { return { data: ${JSON.stringify(fixtureCounts)}, error: false, loading: false, retry() {} } }`
        }
      },
    }], cacheDir: 'node_modules/.vite/enemy-histogram-cumulative-integration-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ EnemyHistogramSnapshotPlot: Plot, EnemyStatisticsPanel: Panel, useEnemyStatisticsControls: useControls }
    = await server.ssrLoadModule('/src/components/EnemyStatisticsPanel.tsx'))
})
after(async () => { await server?.close() })

function snapshot(options = {}) {
  const { kind = 'linear', showCumulative = true, cumulativeDisplay = 'line', showPercentages = false,
    referenceVisibility = { mean: false, median: false } } = options
  const log = kind === 'log'
  const source = log ? observations.map((item, index) => ({ ...item, value: [1, 10, 100, 1000, null][index] })) : observations
  return createEnemyHistogramSnapshot({
    metric: 'magicResistance', source: { scopeLabel: 'エリート・検証fixture',
      enemyIds: enemies.map(enemy => enemy.id), countGeneratedAt: 'fixture' },
    countMode: 'SPAWNS', coverage: fixtureCounts.summary, scale: log ? 'LOG' : 'LINEAR',
    statistics: calculateWeightedHistogram(source, log ? { scale: 'LOG' }
      : { customLinearBinWidth: 10, customLinearUpperBound: 20 }),
    ratingBins: kind === 'rating' ? buildEnemyRatingHistogramBins(source, 'magicResistance') : null,
    customLinearUpperBound: log ? null : 20, showCumulative, cumulativeDisplay, showPercentages, showBinRanges: false,
    referenceVisibility,
    editorSettings: { levelType: 'ALL', numericConditions: [], linearBinWidthInput: log ? '' : '10', linearUpperBoundInput: log ? '' : '20' },
  })
}
const renderPlot = (source, dimensions = {}) => renderToStaticMarkup(createElement(Plot, {
  snapshot: source, width: 960, height: 334, ...dimensions,
}))
const clean = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const attr = (value, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(value)?.[1]
const cumulativeSection = (markup, display) => {
  const start = new RegExp(`<g\\b[^>]*data-histogram-cumulative="${display}"[^>]*>`).exec(markup)
  assert.ok(start, `${display}の累積表示がある`)
  const content = markup.slice(start.index)
  let depth = 0
  for (const tag of content.matchAll(/<\/?g\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (depth === 0) return content.slice(0, tag.index + tag[0].length)
  }
  assert.fail(`${display}の累積表示が閉じている`)
}
const cumulativePoints = markup => [...markup.matchAll(/<g\b([^>]*data-cumulative-index="[^"]*"[^>]*)>/g)]
  .map(match => ({ index: Number(attr(match[1], 'data-cumulative-index')),
    count: Number(attr(match[1], 'data-cumulative-count')),
    proportion: Number(attr(match[1], 'data-cumulative-proportion')) }))
const barTitles = markup => [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"[^>]*>([\s\S]*?)<\/rect>/g)]
  .map(match => clean(match[1]))
const overlayPath = markup => /<path\b[^>]*class="enemy-histogram-cumulative-line"[^>]*d="([^"]+)"/.exec(markup)?.[1]
const barCenters = markup => [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
  .map(match => Number(attr(match[1], 'x')) + Number(attr(match[1], 'width')) / 2)
const cumulativePointXs = markup => [...markup.matchAll(/<circle\b[^>]*class="enemy-histogram-cumulative-point"([^>]*)>/g)]
  .map(match => Number(attr(match[1], 'cx')))
const cumulativeStripCells = markup => [...markup.matchAll(/<g\b([^>]*data-cumulative-index="[^"]*"[^>]*)>([\s\S]*?)<\/g>/g)]
  .map(match => ({
    index: Number(attr(match[1], 'data-cumulative-index')),
    rectangle: /<rect\b([^>]*)>/.exec(match[2])?.[1],
    label: /<text\b([^>]*)>([^<]*)<\/text>/.exec(match[2]),
  })).filter(cell => cell.rectangle)
const percentageLabels = markup => [...markup.matchAll(/<text\b([^>]*data-percentage-index="[^"]*"[^>]*)>([^<]*)<\/text>/g)]
  .map(match => ({ index: Number(attr(match[1], 'data-percentage-index')), text: match[2],
    x: Number(attr(match[1], 'x')), y: Number(attr(match[1], 'y')) }))
const countAxisTicks = markup => {
  const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
  return [...markup.matchAll(/<text\b([^>]*class="enemy-chart-tick"[^>]*)>([\d,]+)<\/text>/g)]
    .filter(match => Number(attr(match[1], 'x')) < Number(attr(frame, 'x')))
    .map(match => Number(match[2].replaceAll(',', '')))
}

function PanelWrapper({ initialSnapshot, editor = false, aggregationCounts, aggregationVersion }) {
  const controls = useControls(initialSnapshot)
  return createElement(Panel, { rows: enemies, allRows: enemies, scopeLabel: 'エリート・検証fixture', controls,
    filterControls: null, aggregationCounts, aggregationVersion,
    ...(editor ? { histogramEditor: { initialSnapshot: initialSnapshot ?? null, onChange() {} } } : {}) })
}
const renderPanel = props => renderToStaticMarkup(createElement(PanelWrapper, props))
const cumulativeSelect = markup => [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
  .find(match => clean(match[1]).startsWith('累積割合'))?.[1]
const selectedCumulativeDisplay = markup => {
  const select = cumulativeSelect(markup)
  assert.ok(select, '累積割合の選択欄がある')
  return [...select.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)]
    .find(match => /\bselected=""/.test(match[1]))?.[2]
}

test('指定した集計版の出現数だけを描画し、別版のキャッシュへフォールバックしない', () => {
  const aggregationVersion = { id: 'v2', label: '第2版', sourceRevision: 'abc123', ruleVersion: 'hidden-groups-v2' }
  const initialSnapshot = snapshot()
  const live = renderPanel({ initialSnapshot })
  const aggregationCounts = { ...fixtureCounts, enemies: Object.fromEntries(
    Object.entries(fixtureCounts.enemies).map(([id, counts]) => [id, { ...counts, spawnCount: counts.spawnCount * 10 }]),
  ) }
  const fixed = renderPanel({ initialSnapshot, aggregationCounts, aggregationVersion })
  assert.notDeepEqual(barTitles(fixed), barTitles(live))
  assert.ok(barTitles(fixed).some(title => title.includes('20体')))
  const unavailable = renderPanel({ initialSnapshot, aggregationVersion })
  assert.deepEqual(barTitles(unavailable), [])
  assert.match(clean(unavailable), /登場データを取得できませんでした/)
})

test('累積オプションONだけに右軸0〜100%と線を出し、元の階級と件数は変えない', () => {
  const on = snapshot(), off = snapshot({ showCumulative: false })
  const before = structuredClone(on)
  const enabled = renderPlot(on), disabled = renderPlot(off)
  assert.match(enabled, /data-histogram-cumulative="true"/)
  assert.ok(overlayPath(enabled))
  assert.doesNotMatch(disabled, /data-histogram-cumulative|enemy-histogram-cumulative-axis|enemy-histogram-cumulative-line/)
  const axis = /<g class="enemy-histogram-cumulative-axis"([\s\S]*?)<path/.exec(enabled)?.[1]
  assert.deepEqual([...axis.matchAll(/<text\b[^>]*>(\d+%)<\/text>/g)].map(match => match[1]), ['0%', '25%', '50%', '75%', '100%'])
  assert.match(axis, />累積割合<\/text>/)
  assert.deepEqual(barTitles(enabled), barTitles(disabled))
  assert.deepEqual(on.statistics, off.statistics)
  assert.deepEqual(on, before)
})

test('旧v1の累積設定省略はOFFの画像として描画される', () => {
  const off = snapshot({ showCumulative: false })
  const { showCumulative: _overlay, ...legacy } = off
  const restored = parseEnemyHistogramSnapshot(legacy)
  assert.ok(restored)
  assert.equal(restored.showCumulative, false)
  assert.equal(renderPlot(legacy), renderPlot(off))
  assert.equal(renderPlot(restored), renderPlot(off))
  assert.doesNotMatch(renderPlot(restored), /data-histogram-cumulative/)
})

test('旧スナップショットの累積ONは表示形式の指定がなくても折れ線のまま復元される', () => {
  const line = snapshot()
  const { cumulativeDisplay: _display, ...legacy } = line
  const restored = parseEnemyHistogramSnapshot(legacy)
  assert.ok(restored)
  assert.equal(restored.showCumulative, true)
  assert.equal(renderPlot(legacy), renderPlot(line))
  assert.equal(renderPlot(restored), renderPlot(line))
  assert.ok(overlayPath(renderPlot(restored)))
  assert.doesNotMatch(renderPlot(restored), /data-histogram-cumulative="strip"/)
})

test('線形・対数・評価・上限超過の各階級は棒中央に累積し、最初の階級から最終100%まで結ぶ', () => {
  for (const kind of ['linear', 'log', 'rating']) {
    const source = snapshot({ kind })
    const bins = source.ratingBins ?? source.statistics.bins
    const markup = renderPlot(source)
    let sum = 0
    const expected = bins.map((bin, index) => ({ index, count: sum += bin.count, proportion: sum / source.statistics.count }))
    assert.deepEqual(cumulativePoints(markup), expected, kind)
    assert.equal(cumulativePoints(markup).at(-1).proportion, 1)
    assert.equal(cumulativePoints(markup).at(-1).count, 8)
    assert.equal(source.statistics.missingCount, 84)
    assert.doesNotMatch(markup, /NaN|Infinity/)
    const path = [...overlayPath(markup).matchAll(/[ML] ([\d.eE+-]+) ([\d.eE+-]+)/g)]
    assert.equal(path.length, bins.length)
    const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
    assert.ok(frame)
    const centers = barCenters(markup)
    assert.equal(centers.length, bins.length)
    const xs = cumulativePointXs(markup)
    assert.equal(xs.length, bins.length)
    for (let index = 0; index < bins.length; index++) {
      assert.ok(Math.abs(xs[index] - centers[index]) < 1e-9, `${kind}: point ${index} matches its bar center`)
      assert.equal(Number(path[index][1]), xs[index])
    }
    assert.ok(Number(path[0][1]) > Number(attr(frame, 'x')))
    assert.ok(Number(path.at(-1)[1]) < Number(attr(frame, 'x')) + Number(attr(frame, 'width')))
    if (kind === 'linear') {
      assert.match(markup, /10未満まで：累積2体（25%）/)
      assert.match(markup, /20以下：累積6体（75%）/)
      assert.match(markup, /全階級（20超を含む）：累積8体（100%）/)
      assert.equal(bins.at(-1).isOverflow, true)
    }
    if (kind === 'rating') assert.match(markup, /評価SSまで：累積8体（100%）/)
  }
})

test('最大2958件の件数軸を1000刻みに丸め、累積の4表示形式や保存幅で件数目盛りを変えない', () => {
  const weights = [2702, 791, 2085, 1625, 759, 2958, 894, 92, 276, 31]
  const statistics = calculateWeightedHistogram(weights.map((weight, index) => ({ value: index * 10, weight })), {
    scale: 'LINEAR', customLinearBinWidth: 10, minimumLinearUpperBound: 100,
  })
  for (const display of ['none', 'line', 'strip', 'both']) {
    const showCumulative = display !== 'none'
    const source = createEnemyHistogramSnapshot({ ...snapshot({ showCumulative, cumulativeDisplay: display === 'none' ? 'line' : display }),
      statistics, customLinearUpperBound: null,
      editorSettings: { levelType: 'ALL', numericConditions: [], linearBinWidthInput: '10', linearUpperBoundInput: '' },
    })
    for (const width of [360, 960]) {
      const markup = renderPlot(source, { width })
      assert.deepEqual(countAxisTicks(markup), [0, 1000, 2000, 3000])
      assert.deepEqual(barTitles(markup), weights.map((weight, index) =>
        `${index * 10}以上、${(index + 1) * 10}${index === weights.length - 1 ? '以下' : '未満'}：${weight.toLocaleString('ja-JP')}体`))
      if (showCumulative) assert.equal(cumulativePoints(markup).at(-1).proportion, 1)
      if ((display === 'strip' || display === 'both') && width === 960) {
        assert.deepEqual(cumulativeStripCells(markup).map(cell => cell.label?.[2]),
          ['22.1', '28.6', '45.7', '59', '65.2', '89.4', '96.7', '97.5', '99.7', '100'],
          '帯の数値は丸めた棒の割合を足さず、生の件数から計算する')
      }
    }
  }
})

test('画像モードは棒の割合・平均・中央値と累積線を同時に残し、操作用要素を出力しない', () => {
  const markup = renderPlot(snapshot({ showPercentages: true, referenceVisibility: { mean: true, median: true } }))
  assert.match(markup, /class="enemy-chart-reference mean"/)
  assert.match(markup, /class="enemy-chart-reference median"/)
  assert.equal([...markup.matchAll(/data-percentage-index=/g)].length, 3)
  assert.match(markup, /data-histogram-cumulative="true"/)
  assert.match(markup, /各棒の中央に、その階級までの件数/)
  assert.match(markup, /線は最初の階級の点から始まります/)
  assert.match(markup, /<svg\b[^>]*role="img"/)
  assert.doesNotMatch(markup, /role="slider"|tabindex="0"|enemy-histogram-cumulative-hit-area|enemy-histogram-cumulative-tooltip|<button\b|NaN|Infinity/)
  assert.deepEqual(cumulativePoints(markup).map(point => point.count), [2, 6, 8])
  const small = renderPlot(snapshot({ showPercentages: true }), { width: 360, height: 334 })
  assert.deepEqual(cumulativePoints(small).map(point => point.proportion), [0.25, 0.75, 1])
})

test('累積割合の選択は初期なしで、保存された4表示形式・旧設定を復元する', () => {
  const normal = renderPanel({})
  assert.equal(selectedCumulativeDisplay(normal), 'なし')
  assert.deepEqual([...cumulativeSelect(normal).matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map(match => match[1]),
    ['なし', '折れ線', '上部の帯', '折れ線＋上部の帯'])
  assert.doesNotMatch(normal, /data-histogram-cumulative/)
  const editor = renderPanel({ initialSnapshot: snapshot(), editor: true })
  assert.equal(selectedCumulativeDisplay(editor), '折れ線')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ cumulativeDisplay: 'strip' }), editor: true })), '上部の帯')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ showCumulative: false, cumulativeDisplay: 'strip' }), editor: true })), 'なし')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ cumulativeDisplay: 'both' }), editor: true })), '折れ線＋上部の帯')
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: snapshot({ showCumulative: false, cumulativeDisplay: 'both' }), editor: true })), 'なし')
  const legacy = JSON.parse(JSON.stringify(snapshot({ showCumulative: false })))
  delete legacy.showCumulative
  delete legacy.cumulativeDisplay
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: legacy, editor: true })), 'なし')
  legacy.showCumulative = true
  assert.equal(selectedCumulativeDisplay(renderPanel({ initialSnapshot: legacy, editor: true })), '折れ線')
})

test('上部の帯は線形・対数・評価・上限超過を同じ累積件数で示し、セルと数字を棒中央に合わせる', () => {
  for (const kind of ['linear', 'log', 'rating']) {
    const source = snapshot({ kind, cumulativeDisplay: 'strip' })
    const unchanged = structuredClone(source)
    const markup = renderPlot(source)
    const without = renderPlot(snapshot({ kind, showCumulative: false }))
    const line = renderPlot(snapshot({ kind }))
    const bins = source.ratingBins ?? source.statistics.bins
    const cells = cumulativeStripCells(markup)
    const centers = barCenters(markup)
    const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
    assert.match(markup, /data-histogram-cumulative="strip"/)
    assert.doesNotMatch(markup, /enemy-histogram-cumulative-axis|enemy-histogram-cumulative-line|enemy-histogram-cumulative-point|<path\b|<circle\b/)
    assert.deepEqual(cumulativePoints(markup), cumulativePoints(line), kind)
    assert.deepEqual(barTitles(markup), barTitles(without), kind)
    assert.equal(cells.length, bins.length)
    assert.equal(cumulativePoints(markup).at(-1).count, 8)
    assert.equal(cumulativePoints(markup).at(-1).proportion, 1)
    assert.equal(source.statistics.missingCount, 84)
    for (const [index, cell] of cells.entries()) {
      assert.ok(cell.rectangle && cell.label, `${kind}: cell ${index} has its background and cumulative label`)
      const left = Number(attr(cell.rectangle, 'x'))
      const right = left + Number(attr(cell.rectangle, 'width'))
      assert.ok(left < centers[index] && centers[index] < right, `${kind}: cell ${index} contains its bar center`)
      assert.ok(Math.abs(Number(attr(cell.label[1], 'x')) - centers[index]) < 1e-9, `${kind}: label ${index} matches its bar center`)
      assert.ok(Number(attr(cell.rectangle, 'y')) + Number(attr(cell.rectangle, 'height')) <= Number(attr(frame, 'y')),
        `${kind}: cumulative cell is above the plot`)
    }
    assert.doesNotMatch(markup, /NaN|Infinity/)
    assert.deepEqual(source, unchanged)
  }
})

test('折れ線と帯の併用は同じ階級の累積値を棒中央に示し、右軸を1つだけ持つ', () => {
  for (const kind of ['linear', 'log', 'rating']) {
    const source = snapshot({ kind, cumulativeDisplay: 'both' })
    const unchanged = structuredClone(source)
    const markup = renderPlot(source)
    const lineOnly = renderPlot(snapshot({ kind }))
    const strip = cumulativeSection(markup, 'strip')
    const line = cumulativeSection(markup, 'true')
    const centers = barCenters(markup)
    const cells = cumulativeStripCells(strip)
    const points = cumulativePointXs(line)
    assert.equal((markup.match(/data-histogram-cumulative="strip"/g) ?? []).length, 1)
    assert.equal((markup.match(/data-histogram-cumulative="true"/g) ?? []).length, 1)
    assert.equal((markup.match(/class="enemy-histogram-cumulative-axis"/g) ?? []).length, 1)
    assert.ok(overlayPath(line))
    assert.deepEqual(cumulativePoints(strip), cumulativePoints(line), kind)
    assert.deepEqual(cumulativePoints(line), cumulativePoints(lineOnly), kind)
    assert.deepEqual(barTitles(markup), barTitles(lineOnly), kind)
    assert.deepEqual(centers, barCenters(lineOnly), '併用時は折れ線と同じ右軸用の余白を使う')
    assert.equal(cells.length, centers.length)
    assert.equal(points.length, centers.length)
    for (const [index, center] of centers.entries()) {
      assert.ok(Math.abs(points[index] - center) < 1e-9, `${kind}: 点${index}は棒中央`)
      assert.ok(Math.abs(Number(attr(cells[index].label?.[1], 'x')) - center) < 1e-9, `${kind}: 帯の数値${index}は棒中央`)
    }
    assert.equal(cumulativePoints(strip).at(-1).count, 8)
    assert.equal(cumulativePoints(strip).at(-1).proportion, 1)
    assert.doesNotMatch(markup, /NaN|Infinity/)
    assert.deepEqual(source, unchanged)
  }
})

test('併用時も棒上の割合を維持し、折れ線との重なり回避を引き継ぐ', () => {
  const source = snapshot({ cumulativeDisplay: 'both', showPercentages: true })
  const markup = renderPlot(source)
  const lineOnly = renderPlot(snapshot({ showPercentages: true }))
  const labels = percentageLabels(markup)
  assert.deepEqual(labels, percentageLabels(lineOnly), '帯による全体移動以外は既存の割合配置を保つ')
  assert.deepEqual(labels.map(({ index, text }) => ({ index, text })), [
    { index: 0, text: '25.0%' }, { index: 1, text: '50.0%' }, { index: 2, text: '25.0%' },
  ])
  const transform = /<g\b[^>]*class="enemy-histogram-percentages"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/.exec(markup)
  const stripBottom = Math.max(...cumulativeStripCells(markup).map(cell => Number(attr(cell.rectangle, 'y')) + Number(attr(cell.rectangle, 'height'))))
  const bars = [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
  assert.ok(transform)
  for (const label of labels) {
    const labelY = Number(transform[2]) + label.y
    assert.ok(labelY > stripBottom, `割合${label.index}は累積帯の外にある`)
    assert.ok(labelY < Number(attr(bars[label.index][1], 'y')), `割合${label.index}は対応する棒より上にある`)
  }
  const hidden = renderPlot({ ...source, showPercentages: false })
  assert.equal(percentageLabels(hidden).length, 0)
  assert.equal(cumulativeStripCells(hidden).length, 3)
  assert.equal(cumulativePointXs(hidden).length, 3)
})

test('上部の帯でも通常の割合は棒の上に残し、右軸用の横幅を使わない', () => {
  const source = snapshot({ cumulativeDisplay: 'strip', showPercentages: true })
  const markup = renderPlot(source)
  const without = renderPlot(snapshot({ showCumulative: false, showPercentages: true }))
  assert.deepEqual(barCenters(markup), barCenters(without))
  const labels = percentageLabels(markup)
  assert.deepEqual(labels.map(({ index, text }) => ({ index, text })), [
    { index: 0, text: '25.0%' }, { index: 1, text: '50.0%' }, { index: 2, text: '25.0%' },
  ])
  const transform = /<g\b[^>]*class="enemy-histogram-percentages"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/.exec(markup)
  assert.ok(transform)
  const bars = [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
  const stripBottom = Math.max(...cumulativeStripCells(markup).map(cell => Number(attr(cell.rectangle, 'y')) + Number(attr(cell.rectangle, 'height'))))
  for (const label of labels) {
    const labelY = Number(transform[2]) + label.y
    assert.ok(labelY > stripBottom, `割合${label.index}は累積帯の外にある`)
    assert.ok(labelY < Number(attr(bars[label.index][1], 'y')), `割合${label.index}は対応する棒より上にある`)
  }
  const noPercentages = renderPlot(snapshot({ cumulativeDisplay: 'strip' }))
  assert.equal(percentageLabels(noPercentages).length, 0)
  assert.equal(cumulativeStripCells(noPercentages).length, 3)
})

test('帯は画像の旧上余白を置き換え、基準線なしでは4pxまで詰めて棒の高さを保つ', () => {
  for (const cumulativeDisplay of ['strip', 'both']) {
    for (const width of [360, 960]) {
      for (const showPercentages of [false, true]) {
        const source = snapshot({ cumulativeDisplay, showPercentages })
        const markup = renderPlot(source, { width })
        const without = renderPlot({ ...source, showCumulative: false }, { width })
        const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
        const cells = cumulativeStripCells(markup)
        assert.ok(frame && cells.length)
        const stripBottom = Math.max(...cells.map(cell => Number(attr(cell.rectangle, 'y')) + Number(attr(cell.rectangle, 'height'))))
        assert.equal(Number(attr(frame, 'y')) - stripBottom, 4)
        const barHeights = html => [...html.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"([^>]*)>/g)]
          .map(match => Number(attr(match[1], 'height')))
        assert.deepEqual(barHeights(markup), barHeights(without), '帯の間を詰めても棒の高さを変えない')
      }
    }
  }
})

test('上部の帯と平均・中央値を保存画像へ残し、併用時も折れ線用の操作要素を出力しない', () => {
  for (const cumulativeDisplay of ['strip', 'both']) {
    const markup = renderPlot(snapshot({ cumulativeDisplay, showPercentages: true,
      referenceVisibility: { mean: true, median: true } }))
    assert.match(markup, /class="enemy-chart-reference mean"/)
    assert.match(markup, /class="enemy-chart-reference median"/)
    assert.match(markup, /data-histogram-cumulative="strip"/)
    assert.equal(percentageLabels(markup).length, 3)
    assert.match(markup, /<svg\b[^>]*role="img"/)
    assert.doesNotMatch(markup, /role="slider"|tabindex="0"|enemy-histogram-cumulative-hit-area|enemy-histogram-cumulative-tooltip|<button\b|NaN|Infinity/)
    const stripBottom = Math.max(...cumulativeStripCells(markup).map(cell => Number(attr(cell.rectangle, 'y')) + Number(attr(cell.rectangle, 'height'))))
    const references = [...markup.matchAll(/<text\b([^>]*class="enemy-chart-reference-label (?:mean|median)"[^>]*)>/g)]
    assert.equal(references.length, 2)
    for (const reference of references) assert.ok(Number(attr(reference[1], 'y')) > stripBottom, '平均・中央値の直接ラベルは帯の下にある')
  }
})

test('累積の無効化・空データ・不正な分母や件数では上部に誤った帯を表示しない', () => {
  for (const cumulativeDisplay of ['strip', 'both']) {
    const source = snapshot({ cumulativeDisplay })
    assert.doesNotMatch(renderPlot({ ...source, showCumulative: false }), /data-histogram-cumulative/)
    const invalidStatistics = [
      { ...source.statistics, count: 0 },
      { ...source.statistics, count: -1 },
      { ...source.statistics, bins: [] },
      { ...source.statistics, bins: source.statistics.bins.map((bin, index) => ({ ...bin, count: index === 1 ? -1 : bin.count })) },
      { ...source.statistics, count: 1 },
    ]
    for (const statistics of invalidStatistics) {
      const markup = renderPlot({ ...source, statistics })
      assert.doesNotMatch(markup, /data-histogram-cumulative|data-cumulative-index/)
    }
  }
})

test('既存度数分布表の累積件数・割合と保存画像の折れ線が一致し、欠損84体を分母へ含めない', () => {
  const source = snapshot()
  const panel = renderPanel({ initialSnapshot: source })
  const table = /<table class="enemy-frequency-table">([\s\S]*?)<\/table>/.exec(panel)?.[1]
  assert.ok(table)
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1]
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => {
    const cells = [...match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
    return { count: Number(clean(cells[0][2])), cumulative: attr(cells[2][1], 'title'), proportion: clean(cells[2][2]) }
  })
  assert.deepEqual(rows, [
    { count: 2, cumulative: '累積：2体', proportion: '25%' },
    { count: 4, cumulative: '累積：6体', proportion: '75%' },
    { count: 2, cumulative: '累積：8体', proportion: '100%' },
  ])
  const points = cumulativePoints(renderPlot(source))
  assert.deepEqual(rows.map(row => row.cumulative), points.map(point => `累積：${point.count}体`))
  assert.deepEqual(rows.map(row => row.proportion), points.map(point => `${point.proportion * 100}%`))
  assert.equal(source.statistics.count, 8)
  assert.equal(source.statistics.totalCount, 92)
})

test('期待出現数の小数を度数表・棒の値・分母へ残し、割合は未丸めの度数から求める', () => {
  const weights = [0.2, 0.3, 0.1, 0.2, 0.4]
  const aggregationCounts = { ...fixtureCounts, spawnAggregationMode: 'expected-lower-bound',
    summary: { ...fixtureCounts.summary, lowerBoundMapCount: 0, expectedMapCount: 1 },
    enemies: Object.fromEntries(weights.map((spawnCount, index) => [`enemy_${index}`, { mapCount: 1, spawnCount }])),
  }
  const source = createEnemyHistogramSnapshot({ ...snapshot(), coverage: aggregationCounts.summary,
    statistics: calculateWeightedHistogram(observations.map((observation, index) => ({ ...observation, weight: weights[index] })),
      { customLinearBinWidth: 10, customLinearUpperBound: 20 }),
  })
  const panel = renderPanel({ initialSnapshot: source, aggregationCounts })
  const table = /<table class="enemy-frequency-table">([\s\S]*?)<\/table>/.exec(panel)?.[1]
  assert.ok(table)
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1]
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => {
    const cells = [...match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
    return { count: clean(cells[0][2]), cumulative: attr(cells[2][1], 'title'), proportion: clean(cells[2][2]) }
  })
  assert.deepEqual(rows, [
    { count: '0.2', cumulative: '累積：0.2体', proportion: '25%' },
    { count: '0.4', cumulative: '累積：0.6体', proportion: '75%' },
    { count: '0.2', cumulative: '累積：0.8体', proportion: '100%' },
  ])
  assert.ok(barTitles(panel).some(title => title.includes('0.2体')))
  assert.match(clean(panel), /割合の基準：エリート・検証fixture · 0\.8体/)
  assert.ok(barTitles(renderPlot(source)).some(title => title.includes('0.2体')))
  assert.equal(source.statistics.count, 0.8)
})
