import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let content
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-total-damage-table-content-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  content = (await server.ssrLoadModule('/src/components/SurtrTotalDamageTableContent.tsx')).SurtrTotalDamageTableContent
})
after(async () => { await server?.close() })

const times = [25, 35.5]
const resistances = [0, 60, 100]
const series = [
  { id: 'X3', label: 'MOD X Lv.3', color: '#3f7699', type: 'X', level: 3 },
  { id: 'Y3', label: 'MOD Y Lv.3', color: '#b4763e', type: 'Y', level: 3 },
]
const matrix = {
  times, resistances, series, maximumTotalDamage: 35520,
  points: times.flatMap(time => resistances.flatMap(resistance => series.map((item, index) => ({
    time, resistance, seriesId: item.id, totalDamage: time * 1000 - resistance * 50 + index * 20,
  })))),
}
const render = (props = {}) => renderToStaticMarkup(createElement(content, { matrix, ...props }))
const cells = markup => [...markup.matchAll(/<td\b[^>]*data-time="([^"]+)"[^>]*data-resistance="([^"]+)"[^>]*data-series-id="([^"]*)"[^>]*>(.*?)<\/td>/gs)]
  .map(match => ({ time: Number(match[1]), resistance: Number(match[2]), id: match[3], text: match[4].replace(/<[^>]*>/g, ''),
    opacity: /rgba\(75, 122, 176, ([^)]+)\)/.exec(match[0])?.[1] }))
const sortedCells = markup => cells(markup).sort((a, b) => a.time - b.time || a.resistance - b.resistance || a.id.localeCompare(b.id))

test('all layouts retain each time, resistance and MOD value exactly once', () => {
  const baseline = sortedCells(render())
  assert.equal(baseline.length, 12)
  assert.equal(baseline.find(cell => cell.time === 35.5 && cell.resistance === 60 && cell.id === 'Y3').text, '32,520.0')
  for (const layout of ['time', 'module', 'resistance']) {
    const markup = render({ layout })
    assert.deepEqual(sortedCells(markup), baseline, layout)
    assert.match(markup, new RegExp(`data-layout="${layout}"`))
  }
})

test('grouped headers follow the selected layout and reference existing header IDs', () => {
  const time = render({ layout: 'time' })
  assert.match(time, /scope="rowgroup" rowspan="2">25<\/th>/i)
  assert.match(time, /scope="rowgroup" rowspan="2">35.5<\/th>/i)
  const module = render({ layout: 'module' })
  assert.equal((module.match(/scope="rowgroup" rowspan="2"/gi) ?? []).length, 2)
  assert.deepEqual(cells(module).filter(cell => cell.resistance === 0).map(cell => [cell.time, cell.id]),
    [[25, 'X3'], [35.5, 'X3'], [25, 'Y3'], [35.5, 'Y3']])
  const resistance = render({ layout: 'resistance' })
  assert.equal((resistance.match(/scope="colgroup" colspan="2"/gi) ?? []).length, 2)
  assert.match(resistance, /素質２発動まで 35.5秒/)
  assert.deepEqual(cells(resistance).filter(cell => cell.resistance === 60).map(cell => [cell.time, cell.id]),
    [[25, 'X3'], [25, 'Y3'], [35.5, 'X3'], [35.5, 'Y3']])
  for (const markup of [time, module, resistance]) {
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
    for (const match of markup.matchAll(/\bheaders="([^"]+)"/g)) {
      for (const id of match[1].split(' ')) assert.ok(ids.has(id), `missing header ${id}`)
    }
  }
})

test('color scaling retains the same raw values and common maximum across layouts', () => {
  for (const colorScale of ['LINEAR', 'SQRT']) {
    const baseline = sortedCells(render({ colorScale }))
    for (const layout of ['time', 'module', 'resistance']) {
      assert.deepEqual(sortedCells(render({ layout, colorScale })), baseline, `${layout}/${colorScale}`)
    }
    const cell = baseline.find(cell => cell.time === 25 && cell.resistance === 100 && cell.id === 'X3')
    const expected = (colorScale === 'SQRT' ? Math.sqrt(20000 / 35520) : 20000 / 35520) * 0.4
    assert.ok(Math.abs(Number(cell.opacity) - expected) < 1e-12)
  }
  assert.deepEqual(cells(render({ colorScale: 'none' })).map(cell => cell.opacity), Array(12).fill(undefined))
})

