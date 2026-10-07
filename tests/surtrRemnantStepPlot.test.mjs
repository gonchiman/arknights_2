import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let chartModule
let plotModule
let chartData

before(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    cacheDir: 'node_modules/.vite/surtr-step-plot-test',
    resolve: { preserveSymlinks: true },
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  chartModule = await server.ssrLoadModule('/src/components/SurtrRemnantAttackChart.tsx')
  plotModule = await server.ssrLoadModule('/src/components/SurtrRemnantStepPlot.tsx')
  chartData = await server.ssrLoadModule('/src/lib/surtrRemnantChart.ts')
})
after(async () => { await server?.close() })

const assumptions = { windup: 0.3, ctCarry: 'time', includeRetreatHit: false }
const none = {
  moduleId: '', moduleType: null, moduleLevel: 0,
  attackIntervalBefore: 1.25, attackIntervalAfter: 1.25, remnantDuration: 8,
  attackSpeedBefore: 100, attackSpeedAfter: 100,
}
const x = {
  ...none, moduleId: 'uniequip_002_surtr', moduleType: 'X', moduleLevel: 3,
  attackIntervalBefore: 1.25 / 1.08, attackIntervalAfter: 1.25 / 1.08,
  attackSpeedBefore: 108, attackSpeedAfter: 108,
}
const y = {
  ...none, moduleId: 'uniequip_003_surtr', moduleType: 'Y', moduleLevel: 3,
  attackIntervalAfter: 1.25 / 1.3, remnantDuration: 9, attackSpeedAfter: 130,
}
const series = [
  { id: 'none', label: '未装備', color: '#737982', model: none },
  { id: 'X', label: 'MOD X Lv.3', color: '#3f7699', model: x },
  { id: 'Y', label: 'MOD Y Lv.3', color: '#b4763e', model: y },
]

const decode = value => value.replace(/&(?:amp|quot|lt|gt|#39|#x27);/g, entity => ({
  '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#x27;': "'",
})[entity])

// Parse rendered elements so assertions inspect SVG geometry and visible text.
function parseMarkup(markup) {
  const root = { tag: 'root', attrs: {}, children: [] }
  const stack = [root]
  for (const token of markup.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (token.startsWith('</')) { stack.pop(); continue }
    if (!token.startsWith('<')) { stack.at(-1).children.push(decode(token)); continue }
    const tag = token.match(/^<([\w-]+)/)?.[1]
    if (!tag) continue
    const attrs = Object.fromEntries([...token.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .map(([, name, value]) => [name, decode(value)]))
    const node = { tag, attrs, children: [] }
    stack.at(-1).children.push(node)
    if (!token.endsWith('/>') && !['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) stack.push(node)
  }
  return root
}
const elements = (node, predicate) => node.children.flatMap(child => typeof child === 'string'
  ? [] : [...(predicate(child) ? [child] : []), ...elements(child, predicate)])
const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join('')
const withClass = (node, name) => elements(node, child => child.attrs.class?.split(' ').includes(name))
const rows = node => elements(node, child => child.attrs['data-step-series'] !== undefined)
const row = (node, id) => {
  const found = rows(node).find(child => child.attrs['data-step-series'] === id)
  assert.ok(found, `missing equipment row ${id}`)
  return found
}
const frame = node => withClass(node, 'surtr-remnant-step-frame')[0]
const values = node => withClass(node, 'surtr-remnant-attack-chart-value').map(text)
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9,
  message ?? `${actual} != ${expected}`)

function renderChart(props = {}) {
  return parseMarkup(renderToStaticMarkup(createElement(chartModule.SurtrRemnantAttackChart, {
    series, assumptions, samples: [0, 0.1, 0.2, 0.3, 1.2], ctLimit: 1.25,
    kind: 'step', width: 720, showBoundaries: true, ...props,
  })))
}

function renderPlot(props = {}) {
  const selected = props.series ?? series
  const selectedAssumptions = props.assumptions ?? assumptions
  const { series: ignoredSeries, ...remaining } = props
  const data = selected.map(item => ({ item,
    intervals: chartData.buildSurtrRemnantCountIntervals(item.model, selectedAssumptions),
    endpoints: chartData.buildSurtrRemnantCountEndpoints(item.model, selectedAssumptions),
  }))
  return parseMarkup(renderToStaticMarkup(createElement('svg', { width: 720, height: 536 },
    createElement(plotModule.SurtrRemnantStepPlot, {
      data, assumptions: selectedAssumptions, height: 536, left: 54, right: 702,
      ctDomain: 1.25, xTicks: [0, 0.25, 0.5, 0.75, 1, 1.25],
      hatchId: 'test-hatch', activeCt: null, showBoundaries: true, ...remaining,
    }))))
}

function horizontalSegments(node) {
  const path = withClass(node, 'surtr-remnant-attack-chart-step')[0]
  assert.ok(path, 'missing step path')
  const tokens = path.attrs.d.match(/[MHV]|-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)
  let xPosition = 0
  let yPosition = 0
  const segments = []
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++]
    if (command === 'M') { xPosition = Number(tokens[index++]); yPosition = Number(tokens[index++]) }
    else if (command === 'V') yPosition = Number(tokens[index++])
    else if (command === 'H') {
      const to = Number(tokens[index++])
      segments.push({ from: xPosition, to, y: yPosition })
      xPosition = to
    } else assert.fail(`unexpected step command ${command}`)
  }
  return segments
}

