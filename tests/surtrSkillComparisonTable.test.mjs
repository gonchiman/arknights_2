import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let content
let image
let winnerComponent
let winnerAdapter
let getWinner
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-skill-comparison-table-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  content = await server.ssrLoadModule('/src/components/SurtrSkillComparisonTableContent.tsx')
  image = await server.ssrLoadModule('/src/components/SurtrSkillComparisonTableImage.tsx')
  winnerComponent = (await server.ssrLoadModule('/src/components/ModuleWinnerTable.tsx')).ModuleWinnerTable
  winnerAdapter = await server.ssrLoadModule('/src/components/SurtrSkillComparisonWinnerTable.tsx')
  getWinner = (await server.ssrLoadModule('/src/lib/moduleTableWinner.ts')).getModuleTableWinner
})
after(async () => { await server?.close() })

const series = [
  { id: 'none', label: '未装備', color: '#737982', s2: [80, 60, 0], s3: [100, 50, 0] },
  { id: 'module-x:lv3', label: 'MOD X Lv.3', color: '#3f7699', s2: [120, 70, 20], s3: [150, 80, 0] },
]
const data = { series, resistances: [0, 20, 100], metric: 'dps', precision: 1,
  columnOrder: 'module', rankMode: 'none', colorScale: 'none' }
const metadata = { level: 90, trust: 100, potential: 1, s2LevelLabel: '特化3', s3LevelLabel: '特化3',
  enemyCount: 3, blocking: true, remnantActive: false }
const typography = { numberSize: 'auto', titleSize: 12, detailSize: 8 }
const snapshot = { ...data, metadata, title: 'スルト S2・S3 DPS比較', imageLayout: 'current', typography }
const render = (overrides = {}) => renderToStaticMarkup(createElement(content.SurtrSkillComparisonTableContent, { ...data, ...overrides }))
const numberCells = markup => [...markup.matchAll(/<td\b[^>]*data-table-image-number="true"[^>]*>([^<]*)<\/td>/g)].map(match => match[1])
const tbody = markup => markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ''

test('DPS columns and TSV preserve both skills within each selected module in requested resistance order', () => {
  assert.deepEqual(numberCells(render({ forImage: true })), ['80.0', '100.0', '120.0', '150.0', '60.0', '50.0', '70.0', '80.0', '0.0', '0.0', '20.0', '0.0'])
  const rows = content.getSurtrSkillComparisonTableTsv(data).split('\n').map(row => row.split('\t'))
  assert.deepEqual(rows[0], ['術耐性', '未装備 S2 DPS', '未装備 S3 DPS', 'MOD X Lv.3 S2 DPS', 'MOD X Lv.3 S3 DPS'])
  assert.deepEqual(rows[2], ['20', '60.0', '50.0', '70.0', '80.0'])
})

test('skill-first order changes headings and values together', () => {
  assert.deepEqual(numberCells(render({ columnOrder: 'skill', forImage: true })).slice(0, 4), ['80.0', '120.0', '100.0', '150.0'])
  const firstRow = content.getSurtrSkillComparisonTableTsv({ ...data, columnOrder: 'skill' }).split('\n')[0]
  assert.equal(firstRow, '術耐性\t未装備 S2 DPS\tMOD X Lv.3 S2 DPS\t未装備 S3 DPS\tMOD X Lv.3 S3 DPS')
})

test('difference, ratio and growth compare raw S2 to S3 and preserve undefined zero denominators', () => {
  for (const [metric, expected] of [
    ['difference', ['-20.0', '-30.0', '+10.0', '-10.0', '0.0', '+20.0']],
    ['ratio', ['80.0%', '80.0%', '120.0%', '87.5%', '—', '—']],
    ['percent', ['-20.0%', '-20.0%', '+20.0%', '-12.5%', '—', '—']],
  ]) assert.deepEqual(numberCells(render({ metric, forImage: true })), expected)
  const fractional = { ...series[0], s2: [1.049], s3: [1.001] }
  assert.ok(Math.abs(content.getSurtrSkillComparisonValue(fractional, 0, 'ratio') - 104.7952047952) < 1e-9)
  assert.equal(content.getSurtrSkillComparisonValue({ ...series[0], s2: [NaN] }, 0, 'dps'), null)
  assert.equal(content.getSurtrSkillComparisonValue({ ...series[0], s2: [NaN] }, 0, 'difference'), null)
})

