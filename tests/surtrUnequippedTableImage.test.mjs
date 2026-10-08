import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let Content
let moduleColors
let Image
let saveImage

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-unequipped-table-image-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  ;({ SurtrUnequippedComparisonTableContent: Content } = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableContent.tsx'))
  ;({ SurtrUnequippedComparisonTableImage: Image, saveSurtrUnequippedComparisonTableImage: saveImage }
    = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableImage.tsx'))
  moduleColors = await server.ssrLoadModule('/src/lib/moduleColors.ts')
})

after(async () => { await server?.close() })

const baseline = {
  id: 'none', label: '未装備', color: '#737982',
  points: [{ x: 0, value: 100 }, { x: 60, value: 80 }, { x: 100, value: 0 }],
}
const modules = [
  { id: 'module-x:lv3', label: 'MOD X Lv.3', color: '#3f7699',
    points: [{ x: 100, value: 10 }, { x: 0, value: 125 }, { x: 60, value: 70 }] },
  { id: 'module-y:lv3', label: 'MOD Y Lv.3', color: '#b4763e',
    points: [{ x: 60, value: 80 }, { x: 100, value: 0 }, { x: 0, value: 150 }] },
]
const props = { series: [baseline, ...modules], baseline, resistances: [0, 60, 100], precision: 1,
  metric: 'difference', layout: 'combined' }
const render = (overrides = {}) => renderToStaticMarkup(createElement(Content, { ...props, ...overrides }))
const text = markup => markup.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const sections = (markup, tag) => [...markup.matchAll(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'g'))]
  .map(section => section[1])
const rows = markup => [...markup.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))
const sectionRows = (markup, tag) => sections(markup, tag).flatMap(rows)
const table = markup => {
  const found = markup.match(/<table\b[^>]*>([\s\S]*?)<\/table>/)
  assert.ok(found, 'Missing comparison table')
  return found[1]
}

// Independent values: X/none at RES 60 is 70/80 = 87.5%, or -12.5% growth.
const expectedComparison = {
  difference: [['+25.0', '+50.0'], ['-10.0', '0.0'], ['+10.0', '0.0']],
  ratio: [['125.0%', '150.0%'], ['87.5%', '100.0%'], ['—', '—']],
  percent: [['+25.0%', '+50.0%'], ['-12.5%', '0.0%'], ['—', '—']],
}
const expectedRaw = [['100.0', '125.0', '150.0'], ['80.0', '70.0', '80.0'], ['0.0', '10.0', '0.0']]

for (const metric of ['difference', 'ratio', 'percent']) {
  for (const layout of ['combined', 'comparison']) {
    test(`${layout} image table keeps one value per column and correct ${metric} at matching resistance`, () => {
      const markup = render({ metric, layout })
      const expected = props.resistances.map((resistance, index) => layout === 'combined'
        ? [String(resistance), expectedRaw[index][0], expectedRaw[index][1], expectedComparison[metric][index][0],
          expectedRaw[index][2], expectedComparison[metric][index][1]]
        : [String(resistance), ...expectedComparison[metric][index]])
      assert.deepEqual(sectionRows(markup, 'tbody'), expected)
      const headers = sectionRows(markup, 'thead')
      assert.equal(headers.length, layout === 'combined' ? 2 : 1)
      assert.deepEqual(headers[0], layout === 'combined'
        ? ['術耐性', '未装備DPS・基準', 'MOD X Lv.3', 'MOD Y Lv.3']
        : ['術耐性', 'MOD X Lv.3', 'MOD Y Lv.3'])
      if (layout === 'combined') assert.deepEqual(headers[1], metric === 'difference'
        ? ['DPS', 'DPS差', 'DPS', 'DPS差']
        : metric === 'ratio' ? ['DPS', '比率（未装備＝100%）', 'DPS', '比率（未装備＝100%）']
          : ['DPS', '増加率（%）', 'DPS', '増加率（%）'])
      assert.equal([...markup.matchAll(/<table\b/g)].length, 1)
      assert.doesNotMatch(markup, /<button|<select|is-selected|aria-haspopup|›/)
      assert.deepEqual(sectionRows(render({ metric, layout, series: modules }), 'tbody'), expected,
        'Hiding the unequipped output must preserve its independent baseline')
    })
  }
}

