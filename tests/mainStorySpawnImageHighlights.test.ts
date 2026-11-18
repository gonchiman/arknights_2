import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatMainStorySpawnImageHighlightRows, parseMainStorySpawnImageHighlightRows,
  type MainStorySpawnImageHighlights,
} from '../src/lib/mainStorySpawnImageHighlights.ts'
import { MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT } from '../src/lib/mainStorySpawnImageRange.ts'
import { CHART_IMAGE_MAX_SIDE } from '../src/lib/chartImageRasterSize.ts'

test('複数の行と重なる範囲を通し番号で選び、並べ替えと重複除去を行う', () => {
  const range = { start: 11, end: 35 }
  assert.deepEqual(parseMainStorySpawnImageHighlightRows('20–22, 11、 18〜20, 19-21', range), [11, 18, 19, 20, 21, 22])
  assert.deepEqual(parseMainStorySpawnImageHighlightRows('１１，１８～２０、２０', range), [11, 18, 19, 20])
  assert.deepEqual(parseMainStorySpawnImageHighlightRows('11-11,35', range), [11, 35])
  assert.deepEqual(parseMainStorySpawnImageHighlightRows('  ', range), [])
})

test('範囲を変更したときは範囲外の行指定を無効にし、別の行に読み替えない', () => {
  const input = '11,18-20'
  assert.deepEqual(parseMainStorySpawnImageHighlightRows(input, { start: 11, end: 25 }), [11, 18, 19, 20])
  assert.equal(parseMainStorySpawnImageHighlightRows(input, { start: 12, end: 25 }), null)
  assert.equal(parseMainStorySpawnImageHighlightRows(input, { start: 11, end: 19 }), null)
  assert.deepEqual(parseMainStorySpawnImageHighlightRows('18-20', { start: 18, end: 20 }), [18, 19, 20])
})

test('行の入力途中・逆転・小数・指数・安全整数外を無効として扱う', () => {
  const range = { start: 1, end: 25 }
  for (const input of ['0', '26', '20-18', '18-', '-18', '1.5', '2e1', '1,,2', '1、', '1 2', 'Infinity',
    '9007199254740992']) {
    assert.equal(parseMainStorySpawnImageHighlightRows(input, range), null, input)
  }
  for (const invalidRange of [{ start: 0, end: 25 }, { start: 25, end: 1 }, { start: 1, end: Infinity }]) {
    assert.equal(parseMainStorySpawnImageHighlightRows('1', invalidRange), null)
  }
})

test('巨大範囲を展開前に拒否し、重複した最大件数の選択と大きい通し番号を保持する', () => {
  const maximumRows = Math.floor(CHART_IMAGE_MAX_SIDE / (MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT * 2))
  const range = { start: 1, end: Number.MAX_SAFE_INTEGER }
  const selected = parseMainStorySpawnImageHighlightRows(`1-${maximumRows}, 1-${maximumRows}`, range)
  assert.equal(selected?.length, maximumRows)
  assert.equal(selected?.at(-1), maximumRows)
  assert.equal(parseMainStorySpawnImageHighlightRows(`1-${Number.MAX_SAFE_INTEGER}`, range), null)
  assert.equal(parseMainStorySpawnImageHighlightRows(`1-${maximumRows + 1}`, range), null)
  assert.deepEqual(parseMainStorySpawnImageHighlightRows(String(Number.MAX_SAFE_INTEGER), range), [Number.MAX_SAFE_INTEGER])
})

test('行と列の指定を保ち、行の条件表示は重複を除いて連続範囲をまとめる', () => {
  const highlights: MainStorySpawnImageHighlights = {
    rows: [20, 11, 18, 19, 19], columns: ['rowNumber', 'rank', 'resistance'],
  }
  assert.equal(formatMainStorySpawnImageHighlightRows(highlights.rows), '11・18〜20')
  assert.equal(formatMainStorySpawnImageHighlightRows([]), '')
  assert.deepEqual(highlights.rows, [20, 11, 18, 19, 19])
  assert.deepEqual(highlights.columns, ['rowNumber', 'rank', 'resistance'])
})