test('rank merging only joins adjacent ranks and transposed table retains every raw value', () => {
  const ranks = render({ resistances: [1, 2, 100], rankMode: 'merged', forImage: true })
  assert.match(ranks, /rowSpan="2"[^>]*><span class="surtr-s3-resistance-rank"[^>]*>D</)
  const transposed = render({ resistances: [1, 2, 100], transpose: true, rankMode: 'merged', forImage: true })
  assert.match(transposed, /colSpan="2"[^>]*><span class="surtr-s3-resistance-rank"[^>]*>D</)
  assert.deepEqual(numberCells(transposed), ['80.0', '60.0', '0.0', '100.0', '50.0', '0.0', '120.0', '70.0', '20.0', '150.0', '80.0', '0.0'])
  assert.equal(numberCells(transposed).length, data.resistances.length * series.length * 2)
})

test('only live numerical cells are keyboard-operable detail buttons; export is static', () => {
  const live = render({ onOpenDetail() {} })
  assert.equal([...tbody(live).matchAll(/<button\b/g)].length, data.resistances.length * series.length * 2)
  assert.match(live, /aria-label="術耐性 20、MOD X Lv.3、S3の計算詳細"/)
  assert.doesNotMatch(render({ forImage: true, onOpenDetail() {} }), /<button\b/)
})

test('shared image frame provides external title/footer, full conditions, all values and module-stage colors', () => {
  const markup = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage, snapshot))
  assert.match(markup, /comparison-table-image-frame/)
  assert.match(markup, /comparison-table-image-title">スルト S2・S3 DPS比較</)
  assert.match(markup, /comparison-table-image-footer/)
  assert.match(markup, /S2 特化3・S3 特化3・昇進2 Lv.90・信頼100・潜在1/)
  assert.match(markup, /対象を自身でブロック・敵3体・余燼なし/)
  assert.match(markup, /background-color:#3f7699/)
  assert.equal(numberCells(markup).length, 12)
})

test('stacked MOD images preserve the full-table color scale rather than independently normalizing subsets', () => {
  const markup = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage,
    { ...snapshot, metric: 'difference', colorScale: 'LINEAR', imageLayout: 'stacked' }))
  assert.equal([...markup.matchAll(/surtr-skill-comparison-image-section/g)].length, 2)
  assert.equal(numberCells(markup).length, 6)
  // Global difference magnitude is 30. A difference of +10 uses 13.333...%, not each subset's own 40%.
  assert.match(markup, /#245ea8 13\.333333333333334%/)
})

