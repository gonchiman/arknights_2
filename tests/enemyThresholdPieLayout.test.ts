import assert from 'node:assert/strict'
import test from 'node:test'
import { getEnemyThresholdPieGeometry, type EnemyThresholdPieLabelLayout, type EnemyThresholdPieLabelBox } from '../src/lib/enemyThresholdPieLayout.ts'

const TAU = Math.PI * 2
const keys = ['BELOW', 'EQUAL', 'ABOVE'] as const
const makeBuckets = (counts: number[], threshold = 60.5) => {
  const total = counts.reduce((sum, count) => sum + count, 0)
  return counts.map((count, index) => ({ key: keys[index], count, proportion: total ? count / total : 0, label: `${threshold}${['未満', 'と同じ', '超'][index]}` }))
}
const overlap = (a: EnemyThresholdPieLabelBox, b: EnemyThresholdPieLabelBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const layouts: Array<Exclude<EnemyThresholdPieLabelLayout, 'BELOW'>> = ['HYBRID', 'OUTSIDE', 'RIGHT']
const dimensions = [[260, 418], [320, 418], [390, 418], [760, 418], [928, 310], [928, 440]]
const distributions = [[11, 1, 88], [11, 2, 87], [11, 3, 86], [12, 1, 87], [88, 1, 11], [87, 2, 11], [86, 3, 11], [87, 1, 12], [68356, 1667, 1090], [1, 1, 1], [30, 40, 30], [50, 0, 50], [0, 100, 0], [0, 0, 100], [100, 0, 0], [0, 0, 0], [1, 98, 1], [1, 1, 98]]

for (const layout of layouts) {
  test(`${layout} keeps all label boxes inside narrow screen and export dimensions without overlaps`, () => {
    for (const [width, height] of dimensions) {
      for (const counts of distributions) {
        const geometry = getEnemyThresholdPieGeometry({ buckets: makeBuckets(counts), width, height, labelLayout: layout, unit: '種類' })
        const context = `${layout} ${width}x${height} ${counts}`
        assert.equal(geometry.labels.length, 3, context)
        assert.deepEqual(geometry.labels.map(({ key }) => key), keys, context)
        for (const label of geometry.labels) {
          const box = label.bounds
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${context}: ${label.key} bounds ${JSON.stringify(box)}`)
          assert.equal(label.leader.length > 0, layout !== 'RIGHT' && label.placement === 'outside' && counts[keys.indexOf(label.key)] > 0, context)
          for (const p of label.leader) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height, context)
        }
        for (let a = 0; a < geometry.labels.length; a++) {
          for (let b = a + 1; b < geometry.labels.length; b++) assert.equal(overlap(geometry.labels[a].bounds, geometry.labels[b].bounds), false, `${context}: ${geometry.labels[a].key} and ${geometry.labels[b].key}`)
        }
      }
    }
  })
}

test('hybrid labels are entirely inside their sectors, including the interior of reflex wedges', () => {
  for (const [width, height] of dimensions) {
    for (const counts of distributions) {
      const buckets = makeBuckets(counts)
      const geometry = getEnemyThresholdPieGeometry({ buckets, width, height, labelLayout: 'HYBRID' })
      for (const label of geometry.labels.filter(({ placement }) => placement === 'inside')) {
        const index = keys.indexOf(label.key)
        const total = counts.reduce((sum, count) => sum + count, 0)
        const start = counts.slice(0, index).reduce((sum, count) => sum + count, 0) / total * TAU - Math.PI / 2
        const span = counts[index] / total * TAU
        for (let column = 0; column <= 10; column++) {
          for (let row = 0; row <= 10; row++) {
            const x = label.bounds.x + label.bounds.width * column / 10 - geometry.cx
            const y = label.bounds.y + label.bounds.height * row / 10 - geometry.cy
            const relative = ((Math.atan2(y, x) - start) % TAU + TAU) % TAU
            assert.ok(Math.hypot(x, y) < geometry.radius, `${counts} ${label.key}: label escapes circle`)
            assert.ok(span >= TAU - 1e-8 || relative <= span, `${counts} ${label.key}: label crosses sector gap`)
          }
        }
      }
    }
  }
})

test('external leaders stay outside the solid circle after their actual sector anchor', () => {
  for (const layout of ['HYBRID', 'OUTSIDE'] as const) {
    for (const [width, height] of dimensions) {
      for (const counts of distributions) {
        const geometry = getEnemyThresholdPieGeometry({ buckets: makeBuckets(counts), width, height, labelLayout: layout })
        for (const label of geometry.labels) {
          for (let segment = 1; segment < label.leader.length; segment++) {
            const a = label.leader[segment - 1], b = label.leader[segment]
            for (let sample = 0; sample <= 10; sample++) {
              const progress = sample / 10
              const x = a.x + (b.x - a.x) * progress, y = a.y + (b.y - a.y) * progress
              assert.ok(Math.hypot(x - geometry.cx, y - geometry.cy) >= geometry.radius - 1e-8, `${layout} ${width} ${counts}: ${label.key} leader crosses circle`)
            }
          }
        }
      }
    }
  }
})

test('a dominant bucket stays inside while tiny and empty buckets remain readable outside', () => {
  const layout = getEnemyThresholdPieGeometry({ buckets: makeBuckets([68356, 1667, 1090]), width: 320, height: 418, labelLayout: 'HYBRID' })
  assert.deepEqual(layout.labels.map(({ placement }) => placement), ['inside', 'outside', 'outside'])
  const empty = getEnemyThresholdPieGeometry({ buckets: makeBuckets([0, 0, 0]), width: 320, height: 418, labelLayout: 'OUTSIDE' })
  assert.ok(empty.labels.every(({ leader }) => leader.length === 0))
})
test('long valid decimal thresholds wrap at normal font size within each mobile callout', () => {
  for (const layout of layouts) {
    for (const width of [240, 260, 298, 320, 390]) {
      for (const counts of distributions) {
        const buckets = makeBuckets(counts, 60.12345678901234)
        const geometry = getEnemyThresholdPieGeometry({ buckets, width, height: 418, labelLayout: layout, unit: '種類' })
        for (const label of geometry.labels) {
          const original = buckets.find(({ key }) => key === label.key)!.label
          assert.equal(label.labelLines.join(''), original)
          assert.equal(label.labelSize, 11)
          assert.ok(label.bounds.x >= 0 && label.bounds.x + label.bounds.width <= width, `${layout} ${width} ${counts}: ${label.key}`)
          assert.ok(label.bounds.y >= 0 && label.bounds.y + label.bounds.height <= 418)
        }
        for (let a = 0; a < geometry.labels.length; a++) {
          for (let b = a + 1; b < geometry.labels.length; b++) assert.equal(overlap(geometry.labels[a].bounds, geometry.labels[b].bounds), false, `${layout} ${width} ${counts}`)
        }
      }
    }
  }
})
function segmentsIntersect(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const turn = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const within = (p: typeof a, q: typeof a, r: typeof a) => r.x >= Math.min(p.x, q.x) - 1e-7 && r.x <= Math.max(p.x, q.x) + 1e-7 && r.y >= Math.min(p.y, q.y) - 1e-7 && r.y <= Math.max(p.y, q.y) + 1e-7
  const abC = turn(a, b, c), abD = turn(a, b, d), cdA = turn(c, d, a), cdB = turn(c, d, b)
  if (((abC > 1e-7 && abD < -1e-7) || (abC < -1e-7 && abD > 1e-7)) && ((cdA > 1e-7 && cdB < -1e-7) || (cdA < -1e-7 && cdB > 1e-7))) return true
  return Math.abs(abC) <= 1e-7 && within(a, b, c)
    || Math.abs(abD) <= 1e-7 && within(a, b, d)
    || Math.abs(cdA) <= 1e-7 && within(c, d, a)
    || Math.abs(cdB) <= 1e-7 && within(c, d, b)
}

test('leaders belonging to different sectors do not cross or share route segments', () => {
  const cases = [...distributions, [98, 1, 1], [1, 98, 1], [1, 1, 98], [60, 20, 20], [50, 40, 10], [25, 50, 25], [20, 10, 70], [70, 10, 20], [24, 1, 75], [24, 2, 74], [74, 2, 24], [75, 1, 24], [25, 1, 74], [74, 1, 25]]
  for (let first = 0; first <= 100; first++) {
    for (let second = 0; second <= 100 - first; second++) cases.push([first, second, 100 - first - second])
  }
  for (const layout of ['HYBRID', 'OUTSIDE'] as const) {
    for (const width of [240, 260, 288, 298, 320, 390, 559, 560, 760, 928]) {
      for (const height of [310, 418, 440]) {
        for (const counts of cases) {
          const geometry = getEnemyThresholdPieGeometry({ buckets: makeBuckets(counts), width, height, labelLayout: layout })
          const labels = geometry.labels.filter(({ leader }) => leader.length > 0)
          for (let a = 0; a < labels.length; a++) {
            for (let b = a + 1; b < labels.length; b++) {
              for (let i = 1; i < labels[a].leader.length; i++) {
                for (let j = 1; j < labels[b].leader.length; j++) {
                  assert.equal(segmentsIntersect(labels[a].leader[i - 1], labels[a].leader[i], labels[b].leader[j - 1], labels[b].leader[j]), false,
                    `${layout} ${width}x${height} ${counts}: ${labels[a].key} segment ${i} crosses ${labels[b].key} segment ${j}`)
                }
              }
            }
          }
        }
      }
    }
  }
})