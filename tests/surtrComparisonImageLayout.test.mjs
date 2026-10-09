import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Image, helpers
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-comparison-image-layout-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false }, appType: 'custom' })
  ;({ SurtrUnequippedComparisonTableImage: Image } = await server.ssrLoadModule('/src/components/SurtrUnequippedComparisonTableImage.tsx'))
  helpers = await server.ssrLoadModule('/src/lib/surtrComparisonImageLayout.ts')
})
after(async () => { await server?.close() })

const values = { none: 100, 'x:lv1': 110, 'x:lv2': 120, 'x:lv3': 150, 'y:lv1': 120, 'y:lv2': 140, 'y:lv3': 180 }
const make = (stage, potential, blocked = false) => {
  const value = values[stage] + (potential === 6 ? stage === 'none' ? 20 : 40 : 0)
    + (blocked && stage !== 'none' ? stage.startsWith('x:') ? 5 : 30 : 0)
  return { id: `${stage}:pot${potential}`, moduleStageId: stage, potential,
    label: `${stage === 'none' ? '未装備' : `MOD ${stage[0].toUpperCase()} Lv.${stage.at(-1)}`} 潜在${potential}`,
    color: stage === 'none' ? '#737982' : stage.startsWith('x:') ? '#3f7699' : '#b4763e',
    points: [{ x: 0, value }, { x: 50, value: value / 2 }] }
}
const selected = ['x:lv1', 'x:lv3', 'y:lv2', 'y:lv3'].flatMap(stage => [1, 6].map(potential => make(stage, potential)))
const refs = blocked => Object.keys(values).flatMap(stage => [1, 6].map(potential => make(stage, potential, blocked)))
const snapshot = { series: selected, baseline: make('none', 1), referenceSeries: refs(false),
  resistances: [0, 50], precision: 1, metric: 'percent', layout: 'comparison', colorScale: true,
  blockingComparison: [true, false].map(blocking => ({ blocking, series: selected.map(item => make(item.moduleStageId, item.potential, blocking)).reverse(),
    baseline: make('none', 1), referenceSeries: refs(blocking).reverse() })),
  metadata: { skillLabel: '特化3', level: 90, trust: 100, potential: 1, potentials: [1, 6], blocking: false, remnantActive: true } }
const render = data => renderToStaticMarkup(createElement(Image, data))
const clean = source => source.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const sections = (source, tag) => [...source.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map(match => match[1])
const rows = source => sections(source, 'tr').map(row => [...row.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => clean(cell[1])))
const bodyRows = source => sections(source, 'tbody').flatMap(rows)
const numeric = row => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => clean(cell[1]))
const formatted = (value, metric, raw = false) => {
  const number = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1,
    signDisplay: raw || metric === 'ratio' ? 'auto' : 'exceptZero' }).format(Number(value.toFixed(1)))
  return number + (!raw && metric !== 'difference' ? '%' : '')
}
// Independent oracle: never call the production comparison or formatting helpers.
const expectedCells = (data, item, blocked, resistance) => {
  const raw = make(item.moduleStageId, item.potential, blocked).points.find(point => point.x === resistance).value
  const baseStage = data.comparisonBase === 'previous' ? item.moduleStageId.endsWith('lv1') ? 'none'
    : item.moduleStageId.replace(/lv([23])$/, (_, level) => `lv${Number(level) - 1}`)
    : data.comparisonBase === 'potential-1' ? item.moduleStageId : 'none'
  const basePotential = data.comparisonBase === 'potential-1' ? 1 : item.potential
  const base = make(baseStage, basePotential, blocked).points.find(point => point.x === resistance).value
  const value = data.metric === 'difference' ? raw - base : data.metric === 'ratio' ? raw / base * 100 : (raw / base - 1) * 100
  return [...(data.layout === 'combined' ? [formatted(raw, data.metric, true)] : []), formatted(value, data.metric)]
}