test('image filename distinguishes all calculation settings and metric/layout/precision', () => {
  const filename = image.getSurtrSkillComparisonTableImageFilename({ ...snapshot, metric: 'ratio', imageLayout: 'transpose', precision: 3 }, 16 / 9)
  for (const part of ['S2-S3_比率', 'S2特化3_S3特化3', '術耐性0-20-100', 'E2Lv90-信頼100-潜在1', '対象を自身でブロック', '敵3体', '余燼なし', 'transpose_3桁']) assert.ok(filename.includes(part), part)
  assert.ok(filename.endsWith('.png'))
  assert.doesNotMatch(filename, /[<>:"/\\|?*]/)
})

const winnerCells = markup => [...markup.matchAll(/<td\b[^>]*data-row-id="([^"]+)"[^>]*data-column-id="([^"]+)"[^>]*>(.*?)<\/td>/gs)]
  .map(match => ({ row: match[1], column: match[2],
    ids: /data-winner-ids="([^"]*)"/.exec(match[0])?.[1],
    text: /class="module-winner-label"[^>]*>([^<]*)/.exec(match[3])?.[1],
    rate: /data-gap-percent="([^"]+)"/.exec(match[0])?.[1],
    color: /--module-winner-color:([^;"<>]+)/.exec(match[0])?.[1],
    intensity: /--module-winner-intensity:([^;"<>]+)/.exec(match[0])?.[1] }))
const sortWinnerCells = cells => [...cells].sort((a, b) => a.row.localeCompare(b.row) || a.column.localeCompare(b.column))
const winnerSeries = [
  { id: 'none', label: '未装備', moduleType: null, moduleLevel: 0, color: '#737982',
    s2: [10, 100.000001, 80], s3: [90, 100.000001, 60] },
  { id: 'x3', label: 'MOD X Lv.3', moduleType: 'X', moduleLevel: 3, color: '#3f7699',
    s2: [30, 100.000002, NaN], s3: [100, 130, 70] },
  { id: 'y3', label: 'MOD Y Lv.3', moduleType: 'Y', moduleLevel: 3, color: '#b4763e',
    s2: [20, 100.000001, 50], s3: [110, 130, 80] },
]
const winnerSource = { ...data, series: winnerSeries, precision: 0, winnerColor: 'category' }
const getCellResult = (matrix, rowId, columnId) => getWinner(matrix.cells
  .find(cell => cell.rowId === rowId && cell.columnId === columnId)?.candidates ?? [])

test('maximum MOD groups S2/S3 independently using raw absolute DPS despite displayed precision or metric', () => {
  const source = { ...winnerSource, displayMode: 'module-winner', metric: 'ratio' }
  const before = structuredClone(source)
  const matrix = winnerAdapter.getSurtrSkillComparisonWinnerData(source)
  assert.deepEqual(matrix.rowAxis.items.map(item => item.id), ['0', '20', '100'])
  assert.deepEqual(matrix.columnAxis.items.map(item => item.id), ['s2', 's3'])
  assert.deepEqual(getCellResult(matrix, '0', 's2').winners.map(item => item.id), ['x3'])
  assert.deepEqual(getCellResult(matrix, '0', 's3').winners.map(item => item.id), ['y3'])
  // These candidates all display 100 at precision zero, but raw X is strictly greater.
  assert.deepEqual(getCellResult(matrix, '20', 's2').winners.map(item => item.id), ['x3'])
  assert.deepEqual(getCellResult(matrix, '20', 's3').winners.map(item => item.id), ['x3', 'y3'])
  assert.equal(getCellResult(matrix, '100', 's2'), null)
  assert.deepEqual(getCellResult(matrix, '100', 's3').winners.map(item => item.id), ['y3'])
  assert.equal(getCellResult(matrix, '0', 's2').runnerUpValue, 20)
  assert.equal(getCellResult(matrix, '0', 's2').absoluteDifference, 10)
  assert.equal(getCellResult(matrix, '0', 's2').increasePercent, 50)
  assert.deepEqual(source, before)
  const withoutY = winnerAdapter.getSurtrSkillComparisonWinnerData({ ...source, series: winnerSeries.slice(0, 2) })
  assert.ok(withoutY.cells.every(cell => cell.candidates.length === 2 && cell.candidates.every(item => item.id !== 'y3')))
  assert.deepEqual(getCellResult(withoutY, '0', 's3').winners.map(item => item.id), ['x3'])
})

test('maximum skill compares S2/S3 within each selected MOD and rejects an incomplete skill pair', () => {
  const source = { ...winnerSource, displayMode: 'skill-winner', metric: 'difference' }
  const matrix = winnerAdapter.getSurtrSkillComparisonWinnerData(source)
  assert.deepEqual(matrix.columnAxis.items.map(item => item.id), ['none', 'x3', 'y3'])
  assert.ok(matrix.cells.every(cell => cell.candidates.map(item => item.id).join(',') === 's2,s3'))
  assert.deepEqual(getCellResult(matrix, '0', 'none').winners.map(item => item.id), ['s3'])
  assert.deepEqual(getCellResult(matrix, '20', 'none').winners.map(item => item.id), ['s2', 's3'])
  assert.deepEqual(getCellResult(matrix, '100', 'none').winners.map(item => item.id), ['s2'])
  assert.equal(getCellResult(matrix, '100', 'x3'), null)
  assert.equal(getCellResult(matrix, '20', 'none').increasePercent, 0)
  const onlyY = winnerAdapter.getSurtrSkillComparisonWinnerData({ ...source, series: [winnerSeries[2]] })
  assert.deepEqual(onlyY.columnAxis.items.map(item => item.id), ['y3'])
  assert.equal(onlyY.cells.length, 3)
})

test('winner table transpose preserves coordinates, all ties, missing results and fixed-gap colors for live/image output', () => {
  for (const displayMode of ['module-winner', 'skill-winner']) {
    const props = { ...winnerSource, displayMode, winnerGapShading: true, rankMode: 'merged' }
    const normal = render(props)
    const transposed = render({ ...props, transpose: true })
    const exported = render({ ...props, forImage: true })
    const cells = winnerCells(normal)
    assert.equal(cells.length, displayMode === 'module-winner' ? 6 : 9)
    assert.deepEqual(sortWinnerCells(cells), sortWinnerCells(winnerCells(transposed)))
    assert.deepEqual(cells, winnerCells(exported))
    assert.ok(cells.some(cell => cell.ids?.includes('=')), 'all tied winners should remain visible')
    assert.ok(cells.some(cell => cell.text === '—'), 'one missing candidate must invalidate a cell')
    assert.match(normal, /data-table-image-equal-cells/)
    assert.match(normal, /次点への増加率 0% ～ 30%以上/)
    const colorless = render({ ...props, winnerColor: 'none' })
    assert.ok(winnerCells(colorless).every(cell => cell.color === undefined && cell.intensity === undefined))
    assert.doesNotMatch(colorless, /module-winner-gap-scale|data-gap-percent/)
  }
})

test('winner TSV copies every full winner name, em dash and skill/MOD axis without rounding decisions', () => {
  const moduleRows = content.getSurtrSkillComparisonTableTsv({ ...winnerSource, displayMode: 'module-winner' })
    .split(/\r?\n/).map(row => row.split('\t'))
  assert.equal(moduleRows[0].length, 3)
  assert.match(moduleRows[0][1], /S2/)
  assert.match(moduleRows[0][2], /S3/)
  assert.deepEqual(moduleRows[1], ['0', 'MOD X Lv.3', 'MOD Y Lv.3'])
  assert.deepEqual(moduleRows[2], ['20', 'MOD X Lv.3', 'MOD X Lv.3＝MOD Y Lv.3'])
  assert.deepEqual(moduleRows[3], ['100', '—', 'MOD Y Lv.3'])
  const skillRows = content.getSurtrSkillComparisonTableTsv({ ...winnerSource, displayMode: 'skill-winner', rankMode: 'merged' })
    .split(/\r?\n/).map(row => row.split('\t'))
  assert.deepEqual(skillRows[0], ['術耐性', '術耐性ランク', '未装備', 'MOD X Lv.3', 'MOD Y Lv.3'])
  assert.deepEqual(skillRows[2].slice(2), ['S2＝S3', 'S3', 'S3'])
  assert.deepEqual(skillRows[3].slice(2), ['S2', '—', 'S3'])
})

test('winner export titles and filenames distinguish the collapsed candidate kind and shade options', () => {
  assert.equal(image.getSurtrSkillComparisonTableTitle('ratio', 'module-winner'), 'スルト S2・S3 DPSが最大のMOD')
  assert.equal(image.getSurtrSkillComparisonTableTitle('difference', 'skill-winner'), 'スルト S2・S3 DPSが最大のスキル')
  assert.equal(image.getSurtrSkillComparisonTableTitle('dps'), 'スルト S2・S3 DPS比較')
  for (const [displayMode, kind, colorLabel] of [['module-winner', '最大MOD', 'MOD色'], ['skill-winner', '最大スキル', 'スキル色']]) {
    const captured = { ...snapshot, ...winnerSource, displayMode, winnerGapShading: true }
    const filename = image.getSurtrSkillComparisonTableImageFilename(captured)
    for (const part of [kind, colorLabel, '差濃淡あり', 'S2特化3_S3特化3', '敵3体', '対象を自身でブロック']) {
      assert.ok(filename.includes(part), `${displayMode}: ${part}`)
    }
    // Numeric-format settings do not change a table containing only winner names.
    assert.equal(image.getSurtrSkillComparisonTableImageFilename({ ...captured, metric: 'ratio', precision: 3 }), filename)
    const colorless = image.getSurtrSkillComparisonTableImageFilename({ ...captured, winnerColor: 'none', winnerGapShading: false })
    assert.ok(colorless.includes('色なし') && colorless.includes('差濃淡なし'))
    assert.notEqual(colorless, filename)
  }
})

test('stacked winner exports preserve the full comparison candidates while splitting the independent axis', () => {
  for (const [displayMode, sectionCount, cellCount] of [['module-winner', 2, 6], ['skill-winner', 3, 9]]) {
    const captured = { ...snapshot, ...winnerSource, displayMode, winnerGapShading: true, imageLayout: 'stacked' }
    const stacked = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage, captured))
    const current = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage, { ...captured, imageLayout: 'current' }))
    assert.equal([...stacked.matchAll(/surtr-skill-comparison-image-section/g)].length, sectionCount)
    assert.equal(winnerCells(stacked).length, cellCount)
    assert.deepEqual(sortWinnerCells(winnerCells(stacked)), sortWinnerCells(winnerCells(current)))
  }
})

test('external buff conditions survive every numeric and winner image layout and filename', () => {
  const externalBuffs = { attackPercent: 150.5, attackAddition: 123.75, attackSpeed: 20.25 }
  const label = '外部バフ：攻撃力+150.5%・固定加算+123.75・攻撃速度+20.25'
  for (const displayMode of ['numeric', 'module-winner', 'skill-winner']) {
    for (const imageLayout of ['current', 'transpose', 'stacked']) {
      const captured = { ...snapshot, ...winnerSource, displayMode, imageLayout,
        metadata: { ...metadata, externalBuffs } }
      const before = structuredClone(captured)
      const markup = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage, captured))
      const preview = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImagePreview, captured))
      const filename = image.getSurtrSkillComparisonTableImageFilename(captured, 16 / 9)
      const context = `${displayMode}/${imageLayout}`
      assert.ok(markup.includes(`<span>${label}</span>`), context)
      assert.ok(preview.includes(`<span>${label}</span>`), `${context} preview`)
      assert.equal(markup.split(label).length - 1, 1, context)
      assert.ok(filename.includes('_外部バフ攻撃力+150.5%-固定加算+123.75-攻撃速度+20.25_'), context)
      assert.ok(filename.includes(`_${imageLayout}_`), context)
      assert.doesNotMatch(filename, /[<>:"/\\|?*]/)
      assert.deepEqual(captured, before, `${context} must not mutate its captured conditions`)
    }
  }
})

