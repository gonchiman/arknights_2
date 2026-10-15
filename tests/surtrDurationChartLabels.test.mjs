import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let chart
let series
let calculateSurtrDurationCombat
const model = { moduleId: '', moduleType: null, moduleLevel: 0,
  skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3', calculationKind: 'tick-estimate',
  baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916, activationDelay: .6,
  drainInterval: .2, rampDuration: 60, maxDrainRate: .2, remnantDuration: 8 }
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-duration-label-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error', server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  chart = await server.ssrLoadModule('/src/components/SurtrDurationChart.tsx')
  const { calculateSurtrDuration } = await server.ssrLoadModule('/src/lib/surtrDuration.ts')
  ;({ calculateSurtrDurationCombat } = await server.ssrLoadModule('/src/lib/surtrDurationCombat.ts'))
  const result = calculateSurtrDuration(model)
  const extendedResult = calculateSurtrDuration({ ...model, remnantDuration: 9 })
  assert.ok(result)
  assert.ok(extendedResult)
  series = [
    { id: 'none', label: '未装備', color: '#737982', ...result },
    { id: 'Y', label: 'MOD Y Lv.3', color: '#b4763e', ...extendedResult },
  ]
})
after(async () => { await server?.close() })

const title = 'スルト S3 HPの推移（推定）'
const conditions = '特化3・潜在1・外部回復なし'
const labels = { title: '余燼までの生存時間', xAxis: '経過秒数', yAxis: '残り体力',
  series: { none: '装備なし', Y: 'HP装備' } }
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const lineMarks = markup => [...markup.matchAll(/<path class="surtr-duration-chart-line"[^>]*>/g)].map(match => match[0])

