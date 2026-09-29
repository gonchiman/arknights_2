import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEnemyRatingHistogramBins,
  formatEnemyRatingHistogramRangeLines,
  isEnemyRatingStat,
} from '../src/lib/enemyRatingHistogram.ts'
import { getEnemyRatingNumericRanges, type EnemyRatingStat } from '../src/lib/enemyStatRatings.ts'
import { calculateWeightedHistogram, type WeightedHistogramObservation } from '../src/lib/enemyWeightedHistogram.ts'

const RATINGS = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']
const BOUNDARIES: Record<EnemyRatingStat, readonly number[]> = {
  maxHp: [1000, 3500, 5000, 8000, 12000, 25000, 100000, 250000, 500000],
  attack: [200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000],
  defense: [100, 200, 500, 800, 1000, 1200, 2000, 3000, 5000],
  magicResistance: [0, 10, 20, 30, 50, 60, 70, 80, 90],
}

test('ゲーム内評価に対応する4指標だけを判定する', () => {
  for (const stat of Object.keys(BOUNDARIES)) assert.equal(isEnemyRatingStat(stat), true)
  for (const stat of ['', 'hp', 'weight', 'moveSpeed', 'attackSpeed', 'MAXHP', 'toString']) {
    assert.equal(isEnemyRatingStat(stat), false, stat)
  }
})

for (const stat of Object.keys(BOUNDARIES) as EnemyRatingStat[]) {
  test(`${stat}の各境界の直前・境界・直後を重複なく正しい評価へ集計する`, () => {
    BOUNDARIES[stat].forEach((boundary, index) => {
      const upperInclusive = index === 8 || (stat === 'magicResistance' && index === 0)
      const observations = [
        { value: boundary - 0.25, weight: 2 },
        { value: boundary, weight: 3 },
        { value: boundary + 0.25, weight: 5 },
      ]
      const bins = buildEnemyRatingHistogramBins(observations, stat)
      const expected = Array<number>(10).fill(0)
      expected[index] = upperInclusive ? 5 : 2
      expected[index + 1] = upperInclusive ? 5 : 8
      assert.deepEqual(bins.map(({ count }) => count), expected, `${stat}: ${boundary}`)
    })
  })
}

test('術耐性0と負値はE、0よりわずかに大きい値はDに集計する', () => {
  const bins = buildEnemyRatingHistogramBins([
    { value: -1, weight: 2 },
    { value: 0, weight: 3 },
    { value: Number.MIN_VALUE, weight: 5 },
  ], 'magicResistance')
  assert.deepEqual(bins.slice(0, 2).map(({ rating, count }) => [rating, count]), [['E', 5], ['D', 5]])
  assert.equal(bins.slice(2).every(({ count }) => count === 0), true)
})

test('整数・小数・大きな出現数を展開せずに評価ごとへ加算する', () => {
  const observations = [
    { value: 100, weight: 2 },
    { value: 900, weight: 0.25 },
    { value: 1000, weight: 0.75 },
    { value: 1000, weight: 3 },
    { value: 500001, weight: 1_000_000_000_000 },
  ]
  const bins = buildEnemyRatingHistogramBins(observations, 'maxHp')
  assert.deepEqual(bins.map(({ count }) => count), [2.25, 3.75, 0, 0, 0, 0, 0, 0, 0, 1_000_000_000_000])
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), calculateWeightedHistogram(observations).count)
})

test('欠損・非有限値・正でない重みを数値ヒストグラムと同じ条件で除外する', () => {
  const observations: WeightedHistogramObservation[] = [
    { value: 100, weight: 2 },
    { value: 1000, weight: 0.5 },
    ...[null, undefined, NaN, Infinity, -Infinity].map((value) => ({ value, weight: 3 })),
    ...[0, -1, NaN, Infinity, -Infinity].map((weight) => ({ value: 5000, weight })),
  ]
  const bins = buildEnemyRatingHistogramBins(observations, 'maxHp')
  assert.deepEqual(bins.map(({ count }) => count), [2, 0.5, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), calculateWeightedHistogram(observations).count)
})

test('空・欠損のみ・無効な重みのみでもEからSSの全10階級を保持する', () => {
  for (const stat of Object.keys(BOUNDARIES) as EnemyRatingStat[]) {
    for (const observations of [[], [{ value: null, weight: 3 }], [{ value: 1000, weight: 0 }]]) {
      const bins = buildEnemyRatingHistogramBins(observations, stat)
      assert.deepEqual(bins.map(({ rating }) => rating), RATINGS)
      assert.equal(bins.every(({ count }) => count === 0), true)
      assert.deepEqual(bins.map(({ count: _count, ...range }) => range), getEnemyRatingNumericRanges(stat))
    }
  }
})

test('入力を変更せず、呼び出しごとに新しい階級を作成する', () => {
  const observations = Object.freeze([
    Object.freeze({ value: 1000, weight: 2 }),
    Object.freeze({ value: 100, weight: 3 }),
  ])
  const bins = buildEnemyRatingHistogramBins(observations, 'maxHp')
  bins[0].count = 999
  bins[0].upperBound = 999
  bins[0].label = '変更'
  const fresh = buildEnemyRatingHistogramBins(observations, 'maxHp')
  assert.equal(fresh[0].count, 3)
  assert.equal(fresh[0].upperBound, 1000)
  assert.equal(fresh[0].label, '1,000 未満')
  assert.deepEqual(observations, [{ value: 1000, weight: 2 }, { value: 100, weight: 3 }])
})

test('HPの範囲は万表記を使い、以上・未満・以下・超を正しく表示する', () => {
  const bins = buildEnemyRatingHistogramBins([], 'maxHp')
  assert.deepEqual(bins.map(formatEnemyRatingHistogramRangeLines), [
    ['1,000未満'],
    ['1,000以上', '3,500未満'],
    ['3,500以上', '5,000未満'],
    ['5,000以上', '8,000未満'],
    ['8,000以上', '1.2万未満'],
    ['1.2万以上', '2.5万未満'],
    ['2.5万以上', '10万未満'],
    ['10万以上', '25万未満'],
    ['25万以上', '50万以下'],
    ['50万超'],
  ])
})

test('術耐性は0以下と0超を区別し、S+の90以下を明記する', () => {
  const bins = buildEnemyRatingHistogramBins([], 'magicResistance')
  assert.deepEqual(formatEnemyRatingHistogramRangeLines(bins[0]), ['0以下'])
  assert.deepEqual(formatEnemyRatingHistogramRangeLines(bins[1]), ['0超', '10未満'])
  assert.deepEqual(formatEnemyRatingHistogramRangeLines(bins[8]), ['80以上', '90以下'])
  assert.deepEqual(formatEnemyRatingHistogramRangeLines(bins[9]), ['90超'])
})

test('攻撃力と防御力は数値の桁区切りとS+上限の包含を維持する', () => {
  for (const stat of ['attack', 'defense'] as const) {
    const bins = buildEnemyRatingHistogramBins([], stat)
    assert.deepEqual(formatEnemyRatingHistogramRangeLines(bins[8]), ['3,000以上', '5,000以下'])
    assert.deepEqual(formatEnemyRatingHistogramRangeLines(bins[9]), ['5,000超'])
  }
})
