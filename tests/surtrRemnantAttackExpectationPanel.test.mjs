import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let Panel
let Table
let Image
let calculateExpectation

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-attack-expectation-panel-test',
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  ;({ SurtrRemnantAttackExpectationPanel: Panel } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationPanel.tsx'))
  ;({ SurtrRemnantAttackExpectationTable: Table } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationTable.tsx'))
  ;({ SurtrRemnantAttackExpectationTableImage: Image } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationTableImage.tsx'))
  ;({ calculateSurtrRemnantAttackExpectation: calculateExpectation } = await server.ssrLoadModule('/src/lib/surtrRemnantExpectation.ts'))
})

after(async () => { await server?.close() })

const baseModel = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  attackIntervalBefore: 1.25, attackIntervalAfter: 1.25,
  remnantDuration: 8, attackSpeedBefore: 100, attackSpeedAfter: 100,
}
const comparison = [
  { id: 'none', label: '未装備', color: '#737982', model: baseModel },
  { id: 'X', label: 'MOD-X Lv3', color: '#3f7699', model: {
    ...baseModel, moduleId: 'X', moduleType: 'X', moduleLevel: 3,
    attackIntervalBefore: 1.25 / 1.08, attackIntervalAfter: 1.25 / 1.08,
    attackSpeedBefore: 108, attackSpeedAfter: 108,
  } },
  { id: 'Y', label: 'MOD-Y Lv3', color: '#b4763e', model: {
    ...baseModel, moduleId: 'Y', moduleType: 'Y', moduleLevel: 3,
    attackIntervalAfter: 1.25 / 1.3, attackSpeedAfter: 130, remnantDuration: 9,
  } },
]
const assumptions = { windup: 0.2, ctCarry: 'time', includeRetreatHit: false }
const label = '命中回数別の確率と期待値への寄与'
const render = (props = {}) => renderToStaticMarkup(createElement(Panel, {
  comparison, potential: 1, blocking: false, assumptions, status: null, ...props,
}))
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const table = markup => {
  const found = markup.match(new RegExp('<table[^>]*aria-label="' + label + '"[^>]*>([\\s\\S]*?)<\\/table>'))
  assert.ok(found, 'Missing expectation comparison table')
  return found[1]
}
const sections = (markup, tag) => [...markup.matchAll(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'g'))].map(section => section[1])
const rows = markup => [...markup.matchAll(/<tr(?: [^>]*)?>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))
const sectionRows = (markup, tag) => sections(markup, tag).flatMap(rows)
const calculated = (items = comparison, selected = assumptions) => items.map(item => {
  const expectation = calculateExpectation(item.model, selected)
  assert.ok(expectation)
  return { id: item.id, label: item.label, color: item.color, expectation }
})
const renderTable = (items, layout) => renderToStaticMarkup(createElement(Table, { comparison: items, layout }))
const compact = value => value.replace(/\s+/g, '')
const assertProbability = (cell, length, limit, percent) => {
  const normalized = compact(cell).replace(/s/g, '')
  assert.ok(normalized.includes(length + '÷' + limit), 'Missing length/domain calculation in ' + cell)
  assert.ok(normalized.includes('≈' + percent + '%'), 'Missing unrounded-result percentage in ' + cell)
}
const assertOutcome = (cells, outcome) => {
  assert.equal(cells.length, 3)
  if (!outcome) {
    assert.equal(cells[0], '—')
    assert.match(cells[1], /(?:≈\s*)?0%$/)
    assert.equal(cells[2], '0 回')
    return
  }
  assert.ok(compact(cells[0]).includes(outcome.range), 'Missing CT range in ' + cells[0])
  assertProbability(cells[1], outcome.length, outcome.limit, outcome.percent)
  assert.equal(cells[2], outcome.contribution)
}

