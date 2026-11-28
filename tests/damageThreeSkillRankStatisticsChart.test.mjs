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

test('出現敵での比較は4つの分析を分け、各出力の形式をアドレスで区別する', async () => {
  const { ENEMY_COMPARISON_TITLE, ENEMY_ANALYSES, getEnemyAnalysisSegments } =
    await server.ssrLoadModule('/src/components/enemyComparisonViews.ts')
  const { default: Page } = await server.ssrLoadModule('/src/components/DamageThreeSkillAttributeMatrixPage.tsx')
  const page = renderToStaticMarkup(createElement(Page, { rows: [], loading: true }))
  const tabs = [...page.matchAll(/<button\b[^>]+role="tab"[^>]*>([^<]+)<\/button>/g)].map(([, title]) => title)
  assert.deepEqual(tabs, ['主攻撃の属性変更', '実際のダメージ内訳', '術耐性別の統計', '出現敵での比較'])
  assert.equal(ENEMY_COMPARISON_TITLE, tabs.at(-1))
  assert.deepEqual(ENEMY_ANALYSES, [
    ['advantage', '属性別の優勢率'], ['meanDamage', '平均ダメージ'],
    ['histogram', 'スキル別の物理優勢率分布'], ['operatorVotes', 'オペレーター別の票'],
  ])
  for (const [format, label] of [['table', '表'], ['chart', 'グラフ']]) {
    assert.deepEqual(getEnemyAnalysisSegments('advantage', format), ['属性別の優勢率', label])
    assert.deepEqual(getEnemyAnalysisSegments('meanDamage', format), ['平均ダメージ', label])
    assert.deepEqual(getEnemyAnalysisSegments('histogram', format), ['スキル別の物理優勢率分布', 'ヒストグラム'])
    assert.deepEqual(getEnemyAnalysisSegments('operatorVotes', format), ['オペレーター別の票'])
  }
})

const meanDamageOptions = {
  statistics: { skillCount: 2, stageCount: 3, rows: [
    { label: '全体', spawnCount: 120, skill: { count: 200 }, meanDamage: { physical: 100.02, arts: 105.08, spawnCount: 100 } },
    { label: '200未満', meanDamage: { physical: 20, arts: 0, spawnCount: 30 } },
    { label: '200〜499', meanDamage: null },
  ] },
  format: 'meanDamage', advantageUnit: 'stage', showBands: false,
  aggregationVersion: 'v12', scope: 'main', comparisonPolicy: 'apply',
  filters: { kind: 'NORMAL', profession: 'ALL', damageType: 'ALL', rarity: 'ALL', query: 'スルト' },
}

test('平均ダメージの表画像は比較可能な出現回数とスキル単位の条件を表示する', () => {
  const options = meanDamageOptions
  const [total] = options.statistics.rows
  const { view, snapshot } = createEnemyImage(options)
  assert.equal(view, 'table')
  assert.equal(snapshot.title, '主攻撃1回の平均ダメージ')
  assert.ok(snapshot.conditions.includes('出現回数 100'))
  assert.ok(snapshot.conditions.includes('2スキル'))
  for (const part of ['全体のみ', 'スキル単位', '通常攻撃型', '属性限定効果を適用', '検索「スルト」']) {
    assert.ok(snapshot.conditions.includes(part) && snapshot.filenameConditions.includes(part), part)
  }
  const overall = renderToStaticMarkup(snapshot.table)
  for (const value of ['出現回数', '物理平均', '術平均', '差（物理−術）', '100', '100.0', '105.1', '-5.1']) {
    assert.ok(overall.includes(`>${value}<`), value)
  }
  assert.doesNotMatch(overall, /200未満/)
  const bandSnapshot = createEnemyImage({ ...options, showBands: true }).snapshot
  assert.ok(bandSnapshot.filenameConditions.includes('防御力帯別の内訳'))
  const bands = renderToStaticMarkup(bandSnapshot.table)
  assert.match(bands, /200未満.*?>0\.0<.*?>\+20\.0</)
  assert.match(bands, /200〜499.*?>0<.*?>—<.*?>—<.*?>—</)
  assert.equal(createEnemyImage({ ...options, statistics: { ...options.statistics, rows: [{ ...total, meanDamage: null }] } }), null)
})