test('hiding another comparison line does not change a supplied line style identity', () => {
  const data = series.map((item, index) => ({ ...item, styleIndex: index + 3 }))
  const together = lineMarks(render(chart.SurtrDurationChartImage, { series: data, title, conditions }))
  const alone = lineMarks(render(chart.SurtrDurationChartImage, { series: [data[1]], title, conditions }))
  const dash = value => value.match(/stroke-dasharray="([^"]+)"/)?.[1]
  assert.equal(dash(together[1]), dash(alone[0]))
  assert.ok(dash(alone[0]))
})
const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(match => match[0])
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const eventGroups = markup => [...markup.matchAll(/<g\b[^>]*class="surtr-duration-chart-events"[^>]*>([\s\S]*?)<\/g>/g)].map(match => match[1])
const timeTicks = markup => [...markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
  .filter(match => attr(`<text ${match[1]}>`, 'class') === 'surtr-duration-chart-tick'
    && attr(`<text ${match[1]}>`, 'text-anchor') === 'middle').map(match => Number(match[2]))
const plotBounds = markup => {
  const path = tags(markup, 'path').find(tag => attr(tag, 'class') === 'surtr-duration-chart-axis')
  const [left, top, bottom, right] = attr(path, 'd').match(/[-\d.]+/g).map(Number)
  return { left, top, bottom, right }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)

test('duration image and preview share edited labels without altering source values, lines or colors', () => {
  const unchanged = structuredClone(series)
  for (const component of [chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    for (const aspectRatio of [undefined, 16 / 9]) {
      const props = { series, title, conditions, aspectRatio }
      const original = render(component, props)
      const edited = render(component, { ...props, labels })
      for (const text of ['余燼までの生存時間', '経過秒数', '残り体力', '装備なし', 'HP装備', '余燼発動', '退場']) {
        assert.ok(edited.includes(text), `${component.name}: ${text}`)
      }
      assert.doesNotMatch(edited, /MOD Y Lv\.3|HPの推移（推定）/)
      assert.deepEqual(lineMarks(edited), lineMarks(original))
      assert.equal(lineMarks(edited).length, series.length)
      for (const item of series) assert.ok(edited.includes(`stroke="${item.color}"`))
      assert.ok(edited.includes(conditions))
    }
  }
  assert.deepEqual(series, unchanged)
})

test('default names follow the snapshot title and blank edits restore identical export markup', () => {
  const defaults = chart.getSurtrDurationImageLabelDefaults(series, title)
  assert.equal(defaults.title, title)
  assert.equal(defaults.xAxis, 'S3発動からの時間（秒）')
  assert.equal(defaults.yAxis, 'HP（%）')
  assert.equal(defaults.series, series)
  const props = { series, title, conditions }
  const original = render(chart.SurtrDurationChartImage, props)
  assert.equal(render(chart.SurtrDurationChartImage, { ...props,
    labels: { title: ' ', xAxis: '\n', yAxis: '', series: { none: '', Y: ' ' } } }), original)
  assert.ok(original.includes('transform="translate(753 15)"'))
  assert.ok(original.includes('y1="48"'))
})

test('long value axis wraps before the event key while keeping every character and event label', () => {
  const longAxis = '発動直前の最大体力に対する現在の体力割合'.repeat(5).slice(0, 100)
  const markup = render(chart.SurtrDurationChartImage, { series, title, conditions, labels: { yAxis: longAxis } })
  const text = markup.match(/<text class="surtr-duration-chart-axis-title"[^>]*>(.*?)<\/text>/)?.[1]
  const lines = [...text.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map(match => match[1])
  assert.ok(lines.length > 1)
  assert.equal(lines.join(''), longAxis)
  for (const line of lines) assert.ok(Array.from(line).length * 14 <= 683)
  assert.ok(markup.includes('transform="translate(753 15)"'))
  assert.ok(markup.includes('余燼発動'))
  assert.ok(markup.includes('退場'))
})

test('export editing does not change the live duration chart and displays entered markup as text', () => {
  const props = { series, title, conditions }
  assert.equal(render(chart.SurtrDurationChart, { ...props, labels }), render(chart.SurtrDurationChart, props))
  const markup = render(chart.SurtrDurationChartImage, { ...props,
    labels: { title: '<script>title</script>', series: { none: '<img onerror="run">' } } })
  assert.ok(markup.includes('&lt;script&gt;title&lt;/script&gt;'))
  assert.ok(markup.includes('&lt;img onerror=&quot;run&quot;&gt;'))
  assert.doesNotMatch(markup, /<script>|<img/)
})

test('a capped healing result shows its bounded time domain without false zero-second Remnant or retreat events', () => {
  const result = calculateSurtrDurationCombat(model, [
    { id: 'healer', kind: 'heal', amount: 1e6, interval: .1, firstTime: 1, count: 1 },
  ], 12)
  assert.ok(result)
  assert.equal(result.remnantStart, null)
  assert.equal(result.retreatTime, null)
  assert.equal(result.endTime, 12)
  const captured = structuredClone(result)
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    const markup = render(component, { series: [{ id: 'healed', label: '回復あり', color: '#417b8c', ...result }], title, conditions })
    assert.equal(lineMarks(markup).length, 1)
    assert.match(markup, /計算範囲内に余燼未発動/)
    assert.match(markup, /計算範囲内に退場せず/)
    assert.deepEqual(eventGroups(markup), [''])
    assert.doesNotMatch(markup, /NaN|Infinity|undefined|null|余燼発動まで 0 秒|退場まで 0 秒/)
    assert.deepEqual(timeTicks(markup), [0, 5, 10, 15])
    const bounds = plotBounds(markup)
    const coordinates = attr(lineMarks(markup)[0], 'd').match(/[-\d.]+/g).map(Number)
    near(coordinates.at(-2), bounds.left + (bounds.right - bounds.left) * 12 / 15)
    near(coordinates.at(-1), bounds.top)
  }
  assert.deepEqual(result, captured)
})

test('a cap after Remnant keeps the real trigger but suppresses scheduled retreat beyond the plotted interval', () => {
  const result = calculateSurtrDurationCombat(model, [], 30)
  assert.ok(result)
  assert.equal(result.remnantStart, 25)
  assert.equal(result.retreatTime, 33)
  assert.equal(result.endTime, 30)
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    const markup = render(component, { series: [{ id: 'capped', label: '30秒まで', color: '#737982', ...result }], title, conditions })
    const [events] = eventGroups(markup)
    assert.match(events, /<circle\b/)
    assert.match(events, /余燼発動 25 秒/)
    assert.doesNotMatch(events, /<path\b|退場/)
    assert.match(markup, /計算範囲内に退場せず/)
    assert.doesNotMatch(markup, /NaN|Infinity|undefined|null|退場まで 33 秒/)
    assert.deepEqual(timeTicks(markup), [0, 5, 10, 15, 20, 25, 30])
    const coordinates = attr(lineMarks(markup)[0], 'd').match(/[-\d.]+/g).map(Number)
    near(coordinates.at(-2), plotBounds(markup).right)
  }
})

test('the selected point uses the selected line color rather than the first comparison color', () => {
  const markup = render(chart.SurtrDurationChart, { series, title,
    selection: { time: 10, hpPercent: 50, seriesId: 'Y' } })
  const marker = tags(markup, 'circle').find(tag => attr(tag, 'class') === 'surtr-duration-chart-selection-point')
  assert.ok(marker)
  assert.equal(attr(marker, 'fill'), series[1].color)
  assert.notEqual(attr(marker, 'fill'), series[0].color)
  assert.match(markup, /選択時刻 10 秒、HP 50%/)
})

test('eight comparison lines have distinct line patterns with matching legends on screen and in exports', () => {
  const many = Array.from({ length: 8 }, (_, index) => ({ ...series[0], id: `line-${index}`, label: `条件${index + 1}` }))
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    const markup = render(component, { series: many, title, conditions })
    const paths = lineMarks(markup)
    assert.equal(paths.length, 8)
    const patterns = paths.map(path => attr(path, 'stroke-dasharray') ?? 'solid')
    assert.equal(new Set(patterns).size, 8)
    const swatches = tags(markup, 'line').filter(tag => attr(tag, 'x1') === '0' && attr(tag, 'x2') === '18')
    assert.equal(swatches.length, 8)
    assert.deepEqual(swatches.map(tag => attr(tag, 'stroke-dasharray') ?? 'solid'), patterns)
    assert.ok(paths.every(path => attr(path, 'stroke') === series[0].color))
    for (const item of many) assert.ok(markup.includes(item.label))
  }
})
