import assert from 'node:assert/strict'
import test from 'node:test'
import { getChartImageRasterSize } from '../src/lib/chartImageRasterSize.ts'

test('指定した横幅と縦横比から出力寸法を決める', () => {
  const layout = { width: 1011, height: 443 }
  assert.deepEqual(getChartImageRasterSize(layout, { width: 1920, aspectRatio: 16 / 7 }), {
    width: 1920, height: 840,
  })
  assert.deepEqual(getChartImageRasterSize(layout, { width: 1920 }), { width: 1920, height: 841 })
  assert.deepEqual(getChartImageRasterSize(layout), { width: 2022, height: 886 })
})

test('出力サイズは従来の辺と総ピクセル数の上限を守る', () => {
  const layout = { width: 960, height: 8000 }
  assert.deepEqual(getChartImageRasterSize(layout, { width: 1920, aspectRatio: 0.12 }), {
    width: 1920, height: 16000,
  })
  assert.throws(() => getChartImageRasterSize(layout, { width: 1920, aspectRatio: 0.1 }), RangeError)
  assert.throws(() => getChartImageRasterSize(layout, { width: 16000, aspectRatio: 1 }), RangeError)
  const automatic = getChartImageRasterSize({ width: 8000, height: 8000 })
  assert.equal(automatic.width, automatic.height)
  assert.ok(automatic.width * automatic.height <= 32_000_000)
})
