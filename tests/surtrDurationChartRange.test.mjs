import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, chart, calculateSurtrDurationCombat
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite/surtr-duration-range-test',
    resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  chart = await server.ssrLoadModule('/src/components/SurtrDurationChart.tsx')
  ;({ calculateSurtrDurationCombat } = await server.ssrLoadModule('/src/lib/surtrDurationCombat.ts'))
})
after(async () => { await server?.close() })

const makeSeries = (patch = {}) => ({ id: 'baseline', label: '未装備', color: '#737982',
  remnantStart: 25, remnantDuration: 8, retreatTime: 33, endTime: 33,
  points: [
    { time: 0, hpPercent: 100, phase: 'activation' },
    { time: 20, hpPercent: 30, phase: 'drain' },
    { time: 25, hpPercent: 1, phase: 'remnant' },
    { time: 27, hpPercent: 20, phase: 'remnant' },
    { time: 33, hpPercent: 0, phase: 'remnant' },
  ], ...patch })
const render = (component, props = {}) => renderToStaticMarkup(createElement(component, {
  series: [makeSeries()], title: 'スルト S3 HPの推移（推定）', conditions: '特化3', ...props,
}))
const tags = (markup, tag) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(match => match[0])
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
const pathCoordinates = markup => tags(markup, 'path').filter(tag => attr(tag, 'class') === 'surtr-duration-chart-line')
  .map(tag => attr(tag, 'd').match(/[-\d.]+/g).map(Number))
const bounds = markup => {
  const axis = tags(markup, 'path').find(tag => attr(tag, 'class') === 'surtr-duration-chart-axis')
  const [left, top, bottom, right] = attr(axis, 'd').match(/[-\d.]+/g).map(Number)
  return { left, top, bottom, right }
}
const ticks = markup => [...markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
  .filter(match => attr(`<text ${match[1]}>`, 'class') === 'surtr-duration-chart-tick'
    && attr(`<text ${match[1]}>`, 'text-anchor') === 'middle').map(match => Number(match[2]))
const eventGroups = markup => [...markup.matchAll(/<g\b[^>]*class="surtr-duration-chart-events"[^>]*>([\s\S]*?)<\/g>/g)].map(match => match[1])
const directLabels = markup => [...markup.matchAll(/<g\b[^>]*class="surtr-duration-chart-trigger-label"[^>]*>([\s\S]*?)<\/g>/g)]
  .map(match => {
    const textTag = tags(match[1], 'text')[0]
    const value = match[1].match(/<text\b[^>]*>([\s\S]*?)<\/text>/)?.[1].replace(/<title>[\s\S]*?<\/title>/, '')
    return { x: Number(attr(textTag, 'x')), y: Number(attr(textTag, 'y')), value }
  })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)

