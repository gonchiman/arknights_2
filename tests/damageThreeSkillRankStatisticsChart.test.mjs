import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart, Table, ImagePlot, DistributionImage, getHistogram, createStatisticsImage
let createEnemyImage, SkillPhysicalRateHistogram
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/dc3-rank-statistics-chart-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  Chart = (await server.ssrLoadModule('/src/components/DamageThreeSkillRankStatisticsChart.tsx')).default
  Table = (await server.ssrLoadModule('/src/components/DamageThreeSkillRankStatisticsTable.tsx')).default
  ImagePlot = (await server.ssrLoadModule('/src/components/DamageThreeAdvantageChartImage.tsx')).DamageThreeAdvantageChartImage
  DistributionImage = (await server.ssrLoadModule('/src/components/DamageThreeDistributionChartImage.tsx')).DamageThreeDistributionChartImage
  getHistogram = (await server.ssrLoadModule('/src/lib/damageThreeDistributionChart.ts')).getDamageThreeDistributionHistogram
  createStatisticsImage = (await server.ssrLoadModule('/src/components/createDamageThreeStatisticsChartImage.tsx')).createDamageThreeStatisticsChartImage
  createEnemyImage = (await server.ssrLoadModule('/src/components/createDamageThreeEnemyAdvantageImage.tsx')).createDamageThreeEnemyAdvantageImage
  SkillPhysicalRateHistogram = (await server.ssrLoadModule('/src/components/DamageThreeSkillPhysicalRateHistogram.tsx')).DamageThreeSkillPhysicalRateHistogram
})
after(async () => { await server?.close() })

const sample = {
  resistance: 60, defense: 1200, count: 8,
  physical: { q1: 110, median: 222, q3: 333 }, arts: { q1: 0, median: 0, q3: 0 },
  histogram: Array.from({ length: 9 }, (_, i) => ({
    lower: i * 500, upper: i < 8 ? (i + 1) * 500 : null,
    physical: i === 0 ? 7 : i === 8 ? 1 : 0, arts: i === 0 ? 8 : 0,
  })),
  physicalWins: 3, ties: 1, artsWins: 4,
  bySkill: { count: 4, physicalWins: 2.5, ties: 0.5, artsWins: 1 },
}
const missing = {
  resistance: 100, defense: null, count: 0,
  physical: null, arts: null, histogram: [], physicalWins: 0, ties: 0, artsWins: 0,
  bySkill: { count: 0, physicalWins: 0, ties: 0, artsWins: 0 },
}
const render = (Component, view, rows, advantageUnit, resistance = 60) =>
  renderToStaticMarkup(createElement(Component, { view, rows, advantageUnit, resistance }))
const labels = markup => [...markup.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1])

test('スキル別の分布は以前の段階単位・防御力帯の選択に左右されず表示中の条件を保存する', () => {
  const counts = [4, 1, 0, 0, 0, 0, 0, 0, 0, 2]
  const bins = counts.map((count, index) => ({ lower: index * 10, upper: (index + 1) * 10, count }))
  const options = {
    statistics: { skillCount: 7, stageCount: 9, skillPhysicalRateBins: bins,
      rows: [{ label: '全体', spawnCount: 20, skill: { count: 140 }, stage: { count: 180 } }] },
    format: 'histogram', advantageUnit: 'stage', showBands: true,
    aggregationVersion: 'v12', scope: 'main', comparisonPolicy: 'excludeAttributeEffects',
    filters: { kind: 'ALL', profession: 'ALL', damageType: 'ALL', rarity: '6', query: '' },
  }
  const image = createEnemyImage(options)
  assert.equal(image.view, 'chart')
  const { snapshot } = image
  const normal = createEnemyImage({ ...options, advantageUnit: 'skill', showBands: false }).snapshot
  assert.deepEqual(snapshot.filenameParts, normal.filenameParts)
  assert.deepEqual(snapshot.conditions, normal.conditions)
  assert.equal(snapshot.title, 'スキル別の物理優勢率の分布')
  for (const label of ['集計版 v12', 'メインストーリー', '属性限定効果を除外', '全出力型', '★6']) {
    assert.ok(snapshot.conditions.includes(label), label)
    assert.ok(snapshot.filenameParts.includes(label), label)
  }
  assert.doesNotMatch([...snapshot.conditions, ...snapshot.filenameParts].join(' '), /段階単位|防御力帯別/)
  const saved = renderToStaticMarkup(snapshot.chart({ width: 960, height: 300 }))
  const screen = renderToStaticMarkup(createElement(SkillPhysicalRateHistogram, { bins }))
  for (const markup of [saved, screen]) {
    assert.match(markup, /スキル数/)
    const marks = [...markup.matchAll(/data-lower="(\d+)" data-count="(\d+)"/g)]
    assert.deepEqual(marks.map(([, lower, count]) => [Number(lower), Number(count)]),
      bins.map(bin => [bin.lower, bin.count]))
    assert.match(markup, /90%以上100%以下、2スキル/)
    assert.doesNotMatch(markup, /NaN|Infinity/)
  }
})

