import test from 'node:test'
import assert from 'node:assert/strict'
import { getChartImageLayout } from '../src/lib/chartImageLayout.ts'

test('グラフ種別によらず自然な高さを保ち、見出しの折り返し分だけ画像を広げる', () => {
  for (const naturalChartHeight of [94, 234, 334, 800]) {
    const automatic = getChartImageLayout({ naturalChartHeight, chromeHeight: 142 })
    assert.deepEqual(automatic, { width: 960, height: naturalChartHeight + 142, chartHeight: naturalChartHeight })
    for (const aspectRatio of [0.01, 9 / 16, 1, 16 / 9, 3, 100]) {
      const layout = getChartImageLayout({ naturalChartHeight, chromeHeight: 142, aspectRatio })
      assert.ok(layout.chartHeight >= naturalChartHeight)
      assert.ok(layout.width >= 960)
      assert.equal(layout.height - layout.chartHeight, 142)
      assert.ok(Math.abs(layout.height - layout.width / aspectRatio) < 1)
    }
  }
})

test('小数寸法は切り上げ、不正な高さや比率は画像寸法に伝播しない', () => {
  assert.deepEqual(getChartImageLayout({ naturalChartHeight: 280.5, chromeHeight: 53.5 }), {
    width: 960, height: 335, chartHeight: 281,
  })
  for (const invalid of [NaN, Infinity, -Infinity, -1, 0]) {
    const layout = getChartImageLayout({ naturalChartHeight: invalid, chromeHeight: invalid, aspectRatio: invalid })
    assert.equal(layout.width, 960)
    assert.equal(layout.chartHeight, 334)
    assert.equal(layout.height, invalid === 0 ? 334 : 410)
  }
})

test('横並び出力では画像全体の整数比と必要な描画高さを維持する', () => {
  assert.deepEqual(getChartImageLayout({ naturalChartHeight: 400, exactAspect: { width: 16, height: 9 } }),
    { width: 960, height: 540, chartHeight: 464 })
  assert.deepEqual(getChartImageLayout({ naturalChartHeight: 400, exactAspect: { width: 9, height: 16 } }),
    { width: 963, height: 1712, chartHeight: 1636 })
  const wide = getChartImageLayout({ naturalChartHeight: 400, exactAspect: { width: 3, height: 1 }, chromeHeight: 90 })
  assert.deepEqual(wide, { width: 1470, height: 490, chartHeight: 400 })
})
