import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWikiCommentCount,
  getWikiCommentRange,
  parseOperatorWikiCommentSnapshot,
} from '../src/lib/operatorWikiComments.ts'

const wikiUrl = `https://arknights.wikiru.jp/?${encodeURIComponent('コメント/ゴールデングロー')}`
const entry = {
  operatorId: 'char_377_gdglow',
  wikiUrl,
  coveredFrom: '2026-10-14',
  counts: { '2026-10-14': 3, '2026-11-06': 5, '2026-11-11': 1 },
  total: 1200,
}
const snapshot = {
  observedAt: '2026-11-12T15:05:00Z',
  throughDate: '2026-11-12',
  entries: [entry],
}

test('コメントは前日までの日本時間の1日、7日、30日を両端込みで集計する', () => {
  const parsed = parseOperatorWikiCommentSnapshot(snapshot)
  assert.deepEqual(parsed, snapshot)
  assert.deepEqual(getWikiCommentRange(parsed.throughDate, 30), { start: '2026-10-14', end: '2026-11-12' })
  assert.deepEqual(getWikiCommentRange('2026-01-01', 7), { start: '2025-12-26', end: '2026-01-01' })
  assert.deepEqual([1, 7, 30].map(days => (
    getWikiCommentCount(parsed.entries[0], getWikiCommentRange(parsed.throughDate, days as 1 | 7 | 30))
  )), [0, 6, 9])
})

test('確認できた0件と、確認範囲の不足による未取得を区別する', () => {
  const partial = { ...entry, coveredFrom: '2026-11-12', counts: {} }
  const through = snapshot.throughDate
  assert.equal(getWikiCommentCount(partial, getWikiCommentRange(through, 1)), 0)
  assert.equal(getWikiCommentCount(partial, getWikiCommentRange(through, 7)), null)
  assert.equal(getWikiCommentCount({ ...partial, coveredFrom: null }, getWikiCommentRange(through, 1)), null)
  assert.equal(getWikiCommentCount(undefined, getWikiCommentRange(through, 1)), null)
})

test('累計のない旧データを読み込み、累計の0件と未取得を区別する', () => {
  const { total, ...oldEntry } = entry
  assert.equal(parseOperatorWikiCommentSnapshot({ ...snapshot, entries: [oldEntry] }).entries[0].total, null)
  assert.equal(parseOperatorWikiCommentSnapshot({ ...snapshot, entries: [{ ...entry, total: null }] }).entries[0].total, null)
  assert.equal(parseOperatorWikiCommentSnapshot({ ...snapshot, entries: [{ ...entry, counts: {}, total: 0 }] }).entries[0].total, 0)
  assert.throws(() => parseOperatorWikiCommentSnapshot({ ...snapshot, entries: [{ ...entry, total: 8 }] }))
  assert.throws(() => parseOperatorWikiCommentSnapshot({ ...snapshot, entries: [{ ...entry, total: -1 }] }))
})

test('期限外の件数、現在のコメントログ以外のURL、重複した行を拒否する', () => {
  for (const invalid of [
    { ...snapshot, throughDate: '2026-11-11' },
    { ...snapshot, entries: [entry, { ...entry, operatorId: 'another' }] },
    ...[
      { wikiUrl: wikiUrl.replace('wikiru.jp', 'example.com') },
      { wikiUrl: wikiUrl + '%2F1' },
      { coveredFrom: null },
      { coveredFrom: '2026-02-30' },
      { counts: { '2026-11-13': 1 } },
      { counts: { '2026-10-13': 1 } },
      { counts: { '2026-11-12': 0 } },
    ].map(changes => ({ ...snapshot, entries: [{ ...entry, ...changes }] })),
  ]) {
    assert.throws(() => parseOperatorWikiCommentSnapshot(invalid))
  }
})
