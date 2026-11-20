import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectOperatorCommentEntry, parseCommentLog, parseCommentLogDetails, summarizeCommentLogs,
} from '../scripts/refreshOperatorWikiComments.mjs'
import { getWikiCommentCount, getWikiCommentRange } from '../src/lib/operatorWikiComments.ts'

const root = 'https://arknights.wikiru.jp/'
const owner = 'テストオペレーター'
const title = 'コメント/' + owner
const wikiUrl = page => root + '?' + encodeURIComponent(page)
const range = { start: '2026-10-21', throughDate: '2026-11-19' }
const marker = timestamp => '<span class="__plugin_new" data-mtime="' + timestamp + '"></span>'
const dayMarker = day => marker(day + 'T12:00:00+09:00')
const reply = day => '<li>返信 <span class="comment_date">' + dayMarker(day) + '</span></li>'
const list = (body, depth = 1) => '<ul class="list' + depth + ' list-indent1">' + body + '</ul>'
const page = (name, body) => '<head><link rel="canonical" href="' + wikiUrl(name) + '"></head>'
  + '<h1>' + name + '</h1><div id="body">' + body + '</div>'
const details = body => parseCommentLogDetails(page(title, list(body)), title)
const periods = summary => [1, 7, 30].map(days => getWikiCommentCount(summary, getWikiCommentRange(range.throughDate, days)))

test('古い日付付き返信がある日時なしの親投稿を累計に含め、直近期間を確定する', () => {
  const source = page(title, list('<li>親投稿の本文' + list(reply('2021-01-02'), 2) + '</li>'))
  const parsed = parseCommentLogDetails(source, title)
  assert.deepEqual(parsed, {
    dates: ['2021-01-02'], undatedPosts: [{ latestPossibleDate: '2021-01-02' }], total: 2,
  })
  const summary = summarizeCommentLogs([parsed], range)
  assert.deepEqual(summary, { coveredFrom: range.start, counts: {}, total: 2 })
  assert.deepEqual(periods(summary), [0, 0, 0])
  assert.throws(() => parseCommentLog(source, title), /投稿日時|日付|日時/)
})

test('投稿者の署名だけが残った投稿は、日時不明の1件として数える', () => {
  const parsed = details('<li>本文 -- [example]</li>')
  assert.deepEqual(parsed, { dates: [], undatedPosts: [{ latestPossibleDate: null }], total: 1 })
  assert.deepEqual(summarizeCommentLogs([parsed], range), { coveredFrom: null, counts: {}, total: 1 })
})

test('返信がある親投稿は本文の装飾があっても1件として確認する', () => {
  const parsed = details('<li><strong>装飾された親投稿</strong>' + list(reply('2021-01-02'), 2) + '</li>')
  assert.deepEqual(parsed, {
    dates: ['2021-01-02'], undatedPosts: [{ latestPossibleDate: '2021-01-02' }], total: 2,
  })
  assert.deepEqual(summarizeCommentLogs([parsed], range), { coveredFrom: range.start, counts: {}, total: 2 })
})

test('30日内の日付しか上限が分からない投稿は、その翌日からの期間だけを確定する', () => {
  const parsed = details('<li>日時なしの親投稿' + list(reply('2026-11-05'), 2) + '</li>' + reply('2026-11-19'))
  const summary = summarizeCommentLogs([parsed], range)
  assert.equal(parsed.total, 3)
  assert.deepEqual(summary, { coveredFrom: '2026-11-06', counts: { '2026-11-19': 1 }, total: 3 })
  assert.deepEqual(periods(summary), [1, 1, null])
})

test('日付の上限が分からない投稿も累計に含め、期間別は未取得にする', () => {
  const parsed = details('<li>日時なしの独立した親投稿</li>' + reply('2026-11-19'))
  assert.deepEqual(parsed, { dates: ['2026-11-19'], undatedPosts: [{ latestPossibleDate: null }], total: 2 })
  const summary = summarizeCommentLogs([parsed], range)
  assert.deepEqual(summary, { coveredFrom: null, counts: {}, total: 2 })
  assert.deepEqual(periods(summary), [null, null, null])
})