// Independent expected JP default values, including outcomes absent in another MOD.
const defaultOutcomes = [
  [6, [
    { range: '[0.3,1.25]', length: '0.95', limit: '1.25', percent: '76', contribution: '4.56 回' },
    { range: '[0.855556,1.157407]', length: '0.301852', limit: '1.157407', percent: '26.08', contribution: '1.5648 回' },
    null,
  ]],
  [7, [
    { range: '[0,0.3)', length: '0.3', limit: '1.25', percent: '24', contribution: '1.68 回' },
    { range: '[0,0.855556)', length: '0.855556', limit: '1.157407', percent: '73.92', contribution: '5.1744 回' },
    null,
  ]],
  [8, [null, null, { range: '[1.107692,1.25]', length: '0.142308', limit: '1.25', percent: '11.3846', contribution: '0.9108 回' }]],
  [9, [null, null, { range: '[0.146154,1.107692)', length: '0.961538', limit: '1.25', percent: '76.9231', contribution: '6.9231 回' }]],
  [10, [null, null, { range: '[0,0.146154)', length: '0.146154', limit: '1.25', percent: '11.6923', contribution: '1.1692 回' }]],
]
const defaultMeans = ['≈ 6.24 回', '≈ 6.7392 回', '≈ 9.0031 回']

test('panel 03 shows one horizontal table with all CT ranges, probability calculations and contributions', () => {
  const markup = render()
  assert.match(markup, /id="surtr-remnant-expectation-heading"/)
  assert.match(markup, /<span>03<\/span>/)
  assert.match(markup, /攻撃回数の期待値計算/)
  assert.equal([...markup.matchAll(/<table(?:\s|>)/g)].length, 1)
  const summary = table(markup)
  const headers = sectionRows(summary, 'thead')
  assert.equal(headers[0][0], '命中回数')
  assert.equal(headers[0].length, 4)
  for (const [index, item] of comparison.entries()) assert.ok(headers[0][index + 1].includes(item.label))
  assert.equal(headers[1].length, 9)
  for (const offset of [0, 3, 6]) {
    assert.match(headers[1][offset], /CT.*範囲/)
    assert.match(headers[1][offset + 1], /確率/)
    assert.match(headers[1][offset + 2], /回数.*確率/)
  }
  assert.match(summary, /scope="col" rowspan="2"/i)
  assert.equal([...summary.matchAll(/scope="colgroup" colspan="3"/gi)].length, 3)
  const outcomes = sectionRows(summary, 'tbody')
  assert.deepEqual(outcomes.map(row => row[0]), ['6 回', '7 回', '8 回', '9 回', '10 回'])
  for (const [index, row] of outcomes.entries()) {
    assert.equal(row.length, 10)
    for (const moduleIndex of [0, 1, 2]) assertOutcome(row.slice(1 + moduleIndex * 3, 4 + moduleIndex * 3), defaultOutcomes[index][1][moduleIndex])
  }
  assert.deepEqual(sectionRows(summary, 'tfoot'), [['期待値', ...defaultMeans]])
  assert.doesNotMatch(summary, /<button|<select|aria-pressed/)
  assert.match(markup, /<select aria-label="期待回数の表の並び"/)
  assert.match(markup, /<option value="horizontal" selected="">装備を横に並べる<\/option>/)
  assert.match(markup, /<option value="vertical">装備を縦に並べる<\/option>/)
  assert.doesNotMatch(markup, /期待回数の計算対象|期待回数の計算内訳|goldenglow-detail-modal/)
  for (const item of comparison) assert.ok(summary.includes('background-color:' + item.color))
  assert.match(markup, /<button[^>]*aria-haspopup="dialog"[^>]*>画像を保存<\/button>/)
})

test('vertical layout keeps the same analytical outcomes and means in one table with a group per MOD', () => {
  const markup = renderTable(calculated(), 'vertical')
  assert.equal([...markup.matchAll(/<table(?:\s|>)/g)].length, 1)
  const summary = table(markup)
  const headers = sectionRows(summary, 'thead')[0]
  assert.equal(headers.length, 6)
  assert.match(headers[0], /装備/)
  assert.match(headers[1], /命中回数/)
  assert.match(headers[2], /CT.*範囲/)
  assert.match(headers[3], /確率/)
  assert.match(headers[4], /回数.*確率/)
  assert.match(headers[5], /期待/)
  const groups = sections(summary, 'tbody').map(rows)
  assert.deepEqual(groups.map(group => group.length), [2, 2, 3])
  assert.deepEqual(groups.map(group => group[0].at(-1)), defaultMeans)
  for (const [moduleIndex, group] of groups.entries()) {
    assert.ok(group[0][0].includes(comparison[moduleIndex].label))
    const expectedCounts = moduleIndex === 2 ? [8, 9, 10] : [6, 7]
    assert.deepEqual(group.map((row, index) => row[index === 0 ? 1 : 0]), expectedCounts.map(value => value + ' 回'))
    for (const [index, row] of group.entries()) {
      assert.equal(row.length, index === 0 ? 6 : 4)
      const outcome = defaultOutcomes.find(entry => entry[0] === expectedCounts[index])[1][moduleIndex]
      assertOutcome(row.slice(index === 0 ? 2 : 1, index === 0 ? 5 : 4), outcome)
    }
  }
  assert.doesNotMatch(summary, /<select|<button/)
})

