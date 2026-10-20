import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createZeroBasedValueAxis } from '../src/lib/chartValueAxis.ts'

test('2,958件の棒を0・1,000・2,000・3,000で読む件数軸にする', () => {
  assert.deepEqual(createZeroBasedValueAxis(2_958), {
    maximum: 3_000, step: 1_000, ticks: [0, 1_000, 2_000, 3_000],
  })
})

test('1・2・5に基づく刻みは境界を超えたときだけ次の読みやすい幅へ進む', () => {
  for (const [maximum, step, ceiling] of [
    [4, 1, 4], [4.001, 2, 6], [8, 2, 8], [8.001, 5, 10],
    [20, 5, 20], [20.001, 10, 30], [40, 10, 40], [40.001, 20, 60],
  ]) {
    const axis = createZeroBasedValueAxis(maximum)
    assert.equal(axis.step, step)
    assert.equal(axis.maximum, ceiling)
    assert.equal(axis.ticks[0], 0)
    assert.equal(axis.ticks.at(-1), ceiling)
    assert.ok(axis.maximum >= maximum)
  }
})

test('件数が少ないときも整数目盛りと最低1件の表示範囲を保つ', () => {
  assert.deepEqual(createZeroBasedValueAxis(1), { maximum: 1, step: 1, ticks: [0, 1] })
  assert.deepEqual(createZeroBasedValueAxis(2), { maximum: 2, step: 1, ticks: [0, 1, 2] })
  assert.deepEqual(createZeroBasedValueAxis(3), { maximum: 3, step: 1, ticks: [0, 1, 2, 3] })
  assert.deepEqual(createZeroBasedValueAxis(5), { maximum: 6, step: 2, ticks: [0, 2, 4, 6] })
  assert.deepEqual(createZeroBasedValueAxis(0.1), { maximum: 1, step: 1, ticks: [0, 1] })
})

test('割合軸は最小刻み0を指定して既存の小数目盛りを維持する', () => {
  assert.deepEqual(createZeroBasedValueAxis(0.9, 0), { maximum: 1, step: 0.5, ticks: [0, 0.5, 1] })
  assert.deepEqual(createZeroBasedValueAxis(0.07, 0), { maximum: 0.08, step: 0.02, ticks: [0, 0.02, 0.04, 0.06, 0.08] })
  assert.deepEqual(createZeroBasedValueAxis(24.2, 0), { maximum: 30, step: 10, ticks: [0, 10, 20, 30] })
})

test('空データや無効な上限でも有限な0〜1の軸を返す', () => {
  for (const maximum of [0, -1, NaN, Infinity, -Infinity]) {
    for (const minimumStep of [0, 1]) {
      assert.deepEqual(createZeroBasedValueAxis(maximum, minimumStep), { maximum: 1, step: 1, ticks: [0, 1] })
    }
  }
  for (const minimumStep of [-1, NaN, Infinity]) {
    assert.deepEqual(createZeroBasedValueAxis(2, minimumStep), { maximum: 2, step: 1, ticks: [0, 1, 2] })
  }
})

test('大きい有限値でも上限や目盛りをInfinityにしない', () => {
  const axis = createZeroBasedValueAxis(Number.MAX_VALUE)
  assert.ok(Number.isFinite(axis.maximum))
  assert.ok(axis.maximum >= Number.MAX_VALUE)
  assert.ok(axis.ticks.every(Number.isFinite))
  assert.equal(axis.ticks.at(-1), axis.maximum)
})

test('既存の分布比較はCOUNT・PERCENTの目盛りと非表示系列を含む共通範囲を維持する', async () => {
  const server = await createServer({ configFile: false, plugins: [react()],
    cacheDir: 'node_modules/.vite/chart-value-axis-test', resolve: { preserveSymlinks: true }, logLevel: 'error',
    server: { middlewareMode: true, watch: null, preTransformRequests: false, hmr: false }, appType: 'custom' })
  try {
    const { EnemyComparisonFigure } = await server.ssrLoadModule('/src/components/EnemyComparisonChart.tsx')
    const bins = [{ start: 0, end: 10, count: 9, includesMaximum: true }]
    const data = {
      distribution: { minimum: 0, maximum: 10, bins, series: [
        { condition: { id: 1, visible: true, colorIndex: 0 }, label: '通常敵', count: 1_000, missingCount: 0, bins },
        { condition: { id: 2, visible: false, colorIndex: 1 }, label: 'エリート敵', count: 1_000, missingCount: 0,
          bins: [{ ...bins[0], count: 18 }] },
      ] },
      metric: { key: 'magicResistance', label: '術耐性', axisLabel: '術耐性', suffix: '', summaryDigits: 1,
        logBinCount: 10, minimumLinearBinWidth: 1 },
      scale: 'LINEAR', yAxis: 'COUNT', countMode: 'TYPES',
    }
    const render = yAxis => renderToStaticMarkup(createElement(EnemyComparisonFigure, {
      data: { ...data, yAxis }, onToggle: () => {},
    }))
    const count = render('COUNT')
    assert.match(count, />0<\/text>/)
    for (const tick of [5, 10, 15, 20]) assert.ok(count.includes(`>${tick}</text>`))
    assert.doesNotMatch(count, /data-comparison-series="2"/)
    const percent = render('PERCENT')
    for (const tick of ['0%', '0.5%', '1%', '1.5%', '2%']) assert.ok(percent.includes(`>${tick}</text>`))
    assert.doesNotMatch(percent, />5%<\/text>/)
  } finally {
    await server.close()
  }
})
