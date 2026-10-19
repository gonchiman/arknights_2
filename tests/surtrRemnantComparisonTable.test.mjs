import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Surface, Image, Preview
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-remnant-comparison-table-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  ;({ SurtrComparisonTableSurface: Surface } = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableContent.tsx'))
  ;({ SurtrUnequippedComparisonTableImage: Image, SurtrUnequippedComparisonTableImagePreview: Preview }
    = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableImage.tsx'))
})
after(async () => { await server?.close() })

const resistances = [1, 2, 80]
const make = (stage, values, potential = 1, pointsAt = resistances) => ({
  id: `${stage}:pot${potential}`, moduleStageId: stage, potential,
  label: `${stage === 'none' ? '未装備' : `MOD ${stage[0].toUpperCase()} Lv.${stage.at(-1)}`} 潜在${potential}`,
  color: stage === 'none' ? '#737982' : stage.startsWith('x:') ? '#3f7699' : '#b4763e',
  points: pointsAt.map((x, index) => ({ x, value: values[index] })),
})
const group = (active, blocking) => ({ blocking,
  baseline: make('none', [100, 100, 50]),
  series: [make('y:lv3', blocking ? active ? [170, 180, 110] : [130, 140, 80]
    : active ? [150, 160, 100] : [110, 120, 70]),
  make('x:lv3', blocking ? [110, 120, 80] : [120, 130, 90])],
})
const states = [true, false].map(remnantActive => ({ remnantActive,
  baseline: group(remnantActive, false).baseline,
  series: [...group(remnantActive, false).series].reverse(),
  blockingComparison: [true, false].map(blocking => group(remnantActive, blocking)),
}))
const data = { ...states[1], resistances, precision: 0, metric: 'percent', layout: 'comparison',
  columnOrder: 'blocking', remnantComparison: states, remnantLayout: 'common',
  metadata: { skillLabel: '特化3', level: 90, trust: 100, potential: 1, blocking: false, remnantActive: false } }