test('平均ダメージのグラフ画像は有効な平均を共通目盛りで描き、欠測の帯とゼロを区別する', () => {
  for (const showBands of [false, true]) {
    const options = { ...meanDamageOptions, showBands, breakdown: 'profession' }
    const table = createEnemyImage(options).snapshot
    const { view, snapshot, alternateLayout } = createEnemyImage({ ...options, meanDamageFormat: 'chart' })
    assert.equal(view, 'chart')
    assert.equal(alternateLayout, undefined)
    assert.equal(snapshot.title, table.title)
    assert.deepEqual(snapshot.filenameParts, ['グラフ', ...table.filenameConditions.slice(1)])
    if (showBands) {
      assert.deepEqual(snapshot.conditions, table.conditions)
      assert.equal(snapshot.axisTitle, '平均ダメージ')
      assert.ok(snapshot.legend)
    }

    const svg = renderToStaticMarkup(snapshot.chart({ width: 928, height: snapshot.naturalChartHeight }))
    const bars = [...svg.matchAll(/<rect\b[^>]*>/g)].map(match => match[0]).filter(rect => rect.includes('data-series='))
    const values = showBands ? [100.02, 105.08, 20, 0] : [100.02, 105.08]
    assert.equal(bars.length, values.length)
    const widths = bars.map(rect => parseFloat(rect.match(/\bwidth="([^"]+)"/)[1]))
    assert.ok(widths[0] > 0)
    values.forEach((value, index) => {
      assert.ok(Math.abs(widths[index] / widths[0] - value / values[0]) < 1e-6)
    })
    assert.match(svg, />100\.0<\/text>/)
    assert.match(svg, />105\.1<\/text>/)
    if (showBands) {
      assert.match(svg, />0\.0<\/text>/)
      assert.match(svg, /対象なし/)
    } else {
      assert.doesNotMatch(svg, /200未満|対象なし/)
    }
    assert.doesNotMatch(svg, /NaN|Infinity/)
  }
})

test('全体のみの平均ダメージ画像は属性と実数を各棒に直記し、その下に共通の目盛りを置く', () => {
  const options = {
    ...meanDamageOptions, meanDamageFormat: 'chart',
    statistics: { ...meanDamageOptions.statistics, skillCount: 752, rows: [{
      ...meanDamageOptions.statistics.rows[0], spawnCount: 12000,
      meanDamage: { physical: 1725.7, arts: 1566, spawnCount: 11409 },
    }] },
  }
  const { snapshot } = createEnemyImage(options)
  assert.deepEqual(snapshot.conditions, ['メインストーリー', '出現11,409回', '752スキル'])
  assert.equal(snapshot.defaultAspect.preset, '16:9')
  for (const label of ['集計版 v12', 'スキル単位', '通常攻撃型', '属性限定効果を適用', '検索「スルト」']) {
    assert.ok(snapshot.footerNote.includes(label), label)
  }
  assert.equal(snapshot.legend, null)
  assert.equal(snapshot.axisTitle, '')
  const height = 420
  const svg = renderToStaticMarkup(snapshot.chart({ width: 928, height }))
  assert.doesNotMatch(svg, />防御力帯<|>全体<|200未満/)
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
  const labels = new Map([...svg.matchAll(/<text\b([^>]*)>([^<]+)<\/text>/g)].map(([, tag, label]) => [label, attributes(tag)]))
  const bars = [...svg.matchAll(/<rect\b[^>]+>/g)].map(([tag]) => attributes(tag)).filter(bar => bar['data-series'])
  assert.deepEqual(bars.map(bar => bar['data-series']), ['physical', 'arts'])
  const [physical, arts] = bars
  assert.equal(physical.x, arts.x)
  assert.ok(Math.abs(Number(physical.width) / Number(arts.width) - 1725.7 / 1566) < 1e-6)
  for (const [index, [name, value]] of [['物理', '1,725.7'], ['術', '1,566.0']].entries()) {
    const bar = bars[index]
    const label = labels.get(name)
    const amount = labels.get(value)
    assert.ok(label && amount)
    assert.ok(Number(label.x) < Number(bar.x))
    assert.ok(Number(amount.x) >= Number(bar.x) + Number(bar.width) - 0.01)
    assert.ok(Number(label.y) >= Number(bar.y) && Number(label.y) <= Number(bar.y) + Number(bar.height))
  }
  const bottom = Number(arts.y) + Number(arts.height)
  for (const tick of ['0', '500', '1,000', '1,500', '2,000']) {
    const y = Number(labels.get(tick)?.y)
    assert.ok(y > bottom && y < Number(labels.get('平均ダメージ')?.y), tick)
  }
  const grid = [...svg.matchAll(/<line\b[^>]+>/g)].map(([tag]) => attributes(tag)).filter(line => line.x1 === line.x2)
  assert.ok(grid.length >= 2)
  assert.ok(grid.every(line => Number(line.y2) - Number(line.y1) < height / 2), '目盛線を2本の棒の周囲に収める')
  const total = options.statistics.rows[0]
  const zero = createEnemyImage({ ...options, statistics: { ...options.statistics,
    rows: [{ ...total, meanDamage: { ...total.meanDamage, physical: 0, arts: 0 } }],
  } })
  const zeroSvg = renderToStaticMarkup(zero.snapshot.chart({ width: 928, height }))
  assert.equal([...zeroSvg.matchAll(/>0\.0<\/text>/g)].length, 2)
  assert.doesNotMatch(zeroSvg, /NaN|Infinity|対象なし/)
})

test('出現敵の棒上ラベルは全体グラフの保存時だけ選べ、集計単位ごとの割合を表示する', () => {
  const options = {
    statistics: { skillCount: 2, stageCount: 3, skillPhysicalRateBins: [],
      rows: [{ label: '全体', spawnCount: 500,
        skill: { count: 1000, physicalWins: 999, ties: 1, artsWins: 0 },
        stage: { count: 1500, physicalWins: 825, ties: 150, artsWins: 525 } }] },
    format: 'chart', showBands: false, advantageUnit: 'skill',
    aggregationVersion: 'v12', scope: 'main', comparisonPolicy: 'excludeAttributeEffects',
    filters: { kind: 'ALL', profession: 'ALL', damageType: 'ALL', rarity: 'ALL', query: '' },
  }
  for (const [advantageUnit, values] of [['skill', ['99.9', '0.1', '0.0']], ['stage', ['55.0', '10.0', '35.0']]]) {
    const { snapshot, alternateLayout } = createEnemyImage({ ...options, advantageUnit })
    assert.equal(snapshot.title, '出現敵での優勢率')
    assert.equal(alternateLayout.label, '割合を棒の上に表示')
    assert.deepEqual(alternateLayout.defaultAspect, { preset: '16:9', width: '16', height: '9' })
    assert.equal(alternateLayout.snapshot.title, snapshot.title)
    assert.ok(alternateLayout.snapshot.filenameParts.includes('割合を棒上に表示'))
    assert.ok(!snapshot.filenameParts.includes('割合を棒上に表示'))
    const svg = renderToStaticMarkup(alternateLayout.snapshot.chart({ width: 928, height: 420 }))
    const bars = [...svg.matchAll(/<rect\b[^>]*data-series="([^"]+)"[^>]*\by="([^"]+)"[^>]*>/g)]
    assert.deepEqual(bars.map(bar => bar[1]), ['physical', 'tie', 'arts'])
    const directLabels = [...svg.matchAll(/<text\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*>(\d+\.\d%)<\/text>/g)]
    assert.deepEqual(directLabels.map(label => label[3]), values.map(value => value + '%'))
    directLabels.forEach((label, i) => {
      assert.ok(Number(label[2]) < Number(bars[i][2]), '割合は棒の上に表示する')
      if (i > 0) assert.ok(Number(label[1]) > Number(directLabels[i - 1][1]), '狭い区分のラベルも別々に置く')
    })
    assert.doesNotMatch(svg, /NaN|Infinity/)
  }
  for (const overrides of [{ showBands: true }, { format: 'table' }, { format: 'histogram' }]) {
    assert.equal(createEnemyImage({ ...options, ...overrides }).alternateLayout, undefined)
  }
})

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
  const image = createEnemyImage({ ...options, breakdown: 'rarity' })
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

test('出現敵の職業別・レアリティ別の表とグラフは、全体と同じカテゴリの行・有効件数・得票率を保存する', async () => {
  const { getEnemyAdvantageDisplayRows } = await server.ssrLoadModule('/src/components/enemyAdvantageBreakdown.ts')
  const { DamageThreeEnemyAdvantageTable, DamageThreeEnemyAdvantageChart } =
    await server.ssrLoadModule('/src/components/DamageThreeEnemyAdvantageViews.tsx')
  const skill = { count: 20, physicalWins: 8, ties: 0, artsWins: 12 }
  const stage = { count: 30, physicalWins: 20, ties: 0, artsWins: 10 }
  const zero = { count: 0, physicalWins: 0, ties: 0, artsWins: 0 }
  const active = { skill, stage, skillCount: 2, stageCount: 3 }
  const empty = { skill: zero, stage: zero, skillCount: 0, stageCount: 0 }
  const statistics = {
    rows: [{ label: '全体', spawnCount: 10, skill, stage }], skillCount: 2, stageCount: 3,
    professionRows: [{ ...active, key: 'WARRIOR', label: '前衛' }, { ...empty, key: 'MEDIC', label: '医療' }],
    rarityRows: [{ ...active, key: '6', label: '★6' }, { ...empty, key: '5', label: '★5' }],
  }
  const filters = { kind: 'ALL', profession: 'ALL', damageType: 'ALL', rarity: 'ALL', query: '' }
  for (const [breakdown, label, key, category, missingCategory] of [
    ['profession', '職業', 'WARRIOR', '前衛', '医療'], ['rarity', 'レアリティ', '6', '★6', '★5'],
  ]) {
    for (const [unit, countLabel, count, physicalPercent] of [
      ['skill', '有効スキル数', 2, '40.0'], ['stage', '有効段階数', 3, '66.7'],
    ]) {
      const options = { ...meanDamageOptions, filters, statistics, advantageUnit: unit, breakdown, format: 'table' }
      const rows = getEnemyAdvantageDisplayRows(statistics, breakdown)
      const props = { rows, unit, breakdown }
      const table = renderToStaticMarkup(createElement(DamageThreeEnemyAdvantageTable, props))
      const chart = renderToStaticMarkup(createElement(DamageThreeEnemyAdvantageChart, props))
      assert.deepEqual(rows.map(row => row.label), ['全体', category, missingCategory])
      assert.ok(table.includes('>' + label + '</th>') && table.includes('>' + countLabel + '</th>'))
      assert.ok(table.includes('>' + category + '</th><td data-table-image-number="true">' + count + '</td>'))
      assert.ok(table.includes('>' + physicalPercent + '</td>'))
      assert.match(table, />0<\/td>(?:<td[^>]*>—<\/td>){3}/)
      assert.ok(chart.includes(category + '、' + countLabel + ' ' + count + '、物理 ' + physicalPercent + '%'))
      assert.ok(chart.includes(missingCategory + '、' + countLabel + ' 0、対象なし'))
      assert.doesNotMatch(chart, /防御力 |NaN|Infinity/)

      const savedTable = createEnemyImage(options).snapshot
      assert.equal(renderToStaticMarkup(savedTable.table), table)
      assert.ok(savedTable.conditions.includes(label + '別') && savedTable.filenameConditions.includes(label + '別'))
      const savedChart = createEnemyImage({ ...options, format: 'chart' })
      assert.equal(savedChart.alternateLayout, undefined)
      assert.deepEqual(savedChart.snapshot.conditions, savedTable.conditions)
      assert.ok(savedChart.snapshot.filenameParts.includes(label + '別'))
      assert.ok(chart.includes(renderToStaticMarkup(savedChart.snapshot.chart({ height: savedChart.snapshot.naturalChartHeight }))))

      const selected = { ...filters, [breakdown]: key }
      const narrowed = getEnemyAdvantageDisplayRows(statistics, breakdown, selected.profession, selected.rarity)
      assert.deepEqual(narrowed.map(row => row.label), ['全体', category])
      const filteredChart = createEnemyImage({ ...options, filters: selected, format: 'chart' }).snapshot
      assert.ok(!renderToStaticMarkup(filteredChart.chart({ height: 160 })).includes(missingCategory))
    }
  }
})

test('外れ値別の画面と画像は選択対象の出現割合を保持し、0票と0回を区別する', async () => {
  const { getEnemyAdvantageDisplayRows } = await server.ssrLoadModule('/src/components/enemyAdvantageBreakdown.ts')
  const { DamageThreeEnemyAdvantageTable } = await server.ssrLoadModule('/src/components/DamageThreeEnemyAdvantageViews.tsx')
  const zeroVotes = { physicalWins: 0, ties: 0, artsWins: 0, count: 0 }
  const noVotes = { skill: zeroVotes, stage: zeroVotes }
  const eliteBoss = [
    { label: '全体', spawnCount: 5, spawnShare: 1, ...noVotes },
    { label: '② 防御力のみ', spawnCount: 2, spawnShare: .4, ...noVotes },
    { label: '③ 術耐性のみ', spawnCount: 0, spawnShare: 0, ...noVotes },
  ]
  const statistics = { skillCount: 0, stageCount: 0, rows: [{ label: '全体', spawnCount: 200, ...noVotes }],
    outliers: { defenseFence: 422.5, resistanceFence: 75, all: [], eliteBoss } }
  const options = { ...meanDamageOptions, format: 'table', statistics, breakdown: 'outlier', outlierScope: 'eliteBoss', advantageUnit: 'skill' }
  const rows = getEnemyAdvantageDisplayRows(statistics, 'outlier', 'ALL', 'ALL', 'eliteBoss')
  const props = { rows, unit: 'skill', breakdown: 'outlier' }
  const table = renderToStaticMarkup(createElement(DamageThreeEnemyAdvantageTable, props))
  const savedTable = createEnemyImage(options).snapshot
  assert.deepEqual(savedTable.defaultOutput, { width: 1920, aspect: { preset: '16:9', width: '16', height: '9' } })
  assert.equal(renderToStaticMarkup(savedTable.table), table)
  assert.match(table, /出現割合 \(%\)/)
  assert.match(table, />2<\/td><td[^>]*>40\.0<\/td>(?:<td[^>]*>—<\/td>){3}/)
  assert.match(table, />0<\/td><td[^>]*>0\.0<\/td>(?:<td[^>]*>—<\/td>){3}/)
  const savedChart = createEnemyImage({ ...options, format: 'chart', hiddenChartCategories: ['全体'] }).snapshot
  const chart = renderToStaticMarkup(savedChart.chart({ height: savedChart.naturalChartHeight }))
  assert.match(chart, /② 防御力のみ、出現回数 2 · 出現割合 40\.0%、比較票なし/)
  assert.match(chart, /③ 術耐性のみ、出現回数 0 · 出現割合 0\.0%、対象なし/)
  for (const snapshot of [savedTable, savedChart]) {
    assert.ok(snapshot.conditions.includes('出現回数 5'))
    assert.ok(snapshot.conditions.includes('上側外れ値の基準（全敵） 防御力 422.5超・術耐性 75超'))
    const filename = snapshot.filenameConditions ?? snapshot.filenameParts
    assert.ok(filename.includes('エリート＋ボス') && filename.includes('防御力 422.5超・術耐性 75超'))
  }
  const empty = { ...statistics, outliers: { ...statistics.outliers,
    eliteBoss: eliteBoss.map(row => ({ ...row, spawnCount: 0, spawnShare: null })) } }
  const emptyTable = createEnemyImage({ ...options, statistics: empty }).snapshot
  assert.ok(emptyTable.conditions.includes('出現回数 0'))
  assert.match(renderToStaticMarkup(emptyTable.table), />0<\/td>(?:<td[^>]*>—<\/td>){4}/)
})

test('優勢率のグラフ画像は選んだ行だけを元の順序で保存し、表と他の分析は全行を使う', async () => {
  const { default: { statistics } } = await server.ssrLoadModule('/src/data/damageThreeEnemySpawnDefault.json')
  const { createChartImageFilename } = await server.ssrLoadModule('/src/lib/chartImageFilename.ts')
  const filters = { kind: 'ALL', profession: 'ALL', damageType: 'ALL', rarity: 'ALL', query: '' }
  const options = { ...meanDamageOptions, statistics, filters, format: 'chart', breakdown: 'profession' }
  const labels = ['全体', ...statistics.professionRows.map(row => row.label)]
  const savedRows = snapshot => [...renderToStaticMarkup(snapshot.chart({ height: snapshot.naturalChartHeight }))
    .matchAll(/data-band="([^"]+)"/g)].map(match => match[1])
  const complete = createEnemyImage(options).snapshot
  assert.deepEqual(savedRows(complete), labels)
  for (const wanted of [labels.slice(1, 4), [labels[2]]]) {
    const hiddenChartCategories = labels.filter(label => !wanted.includes(label)).reverse()
    const image = createEnemyImage({ ...options, hiddenChartCategories })
    assert.deepEqual(savedRows(image.snapshot), wanted)
    assert.equal(image.snapshot.naturalChartHeight, 80 * wanted.length)
    assert.equal(image.alternateLayout, undefined)
    const selection = '表示 ' + wanted.join('・')
    assert.ok(image.snapshot.conditions.includes(selection))
    assert.ok(createChartImageFilename(image.snapshot.title, image.snapshot.filenameParts).includes(selection.replace(' ', '')))
  }
  assert.equal(createEnemyImage({ ...options, hiddenChartCategories: labels }), null)
  assert.equal(createEnemyImage({ ...options, breakdown: 'all', hiddenChartCategories: ['全体'] }), null)
  const [first, second] = statistics.professionRows
  const limited = { ...options, filters: { ...filters, profession: first.key } }
  const unaffected = createEnemyImage({ ...limited, hiddenChartCategories: [second.label] }).snapshot
  assert.deepEqual(savedRows(unaffected), ['全体', first.label])
  assert.deepEqual(unaffected.filenameParts, createEnemyImage(limited).snapshot.filenameParts)
  assert.deepEqual(unaffected.conditions, createEnemyImage(limited).snapshot.conditions)
  for (const format of ['table', 'meanDamage', 'histogram']) {
    const normal = createEnemyImage({ ...options, format }).snapshot
    const saved = createEnemyImage({ ...options, format, hiddenChartCategories: labels }).snapshot
    assert.deepEqual(saved.conditions, normal.conditions)
    assert.deepEqual(saved.filenameConditions ?? saved.filenameParts, normal.filenameConditions ?? normal.filenameParts)
    const draw = snapshot => renderToStaticMarkup(snapshot.table ?? snapshot.chart({ width: 928, height: 400 }))
    assert.equal(draw(saved), draw(normal))
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

test('スキル得票率の画像は割合を区間の中央に置き、両端の小さい区間に個別の引き出し線を付ける', async () => {
  const { OperatorSkillVoteImagePlot } =
    await server.ssrLoadModule('/src/components/OperatorSkillVoteImagePlot.tsx')
  const { estimatedBarChartTextWidth } = await server.ssrLoadModule('/src/components/useBarChartTextWidths.ts')
  const width = 928
  function draw(physicalWins, ties, artsWins) {
    const votes = { physicalWins, ties, artsWins, count: physicalWins + ties + artsWins }
    const operator = { operatorName: 'スルト', skills: [{ key: 's1', skillIndex: 1, skillName: 'レーヴァテイン', votes }] }
    return renderToStaticMarkup(createElement(OperatorSkillVoteImagePlot, { operator, width }))
  }
  for (const [counts, expectedCallouts] of [
    [[7229, 901, 3279], []], [[0, 1, 999], ['physical', 'tie']], [[999, 1, 0], ['tie', 'arts']],
  ]) {
    const svg = draw(...counts)
    const segments = [...svg.matchAll(/<rect data-series="([^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)"[^>]*><\/rect>([\s\S]*?)<\/g>/g)]
    assert.equal(segments.length, 3)
    const total = counts.reduce((a, b) => a + b, 0)
    let previousEnd = Number(segments[0][2])
    segments.forEach(([, series, x, y, barWidth, content], i) => {
      const [, labelX, labelY, value] = content.match(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]+)<\/text>/)
      assert.ok(value.endsWith((counts[i] / total * 100).toFixed(1) + '%'))
      const center = Number(x) + Number(barWidth) / 2
      if (expectedCallouts.includes(series)) {
        const [, targetX] = content.match(/<line x1="([^"]+)"/)
        assert.equal(Number(targetX), center)
        assert.ok(Number(labelY) > Number(y))
        const halfWidth = estimatedBarChartTextWidth(value) * 12 / 11 / 2
        assert.ok(Number(labelX) - halfWidth >= previousEnd, '引き出した文字を隣のラベルに重ねない')
        previousEnd = Number(labelX) + halfWidth
        assert.ok(previousEnd <= width, '引き出した文字を右端に収める')
      } else {
        assert.doesNotMatch(content, /<line\b/)
        assert.equal(Number(labelX), center)
      }
    })
  }
  const empty = draw(0, 0, 0)
  assert.match(empty, />対象なし<\/text>/)
  assert.doesNotMatch(empty, /<rect\b|NaN|Infinity/)
})

test('棒の直接表示では折り返したスキル名も棒と左揃えにし、次のスキルと重ねない', async () => {
  const { OperatorSkillVoteImagePlot } = await server.ssrLoadModule('/src/components/OperatorSkillVoteImagePlot.tsx')
  const votes = { physicalWins: 999, ties: 1, artsWins: 0, count: 1000 }
  const skills = ['長いスキル名'.repeat(25), '短い名前'].map((skillName, index) => ({
    key: 'skill' + index, skillIndex: index + 1, skillName, votes,
  }))
  const svg = renderToStaticMarkup(createElement(OperatorSkillVoteImagePlot, {
    operator: { operatorName: 'スルト', skills }, width: 928, height: 400,
  }))
  const height = Number(svg.match(/<svg[^>]+height="([^"]+)"/)[1])
  const rows = svg.split(/<g data-skill="[^"]+"[^>]*>/).slice(1)
  assert.equal(rows.length, skills.length)
  let previousBottom = 0
  rows.forEach((row, index) => {
    const names = [...row.matchAll(/<tspan[^>]*x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/tspan>/g)]
    assert.equal(names.map(name => name[3]).join('').replace(/\s/g, ''), 'S' + (index + 1) + skills[index].skillName)
    if (index === 0) assert.ok(names.length > 1, '長い名前は複数行に収める')
    const [, barX, barY, barHeight] = row.match(/<rect data-series="physical" x="([^"]+)" y="([^"]+)"[^>]*height="([^"]+)"/)
    let lastNameY = previousBottom
    for (const [, x, y] of names) {
      assert.equal(Number(x), Number(barX))
      assert.ok(Number(y) > lastNameY && Number(y) < Number(barY))
      lastNameY = Number(y)
    }
    // These two narrow shares have labels below the bar.
    const outside = [...row.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*>(?:同じ|術) [\d.]+%<\/text>/g)]
    assert.equal(outside.length, 2)
    const barBottom = Number(barY) + Number(barHeight)
    for (const [, y] of outside) assert.ok(Number(y) > barBottom && Number(y) <= height)
    previousBottom = Math.max(...outside.map(label => Number(label[1])))
  })
})

