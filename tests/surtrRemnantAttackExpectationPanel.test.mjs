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
let imageFilename
let moduleComparison

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-attack-expectation-panel-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  ;({ SurtrRemnantAttackExpectationPanel: Panel } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationPanel.tsx'))
  ;({ SurtrRemnantAttackExpectationTable: Table } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationTable.tsx'))
  ;({ SurtrRemnantAttackExpectationTableImage: Image } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationTableImage.tsx'))
  ;({ getSurtrRemnantAttackExpectationTableImageFilename: imageFilename } = await server.ssrLoadModule('/src/components/SurtrRemnantAttackExpectationTableImage.tsx'))
  ;({ calculateSurtrRemnantAttackExpectation: calculateExpectation } = await server.ssrLoadModule('/src/lib/surtrRemnantExpectation.ts'))
  moduleComparison = await server.ssrLoadModule('/src/lib/surtrModuleComparison.ts')
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
const meanRows = markup => sectionRows(markup, 'tfoot').filter(row => row[0] === '期待値')
const calculated = (items = comparison, selected = assumptions) => items.map(item => {
  const expectation = calculateExpectation(item.model, selected)
  assert.ok(expectation)
  return { id: item.id, label: item.label, color: item.color, model: item.model, expectation }
})
const renderTable = (items, layout) => renderToStaticMarkup(createElement(Table, { comparison: items, layout }))
const compact = value => value.replace(/\s+/g, '')
const assertConditions = (markup, expectedConditions, columnCount) => {
  const footer = sections(markup, 'tfoot')
  assert.equal(footer.length, 1)
  const footerRows = rows(footer[0])
  const conditionRows = footerRows.filter(row => row.length === 1 && row[0].startsWith('残りCT：一様分布'))
  assert.equal(conditionRows.length, 1)
  assert.deepEqual(footerRows.at(-1), conditionRows[0])
  assert.ok(compact(conditionRows[0][0]).endsWith(compact(expectedConditions)), 'Unexpected conditions: ' + conditionRows[0][0])
  assert.match(footer[0], new RegExp('<td\\b[^>]*colspan="' + columnCount + '"', 'i'))
}
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
const defaultConditions = '潜在1・自身は非ブロック・命中まで 0.2 s・CT秒数維持・撤退同時の命中を含まない'

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
  assert.deepEqual(meanRows(summary), [['期待値', ...defaultMeans]])
  assertConditions(summary, defaultConditions, 10)
  assert.doesNotMatch(summary, /<button|<select|aria-pressed/)
  assert.match(markup, /<select aria-label="期待回数の表示形式"/)
  assert.match(markup, /<select aria-label="期待値の小数点以下の桁数"/)
  assert.match(markup, /<option value="4" selected="">4桁<\/option>/)
  assert.match(markup, /<option value="horizontal" selected="">計算内訳（横並び）<\/option>/)
  assert.match(markup, /<option value="vertical">計算内訳（縦並び）<\/option>/)
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
  assert.deepEqual(meanRows(summary), [['期待値', defaultMeans[1], defaultMeans[0], defaultMeans[2]]])
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
  assert.deepEqual(meanRows(ratio), [['期待値', '≈ 9.152 回']])
  assertConditions(ratio, '潜在1・自身は非ブロック・命中まで 0.2 s・CT割合維持・撤退同時の命中を含まない', 4)
  const windup = table(render({ assumptions: { ...assumptions, windup: 0.4 } }))
  assert.equal(meanRows(windup)[0][1], '≈ 6.08 回')
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
    assert.deepEqual(meanRows(summary), [['期待値', '≈ 2 回']])
    assertConditions(summary, '潜在6・自身でブロック中・命中まで 0 s・CT秒数維持・撤退同時の命中'
      + (includeRetreatHit ? 'を含む' : 'を含まない'), 4)
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
  assert.deepEqual(meanRows(summary), [['期待値', '≈ 0 回', defaultMeans[1], defaultMeans[2]]])
  const vertical = sections(table(renderTable(calculated(items), 'vertical')), 'tbody').map(rows)
  assert.equal(vertical[0].length, 1)
  assert.equal(vertical[0][0][1], '0 回')
  assertOutcome(vertical[0][0].slice(2, 5), { range: '[0,1.25]', length: '1.25', limit: '1.25', percent: '100', contribution: '0 回' })
  assert.equal(vertical[0][0][5], '≈ 0 回')
  for (const props of [
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

test('clearing all MOD stages shows a selection status instead of an invalid-model error', () => {
  for (const blockingComparison of [undefined, [{ blocking: false, comparison: [] }, { blocking: true, comparison: [] }]]) {
    const markup = render({ comparison: [], blockingComparison })
    assert.match(markup, /role="status">比較するMOD・段階を選択してください。/)
    assert.doesNotMatch(markup, /<table|role="alert"/)
  }
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
  assert.deepEqual(meanRows(horizontalTable), [['期待値', ...defaultMeans]])
  assertConditions(horizontalTable, defaultConditions, 10)
  const vertical = renderToStaticMarkup(createElement(Image, { ...snapshot, layout: 'vertical' }))
  const verticalTable = table(vertical)
  assert.equal([...vertical.matchAll(/<table(?:\s|>)/g)].length, 1)
  assert.equal(sectionRows(verticalTable, 'thead')[0].length, 6)
  const groups = sections(verticalTable, 'tbody').map(rows)
  assert.deepEqual(groups.map(group => group.length), [2, 2, 3])
  assert.deepEqual(groups.map(group => group[0].at(-1)), defaultMeans)
  assertConditions(verticalTable, defaultConditions, 6)
  assert.doesNotMatch(vertical, /<select|<button/)
})

test('changed live conditions and saved snapshot conditions appear below the table in both image layouts', () => {
  const selected = { windup: 0.3456789, ctCarry: 'ratio', includeRetreatHit: true }
  const items = comparison.map(item => ({ ...item, model: {
    ...item.model,
    remnantDuration: item.model.remnantDuration + 1,
    ...(item.id === 'X' ? { attackIntervalBefore: 1.25, attackIntervalAfter: 1.25, attackSpeedBefore: 100, attackSpeedAfter: 100 } : {}),
  } }))
  const expectedConditions = '潜在6・自身でブロック中・命中まで 0.345679 s・CT割合維持・撤退同時の命中を含む'
  const snapshot = structuredClone({ comparison: calculated(items, selected), potential: 6, blocking: true, assumptions: selected })
  const live = table(render({ comparison: items, potential: 6, blocking: true, assumptions: selected }))
  assertConditions(live, expectedConditions, 10)
  // The live page may return to its defaults after an image snapshot is captured.
  assertConditions(table(render()), defaultConditions, 10)
  for (const layout of ['horizontal', 'vertical']) {
    const saved = table(renderToStaticMarkup(createElement(Image, { ...snapshot, layout })))
    assertConditions(saved, expectedConditions, layout === 'horizontal' ? 10 : 6)
    const conditionText = text(sections(saved, 'tfoot')[0])
    assert.doesNotMatch(conditionText, /潜在1|自身は非ブロック|CT秒数維持|命中を含まない/)
    if (layout === 'horizontal') assert.deepEqual(meanRows(saved), meanRows(live))
  }
})

const blockingModels = () => [false, true].map(blocking => ({ blocking, comparison: comparison.map(item => ({
  ...item, model: blocking && item.id === 'X' ? { ...item.model,
    attackIntervalBefore: 1.25, attackIntervalAfter: 1.25, attackSpeedBefore: 100, attackSpeedAfter: 100,
  } : { ...item.model },
})) }))
const firstTable = markup => {
  const found = markup.match(/<table[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(found, 'Missing blocking comparison table')
  return found[1]
}
const blockingConditions = '潜在1・命中まで 0.2 s・CT秒数維持・撤退同時の命中を含まない'

test('both blocking conditions are shown by default and remain independent of the selected live condition', () => {
  const groups = blockingModels()
  for (const blocking of [false, true]) {
    const markup = render({ comparison: groups[Number(blocking)].comparison, blockingComparison: groups, blocking })
    const summary = firstTable(markup)
    assert.deepEqual(sectionRows(summary, 'thead'), [['装備', '自身は非ブロック', '対象を自身でブロック']])
    assert.deepEqual(sectionRows(summary, 'tbody'), [
      ['未装備', '≈ 6.24 回', '≈ 6.24 回'],
      ['MOD-X Lv3', '≈ 6.7392 回', '≈ 6.24 回'],
      ['MOD-Y Lv3', '≈ 9.0031 回', '≈ 9.0031 回'],
    ])
    assertConditions(summary, blockingConditions, 3)
    assert.equal([...markup.matchAll(/<table(?:\s|>)/g)].length, 1)
    assert.match(markup, /<option value="block-comparison" selected="">ブロック条件別<\/option>/)
    assert.match(markup, /<option value="block-details">計算条件付き<\/option>/)
  }
  const missing = render({ blockingComparison: [{ ...groups[0], comparison: [groups[0].comparison[0]] },
    { blocking: true, comparison: [{ ...groups[1].comparison[0], model: null }] }] })
  assert.match(missing, /role="alert"/)
  assert.doesNotMatch(missing, /<table/)
})

test('B joins each blocking condition by equipment ID, including when group order differs', () => {
  const groups = blockingModels().map(group => ({ ...group, comparison: calculated(group.comparison) }))
  groups[1].comparison.reverse()
  const markup = renderToStaticMarkup(createElement(Table, {
    comparison: groups[0].comparison, blockingComparison: [...groups].reverse(), layout: 'block-comparison',
  }))
  const rows = sectionRows(firstTable(markup), 'tbody')
  assert.deepEqual(rows.map(row => row.slice(1)), [
    ['≈ 6.24 回', '≈ 6.24 回'], ['≈ 6.7392 回', '≈ 6.24 回'], ['≈ 9.0031 回', '≈ 9.0031 回'],
  ])
})

test('C and both saved layouts use the captured models, expectations and all-column conditions footer', () => {
  const groups = blockingModels().map(group => ({ ...group, comparison: calculated(group.comparison) }))
  const snapshot = structuredClone({ comparison: groups[1].comparison, blockingComparison: groups,
    potential: 1, blocking: true, assumptions })
  const detailed = renderToStaticMarkup(createElement(Table, { ...snapshot, layout: 'block-details' }))
  const bodies = sections(firstTable(detailed), 'tbody').map(rows)
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies.map(group => group[0][0]), ['自身は非ブロック', '対象を自身でブロック'])
  assert.match(compact(bodies[0][1].join(' ')), /8s1\.157407→1\.157407≈6\.7392回/)
  assert.match(compact(bodies[1][1].join(' ')), /8s1\.25→1\.25≈6\.24回/)
  assert.match(compact(bodies[0][2].join(' ')), /9s1\.25→0\.961538≈9\.0031回/)
  assert.equal([...detailed.matchAll(/scope="rowgroup" rowspan="3"/gi)].length, 2)

  for (const layout of ['block-comparison', 'block-details']) {
    const image = renderToStaticMarkup(createElement(Image, { ...snapshot, layout }))
    const summary = firstTable(image)
    assertConditions(summary, blockingConditions, layout === 'block-comparison' ? 3 : 5)
    assert.match(text(summary), /6\.7392/)
    assert.match(text(summary), /対象を自身でブロック/)
    assert.doesNotMatch(image, /<button|<select/)
    const filename = imageFilename({ ...snapshot, layout })
    assert.match(filename, /ブロック状態比較/)
    assert.match(filename, layout === 'block-comparison' ? /ブロック条件別/ : /計算条件付き/)
    assert.doesNotMatch(filename, /非ブロック|横並び|縦並び/)
    assert.equal(filename, imageFilename({ ...snapshot, blocking: false, layout }))
  }
  assert.notEqual(imageFilename({ ...snapshot, layout: 'block-comparison' }), imageFilename({ ...snapshot, layout: 'block-details' }))
})

test('expected counts and their contributions use the selected decimal limit without rounding calculation inputs', () => {
  const items = calculated()
  const groups = blockingModels().map(group => ({ ...group, comparison: calculated(group.comparison) }))
  const before = JSON.stringify({ items, groups })
  for (const [digits, expected] of [[0, '≈ 9 回'], [2, '≈ 9 回'], [6, '≈ 9.003077 回']]) {
    for (const layout of ['block-comparison', 'block-details', 'horizontal', 'vertical']) {
      const summary = firstTable(renderToStaticMarkup(createElement(Table, {
        comparison: items, blockingComparison: groups, layout, digits,
      })))
      assert.ok(text(summary).includes(expected), `${layout}, ${digits} digits: missing ${expected}`)
      if (layout === 'horizontal' || layout === 'vertical') {
        assert.ok(text(summary).includes(digits === 0 ? '7 回' : digits === 2 ? '6.92 回' : '6.923077 回'))
        assert.match(text(summary), /0\.961538/)
        assert.match(text(summary), /76\.9231%/)
      }
      if (layout === 'block-details') assert.match(text(summary), /0\.961538/)
    }
  }
  assert.equal(JSON.stringify({ items, groups }), before)
})

test('saved tables and filenames retain the captured expected-count decimal limit in every layout', () => {
  const groups = blockingModels().map(group => ({ ...group, comparison: calculated(group.comparison) }))
  const snapshot = { comparison: groups[0].comparison, blockingComparison: groups, potential: 1, blocking: false, assumptions }
  for (const layout of ['block-comparison', 'block-details', 'horizontal', 'vertical']) {
    const saved = firstTable(renderToStaticMarkup(createElement(Image, { ...snapshot, layout, digits: 2 })))
    assert.match(text(saved), /≈ 6\.74 回/)
    assert.doesNotMatch(text(saved), /≈ 6\.7392 回|≈ 9\.0031 回/)
    assert.match(imageFilename({ ...snapshot, layout, digits: 2 }), /小数2桁/)
    assert.match(imageFilename({ ...snapshot, layout }), /小数4桁/)
    assert.notEqual(imageFilename({ ...snapshot, layout, digits: 2 }), imageFilename({ ...snapshot, layout, digits: 6 }))
    const finer = firstTable(renderToStaticMarkup(createElement(Image, { ...snapshot, layout, digits: 6 })))
    assert.match(text(finer), /≈ 9\.003077 回/)
  }
})

test('all table and image layouts retain selected stage labels, colors, values and conditions', () => {
  const all = calculated(moduleComparison.getSelectedSurtrModuleStages([
    { id: '', type: null, label: '未装備', levels: [], unlocked: true },
    { id: 'module-x', type: 'X', label: 'MOD X', levels: [1, 2, 3], unlocked: true },
    { id: 'module-y', type: 'Y', label: 'MOD Y', levels: [1, 2, 3], unlocked: true },
  ], [], { 'module-x': [1, 2, 3], 'module-y': [1, 2, 3] }).map(stage => {
    const original = comparison[stage.type === null ? 0 : stage.type === 'X' ? 1 : 2]
    const model = { ...original.model, moduleId: stage.moduleId, moduleLevel: stage.level }
    if (stage.type === 'Y' && stage.level < 3) {
      model.remnantDuration = 8
      model.attackSpeedAfter = stage.level === 1 ? 100 : 120
      model.attackIntervalAfter = 1.25 / (model.attackSpeedAfter / 100)
    }
    return { ...stage, model }
  }))
  const selections = [all, [all[0]], [all[1], all[3], all[5]]]
  const names = []
  for (const items of selections) {
    const groups = [{ blocking: false, comparison: items }, { blocking: true, comparison: [...items].reverse() }]
    for (const layout of ['horizontal', 'vertical', 'block-comparison', 'block-details']) {
      const snapshot = { comparison: items, blockingComparison: groups, potential: 1, blocking: false, assumptions, layout }
      const saved = renderToStaticMarkup(createElement(Image, snapshot))
      const live = renderToStaticMarkup(createElement(Table, snapshot))
      const savedTable = firstTable(saved)
      assert.deepEqual(rows(savedTable).slice(0, -1), rows(firstTable(live)))
      for (const item of items) {
        assert.ok(text(savedTable).includes(item.label), `${layout}: ${item.label}`)
        assert.ok(savedTable.includes(`background-color:${item.color}`), `${layout}: ${item.color}`)
        assert.ok(compact(savedTable).includes(`≈${item.expectation.expectedHitCount.toLocaleString('ja-JP', { maximumFractionDigits: 4 })}`))
      }
      const columnCount = layout === 'horizontal' ? 1 + items.length * 3 : layout === 'vertical' ? 6
        : layout === 'block-comparison' ? 3 : 5
      assertConditions(savedTable, layout.startsWith('block-') ? blockingConditions : defaultConditions, columnCount)
      const filename = imageFilename(snapshot)
      assert.ok(filename.includes(items.map(item => item.label).join('-').replace(/\s+/g, '')))
      assert.doesNotMatch(filename, /module-|:lv/)
      assert.ok(new TextEncoder().encode(filename).length <= 240)
      names.push(filename)
    }
  }
  assert.equal(new Set(names).size, names.length)
})