test('missing, null and nonfinite data render as unavailable rather than fabricated values', () => {
  const missingBaseline = { ...baseline, points: [{ x: 0, value: null }, { x: 100, value: 10 }] }
  const missingModules = [
    { ...modules[0], points: [{ x: 0, value: NaN }, { x: 60, value: Infinity }, { x: 100, value: null }] },
    { ...modules[1], points: [{ x: 0, value: 5 }, { x: 60, value: 8 }, { x: 100, value: 0 }] },
  ]
  for (const metric of ['difference', 'ratio', 'percent']) {
    const markup = render({ series: missingModules, baseline: missingBaseline, metric })
    assert.deepEqual(sectionRows(markup, 'tbody'), [
      ['0', '—', '—', '—', '5.0', '—'],
      ['60', '—', '—', '—', '8.0', '—'],
      ['100', '10.0', '—', '—', '0.0', metric === 'difference' ? '-10.0' : metric === 'ratio' ? '0.0%' : '-100.0%'],
    ])
    assert.doesNotMatch(markup, /NaN|Infinity|undefined/)
  }
})

test('image table excludes the interactive selection and flow controls even when a resistance is selected', () => {
  const markup = render({ selectedResistance: 60 })
  assert.doesNotMatch(markup, /<button|is-selected|surtr-s3-result-table|aria-haspopup|›/)
  assert.deepEqual(sectionRows(markup, 'tbody')[1], ['60', '80.0', '70.0', '-10.0', '80.0', '0.0'])
  const interactive = render({ selectedResistance: 60, onOpenDetail: () => {} })
  assert.match(interactive, /class="is-selected"/)
  assert.equal([...interactive.matchAll(/aria-haspopup="dialog"/g)].length, 3)
})

test('all six selected module stages keep their source colors, labels and complete columns', () => {
  const selections = ['X', 'Y'].flatMap(moduleType => [1, 2, 3].map(moduleLevel => ({ moduleType, moduleLevel })))
  const colors = moduleColors.getModuleComparisonColors(selections, { shadeBy: 'moduleLevel' })
  const allStages = selections.map((selection, index) => ({
    id: `module-${selection.moduleType.toLowerCase()}:lv${selection.moduleLevel}`,
    label: `MOD ${selection.moduleType} Lv.${selection.moduleLevel}`, color: colors[index],
    points: [{ x: 0, value: 110 + index * 10 }],
  }))
  const snapshot = { series: allStages, resistances: [0], selectedResistance: 0 }
  for (const layout of ['combined', 'comparison']) {
    const markup = render({ ...snapshot, layout })
    const headers = sectionRows(markup, 'thead')[0]
    assert.deepEqual(headers.slice(layout === 'combined' ? 2 : 1), allStages.map(item => item.label))
    for (const stage of allStages) assert.ok(markup.includes(`background-color:${stage.color}`), stage.label)
    assert.equal(sectionRows(markup, 'tbody')[0].length, layout === 'combined' ? 14 : 7)
    assert.deepEqual(sectionRows(markup, 'tbody')[0], layout === 'combined'
      ? ['0', '100.0', '110.0', '+10.0', '120.0', '+20.0', '130.0', '+30.0', '140.0', '+40.0', '150.0', '+50.0', '160.0', '+60.0']
      : ['0', '+10.0', '+20.0', '+30.0', '+40.0', '+50.0', '+60.0'])
    assert.doesNotMatch(markup, /<button|is-selected/)
  }
})

test('the optional image conditions footer spans the complete selected layout', () => {
  for (const layout of ['combined', 'comparison']) {
    const markup = render({ layout, footer: '特化3・潜在1・対象を自身でブロック' })
    const footer = sections(markup, 'tfoot')
    assert.equal(footer.length, 1)
    assert.deepEqual(rows(footer[0]), [['特化3・潜在1・対象を自身でブロック']])
    assert.match(footer[0], new RegExp(`colspan="${layout === 'combined' ? 6 : 3}"`, 'i'))
    assert.doesNotMatch(markup, /<button|<select/)
  }
})

