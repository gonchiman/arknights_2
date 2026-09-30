import test from 'node:test'
import assert from 'node:assert/strict'
import { getChartImageStackLayout } from '../src/lib/chartImageStackLayout.ts'

test('積み上げ画像は指定なしで同じ幅を使い、各グラフの自然高を保持する', () => {
  const layout = getChartImageStackLayout({ panels: [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }] })
  assert.deepEqual(layout, { width: 960, height: 832, gap: 12,
    panels: [{ height: 410, chartHeight: 334 }, { height: 410, chartHeight: 334 }] })
})

test('縦横比を画像全体へ適用し、グラフごとの自然高や追加ラベル領域を削らない', () => {
  for (const aspectRatio of [9 / 16, 1, 16 / 9, 3]) {
    const layout = getChartImageStackLayout({ panels: [
      { naturalChartHeight: 334, overflow: 40, chromeHeight: 124 },
      { naturalChartHeight: 334, minimumChartHeight: 420 },
    ], aspectRatio })
    assert.ok(layout.width >= 960)
    assert.ok(layout.panels[0].chartHeight >= 374)
    assert.ok(layout.panels[1].chartHeight >= 420)
    assert.equal(layout.panels[0].height - layout.panels[0].chartHeight, 124)
    assert.equal(layout.panels[1].height - layout.panels[1].chartHeight, 76)
    assert.equal(layout.height, layout.panels.reduce((sum, panel) => sum + panel.height, 0) + 12)
    assert.ok(Math.abs(layout.height - layout.width / aspectRatio) < 1)
  }
})

test('不正な値は全体サイズへ伝播せず、小数の計測値を切り上げる', () => {
  const layout = getChartImageStackLayout({ panels: [
    { naturalChartHeight: NaN, overflow: Infinity, chromeHeight: -1, minimumChartHeight: NaN },
    { naturalChartHeight: 100.1, overflow: 5.1, chromeHeight: 80.1 },
  ], gap: NaN, aspectRatio: -1 })
  assert.equal(layout.width, 960)
  assert.equal(layout.height, 410 + 107 + 81 + 12)
  assert.deepEqual(layout.panels[1], { height: 188, chartHeight: 107 })
  assert.deepEqual(getChartImageStackLayout({ panels: [] }), { width: 960, height: 0, gap: 12, panels: [] })
})
