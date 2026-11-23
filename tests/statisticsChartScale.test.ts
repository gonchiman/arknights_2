import assert from 'node:assert/strict'
import test from 'node:test'
import { createAdaptiveLinearTicks, createScaleTicks, createValueScale } from '../src/lib/statisticsChartScale.ts'

test('shared distribution scales retain signed linear coordinates and evenly spaced ticks', () => {
  const scale = createValueScale(-20, 80, 56, 620, 'LINEAR')
  assert.equal(scale.effectiveScale, 'LINEAR')
  assert.equal(scale.position(-20), 56)
  assert.equal(scale.position(80), 620)
  assert.equal(scale.position(30), 338)
  assert.deepEqual(createScaleTicks(-20, 80, 3, 'LINEAR'), [-20, 30, 80])
  assert.deepEqual(createAdaptiveLinearTicks(-20, 80, 4), [-20, 5, 30, 55, 80])
})

test('log1p behavior and negative fallback remain identical for existing enemy and operator plots', () => {
  const log = createValueScale(0, 99, 10, 110, 'LOG')
  assert.equal(log.effectiveScale, 'LOG')
  assert.ok(Math.abs(log.position(9) - 60) < 1e-10)
  const ticks = createScaleTicks(0, 99, 3, 'LOG')
  assert.ok(Math.abs(ticks[1] - 9) < 1e-10)
  assert.ok(Math.abs(ticks[2] - 99) < 1e-10)
  const signed = createValueScale(-10, 10, 0, 100, 'LOG')
  assert.equal(signed.effectiveScale, 'LINEAR')
  assert.equal(signed.position(0), 50)
  assert.deepEqual(createScaleTicks(-10, 10, 3, 'LOG'), [-10, 0, 10])
})

test('constant observations keep a centered position without division by zero', () => {
  assert.equal(createValueScale(-5, -5, 20, 220, 'LINEAR').position(-5), 120)
  assert.deepEqual(createScaleTicks(-5, -5, 5, 'LINEAR'), [-5])
  assert.equal(createValueScale(0, 0, 220, 20, 'LOG').position(0), 120)
})