function markerAt(node, ct, count) {
  const candidates = elements(node, child => child.tag === 'circle').filter(circle => {
    const title = elements(circle, child => child.tag === 'title')[0]
    if (!title) return false
    const content = text(title)
    const foundCt = content.match(/CT ([\d.]+) s/)?.[1]
    const foundCount = content.match(/・(\d+) 回$/)?.[1]
    return foundCt !== undefined && Math.abs(Number(foundCt) - ct) < 1e-9 && Number(foundCount) === count
  })
  assert.equal(candidates.length, 1, `expected one marker at CT ${ct}, ${count} hits`)
  return candidates[0]
}

function assertIncluded(circle, included, color) {
  assert.equal(circle.attrs.class, included ? 'surtr-remnant-attack-chart-point' : 'surtr-remnant-attack-chart-open-point')
  if (included) assert.equal(circle.attrs.fill, color)
  else assert.notEqual(circle.attrs.fill, color)
  assert.ok(text(circle).includes(included ? 'ちょうど' : 'ではこの回数を含まない'))
}

test('screen and PNG steps separate equipment into three rows with identical scales', () => {
  for (const image of [false, true]) {
    const rendered = renderChart({ image })
    const equipmentRows = rows(rendered)
    assert.deepEqual(equipmentRows.map(node => node.attrs['data-step-series']), ['none', 'X', 'Y'])
    assert.deepEqual(equipmentRows.map(values), [['7回', '6回'], ['7回', '6回'], ['10回', '9回', '8回']])
    const boundaryLabels = [['0.2'], ['≈0.756'], ['≈0.046', '≈1.008']]
    equipmentRows.forEach((node, index) => {
      const labels = withClass(node, 'surtr-remnant-attack-chart-tick').map(text)
      for (const expected of boundaryLabels[index]) assert.ok(labels.includes(expected), `missing CT label ${expected}`)
    })
    const frames = equipmentRows.map(frame)
    assert.ok(Number(frames[0].attrs.y) < Number(frames[1].attrs.y))
    assert.ok(Number(frames[1].attrs.y) < Number(frames[2].attrs.y))
    assert.deepEqual(frames.map(node => [node.attrs.x, node.attrs.width, node.attrs.height]),
      Array(3).fill([frames[0].attrs.x, frames[0].attrs.width, frames[0].attrs.height]))
    const yTicks = equipmentRows.map((node, index) => withClass(node, 'surtr-remnant-attack-chart-tick')
      .filter(tick => tick.attrs['text-anchor'] === 'end' && tick.attrs.x === String(Number(frames[index].attrs.x) - 10))
      .map(tick => [text(tick), Number(tick.attrs.y) - Number(frames[index].attrs.y)]))
    assert.deepEqual(yTicks[1], yTicks[0])
    assert.deepEqual(yTicks[2], yTicks[0])
    const segments = equipmentRows.map(horizontalSegments)
    close(segments[0][0].y - Number(frames[0].attrs.y), segments[1][0].y - Number(frames[1].attrs.y))
    close(segments[0][1].y - segments[0][0].y, segments[2][1].y - segments[2][0].y)
    close(segments[0][1].y - segments[0][0].y, segments[2][2].y - segments[2][1].y)
    const ends = [[0.2, 1.25], [34 / 45, 125 / 108], [3 / 65, 131 / 130, 1.25]]
    segments.forEach((parts, index) => parts.forEach((part, partIndex) => {
      close((part.to - Number(frames[index].attrs.x)) / Number(frames[index].attrs.width) * 1.25, ends[index][partIndex])
    }))
  }
})