test('得票一覧の表示単位で行と掘り下げ先が変わり、展開前は内訳を描画しない', async () => {
  const { DamageThreeVoteList } = await server.ssrLoadModule('/src/components/DamageThreeVoteList.tsx')
  const { PageLayout } = await server.ssrLoadModule('/src/components/PageLayout.tsx')
  const skill = { key: 's1', skillIndex: 1, skillName: 'レーヴァテイン', votes: { physicalWins: 6, ties: 1, artsWins: 3, count: 10 } }
  const second = { ...skill, key: 's2', skillIndex: 2, skillName: '災厄の巨焔' }
  const operator = { operatorId: 'char_350_surtr', operatorName: 'スルト', skills: [skill, second],
    votes: { physicalWins: 12, ties: 2, artsWins: 6, count: 20 } }
  const renderList = group => renderToStaticMarkup(createElement(PageLayout, { page: 'damage-three-skill-attribute-matrix' },
    createElement(DamageThreeVoteList, { group, operators: [operator], spawnCount: 10, onGroupChange() {},
      imageConditions: meanDamageOptions, renderDetail: () => assert.fail('展開前に内訳が描画された') })))
  const operators = renderList('operator'), skills = renderList('skill')
  assert.match(operators, /1–1 \/ 1件/)
  assert.match(skills, /1–2 \/ 2件/)
  assert.ok(labels(operators).includes('スルトのスキル別の得票'))
  assert.ok(labels(skills).includes('スルト S2 災厄の巨焔の得票内訳'))
  assert.ok(labels(operators).some(label => label.endsWith('オペレーター別の得票一覧の場所をコピー')))
  assert.ok(labels(skills).some(label => label.endsWith('スキル別の得票一覧の場所をコピー')))
})