test('削除済み表示と日付付き親投稿に含まれる箇条書きを投稿数へ加えない', () => {
  const deleted = '<li><span style="color:#ff0000"><strong>投稿者本人が削除しました</strong></span>'
    + list(reply('2021-01-02'), 2) + '</li>'
  const formatting = '<li>署名付き本文 ' + dayMarker('2026-11-19')
    + list('<li>本文内の箇条書き</li>', 2) + '</li>'
  assert.deepEqual(details(deleted + formatting), { dates: ['2021-01-02', '2026-11-19'], undatedPosts: [], total: 2 })
})

test('複数階層にある日付付き返信の最小日付を、祖先の投稿日時の上限に使う', () => {
  const nested = '<li>日時なしの親投稿'
    + list('<li>日時なしの返信' + list(reply('2021-01-02'), 3) + '</li>' + reply('2022-01-01'), 2) + '</li>'
  const parsed = details(nested)
  assert.equal(parsed.total, 4)
  assert.deepEqual(parsed.undatedPosts, [{ latestPossibleDate: '2021-01-02' }, { latestPossibleDate: '2021-01-02' }])
  assert.deepEqual(summarizeCommentLogs([parsed], range), { coveredFrom: range.start, counts: {}, total: 4 })
})

test('日付付き親投稿の下でも、自分への日付付き返信がある日時なし項目を投稿として数える', () => {
  const source = '<li>署名付きの親投稿 ' + dayMarker('2021-01-01')
    + list('<li>日時なしの返信本文' + list(reply('2021-01-03'), 3) + '</li>', 2) + '</li>'
  const parsed = details(source)
  assert.deepEqual(parsed, {
    dates: ['2021-01-01', '2021-01-03'], undatedPosts: [{ latestPossibleDate: '2021-01-03' }], total: 3,
  })
  assert.deepEqual(summarizeCommentLogs([parsed], range), { coveredFrom: range.start, counts: {}, total: 3 })
})

test('前後の独立した投稿の日付を、日時なしの親投稿の上限として扱わない', () => {
  const parsed = details(reply('2021-01-01') + '<li>日付のない別の投稿</li>' + reply('2021-01-04'))
  assert.deepEqual(parsed.undatedPosts, [{ latestPossibleDate: null }])
  assert.deepEqual(summarizeCommentLogs([parsed], range), { coveredFrom: null, counts: {}, total: 3 })
})

test('集計の最終日以降にある返信だけでは期間内かどうかを確定しない', () => {
  for (const replyDate of [range.throughDate, '2026-11-20', '2026-12-01']) {
    const parsed = details('<li>日付のない親投稿' + list(reply(replyDate), 2) + '</li>')
    assert.deepEqual(parsed.undatedPosts, [{ latestPossibleDate: replyDate }])
    const summary = summarizeCommentLogs([parsed], range)
    assert.deepEqual(summary, { coveredFrom: null, counts: {}, total: 2 })
  }
})

test('日付付き投稿の日本時間と、改行で分かれた同じLI内の投稿数を維持する', () => {
  const first = marker('2026-11-18T15:00:00Z')
  const second = dayMarker('2026-11-19')
  const source = page(title, list('<li>投稿1 ' + first + '<br />投稿2 ' + second + '</li>'))
  assert.deepEqual(parseCommentLogDetails(source, title), { dates: ['2026-11-19', '2026-11-19'], undatedPosts: [], total: 2 })
  assert.deepEqual(parseCommentLog(source, title), ['2026-11-19', '2026-11-19'])
  assert.deepEqual(summarizeCommentLogs([parseCommentLogDetails(source, title)], range), {
    coveredFrom: range.start, counts: { '2026-11-19': 2 }, total: 2,
  })
})

test('区切りなく複数の署名がある項目や、本文外の日付から投稿数を推定しない', () => {
  assert.throws(() => details('<li>投稿 ' + dayMarker('2026-11-18') + dayMarker('2026-11-19') + '</li>'), /判別|署名|投稿日時/)
  assert.throws(() => parseCommentLogDetails(page(title, marker('2026-11-19T12:00:00+09:00')), title), /ログ|投稿/)
  assert.throws(() => parseCommentLogDetails(page('FrontPage', list(reply('2026-11-19'))), title), /見出し/)
})

