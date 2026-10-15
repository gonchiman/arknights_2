import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatModuleTableWinnerShortLabel, getModuleTableWinner, MODULE_TABLE_WINNER_GAP_MAX_PERCENT,
  type ModuleTableWinnerCandidate,
} from '../src/lib/moduleTableWinner.ts'

const candidate = (id: string, value: number | null): ModuleTableWinnerCandidate => ({
  id, label: `MOD ${id[0]} Lv.${id[1]}`, moduleType: id[0], moduleLevel: Number(id[1]), value,
})

test('maximum and runner-up use raw values and preserve selection order without mutation', () => {
  const items = [candidate('X1', 1000.001), candidate('X3', 1000.002), candidate('Y3', 1000.001)]
  const before = structuredClone(items)
  const result = getModuleTableWinner(items)!
  assert.deepEqual(result.winners.map(item => item.id), ['X3'])
  assert.equal(result.runnerUpValue, 1000.001)
  assert.ok(Math.abs(result.absoluteDifference! - 0.001) < 1e-10)
  assert.ok(Math.abs(result.increasePercent! - 0.001 / 1000.001 * 100) < 1e-10)
  assert.deepEqual(items, before)
})

test('next selected series, including same module stages, is the runner-up', () => {
  const result = getModuleTableWinner([candidate('Y3', 90), candidate('X1', 95), candidate('X3', 105), candidate('X2', 100)])!
  assert.equal(result.runnerUpValue, 100)
  assert.equal(result.increasePercent, 5)
  const large = getModuleTableWinner([candidate('X3', 200), candidate('Y3', 100)])!
  assert.equal(large.increasePercent, 100)
  assert.equal(MODULE_TABLE_WINNER_GAP_MAX_PERCENT, 30)
})

test('ties use the roundoff tolerance only, retain all labels and have zero gap', () => {
  for (const values of [[0.3, 0.1 + 0.2, 0.2], [0.1 + 0.2, 0.3, 0.2]]) {
    const result = getModuleTableWinner(values.map((value, index) => candidate(`X${index + 1}`, value)))!
    assert.deepEqual(result.winners.map(item => item.id), ['X1', 'X2'])
    assert.equal(result.runnerUpValue, 0.3)
    assert.equal(result.absoluteDifference, 0)
    assert.equal(result.increasePercent, 0)
  }
  assert.equal(getModuleTableWinner([candidate('X3', 1.000001), candidate('Y3', 1)])!.winners.length, 1)
  const zeros = getModuleTableWinner([candidate('X1', 0), candidate('X2', 0), candidate('X3', 0)])!
  assert.equal(zeros.winners.length, 3)
  assert.equal(zeros.increasePercent, 0)
})

test('single candidates can win, but empty, incomplete, duplicated or invalid comparisons cannot', () => {
  assert.deepEqual(getModuleTableWinner([candidate('X1', 10)]), {
    winners: [candidate('X1', 10)], runnerUpValue: null, absoluteDifference: null, increasePercent: null,
  })
  assert.equal(getModuleTableWinner([]), null)
  for (const value of [null, NaN, Infinity, -Infinity, -1]) {
    assert.equal(getModuleTableWinner([candidate('X1', 10), candidate('Y3', value)]), null)
  }
  assert.equal(getModuleTableWinner([candidate('X1', 10), candidate('X1', 20)]), null)
  assert.equal(getModuleTableWinner([{ ...candidate('X1', 10), id: ' ' }]), null)
})

test('zero runner-up and overflowing percentage never pretend to be a finite rate', () => {
  assert.deepEqual(getModuleTableWinner([candidate('X3', 100), candidate('Y3', 0)]), {
    winners: [candidate('X3', 100)], runnerUpValue: 0, absoluteDifference: 100, increasePercent: null,
  })
  assert.equal(getModuleTableWinner([candidate('X3', Number.MAX_VALUE), candidate('Y3', 1)])!.increasePercent, null)
})

test('compact names come from explicit metadata, preserving unknown labels and overrides', () => {
  assert.equal(formatModuleTableWinnerShortLabel(candidate('X3', 0)), 'X3')
  assert.equal(formatModuleTableWinnerShortLabel({ ...candidate('Y1', 0), shortLabel: 'Y1・潜在6' }), 'Y1・潜在6')
  assert.equal(formatModuleTableWinnerShortLabel({ ...candidate('X3', 0), moduleType: null }), '未装備')
  assert.equal(formatModuleTableWinnerShortLabel({ ...candidate('X3', 0), moduleType: undefined }), 'MOD X Lv.3')
  assert.equal(formatModuleTableWinnerShortLabel({ ...candidate('X3', 0), moduleType: 'mystery' }), 'MOD X Lv.3')
  assert.equal(formatModuleTableWinnerShortLabel({ ...candidate('X3', 0), moduleLevel: 9 }), 'MOD X Lv.3')
  for (const [moduleType, symbol] of [['Δ', 'Δ'], ['D', 'Δ'], ['α', 'α'], ['β', 'β'], ['ｘ', 'X']]) {
    assert.equal(formatModuleTableWinnerShortLabel({ ...candidate('X3', 0), moduleType }), `${symbol}3`)
  }
})