test('omitted and all-zero external buffs preserve every existing image and filename unchanged', () => {
  const externalBuffs = { attackPercent: 0, attackAddition: 0, attackSpeed: 0 }
  for (const displayMode of ['numeric', 'module-winner', 'skill-winner']) {
    for (const imageLayout of ['current', 'transpose', 'stacked']) {
      const captured = { ...snapshot, ...winnerSource, displayMode, imageLayout }
      const zero = { ...captured, metadata: { ...metadata, externalBuffs } }
      const renderImage = props => renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage, props))
      assert.equal(renderImage(zero), renderImage(captured), `${displayMode}/${imageLayout}`)
      assert.equal(image.getSurtrSkillComparisonTableImageFilename(zero),
        image.getSurtrSkillComparisonTableImageFilename(captured), `${displayMode}/${imageLayout}`)
      assert.doesNotMatch(renderImage(zero), /外部バフ/)
    }
  }
})

test('each external buff alone is recorded without hiding the other input values', () => {
  for (const externalBuffs of [
    { attackPercent: 150, attackAddition: 0, attackSpeed: 0 },
    { attackPercent: 0, attackAddition: 1000, attackSpeed: 0 },
    { attackPercent: 0, attackAddition: 0, attackSpeed: 30 },
  ]) {
    const captured = { ...snapshot, metadata: { ...metadata, externalBuffs } }
    const markup = renderToStaticMarkup(createElement(image.SurtrSkillComparisonTableImage, captured))
    const label = `外部バフ：攻撃力+${externalBuffs.attackPercent}%・固定加算+${externalBuffs.attackAddition}・攻撃速度+${externalBuffs.attackSpeed}`
    assert.ok(markup.includes(label), label)
    assert.ok(image.getSurtrSkillComparisonTableImageFilename(captured).includes(
      `_外部バフ攻撃力+${externalBuffs.attackPercent}%-固定加算+${externalBuffs.attackAddition}-攻撃速度+${externalBuffs.attackSpeed}_`), label)
  }
})