const render = (overrides = {}) => renderToStaticMarkup(createElement(Surface, { ...data, ...overrides }))
const renderImage = (source, component = Image) => renderToStaticMarkup(createElement(component, source))
const clean = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const sections = (source, tag) => [...source.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'))].map(match => match[1])
const attr = (source, name) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(source)?.[1]
const numericCells = source => [...source.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
  .filter(match => attr(match[1], 'data-table-image-number') !== undefined)
  .map(match => ({ series: attr(match[1], 'data-series-id'), blocking: attr(match[1], 'data-blocking'),
    active: attr(match[1], 'data-remnant-active'), common: attr(match[1], 'data-remnant-common'),
    metric: attr(match[1], 'data-metric'), value: clean(match[2]),
    background: /--surtr-comparison-cell-background:([^;"<>]+)/.exec(match[1])?.[1] }))
const sorted = cells => [...cells].sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
const valuesByRow = markup => sections(markup, 'tbody').flatMap(body => sections(body, 'tr').map(row => numericCells(row).map(cell => cell.value)))
const canonicalImageCells = markup => sorted(numericCells(markup).map(({ blocking: _blocking, ...cell }) => cell))

/** Resolve actual row/column spans independently of the implementation's header counts. */
const assertTableGrid = markup => {
  const tables = sections(markup, 'table')
  assert.ok(tables.length > 0)
  for (const table of tables) {
    const width = [...table.matchAll(/<col\b([^>]*)>/g)].reduce((sum, match) => sum + Number(attr(match[1], 'span') ?? 1), 0)
    assert.ok(width > 0, 'Table declares physical columns')
    for (const tag of ['thead', 'tbody', 'tfoot']) for (const section of sections(table, tag)) {
      const rows = sections(section, 'tr')
      const occupied = rows.map(() => Array(width).fill(false))
      for (let row = 0; row < rows.length; row += 1) {
        let column = 0
        for (const cell of rows[row].matchAll(/<(?:th|td)\b([^>]*)>[\s\S]*?<\/(?:th|td)>/g)) {
          while (occupied[row][column]) column += 1
          const colspan = Number(attr(cell[1], 'colspan') ?? 1), rowspan = Number(attr(cell[1], 'rowspan') ?? 1)
          assert.ok(column + colspan <= width, `${tag} row ${row} overflows ${width} columns`)
          assert.ok(row + rowspan <= rows.length, `${tag} row ${row} spans beyond its row group`)
          for (let y = row; y < row + rowspan; y += 1) for (let x = column; x < column + colspan; x += 1) {
            assert.equal(occupied[y][x], false, `${tag} overlaps row ${y}, column ${x}`)
            occupied[y][x] = true
          }
          column += colspan
        }
        assert.ok(occupied[row].every(Boolean), `${tag} row ${row} leaves a gap: ${JSON.stringify(occupied[row])}`)
      }
    }
  }
}

test('A common-value layout retains X once and displays Y off/on within each blocking group', () => {
  const markup = render({ title: 'スルト S3 MOD比較', footer: '同じ未装備基準', rankMode: 'merged', onOpenDetail() {} })
  assert.deepEqual(valuesByRow(markup), [
    ['+20%', '+10%', '+50%', '+10%', '+30%', '+70%'],
    ['+30%', '+20%', '+60%', '+20%', '+40%', '+80%'],
    ['+80%', '+40%', '+100%', '+60%', '+60%', '+120%'],
  ])
  assert.equal(numericCells(markup).length, 18)
  assert.equal(numericCells(markup).filter(cell => cell.common === 'true').length, 6)
  assert.ok(numericCells(markup).filter(cell => cell.common === 'true').every(cell => cell.series === 'x:lv3:pot1' && cell.active === undefined))
  assert.match(markup, /余燼なし・中 共通/)
  assert.match(markup, /rowspan="2"[^>]*><span class="surtr-s3-resistance-rank"/i)
  assert.equal((markup.match(/<button\b/g) ?? []).length, 18)
  assertTableGrid(markup)
})

test('C state-columns layout repeats all values, and rank/transpose changes preserve every numeric cell', () => {
  const markup = render({ remnantLayout: 'columns', rankMode: 'inline', forImage: true, onOpenDetail() {} })
  assert.deepEqual(valuesByRow(markup)[0], ['+20%', '+20%', '+10%', '+50%', '+10%', '+10%', '+30%', '+70%'])
  assert.equal(numericCells(markup).length, 24)
  assert.ok(numericCells(markup).every(cell => cell.common === undefined && ['false', 'true'].includes(cell.active)))
  assert.match(markup, /surtr-s3-resistance-rank-value/)
  assert.doesNotMatch(markup, /<button\b|aria-haspopup|is-selected/)
  for (const rankMode of ['none', 'inline', 'merged']) for (const transpose of [false, true]) {
    const output = render({ remnantLayout: 'columns', rankMode, transpose, forImage: true })
    assert.deepEqual(sorted(numericCells(output)), sorted(numericCells(markup)))
    assertTableGrid(output)
  }
})

test('DPS plus comparison keeps separate numeric cells and complete baseline columns in either orientation', () => {
  for (const remnantLayout of ['common', 'columns']) {
    const markup = render({ remnantLayout, layout: 'combined', rankMode: 'merged', forImage: true })
    const cells = numericCells(markup)
    assert.equal(cells.length, remnantLayout === 'common' ? 42 : 60)
    assert.equal(cells.filter(cell => cell.series === 'none:pot1').length, remnantLayout === 'common' ? 6 : 12)
    assert.deepEqual(cells.filter(cell => cell.series === 'none:pot1').slice(0, 2).map(cell => cell.value), ['100', '100'])
    const transposed = render({ remnantLayout, layout: 'combined', rankMode: 'merged', transpose: true, forImage: true })
    assert.deepEqual(sorted(numericCells(transposed)), sorted(cells))
    assertTableGrid(markup)
    assertTableGrid(transposed)
  }
})

test('multiple potentials and previous-stage references use each state independently; missing references stay unavailable', () => {
  const targets = [make('x:lv3', [120], 1, [1]), make('y:lv3', [110], 1, [1]),
    make('x:lv3', [150], 6, [1]), make('y:lv3', [140], 6, [1])]
  const refs = [make('x:lv2', [100], 1, [1]), make('y:lv2', [100], 1, [1]),
    make('x:lv2', [100], 6, [1]), make('y:lv2', [100], 6, [1])]
  const source = { ...data, series: targets, resistances: [1], blockingComparison: undefined,
    referenceSeries: refs, comparisonBase: 'previous', layout: 'combined', columnOrder: 'module',
    remnantComparison: [{ remnantActive: false, series: targets, baseline: data.baseline, referenceSeries: refs },
      { remnantActive: true, series: [targets[0], make('y:lv3', [160], 1, [1]), targets[2], make('y:lv3', [200], 6, [1])],
        baseline: data.baseline, referenceSeries: [make('x:lv2', [60], 1, [1]), make('y:lv2', [80], 1, [1]), make('x:lv2', [120], 6, [1])] }] }
  const before = structuredClone(source)
  const markup = render({ ...source, rankMode: 'inline', forImage: true, onOpenDetail() {} })
  assert.deepEqual(valuesByRow(markup)[0], ['120', '+20%', '120', '+100%', '110', '+10%', '160', '+100%',
    '150', '+50%', '150', '+25%', '140', '+40%', '200', '—'])
  assert.match(markup, /MOD X Lv.3 潜在1/)
  assert.match(markup, /MOD Y Lv.3 潜在6/)
  assert.match(markup, /基準：MOD X Lv.2 潜在1/)
  assert.match(markup, /基準：MOD Y Lv.2 潜在6/)
  assert.doesNotMatch(markup, /<button\b|NaN|Infinity|undefined/)
  assert.equal(numericCells(markup).filter(cell => cell.common === 'true').length, 0,
    'Equal raw DPS with unequal reference values must retain both states')
  assertTableGrid(markup)
  assert.deepEqual(source, before)
})

test('comparison images and preview preserve both states, complete grids, a shared scale and the captured source', () => {
  const withLevelOne = state => ({ ...state,
    series: [make('x:lv1', state.remnantActive ? [500, 500, 250] : [400, 400, 200]), ...state.series],
    blockingComparison: state.blockingComparison.map(condition => ({ ...condition,
      series: [make('x:lv1', state.remnantActive ? [500, 500, 250] : [400, 400, 200]), ...condition.series] })),
  })
  const expandedStates = states.map(withLevelOne)
  for (const remnantLayout of ['common', 'columns']) {
    const source = { ...data, ...expandedStates[1], remnantComparison: expandedStates, remnantLayout,
      colorScale: true, rankMode: 'merged', title: 'スルト S3 MOD比較', aspectRatio: 16 / 9 }
    const before = structuredClone(source)
    const full = renderImage(source)
    assert.match(full, /comparison-table-image-title">スルト S3 MOD比較</)
    const footer = /<div class="comparison-table-image-footer">([\s\S]*?)<\/div>/.exec(full)?.[1]
    assert.ok(footer, 'Both states are recorded in the image condition band')
    assert.match(clean(footer), /余燼なし/)
    assert.match(clean(footer), /余燼中/)
    assert.ok(numericCells(full).some(cell => cell.active === 'false'))
    assert.ok(numericCells(full).some(cell => cell.active === 'true'))
    const xFirst = numericCells(full).find(cell => cell.series === 'x:lv3:pot1' && cell.value === '+20%')
    assert.ok(Math.abs(Number(/ ([\d.]+)%/.exec(xFirst.background)?.[1]) - 2) < 1e-12,
      'A +20% cell uses 2% paint from the full-table +400% maximum, including the active state')
    for (const imageLayout of ['current', 'transpose', 'stacked', 'split']) {
      const markup = renderImage({ ...source, imageLayout, moduleLevel: imageLayout === 'split' ? 3 : undefined })
      const expected = canonicalImageCells(full).filter(cell => imageLayout !== 'split' || cell.series.includes(':lv3:'))
      assert.deepEqual(canonicalImageCells(markup), expected, `${remnantLayout}/${imageLayout} keeps values and global colors`)
      assertTableGrid(markup)
      assert.doesNotMatch(markup, /<button\b|<select\b|aria-haspopup|NaN|Infinity|undefined/)
    }
    assert.deepEqual(canonicalImageCells(renderImage(source, Preview)), canonicalImageCells(full))
    const dormant = renderImage({ ...source, metadata: { ...source.metadata, remnantActive: true } })
    assert.deepEqual(canonicalImageCells(dormant), canonicalImageCells(full))
    assert.equal(sections(dormant, 'table').join(''), sections(full, 'table').join(''))
    assert.deepEqual(source, before)
  }
})

const winnerStages = ['x:lv3', 'y:lv3'].map(id => ({ id, type: id[0].toUpperCase(), level: 3,
  label: `MOD ${id[0].toUpperCase()} Lv.3`, color: id.startsWith('x:') ? '#3f7699' : '#b4763e' }))
const winnerCells = markup => [...markup.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
  .filter(match => attr(match[1], 'data-row-id') !== undefined)
  .map(match => ({ row: attr(match[1], 'data-row-id'), column: attr(match[1], 'data-column-id'),
    ids: attr(match[1], 'data-winner-ids'), value: /class="module-winner-label"[^>]*>([^<]*)/.exec(match[2])?.[1],
    gap: attr(match[1], 'data-gap-percent') }))
const canonicalWinners = cells => sorted(cells.map(cell => ({ ...cell, column: cell.column.replace(/:(?:unblocked|blocked)$/, ':current') })))

test('winner output compares absolute DPS separately for both states and keeps every winner through export layouts', () => {
  const source = { ...data, displayMode: 'winner', winnerStages, winnerGapShading: true, rankMode: 'merged' }
  const before = structuredClone(source)
  const markup = render(source)
  assert.deepEqual(winnerCells(markup).slice(0, 4).map(cell => cell.value), ['X3', 'Y3', 'Y3', 'Y3'])
  assert.equal(winnerCells(markup).length, 12)
  assert.ok(winnerCells(markup).some(cell => cell.column.startsWith('remnant:off:')))
  assert.ok(winnerCells(markup).some(cell => cell.column.startsWith('remnant:on:')))
  for (const imageLayout of ['current', 'transpose', 'stacked', 'split']) {
    const image = renderImage({ ...source, imageLayout, moduleLevel: imageLayout === 'split' ? 3 : undefined })
    assert.deepEqual(canonicalWinners(winnerCells(image)), canonicalWinners(winnerCells(markup)), imageLayout)
    if (imageLayout === 'stacked') {
      const blocks = sections(image, 'section')
      assert.equal(blocks.length, 2)
      for (const [index, condition] of ['unblocked', 'blocked'].entries()) {
        assert.match(clean(blocks[index]), index ? /対象を自身でブロック/ : /未ブロック/)
        assert.deepEqual(canonicalWinners(winnerCells(blocks[index])),
          canonicalWinners(winnerCells(markup).filter(cell => cell.column.endsWith(`:${condition}`))))
      }
    }
    assert.doesNotMatch(image, /<button\b|<select\b|NaN|Infinity|undefined/)
    assertTableGrid(image)
  }
  const common = render({ ...source, series: source.series.filter(item => item.moduleStageId === 'x:lv3') })
  assert.equal(winnerCells(common).length, 6)
  assert.ok(winnerCells(common).every(cell => cell.column.startsWith('remnant:common:') && cell.value === 'X3'))
  assert.deepEqual(source, before)
})

test('winner ties remain explicit and missing candidates invalidate only the affected state and condition', () => {
  const tiedStates = structuredClone(states)
  const active = tiedStates.find(state => state.remnantActive)
  const unblocked = active.blockingComparison.find(condition => !condition.blocking)
  unblocked.series.find(item => item.moduleStageId === 'y:lv3').points[0].value = 120
  const source = { ...data, displayMode: 'winner', winnerStages, remnantComparison: tiedStates }
  const markup = render(source)
  const target = cells => cells.find(cell => cell.row === '1' && cell.column === 'remnant:on:pot1:unblocked')
  assert.equal(target(winnerCells(markup)).value, 'X3＝Y3')
  unblocked.series = unblocked.series.filter(item => item.moduleStageId !== 'y:lv3')
  const missing = winnerCells(render(source))
  assert.equal(target(missing).value, '—')
  assert.equal(missing.find(cell => cell.row === '1' && cell.column === 'remnant:off:pot1:unblocked').value, 'X3')
  assert.equal(missing.find(cell => cell.row === '1' && cell.column === 'remnant:on:pot1:blocked').value, 'Y3')
})