const metadata = { skillLabel: '特化3', level: 90, trust: 100, potential: 1, blocking: true }

test('saved image uses the same table values, stage colors and full resistance list in every layout and metric', () => {
  for (const layout of ['combined', 'comparison']) {
    for (const metric of ['difference', 'ratio', 'percent']) {
      const snapshot = { ...props, layout, metric, series: modules, metadata }
      const saved = renderToStaticMarkup(createElement(Image, { ...snapshot, aspectRatio: 16 / 9 }))
      const live = render(snapshot)
      assert.deepEqual(sectionRows(saved, 'thead'), sectionRows(live, 'thead'))
      assert.deepEqual(sectionRows(saved, 'tbody'), sectionRows(live, 'tbody'))
      assert.equal(sectionRows(saved, 'tbody').length, 3)
      assert.equal([...saved.matchAll(/<table\b/g)].length, 1)
      for (const item of modules) assert.ok(table(saved).includes(`background-color:${item.color}`), item.label)
      const footer = sections(saved, 'tfoot')
      assert.equal(footer.length, 1)
      assert.match(text(footer[0]), /基準：未装備/)
      assert.match(text(footer[0]), /S3 特化3・昇進2 Lv\.90・信頼度100・潜在1・対象を自身でブロック/)
      assert.match(footer[0], new RegExp(`colspan="${layout === 'combined' ? 6 : 3}"`, 'i'))
      assert.doesNotMatch(saved, /<button|<select|<h[1-6]|is-selected|aria-haspopup|›/)
    }
  }
})

test('saved image retains captured precision, values and conditions after live table settings change', () => {
  const snapshot = structuredClone({ ...props, series: modules, precision: 3, metadata })
  const live = { ...props, series: modules, precision: 0, layout: 'comparison', metric: 'ratio',
    metadata: { ...metadata, potential: 6, blocking: false } }
  assert.deepEqual(sectionRows(render(live), 'tbody')[0], ['0', '125%', '150%'])
  const saved = renderToStaticMarkup(createElement(Image, snapshot))
  assert.deepEqual(sectionRows(saved, 'tbody')[0], ['0', '100.000', '125.000', '+25.000', '150.000', '+50.000'])
  assert.match(text(sections(saved, 'tfoot')[0]), /潜在1・対象を自身でブロック/)
  assert.doesNotMatch(text(sections(saved, 'tfoot')[0]), /潜在6|未ブロック/)
})

test('export rejects invalid aspect or empty tables before accessing the browser capture pipeline', async () => {
  const snapshot = { ...props, metadata }
  for (const aspectRatio of [0, NaN, Infinity, 11]) {
    await assert.rejects(saveImage({ snapshot, aspectRatio }), /縦横比/)
  }
  await assert.rejects(saveImage({ snapshot: { ...snapshot, series: [baseline] } }), /保存する比較表がありません/)
  await assert.rejects(saveImage({ snapshot: { ...snapshot, resistances: [] } }), /保存する比較表がありません/)
})

const blockedModules = [
  { ...modules[0], points: [{ x: 60, value: 65 }, { x: 0, value: 115 }, { x: 100, value: 9 }] },
  { ...modules[1], points: [{ x: 100, value: 0 }, { x: 0, value: 180 }, { x: 60, value: 88 }] },
]
// Conditions and series deliberately arrive in opposite order to the displayed columns.
const blockingComparison = [
  { blocking: true, series: [...blockedModules].reverse(), baseline },
  { blocking: false, series: [...modules].reverse(), baseline },
]
const blockExpectedComparison = {
  difference: [['+25.0', '+15.0', '+50.0', '+80.0'], ['-10.0', '-15.0', '0.0', '+8.0'], ['+10.0', '+9.0', '0.0', '0.0']],
  ratio: [['125.0%', '115.0%', '150.0%', '180.0%'], ['87.5%', '81.3%', '100.0%', '110.0%'], ['—', '—', '—', '—']],
  percent: [['+25.0%', '+15.0%', '+50.0%', '+80.0%'], ['-12.5%', '-18.8%', '0.0%', '+10.0%'], ['—', '—', '—', '—']],
}
const blockExpectedRaw = [['125.0', '115.0', '150.0', '180.0'], ['70.0', '65.0', '80.0', '88.0'], ['10.0', '9.0', '0.0', '0.0']]