test('screen, PNG and preview connect self-drain while preserving every external jump and trigger order', () => {
  const model = { moduleId: '', moduleType: null, moduleLevel: 0,
    skillName: 'ラグナロク', skillLevelIndex: 9, skillLevelLabel: '特化3', calculationKind: 'tick-estimate',
    baseMaxHp: 2916, skillHpBonus: 5000, maxHp: 7916, activationDelay: .6,
    drainInterval: .2, rampDuration: 60, maxDrainRate: .2, remnantDuration: 8 }
  const result = calculateSurtrDurationCombat(model, [
    { id: 'enemy', kind: 'damage', amount: 2000, interval: 1, firstTime: 1, count: 1 },
    { id: 'healer', kind: 'heal', amount: 250, interval: 1, firstTime: 1, count: 1 },
  ], 30)
  assert.ok(result)
  assert.equal(result.remnantStart, 5)
  assert.equal(result.retreatTime, 13)
  const series = [{ id: 'combat', label: '敵と回復あり', color: '#417b8c', ...result }]
  const original = structuredClone(series)
  const triggerEventIndex = result.events.findIndex(event => event.kind === 'remnant-start')
  assert.ok(triggerEventIndex > 0)
  assert.equal(result.events[triggerEventIndex + 1].kind, 'heal', 'the trigger shares a timestamp with later healing')
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    for (const range of ['remnant', 'retreat']) {
      const markup = render(component, { series, range })
      const plot = bounds(markup)
      const maximumTime = ticks(markup).at(-1)
      const coordinates = pathCoordinates(markup)[0]
      const points = Array.from({ length: coordinates.length / 2 }, (_, index) => ({ x: coordinates[index * 2], y: coordinates[index * 2 + 1] }))
      const x = time => plot.left + time / maximumTime * (plot.right - plot.left)
      const y = hpPercent => plot.bottom - hpPercent / 100 * (plot.bottom - plot.top)
      const close = (left, right) => Math.abs(left - right) < 1e-8
      const hasVerticalSegment = (time, before, after) => points.some((point, index) => index > 0
        && close(points[index - 1].x, x(time)) && close(point.x, x(time))
        && close(points[index - 1].y, y(before)) && close(point.y, y(after)))
      const events = range === 'remnant' ? result.events.slice(0, triggerEventIndex + 1) : result.events
      const external = events.filter(event => ['damage', 'heal'].includes(event.kind) && event.appliedAmount > 0)
      assert.ok(external.length >= 9)
      for (const event of external) {
        assert.ok(hasVerticalSegment(event.time, event.hpBefore / event.maxHp * 100, event.hpAfter / event.maxHp * 100),
          `${component.name}/${range}: preserve ${event.kind} at ${event.time}`)
      }
      const drains = events.filter(event => event.kind === 'drain' && event.appliedAmount > 0)
      assert.ok(drains.length > 15)
      for (const event of drains) {
        assert.equal(hasVerticalSegment(event.time, event.hpBefore / event.maxHp * 100, event.hpAfter / event.maxHp * 100), false,
          `${component.name}/${range}: smooth self-drain at ${event.time}`)
      }
      const endpointTime = range === 'remnant' ? result.remnantStart : result.endTime
      near(points.at(-1).x, x(endpointTime))
      const trigger = tags(eventGroups(markup)[0], 'circle')[0]
      near(Number(attr(trigger, 'cx')), x(result.remnantStart))
      near(Number(attr(trigger, 'cy')), y(1 / model.maxHp * 100))
      if (range === 'remnant') {
        near(points.at(-1).y, y(1 / model.maxHp * 100))
        assert.deepEqual(directLabels(markup).map(label => label.value), ['5秒'])
      } else {
        near(points.at(-1).y, y(result.points.at(-1).hpPercent))
        assert.match(eventGroups(markup)[0], /退場 13 秒/)
      }
    }
  }
  assert.deepEqual(series, original)
})

test('live chart, PNG and preview stop at Remnant with matching endpoint times and no retreat marks', () => {
  const series = [makeSeries()]
  const before = structuredClone(series)
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    for (const aspectRatio of [undefined, 16 / 9]) {
      const markup = render(component, { series, range: 'remnant', aspectRatio })
      assert.match(markup, /data-duration-range="remnant"/)
      assert.deepEqual(ticks(markup), [0, 5, 10, 15, 20, 25])
      const [coordinates] = pathCoordinates(markup)
      assert.equal(coordinates.length, 6, 'only pre-trigger points and the first trigger remain')
      near(coordinates.at(-2), bounds(markup).right)
      near(coordinates.at(-1), bounds(markup).bottom - (bounds(markup).bottom - bounds(markup).top) / 100)
      assert.match(eventGroups(markup)[0], /<circle\b/)
      assert.doesNotMatch(eventGroups(markup)[0], /<path\b|退場/)
      assert.doesNotMatch(markup, /退場|余燼中/)
      assert.match(markup, /余燼発動まで 25 秒/)
      assert.deepEqual(directLabels(markup).map(item => item.value), ['25秒'])
      const labelText = tags(markup.match(/class="surtr-duration-chart-trigger-label"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? '', 'text')[0]
      assert.equal(attr(labelText, 'paint-order'), 'stroke', 'PNG cloning must preserve fill over the white text outline')
    }
  }
  assert.deepEqual(series, before)
})

