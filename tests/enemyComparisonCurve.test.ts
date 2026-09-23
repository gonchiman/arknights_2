import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnemyComparisonCurvePath, type EnemyComparisonPoint } from '../src/lib/enemyComparisonCurve.ts'

function segments(points: readonly EnemyComparisonPoint[]) {
  const path = buildEnemyComparisonCurvePath(points)
  assert.ok(!/NaN|Infinity/.test(path))
  return path.split(' C ').slice(1).map((command) => command.split(' ').map(Number))
}

const cubic = (a: number, b: number, c: number, d: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d

test('全階級の点を通り、隣り合う値を超える山谷や負の割合を作らない', () => {
  const samples = [
    [0, 12, 40, 15, 0, 0, 3, 0],
    [50, 38, 8, 1, 1, 0, 0, 0],
    [2, 2, 2, 2],
    [0, 100, 0, 100, 0],
  ]
  for (const values of samples) {
    for (const positions of [values.map((_, i) => i * 20), values.map((_, i) => Math.log1p(i * 7) * 100)]) {
      const points = values.map((y, index) => ({ x: positions[index], y }))
      const curves = segments(points)
      assert.equal(curves.length, points.length - 1)
      curves.forEach(([x1, y1, x2, y2, x3, y3], index) => {
        const start = points[index], end = points[index + 1]
        assert.deepEqual([x3, y3], [end.x, end.y])
        let previousY = start.y
        for (let sample = 0; sample <= 100; sample += 1) {
          const t = sample / 100
          const x = cubic(start.x, x1, x2, x3, t), y = cubic(start.y, y1, y2, y3, t)
          assert.ok(x >= start.x - 1e-9 && x <= end.x + 1e-9)
          assert.ok(y >= Math.min(start.y, end.y) - 1e-9 && y <= Math.max(start.y, end.y) + 1e-9)
          assert.ok(end.y >= start.y ? y >= previousY - 1e-9 : y <= previousY + 1e-9)
          previousY = y
        }
      })
    }
  }
})

test('点の接続部分で接線が連続し、ピークと底では水平になる', () => {
  const points = [0, 30, 50, 12, 0, 20].map((y, i) => ({ x: i * 17, y }))
  const curves = segments(points)
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i], previous = curves[i - 1], next = curves[i]
    const incoming = (point.y - previous[3]) / (point.x - previous[2])
    const outgoing = (next[1] - point.y) / (next[0] - point.x)
    assert.ok(Math.abs(incoming - outgoing) < 1e-10)
    if (i === 2 || i === 4) assert.equal(outgoing, 0)
  }
})

test('端数幅の階級でも点を移動せず、画面の上下反転と拡大に追従する', () => {
  const points = [{ x: 5, y: 0 }, { x: 15, y: 9 }, { x: 25, y: 3 }, { x: 28, y: 8 }]
  const before = segments(points)
  const after = segments(points.map(({ x, y }) => ({ x: x * 7 + 60, y: 310 - y * 3 })))
  before.forEach((segment, index) => segment.forEach((value, axis) => {
    const expected = axis % 2 === 0 ? value * 7 + 60 : 310 - value * 3
    assert.ok(Math.abs(after[index][axis] - expected) < 1e-10)
  }))
})

test('空・1点・2点と同じ横位置の点で不正なSVGを作らない', () => {
  assert.equal(buildEnemyComparisonCurvePath([]), '')
  assert.equal(buildEnemyComparisonCurvePath([{ x: 10, y: 5 }]), 'M 10 5')
  assert.equal(buildEnemyComparisonCurvePath([{ x: 10, y: 5 }, { x: 20, y: 0 }]), 'M 10 5 L 20 0')
  assert.equal(buildEnemyComparisonCurvePath([{ x: 10, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 0 }]), 'M 10 5 L 10 5 L 20 0')
  assert.equal(buildEnemyComparisonCurvePath([{ x: NaN, y: 0 }]), '')
})