for (const metric of ['difference', 'ratio', 'percent']) {
  for (const layout of ['combined', 'comparison']) {
    test(`both blocking conditions keep known ${metric} values and complete ${layout} column groups`, () => {
      const markup = render({ series: modules, blockingComparison, layout, metric })
      const expected = props.resistances.map((resistance, index) => layout === 'combined'
        ? [String(resistance), expectedRaw[index][0], ...blockExpectedRaw[index].flatMap((value, column) =>
          [value, blockExpectedComparison[metric][index][column]])]
        : [String(resistance), ...blockExpectedComparison[metric][index]])
      assert.deepEqual(sectionRows(markup, 'tbody'), expected)
      const headers = sectionRows(markup, 'thead')
      assert.equal(headers.length, layout === 'combined' ? 3 : 2)
      assert.deepEqual(headers[0], layout === 'combined'
        ? ['術耐性', '未装備DPS・基準', 'MOD X Lv.3', 'MOD Y Lv.3']
        : ['術耐性', 'MOD X Lv.3', 'MOD Y Lv.3'])
      assert.deepEqual(headers[1], ['未ブロック', '対象を自身でブロック', '未ブロック', '対象を自身でブロック'])
      if (layout === 'combined') {
        const metricLabel = metric === 'difference' ? 'DPS差' : metric === 'ratio' ? '比率' : '増加率（%）'
        assert.deepEqual(headers[2], ['DPS', metricLabel, 'DPS', metricLabel, 'DPS', metricLabel, 'DPS', metricLabel])
        assert.equal(headers[0].filter(label => label === '未装備DPS・基準').length, 1)
      }
      assert.equal([...markup.matchAll(/<table\b/g)].length, 1)
      assert.doesNotMatch(markup, /<button|<select|is-selected|aria-haspopup|›/)
    })
  }
}

test('a missing condition-specific value never falls back to the selected live blocking condition', () => {
  const groups = structuredClone(blockingComparison)
  groups.find(group => group.blocking).series.find(item => item.id === modules[1].id).points
    = [{ x: 0, value: 180 }, { x: 100, value: null }]
  const markup = render({ series: modules, blockingComparison: groups })
  assert.deepEqual(sectionRows(markup, 'tbody')[1], ['60', '80.0', '70.0', '-10.0', '65.0', '-15.0', '80.0', '0.0', '—', '—'])
  assert.deepEqual(sectionRows(markup, 'tbody')[2], ['100', '0.0', '10.0', '+10.0', '9.0', '+9.0', '0.0', '0.0', '—', '—'])
})

test('two-condition saved images retain all captured values and both condition labels in one table', () => {
  const captured = structuredClone({ ...props, series: modules, blockingComparison, metadata })
  const live = structuredClone(captured)
  live.metadata.blocking = false
  live.metadata.potential = 6
  live.blockingComparison.find(group => group.blocking).series.find(item => item.id === modules[0].id).points[0].value = 999
  for (const layout of ['combined', 'comparison']) {
    const snapshot = { ...captured, layout }
    const saved = renderToStaticMarkup(createElement(Image, snapshot))
    assert.deepEqual(sectionRows(saved, 'thead'), sectionRows(render(snapshot), 'thead'))
    assert.deepEqual(sectionRows(saved, 'tbody'), sectionRows(render(snapshot), 'tbody'))
    assert.equal(sectionRows(saved, 'tbody')[0].length, layout === 'combined' ? 10 : 5)
    assert.equal(sectionRows(saved, 'tbody').length, 3)
    const footer = sections(saved, 'tfoot')
    assert.equal(footer.length, 1)
    assert.match(text(footer[0]), /基準：未装備/)
    assert.match(text(footer[0]), /未ブロック/)
    assert.match(text(footer[0]), /対象を自身でブロック/)
    assert.match(text(footer[0]), /潜在1/)
    assert.doesNotMatch(text(footer[0]), /潜在6/)
    assert.match(footer[0], new RegExp(`colspan="${layout === 'combined' ? 10 : 5}"`, 'i'))
    assert.doesNotMatch(saved, /<button|<select|is-selected|aria-haspopup|›|999/)
    for (const item of modules) assert.ok(table(saved).includes(`background-color:${item.color}`), item.label)
  }
})