const peakRow = { ...sample, resistance: 0, defense: 0, count: 20,
  histogram: sample.histogram.map(bin => ({ ...bin, physical: bin.lower === 0 ? 20 : 0, arts: bin.lower === 0 ? 20 : 0 })) }

test('分布は選択中の術耐性で両属性を同一階級に描き、表は全条件の四分位数を保持する', () => {
  const rows = [sample, peakRow, missing]
  const chart = render(Chart, 'distribution', rows, 'skill')
  assert.equal(chart, render(Chart, 'distribution', rows, 'stage'))
  assert.match(chart, /対応防御力 1,200 · 有効段階数 8/)
  assert.match(chart, /aria-label="術耐性 60のヒストグラム"/)
  const bins = labels(chart).filter(label => label.includes('段階、術化'))
  assert.equal(bins.length, 9)
  assert.equal(bins[0], '0以上500未満、物理化 7段階、術化 8段階')
  assert.equal(bins.at(-1), '4,000以上、物理化 1段階、術化 0段階')
  assert.match(chart, /data-series="physical" aria-hidden="true" style="height:35%"/)
  assert.match(chart, /data-series="arts" aria-hidden="true" style="height:0%"/)
  const zeroResistance = render(Chart, 'distribution', rows, 'stage', 0)
  assert.match(zeroResistance, /0以上500未満、物理化 20段階、術化 20段階/)
  assert.doesNotMatch(chart + zeroResistance, /対象なし|NaN|Infinity|中央値/)

  const table = render(Table, 'distribution', rows, 'stage')
  assert.equal(table, render(Table, 'distribution', rows, 'skill', 0))
  assert.match(table, /有効段階数/)
  assert.match(table, /中央値/)
  for (const value of ['60', '100', '1,200', '110', '222', '333', '0']) assert.ok(table.includes(`>${value}<`), value)
})

