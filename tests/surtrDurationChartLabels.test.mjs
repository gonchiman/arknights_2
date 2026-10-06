import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let chart
let series
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-duration-label-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error', server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  chart = await server.ssrLoadModule('/src/components/SurtrDurationChart.tsx')
  const { calculateSurtrDuration } = await server.ssrLoadModule('/src/lib/surtrDuration.ts')
  const model = { moduleId: '', moduleType: null, moduleLevel: 0,
    skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3', calculationKind: 'tick-estimate',
    baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916, activationDelay: .6,
    drainInterval: .2, rampDuration: 60, maxDrainRate: .2, remnantDuration: 8 }
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