test('X shows its analytical maximum CT even when boundary labels are hidden', () => {
  for (const image of [false, true]) {
    const xRow = row(renderChart({ image, showBoundaries: false }), 'X')
    const domain = elements(xRow, node => node.attrs['data-step-domain-limit'] !== undefined)[0]
    close(Number(domain.attrs['data-step-domain-limit']), 125 / 108)
    assert.equal(text(withClass(domain, 'surtr-remnant-step-limit')[0]), '最大CT ≈1.157 s')
    const endpoint = markerAt(xRow, 125 / 108, 6)
    const hatched = elements(xRow, node => node.tag === 'rect' && node.attrs.fill?.startsWith('url(#'))[0]
    close(Number(hatched.attrs.x), Number(endpoint.attrs.cx))
    close(Number(hatched.attrs.x) + Number(hatched.attrs.width), Number(frame(xRow).attrs.x) + Number(frame(xRow).attrs.width))
    assert.ok(Number(hatched.attrs.width) > 0)
  }
})

test('retreat inclusion reverses open and filled markers at every interior boundary', () => {
  const boundaries = [['none', 0.2, 7, 6], ['X', 34 / 45, 7, 6], ['Y', 3 / 65, 10, 9], ['Y', 131 / 130, 9, 8]]
  for (const includeRetreatHit of [false, true]) {
    const rendered = renderChart({ image: true, assumptions: { ...assumptions, includeRetreatHit } })
    for (const [id, ct, beforeCount, afterCount] of boundaries) {
      const equipmentRow = row(rendered, id)
      const color = series.find(item => item.id === id).color
      const beforeMarker = markerAt(equipmentRow, ct, beforeCount)
      const afterMarker = markerAt(equipmentRow, ct, afterCount)
      assertIncluded(beforeMarker, includeRetreatHit, color)
      assertIncluded(afterMarker, !includeRetreatHit, color)
      close(Number(beforeMarker.attrs.cx), Number(afterMarker.attrs.cx))
      assert.ok(Number(beforeMarker.attrs.cy) < Number(afterMarker.attrs.cy))
    }
  }
})

test('isolated endpoint counts remain visible beside the continuous six-hit interval', () => {
  for (const includeRetreatHit of [false, true]) {
    const selectedAssumptions = { ...assumptions, windup: 0.5, includeRetreatHit }
    for (const render of [renderPlot, props => renderChart({ image: true, ...props })]) {
      const equipmentRow = row(render({ series: [series[0]], assumptions: selectedAssumptions }), 'none')
      assert.equal(horizontalSegments(equipmentRow).length, 1)
      const ct = includeRetreatHit ? 0 : 1.25
      const count = includeRetreatHit ? 7 : 5
      assertIncluded(markerAt(equipmentRow, ct, count), true, series[0].color)
      assertIncluded(markerAt(equipmentRow, ct, 6), false, series[0].color)
      assert.ok(values(equipmentRow).includes(`${count}回`))
      assert.ok(values(equipmentRow).includes('6回'))
    }
  }
})

