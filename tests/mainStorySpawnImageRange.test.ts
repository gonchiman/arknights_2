import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getMainStorySpawnImageRange, isMainStorySpawnImageRangeTooTall, MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT,
} from '../src/lib/mainStorySpawnImageRange.ts'
import { CHART_IMAGE_MAX_SIDE } from '../src/lib/chartImageRasterSize.ts'

test('表の行範囲は1始まりで開始行と終了行を両方含む', () => {
  assert.deepEqual(getMainStorySpawnImageRange('26', '50', 100), { start: 26, end: 50 })
  assert.deepEqual(getMainStorySpawnImageRange(' 50 ', '50', 50), { start: 50, end: 50 })
})

test('範囲外や入力途中の行指定を補正せず無効として扱う', () => {
  for (const [start, end] of [
    ['', '3'], ['2', ''], ['0', '3'], ['4', '3'], ['1', '26'],
    ['1.5', '3'], ['1', '3e0'], ['1', '9007199254740992'],
  ]) assert.equal(getMainStorySpawnImageRange(start, end, 25), null)
  assert.equal(getMainStorySpawnImageRange('1', '1', 0), null)
})

test('選択した行数だけで共通画像の高さを超えるときは描画前に無効とする', () => {
  const maximumRows = Math.floor(CHART_IMAGE_MAX_SIDE / (MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT * 2))
  assert.equal(isMainStorySpawnImageRangeTooTall({ start: 500, end: 499 + maximumRows }), false)
  assert.equal(isMainStorySpawnImageRangeTooTall({ start: 500, end: 500 + maximumRows }), true)
})
