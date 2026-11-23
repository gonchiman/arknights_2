import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Plot, Legend, build, height
before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/skill-dps-target-boxplot-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  const plot = await server.ssrLoadModule('/src/components/SkillDpsTargetBoxplot.tsx')
  Plot = plot.SkillDpsTargetBoxplot
  Legend = plot.SkillDpsTargetBoxplotLegend
  height = plot.SKILL_DPS_TARGET_BOXPLOT_HEIGHT
  ;({ buildSkillDpsTargetGroups: build } = await server.ssrLoadModule('/src/lib/skillDpsTargetGroups.ts'))
})
after(async () => { await server?.close() })

const points = [
  ...[0, 100, 200, 300, 400, 500, 600, 700, 10000].map((y, index) => ({ id: `single-${index}`, targetCount: 1, y })),
  { id: 'double', targetCount: 2, y: 300 }, { id: 'unlimited-a', targetCount: 'UNLIMITED', y: 1000 },
  { id: 'unlimited-b', targetCount: 'UNLIMITED', y: 2000 },
]
const render = extra => renderToStaticMarkup(createElement(Plot, { groups: build(points), yLabel: '直接DPS', ...extra }))

test('screen boxplot has categorical summaries, observed outliers and sparse observations', () => {
  const markup = render()
  assert.match(markup, new RegExp(`width="640" height="${height}"`))
  assert.match(markup, /最大攻撃対象数別の直接DPS/)
  assert.match(markup, /上限なし、2件、Q1 1,250、中央値 1,500、Q3 1,750/)
  assert.equal((markup.match(/class="skill-dps-target-group"/g) ?? []).length, 3)
  assert.equal((markup.match(/class="skill-dps-target-outlier"/g) ?? []).length, 2) // One data mark and the legend mark.
  assert.equal((markup.match(/class="skill-dps-target-point"/g) ?? []).length, 3)
  for (const label of ['件数', 'Q1', '中央値', 'Q3', '最大攻撃対象数']) assert.ok(markup.includes(label))
  assert.doesNotMatch(markup, /<button\b|data-tooltip|onClick|Pearson|回帰/)
})

test('fixed image mode has finite geometry and leaves frame-owned title and legend outside', () => {
  for (const imageHeight of [354, 600]) {
    const markup = render({ imageSize: { width: 928, height: imageHeight } })
    assert.match(markup, new RegExp(`width="928" height="${imageHeight}" viewBox="0 0 928 ${imageHeight}"`))
    assert.match(markup, /class="skill-dps-target-boxplot is-image"/)
    assert.doesNotMatch(markup, /skill-dps-target-legend|>最大攻撃対象数<\/text>|NaN|Infinity/)
    for (const attr of ['x', 'x1', 'x2', 'cx', 'y', 'y1', 'y2', 'cy', 'width', 'height']) {
      for (const [, value] of markup.matchAll(new RegExp(`(?:^|\\s)${attr}="([^"]+)"`, 'g'))) assert.ok(Number.isFinite(Number(value)), `${attr}=${value}`)
    }
    const circles = [...markup.matchAll(/<circle[^>]*cx="([^"]+)" cy="([^"]+)" r="3"/g)]
    for (const [, x, y] of circles) {
      assert.ok(Number(x) >= 3 && Number(x) <= 925)
      assert.ok(Number(y) >= 3 && Number(y) <= imageHeight - 3)
    }
  }
  const legend = renderToStaticMarkup(createElement(Legend, { imageMode: true }))
  assert.match(legend, /chart-image-frame-legend-list skill-dps-target-legend is-image/)
})

test('many screen categories preserve readable column widths through contained chart scrolling', () => {
  const groups = build(Array.from({ length: 12 }, (_, i) => ({ id: String(i), targetCount: i + 1, y: 100 + i })))
  const markup = render({ groups })
  assert.match(markup, /width="1094"/)
  assert.match(markup, /role="region" aria-label="最大攻撃対象数別の箱ひげ図" tabindex="0"/)
  assert.equal((markup.match(/class="skill-dps-target-group"/g) ?? []).length, 12)
  assert.match(markup, />12体<\/text>/)
  const empty = render({ groups: [] })
  assert.match(empty, /role="status">分析対象は0件です。/)
  assert.doesNotMatch(empty, /<svg\b/)
})
