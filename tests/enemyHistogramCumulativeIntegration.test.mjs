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
  const { kind = 'linear', showCumulative = true, showPercentages = false,
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
    customLinearUpperBound: log ? null : 20, showCumulative, showPercentages, showBinRanges: false,
    referenceVisibility,
    editorSettings: { levelType: 'ALL', numericConditions: [], linearBinWidthInput: log ? '' : '10', linearUpperBoundInput: log ? '' : '20' },
  })
}
const renderPlot = (source, dimensions = {}) => renderToStaticMarkup(createElement(Plot, {
  snapshot: source, width: 960, height: 334, ...dimensions,
}))
const clean = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const attr = (value, key) => new RegExp(`\\b${key}="([^"]*)"`).exec(value)?.[1]
const cumulativePoints = markup => [...markup.matchAll(/<g\b([^>]*data-cumulative-index="[^"]*"[^>]*)>/g)]
  .map(match => ({ index: Number(attr(match[1], 'data-cumulative-index')),
    count: Number(attr(match[1], 'data-cumulative-count')),
    proportion: Number(attr(match[1], 'data-cumulative-proportion')) }))
const barTitles = markup => [...markup.matchAll(/<rect\b[^>]*class="enemy-chart-bar[^"]*"[^>]*>([\s\S]*?)<\/rect>/g)]
  .map(match => clean(match[1]))
const overlayPath = markup => /<path\b[^>]*class="enemy-histogram-cumulative-line"[^>]*d="([^"]+)"/.exec(markup)?.[1]

function PanelWrapper({ initialSnapshot, editor = false }) {
  const controls = useControls(initialSnapshot)
  return createElement(Panel, { rows: enemies, allRows: enemies, scopeLabel: 'エリート・検証fixture', controls,
    filterControls: null, ...(editor ? { histogramEditor: { initialSnapshot: initialSnapshot ?? null, onChange() {} } } : {}) })
}
const renderPanel = props => renderToStaticMarkup(createElement(PanelWrapper, props))
const cumulativeCheckbox = markup => [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
  .filter(match => clean(match[1]).includes('累積割合を表示'))
  .map(match => /<input\b([^>]*)>/.exec(match[1])?.[1])

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

test('線形・対数・評価・上限超過の各階級は同じ生件数から累積し、最終点を100%に置く', () => {
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
    assert.equal(path.length, bins.length + 1)
    const frame = /<rect\b[^>]*data-chart-image-plot-area=""([^>]*)>/.exec(markup)?.[1]
    assert.ok(frame)
    assert.equal(Number(path[0][1]), Number(attr(frame, 'x')))
    assert.equal(Number(path.at(-1)[1]), Number(attr(frame, 'x')) + Number(attr(frame, 'width')))
    if (kind === 'linear') {
      assert.match(markup, /10未満まで：累積2体（25%）/)
      assert.match(markup, /20以下：累積6体（75%）/)
      assert.match(markup, /全階級（20超を含む）：累積8体（100%）/)
      assert.equal(bins.at(-1).isOverflow, true)
    }
    if (kind === 'rating') assert.match(markup, /評価SSまで：累積8体（100%）/)
  }
})

test('画像モードは棒の割合・平均・中央値と累積線を同時に残し、操作用要素を出力しない', () => {
  const markup = renderPlot(snapshot({ showPercentages: true, referenceVisibility: { mean: true, median: true } }))
  assert.match(markup, /class="enemy-chart-reference mean"/)
  assert.match(markup, /class="enemy-chart-reference median"/)
  assert.equal([...markup.matchAll(/data-percentage-index=/g)].length, 3)
  assert.match(markup, /data-histogram-cumulative="true"/)
  assert.match(markup, /<svg\b[^>]*role="img"/)
  assert.doesNotMatch(markup, /role="slider"|tabindex="0"|enemy-histogram-cumulative-hit-area|enemy-histogram-cumulative-tooltip|<button\b|NaN|Infinity/)
  assert.deepEqual(cumulativePoints(markup).map(point => point.count), [2, 6, 8])
  const small = renderPlot(snapshot({ showPercentages: true }), { width: 360, height: 334 })
  assert.deepEqual(cumulativePoints(small).map(point => point.proportion), [0.25, 0.75, 1])
})

test('通常画面の累積チェックは初期OFF、保存された編集設定ONはチェックへ復元する', () => {
  const normal = renderPanel({})
  const defaults = cumulativeCheckbox(normal)
  assert.equal(defaults.length, 1)
  assert.doesNotMatch(defaults[0], /\bchecked=/)
  assert.doesNotMatch(normal, /data-histogram-cumulative/)
  const editor = renderPanel({ initialSnapshot: snapshot(), editor: true })
  const restored = cumulativeCheckbox(editor)
  assert.equal(restored.length, 1)
  assert.match(restored[0], /\bchecked=""/)
  const legacy = JSON.parse(JSON.stringify(snapshot({ showCumulative: false })))
  delete legacy.showCumulative
  assert.doesNotMatch(cumulativeCheckbox(renderPanel({ initialSnapshot: legacy, editor: true }))[0], /\bchecked=/)
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
