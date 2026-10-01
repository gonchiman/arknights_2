import test from 'node:test'
import assert from 'node:assert/strict'
import { getEnemyRatingNumericRanges, getEnemyRatingRanges } from '../src/lib/enemyStatRatings.ts'
import { getHpRankBands } from '../src/lib/hpRankBands.ts'
import { getStatRankBands } from '../src/lib/statRankBands.ts'

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

test('折れ線は表示下限で切り、表示範囲に合わせてランクの幅を計算する', () => {
  const bands = getHpRankBands({ chartKind: 'line', minHp: 4000, maxHp: 15000, barHps: [] })
  assert.deepEqual(bands.map(({ rating, start, end }) => [rating, start, end]), [
    ['C', 0, 1000 / 11000],
    ['B', 1000 / 11000, 4000 / 11000],
    ['B+', 4000 / 11000, 8000 / 11000],
    ['A', 8000 / 11000, 1],
  ])
  assert.equal(bands[0].label, '3,500 以上 5,000 未満')
})

test('表示HPが一点だけの場合は境界の包含規則を守って全幅のランクを表示する', () => {
  for (const [hp, rating] of [[3500, 'C'], [500000, 'S+'], [500001, 'SS']] as const) {
    for (const chartKind of ['line', 'bar'] as const) {
      const bands = getHpRankBands({ chartKind, minHp: hp, maxHp: hp, barHps: [hp] })
      assert.deepEqual(bands.map(({ rating, start, end }) => [rating, start, end]), [[rating, 0, 1]])
    }
  }
})

test('棒は表示下限より小さいHPを除外してからグループ幅を計算する', () => {
  const bands = getHpRankBands({ chartKind: 'bar', minHp: 5000, maxHp: 12000, barHps: [1000, 4000, 5000, 7000, 8000, 12000, 14000] })
  assert.deepEqual(bands.map(({ rating, start, end }) => [rating, start, end]), [
    ['B', 0, 0.5], ['B+', 0.5, 0.75], ['A', 0.75, 1],
  ])
})

test('無効な表示下限はグラフと同じく0に戻す', () => {
  for (const chartKind of ['line', 'bar'] as const) {
    const options = { chartKind, maxHp: 5000, barHps: [1000, 5000] }
    const expected = getHpRankBands(options)
    for (const minHp of [-1, NaN, Infinity, 6000]) {
      assert.deepEqual(getHpRankBands({ ...options, minHp }), expected)
    }
  }
})

test('術耐性の棒は0をE、80以上90以下をS+、90超をSSとして分類する', () => {
  const values = [0, 0.01, 9.99, 10, 19.99, 20, 30, 50, 60, 70, 79.99, 80, 90, 90.01, 100]
  const bands = getStatRankBands({ stat: 'magicResistance', chartKind: 'bar', max: 100, barValues: values })
  assert.deepEqual(bands.map(({ rating, start, end, index }) => [rating, start, end, index]), [
    ['E', 0, 1 / 15, 0], ['D', 1 / 15, 3 / 15, 1], ['C', 3 / 15, 5 / 15, 2],
    ['B', 5 / 15, 6 / 15, 3], ['B+', 6 / 15, 7 / 15, 4], ['A', 7 / 15, 8 / 15, 5],
    ['A+', 8 / 15, 9 / 15, 6], ['S', 9 / 15, 11 / 15, 7], ['S+', 11 / 15, 13 / 15, 8],
    ['SS', 13 / 15, 1, 9],
  ])
  assert.equal(bands[0].label, '0 以下')
  assert.equal(bands[8].label, '80 以上 90 以下')
  assert.equal(bands[9].label, '90 超')
  assert.ok(bands.every((band) => band.pointValue === undefined))
})

test('術耐性の折れ線は数値幅を使い、Eの0は幅のない端点として保持する', () => {
  const bands = getStatRankBands({ stat: 'magicResistance', chartKind: 'line', max: 100, barValues: [] })
  assert.deepEqual(bands[0], { rating: 'E', label: '0 以下', start: 0, end: 0, index: 0, pointValue: 0 })
  assert.deepEqual(bands.slice(1).map(({ rating, start, end, index }) => [rating, start, end, index]), [
    ['D', 0, 0.1, 1], ['C', 0.1, 0.2, 2], ['B', 0.2, 0.3, 3], ['B+', 0.3, 0.5, 4],
    ['A', 0.5, 0.6, 5], ['A+', 0.6, 0.7, 6], ['S', 0.7, 0.8, 7], ['S+', 0.8, 0.9, 8], ['SS', 0.9, 1, 9],
  ])
  assert.equal(bands.slice(1).reduce((sum, band) => sum + band.end - band.start, 0), 1)
})

