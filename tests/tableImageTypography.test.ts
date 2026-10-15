import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY, getComparisonTableNumberFontSize,
  normalizeComparisonTableTypography,
} from '../src/lib/tableImageTypography.ts'

test('table exports share small default title/detail bands and automatic value sizing', () => {
  assert.deepEqual(normalizeComparisonTableTypography(), { titleSize: 12, detailSize: 8, numberSize: 'auto' })
  assert.deepEqual(normalizeComparisonTableTypography({ titleSize: 16, detailSize: 10, numberSize: '150' }),
    { titleSize: 16, detailSize: 10, numberSize: '150' })
  assert.notEqual(normalizeComparisonTableTypography(), DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY)
})

test('unsupported saved typography values fall back per setting without corrupting valid fields', () => {
  assert.deepEqual(normalizeComparisonTableTypography({ titleSize: 999, detailSize: NaN, numberSize: '200' }),
    { titleSize: 12, detailSize: 8, numberSize: '200' })
  assert.deepEqual(normalizeComparisonTableTypography({ titleSize: 10, detailSize: 9, numberSize: 'bad' as 'auto' }),
    { titleSize: 10, detailSize: 9, numberSize: 'auto' })
})

test('one long tie label limits every exported winner value to the same readable size', () => {
  const roomy = { availableWidth: 200, availableHeight: 100, textWidth: 25, textHeight: 20 }
  const tie = { availableWidth: 122, availableHeight: 100, textWidth: 100, textHeight: 20 }
  assert.equal(getComparisonTableNumberFontSize('auto', [roomy, tie]), 16.8)
  assert.equal(getComparisonTableNumberFontSize('auto', [tie, roomy]), 16.8)
  assert.equal(getComparisonTableNumberFontSize('100', [roomy, tie]), 14)
})