test('スキル別の得票は画像保存時だけ棒への直接表示を選べ、ファイル名でも区別できる', async () => {
  const { DamageThreeOperatorVotes, useOperatorVoteSelection } = await server.ssrLoadModule('/src/components/DamageThreeOperatorVotes.tsx')
  const { createOperatorVotesChartImage, getOperatorVotesSegments } = await server.ssrLoadModule('/src/components/OperatorVotesImageButton.tsx')
  const { DamageCalculatorThreeAttributeChartImageDialog } =
    await server.ssrLoadModule('/src/components/DamageCalculatorThreeAttributeChartImageDialog.tsx')
  const { PageLayout } = await server.ssrLoadModule('/src/components/PageLayout.tsx')
  const { createChartImageFilename } = await server.ssrLoadModule('/src/lib/chartImageFilename.ts')
  const votes = { physicalWins: 6, ties: 1, artsWins: 3, count: 10 }
  const operator = { operatorId: 'char_350_surtr', operatorName: 'スルト', votes,
    skills: [{ key: 's1', skillIndex: 1, skillName: 'レーヴァテイン', votes }] }
  const conditions = { aggregationVersion: 'v12', scope: 'main', comparisonPolicy: 'excludeAttributeEffects',
    filters: { kind: 'ALL', profession: 'ALL', damageType: 'ALL', rarity: 'ALL', query: '' } }
  const pageTitle = 'スキル別の物理・術ダメージ'
  const voteAddress = pageTitle + ' / 出現敵での比較 / オペレーター別の票 / スキル別の得票'
  function VotesPanel({ view }) {
    const [state, setState] = useOperatorVoteSelection()
    return createElement(PageLayout, { page: 'damage-three-skill-attribute-matrix' },
      createElement(DamageThreeOperatorVotes, { operator, entries: [],
        population: { pairs: [], spawnCount: 10 }, imageConditions: conditions,
        selection: [view ? { ...state, view } : state, setState] }))
  }
  const initial = renderToStaticMarkup(createElement(VotesPanel))
  assert.ok(labels(initial).includes(voteAddress + ' / 表の場所をコピー'))
  assert.match(initial, /<table[^>]+aria-label="スキル別の得票"/)
  const screen = renderToStaticMarkup(createElement(VotesPanel, { view: 'chart' }))
  assert.ok(labels(screen).includes(voteAddress + ' / グラフの場所をコピー'))
  assert.deepEqual(getOperatorVotesSegments(true), ['出現敵での比較', 'オペレーター別の票', '段階ごとの判定'])
  assert.match(screen, />物理 60\.0%<\/text>/)
  assert.doesNotMatch(screen, /グラフのレイアウト|割合を棒に直接表示/)

  const { snapshot, alternateLayout } = createOperatorVotesChartImage({ conditions, operator, spawnCount: 10 })
  assert.equal(alternateLayout.label, '割合を棒に直接表示')
  assert.deepEqual(alternateLayout.defaultAspect, { preset: '16:9', width: '16', height: '9' })
  assert.equal(alternateLayout.snapshot.title, 'スルト｜物理・術の優勢率（スキル別）')
  assert.deepEqual(alternateLayout.snapshot.conditions, ['主攻撃を物理・術に切り替えて比較'])
  assert.match(alternateLayout.snapshot.footerNote, /^メインストーリー・(?:敵の)?出現回数 10/)
  const dialog = renderToStaticMarkup(createElement(DamageCalculatorThreeAttributeChartImageDialog, {
    snapshot, alternateLayout, parentLocation: [pageTitle, ...getOperatorVotesSegments(false, 'chart')], onClose() {},
  }))
  assert.ok(labels(dialog).includes(voteAddress + ' / グラフ / 画像を保存の場所をコピー'))
  assert.match(dialog, /<option value="standard" selected="">標準<\/option>/)
  assert.match(dialog, /<option value="alternate">割合を棒に直接表示<\/option>/)
  const size = { width: 928, height: 400 }
  assert.match(renderToStaticMarkup(snapshot.chart(size)), />物理 60\.0%<\/text>/)
  assert.match(renderToStaticMarkup(alternateLayout.snapshot.chart(size)), />60\.0%<\/text>/)
  const filename = image => createChartImageFilename(image.title, image.filenameParts)
  assert.match(filename(snapshot), /スキル別の得票_グラフ_スルト/)
  assert.doesNotMatch(filename(snapshot), /割合を棒に直接表示/)
  assert.match(filename(alternateLayout.snapshot), /^スルト｜物理・術の優勢率（スキル別）_グラフ_割合を棒に直接表示/)
})