for (const imageLayout of ['transpose', 'stacked', 'split']) {
  test(`${imageLayout} preserves exact values for every metric, format, base and column order with two potentials`, () => {
    for (const metric of ['difference', 'ratio', 'percent']) for (const layout of ['combined', 'comparison']) {
      for (const comparisonBase of ['unequipped', 'previous', 'potential-1']) for (const columnOrder of ['module', 'blocking']) {
        const data = { ...snapshot, imageLayout, moduleLevel: imageLayout === 'split' ? 3 : undefined, metric, layout, comparisonBase, columnOrder }
        const markup = render(data)
        const displayed = imageLayout === 'split' ? selected.filter(item => item.moduleStageId.endsWith('lv3')) : selected
        if (imageLayout === 'transpose') {
          const targetRows = sections(markup, 'tbody').flatMap(source => sections(source, 'tr')).filter(row => /data-blocking=/.test(row))
          const order = columnOrder === 'blocking' ? [false, true].flatMap(blocked => displayed.map(item => ({ item, blocked })))
            : displayed.flatMap(item => [false, true].map(blocked => ({ item, blocked })))
          assert.deepEqual(targetRows.map(numeric), order.map(({ item, blocked }) => data.resistances.flatMap(resistance => expectedCells(data, item, blocked, resistance))))
          assert.equal(bodyRows(markup).length, displayed.length * 2 + (layout === 'combined' && comparisonBase === 'unequipped' ? 2 : 0))
          assert.match(markup, /術耐性 0/)
          assert.match(markup, /術耐性 50/)
        } else {
          const bodies = sections(markup, 'tbody')
          const order = columnOrder === 'blocking' ? [false, true].flatMap(blocked => displayed.map(item => ({ item, blocked })))
            : displayed.flatMap(item => [false, true].map(blocked => ({ item, blocked })))
          assert.equal(bodies.length, imageLayout === 'stacked' ? 2 : 1)
          for (let table = 0; table < bodies.length; table += 1) {
            const cells = imageLayout === 'stacked' ? displayed.map(item => ({ item, blocked: table === 1 })) : order
            const expected = data.resistances.map(resistance => [String(resistance),
              ...(layout === 'combined' && comparisonBase === 'unequipped' ? [1, 6].map(potential => formatted(make('none', potential).points.find(point => point.x === resistance).value, metric, true)) : []),
              ...cells.flatMap(({ item, blocked }) => expectedCells(data, item, blocked, resistance))])
            assert.deepEqual(rows(bodies[table]), expected, JSON.stringify({ imageLayout, comparisonBase, metric, layout, columnOrder, table }))
          }
        }
        assert.equal((clean(markup).match(/S3 特化3/g) ?? []).length, 1, 'One shared condition footer')
        assert.doesNotMatch(markup, /<button|<select|NaN|Infinity|undefined/)
        for (const item of displayed) assert.ok(markup.includes(`background-color:${item.color}`))
      }
    }
  })
}

test('rank options remain complete and preserve exact rank boundaries after transposing', () => {
  for (const rankMode of ['none', 'inline', 'merged']) {
    const markup = render({ ...snapshot, imageLayout: 'transpose', rankMode })
    const bodies = sections(markup, 'tbody')
    assert.equal(rows(bodies[0]).length, 16)
    assert.match(markup, /術耐性 0/)
    assert.match(markup, /術耐性 50/)
    if (rankMode === 'none') assert.doesNotMatch(markup, /術耐性ランク/)
    else assert.match(markup, /術耐性ランク E、0/)
    if (rankMode === 'merged') assert.match(markup, /50\s+以上\s+60\s+未満/)
  }
})