test('保存する分布図は術耐性を切り替えても同じ縦軸を使い、0件と4,000以上も同じ階級に描く', () => {
  const rows = [sample, peakRow, missing]
  function renderHistogram(resistance) {
    const histogram = getHistogram(rows, resistance)
    return renderToStaticMarkup(createElement(DistributionImage, { histogram, width: 960, height: 334 }))
  }
  function heights(svg, series) {
    return [...svg.matchAll(/<rect\b[^>]*>/g)].map(match => match[0])
      .filter(rect => rect.includes('data-series="' + series + '"'))
      .map(rect => Number(rect.match(/\bheight="([^"]+)"/)[1]))
  }
  const svg = renderHistogram(60)
  const peakHeight = heights(renderHistogram(0), 'physical')[0]
  assert.ok(peakHeight > 0)
  for (const series of ['physical', 'arts']) {
    const actual = heights(svg, series)
    assert.equal(actual.length, sample.histogram.length)
    sample.histogram.forEach((bin, index) => {
      assert.ok(Math.abs(actual[index] - peakHeight * bin[series] / peakRow.count) < 1e-8, series + ' / ' + bin.lower)
    })
  }
  const binLabels = markup => labels(markup).filter(label => label.includes('段階、術化'))
  assert.deepEqual(binLabels(svg), binLabels(render(Chart, 'distribution', rows, 'stage')))
  assert.match(svg, />4,000以上<\/text>/)
  assert.equal(getHistogram(rows, 100), null)
  assert.equal(getHistogram(rows, 30), null)
})

test('分布画像の条件とファイル名は選択中の術耐性と絞り込みに従う', () => {
  const options = {
    rows: [sample, peakRow, missing], view: 'distribution', advantageUnit: 'skill', resistance: 60,
    aggregationVersion: 'v12', scope: 'main', comparisonPolicy: 'apply',
    filters: { kind: 'NORMAL', profession: 'ALL', damageType: 'ARTS', rarity: '6', query: ' スルト ' },
  }
  const snapshot = createStatisticsImage(options)
  assert.ok(snapshot)
  for (const label of ['術耐性 60', 'メインストーリー', '通常攻撃型', '属性限定効果を適用', '元の攻撃属性 術', '★6', '検索「スルト」']) {
    assert.ok(snapshot.conditions.includes(label), label)
    assert.ok(snapshot.filenameParts.includes(label), label)
  }
  assert.ok(snapshot.conditions.includes('対応防御力 1,200'))
  assert.ok(snapshot.conditions.includes('有効段階数 8'))
  assert.doesNotMatch(snapshot.filenameParts.join('_'), /有効段階数|スキル単位|段階単位/)
  const zero = createStatisticsImage({ ...options, resistance: 0 })
  assert.ok(zero.conditions.includes('術耐性 0'))
  assert.ok(zero.conditions.includes('対応防御力 0'))
  assert.ok(zero.conditions.includes('有効段階数 20'))
  assert.equal(createStatisticsImage({ ...options, resistance: 100 }), null)
})

test('優勢率の保存画像とファイル名で選択した出力型を識別できる', () => {
  const outputKinds = { ALL: '全出力型', NORMAL: '通常攻撃型', NEXT_ATTACK: '次の通常攻撃型', COUNTER: '反撃型', SKILL_ACTION: 'スキル動作型' }
  for (const [kind, label] of Object.entries(outputKinds)) {
    const snapshot = createStatisticsImage({
      rows: [sample], view: 'advantage', advantageUnit: 'skill', resistance: 60,
      aggregationVersion: 'v12', scope: 'main', comparisonPolicy: 'excludeAttributeEffects',
      filters: { kind, profession: 'ALL', damageType: 'ALL', rarity: 'ALL', query: '' },
    })
    for (const parts of [snapshot.conditions, snapshot.filenameParts]) {
      assert.deepEqual(parts.filter(part => Object.values(outputKinds).includes(part)), [label])
    }
  }
})

test('属性別の優勢率は段階数に対する割合に換算し、同値を独立した区分にする', () => {
  const chart = render(Chart, 'advantage', [sample], 'stage')
  const table = render(Table, 'advantage', [sample], 'stage')
  const description = labels(chart).find(label => label.includes('37.5'))
  assert.ok(description)
  assert.match(chart, /<strong>ダメージが高い属性<\/strong>/)
  const legendLabels = [...chart.matchAll(/<\/i>([^<]+)<\/li>/g)].map(match => match[1])
  assert.deepEqual(legendLabels, ['物理', '同じ', '術'])
  for (const value of ['60', '1,200', '37.5', '12.5', '50.0']) {
    assert.ok(description.includes(value), value)
    assert.ok(table.includes(`>${value}<`), value)
  }
  const onlyTies = render(Chart, 'advantage', [{ ...sample, ties: 8, physicalWins: 0, artsWins: 0 }], 'stage')
  assert.match(onlyTies, /<span[^>]+data-series="tie"[^>]+width:100%/)
  assert.doesNotMatch(onlyTies, /<span data-series="(?:physical|arts)"/)
})

test('スキル単位の優勢率は同じ分母で表と棒を描画し、重み付きの小数票を読み上げる', () => {
  const chart = render(Chart, 'advantage', [sample], 'skill')
  const table = render(Table, 'advantage', [sample], 'skill')
  assert.match(table, /<th scope="col">有効スキル数<\/th>/)
  assert.match(table, />4<\/td><td>62\.5<\/td><td>12\.5<\/td><td>25\.0<\/td>/)
  assert.match(chart, /有効スキル数 4。物理の方がダメージが高い 2\.5票（62\.5%）、同じダメージ 0\.5票（12\.5%）、術の方がダメージが高い 1票（25\.0%）/)
  for (const [series, width] of [['physical', 62.5], ['tie', 12.5], ['arts', 25]]) {
    assert.ok(chart.includes(`data-series="${series}" style="width:${width}%"`))
  }
})

test('対応がない術耐性を両方のグラフに残し、0ダメージや0%として描かない', () => {
  for (const [view, unit] of [['distribution', 'stage'], ['advantage', 'stage'], ['advantage', 'skill']]) {
    const chart = render(Chart, view, [missing], unit, 100)
    assert.ok(chart.includes('100'))
    assert.ok(chart.includes('対象なし'))
    assert.doesNotMatch(chart, /role="img"|NaN|Infinity/)
    const table = render(Table, view, [missing], unit)
    assert.match(table, />—<\/td>/)
    assert.doesNotMatch(table, />0\.0<\/td>/)
  }
})

test('画像の積み上げ棒に集計単位ごとの割合を使い、対象なしの行も表示する', () => {
  for (const [advantageUnit, expected] of [['skill', [0.625, 0.125, 0.25]], ['stage', [0.375, 0.125, 0.5]]]) {
    const svg = renderToStaticMarkup(createElement(ImagePlot, { rows: [sample, missing], advantageUnit, width: 960, height: 400 }))
    const bars = [...svg.matchAll(/<rect\b[^>]*data-series="([^"]+)"[^>]*width="([^"]+)"/g)]
    assert.deepEqual(bars.map(match => match[1]), ['physical', 'tie', 'arts'])
    const widths = bars.map(match => Number(match[2]))
    const total = widths.reduce((sum, width) => sum + width, 0)
    assert.deepEqual(widths.map(width => width / total), expected)
    const emptyRow = svg.slice(svg.indexOf('data-resistance="100"'))
    assert.match(emptyRow, />対象なし<\/text>/)
    assert.doesNotMatch(emptyRow, /<rect\b|NaN|Infinity/)
  }
})
