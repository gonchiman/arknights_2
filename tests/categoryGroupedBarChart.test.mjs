import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let charts
let previews
let legacy
let legacyPreview
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/category-grouped-bar-chart-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  charts = await server.ssrLoadModule('/src/components/CategoryGroupedBarChart.tsx')
  previews = await server.ssrLoadModule('/src/components/CategoryGroupedBarImagePreview.tsx')
  legacy = await server.ssrLoadModule('/src/components/GoldenglowPerformanceGroupedBarChart.tsx')
  legacyPreview = await server.ssrLoadModule('/src/components/GoldenglowGroupedBarImagePreview.tsx')
})
after(async () => { await server?.close() })

const legend = [
  { id: 'none', label: '未装備', color: '#747980' },
  { id: 'X', label: 'MOD X', color: '#417797' },
  { id: 'Y', label: 'MOD Y', color: '#b5783d' },
]
const groups = [
  { id: 'none', label: '未装備', bars: [{ ...legend[0], value: 12000 }] },
  ...[1, 2, 3].map(level => ({ id: `level-${level}`, label: `Lv.${level}`,
    bars: [legend[1], legend[2]].map((item, index) => ({ ...item, value: 12000 + level * 1000 + index * 500 })) })),
]
const props = { groups, legend, categoryAxisLabel: 'MOD段階', metricLabel: '総ダメージ',
  valueAxisLabel: '累計ダメージ', conditionLabel: '術耐性60・素質2発動25秒',
  showValues: true, formatValue: value => value.toLocaleString('ja-JP') }
const render = (component, options) => renderToStaticMarkup(createElement(component, options))
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(match => match[0])
const bars = markup => tags(markup, 'rect').filter(tag => attr(tag, 'class') === 'gg-performance-grouped-bar')
const finiteGeometry = markup => assert.doesNotMatch(markup, /NaN|Infinity|undefined/)

test('variable-size categories preserve values, colors and order with a common bar width', () => {
  const snapshot = structuredClone(groups)
  for (const imageOutput of [false, true]) {
    for (const aspectRatio of [undefined, 16 / 9]) {
      const markup = render(charts.CategoryGroupedBarChart, { ...props, imageOutput, aspectRatio })
      const renderedBars = bars(markup)
      assert.equal(renderedBars.length, 7, 'unequipped has one bar, each module stage has two')
      assert.deepEqual(renderedBars.map(tag => attr(tag, 'fill')), groups.flatMap(group => group.bars.map(bar => bar.color)))
      assert.equal(new Set(renderedBars.map(tag => attr(tag, 'width'))).size, 1)
      for (const group of groups) {
        for (const bar of group.bars) {
          assert.ok(markup.includes(`${bar.label}・MOD段階 ${group.label}・総ダメージ ${props.formatValue(bar.value)}`))
        }
      }
      assert.match(markup, /累計ダメージ/)
      assert.match(markup, /術耐性60・素質2発動25秒/)
      assert.doesNotMatch(markup, /敵の術耐性/)
      finiteGeometry(markup)
    }
  }
  assert.deepEqual(groups, snapshot)
})

test('missing results stay missing, zero remains visible, and negative values require difference mode', () => {
  const unusual = [{ id: 'a', label: 'Lv.1', bars: [null, NaN, Infinity, -5, 0, 5]
    .map((value, index) => ({ id: String(index), label: `条件${index}`, color: '#777', value })) }]
  for (const difference of [false, true]) {
    const markup = render(charts.CategoryGroupedBarChart, { ...props, groups: unusual, difference })
    assert.equal(bars(markup).length, difference ? 3 : 2)
    assert.ok(markup.includes('条件4・MOD段階 Lv.1・総ダメージ 0'))
    assert.ok(markup.includes(`条件3・MOD段階 Lv.1・総ダメージ ${difference ? '-5' : '—'}`))
    assert.ok(bars(markup).every(tag => Number(attr(tag, 'height')) >= 2))
    finiteGeometry(markup)
  }
  finiteGeometry(render(charts.CategoryGroupedBarChart, { ...props, groups: [] }))
})

