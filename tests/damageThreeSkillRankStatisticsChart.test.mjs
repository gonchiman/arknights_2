import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart, Table
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/dc3-rank-statistics-chart-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  Chart = (await server.ssrLoadModule('/src/components/DamageThreeSkillRankStatisticsChart.tsx')).default
  Table = (await server.ssrLoadModule('/src/components/DamageThreeSkillRankStatisticsTable.tsx')).default
})
after(async () => { await server?.close() })

const sample = {
  resistance: 60, defense: 1200, count: 8,
  physical: { q1: 110, median: 222, q3: 333 }, arts: { q1: 0, median: 0, q3: 0 },
  physicalWins: 3, ties: 1, artsWins: 4,
  bySkill: { count: 4, physicalWins: 2.5, ties: 0.5, artsWins: 1 },
}
const missing = {
  resistance: 100, defense: null, count: 0,
  physical: null, arts: null, physicalWins: 0, ties: 0, artsWins: 0,
  bySkill: { count: 0, physicalWins: 0, ties: 0, artsWins: 0 },
}
const render = (Component, view, rows, advantageUnit) => renderToStaticMarkup(createElement(Component, { view, rows, advantageUnit }))
const labels = markup => [...markup.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1])

test('両形式で術耐性と対応防御力が一致し、分布の読み上げはゼロを含む四分位数を保持する', () => {
  const chart = render(Chart, 'distribution', [sample], 'skill')
  const table = render(Table, 'distribution', [sample], 'skill')
  assert.equal(chart, render(Chart, 'distribution', [sample], 'stage'))
  assert.equal(table, render(Table, 'distribution', [sample], 'stage'))
  assert.match(table, /有効段階数/)
  const description = labels(chart).find(label => label.includes('中央値'))
  assert.ok(description, '各条件の四分位数を読み上げられる')
  for (const value of ['60', '1,200', '110', '222', '333', '0']) {
    assert.ok(description.includes(value), value)
    assert.ok(table.includes(`>${value}<`), value)
  }
  assert.match(description, /術化[^物]*中央値[^\d]*0/)
  assert.doesNotMatch(chart, /対象なし|NaN|Infinity/)
  const zeros = render(Chart, 'distribution', [{ ...sample, physical: sample.arts }], 'stage')
  assert.match(zeros, /role="img"/)
  assert.doesNotMatch(zeros, /対象なし|NaN|Infinity/)
})

test('属性別の優勢率は段階数に対する割合に換算し、同値を独立した区分にする', () => {
  const chart = render(Chart, 'advantage', [sample], 'stage')
  const table = render(Table, 'advantage', [sample], 'stage')
  const description = labels(chart).find(label => label.includes('37.5'))
  assert.ok(description)
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
  assert.match(chart, /有効スキル数 4。物理化優勢 2\.5票（62\.5%）、同値 0\.5票（12\.5%）、術化優勢 1票（25\.0%）/)
  for (const [series, width] of [['physical', 62.5], ['tie', 12.5], ['arts', 25]]) {
    assert.ok(chart.includes(`data-series="${series}" style="width:${width}%"`))
  }
})

test('対応がない術耐性を両方のグラフに残し、0ダメージや0%として描かない', () => {
  for (const [view, unit] of [['distribution', 'stage'], ['advantage', 'stage'], ['advantage', 'skill']]) {
    const chart = render(Chart, view, [missing], unit)
    assert.ok(chart.includes('>100<'))
    assert.ok(chart.includes('>対象なし<'))
    assert.doesNotMatch(chart, /role="img"|NaN|Infinity/)
    const table = render(Table, view, [missing], unit)
    assert.match(table, />—<\/td>/)
    assert.doesNotMatch(table, />0\.0<\/td>/)
  }
})