test('retreat option preserves the full path, event key and original component default', () => {
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    const original = render(component)
    const explicit = render(component, { range: 'retreat' })
    assert.equal(explicit, original)
    assert.match(explicit, /data-duration-range="retreat"/)
    assert.equal(pathCoordinates(explicit)[0].length, 10)
    assert.deepEqual(ticks(explicit), [0, 5, 10, 15, 20, 25, 30, 35])
    assert.match(eventGroups(explicit)[0], /<circle\b/)
    assert.match(eventGroups(explicit)[0], /<path\b/)
    assert.match(explicit, /退場まで 33 秒/)
    assert.deepEqual(directLabels(explicit), [])
  }
})

test('range is independent per comparison series, including no trigger and truncated later retreat', () => {
  const series = [makeSeries(), makeSeries({ id: 'late', label: '回復あり', remnantStart: 42,
    retreatTime: 50, endTime: 45, points: [{ time: 0, hpPercent: 100 }, { time: 42, hpPercent: 1 }, { time: 45, hpPercent: 8 }] })]
  const markup = render(chart.SurtrDurationChartImage, { series, range: 'remnant' })
  assert.equal(ticks(markup).at(-1), 45)
  const coordinates = pathCoordinates(markup)
  const plot = bounds(markup)
  near(coordinates[0].at(-2), plot.left + (plot.right - plot.left) * 25 / 45)
  near(coordinates[1].at(-2), plot.left + (plot.right - plot.left) * 42 / 45)
  assert.deepEqual(directLabels(markup).map(item => item.value), ['25秒', '42秒'])
  const noTrigger = makeSeries({ id: 'healed', label: '未発動の条件', remnantStart: null, retreatTime: null,
    endTime: 12, points: [{ time: 0, hpPercent: 100 }, { time: 12, hpPercent: 80 }] })
  for (const range of ['remnant', 'retreat']) {
    for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
      const capped = render(component, { series: [noTrigger], range })
      assert.equal(ticks(capped).at(-1), 15)
      assert.match(capped, /計算範囲内に余燼未発動/)
      assert.deepEqual(eventGroups(capped), [''])
      assert.deepEqual(directLabels(capped), [])
      assert.doesNotMatch(capped, /NaN|Infinity|undefined|null/)
    }
  }
})

test('same-time post-trigger healing is absent from the endpoint and a zero-second trigger is valid', () => {
  const healed = makeSeries({ points: [
    { time: 0, hpPercent: 100, phase: 'activation' }, { time: 25, hpPercent: 5, phase: 'drain' },
    { time: 25, hpPercent: 1, phase: 'remnant' }, { time: 25, hpPercent: 90, phase: 'remnant' },
    { time: 33, hpPercent: 20, phase: 'remnant' },
  ] })
  const markup = render(chart.SurtrDurationChartImage, { series: [healed], range: 'remnant' })
  assert.equal(pathCoordinates(markup)[0].length, 6)
  const circle = tags(eventGroups(markup)[0], 'circle')[0]
  near(Number(attr(circle, 'cy')), pathCoordinates(markup)[0].at(-1))
  const immediate = render(chart.SurtrDurationChartImage, { range: 'remnant', series: [makeSeries({
    remnantStart: 0, retreatTime: 8, endTime: 8, points: [{ time: 0, hpPercent: 1, phase: 'remnant' }, { time: 8, hpPercent: 0 }],
  })] })
  assert.match(immediate, /余燼発動まで 0 秒/)
  assert.deepEqual(directLabels(immediate).map(item => item.value), ['0秒'])
  near(pathCoordinates(immediate)[0][0], bounds(immediate).left)
  assert.doesNotMatch(immediate, /NaN|Infinity/)
})

