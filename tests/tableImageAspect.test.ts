import test from 'node:test'
import assert from 'node:assert/strict'
import { getTableImageDimensions, parseTableImageAspect } from '../src/lib/tableImageAspect.ts'

test('比率の整数入力を検証し、同じ比率を最小の整数にそろえる', () => {
  assert.deepEqual(parseTableImageAspect(' 16 ', '9'), { width: 16, height: 9 })
  assert.deepEqual(parseTableImageAspect('100', '50'), { width: 2, height: 1 })
  assert.deepEqual(parseTableImageAspect('10', '100'), { width: 1, height: 10 })
  assert.deepEqual(parseTableImageAspect('100', '10'), { width: 10, height: 1 })
  for (const values of [['', '1'], ['0', '1'], ['1.5', '1'], ['1e1', '1'], ['101', '100'], ['1', '11'], ['11', '1'], ['-1', '1'], ['NaN', '1']]) {
    assert.equal(parseTableImageAspect(values[0], values[1]), null)
  }
})

test('自動では表の自然な高さと元の幅を維持する', () => {
  const widths: number[] = []
  assert.deepEqual(getTableImageDimensions({ initialWidth: 960, aspect: null, measureHeight: (width) => {
    widths.push(width)
    return 713.25
  } }), { width: 960, height: 714 })
  assert.deepEqual(widths, [960])
})

test('内容が指定比率の高さに収まらない場合は幅を広げ、文字を欠落させず収める', () => {
  const measureHeight = (width: number) => 200 + 800_000 / width
  const result = getTableImageDimensions({ initialWidth: 960, aspect: { width: 16, height: 9 }, measureHeight })
  assert.ok(result.width > 960)
  assert.equal(result.width * 9, result.height * 16)
  assert.ok(result.height >= measureHeight(result.width))
  assert.ok((result.height - 9) < measureHeight(result.width - 16))
})

test('縦長では横幅を保ち、比率の整数単位で高さを確保する', () => {
  const result = getTableImageDimensions({ initialWidth: 960, aspect: { width: 9, height: 16 }, measureHeight: () => 700 })
  assert.deepEqual(result, { width: 963, height: 1712 })
  assert.equal(result.width * 16, result.height * 9)
})

test('極端な縦長でも画素数制限内で表の全文を維持する', () => {
  const result = getTableImageDimensions({ initialWidth: 960, aspect: { width: 1, height: 10 }, measureHeight: () => 2000 })
  assert.equal(result.width * 10, result.height)
  assert.ok(result.height >= 2000)
  assert.ok(Math.max(result.width, result.height) <= 8000)
  assert.ok(result.width * result.height <= 8_000_000)
})

test('不正な寸法や収まらない内容は画像を切り取らずエラーにする', () => {
  for (const height of [0, -1, NaN, Infinity]) {
    assert.throws(() => getTableImageDimensions({ initialWidth: 960, aspect: { width: 1, height: 1 }, measureHeight: () => height }))
  }
  assert.throws(() => getTableImageDimensions({ initialWidth: NaN, aspect: null, measureHeight: () => 700 }))
  assert.throws(() => getTableImageDimensions({ initialWidth: 960, aspect: { width: 1, height: 11 }, measureHeight: () => 700 }))
  let attempts = 0
  assert.throws(() => getTableImageDimensions({ initialWidth: 960, aspect: { width: 16, height: 9 }, measureHeight: () => {
    attempts += 1
    return 20_000
  } }))
  assert.ok(attempts < 20)
})