test('both conditions preserve all six module stages, 26 combined cells and matching saved table headers', () => {
  const stages = ['X', 'Y'].flatMap(moduleType => [1, 2, 3].map(moduleLevel => ({ moduleType, moduleLevel })))
  const colors = moduleColors.getModuleComparisonColors(stages, { shadeBy: 'moduleLevel' })
  const series = stages.map((stage, index) => ({
    id: `module-${stage.moduleType.toLowerCase()}:lv${stage.moduleLevel}`,
    label: `MOD ${stage.moduleType} Lv.${stage.moduleLevel}`, color: colors[index],
    points: [{ x: 0, value: 110 + index * 10 }],
  }))
  const blocked = series.map((item, index) => ({ ...item, points: [{ x: 0, value: 210 + index * 10 }] }))
  const groups = [{ blocking: false, series, baseline }, { blocking: true, series: [...blocked].reverse(), baseline }]
  for (const layout of ['combined', 'comparison']) {
    const snapshot = { ...props, series, blockingComparison: groups, resistances: [0], layout, metadata }
    const live = render(snapshot)
    const saved = renderToStaticMarkup(createElement(Image, snapshot))
    assert.deepEqual(sectionRows(saved, 'thead'), sectionRows(live, 'thead'))
    assert.deepEqual(sectionRows(saved, 'thead')[0].slice(layout === 'combined' ? 2 : 1), series.map(item => item.label))
    assert.deepEqual(sectionRows(saved, 'tbody'), layout === 'combined' ? [[
      '0', '100.0', '110.0', '+10.0', '210.0', '+110.0', '120.0', '+20.0', '220.0', '+120.0',
      '130.0', '+30.0', '230.0', '+130.0', '140.0', '+40.0', '240.0', '+140.0',
      '150.0', '+50.0', '250.0', '+150.0', '160.0', '+60.0', '260.0', '+160.0',
    ]] : [['0', '+10.0', '+110.0', '+20.0', '+120.0', '+30.0', '+130.0', '+40.0', '+140.0', '+50.0', '+150.0', '+60.0', '+160.0']])
    for (const item of series) assert.ok(table(saved).includes(`background-color:${item.color}`), item.label)
    assert.match(sections(saved, 'tfoot')[0], new RegExp(`colspan="${layout === 'combined' ? 26 : 13}"`, 'i'))
    assert.doesNotMatch(saved, /<button|is-selected/)
  }
})