test('stage pages retain hidden previous and fixed-potential references and do not invent empty levels', () => {
  const data = { ...snapshot, series: selected.filter(item => item.moduleStageId.endsWith('lv3') && item.potential === 6) }
  assert.deepEqual(helpers.getSurtrComparisonImageStageLevels(data), [3])
  assert.throws(() => helpers.getSurtrComparisonImageStageSnapshot(data, 2), /この段階はありません/)
  for (const comparisonBase of ['previous', 'potential-1']) {
    const full = { ...data, comparisonBase }
    const captured = structuredClone(full)
    const split = helpers.getSurtrComparisonImageStageSnapshot(full, 3)
    assert.equal(split.series.length, 2)
    assert.ok(split.referenceSeries.some(item => item.id === 'x:lv2:pot6'))
    assert.ok(split.referenceSeries.some(item => item.id === 'x:lv3:pot1'))
    const originalColumns = helpers.buildSurtrComparisonImageColumns(full)
    assert.deepEqual(helpers.buildSurtrComparisonImageColumns(split).map(column => [...column.comparison]), originalColumns.map(column => [...column.comparison]))
    assert.deepEqual(full, captured)
  }
})

test('a selected unequipped fixed-potential target remains present in every available stage image', () => {
  const data = { ...snapshot, comparisonBase: 'potential-1', series: [make('none', 6), ...selected] }
  assert.deepEqual(helpers.getSurtrComparisonImageStageLevels(data), [1, 2, 3])
  for (const level of [1, 2, 3]) {
    const split = helpers.getSurtrComparisonImageStageSnapshot(data, level)
    assert.ok(split.series.some(item => item.id === 'none:pot6'))
    assert.ok(split.series.every(item => item.moduleStageId === 'none' || item.moduleStageId.endsWith(`lv${level}`)))
  }
  assert.deepEqual(helpers.getSurtrComparisonImageStageLevels({ ...data, series: [make('none', 6)] }), [])
})

test('stacked and split images keep the full table color scale instead of renormalizing subsets', () => {
  const data = { ...snapshot, metric: 'difference' }
  const maximum = helpers.getSurtrComparisonImageColorScaleMaximum(data)
  assert.equal(maximum, 130)
  for (const level of [1, 2, 3]) {
    const split = helpers.getSurtrComparisonImageStageSnapshot(data, level)
    assert.equal(split.colorScaleMaximum, maximum)
    assert.equal(helpers.getSurtrComparisonImageColorScaleMaximum(split), maximum)
  }
  const colors = markup => [...markup.matchAll(/data-series-id="([^"]+)" data-blocking="(true|false)"[^>]*style="--surtr-comparison-cell-background:([^";]+)/g)]
    .map(match => [match[1], match[2], match[3]])
  const fullColors = colors(render(data))
  const splitColors = colors(render({ ...data, imageLayout: 'split', moduleLevel: 1 }))
  assert.deepEqual(splitColors, fullColors.filter(([id]) => id.includes(':lv1:')))
  const stackedMarkup = render({ ...data, imageLayout: 'stacked' })
  assert.ok(stackedMarkup.includes(fullColors.find(([id, blocked]) => id === 'x:lv1:pot1' && blocked === 'false')[2]))
})

test('all new layouts leave an omitted layout and shared expected-damage consumers unchanged', () => {
  for (const quantity of ['dps', 'expected-damage']) {
    const data = { ...snapshot, quantity }
    assert.equal(render(data), render({ ...data, imageLayout: 'current' }))
  }
})

test('paired numeric columns use explicit col widths so PNG cloning cannot multiply a colgroup width', () => {
  // html-to-image inlines computed styles. A fixed table's span=2 colgroup
  // would acquire the pair's total width, then apply that width to each col.
  for (const imageLayout of ['transpose', 'stacked']) {
    const markup = render({ ...snapshot, layout: 'combined', imageLayout })
    const groups = [...markup.matchAll(/<colgroup([^>]*)>([\s\S]*?)<\/colgroup>/g)]
    assert.ok(groups.length > 0)
    assert.ok(groups.every(group => !/span="(?:[2-9]|\d\d+)"/i.test(group[1])))
    assert.ok(groups.some(group => (group[2].match(/<col\b/g) ?? []).length === 2))
  }
})