test('X uses its entire own CT domain and preserves all MOD columns when reordered', () => {
  const markup = render({ comparison: [comparison[1], comparison[0], comparison[2]] })
  const summary = table(markup)
  assert.deepEqual(sectionRows(summary, 'tfoot'), [['期待値', defaultMeans[1], defaultMeans[0], defaultMeans[2]]])
  const first = sectionRows(summary, 'tbody')[0]
  assertOutcome(first.slice(1, 4), defaultOutcomes[0][1][1])
  assertOutcome(first.slice(4, 7), defaultOutcomes[0][1][0])
  assertOutcome(first.slice(7, 10), null)
  assert.doesNotMatch(summary, /÷\s*1\.15(?:\D|$)/)
})

test('carry, windup and retreat rules reach the integrated CT and probability table', () => {
  const ratio = table(render({ comparison: [comparison[2]], assumptions: { ...assumptions, ctCarry: 'ratio' } }))
  const ratioRows = sectionRows(ratio, 'tbody')
  assert.deepEqual(ratioRows.map(row => row[0]), ['9 回', '10 回'])
  assertOutcome(ratioRows[0].slice(1), { range: '[0.19,1.25]', length: '1.06', limit: '1.25', percent: '84.8', contribution: '7.632 回' })
  assertOutcome(ratioRows[1].slice(1), { range: '[0,0.19)', length: '0.19', limit: '1.25', percent: '15.2', contribution: '1.52 回' })
  assert.deepEqual(sectionRows(ratio, 'tfoot'), [['期待値', '≈ 9.152 回']])
  const windup = table(render({ assumptions: { ...assumptions, windup: 0.4 } }))
  assert.equal(sectionRows(windup, 'tfoot')[0][1], '≈ 6.08 回')
  const integerWindow = { ...baseModel, attackIntervalBefore: 1, attackIntervalAfter: 1, remnantDuration: 2 }
  for (const includeRetreatHit of [false, true]) {
    const markup = render({ comparison: [{ ...comparison[0], model: integerWindow }], potential: 6, blocking: true,
      assumptions: { windup: 0, ctCarry: 'time', includeRetreatHit } })
    const summary = table(markup)
    const outcomes = sectionRows(summary, 'tbody')
    assert.equal(outcomes.length, 1)
    assert.equal(outcomes[0][0], '2 回')
    assertOutcome(outcomes[0].slice(1), {
      range: includeRetreatHit ? '(0,1]' : '[0,1)',
      length: '1', limit: '1', percent: '100', contribution: '2 回',
    })
    assert.deepEqual(sectionRows(summary, 'tfoot'), [['期待値', '≈ 2 回']])
  }
})

