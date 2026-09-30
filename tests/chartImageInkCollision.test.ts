import test from 'node:test'
import assert from 'node:assert/strict'
import { chartImageBoxesIntersect, chartImageSegmentIntersectsBox } from '../src/lib/chartImageInkCollision.ts'

const box = { left: 70, right: 100, top: 10, bottom: 30 }

test('情報枠と実データの矩形が重なる場合を検出する', () => {
  assert.equal(chartImageBoxesIntersect(box, { left: 80, right: 90, top: 0, bottom: 70 }), true)
  assert.equal(chartImageBoxesIntersect(box, { left: 80, right: 90, top: 40, bottom: 70 }), false)
})

test('線の外接矩形が情報枠を含んでも、空白領域なら衝突しない', () => {
  // Descending DPS curve: high at the left, low at the right. The upper right stays empty.
  assert.equal(chartImageSegmentIntersectsBox({ x: 0, y: 0 }, { x: 100, y: 100 }, box), false)
  assert.equal(chartImageSegmentIntersectsBox({ x: 0, y: 100 }, { x: 100, y: 0 }, box), true)
})

test('水平・垂直の線と一点の交差を扱う', () => {
  assert.equal(chartImageSegmentIntersectsBox({ x: 80, y: 0 }, { x: 80, y: 100 }, box), true)
  assert.equal(chartImageSegmentIntersectsBox({ x: 0, y: 20 }, { x: 100, y: 20 }, box), true)
  assert.equal(chartImageSegmentIntersectsBox({ x: 0, y: 50 }, { x: 100, y: 50 }, box), false)
  assert.equal(chartImageSegmentIntersectsBox({ x: 80, y: 20 }, { x: 80, y: 20 }, box), true)
  assert.equal(chartImageSegmentIntersectsBox({ x: 60, y: 20 }, { x: 60, y: 20 }, box), false)
})