test('ratio carry puts Y boundary at 0.06 seconds and retains nine hits to the common limit', () => {
  const selectedAssumptions = { ...assumptions, ctCarry: 'ratio' }
  for (const render of [renderPlot, props => renderChart({ image: true, ...props })]) {
    const equipmentRow = row(render({ series: [series[2]], assumptions: selectedAssumptions }), 'Y')
    assert.deepEqual(values(equipmentRow), ['10回', '9回'])
    const parts = horizontalSegments(equipmentRow)
    assert.equal(parts.length, 2)
    const bounds = frame(equipmentRow)
    close((parts[0].to - Number(bounds.attrs.x)) / Number(bounds.attrs.width) * 1.25, 0.06)
    close(parts[1].to, Number(bounds.attrs.x) + Number(bounds.attrs.width))
    assert.ok(withClass(equipmentRow, 'surtr-remnant-attack-chart-tick').some(node => text(node) === '0.06'))
    assertIncluded(markerAt(equipmentRow, 0.06, 10), false, series[2].color)
    assertIncluded(markerAt(equipmentRow, 0.06, 9), true, series[2].color)
    assertIncluded(markerAt(equipmentRow, 1.25, 9), true, series[2].color)
  }
})

test('eleven-hit Y data extends the shared scale and stays inside its plot', () => {
  const higher = series.map(item => item.id === 'Y' ? { ...item, model: { ...item.model, remnantDuration: 10 } } : item)
  const rendered = renderChart({ image: true, series: higher, assumptions: { ...assumptions, windup: 0 } })
  const yRow = row(rendered, 'Y')
  assert.deepEqual(values(yRow), ['11回', '10回'])
  const bounds = frame(yRow)
  const top = Number(bounds.attrs.y)
  const bottom = top + Number(bounds.attrs.height)
  for (const part of horizontalSegments(yRow)) assert.ok(part.y > top && part.y < bottom)
  const label = withClass(yRow, 'surtr-remnant-attack-chart-value').find(node => text(node) === '11回')
  assert.ok(Number(label.attrs.y) > top, 'eleven-hit label needs headroom')
  assertIncluded(markerAt(yRow, 0, 11), true, series[2].color)
})

test('X alone retains the common 1.25-second axis and reports out-of-range selection', () => {
  const rendered = renderChart({ series: [series[1]], selectedCt: 1.2, showBoundaries: false })
  assert.equal(rows(rendered).length, 1)
  const xRow = row(rendered, 'X')
  assert.equal(text(withClass(xRow, 'surtr-remnant-step-limit')[0]), '最大CT ≈1.157 s')
  const slider = elements(rendered, node => node.attrs.role === 'slider')[0]
  assert.equal(slider.attrs['aria-valuemax'], '1.25')
  assert.ok(slider.attrs['aria-valuetext'].includes('—（範囲外）'))
  assert.ok(withClass(xRow, 'surtr-remnant-attack-chart-tick').some(node => text(node) === '1.25'))
  assert.equal(elements(xRow, node => node.tag === 'circle' && node.attrs.r === '6').length, 0)
})

test('narrow first Y interval retains its hit label with a leader instead of dropping it', () => {
  const rendered = renderPlot({ right: 342 })
  const yRow = row(rendered, 'Y')
  assert.deepEqual(values(yRow), ['10回', '9回', '8回'])
  const label = withClass(yRow, 'surtr-remnant-attack-chart-value').find(node => text(node) === '10回')
  assert.ok(Number(label.attrs.x) >= 54 && Number(label.attrs.x) <= 342)
  assert.ok(withClass(yRow, 'surtr-remnant-step-leader').some(node => node.tag === 'path'))
})
