import test from 'node:test'
import assert from 'node:assert/strict'
import { getEnemyRatingNumericRanges, getEnemyRatingRanges } from '../src/lib/enemyStatRatings.ts'
import { getHpRankBands } from '../src/lib/hpRankBands.ts'

test('共有HP区分は数値境界と従来の範囲ラベルを返す', () => {
  const ranges = getEnemyRatingNumericRanges('maxHp')
  assert.deepEqual(ranges.map(({ rating, label }) => ({ rating, label })), getEnemyRatingRanges('maxHp'))
  assert.deepEqual(ranges.map(({ lowerBound, upperBound }) => [lowerBound, upperBound]), [
    [null, 1000], [1000, 3500], [3500, 5000], [5000, 8000], [8000, 12000],
    [12000, 25000], [25000, 100000], [100000, 250000], [250000, 500000], [500000, null],
  ])
  assert.equal(ranges[8].upperInclusive, true)
  assert.equal(ranges[9].lowerInclusive, false)
  assert.equal(ranges[1].lowerInclusive, true)
  assert.equal(ranges[1].upperInclusive, false)
})

test('共有境界の戻り値を変更しても元の区分は変わらない', () => {
  const ranges = getEnemyRatingNumericRanges('maxHp')
  ranges[0].upperBound = 999
  ranges[0].label = '変更'
  const fresh = getEnemyRatingNumericRanges('maxHp')
  assert.equal(fresh[0].upperBound, 1000)
  assert.equal(fresh[0].label, '1,000 未満')
})

test('折れ線は実際のHP境界で分割し、表示上限で切っても範囲ラベルを維持する', () => {
  const bands = getHpRankBands({ chartKind: 'line', maxHp: 30000, barHps: [] })
  assert.deepEqual(bands.map(({ rating, start, end, index }) => [rating, start, end, index]), [
    ['E', 0, 1000 / 30000, 0],
    ['D', 1000 / 30000, 3500 / 30000, 1],
    ['C', 3500 / 30000, 5000 / 30000, 2],
    ['B', 5000 / 30000, 8000 / 30000, 3],
    ['B+', 8000 / 30000, 12000 / 30000, 4],
    ['A', 12000 / 30000, 25000 / 30000, 5],
    ['A+', 25000 / 30000, 1, 6],
  ])
  assert.equal(bands[6].label, '25,000 以上 100,000 未満')
})

test('折れ線は最大HPが境界に一致しても幅ゼロの区分を作らない', () => {
  const bands = getHpRankBands({ chartKind: 'line', maxHp: 25000, barHps: [30000] })
  assert.equal(bands.length, 6)
  assert.equal(bands.at(-1)?.rating, 'A')
  assert.equal(bands.at(-1)?.end, 1)
  assert.deepEqual(getHpRankBands({ chartKind: 'line', maxHp: 500, barHps: [] }), [
    { rating: 'E', label: '1,000 未満', start: 0, end: 1, index: 0 },
  ])
})

test('棒はHP境界ちょうどの値を次のランクに分類する', () => {
  const hps = [999, 1000, 3500, 5000, 8000, 12000, 25000]
  const bands = getHpRankBands({ chartKind: 'bar', maxHp: 30000, barHps: hps })
  assert.deepEqual(bands.map(({ rating }) => rating), ['E', 'D', 'C', 'B', 'B+', 'A', 'A+'])
  assert.deepEqual(bands.map(({ index }) => index), [0, 1, 2, 3, 4, 5, 6])
  assert.deepEqual(bands.map(({ start, end }) => [start, end]), hps.map((_, index) => [index / 7, (index + 1) / 7]))
})

test('500,000以下はS+で、それを超えた値だけSSになる', () => {
  const bands = getHpRankBands({ chartKind: 'bar', maxHp: 600000, barHps: [250000, 500000, 500001] })
  assert.deepEqual(bands.map(({ rating, start, end, index }) => [rating, start, end, index]), [
    ['S+', 0, 2 / 3, 8], ['SS', 2 / 3, 1, 9],
  ])
  assert.equal(bands[0].label, '250,000 以上 500,000 以下')
  assert.equal(bands[1].label, '500,000 超')
  const line = getHpRankBands({ chartKind: 'line', maxHp: 600000, barHps: [] })
  assert.equal(line.at(-1)?.start, 500000 / 600000)
  assert.equal(line.at(-1)?.end, 1)
})

test('棒は不規則なHP間隔でも等間隔のグループとして隣接同ランクをまとめる', () => {
  const source = [30000, 1000, 14000, 14000, 4000, 24000, 12000]
  const bands = getHpRankBands({ chartKind: 'bar', maxHp: 30000, barHps: source })
  assert.deepEqual(bands.map(({ rating, start, end, index }) => [rating, start, end, index]), [
    ['D', 0, 1 / 6, 1], ['C', 1 / 6, 2 / 6, 2], ['A', 2 / 6, 5 / 6, 5], ['A+', 5 / 6, 1, 6],
  ])
  assert.deepEqual(source, [30000, 1000, 14000, 14000, 4000, 24000, 12000])
})

test('棒の無効値・ゼロ・表示範囲外を除外し、有効な単一点なら幅全体を使う', () => {
  const bands = getHpRankBands({ chartKind: 'bar', maxHp: 30000, barHps: [-1, 0, NaN, Infinity, -Infinity, 30001, 1000] })
  assert.deepEqual(bands, [{ rating: 'D', label: '1,000 以上 3,500 未満', start: 0, end: 1, index: 1 }])
  assert.deepEqual(getHpRankBands({ chartKind: 'bar', maxHp: 30000, barHps: [] }), [])
  assert.deepEqual(getHpRankBands({ chartKind: 'bar', maxHp: 30000, barHps: [0, NaN, -1, 30001] }), [])
})

test('無効な表示上限ではどちらの形式も帯を作らない', () => {
  for (const chartKind of ['line', 'bar'] as const) {
    for (const maxHp of [0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(getHpRankBands({ chartKind, maxHp, barHps: [1000] }), [])
    }
  }
})