test('術耐性の折れ線は上下限で切り、範囲外のE端点を残さない', () => {
  const bands = getStatRankBands({ stat: 'magicResistance', chartKind: 'line', min: 15, max: 85, barValues: [0, 100] })
  assert.deepEqual(bands.map(({ rating, start, end, index }) => [rating, start, end, index]), [
    ['C', 0, 5 / 70, 2], ['B', 5 / 70, 15 / 70, 3], ['B+', 15 / 70, 35 / 70, 4],
    ['A', 35 / 70, 45 / 70, 5], ['A+', 45 / 70, 55 / 70, 6], ['S', 55 / 70, 65 / 70, 7], ['S+', 65 / 70, 1, 8],
  ])
  assert.equal(bands[0].label, '10 以上 20 未満')
  assert.equal(bands.at(-1)?.label, '80 以上 90 以下')
  assert.ok(bands.every((band) => band.pointValue === undefined))
})

test('折れ線の術耐性境界にゼロ幅の次ランクを追加しない', () => {
  for (const [max, lastRating] of [[80, 'S'], [90, 'S+'], [100, 'SS']] as const) {
    const bands = getStatRankBands({ stat: 'magicResistance', chartKind: 'line', min: 70, max, barValues: [] })
    assert.equal(bands.at(-1)?.rating, lastRating)
    assert.equal(bands.at(-1)?.end, 1)
    assert.ok(bands.every((band) => band.end > band.start))
  }
})

test('術耐性の追加選択値も等幅の棒グループに含め、同ランクを結合する', () => {
  const source = [100, 0, 10, 20, 30, 50, 60, 70, 80, 90, 85, 45, 85]
  const bands = getStatRankBands({ stat: 'magicResistance', chartKind: 'bar', max: 100, barValues: source })
  assert.deepEqual(bands.map(({ rating, start, end }) => [rating, start, end]), [
    ['E', 0, 1 / 12], ['C', 1 / 12, 2 / 12], ['B', 2 / 12, 3 / 12], ['B+', 3 / 12, 5 / 12],
    ['A', 5 / 12, 6 / 12], ['A+', 6 / 12, 7 / 12], ['S', 7 / 12, 8 / 12], ['S+', 8 / 12, 11 / 12], ['SS', 11 / 12, 1],
  ])
  assert.deepEqual(source, [100, 0, 10, 20, 30, 50, 60, 70, 80, 90, 85, 45, 85])
})

test('術耐性の棒は表示範囲外と無効値を除外してから幅を決める', () => {
  const bands = getStatRankBands({
    stat: 'magicResistance', chartKind: 'bar', min: 20, max: 90,
    barValues: [-1, 0, 10, 20, 25, 30, 80, 90, 91, NaN, Infinity, -Infinity],
  })
  assert.deepEqual(bands.map(({ rating, start, end }) => [rating, start, end]), [
    ['B', 0, 2 / 5], ['B+', 2 / 5, 3 / 5], ['S+', 3 / 5, 1],
  ])
})

test('術耐性の表示範囲が一点なら0と包含境界も全幅のランクを使う', () => {
  for (const [value, rating] of [[0, 'E'], [80, 'S+'], [90, 'S+'], [90.01, 'SS']] as const) {
    for (const chartKind of ['line', 'bar'] as const) {
      const bands = getStatRankBands({ stat: 'magicResistance', chartKind, min: value, max: value, barValues: [value] })
      assert.deepEqual(bands.map(({ rating, start, end }) => [rating, start, end]), [[rating, 0, 1]])
      assert.equal(bands[0].pointValue, undefined)
    }
  }
  assert.deepEqual(getStatRankBands({ stat: 'magicResistance', chartKind: 'bar', max: 0, barValues: [] }), [])
})

test('共通ランク帯は無効な上限を拒否し、無効な下限を0に戻す', () => {
  for (const chartKind of ['line', 'bar'] as const) {
    const options = { stat: 'magicResistance' as const, chartKind, max: 100, barValues: [0, 10, 80, 90, 100] }
    for (const max of [-1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(getStatRankBands({ ...options, max }), [])
    }
    for (const min of [-1, NaN, Infinity, 101]) {
      assert.deepEqual(getStatRankBands({ ...options, min }), getStatRankBands(options))
    }
  }
})
