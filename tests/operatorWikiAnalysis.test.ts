import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateOperatorWikiAnalysis, getWikiAnalysisThroughDate, loadOperatorWikiAnalysisHistory,
  type WikiAnalysisHistory,
} from '../src/lib/operatorWikiAnalysis.ts'
import { type OperatorWikiCommentSnapshot } from '../src/lib/operatorWikiComments.ts'
import { buildOperatorWikiDisplayRoster } from '../src/lib/operatorWikiDisplay.ts'
import { parseOperatorWikiViewHistory, type OperatorWikiViewSnapshot } from '../src/lib/operatorWikiViews.ts'

const ids = ['a', 'b', 'c', 'd']
const page = (id: string) => `https://arknights.wikiru.jp/?${encodeURIComponent(id)}`
const roster = buildOperatorWikiDisplayRoster([], ids.map(operatorId => ({
  operatorId, name: operatorId, wikiUrl: page(operatorId), profession: 'SNIPER', rarity: 5,
})))
const views: OperatorWikiViewSnapshot = {
  observedAt: '2026-11-26T01:00:00Z', todayDate: '2026-11-26', yesterdayDate: '2026-11-25',
  entries: ids.map((operatorId, i) => ({ operatorId, wikiUrl: page(operatorId), yesterday: [0, 0, 2, 3][i], today: 100, total: 1_000 })),
}
const comments: OperatorWikiCommentSnapshot = {
  observedAt: '2026-11-26T01:00:00Z', throughDate: '2026-11-25',
  entries: ids.map((operatorId, i) => ({
    operatorId, wikiUrl: page(`コメント/${operatorId}`), coveredFrom: '2026-10-01',
    counts: i ? { '2026-11-25': i } : {}, total: 200,
  })),
}

test('実測0と未取得を区別し、同順位の平均順位で相関を計算する', () => {
  const result = calculateOperatorWikiAnalysis(roster, views, comments, new Map(), 1)
  assert.deepEqual(result.range, { start: '2026-11-25', end: '2026-11-25' })
  assert.equal(result.totalCount, 4)
  assert.deepEqual([result.views.count, result.views.zeroCount, result.views.mean, result.views.median,
    result.views.firstQuartile, result.views.thirdQuartile, result.views.maximum], [4, 2, 1.25, 1, 0, 2.25, 3])
  assert.equal(result.comments.zeroCount, 1)
  assert.deepEqual(result.points.map(p => [p.x, p.y]), [[0, 0], [0, 1], [2, 2], [3, 3]])
  assert.ok(Math.abs(result.spearman! - Math.sqrt(0.9)) < 1e-12)
})

test('日別履歴を合計し、1日の欠損を週全体の0として扱わない', () => {
  const dates = [19, 20, 21, 22, 23, 24, 25].map(day => `2026-11-${day}`)
  const daily = new Map(dates.map(date => [date, {
    date, observedAt: views.observedAt, counts: { a: 2, b: 0, c: date === dates[2] ? null : 3 },
  }])) satisfies WikiAnalysisHistory
  const week = calculateOperatorWikiAnalysis(roster, views, comments, daily, 7)
  assert.deepEqual(week.range, { start: dates[0], end: dates[6] })
  assert.deepEqual(week.points.map(({ id, x }) => [id, x]), [['a', 14], ['b', 0]])
  assert.deepEqual([week.views.count, week.views.missingCount, week.comments.count], [2, 2, 4])
  daily.delete(dates[3])
  const partial = calculateOperatorWikiAnalysis(roster, views, comments, daily, 7)
  assert.equal(partial.views.count, 0)
  assert.equal(partial.views.zeroCount, null)
  assert.equal(partial.comments.count, 4)
  assert.equal(partial.spearman, null)
})