test('valid zero counts are distinct from absent outcomes, invalid models and loading', () => {
  const items = [{ ...comparison[0], model: { ...baseModel, remnantDuration: 0.1 } }, ...comparison.slice(1)]
  const summary = table(render({ comparison: items }))
  const outcomes = sectionRows(summary, 'tbody')
  assert.deepEqual(outcomes.map(row => row[0]), ['0 回', '6 回', '7 回', '8 回', '9 回', '10 回'])
  assertOutcome(outcomes[0].slice(1, 4), { range: '[0,1.25]', length: '1.25', limit: '1.25', percent: '100', contribution: '0 回' })
  assertOutcome(outcomes[0].slice(4, 7), null)
  assertOutcome(outcomes[0].slice(7, 10), null)
  assert.ok(outcomes.slice(1).every(row => row[1] === '—' && row[3] === '0 回'))
  assert.deepEqual(sectionRows(summary, 'tfoot'), [['期待値', '≈ 0 回', defaultMeans[1], defaultMeans[2]]])
  const vertical = sections(table(renderTable(calculated(items), 'vertical')), 'tbody').map(rows)
  assert.equal(vertical[0].length, 1)
  assert.equal(vertical[0][0][1], '0 回')
  assertOutcome(vertical[0][0].slice(2, 5), { range: '[0,1.25]', length: '1.25', limit: '1.25', percent: '100', contribution: '0 回' })
  assert.equal(vertical[0][0][5], '≈ 0 回')
  for (const props of [
    { comparison: [] },
    { comparison: [{ ...comparison[0], model: null }] },
    { comparison: [comparison[0], { ...comparison[1], model: null }] },
    { assumptions: { ...assumptions, windup: -1 } },
  ]) {
    const markup = render(props)
    assert.match(markup, /role="alert"/)
    assert.doesNotMatch(markup, /<table/)
  }
  const loading = render({ status: createElement('p', { role: 'status' }, 'データを取得中') })
  assert.match(loading, /role="status">データを取得中/)
  assert.doesNotMatch(loading, /<table|role="alert"/)
})

test('separate CT ranges for the same count keep their combined width without filling their gap', () => {
  const items = [{ id: 'ranges', label: '複数範囲', color: comparison[0].color, expectation: {
    remainingCtLimit: 1, expectedHitCount: 6.5, probabilities: [
      { hitCount: 6, probability: 0.5, contribution: 3, ctRanges: [
        { from: 0, to: 0.25, count: 6, includeFrom: true, includeTo: false },
        { from: 0.75, to: 1, count: 6, includeFrom: true, includeTo: true },
      ] },
      { hitCount: 7, probability: 0.5, contribution: 3.5, ctRanges: [
        { from: 0.25, to: 0.75, count: 7, includeFrom: true, includeTo: false },
      ] },
    ],
  } }]
  for (const layout of ['horizontal', 'vertical']) {
    const summary = table(renderTable(items, layout))
    const first = sectionRows(summary, 'tbody')[0]
    const cells = first.slice(layout === 'vertical' ? 2 : 1, layout === 'vertical' ? 5 : 4)
    assert.ok(compact(cells[0]).includes('[0,0.25)'))
    assert.ok(compact(cells[0]).includes('[0.75,1]'))
    assert.ok(!compact(cells[0]).includes('[0,1]'))
    assertProbability(cells[1], '0.5', '1', '50')
    assert.equal(cells[2], '3 回')
    assert.match(text(summary), /≈ 6\.5 回/)
  }
})

test('saved image uses the snapshot table layout and defaults to the same horizontal comparison', () => {
  const snapshot = { comparison: calculated(), potential: 1, blocking: false, assumptions }
  const horizontal = renderToStaticMarkup(createElement(Image, snapshot))
  const horizontalTable = table(horizontal)
  assert.equal([...horizontal.matchAll(/<table(?:\s|>)/g)].length, 1)
  assert.equal(sectionRows(horizontalTable, 'thead').length, 2)
  assert.deepEqual(sectionRows(horizontalTable, 'tbody').map(row => row[0]), ['6 回', '7 回', '8 回', '9 回', '10 回'])
  assert.deepEqual(sectionRows(horizontalTable, 'tfoot'), [['期待値', ...defaultMeans]])
  const vertical = renderToStaticMarkup(createElement(Image, { ...snapshot, layout: 'vertical' }))
  const verticalTable = table(vertical)
  assert.equal([...vertical.matchAll(/<table(?:\s|>)/g)].length, 1)
  assert.equal(sectionRows(verticalTable, 'thead')[0].length, 6)
  const groups = sections(verticalTable, 'tbody').map(rows)
  assert.deepEqual(groups.map(group => group.length), [2, 2, 3])
  assert.deepEqual(groups.map(group => group[0].at(-1)), defaultMeans)
  assert.doesNotMatch(vertical, /<select|<button/)
})
