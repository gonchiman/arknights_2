import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let attacks
let expectations
let dps
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/chart-image-label-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error', server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  attacks = await server.ssrLoadModule('/src/components/SurtrRemnantAttackChartImage.tsx')
  expectations = await server.ssrLoadModule('/src/components/SurtrRemnantExpectationChartImage.tsx')
  dps = await server.ssrLoadModule('/src/components/SurtrDpsChart.tsx')
})
after(async () => { await server?.close() })

const model = {
  moduleId: '', moduleType: null, moduleLevel: 0, attackIntervalBefore: 1.25, attackIntervalAfter: 1.25,
  remnantDuration: 8, attackSpeedBefore: 100, attackSpeedAfter: 100,
}
const series = [
  { id: 'none', label: '未装備', color: '#737982', model },
  { id: 'X', label: 'MOD X Lv.3', color: '#3f7699', model: { ...model, moduleType: 'X', moduleLevel: 3,
    attackIntervalBefore: 1.25 / 1.08, attackIntervalAfter: 1.25 / 1.08 } },
  { id: 'Y', label: 'MOD Y Lv.3', color: '#b4763e', model: { ...model, moduleType: 'Y', moduleLevel: 3,
    remnantDuration: 9, attackIntervalAfter: 1.25 / 1.3 } },
]
const common = { id: 'labels-test', potential: 1, blocking: false,
  assumptions: { windup: .3, ctCarry: 'time', includeRetreatHit: false } }
const labels = { title: '素質2の比較', xAxis: '横の指標', yAxis: '縦の指標',
  series: { none: '装備なし', X: 'AFT-X', Y: 'AFT-Y' } }
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const marks = markup => [...markup.matchAll(/<(?:rect|path)[^>]*class="(?:surtr-remnant-attack-chart-(?:bar|step|band)|surtr-dps-chart-(?:bar|line))"[^>]*>/g)]
  .map(match => match[0])

test('all attack-count images and previews use custom text without renaming source series or recoloring marks', () => {
  const unchanged = structuredClone(series)
  for (const kind of ['grouped-bar', 'step', 'bands']) {
    const props = { ...common, series, kind, samples: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1, 1.1],
      step: .1, ctLimit: 1.15, showValues: true, showBoundaries: false }
    for (const component of [attacks.SurtrRemnantAttackChartImage, attacks.SurtrRemnantAttackChartImagePreview]) {
      const original = render(component, props)
      const edited = render(component, { ...props, labels })
      for (const text of ['素質2の比較', '横の指標', '縦の指標', '装備なし', 'AFT-X', 'AFT-Y']) assert.ok(edited.includes(text), `${kind}: ${text}`)
      assert.doesNotMatch(edited, /MOD X Lv\.3|MOD Y Lv\.3/)
      for (const color of series.map(item => item.color)) assert.ok(edited.includes(color))
      if (kind !== 'bands') assert.deepEqual(marks(edited), marks(original), `${kind} short-label plot geometry`)
    }
  }
  assert.deepEqual(series, unchanged)
})

test('damage expectation labels affect only exported presentation, retaining every plotted value', () => {
  const points = [0, 20, 40, 60, 80, 100].map(x => ({ x, value: 20000 - x * 150 }))
  const plotted = series.map(({ model: _, ...item }) => ({ ...item, points }))
  for (const kind of ['bar', 'line']) {
    for (const aspectRatio of [undefined, 16 / 9]) {
      for (const component of [expectations.SurtrRemnantExpectationChartImage, expectations.SurtrRemnantExpectationChartImagePreview]) {
        const props = { ...common, series: plotted, kind, resistances: points.map(point => point.x), resistanceStep: 20,
          showValues: true, showResistanceRanks: true, digits: 0, aspectRatio }
        const original = render(component, props)
        const edited = render(component, { ...props, labels })
        for (const text of ['素質2の比較', '横の指標', '縦の指標', '装備なし', 'AFT-X', 'AFT-Y']) assert.ok(edited.includes(text))
        assert.deepEqual(marks(edited), marks(original))
        assert.ok(edited.includes('data-resistance-ranks="header"'))
      }
    }
  }
  assert.equal(plotted[1].label, 'MOD X Lv.3')
  assert.equal(plotted[1].points, points)
})

test('entered markup is displayed as text and blank edits restore defaults', () => {
  const props = { ...common, series, kind: 'grouped-bar', samples: [0, .1], step: .1, ctLimit: 1.15,
    showValues: true, showBoundaries: false }
  const encoded = render(attacks.SurtrRemnantAttackChartImage, { ...props,
    labels: { title: '<script>title</script>', series: { X: '<img onerror="run">' } } })
  assert.ok(encoded.includes('&lt;script&gt;title&lt;/script&gt;'))
  assert.ok(encoded.includes('&lt;img onerror=&quot;run&quot;&gt;'))
  assert.doesNotMatch(encoded, /<script>|<img/)
  assert.equal(render(attacks.SurtrRemnantAttackChartImage, { ...props,
    labels: { title: ' ', xAxis: '', yAxis: '\n', series: { X: '' } } }), render(attacks.SurtrRemnantAttackChartImage, props))
})

test('S3 image text editing preserves bar and line values, colors and metric defaults', () => {
  const plotted = series.map(({ model: _, ...item }) => ({ ...item,
    points: [0, 20, 40, 60, 80, 100].map(x => ({ x, value: 3000 - 20 * x })) }))
  const unchanged = structuredClone(plotted)
  for (const [metric, axis] of [['total', 'DPS'], ['difference', 'DPS差分'], ['percent', '増減率（%）']]) {
    assert.equal(dps.getSurtrDpsImageLabelDefaults(plotted, 'S3比較', metric).yAxis, axis)
    for (const kind of ['bar', 'line']) {
      for (const component of [dps.SurtrDpsChartImage, dps.SurtrDpsChartImagePreview]) {
        const props = { series: plotted, title: 'S3比較', kind, metric, barStep: 20, conditions: '特化3', showValues: true }
        const original = render(component, props)
        const edited = render(component, { ...props, labels })
        for (const text of ['素質2の比較', '横の指標', '縦の指標', '装備なし', 'AFT-X', 'AFT-Y']) assert.ok(edited.includes(text))
        assert.deepEqual(marks(edited), marks(original))
        for (const color of plotted.map(item => item.color)) assert.ok(edited.includes(color))
        assert.equal(render(component, { ...props, labels: { title: '', xAxis: ' ', yAxis: '\n', series: { X: '' } } }), original)
      }
    }
  }
  assert.deepEqual(plotted, unchanged)
})
