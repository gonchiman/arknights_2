import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getPhysicalArtsAttackSweepChartPoints,
  getPhysicalArtsAttackSweepRowCount,
  getPhysicalArtsAttackSweepRows,
  MAX_ATTACK_SWEEP_ROWS,
} from '../src/lib/physicalArtsAttackSweep.ts'

const input = { defense: 1200, resistance: 60, minAttack: 500, maxAttack: 4000, attackStep: 500 }

test('attack sweep rows apply both damage formulas at the requested attack interval', () => {
  assert.deepEqual(getPhysicalArtsAttackSweepRows(input), [
    { attack: 500, physical: 25, arts: 200 },
    { attack: 1000, physical: 50, arts: 400 },
    { attack: 1500, physical: 300, arts: 600 },
    { attack: 2000, physical: 800, arts: 800 },
    { attack: 2500, physical: 1300, arts: 1000 },
    { attack: 3000, physical: 1800, arts: 1200 },
    { attack: 3500, physical: 2300, arts: 1400 },
    { attack: 4000, physical: 2800, arts: 1600 },
  ])
  assert.deepEqual(getPhysicalArtsAttackSweepRows({ ...input, maxAttack: 1700 }).map(row => row.attack), [500, 1000, 1500])
})

test('attack sweep chart includes the exact floor transition and endpoints independently of the interval', () => {
  const points = getPhysicalArtsAttackSweepChartPoints({ ...input, maxAttack: 1700 })
  const breakpoint = 1200 / 0.95
  assert.deepEqual(points.map(point => point.attack), [500, breakpoint, 1700])
  assert.ok(Math.abs(points[1].physical - breakpoint * 0.05) < 1e-10)
  assert.deepEqual(getPhysicalArtsAttackSweepChartPoints({ ...input, maxAttack: 1700, attackStep: 0 }), points)
  assert.deepEqual(getPhysicalArtsAttackSweepChartPoints({ ...input, minAttack: 1500 }).map(point => point.attack), [1500, 4000])
})

test('maximum resistance ties on the floor until physical damage rises above it', () => {
  const points = getPhysicalArtsAttackSweepChartPoints({ ...input, defense: 950, resistance: 100 })
  assert.deepEqual(points, [
    { attack: 500, physical: 25, arts: 25 },
    { attack: 1000, physical: 50, arts: 50 },
    { attack: 4000, physical: 3050, arts: 200 },
  ])
  assert.deepEqual(getPhysicalArtsAttackSweepChartPoints({ ...input, defense: 950, minAttack: 1000 })
    .map(point => point.attack), [1000, 4000])
})

test('attack sweep validates the bounds and caps table row generation', () => {
  const atLimit = { ...input, minAttack: 1, maxAttack: MAX_ATTACK_SWEEP_ROWS, attackStep: 1 }
  const tooMany = { ...atLimit, maxAttack: atLimit.maxAttack + 1 }
  assert.equal(getPhysicalArtsAttackSweepRowCount(tooMany), MAX_ATTACK_SWEEP_ROWS + 1)
  assert.equal(getPhysicalArtsAttackSweepRows(atLimit).length, MAX_ATTACK_SWEEP_ROWS)
  assert.deepEqual(getPhysicalArtsAttackSweepRows(tooMany), [])
  assert.equal(getPhysicalArtsAttackSweepChartPoints(tooMany).length, 2)
  for (const invalid of [
    { defense: -1 },
    { resistance: 100.5 },
    { minAttack: 0 },
    { minAttack: input.maxAttack },
    { maxAttack: 1_000_001 },
  ]) {
    assert.equal(getPhysicalArtsAttackSweepRowCount({ ...input, ...invalid }), 0)
    assert.deepEqual(getPhysicalArtsAttackSweepChartPoints({ ...input, ...invalid }), [])
  }
  assert.equal(getPhysicalArtsAttackSweepRowCount({ ...input, attackStep: 0.5 }), 0)
})
