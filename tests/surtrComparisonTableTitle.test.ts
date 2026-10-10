import assert from 'node:assert/strict'
import test from 'node:test'
import { getSurtrComparisonTableTitle, type SurtrComparisonTableTitleData } from '../src/lib/surtrComparisonTableTitle.ts'

const series = (module: 'X' | 'Y' | null, level = 3, potential?: number) => {
  const moduleStageId = module ? `surtr-${module.toLowerCase()}:lv${level}` : 'none'
  return { id: potential === undefined ? moduleStageId : `${moduleStageId}:pot${potential}`, moduleStageId,
    potential, label: `${module ? `MOD ${module} Lv.${level}` : '未装備'}${potential === undefined ? '' : ` 潜在${potential}`}` }
}

test('module comparisons describe visible choices without needing a named preset', () => {
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null), series('X'), series('Y')] }), 'スルト S3 MOD比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null), series('X')] }), 'スルト S3 MOD比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null)] }), 'スルト S3 DPS比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [] }), 'スルト S3 DPS比較')
})

test('stage comparison uses the sole visible module name and combines dimensions for multiple modules', () => {
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null), series('X', 1), series('X', 2), series('X', 3)] }), 'スルト S3 MOD X 段階比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('Y', 1), series('Y', 3)] }), 'スルト S3 MOD Y 段階比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 1), series('X', 3), series('Y', 3)] }), 'スルト S3 MOD・段階比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 1), series('Y', 3)] }), 'スルト S3 MOD比較')
})

test('potential comparison is independent of the module stages and ignores unequipped references', () => {
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 3, 1), series('X', 3, 6)] }), 'スルト S3 潜在比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null, 0, 1), series('X', 3, 6)] }), 'スルト S3 MOD比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 3, 1), series('Y', 3, 6)] }), 'スルト S3 MOD・潜在比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 1, 1), series('X', 3, 6)] }), 'スルト S3 MOD X 段階・潜在比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 1, 1), series('X', 3, 6), series('Y', 3, 1)] }), 'スルト S3 MOD・段階・潜在比較')
})

test('previous-stage baseline counts a hidden installed stage but Lv1 versus unequipped remains a module comparison', () => {
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 3)], comparisonBase: 'previous' }), 'スルト S3 MOD X 段階比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('Y', 2, 1)], comparisonBase: 'previous' }), 'スルト S3 MOD Y 段階比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 1)], comparisonBase: 'previous' }), 'スルト S3 MOD比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 3), series('Y', 3)], comparisonBase: 'previous' }), 'スルト S3 MOD・段階比較')
})

test('fixed-potential baseline adds an actual potential comparison, including unequipped targets, without labeling self-comparison', () => {
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 3, 6)], comparisonBase: 'potential-1' }), 'スルト S3 潜在比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null, 0, 6)], comparisonBase: 'potential-1' }), 'スルト S3 潜在比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series('X', 3, 1)], comparisonBase: 'potential-1' }), 'スルト S3 MOD比較')
  assert.equal(getSurtrComparisonTableTitle({ series: [series(null, 0, 1)], comparisonBase: 'potential-1' }), 'スルト S3 DPS比較')
})

test('series order, duplicates, result values and unrelated hidden references cannot alter the title', () => {
  const displayed = [series('X', 1, 1), series('X', 3, 6), series('Y', 3, 1)]
  const input = { series: displayed, comparisonBase: 'unequipped' as const, referenceSeries: [series('Y', 1, 3)],
    metric: 'percent', layout: 'comparison', points: [{ x: 20, value: 100 }] }
  const original = structuredClone(input)
  const expected = getSurtrComparisonTableTitle(input)
  assert.equal(getSurtrComparisonTableTitle({ ...input, series: [...displayed].reverse().concat(displayed) }), expected)
  assert.deepEqual(input, original)
})

test('legacy IDs carry stage and potential identity when optional metadata is absent', () => {
  const legacy: SurtrComparisonTableTitleData = { series: [series('X', 1, 1), series('X', 3, 6)].map(({ id, label }) => ({ id, label })) }
  assert.equal(getSurtrComparisonTableTitle(legacy), 'スルト S3 MOD X 段階・潜在比較')
})
