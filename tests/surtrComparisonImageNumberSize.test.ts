import assert from 'node:assert/strict'
import test from 'node:test'
import { getSurtrComparisonImageNumberFontSize, type SurtrComparisonImageNumberCell } from '../src/lib/surtrComparisonImageNumberSize.ts'

const roomy: SurtrComparisonImageNumberCell = { availableWidth: 180, availableHeight: 90, textWidth: 40, textHeight: 18 }

test('omitted mode and 100% retain 14px even when cells could fit much larger numbers', () => {
  for (const mode of [undefined, '100'] as const) assert.equal(getSurtrComparisonImageNumberFontSize(mode, [roomy]), 14)
})

test('auto and 200% stop at 28px while 150% stops at 21px', () => {
  assert.equal(getSurtrComparisonImageNumberFontSize('auto', [roomy]), 28)
  assert.equal(getSurtrComparisonImageNumberFontSize('200', [roomy]), 28)
  assert.equal(getSurtrComparisonImageNumberFontSize('150', [roomy]), 21)
})

test('a long formatted DPS value constrains every numeric cell to one common size', () => {
  const longDps = { ...roomy, availableWidth: 96, textWidth: 72 }
  const size = getSurtrComparisonImageNumberFontSize('auto', [roomy, longDps])
  assert.equal(size, 18.2)
  assert.ok(longDps.textWidth * size / 14 <= longDps.availableWidth - 2)
  assert.equal(getSurtrComparisonImageNumberFontSize('200', [roomy, longDps]), size)
  assert.equal(getSurtrComparisonImageNumberFontSize('150', [roomy, longDps]), size)
})

test('dense rows restrict enlargement using the final cell inner height', () => {
  const dense = { ...roomy, availableHeight: 29, textHeight: 18 }
  assert.equal(getSurtrComparisonImageNumberFontSize('auto', [dense]), 21)
  assert.equal(getSurtrComparisonImageNumberFontSize('auto', [{ ...dense, availableHeight: 20 }]), 14)
})

test('cell order and duplicate cells cannot change the common font size', () => {
  const narrow = { ...roomy, availableWidth: 58 }
  const first = getSurtrComparisonImageNumberFontSize('auto', [roomy, narrow])
  assert.equal(getSurtrComparisonImageNumberFontSize('auto', [narrow, roomy, narrow]), first)
})

test('measurement failure, missing cells and invalid geometry retain the base size', () => {
  assert.equal(getSurtrComparisonImageNumberFontSize('auto', []), 14)
  for (const invalid of [NaN, Infinity, 0, -1]) {
    assert.equal(getSurtrComparisonImageNumberFontSize('auto', [{ ...roomy, availableWidth: invalid }]), 14)
    assert.equal(getSurtrComparisonImageNumberFontSize('auto', [{ ...roomy, textHeight: invalid }]), 14)
  }
})

test('a cell that only fits the original size never causes numbers to shrink below 14px', () => {
  assert.equal(getSurtrComparisonImageNumberFontSize('auto', [{ ...roomy, availableWidth: 42, textWidth: 40 }]), 14)
})