test('selection at the trigger uses the clipped endpoint HP before same-time healing', () => {
  const healed = makeSeries({ points: [
    { time: 0, hpPercent: 100, phase: 'activation' }, { time: 25, hpPercent: 5, phase: 'drain' },
    { time: 25, hpPercent: 1, phase: 'remnant' }, { time: 25, hpPercent: 90, phase: 'remnant' },
    { time: 33, hpPercent: 20, phase: 'remnant' },
  ] })
  const selection = { seriesId: healed.id, time: 25, hpPercent: 90 }
  const markup = render(chart.SurtrDurationChart, { series: [healed], range: 'remnant', selection })
  const marker = tags(markup, 'circle').find(tag => attr(tag, 'class') === 'surtr-duration-chart-selection-point')
  assert.ok(marker)
  near(Number(attr(marker, 'cx')), pathCoordinates(markup)[0].at(-2))
  near(Number(attr(marker, 'cy')), pathCoordinates(markup)[0].at(-1))
  assert.match(markup, /選択時刻 25 秒、HP 1%/)
  assert.doesNotMatch(markup, /選択時刻 25 秒、HP 90%/)
  const full = render(chart.SurtrDurationChart, { series: [healed], range: 'retreat', selection })
  assert.match(full, /選択時刻 25 秒、HP 90%/)
  assert.equal(selection.hpPercent, 90, 'source selection remains unchanged for table/full-range display')
})

test('selection after the selected line ends is hidden even when another series extends the domain', () => {
  const series = [makeSeries(), makeSeries({ id: 'long', remnantStart: 40, retreatTime: 48, endTime: 48,
    points: [{ time: 0, hpPercent: 100 }, { time: 40, hpPercent: 0 }, { time: 48, hpPercent: 0 }] })]
  for (const range of ['remnant', 'retreat']) {
    const hidden = render(chart.SurtrDurationChart, { series, range, selection: { seriesId: 'baseline', time: 36, hpPercent: 0 } })
    assert.doesNotMatch(hidden, /surtr-duration-chart-selection(?:-guide|-point|"| )|選択時刻/)
    const visible = render(chart.SurtrDurationChart, { series, range, selection: { seriesId: 'long', time: 36, hpPercent: 5 } })
    assert.match(visible, /surtr-duration-chart-selection-guide/)
    assert.match(visible, /surtr-duration-chart-selection-point/)
    const endpoint = render(chart.SurtrDurationChart, { series, range,
      selection: { seriesId: 'baseline', time: range === 'remnant' ? 25 : 33, hpPercent: 1 } })
    assert.match(endpoint, /surtr-duration-chart-selection-point/)
  }
})

test('coincident triggers share one time label and eight adjacent labels stay separate inside the plot', () => {
  for (const component of [chart.SurtrDurationChart, chart.SurtrDurationChartImage, chart.SurtrDurationChartImagePreview]) {
    const same = Array.from({ length: 8 }, (_, index) => makeSeries({ id: `same-${index}` }))
    const coincident = render(component, { series: same, range: 'remnant' })
    assert.equal(eventGroups(coincident).length, 8)
    assert.ok(eventGroups(coincident).every(group => tags(group, 'circle').length === 1))
    assert.equal(directLabels(coincident).length, 1)
    const nearby = same.map((item, index) => ({ ...item, remnantStart: 25 + index / 100,
      points: [{ time: 0, hpPercent: 100 }, { time: 25 + index / 100, hpPercent: 1 }] }))
    const markup = render(component, { series: nearby, range: 'remnant' })
    const plot = bounds(markup)
    const labels = directLabels(markup)
    assert.equal(labels.length, 8)
    assert.equal(new Set(labels.map(label => label.value)).size, 8)
    for (const label of labels) {
      const width = Array.from(label.value).reduce((sum, character) => sum + (character === '秒' ? 12 : 7), 8)
      assert.ok(label.x - width / 2 >= plot.left && label.x + width / 2 <= plot.right)
      assert.ok(label.y - 13 >= plot.top && label.y + 5 < plot.bottom)
    }
    const sorted = [...labels].sort((a, b) => a.y - b.y)
    for (let index = 1; index < sorted.length; index++) assert.ok(sorted[index].y - sorted[index - 1].y >= 22)
  }
})
