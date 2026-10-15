import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSurtrTotalDamageWinnerGeometry } from '../src/components/surtrTotalDamageWinnerLayout.ts'

test('compact winner columns share the longest complete label width, including a many-way tie', () => {
  assert.deepEqual(calculateSurtrTotalDamageWinnerGeometry([16, 36, 73.2], 6, 80),
    { columnWidth: 98, rowHeight: 44, minimumWidth: 670 })
  const manyWayTie = calculateSurtrTotalDamageWinnerGeometry([16, 36, 321.4], 6, 80)
  assert.equal(manyWayTie.columnWidth, 346)
  assert.equal(manyWayTie.minimumWidth, 2158)
  assert.equal(manyWayTie.rowHeight, 44)
  assert.ok(manyWayTie.columnWidth - 24 >= 321.4, 'long ties are widened rather than wrapped or cropped')
})

test('both axis orientations retain their leading width and a shared readable minimum', () => {
  const resistances = calculateSurtrTotalDamageWinnerGeometry([16, 36], 6, 80)
  const times = calculateSurtrTotalDamageWinnerGeometry([16, 36], 11, 130)
  assert.deepEqual(resistances, { columnWidth: 96, rowHeight: 44, minimumWidth: 658 })
  assert.deepEqual(times, { columnWidth: 96, rowHeight: 44, minimumWidth: 1188 })
  assert.equal(calculateSurtrTotalDamageWinnerGeometry([], 0, 80).minimumWidth, 82)
})

test('aspect-ratio expansion allocates exactly the same height to every body row without shrinking content', () => {
  const expanded = calculateSurtrTotalDamageWinnerGeometry([40], 6, 80, 11, 601)
  assert.equal(expanded.rowHeight, 601 / 11)
  assert.ok(Math.abs(expanded.rowHeight * 11 - 601) < 1e-10)
  assert.equal(calculateSurtrTotalDamageWinnerGeometry([40], 6, 80, 11, 100).rowHeight, 44)
  assert.equal(calculateSurtrTotalDamageWinnerGeometry([40], 6, 80, 0, 601).rowHeight, 44)
})

test('invalid measured geometry fails visibly instead of silently generating clipped widths', () => {
  for (const args of [
    [[NaN], 6, 80], [[Infinity], 6, 80], [[-1], 6, 80], [[12], -1, 80], [[12], 1.5, 80],
    [[12], 6, 0], [[12], 6, Infinity], [[12], 6, 80, -1], [[12], 6, 80, 0.5],
    [[12], 6, 80, 11, NaN], [[12], 6, 80, 11, -1],
  ] as const) assert.throws(() => calculateSurtrTotalDamageWinnerGeometry(...args))
})
