import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server
let Panel
let colors

before(async () => {
  server = await createServer({
    configFile: false,
    resolve: { preserveSymlinks: true },
    plugins: [react(), {
      name: 'capture-expectation-chart-series',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === './SurtrDpsChart' && importer?.endsWith('/SurtrRemnantDamageExpectationPanel.tsx')) {
          return '\0expectation-chart-series'
        }
      },
      load(id) {
        if (id === '\0expectation-chart-series') return `
          import { createElement } from 'react'
          export function SurtrDpsChart({ series }) {
            return createElement('pre', { 'data-expectation-series': '' }, JSON.stringify(series))
          }
        `
      },
    }],
    cacheDir: 'node_modules/.vite/surtr-damage-expectation-stages-test',
    logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
    appType: 'custom',
  })
  ;({ SurtrRemnantDamageExpectationPanel: Panel } = await server.ssrLoadModule('/src/components/SurtrRemnantDamageExpectationPanel.tsx'))
  ;({ getModuleComparisonColors: colors } = await server.ssrLoadModule('/src/lib/moduleColors.ts'))
})

after(async () => { await server?.close() })

const assumptions = { windup: 0.2, ctCarry: 'time', includeRetreatHit: false }
const selected = [
  { type: null, level: 0 },
  ...[1, 2, 3].map(level => ({ type: 'X', level })),
  ...[1, 2, 3].map(level => ({ type: 'Y', level })),
]
const styles = ['solid', 'dotted', 'dashed', 'solid', 'dotted', 'dashed', 'solid']

function comparison() {
  const palette = colors(selected.map(item => ({ moduleType: item.type, moduleLevel: item.level })), { shadeBy: 'moduleLevel' })
  return selected.map(({ type, level }, index) => {
    const moduleId = type === null ? '' : `uniequip_00${type === 'X' ? 2 : 3}_surtr`
    const attackSpeed = type === 'X' ? 108 : 100
    const afterSpeed = type === 'Y' ? 100 + [0, 20, 30][level - 1] : attackSpeed
    const attackInterval = 1.25 * 100 / attackSpeed
    const moduleAttack = type === 'X' ? [30, 48, 60][level - 1] : type === 'Y' ? [45, 55, 60][level - 1] : 0
    const baseAttack = 772 + moduleAttack
    const model = {
      moduleId, moduleType: type, moduleLevel: level,
      attackIntervalBefore: attackInterval, attackIntervalAfter: 1.25 * 100 / afterSpeed,
      attackSpeedBefore: attackSpeed, attackSpeedAfter: afterSpeed,
      remnantDuration: type === 'Y' && level === 3 ? 9 : 8,
    }
    const dpsModel = {
      moduleId, moduleType: type, moduleLevel: level,
      baseAttack, effectiveAttack: Math.round(baseAttack * 4.3), skillAttackBonusPercent: 330,
      attackInterval, attackSpeed, resistanceIgnore: type === 'X' ? [20, 24, 26][level - 1] : 20,
      artsFragility: 0,
      operatorStats: {
        baseAttackTime: 1.25, baseAttackSpeed: 100, attackSpeedBonus: attackSpeed - 100,
        baseAttackBreakdown: { levelAttack: 672, trustAttack: 100, potentialAttack: 0,
          moduleAttack, beforeRounding: baseAttack, result: baseAttack },
      },
    }
    return { id: type === null ? 'none' : `${moduleId}:lv${level}`,
      label: type === null ? '未装備' : `MOD ${type} Lv.${level}`, color: palette[index],
      lineStyle: styles[index], model, dpsModel }
  })
}

const render = (items, overrides = {}) => renderToStaticMarkup(createElement(Panel, {
  comparison: items, potential: 1, blocking: false, assumptions, status: null, ...overrides,
}))
const unescape = value => value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&gt;', '>')
  .replaceAll('&lt;', '<').replaceAll('&amp;', '&')
const chartSeries = markup => {
  const capture = markup.match(/<pre data-expectation-series="">([\s\S]*?)<\/pre>/)
  assert.ok(capture, 'Missing expectation chart series')
  return JSON.parse(unescape(capture[1]))
}
const text = markup => unescape(markup.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
const bodyRows = markup => [...markup.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => text(cell[1])))

test('seven selected stages retain exact labels, stage colors, line styles and independent expected counts', () => {
  const items = comparison()
  const markup = render(items)
  const series = chartSeries(markup)
  assert.equal(series.length, 7)
  assert.equal(new Set(series.map(item => item.id)).size, 7)
  assert.deepEqual(series.map(item => [item.id, item.label, item.color, item.lineStyle]),
    items.map(item => [item.id, item.label, item.color, item.lineStyle]))
  // E2/P1, 0.2 s windup and time carry: X stages share timing; Y changes at Lv.2/3.
  const means = [6.24, 6.7392, 6.7392, 6.7392, 6.24, 7.406666666666666, 9.003076923076923]
  series.forEach((item, index) => {
    const point = item.points.find(point => point.x === 60)
    assert.ok(Math.abs(point.expectedHitCount - means[index]) < 1e-10)
    const perHit = items[index].dpsModel.effectiveAttack * (1 - (60 - items[index].dpsModel.resistanceIgnore) / 100)
    assert.ok(Math.abs(point.value - means[index] * perHit) < 1e-8)
  })
  const rows = bodyRows(markup)
  assert.equal(rows.length, 7)
  assert.deepEqual(rows.map(row => row[0]), items.map(item => item.label))
  assert.doesNotMatch(markup, /role="alert"/)
})

test('none-only and asymmetric stage selections keep every selected identity without injecting Lv.3', () => {
  const items = comparison()
  for (const choice of [[items[0]], [items[1], items[3], items[5]]]) {
    const markup = render(choice)
    assert.deepEqual(chartSeries(markup).map(item => item.id), choice.map(item => item.id))
    assert.deepEqual(bodyRows(markup).map(row => row[0]), choice.map(item => item.label))
    assert.doesNotMatch(markup, /role="alert"/)
  }
})

test('no selection is an empty state while missing models remain data errors', () => {
  const empty = render([])
  assert.match(empty, /role="status">比較するMOD・段階を選択してください。/)
  assert.doesNotMatch(empty, /role="alert"|<table|data-expectation-series|画像を保存/)
  const invalid = render([{ ...comparison()[0], dpsModel: null }])
  assert.match(invalid, /role="alert">期待値の計算に必要なデータを取得できませんでした。/)
  assert.doesNotMatch(invalid, /<table|data-expectation-series/)
})
