import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateSkillClusteringSilhouette } from '../src/lib/skillClusteringSilhouette.ts'

function matrix(points: number[]): Float64Array {
  return Float64Array.from(points.flatMap((a) => points.map((b) => Math.abs(a - b))))
}

test('シルエットは中心との距離ではなく各点と同群・他群の平均距離から求める', () => {
  const actual = calculateSkillClusteringSilhouette(matrix([0, 2, 8, 10]), [0, 0, 1, 1])
  const expected = ((9 - 2) / 9 + (7 - 2) / 7) / 2
  assert.ok(Math.abs(actual! - expected) < 1e-12)
})

test('単独群を0として平均し、欠番の群ラベルも扱う', () => {
  assert.equal(calculateSkillClusteringSilhouette(matrix([0, 0, 10]), [4, 4, 9]), 2 / 3)
})

test('混ざった群の負のスコアと全距離ゼロを丸めず保持する', () => {
  assert.equal(calculateSkillClusteringSilhouette(matrix([0, 2, 8, 10]), [0, 1, 0, 1]), -0.375)
  assert.equal(calculateSkillClusteringSilhouette(matrix([0, 0, 0, 0]), [0, 0, 1, 1]), 0)
})

test('空、1群、全点が単独群は評価不能を返す', () => {
  assert.equal(calculateSkillClusteringSilhouette(matrix([]), []), null)
  assert.equal(calculateSkillClusteringSilhouette(matrix([1]), [0]), null)
  assert.equal(calculateSkillClusteringSilhouette(matrix([0, 2, 8]), [0, 0, 0]), null)
  assert.equal(calculateSkillClusteringSilhouette(matrix([0, 2, 8]), [0, 1, 2]), null)
})

test('距離行列の大きさと除外文書が混入した所属を拒否する', () => {
  assert.throws(() => calculateSkillClusteringSilhouette(matrix([0, 1]), [0]), RangeError)
  assert.throws(() => calculateSkillClusteringSilhouette(matrix([0, 1]), [-1, 0]), RangeError)
})