test('condition-specific cells in either column order open their own DPS or comparison flow, preserving resistance and blocking state', () => {
  const elementNodes = (node, tag) => Array.isArray(node) ? node.flatMap(child => elementNodes(child, tag))
    : !node || typeof node !== 'object' ? []
      : [...(node.type === tag ? [node] : []), ...elementNodes(node.props?.children, tag)]
  const originalElement = globalThis.Element
  class CellElement {
    constructor(attributes) { this.attributes = attributes }
    closest() { return this }
    getAttribute(name) { return this.attributes[name] ?? null }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name) }
  }
  globalThis.Element = CellElement
  try {
    for (const layout of ['combined', 'comparison']) {
      for (const metric of ['difference', 'ratio', 'percent']) {
        for (const columnOrder of ['module', 'blocking']) {
        let tree
        const calls = []
        const focusCalls = []
        function Probe() {
          tree = Content({ ...props, series: modules, blockingComparison, layout, metric, columnOrder,
            onOpenDetail: (...args) => calls.push(args) })
          return tree
        }
        const markup = renderToStaticMarkup(createElement(Probe))
        const resistanceRow = elementNodes(tree, 'tr').find(row => row.key === '60')
        assert.equal(typeof resistanceRow?.props.onClick, 'function')
        const bodyRow = [...sections(markup, 'tbody')[0].matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/g)][1][1]
        const cells = [...bodyRow.matchAll(/<td\b([^>]*)>/g)].map(cell => Object.fromEntries(
          [...cell[1].matchAll(/(data-[\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])))
        const comparisonCell = cells.find(cell => cell['data-series-id'] === modules[1].id
          && cell['data-blocking'] === 'false' && cell['data-metric'] !== 'total')
        assert.ok(comparisonCell, 'Missing unblocked comparison cell')
        const event = attributes => ({ target: new CellElement(attributes),
          currentTarget: { querySelector: () => ({ focus: options => focusCalls.push(options) }) } })
        resistanceRow.props.onClick(event(comparisonCell))
        assert.deepEqual(calls.at(-1), [60, modules[1].id, metric, false])
        if (layout === 'combined') {
          const dpsCell = cells.find(cell => cell['data-series-id'] === modules[0].id
            && cell['data-blocking'] === 'true' && cell['data-metric'] === 'total')
          assert.ok(dpsCell, 'Missing blocked DPS cell')
          resistanceRow.props.onClick(event(dpsCell))
          assert.deepEqual(calls.at(-1), [60, modules[0].id, 'total', true])
        } else {
          const blockedCell = cells.find(cell => cell['data-series-id'] === modules[0].id && cell['data-blocking'] === 'true')
          assert.ok(blockedCell, 'Missing blocked comparison cell')
          resistanceRow.props.onClick(event(blockedCell))
          assert.deepEqual(calls.at(-1), [60, modules[0].id, metric, true])
        }
        assert.deepEqual(focusCalls, [{ preventScroll: true }, { preventScroll: true }])
        }
      }
    }
  } finally {
    if (originalElement === undefined) delete globalThis.Element
    else globalThis.Element = originalElement
  }
})

const bodyCells = markup => sections(markup, 'tbody').flatMap(body => [...body.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(cell => ({
    tag: cell[1], attributes: cell[2], content: cell[3], value: text(cell[3]),
    span: Number(cell[2].match(/rowspan="(\d+)"/i)?.[1] ?? 1),
  }))))

// Expand actual rowspan cells into a rectangular matrix so omitted rank cells
// cannot silently shift baseline or condition-specific comparison columns.
const expandBody = markup => {
  const pending = new Map()
  return bodyCells(markup).map(cells => {
    const row = []
    for (const [column, entry] of pending) {
      row[column] = entry.value
      if (entry.remaining === 1) pending.delete(column)
      else entry.remaining -= 1
    }
    let column = 0
    for (const cell of cells) {
      while (row[column] !== undefined) column += 1
      row[column] = cell.value
      if (cell.span > 1) pending.set(column, { value: cell.value, remaining: cell.span - 1 })
      column += 1
    }
    return row
  })
}

const boundaryResistances = [0, 1, 9, 10, 19, 20, 29, 30, 49, 50, 59, 60, 69, 70, 79, 80, 90, 91, 100]
const boundaryRanks = ['E', 'D', 'D', 'C', 'C', 'B', 'B', 'B+', 'B+', 'A', 'A', 'A+', 'A+', 'S', 'S', 'S+', 'S+', 'SS', 'SS']

