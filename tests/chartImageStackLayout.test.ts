import test from 'node:test'
import assert from 'node:assert/strict'
import { CHART_IMAGE_STACK_HEADER_HEIGHT, getChartImageStackLayout } from '../src/lib/chartImageStackLayout.ts'

test('積み上げ画像は指定なしで同じ幅を使い、各グラフの自然高を保持する', () => {
  const layout = getChartImageStackLayout({ panels: [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }] })
  assert.deepEqual(layout, { width: 960, height: 832, gap: 12,
    panels: [{ height: 410, chartHeight: 334 }, { height: 410, chartHeight: 334 }] })
})

test('共通ヘッダーは2つのDPSパネルの外側に一度だけ確保する', () => {
  const panels = [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }]
  const withoutHeader = getChartImageStackLayout({ panels })
  const layout = getChartImageStackLayout({ panels, headerHeight: CHART_IMAGE_STACK_HEADER_HEIGHT })
  assert.equal(layout.width, 960)
  assert.equal(layout.height - withoutHeader.height, CHART_IMAGE_STACK_HEADER_HEIGHT)
  assert.deepEqual(layout.panels, withoutHeader.panels)
  assert.equal(layout.height, CHART_IMAGE_STACK_HEADER_HEIGHT + 410 + 12 + 410)
})

test('ヒストグラムを追加した3パネルでも共通ヘッダーとパネル間隔を重複させない', () => {
  const layout = getChartImageStackLayout({ panels: [
    { naturalChartHeight: 334 },
    { naturalChartHeight: 334 },
    { naturalChartHeight: 334 },
  ], headerHeight: CHART_IMAGE_STACK_HEADER_HEIGHT, gap: 8 })
  assert.deepEqual(layout, { width: 960, height: CHART_IMAGE_STACK_HEADER_HEIGHT + 410 * 3 + 8 * 2, gap: 8,
    panels: [{ height: 410, chartHeight: 334 }, { height: 410, chartHeight: 334 }, { height: 410, chartHeight: 334 }] })
})

test('共通ヘッダーの折り返しで画像を伸ばし、各パネルの自然高を削らない', () => {
  const panels = [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }]
  const initial = getChartImageStackLayout({ panels, headerHeight: CHART_IMAGE_STACK_HEADER_HEIGHT })
  const wrapped = getChartImageStackLayout({ panels, headerHeight: 92.4 })
  assert.equal(wrapped.width, initial.width)
  assert.equal(wrapped.height - initial.height, 93 - CHART_IMAGE_STACK_HEADER_HEIGHT)
  assert.deepEqual(wrapped.panels, initial.panels)
})

test('共通ヘッダー付きの縦横比でも自然高・追加ラベル領域・最小グラフ高を保つ', () => {
  const headerHeight = 94
  for (const aspectRatio of [9 / 16, 1, 16 / 9, 3]) {
    const layout = getChartImageStackLayout({ panels: [
      { naturalChartHeight: 334, overflow: 40, chromeHeight: 124 },
      { naturalChartHeight: 334, minimumChartHeight: 420 },
      { naturalChartHeight: 334, overflow: 18, chromeHeight: 81 },
    ], aspectRatio, headerHeight })
    assert.ok(layout.width >= 960)
    assert.ok(layout.panels[0].chartHeight >= 374)
    assert.ok(layout.panels[1].chartHeight >= 420)
    assert.ok(layout.panels[2].chartHeight >= 352)
    assert.equal(layout.panels[0].height - layout.panels[0].chartHeight, 124)
    assert.equal(layout.panels[1].height - layout.panels[1].chartHeight, 76)
    assert.equal(layout.panels[2].height - layout.panels[2].chartHeight, 81)
    assert.equal(layout.height, headerHeight + layout.panels.reduce((sum, panel) => sum + panel.height, 0) + 24)
    assert.ok(Math.abs(layout.height - layout.width / aspectRatio) < 1)
  }
})

test('不正な共通ヘッダー高を無視し、小数の実測高は切り上げる', () => {
  const panels = [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }]
  const withoutHeader = getChartImageStackLayout({ panels })
  for (const headerHeight of [0, NaN, Infinity, -Infinity, -1]) {
    assert.deepEqual(getChartImageStackLayout({ panels, headerHeight }), withoutHeader)
  }
  const fractional = getChartImageStackLayout({ panels, headerHeight: 34.1 })
  assert.equal(fractional.height - withoutHeader.height, 35)
  assert.deepEqual(fractional.panels, withoutHeader.panels)
})

test('空のパネル列には共通ヘッダーだけを確保し、グラフや間隔を追加しない', () => {
  assert.deepEqual(getChartImageStackLayout({ panels: [], headerHeight: 34.1, gap: 8 }),
    { width: 960, height: 35, gap: 8, panels: [] })
  assert.deepEqual(getChartImageStackLayout({ panels: [], headerHeight: NaN }),
    { width: 960, height: 0, gap: 12, panels: [] })
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
