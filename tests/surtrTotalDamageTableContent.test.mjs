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
  { id: 'X3', label: 'MOD X Lv.3', color: '#3f7699' },
  { id: 'Y3', label: 'MOD Y Lv.3', color: '#b4763e' },
]
const matrix = {
  times, resistances, series, maximumTotalDamage: 35520,
  points: times.flatMap(time => resistances.flatMap(resistance => series.map((item, index) => ({
    time, resistance, seriesId: item.id, totalDamage: time * 1000 - resistance * 50 + index * 20,
  })))),
}
const render = (props = {}) => renderToStaticMarkup(createElement(content, { matrix, ...props }))
const cells = markup => [...markup.matchAll(/<td\b[^>]*data-time="([^"]+)"[^>]*data-resistance="([^"]+)"[^>]*data-series-id="([^"]+)"[^>]*>(.*?)<\/td>/gs)]
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