test('a denser value axis keeps zero and data-derived bounds without changing the default axis', () => {
  const groups = [{ id: 'stage', label: 'Lv.3', bars: [{ ...legend[1], value: 103733 }] }]
  for (const imageOutput of [false, true]) {
    const options = { ...props, groups, imageOutput }
    const standard = render(charts.CategoryGroupedBarChart, options)
    const dense = render(charts.CategoryGroupedBarChart, { ...options, valueTickCount: 6 })
    assert.match(standard, />150,000<\/text>/)
    assert.match(dense, />120,000<\/text>/)
    assert.match(dense, />0<\/text>/)
    assert.match(dense, />103,733<\/text>/)
    assert.doesNotMatch(dense, />150,000<\/text>/)
    finiteGeometry(dense)
  }
})

test('resistance chart adapter preserves input order, missing readings, references and plotted geometry', () => {
  const resistances = [80, 0, 40]
  const columns = legend.slice(1).map((item, index) => ({ ...item,
    values: [0, 80].map(resistance => ({ resistance, expectedTotalDamage: 1000 + resistance * 10 + index })) }))
  const options = { columns, resistances, metricLabel: '総ダメージ期待値',
    valueAxisLabel: 'ダメージ', showValues: true, integerTicks: true,
    referenceY: { value: 1500, label: '基準 1,500' }, formatValue: props.formatValue }
  for (const imageOutput of [false, true]) {
    const markup = render(legacy.GoldenglowPerformanceGroupedBarChart, { ...options, imageOutput })
    const generic = render(charts.CategoryGroupedBarChart, {
      ...props, metricLabel: options.metricLabel, valueAxisLabel: options.valueAxisLabel,
      categoryAxisLabel: '敵の術耐性', legend: columns, integerTicks: true,
      referenceY: options.referenceY, imageOutput,
      groups: resistances.map(resistance => ({ id: String(resistance), label: String(resistance),
        bars: columns.map(column => ({ ...column,
          value: column.values.find(value => value.resistance === resistance)?.expectedTotalDamage ?? null })) })),
    })
    assert.deepEqual(bars(markup), bars(generic))
    assert.equal(bars(markup).length, 4)
    assert.ok(markup.includes('MOD X・敵の術耐性 40・総ダメージ期待値 —'))
    assert.match(markup, /基準 1,500/)
    const ticks = [...markup.matchAll(/class="gg-performance-grouped-tick"[^>]*aria-hidden="true">([^<]*)<\/text>/g)].map(match => match[1])
    assert.deepEqual(ticks, ['80', '0', '40'])
    finiteGeometry(markup)
  }
  const preview = render(legacyPreview.GoldenglowGroupedBarImagePreview, { chartProps: options, aspectRatio: 16 / 9 })
  assert.equal(bars(preview).length, 4)
  assert.match(preview, /プレビュー/)
  finiteGeometry(preview)
})

test('generic image preview renders the same bars as image output with string category names', () => {
  const long = { ...props, metricLabel: 'スルト S3 MOD段階別総ダメージ',
    conditionLabel: '特化3・敵を自身でブロック・術耐性60・素質2発動まで25秒' }
  for (const aspectRatio of [undefined, 16 / 9]) {
    const image = render(charts.CategoryGroupedBarChart, { ...long, imageOutput: true, aspectRatio })
    const preview = render(previews.CategoryGroupedBarImagePreview, { chartProps: long, aspectRatio })
    assert.deepEqual(bars(preview), bars(image))
    assert.ok(preview.includes(long.metricLabel))
    assert.ok(preview.includes(long.conditionLabel))
    assert.match(preview, /Lv\.3/)
    finiteGeometry(preview)
  }
})
