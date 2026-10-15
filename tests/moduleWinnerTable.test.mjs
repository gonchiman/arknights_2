import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let component
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/module-winner-table-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  component = (await server.ssrLoadModule('/src/components/ModuleWinnerTable.tsx')).ModuleWinnerTable
})
after(async () => { await server?.close() })

const candidates = (values) => values.map((value, index) => ({ id: ['X3', 'Y3'][index],
  label: ['MOD X Lv.3', 'MOD Y Lv.3'][index], moduleType: ['X', 'Y'][index], moduleLevel: 3, value }))
const data = {
  rowAxis: { label: '術耐性', rankLabel: '術耐性ランク', items: [
    { id: 'res0', label: '0', rank: 'D', rankTitle: '0以上10未満' },
    { id: 'res5', label: '5', rank: 'D', rankTitle: '0以上10未満' },
    { id: 'res10', label: '10', rank: 'C', rankTitle: '10以上30未満' },
  ] },
  columnAxis: { label: '条件', items: [
    { id: 'p1-none', label: '未ブロック', groupId: 'p1', groupLabel: '潜在1' },
    { id: 'p1-block', label: 'ブロック', groupId: 'p1', groupLabel: '潜在1' },
    { id: 'p6-none', label: '未ブロック', groupId: 'p6', groupLabel: '潜在6' },
  ] },
  cells: ['res0', 'res5', 'res10'].flatMap((rowId, rowIndex) => ['p1-none', 'p1-block', 'p6-none'].map((columnId, columnIndex) => ({
    rowId, columnId, candidates: candidates([[100, 103], [100, 115], [140, 100], [100, 100], [0, 100], [0, 0]][(rowIndex * 3 + columnIndex) % 6]),
  }))),
}
const render = props => renderToStaticMarkup(createElement(component, { data, ...props }))
const cells = markup => [...markup.matchAll(/<td\b[^>]*data-row-id="([^"]+)"[^>]*data-column-id="([^"]+)"[^>]*>(.*?)<\/td>/gs)]
  .map(match => ({ row: match[1], column: match[2], text: /class="module-winner-label"[^>]*>([^<]*)/.exec(match[3])?.[1],
    rate: /data-gap-percent="([^"]+)"/.exec(match[0])?.[1],
    intensity: /--module-winner-intensity:([^;"<>]+)/.exec(match[0])?.[1] }))
const sorted = markup => cells(markup).sort((a, b) => a.row.localeCompare(b.row) || a.column.localeCompare(b.column))

test('transpose preserves every original coordinate and tied labels with semantic headers', () => {
  const plain = render()
  const transposed = render({ transpose: true })
  assert.equal(cells(plain).length, 9)
  assert.deepEqual(sorted(plain), sorted(transposed))
  assert.match(plain, /X3＝Y3/)
  assert.match(plain, /colspan="2" scope="colgroup">潜在1/i)
  assert.match(transposed, /rowspan="2" scope="rowgroup">潜在1/i)
  for (const markup of [plain, transposed]) {
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
    for (const match of markup.matchAll(/\bheaders="([^"]+)"/g)) {
      match[1].split(' ').forEach(id => assert.ok(ids.has(id), id))
    }
    assert.match(markup, /data-table-image-equal-cells/)
    assert.equal((markup.match(/data-table-image-number/g) ?? []).length, 9)
  }
})

test('rank modes preserve values and merge only adjacent matching rank groups', () => {
  const baseline = sorted(render())
  assert.deepEqual(sorted(render({ rankMode: 'inline' })), baseline)
  assert.deepEqual(sorted(render({ rankMode: 'merged' })), baseline)
  assert.match(render({ rankMode: 'inline' }), /module-winner-inline-rank/)
  assert.match(render({ rankMode: 'merged' }), /rowspan="2" scope="rowgroup" title="0以上10未満"/i)
  assert.match(render({ rankMode: 'merged', transpose: true }), /colspan="2" scope="colgroup" title="0以上10未満"/i)
  assert.doesNotMatch(render(), /module-winner-inline-rank|title="0以上10未満"/)
})

test('gap shading is optional, fixed 0–30% and identical in PNG content', () => {
  assert.deepEqual(cells(render()), cells(render({ gapShading: false })))
  const shaded = render({ gapShading: true })
  const values = cells(shaded)
  assert.deepEqual(values.slice(0, 3).map(cell => cell.rate), ['3', '15', '40'])
  values.slice(0, 3).forEach((cell, index) => assert.ok(Math.abs(Number.parseFloat(cell.intensity) - [4, 20, 40][index]) < 1e-12))
  assert.equal(values[3].text, 'X3＝Y3')
  assert.equal(values[3].rate, '0')
  assert.equal(values[4].rate, undefined)
  assert.equal(values[4].intensity, undefined)
  assert.match(shaded, /次点が0のため増加率を算出できません/)
  assert.match(shaded, /次点への増加率 0% ～ 30%以上/)
  assert.deepEqual(cells(render({ gapShading: true, forImage: true })), values)
  assert.doesNotMatch(render({ gapShading: true, color: 'none' }), /data-gap-percent|module-winner-gap-scale/)
})

test('incomplete, invalid and duplicate coordinates show an em dash; only valid screen cells are interactive', () => {
  const invalid = { ...data, cells: [
    { ...data.cells[0], candidates: candidates([100, null]) },
    data.cells[1], data.cells[1],
  ] }
  const markup = render({ data: invalid, onSelectCell: () => {} })
  assert.ok(cells(markup).every(cell => cell.text === '—'))
  assert.doesNotMatch(markup, /<button/)
  assert.equal((render({ onSelectCell: () => {} }).match(/<button/g) ?? []).length, 9)
  assert.doesNotMatch(render({ onSelectCell: () => {}, forImage: true }), /<button/)
})