test('終了日は2つの確定日の早い方とし、コメントの30日保持期間と個別収録期間を守る', () => {
  const oldComments = { ...comments, throughDate: '2026-11-24' }
  assert.equal(getWikiAnalysisThroughDate(views, oldComments), '2026-11-24')
  const delayed = calculateOperatorWikiAnalysis(roster, views, oldComments, new Map(), 1)
  assert.equal(delayed.views.count, 0)
  assert.equal(delayed.comments.zeroCount, 4)
  const oldViews = { ...views, yesterdayDate: '2026-10-26', todayDate: '2026-10-27' }
  const expired = calculateOperatorWikiAnalysis(roster, oldViews, comments, new Map(), 1)
  assert.equal(expired.views.count, 4)
  assert.equal(expired.comments.count, 0)
  assert.equal(expired.spearman, null)
  const partialComments = { ...comments, entries: [
    { ...comments.entries[0], coveredFrom: '2026-11-20' }, { ...comments.entries[1], coveredFrom: null },
  ] }
  const partial = calculateOperatorWikiAnalysis(roster, views, partialComments, new Map(), 7)
  assert.equal(partial.comments.count, 0)
  assert.equal(calculateOperatorWikiAnalysis(roster, views, partialComments, new Map(), 1).comments.count, 1)
})

test('当日途中の数値を使わず、アーカイブと前日スナップショットの新しい有効値を使う', () => {
  const date = views.yesterdayDate
  const updated = { ...views, entries: views.entries.map(entry => ({ ...entry, yesterday: entry.operatorId === 'a' ? null : 5 })) }
  const withTime = (observedAt: string) => new Map([[date, { date, observedAt, counts: { a: 9, b: 1, c: null } }]])
  const newerSnapshot = calculateOperatorWikiAnalysis(roster, updated, comments, withTime('2026-11-25T22:00:00Z'), 1)
  assert.deepEqual(newerSnapshot.points.map(p => p.x), [9, 5, 5, 5])
  const newerArchive = calculateOperatorWikiAnalysis(roster, updated, comments, withTime('2026-11-26T10:00:00Z'), 1)
  assert.deepEqual(newerArchive.points.map(p => p.x), [9, 1, 5, 5])
})

test('旧ID・Wikiページで変更されたIDを引き継ぎ、別ページへ割り当てられたIDは除く', () => {
  const ops = [{ ...roster[0], sourceIds: ['a', 'legacy-a'] }, roster[1], roster[2]]
  const shifted = { ...views, entries: [
    { ...views.entries[0], operatorId: 'changed-a' }, { ...views.entries[1], wikiUrl: page('other-page') },
  ] }
  const daily = new Map([[views.yesterdayDate, { date: views.yesterdayDate, observedAt: views.observedAt,
    counts: { 'changed-a': null, 'legacy-a': 11, b: 6, c: 0 } }]])
  const result = calculateOperatorWikiAnalysis(ops, shifted, comments, daily, 1)
  assert.deepEqual(result.points.map(p => [p.id, p.x]), [['a', 11], ['c', 0]])
})

test('絞り込み・単独・全員同値・0人の母数と順位相関', () => {
  const same = calculateOperatorWikiAnalysis(roster.slice(0, 2), views, comments, new Map(), 1)
  assert.equal(same.totalCount, 2)
  assert.equal(same.views.zeroCount, 2)
  assert.equal(same.spearman, null)
  assert.equal(calculateOperatorWikiAnalysis(roster.slice(2, 3), views, comments, new Map(), 1).spearman, null)
  const empty = calculateOperatorWikiAnalysis([], views, comments, new Map(), 7)
  assert.deepEqual([empty.totalCount, empty.views.count, empty.views.mean, empty.comments.zeroCount, empty.spearman], [0, 0, null, null, null])
})

test('日別JSONの欠損は該当日だけを除き、壊れた応答を0に変換しない', async t => {
  const requested: string[] = []
  const data = { date: '2026-01-01', observedAt: '2026-01-02T00:30:00Z', counts: { a: 0, b: null } }
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.deepEqual(options.headers, { Accept: 'application/json' })
    requested.push(url)
    return url.endsWith('/2026-01-01.json') ? Response.json(data) : new Response(null, { status: 404 })
  })
  const days = await loadOperatorWikiAnalysisHistory('2026-01-02')
  assert.equal(requested.length, 7)
  assert.ok(requested.some(url => url.endsWith('/2025-12-27.json')))
  assert.deepEqual([...days], [[data.date, data]])
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 503 }))
  await assert.rejects(loadOperatorWikiAnalysisHistory('2026-01-02'), /履歴を読み込めませんでした/)
  await assert.rejects(loadOperatorWikiAnalysisHistory('2026-02-31'), /日付が不正/)
  assert.throws(() => parseOperatorWikiViewHistory({ ...data, counts: { b: -1 } }, data.date), /履歴が不正/)
  assert.throws(() => parseOperatorWikiViewHistory(data, '2026-01-02'), /履歴が不正/)
})