test('単一の投稿日時マーカーの日付が壊れていても、1投稿として確かなら累計に含める', () => {
  const source = page(title, list('<li>投稿本文 ' + marker('2021-02-30T12:00:00+09:00') + '</li>'))
  const parsed = parseCommentLogDetails(source, title)
  assert.deepEqual(parsed, { dates: [], undatedPosts: [{ latestPossibleDate: null }], total: 1 })
  assert.deepEqual(summarizeCommentLogs([parsed], range), { coveredFrom: null, counts: {}, total: 1 })
  assert.throws(() => parseCommentLog(source, title), /投稿日時|日付|日時/)
})

test('日付が壊れた旧署名は単一投稿だけを数え、署名の重複は推定しない', () => {
  const legacy = '本文 -- [sample] &amp;new{2021-02-30 (火) 12:00:00};'
  const source = page(title, list('<li>' + legacy + '</li>'))
  assert.deepEqual(parseCommentLogDetails(source, title), {
    dates: [], undatedPosts: [{ latestPossibleDate: null }], total: 1,
  })
  assert.throws(() => parseCommentLog(source, title), /投稿日時|日付|日時/)
  assert.throws(() => details('<li>' + legacy + legacy + '</li>'), /投稿日時|判別|署名/)
  assert.throws(() => details('<li>本文 &amp;new{壊れた日時}</li>'), /投稿日時|判別|署名/)
})

test('複数ログで最も遅い日時上限を使い、完全な累計と確定期間を別々に求める', () => {
  const old = details('<li>古い日時なしの親投稿' + list(reply('2021-01-02'), 2) + '</li>')
  const recent = details('<li>新しい日時なしの親投稿' + list(reply('2026-11-05'), 2) + '</li>' + reply('2026-11-19'))
  assert.deepEqual(summarizeCommentLogs([old, recent], range), {
    coveredFrom: '2026-11-06', counts: { '2026-11-19': 1 }, total: 5,
  })
})

test('オペレーターの過去ログにも日時なしの投稿を含めて累計する', async () => {
  const archive = title + '/1'
  const pages = new Map([
    [wikiUrl(title), page(title, list(reply('2026-11-19')))],
    [wikiUrl(archive), page(archive, list('<li>古い日時なしの投稿' + list(reply('2021-01-02'), 2) + '</li>'))],
  ])
  const entry = await collectOperatorCommentEntry({ operatorId: 'sample', wikiUrl: wikiUrl(owner) }, range, async address => {
    assert.ok(pages.has(address), address)
    return pages.get(address)
  }, [archive])
  assert.deepEqual(entry, {
    operatorId: 'sample', wikiUrl: wikiUrl(title), coveredFrom: range.start, counts: { '2026-11-19': 1 }, total: 3,
  })
})

test('過去ログが取得できない場合は累計を未取得にし、現行ログで確定した期間を保持する', async () => {
  const archive = title + '/1'
  const entry = await collectOperatorCommentEntry({ operatorId: 'sample', wikiUrl: wikiUrl(owner) }, range, async address => {
    if (address === wikiUrl(title)) return page(title, list(reply('2021-01-02') + reply('2026-11-19')))
    throw new Error('過去ログ取得失敗')
  }, [archive])
  assert.deepEqual(entry, {
    operatorId: 'sample', wikiUrl: wikiUrl(title), coveredFrom: range.start, counts: { '2026-11-19': 1 }, total: null,
  })
})

test('期間の被覆を確認する前に過去ログが欠けた場合、後続の古いログだけでは期間を確定しない', async () => {
  const archive1 = title + '/1'
  const archive2 = title + '/2'
  const entry = await collectOperatorCommentEntry({ operatorId: 'sample', wikiUrl: wikiUrl(owner) }, range, async address => {
    if (address === wikiUrl(title)) return page(title, list(reply('2026-11-19')))
    if (address === wikiUrl(archive1)) return page(archive1, list(reply('2021-01-02')))
    throw new Error('過去ログ取得失敗')
  }, [archive2, archive1])
  assert.deepEqual(entry, {
    operatorId: 'sample', wikiUrl: wikiUrl(title), coveredFrom: null, counts: {}, total: null,
  })
})