test('shared winner renderer retains default MOD behavior and uses skill colors and wording for skill candidates', () => {
  const candidates = [
    { id: 's2', label: 'S2', shortLabel: 'S2', color: '#8b5f3b', moduleType: undefined, value: 115 },
    { id: 's3', label: 'S3', shortLabel: 'S3', color: '#416fa3', moduleType: undefined, value: 100 },
  ]
  const skillData = { rowAxis: { label: '術耐性', items: [{ id: '0', label: '0' }] },
    columnAxis: { label: 'MOD', items: [{ id: 'x', label: 'MOD X Lv.3' }] },
    cells: [{ rowId: '0', columnId: 'x', candidates }] }
  const skill = renderToStaticMarkup(createElement(winnerComponent, { data: skillData, candidateKind: 'skill', gapShading: true }))
  assert.equal(winnerCells(skill)[0].text, 'S2')
  assert.equal(winnerCells(skill)[0].color, '#8b5f3b')
  assert.equal(winnerCells(skill)[0].rate, '15')
  assert.equal(winnerCells(skill)[0].intensity, '20%')
  assert.match(skill, /最大のスキル S2/)
  assert.doesNotMatch(skill, /最大のMOD/)
  assert.match(skill, /--module-winner-scale-color:#8b5f3b/)
  assert.match(skill, /--module-winner-scale-color:#416fa3/)
  const defaultModuleData = { ...skillData, cells: [{ rowId: '0', columnId: 'x', candidates: [
    { id: 'x3', label: 'MOD X Lv.3', moduleType: 'X', moduleLevel: 3, value: 100 },
    { id: 'y3', label: 'MOD Y Lv.3', moduleType: 'Y', moduleLevel: 3, value: 90 },
  ] }] }
  const unchanged = renderToStaticMarkup(createElement(winnerComponent, { data: defaultModuleData }))
  assert.equal(winnerCells(unchanged)[0].text, 'X3')
  assert.match(unchanged, /最大のMOD MOD X Lv.3/)
  assert.doesNotMatch(unchanged, /最大のスキル/)
})