test('screen cells have keyboard-accessible detail buttons and image cells preserve content without controls', () => {
  const props = { layout: 'resistance', onSelectCell: () => {}, selectedCell: { time: 25, resistance: 60, seriesId: 'Y3' },
    title: '総ダメージ <比較>', footer: createElement('span', null, '潜在1・未ブロック'), colorScale: 'SQRT' }
  const screen = render(props)
  assert.equal((screen.match(/<button /g) ?? []).length, 12)
  assert.match(screen, /aria-label="素質２発動まで25秒、術耐性60、MOD Y Lv.3、総ダメージ22,020.0の命中内訳を表示"/)
  assert.equal((screen.match(/value-cell[^"<>]*is-selected/g) ?? []).length, 1)
  const image = render({ ...props, forImage: true })
  assert.doesNotMatch(image, /<button |is-selected/)
  assert.deepEqual(sortedCells(image), sortedCells(screen))
  assert.match(image, /surtr-total-damage-table-title" colspan="5">総ダメージ &lt;比較&gt;/i)
  assert.match(image, /surtr-total-damage-table-footer" colspan="5"><span>潜在1・未ブロック/i)
})

test('display rounding matches table exports without changing stored fractional values', () => {
  const roundedMatrix = { times: [25], resistances: [0], series: [series[0]], maximumTotalDamage: 1.15,
    points: [{ time: 25, resistance: 0, seriesId: 'X3', totalDamage: 1.15 }] }
  assert.equal(cells(render({ matrix: roundedMatrix, precision: 1 }))[0].text, '1.1')
  assert.equal(cells(render({ matrix: roundedMatrix, precision: 3 }))[0].text, '1.150')
  assert.equal(roundedMatrix.points[0].totalDamage, 1.15)
})

const winnerTimes = [10, 20, 30, 40, 50, 60]
const winnerResistances = Array.from({ length: 11 }, (_, index) => index * 10)
const winnerSeries = [{ id: 'none', label: '未装備', color: '#737982' }, ...series]
const winnerMatrix = {
  times: winnerTimes, resistances: winnerResistances, series: winnerSeries, maximumTotalDamage: 146657,
  points: winnerTimes.flatMap(time => winnerResistances.flatMap(resistance => winnerSeries.map(item => ({
    time, resistance, seriesId: item.id,
    totalDamage: item.id === 'none' ? 1000 : (time === 30 || time === 40) && resistance <= 20
      ? time === 30 ? 118041 : 146657
      : item.id === 'X3' ? 10000 + resistance : 10070,
  })))),
}

test('winner mode collapses the MOD dimension to 66 cells in either orientation and retains all tied labels', () => {
  const baseline = sortedCells(render({ matrix: winnerMatrix, displayMode: 'winner', layout: 'resistance' }))
  assert.equal(baseline.length, 66)
  assert.deepEqual(baseline.find(cell => cell.time === 30 && cell.resistance === 0),
    { time: 30, resistance: 0, id: 'X3=Y3', text: 'X3＝Y3', opacity: undefined })
  assert.equal(baseline.find(cell => cell.time === 10 && cell.resistance === 0).id, 'Y3')
  assert.equal(baseline.find(cell => cell.time === 60 && cell.resistance === 100).id, 'X3')
  for (const layout of ['resistance', 'time', 'module']) {
    const markup = render({ matrix: winnerMatrix, displayMode: 'winner', layout })
    assert.deepEqual(sortedCells(markup), baseline)
    assert.match(markup, /data-display-mode="winner"/)
    assert.match(markup, new RegExp(`data-layout="${layout === 'module' ? 'resistance' : layout}"`))
    assert.doesNotMatch(markup, /scope="(?:colgroup|rowgroup)"/)
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
    for (const match of markup.matchAll(/\bheaders="([^"]+)"/g)) {
      for (const id of match[1].split(' ')) assert.ok(ids.has(id), `missing winner header ${id}`)
    }
  }
})

test('winner mode displays exact common series colors, neutral ties or no colors without numeric scales', () => {
  const colored = render({ matrix: winnerMatrix, displayMode: 'winner', colorScale: 'SQRT' })
  assert.match(colored, /data-color-scale="none"/)
  assert.match(colored, /data-winner-color="module"/)
  assert.match(colored, /data-series-id="X3"[^>]*has-winner-color[^>]*--surtr-total-damage-winner-color:#3f7699/)
  assert.match(colored, /data-series-id="Y3"[^>]*has-winner-color[^>]*--surtr-total-damage-winner-color:#b4763e/)
  assert.match(colored, /data-series-id="X3=Y3"[^>]*has-winner-color is-tied[^>]*>/)
  assert.doesNotMatch(colored, /rgba\(75, 122, 176|has-color-scale/)
  const plain = render({ matrix: winnerMatrix, displayMode: 'winner', winnerColor: 'none' })
  assert.doesNotMatch(plain, /has-winner-color|--surtr-total-damage-winner-color/)
  assert.deepEqual(sortedCells(colored), sortedCells(plain))
})

test('winner details use a semantic button per condition and selected coordinates while image omits controls', () => {
  for (const layout of ['resistance', 'time']) {
    const props = { matrix: winnerMatrix, displayMode: 'winner', layout, onSelectCell: () => {},
      selectedCell: { time: 30, resistance: 0, seriesId: 'none' }, title: '総ダメージが最大のMOD',
      footer: createElement('span', null, '潜在1・未ブロック') }
    const screen = render(props)
    assert.equal((screen.match(/<button type="button"/g) ?? []).length, 66)
    assert.match(screen, /aria-label="素質２発動まで30秒、術耐性0、最大のMOD MOD X Lv.3＝MOD Y Lv.3の命中内訳を表示"/)
    assert.equal((screen.match(/winner-cell[^"<>]*is-selected/g) ?? []).length, 1)
    const image = render({ ...props, forImage: true })
    assert.doesNotMatch(image, /<button |is-selected/)
    assert.deepEqual(sortedCells(image), sortedCells(screen))
    const columnCount = layout === 'resistance' ? 7 : 12
    assert.match(image, new RegExp(`surtr-total-damage-table-title" colspan="${columnCount}">総ダメージが最大のMOD`, 'i'))
    assert.match(image, new RegExp(`surtr-total-damage-table-footer" colspan="${columnCount}"><span>潜在1・未ブロック`, 'i'))
  }
})

test('winner stage labels and equality are decided before display rounding', () => {
  const stageSeries = [
    { id: 'X1', label: 'MOD X Lv.1', color: '#9dbacb', type: 'X', level: 1 },
    { id: 'X2', label: 'MOD X Lv.2', color: '#759db5', type: 'X', level: 2 },
  ]
  const stageMatrix = { times: [25], resistances: [0], series: stageSeries, maximumTotalDamage: 1.10001,
    points: stageSeries.map((item, index) => ({ time: 25, resistance: 0, seriesId: item.id, totalDamage: 1.1 + index * 0.00001 })) }
  const props = { matrix: stageMatrix, displayMode: 'winner' }
  assert.deepEqual(cells(render({ ...props, precision: 0 })), cells(render({ ...props, precision: 3 })))
  assert.equal(cells(render(props))[0].text, 'X2')
  assert.equal(cells(render(props))[0].id, 'X2')
  const tie = { ...stageMatrix, points: stageMatrix.points.map(point => ({ ...point, totalDamage: 1.1 })) }
  assert.equal(cells(render({ ...props, matrix: tie }))[0].text, 'X1＝X2')
  const missing = { ...stageMatrix, points: stageMatrix.points.slice(0, 1) }
  const incompleteMarkup = render({ ...props, matrix: missing, onSelectCell: () => {} })
  assert.equal(cells(incompleteMarkup)[0].text, '—')
  assert.doesNotMatch(incompleteMarkup, /<button |has-winner-color/)
})

test('compact winner cells omit the legend and retain full module names in detail labels', () => {
  const markup = render({ matrix: winnerMatrix, displayMode: 'winner', onSelectCell: () => {} })
  assert.doesNotMatch(markup, /winner-legend|aria-label="MODの略称"|＝：同値/)
  assert.equal(cells(markup).find(cell => cell.time === 30 && cell.resistance === 0).text, 'X3＝Y3')
  assert.match(markup, /aria-label="素質２発動まで30秒、術耐性0、最大のMOD MOD X Lv\.3＝MOD Y Lv\.3の命中内訳を表示"/)
  assert.doesNotMatch(render({ matrix: winnerMatrix, displayMode: 'winner', forImage: true }), /winner-legend|aria-label="MODの略称"|＝：同値/)
  assert.doesNotMatch(render({ matrix: winnerMatrix }), /aria-label="MODの略称"/)
})