test('blocking-first headers and values form two complete condition groups while preserving rank layouts and saved images', () => {
  const comparisons = [['+25.0', '+50.0', '+15.0', '+80.0'], ['-10.0', '0.0', '-15.0', '+8.0'], ['+10.0', '0.0', '+9.0', '0.0']]
  const raw = [['125.0', '150.0', '115.0', '180.0'], ['70.0', '80.0', '65.0', '88.0'], ['10.0', '0.0', '9.0', '0.0']]
  for (const layout of ['combined', 'comparison']) {
    for (const rankMode of ['none', 'inline', 'merged']) {
      const data = { ...props, series: modules, blockingComparison, layout, rankMode, columnOrder: 'blocking', metadata }
      const markup = render(data)
      const leadingHeaders = [...(rankMode === 'merged' ? ['ランク'] : []), '術耐性', ...(layout === 'combined' ? ['未装備DPS・基準'] : [])]
      const headers = sectionRows(markup, 'thead')
      assert.deepEqual(headers[0], [...leadingHeaders, '未ブロック', '対象を自身でブロック'])
      assert.deepEqual(headers[1], ['MOD X Lv.3', 'MOD Y Lv.3', 'MOD X Lv.3', 'MOD Y Lv.3'])
      if (layout === 'combined') assert.deepEqual(headers[2], ['DPS', 'DPS差', 'DPS', 'DPS差', 'DPS', 'DPS差', 'DPS', 'DPS差'])
      assert.deepEqual(expandBody(markup), props.resistances.map((resistance, index) => [
        ...(rankMode === 'merged' ? [['E', 'A+', 'SS'][index]] : []),
        `${resistance}${rankMode === 'inline' ? ['E', 'A+', 'SS'][index] : ''}`,
        ...(layout === 'combined' ? [expectedRaw[index][0]] : []),
        ...comparisons[index].flatMap((comparison, column) => layout === 'combined' ? [raw[index][column], comparison] : [comparison]),
      ]))
      const saved = renderToStaticMarkup(createElement(Image, data))
      assert.deepEqual(bodyCells(saved), bodyCells(markup))
      assert.deepEqual(sectionRows(saved, 'thead'), headers)
      assert.match(sections(saved, 'tfoot')[0], new RegExp(`colspan="${expandBody(saved)[0].length}"`, 'i'))
      assert.doesNotMatch(saved, /<button|<select|is-selected|aria-haspopup|›/)
      assert.match(markup, /surtr-s3-equal-blocking-columns/)
      const standard = render({ ...data, columnOrder: 'module' })
      assert.equal(standard.match(/--surtr-unequipped-min-width:([^;\"]+)/)[1], markup.match(/--surtr-unequipped-min-width:([^;\"]+)/)[1])
      assert.equal(render({ ...data, columnOrder: 'module' }), render({ ...data, columnOrder: undefined }))
    }
  }
})

test('alternative column order has no effect without blocking comparison, and unavailable conditions remain empty in their own group', () => {
  for (const layout of ['combined', 'comparison']) {
    for (const rankMode of ['none', 'inline', 'merged']) {
      const data = { layout, rankMode }
      assert.equal(render({ ...data, columnOrder: 'blocking' }), render(data))
    }
  }
  const markup = render({ series: modules, resistances: [60], layout: 'combined', columnOrder: 'blocking',
    blockingComparison: [blockingComparison.find(group => group.blocking)] })
  assert.deepEqual(sectionRows(markup, 'tbody'), [['60', '80.0', '—', '—', '—', '—', '65.0', '-15.0', '88.0', '+8.0']])
  assert.deepEqual(sectionRows(markup, 'thead')[1], ['MOD X Lv.3', 'MOD Y Lv.3', 'MOD X Lv.3', 'MOD Y Lv.3'])
})

test('inline ranks follow exact game boundaries without changing any comparison-table values or columns', () => {
  for (const layout of ['combined', 'comparison']) {
    for (const metric of ['difference', 'ratio', 'percent']) {
      for (const groups of [undefined, blockingComparison]) {
        const data = { resistances: boundaryResistances, layout, metric, blockingComparison: groups }
        const off = render(data)
        assert.equal(render({ ...data, rankMode: 'none' }), off, 'The default must preserve the original table')
        const inline = render({ ...data, rankMode: 'inline' })
        const actual = sectionRows(inline, 'tbody')
        const expected = sectionRows(off, 'tbody')
        actual.forEach((row, index) => {
          assert.ok(row[0].startsWith(String(boundaryResistances[index])))
          assert.ok(row[0].endsWith(boundaryRanks[index]), row[0])
          assert.deepEqual(row.slice(1), expected[index].slice(1))
          assert.equal(row.length, expected[index].length)
        })
        assert.deepEqual(sectionRows(inline, 'thead'), sectionRows(off, 'thead'))
        assert.doesNotMatch(inline, /<button|aria-haspopup|is-selected/)
      }
    }
  }
})

test('merged ranks expand to the correct complete comparison matrix across layouts, metrics and blocking conditions', () => {
  for (const layout of ['combined', 'comparison']) {
    for (const metric of ['difference', 'ratio', 'percent']) {
      for (const groups of [undefined, blockingComparison]) {
        const data = { resistances: boundaryResistances, layout, metric, blockingComparison: groups, footer: '計算条件' }
        const off = render(data)
        const merged = render({ ...data, rankMode: 'merged' })
        assert.deepEqual(expandBody(merged), sectionRows(off, 'tbody').map((row, index) => [boundaryRanks[index], ...row]))
        const footerColumns = Number(sections(off, 'tfoot')[0].match(/colspan="(\d+)"/i)[1])
        assert.match(sections(merged, 'tfoot')[0], new RegExp(`colspan="${footerColumns + 1}"`, 'i'))
        assert.doesNotMatch(merged, /<button|aria-haspopup|is-selected/)
      }
    }
  }
})

test('rank merging uses displayed contiguous rows in a partial custom range, never assumed full ranks or repeated nonadjacent groups', () => {
  const resistances = [34, 41, 48, 55, 62, 69, 76, 83, 90, 97]
  const markup = render({ resistances, rankMode: 'merged' })
  assert.deepEqual(bodyCells(markup).flatMap(cells => cells[0].value === 'B+' || cells[0].tag === 'th' && !/^\d+$/.test(cells[0].value)
    ? [[cells[0].value, cells[0].span]] : []), [['B+', 3], ['A', 1], ['A+', 2], ['S', 1], ['S+', 2], ['SS', 1]])
  assert.deepEqual(expandBody(markup).map(row => row.slice(0, 2)), resistances.map((value, index) =>
    [['B+', 'B+', 'B+', 'A', 'A+', 'A+', 'S', 'S+', 'S+', 'SS'][index], String(value)]))
  for (const samples of [[30, 50, 40], [-1, 101]]) {
    const fragmented = render({ resistances: samples, rankMode: 'merged' })
    assert.equal(bodyCells(fragmented).length, samples.length)
    assert.ok(bodyCells(fragmented).every(cells => cells[0].span === 1))
    assert.deepEqual(expandBody(fragmented).map(row => row[0]), samples.length === 3 ? ['B+', 'A', 'B+'] : ['—', '—'])
  }
})

test('inline and merged live tables retain the numeric flow button for every resistance row', () => {
  const resistances = [30, 40, 50, 60, 70, 80, 90, 100]
  for (const rankMode of ['inline', 'merged']) {
    const markup = render({ resistances, rankMode, selectedResistance: 40, onOpenDetail: () => {} })
    const cells = bodyCells(markup)
    assert.equal(cells.length, resistances.length)
    cells.forEach((row, index) => assert.ok(row.some(cell => cell.content.includes(`aria-label="術耐性 ${resistances[index]}のDPS計算フローを開く"`))))
    assert.equal([...markup.matchAll(/aria-haspopup="dialog"/g)].length, resistances.length)
    assert.match(markup, /class="is-selected"/)
  }
})

test('saved rank tables preserve captured rank layout, merged groups, resistance rows and complete footer without flow controls', () => {
  for (const rankMode of ['inline', 'merged']) {
    for (const layout of ['combined', 'comparison']) {
      const snapshot = structuredClone({ ...props, resistances: [30, 40, 50, 60, 80, 90, 100], series: modules,
        rankMode, layout, metric: 'ratio', blockingComparison, precision: 3, selectedResistance: 40, metadata })
      const before = structuredClone(snapshot)
      const saved = renderToStaticMarkup(createElement(Image, snapshot))
      const live = render(snapshot)
      assert.deepEqual(bodyCells(saved), bodyCells(live))
      assert.deepEqual(sectionRows(saved, 'thead'), sectionRows(live, 'thead'))
      assert.equal(expandBody(saved).length, snapshot.resistances.length)
      const footerColumns = expandBody(saved)[0].length
      assert.match(sections(saved, 'tfoot')[0], new RegExp(`colspan="${footerColumns}"`, 'i'))
      assert.doesNotMatch(saved, /<button|<select|aria-haspopup|is-selected|›/)
      assert.deepEqual(snapshot, before)
    }
  }
})
