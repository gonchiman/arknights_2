import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getEnemyRatingNumericRanges, getEnemyStatRating } from '../src/lib/enemyStatRatings.ts'
import { formatHistogramRatingRangeLines } from '../src/lib/histogramRatingRangeStrip.ts'

test('評価別の防御力範囲を数値階級と同じ下限〜上限・超の表記にする', () => {
  assert.deepEqual(getEnemyRatingNumericRanges('defense').map(formatHistogramRatingRangeLines), [
    ['0〜', '100'], ['100〜', '200'], ['200〜', '500'], ['500〜', '800'], ['800〜', '1,000'],
    ['1,000〜', '1,200'], ['1,200〜', '2,000'], ['2,000〜', '3,000'], ['3,000〜', '5,000'], ['5,000超'],
  ])
})

test('術耐性の0以下を独立したE列に残し、D以降を簡略範囲で表示する', () => {
  const bins = getEnemyRatingNumericRanges('magicResistance')
  const original = structuredClone(bins)
  assert.deepEqual(bins.map(formatHistogramRatingRangeLines), [
    ['0以下'], ['0〜', '10'], ['10〜', '20'], ['20〜', '30'], ['30〜', '50'],
    ['50〜', '60'], ['60〜', '70'], ['70〜', '80'], ['80〜', '90'], ['90超'],
  ])
  assert.deepEqual(bins, original)
  assert.equal(bins[1].label, '0 超 10 未満')
  assert.equal(bins[8].label, '80 以上 90 以下')
  assert.deepEqual([0, 0.1, 10, 90, 90.1].map(value => getEnemyStatRating('magicResistance', value)),
    ['E', 'D', 'C', 'S+', 'SS'])
})

test('HPの万表記は数値階級の共通formatterを引き継ぐ', () => {
  assert.deepEqual(getEnemyRatingNumericRanges('maxHp').map(formatHistogramRatingRangeLines), [
    ['0〜', '1,000'], ['1,000〜', '3,500'], ['3,500〜', '5,000'], ['5,000〜', '8,000'],
    ['8,000〜', '1.2万'], ['1.2万〜', '2.5万'], ['2.5万〜', '10万'],
    ['10万〜', '25万'], ['25万〜', '50万'], ['50万超'],
  ])
  assert.deepEqual(getEnemyRatingNumericRanges('attack')[8], {
    rating: 'S+', label: '3,000 以上 5,000 以下', lowerBound: 3000, lowerInclusive: true,
    upperBound: 5000, upperInclusive: true,
  })
})

test('不正な数値境界を帯の文字列にしない', () => {
  const base = getEnemyRatingNumericRanges('defense')[1]
  for (const overrides of [
    { lowerBound: NaN }, { upperBound: Infinity }, { lowerBound: 300, upperBound: 200 },
    { lowerBound: null, upperBound: null },
  ]) assert.deepEqual(formatHistogramRatingRangeLines({ ...base, ...overrides }), [])
})
