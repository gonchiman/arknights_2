import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

let server, Chart, Frame, getFrame
const points = [{ id: 'low', x: -10, y: 0 }, { id: 'high', x: 30, y: 1000 }]
const render = extra => renderToStaticMarkup(createElement(Chart, {
  points, xLabel: '必要SP−初期SP', yLabel: '直接DPS', fit: { slope: 100, intercept: 0 }, showFit: true, ...extra,
}))

before(async () => {
  server = await createServer({
    configFile: false, plugins: [react()], logLevel: 'error',
    cacheDir: 'node_modules/.vite/skill-dps-chart-rendering-test', resolve: { preserveSymlinks: true },
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom',
  })
  ;({ SkillDpsAnalysisChart: Chart } = await server.ssrLoadModule('/src/components/SkillDpsAnalysisChart.tsx'))
  ;({ ChartImageFrame: Frame } = await server.ssrLoadModule('/src/components/ChartImageFrame.tsx'))
  ;({ getSkillDpsChartImageFrame: getFrame } = await server.ssrLoadModule('/src/components/SkillDpsAnalysisImageDialog.tsx'))
})

after(async () => { await server?.close() })

test('screen plotting retains its natural height, axis title and matching legend', () => {
  const markup = render()
  assert.match(markup, /width="640" height="310" viewBox="0 0 640 310"/)
  assert.match(markup, /class="skill-dps-chart-label"[^>]*text-anchor="middle">必要SP−初期SP<\/text>/)
  assert.match(markup, /class="skill-dps-chart-legend"/)
  assert.match(markup, /skill-dps-chart-fit-key/)
  assert.match(markup, /<clipPath[^>]*><rect x="66" y="29" width="554" height="228"/)
  assert.doesNotMatch(markup, /class="skill-dps-chart is-image"/)
})

test('image plotting uses supplied dimensions and leaves frame-owned labels and legends to the image frame', () => {
  for (const height of [310, 580]) {
    const markup = render({ imageSize: { width: 928, height } })
    assert.match(markup, new RegExp(`width="928" height="${height}" viewBox="0 0 928 ${height}" style="width:928px;height:${height}px"`))
    assert.match(markup, /class="skill-dps-chart is-image"/)
    assert.match(markup, new RegExp(`<clipPath[^>]*><rect x="66" y="29" width="842" height="${height - 57}"`))
    assert.match(markup, /class="skill-dps-chart-label"[^>]*>直接DPS<\/text>/)
    assert.doesNotMatch(markup, /class="skill-dps-chart-label"[^>]*text-anchor="middle"/)
    assert.doesNotMatch(markup, /class="skill-dps-chart-legend"/)
    // The zero-DPS marker stays whole inside the SVG; only the extrapolating fit is clipped to the plot.
    const circles = [...markup.matchAll(/<circle[^>]*cx="([^"]+)" cy="([^"]+)" r="4"/g)]
    assert.equal(circles.length, 2)
    for (const [, cx, cy] of circles) {
      assert.ok(Number(cx) >= 4 && Number(cx) <= 924)
      assert.ok(Number(cy) >= 4 && Number(cy) <= height - 4)
    }
    assert.match(markup, /<g clip-path="url\(#[^)]+\)"><line class="skill-dps-chart-fit"/)
    assert.doesNotMatch(markup, /NaN|Infinity/)
  }
})

test('disabled regression and invalid observations produce no stray image series', () => {
  const markup = render({
    imageSize: { width: 928, height: 310 }, showFit: false,
    points: [...points, { id: 'invalid', x: Number.NaN, y: 100 }],
  })
  assert.equal((markup.match(/class="skill-dps-chart-point"/g) ?? []).length, 2)
  assert.doesNotMatch(markup, /class="skill-dps-chart-fit"|NaN|Infinity/)
})

const snapshot = {
  config: { profession: 'ALL', rarity: 'ALL', spRecovery: 'INCREASE_WITH_TIME', damageType: 'ALL', skillLevel: 'MAX', defense: 0, resistance: 0 },
  axis: 'duration', metric: 'direct', showFit: true, points,
  fit: { slope: -18.05, intercept: 1651 }, correlation: -0.2227, rSquared: 0.04958,
}

test('each numeric saved analysis includes its applied conditions, statistics and the shared image frame', () => {
  for (const [axis, label] of [['duration', '持続時間（秒）'], ['spCost', '必要SP'], ['spGap', '必要SP−初期SP'],
    ['deploymentCost', '配置コスト'], ['initialRatio', '初期SP率（%）'], ['uptime', '理論稼働率（%）'],
    ['attack', '軽減前攻撃力'], ['interval', '攻撃間隔（秒）']]) {
    const frame = getFrame({ ...snapshot, axis, metric: 'combined' })
    const markup = renderToStaticMarkup(createElement(Frame, frame))
    assert.match(markup, /chart-image-frame-heading/)
    assert.match(markup, /chart-image-frame-legend-item/)
    assert.match(markup, /自然回復・スキル最高Lv・防御0／術耐性0・敵1体/)
    assert.match(markup, /n=2/)
    assert.match(markup, /Pearson r = -0.2227/)
    assert.match(markup, /R² = 0.04958/)
    assert.ok(markup.includes(`合計DPS = -18.05 × ${label} + 1,651`))
    assert.ok(markup.includes(`class="chart-image-frame-axis-title">${label}</p>`))
    assert.match(markup, /width="928" height="310"/)
    assert.match(markup, /class="skill-dps-chart-fit"/)
    assert.doesNotMatch(markup, /<button\b|<input\b|<select\b|skill-dps-chart-legend|NaN|Infinity/)
  }
})

test('maximum target image exports the grouped boxes, quartiles and unlimited label without OLS statistics', () => {
  const frame = getFrame({ ...snapshot, axis: 'maxTargets', points: [
    { id: 'single-low', x: 1, y: 0 }, { id: 'single-high', x: 1, y: 1000 },
    { id: 'unlimited', x: 'UNLIMITED', y: 1500 },
  ], fit: null, correlation: null, rSquared: null })
  const markup = renderToStaticMarkup(createElement(Frame, frame))
  assert.match(markup, /最大対象数と直接DPS/)
  assert.match(markup, /上限なし/)
  assert.match(markup, /中央値/)
  assert.match(markup, /Q1/)
  assert.match(markup, /Q3/)
  assert.doesNotMatch(markup, /Pearson|R²|単回帰|UNLIMITED|NaN|Infinity|<button\b/)
})

test('saving without regression never adds a line or a misleading legend', () => {
  for (const extra of [{ showFit: false }, { fit: null, correlation: null, rSquared: null }]) {
    const markup = renderToStaticMarkup(createElement(Frame, getFrame({ ...snapshot, ...extra })))
    assert.doesNotMatch(markup, /class="skill-dps-chart-fit"|<span>単回帰<\/span>/)
    assert.match(markup, /<span>スキル<\/span>/)
    assert.equal((markup.match(/class="skill-dps-chart-point"/g) ?? []).length, 2)
    if (extra.fit === null) {
      assert.match(markup, /Pearson r = —/)
      assert.doesNotMatch(markup, /直接DPS =/)
    }
  }
})
